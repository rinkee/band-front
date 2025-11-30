"use client";

import { useState, useEffect, useRef } from "react";
import supabase from "../lib/supabaseClient";
import {
  isIndexedDBAvailable,
  bulkPut,
  saveSnapshot,
  setMeta,
  clearAllStores,
} from "../lib/indexedDbClient";

const POST_COLUMNS =
  "post_id,user_id,band_number,band_post_url,author_name,title,pickup_date,photos_data,post_key,band_key,content,posted_at";
const PRODUCT_COLUMNS =
  "product_id,user_id,band_number,title,base_price,barcode,post_id,updated_at,pickup_date,post_key,band_key";
const ORDER_COLUMNS =
  "order_id,user_id,post_number,band_number,customer_name,comment,status,ordered_at,updated_at,post_key,band_key,comment_key,memo";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const escapeIlike = (value) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

async function fetchLastTwoWeeks(table, columns, userId, dateColumn, excludeNames = []) {
  const since = new Date(Date.now() - TWO_WEEKS_MS).toISOString();
  let query = supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .gte(dateColumn, since)
    .order(dateColumn, { ascending: false });

  // 주문의 경우 제외 고객을 서버 측에서 먼저 필터링
  if (table === "orders" && Array.isArray(excludeNames) && excludeNames.length > 0) {
    // PostgREST in() 필터 문자열 생성 (quote + escape)
    const exactNames = excludeNames
      .map((n) => (n || "").toString().trim())
      .filter(Boolean);
    if (exactNames.length > 0) {
      const sanitized = exactNames.map((n) => n.replace(/'/g, "''")).map((n) => `'${n}'`);
      query = query.not("customer_name", "in", `(${sanitized.join(",")})`);
      // 추가 부분 일치도 제외 (특수문자 포함)
      exactNames.forEach((name) => {
        const escaped = escapeIlike(name);
        query = query.not("customer_name", "ilike", `%${escaped}%`);
      });
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`${table} 불러오기 실패: ${error.message}`);
  }
  return data || [];
}

function resolveUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  try {
    const sessionData = sessionStorage.getItem("userData");
    if (!sessionData) return null;
    const parsed = JSON.parse(sessionData);
    return parsed?.userId || null;
  } catch (err) {
    return null;
  }
}

function resolveExcludedCustomers() {
  try {
    const sessionData = sessionStorage.getItem("userData");
    if (!sessionData) return [];
    const parsed = JSON.parse(sessionData);
    // allow both camelCase and snake_case
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
}

export default function IndexedDBBackupButton({ userId: propUserId, variant = "button" }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [detail, setDetail] = useState("");
  const [externalStatus, setExternalStatus] = useState("idle"); // idle | syncing | success
  const externalTimers = useRef({ done: null, reset: null });

  const handleBackup = async () => {
    if (!isIndexedDBAvailable()) {
      return;
    }

    const userId = resolveUserId(propUserId);
    if (!userId) {
      return;
    }

    setStatus("loading");
    setDetail("최근 14일치 데이터를 불러오는 중...");

    try {
      const excludedCustomers = resolveExcludedCustomers().map((c) =>
        (c || "").toString().trim().toLowerCase()
      );
      const [posts, products, orders] = await Promise.all([
        fetchLastTwoWeeks("posts", POST_COLUMNS, userId, "posted_at"),
        fetchLastTwoWeeks("products", PRODUCT_COLUMNS, userId, "updated_at"),
        fetchLastTwoWeeks("orders", ORDER_COLUMNS, userId, "ordered_at", excludedCustomers),
      ]);

      // 안전을 위해 클라이언트에서도 최종 필터링
      const filteredOrders = orders.filter((o) => {
        const name = (o.customer_name || "").toString().trim().toLowerCase();
        return (
          !excludedCustomers.includes(name) &&
          !excludedCustomers.some((ex) => ex && name.includes(ex))
        );
      });

      setDetail("IndexedDB 초기화 중...");
      await clearAllStores();

      setDetail("IndexedDB에 저장 중...");
      await bulkPut("posts", posts);
      await bulkPut("products", products);
      await bulkPut("orders", filteredOrders);

      const snapshot = await saveSnapshot({
        counts: {
          posts: posts.length,
          products: products.length,
          orders: filteredOrders.length,
        },
        notes: `user:${userId}`,
      });
      await setMeta("lastBackupAt", snapshot.createdAt);

      setStatus("success");
      setDetail(
        `백업 완료 (posts ${posts.length}, products ${products.length}, orders ${orders.length})`
      );
    } catch (err) {
      setStatus("error");
      setDetail(err.message || "백업 중 오류가 발생했습니다.");
    }
  };

  // listen to cross-page indexeddb-sync events (상품/주문 업데이트 등)
  useEffect(() => {
    const handleExternalSync = () => {
      if (status === "loading") return; // manual backup already in progress

      // clear previous timers
      clearTimeout(externalTimers.current.done);
      clearTimeout(externalTimers.current.reset);

      setExternalStatus("syncing");
      externalTimers.current.done = setTimeout(() => {
        setExternalStatus("success");
        externalTimers.current.reset = setTimeout(() => {
          setExternalStatus("idle");
        }, 1500);
      }, 600);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("indexeddb-sync", handleExternalSync);
    }
    return () => {
      clearTimeout(externalTimers.current.done);
      clearTimeout(externalTimers.current.reset);
      if (typeof window !== "undefined") {
        window.removeEventListener("indexeddb-sync", handleExternalSync);
      }
    };
  }, [status]);

  const effectiveStatus =
    status === "loading"
      ? "loading"
      : status === "success"
      ? "success"
      : externalStatus === "syncing"
      ? "loading"
      : externalStatus === "success"
      ? "success"
      : "idle";

  if (variant === "text") {
    const isLoading = effectiveStatus === "loading";
    const isSuccess = effectiveStatus === "success";
    const labelBase = "DB백업";
    const renderStatusIcon = () => {
      if (isLoading) {
        return (
          <svg
            className="h-4 w-4 text-gray-500 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        );
      }
      if (isSuccess) {
        return <span className="text-green-600 text-sm leading-none">✓</span>;
      }
      // placeholder to prevent layout shift
      return <span className="inline-block w-4 h-4" aria-hidden />;
    };

    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleBackup}
          disabled={isLoading}
          className="text-sm font-medium text-gray-700 hover:text-orange-600 disabled:opacity-60"
          title="IndexedDB 백업 실행"
        >
          {labelBase}
          {/* no inline status text */}
        </button>
        <span className="inline-flex items-center justify-center w-4 h-4">
          {renderStatusIcon()}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleBackup}
        disabled={status === "loading"}
        className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
          status === "loading"
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {status === "loading" ? "백업 중..." : "IndexedDB 백업"}
      </button>
      {detail && (
        <p
          className={`text-sm ${
            status === "error" ? "text-red-600" : "text-gray-700"
          }`}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
