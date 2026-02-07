"use client";

import React, { useState, useCallback, useRef } from "react";
import { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";
import { processBandPosts } from "../lib/updateButton/fuc/processBandPosts";
import {
  readBandKeyStatusCache,
  isBandKeyStatusCacheFresh,
  writeBandKeyStatusCache,
  fetchBandKeyStatusFromDb,
} from "../lib/bandKeyStatusCache";
import {
  isIndexedDBAvailable,
  bulkPut,
  saveSnapshot,
  setMeta,
  getMeta,
  getDb,
} from "../lib/indexedDbClient";

export default function TestUpdateButton({
  onProcessingChange,
  onComplete,
  refreshSWRCacheOnComplete = true,
  onKeyStatusChange,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [keyStatus, setKeyStatus] = useState("main"); // main | backup
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [backupSummary, setBackupSummary] = useState(null);
  const backupTimerRef = useRef(null);
  const backupInFlightRef = useRef(null);
  const { mutate } = useSWRConfig();

  const BACKUP_RANGE_MS = 20 * 24 * 60 * 60 * 1000; // 최근 20일
  const COOLDOWN_MS = 15 * 1000; // 15초
  const POST_COLUMNS =
    "post_id,user_id,band_number,band_post_url,author_name,title,pickup_date,photos_data,post_key,band_key,content,posted_at,comment_count,last_checked_comment_at";
  const PRODUCT_COLUMNS =
    "product_id,user_id,band_number,title,base_price,barcode,post_id,updated_at,pickup_date,post_key,band_key";
  const ORDER_COLUMNS =
    "order_id,user_id,post_number,band_number,customer_name,comment,status,ordered_at,updated_at,post_key,band_key,comment_key,memo";
  const COMMENT_ORDER_COLUMNS = "*";

  const readSessionUserData = () => {
    try {
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) return null;
      return JSON.parse(sessionData);
    } catch (_) {
      return null;
    }
  };

  const resolveExcludedCustomers = (sessionUserData = null) => {
    try {
      const parsed = sessionUserData || readSessionUserData();
      if (!parsed) return [];
      const raw = parsed.excludedCustomers ?? parsed.excluded_customers;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        return raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    } catch (_) {
      return [];
    }
  };

  const detectRawMode = (sessionUserData = null) => {
    try {
      const u = sessionUserData || readSessionUserData();
      if (!u) return false;
      const mode =
        u?.orderProcessingMode ||
        u?.order_processing_mode ||
        u?.user?.orderProcessingMode ||
        u?.user?.order_processing_mode ||
        "legacy";
      return String(mode).toLowerCase() === "raw";
    } catch (_) {
      return false;
    }
  };

  const ensureCommentOrderId = (row) => {
    if (!row) return row;
    const fallback =
      row.comment_order_id ??
      row.commentOrderId ??
      row.order_id ??
      row.id ??
      null;
    if (!fallback) return row;
    const normalized = typeof fallback === "string" ? fallback : String(fallback);
    if (row.comment_order_id === normalized) return row;
    return { ...row, comment_order_id: normalized };
  };

  const getOrderBackupConfig = (sessionUserData = null) => {
    const isRawMode = detectRawMode(sessionUserData);
    return {
      isRawMode,
      table: isRawMode ? "comment_orders" : "orders",
      store: isRawMode ? "comment_orders" : "orders",
      dateColumn: isRawMode ? "comment_created_at" : "ordered_at",
      effectiveDateColumn: "updated_at",
      nameColumn: isRawMode ? "commenter_name" : "customer_name",
    };
  };

  const fetchKeyStatus = useCallback(async () => {
    try {
      const cachedStatus = readBandKeyStatusCache();
      if (cachedStatus) {
        const cachedIndex = cachedStatus?.current_band_key_index ?? 0;
        setKeyStatus(cachedIndex > 0 ? "backup" : "main");
        if (isBandKeyStatusCacheFresh(cachedStatus)) return;
      }

      const userData = readSessionUserData();
      if (!userData) return;
      const userId = userData?.userId;
      if (!userId) return;

      const data = await fetchBandKeyStatusFromDb(supabase, userId);
      const isBackup = (data?.current_band_key_index ?? 0) > 0;
      setKeyStatus(isBackup ? "backup" : "main");

      writeBandKeyStatusCache({
        current_band_key_index: data?.current_band_key_index ?? 0,
        backup_band_keys: data?.backup_band_keys ?? null,
      });
    } catch (err) {
      console.error("키 상태 조회 중 오류:", err);
    }
  }, []);

  const handleFailover = useCallback(async (info) => {
    const nextIndex = typeof info?.toIndex === "number" ? info.toIndex : 1;
    setKeyStatus(nextIndex > 0 ? "backup" : "main");

    try {
      const userData = readSessionUserData();
      if (!userData) return;
      const userId = userData?.userId;
      if (!userId) return;

      const { error } = await supabase
        .from("users")
        .update({ current_band_key_index: nextIndex })
        .eq("user_id", userId);

      if (error) {
        console.error("백업 키 상태 업데이트 실패:", error);
      } else {
        const backupKeys = readBandKeyStatusCache()?.backup_band_keys ?? null;
        writeBandKeyStatusCache({
          current_band_key_index: nextIndex,
          backup_band_keys: backupKeys,
        });
      }
    } catch (err) {
      console.error("백업 키 상태 업데이트 중 오류:", err);
    } finally {
      fetchKeyStatus();
    }
  }, [fetchKeyStatus]);

  React.useEffect(() => {
    fetchKeyStatus();
  }, [fetchKeyStatus]);

  React.useEffect(() => {
    if (onKeyStatusChange) {
      onKeyStatusChange({ keyStatus, backupSummary });
    }
  }, [onKeyStatusChange, keyStatus, backupSummary]);

  React.useEffect(() => () => {
    if (backupTimerRef.current) {
      clearTimeout(backupTimerRef.current);
      backupTimerRef.current = null;
    }
  }, []);

  const formatBackupSummary = (counts) => {
    const parts = [];
    if (counts.posts) parts.push(`게시물 ${counts.posts}`);
    if (counts.products) parts.push(`상품 ${counts.products}`);
    const orderCount = counts.comment_orders ?? counts.orders;
    if (orderCount) parts.push(`댓글 ${orderCount}`);
    if (parts.length === 0) return "백업 완료";
    return `${parts.join(", ")} 백업 완료`;
  };

  const showBackupSummary = (message) => {
    if (backupTimerRef.current) {
      clearTimeout(backupTimerRef.current);
      backupTimerRef.current = null;
    }
    setBackupSummary(message);
    backupTimerRef.current = setTimeout(() => {
      setBackupSummary(null);
      backupTimerRef.current = null;
    }, 3000);
  };

  const backupToIndexedDB = async (userId) => {
    if (!isIndexedDBAvailable() || !userId) return;
    if (backupInFlightRef.current) {
      return backupInFlightRef.current;
    }

    const backupPromise = (async () => {
      try {
        const sessionUserData = readSessionUserData();
        const orderConfig = getOrderBackupConfig(sessionUserData);
        const orderColumns = orderConfig.isRawMode ? COMMENT_ORDER_COLUMNS : ORDER_COLUMNS;

        const excludedCustomers = resolveExcludedCustomers(sessionUserData);
        const excludedNormalized = excludedCustomers
          .map((c) => (c || "").toString().trim().toLowerCase())
          .filter(Boolean);
        const excludedExactSet = new Set(excludedNormalized);
        const lastBackupAt = await getMeta("lastBackupAt");
        const sinceOverride =
          lastBackupAt && !Number.isNaN(Date.parse(lastBackupAt))
            ? new Date(lastBackupAt).toISOString()
            : null;
        const backupSince = sinceOverride || new Date(Date.now() - BACKUP_RANGE_MS).toISOString();
        const isInitialBackup = !sinceOverride;
        const orderStatusColumn = orderConfig.table === "comment_orders" ? "order_status" : "status";

        // 최초 백업일 때만 초기화 (syncQueue, snapshots, meta는 유지)
        if (isInitialBackup) {
          const clearStores = async (stores) => {
            const db = await getDb();
            await new Promise((resolve, reject) => {
              const tx = db.transaction(stores, "readwrite");
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error);
              stores.forEach((name) => {
                tx.objectStore(name).clear();
              });
            });
          };

          const storesToClear = ["posts", "products", orderConfig.store];
          if (orderConfig.store !== "orders") storesToClear.push("orders");
          await clearStores([...new Set(storesToClear)]);
        }

      const fetchSince = async (table, columns, dateColumn, options = {}) => {
        const {
          nameColumn = null,
          effectiveDateColumn = null,
          statusFilter = null,
          limit = 1000,
        } = options;
        const results = [];
        const rangeColumn = effectiveDateColumn || dateColumn;
        const primaryKeyByTable = {
          posts: "post_id",
          products: "product_id",
          orders: "order_id",
          comment_orders: "comment_order_id",
        };
        const pkColumn = primaryKeyByTable[table] || null;
        const exactExcludedNamesSql =
          (table === "orders" || table === "comment_orders") && nameColumn && excludedCustomers.length > 0
            ? (() => {
                const exactNames = excludedCustomers
                  .map((n) => (n || "").toString().trim())
                    .filter(Boolean);
                  if (exactNames.length === 0) return null;
                  const sanitized = exactNames.map((n) => n.replace(/'/g, "''")).map((n) => `'${n}'`);
                return `(${sanitized.join(",")})`;
              })()
            : null;

        const applyCommonFilters = (query) => {
          let next = query
            .eq("user_id", userId)
            .gte(rangeColumn, backupSince);

          if (statusFilter?.column && statusFilter?.value) {
            next = next.eq(statusFilter.column, statusFilter.value);
          }

          if (exactExcludedNamesSql) {
            next = next.not(nameColumn, "in", exactExcludedNamesSql);
          }

          return next;
        };

        const quoteFilterValue = (value) => {
          const str = String(value ?? "");
          return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
        };

        // fallback: 기존 offset pagination (안전망)
        const fetchWithOffsetFallback = async () => {
          const fallbackResults = [];
          let offset = 0;

          while (true) {
            let query = applyCommonFilters(
              supabase
                .from(table)
                .select(columns)
            )
              .order(rangeColumn, { ascending: false })
              .range(offset, offset + limit - 1);

            const { data, error } = await query;
            if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
            if (Array.isArray(data) && data.length > 0) {
              fallbackResults.push(...data);
            }
            if (!data || data.length < limit) {
              break;
            }
            offset += limit;
          }

          return fallbackResults;
        };

        if (!pkColumn) {
          return fetchWithOffsetFallback();
        }

        // keyset pagination: 대량 데이터에서 offset 성능 저하 방지
        try {
          let cursor = null;

          while (true) {
            let query = applyCommonFilters(
              supabase
                .from(table)
                .select(columns)
            )
              .order(rangeColumn, { ascending: false })
              .order(pkColumn, { ascending: false })
              .limit(limit);

            if (cursor?.rangeValue && cursor?.pkValue) {
              query = query.or(
                `${rangeColumn}.lt.${quoteFilterValue(cursor.rangeValue)},and(${rangeColumn}.eq.${quoteFilterValue(cursor.rangeValue)},${pkColumn}.lt.${quoteFilterValue(cursor.pkValue)})`
              );
            }

            const { data, error } = await query;
            if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
            if (!Array.isArray(data) || data.length === 0) break;

            results.push(...data);

            if (data.length < limit) break;

            const last = data[data.length - 1];
            const nextRangeValue = last?.[rangeColumn];
            const nextPkValue = last?.[pkColumn];
            if (!nextRangeValue || !nextPkValue) break;

            cursor = {
              rangeValue: nextRangeValue,
              pkValue: nextPkValue,
            };
          }

          return results;
        } catch (keysetError) {
          console.warn(`[backupToIndexedDB] keyset pagination 실패, offset fallback 사용: ${keysetError.message}`);
          return fetchWithOffsetFallback();
        }
      };

        const [posts, products, orders] = await Promise.all([
          fetchSince("posts", POST_COLUMNS, "posted_at"),
          fetchSince("products", PRODUCT_COLUMNS, "updated_at"),
          fetchSince(orderConfig.table, orderColumns, orderConfig.dateColumn, {
            effectiveDateColumn: orderConfig.effectiveDateColumn,
            nameColumn: orderConfig.nameColumn,
            statusFilter: { column: orderStatusColumn, value: "주문완료" },
          }),
        ]);

        const filteredOrders = orders.filter((o) => {
          const name = (o[orderConfig.nameColumn] || "").toString().trim().toLowerCase();
          if (!name) return true;
          if (excludedExactSet.has(name)) return false;
          return !excludedNormalized.some((ex) => name.includes(ex));
        });

        await bulkPut("posts", posts);
        await bulkPut("products", products);
        const normalizedOrders = orderConfig.isRawMode
          ? filteredOrders.map(ensureCommentOrderId)
          : filteredOrders;
        await bulkPut(orderConfig.store, normalizedOrders);

        const snapshot = await saveSnapshot({
          counts: {
            posts: posts.length,
            products: products.length,
            [orderConfig.store]: filteredOrders.length,
            ...(orderConfig.store !== "orders" ? { orders: filteredOrders.length } : {}),
          },
          notes: `test-update user:${userId}`,
        });
        await setMeta("lastBackupAt", snapshot.createdAt);
        const counts = snapshot.counts || {};
        showBackupSummary(formatBackupSummary(counts));
      } catch (e) {
        showBackupSummary(e.message || "백업 실패");
      }
    })();

    backupInFlightRef.current = backupPromise;
    try {
      return await backupPromise;
    } finally {
      if (backupInFlightRef.current === backupPromise) {
        backupInFlightRef.current = null;
      }
    }
  };

  // IndexedDB 비어있는지 확인
  const isIndexedDBEmpty = async () => {
    if (!isIndexedDBAvailable()) return true;
    try {
      const { store } = getOrderBackupConfig();
      const db = await getDb();
      const count = await new Promise((resolve, reject) => {
        const tx = db.transaction([store], "readonly");
        const request = tx.objectStore(store).count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || 0);
      });
      return count === 0;
    } catch {
      return true;
    }
  };

  // SWR 캐시 갱신 함수
  const refreshSWRCache = useCallback(async (userId) => {
    if (!userId) return;

    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

    // Orders 캐시 갱신 (문자열 + 배열 키)
    mutate(
      (key) => {
        if (typeof key === "string" && key.startsWith(`${functionsBaseUrl}/orders-get-all?userId=${userId}`)) return true;
        if (Array.isArray(key) && key[0] === "orders" && key[1] === userId) return true;
        return false;
      },
      undefined,
      { revalidate: true }
    );

    // Products 캐시 갱신 (문자열 + 배열 키)
    mutate(
      (key) => {
        if (typeof key === "string" && key.startsWith(`${functionsBaseUrl}/products-get-all?userId=${userId}`)) return true;
        if (Array.isArray(key) && key[0] === "products" && key[1] === userId) return true;
        return false;
      },
      undefined,
      { revalidate: true }
    );

    // Posts 캐시 갱신 (배열 키)
    mutate(
      (key) => Array.isArray(key) && key[0] === "posts" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    // Order Stats 캐시 갱신
    mutate(
      (key) => typeof key === "string" && key.startsWith(`/orders/stats?userId=${userId}`),
      undefined,
      { revalidate: true }
    );

    // Comment Orders 캐시 갱신 (배열 키)
    mutate(
      (key) => Array.isArray(key) && key[0] === "comment_orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    console.log(`[TestUpdateButton] SWR 캐시 갱신 완료 (userId: ${userId})`);
  }, [mutate]);

  const handleTestUpdate = async () => {
    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      alert("너무 빠른 요청입니다. 잠시후에 시도해주세요");
      return;
    }

    try {
      setCooldownUntil(now + COOLDOWN_MS);
      setIsProcessing(true);
      setKeyStatus("main");
      fetchKeyStatus();
      if (onProcessingChange) onProcessingChange(true, null);
      setResult(null);
      setError(null);
      setBackupSummary(null);

      // 사용자 정보 가져오기
      const userData = readSessionUserData();
      if (!userData) {
        throw new Error("사용자 정보를 찾을 수 없습니다. 로그인이 필요합니다.");
      }

      const userId = userData.userId;

      if (!userId) {
        throw new Error("유효한 사용자 ID를 찾을 수 없습니다.");
      }

      console.log(`TestUpdateButton: processBandPosts 호출 시작 (userId: ${userId})`);

      // IndexedDB가 비어있으면 초기 백업 실행
      if (await isIndexedDBEmpty()) {
        console.log("[TestUpdateButton] IndexedDB 비어있음 - 초기 백업 실행");
        await backupToIndexedDB(userId);
      }

      // processBandPosts 함수 호출
      const response = await processBandPosts(supabase, userId, {
        testMode: false, // 실제 DB에 저장
        processingLimit: 10, // 최대 10개 게시물만 처리
        processWithAI: true,
        simulateQuotaError: false,
        onFailover: handleFailover
      });

      console.log("TestUpdateButton: processBandPosts 결과:", response);

      if (response.success) {
        setResult(response);

        // SWR 캐시 갱신 (필요한 페이지에서만)
        if (refreshSWRCacheOnComplete) {
          await refreshSWRCache(userId);
        }
        await fetchKeyStatus();
        // IndexedDB에 최근 7일치 최소 필드 백업
        backupToIndexedDB(userId);
        // 다른 페이지에서도 즉시 반영하도록 이벤트 브로드캐스트
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("indexeddb-sync"));
        }

        // 부모에게 완료 결과 전달
        if (onProcessingChange) onProcessingChange(false, response);
        if (onComplete) onComplete(response);
      } else {
        setError(response.message || "처리 중 오류가 발생했습니다.");
        if (onProcessingChange) onProcessingChange(false, null);
      }
    } catch (err) {
      console.error("TestUpdateButton 오류:", err);
      setError(err.message || "알 수 없는 오류가 발생했습니다.");
      if (onProcessingChange) onProcessingChange(false, null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handleTestUpdate}
          disabled={isProcessing}
          className={`
            px-4 py-2 rounded-lg font-medium text-white transition-colors
            ${
              isProcessing
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }
          `}
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>처리 중...</span>
            </div>
          ) : (
            "업데이트"
          )}
        </button>
      </div>
    </div>
  );
}
