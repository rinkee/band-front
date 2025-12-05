"use client";

import React, { useState, useCallback, useRef } from "react";
import { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";
import { processBandPosts } from "../lib/updateButton/fuc/processBandPosts";
import {
  isIndexedDBAvailable,
  bulkPut,
  saveSnapshot,
  setMeta,
  getAllFromStore,
  getDb,
} from "../lib/indexedDbClient";

export default function TestUpdateButton({ onProcessingChange, onComplete }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [keyStatus, setKeyStatus] = useState("main"); // main | backup
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [backupSummary, setBackupSummary] = useState(null);
  const backupTimerRef = useRef(null);
  const { mutate } = useSWRConfig();

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const BACKUP_RANGE_MS = 20 * 24 * 60 * 60 * 1000; // 최근 20일
  const POST_COLUMNS =
    "post_id,user_id,band_number,band_post_url,author_name,title,pickup_date,photos_data,post_key,band_key,content,posted_at";
  const PRODUCT_COLUMNS =
    "product_id,user_id,band_number,title,base_price,barcode,post_id,updated_at,pickup_date,post_key,band_key";
  const ORDER_COLUMNS =
    "order_id,user_id,post_number,band_number,customer_name,comment,status,ordered_at,updated_at,post_key,band_key,comment_key,memo";
  const COMMENT_ORDER_COLUMNS = "*";

  const escapeIlike = (value) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");

  const resolveExcludedCustomers = () => {
    try {
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) return [];
      const parsed = JSON.parse(sessionData);
      const raw = parsed?.excludedCustomers ?? parsed?.excluded_customers;
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

  const detectRawMode = () => {
    try {
      const s = sessionStorage.getItem("userData");
      if (!s) return false;
      const u = JSON.parse(s);
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

  const getOrderBackupConfig = () => {
    const isRawMode = detectRawMode();
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
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) return;

      const userData = JSON.parse(sessionData);
      const userId = userData?.userId;
      if (!userId) return;

      const { data, error } = await supabase
        .from("users")
        .select("current_band_key_index")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("키 상태 조회 실패:", error);
        return;
      }

      const isBackup = (data?.current_band_key_index ?? 0) > 0;
      setKeyStatus(isBackup ? "backup" : "main");
    } catch (err) {
      console.error("키 상태 조회 중 오류:", err);
    }
  }, []);

  const handleFailover = useCallback(async (info) => {
    const nextIndex = typeof info?.toIndex === "number" ? info.toIndex : 1;
    setKeyStatus(nextIndex > 0 ? "backup" : "main");

    try {
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) return;

      const userData = JSON.parse(sessionData);
      const userId = userData?.userId;
      if (!userId) return;

      const { error } = await supabase
        .from("users")
        .update({ current_band_key_index: nextIndex })
        .eq("user_id", userId);

      if (error) {
        console.error("백업 키 상태 업데이트 실패:", error);
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

  const fetchLastWeek = async (table, columns, userId, dateColumn) => {
    const since = new Date(Date.now() - ONE_WEEK_MS).toISOString();
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .gte(dateColumn, since)
      .order(dateColumn, { ascending: false });

    if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
    return data || [];
  };

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
    if (!isIndexedDBAvailable()) return;
    try {
      const orderConfig = getOrderBackupConfig();
      const orderColumns = orderConfig.isRawMode ? COMMENT_ORDER_COLUMNS : ORDER_COLUMNS;

      // posts/products + 현재 모드 주문 스토어만 초기화 (syncQueue, snapshots, meta는 유지)
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

      const excludedCustomers = resolveExcludedCustomers();
      const excludedNormalized = excludedCustomers.map((c) => (c || "").toString().trim().toLowerCase());
      const backupSince = new Date(Date.now() - BACKUP_RANGE_MS).toISOString();

      const fetchSince = async (table, columns, dateColumn, options = {}) => {
        const { nameColumn = null, effectiveDateColumn = null } = options;
        let query = supabase
          .from(table)
          .select(columns)
          .eq("user_id", userId);

        const rangeColumn = effectiveDateColumn || dateColumn;
        if (rangeColumn) {
          query = query
            .gte(rangeColumn, backupSince)
            .order(rangeColumn, { ascending: false });
        }

        // 제외 고객 서버 필터
        if ((table === "orders" || table === "comment_orders") && nameColumn && excludedCustomers.length > 0) {
          const exactNames = excludedCustomers
            .map((n) => (n || "").toString().trim())
            .filter(Boolean);
          if (exactNames.length > 0) {
            const sanitized = exactNames.map((n) => n.replace(/'/g, "''")).map((n) => `'${n}'`);
            query = query.not(nameColumn, "in", `(${sanitized.join(",")})`);
            exactNames.forEach((name) => {
              const escaped = escapeIlike(name);
              query = query.not(nameColumn, "ilike", `%${escaped}%`);
            });
          }
        }

        const { data, error } = await query;
        if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
        return data || [];
      };

      const [posts, products, orders] = await Promise.all([
        fetchSince("posts", POST_COLUMNS, "posted_at"),
        fetchSince("products", PRODUCT_COLUMNS, "updated_at"),
        fetchSince(orderConfig.table, orderColumns, orderConfig.dateColumn, {
          effectiveDateColumn: orderConfig.effectiveDateColumn,
          nameColumn: orderConfig.nameColumn,
        }),
      ]);

      const filteredOrders = orders.filter((o) => {
        const name = (o[orderConfig.nameColumn] || "").toString().trim().toLowerCase();
        return (
          !excludedNormalized.includes(name) &&
          !excludedNormalized.some((ex) => ex && name.includes(ex))
        );
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
  };

  // IndexedDB 비어있는지 확인
  const isIndexedDBEmpty = async () => {
    if (!isIndexedDBAvailable()) return true;
    try {
      const { store } = getOrderBackupConfig();
      const orders = await getAllFromStore(store);
      return !orders || orders.length === 0;
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
    try {
      setIsProcessing(true);
      setKeyStatus("main");
      fetchKeyStatus();
      if (onProcessingChange) onProcessingChange(true, null);
      setResult(null);
      setError(null);
      setBackupSummary(null);

      // 사용자 정보 가져오기
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) {
        throw new Error("사용자 정보를 찾을 수 없습니다. 로그인이 필요합니다.");
      }

      const userData = JSON.parse(sessionData);
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

        // SWR 캐시 갱신
        await refreshSWRCache(userId);
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

  const showKeyStatus = true;
  const keyStatusLabel = backupSummary
    ? backupSummary
    : keyStatus === "backup"
    ? "백업키 사용중"
    : "기본키 사용중";
  const keyStatusClass = backupSummary
    ? "text-gray-800"
    : keyStatus === "backup"
    ? "text-amber-500"
    : "text-emerald-600";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {showKeyStatus && (
          <span className={`text-xs font-semibold ${keyStatusClass}`}>
            {keyStatusLabel}
          </span>
        )}
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
