"use client";

import { useState } from "react";
import supabase from "../lib/supabaseClient";
import {
  isIndexedDBAvailable,
  bulkPut,
  saveSnapshot,
  setMeta,
} from "../lib/indexedDbClient";
import Toast from "./Toast";

const POST_COLUMNS =
  "post_id,title,content,posted_at,updated_at,author_name,image_urls,status,products_data,post_key,band_key,comment_count,user_id";
const PRODUCT_COLUMNS =
  "product_id,post_id,title,base_price,quantity_text,category,status,pickup_info,pickup_date,price_options,image_urls,product_type,updated_at,created_at,user_id";
const ORDER_COLUMNS = "*";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchLastWeek(table, columns, userId, dateColumn) {
  const since = new Date(Date.now() - ONE_WEEK_MS).toISOString();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .gte(dateColumn, since)
    .order(dateColumn, { ascending: false });

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

export default function IndexedDBBackupButton({ userId: propUserId }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [detail, setDetail] = useState("");
  const [toast, setToast] = useState(null);

  const handleBackup = async () => {
    if (!isIndexedDBAvailable()) {
      setToast({
        message: "브라우저가 IndexedDB를 지원하지 않습니다.",
        type: "error",
      });
      return;
    }

    const userId = resolveUserId(propUserId);
    if (!userId) {
      setToast({
        message: "사용자 정보를 찾을 수 없습니다. 다시 로그인 후 시도해주세요.",
        type: "error",
      });
      return;
    }

    setStatus("loading");
    setDetail("최근 7일치 데이터를 불러오는 중...");
    setToast(null);

    try {
      const [posts, products, orders] = await Promise.all([
        fetchLastWeek("posts", POST_COLUMNS, userId, "posted_at"),
        fetchLastWeek("products", PRODUCT_COLUMNS, userId, "created_at"),
        fetchLastWeek("orders", ORDER_COLUMNS, userId, "created_at"),
      ]);

      setDetail("IndexedDB에 저장 중...");
      await bulkPut("posts", posts);
      await bulkPut("products", products);
      await bulkPut("orders", orders);

      const snapshot = await saveSnapshot({
        counts: {
          posts: posts.length,
          products: products.length,
          orders: orders.length,
        },
        notes: `user:${userId}`,
      });
      await setMeta("lastBackupAt", snapshot.createdAt);

      setStatus("success");
      setDetail(
        `백업 완료 (posts ${posts.length}, products ${products.length}, orders ${orders.length})`
      );
      setToast({
        message: "IndexedDB에 백업했습니다. 장애 시 오프라인 모드로 전환됩니다.",
        type: "success",
      });
    } catch (err) {
      setStatus("error");
      setDetail(err.message || "백업 중 오류가 발생했습니다.");
      setToast({
        message: err.message || "백업 중 오류가 발생했습니다.",
        type: "error",
      });
    }
  };

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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={4000}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
