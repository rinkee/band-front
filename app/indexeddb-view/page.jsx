"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAllFromStore,
  isIndexedDBAvailable,
} from "../lib/indexedDbClient";
import Toast from "../components/Toast";

const STORE_CONFIG = {
  orders: {
    label: "orders",
    columns: [
      "order_id",
      "customer_name",
      "customer_phone",
      "status",
      "product_name",
      "quantity",
      "price",
      "total_amount",
      "pickup_date",
      "updated_at",
    ],
  },
  products: {
    label: "products",
    columns: [
      "product_id",
      "title",
      "category",
      "status",
      "pickup_info",
      "pickup_date",
      "base_price",
      "quantity_text",
      "updated_at",
    ],
  },
  posts: {
    label: "posts",
    columns: [
      "post_id",
      "title",
      "author_name",
      "status",
      "posted_at",
      "updated_at",
      "comment_count",
    ],
  },
  syncQueue: {
    label: "syncQueue",
    columns: ["id", "table", "op", "pkValue", "updatedAt", "enqueuedAt"],
  },
  snapshots: {
    label: "snapshots",
    columns: ["snapshotId", "createdAt", "counts", "notes"],
  },
  meta: {
    label: "meta",
    columns: ["key", "value"],
  },
};

export default function IndexedDBViewPage() {
  const [storeName, setStoreName] = useState("orders");
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  const columns = useMemo(() => STORE_CONFIG[storeName]?.columns || [], [storeName]);

  const loadStore = async (name) => {
    if (!isIndexedDBAvailable()) {
      setToast({
        type: "error",
        message: "IndexedDB를 지원하지 않는 환경입니다.",
      });
      return;
    }
    setLoading(true);
    try {
      const data = await getAllFromStore(name);
      setRows(data || []);
    } catch (err) {
      setToast({
        type: "error",
        message: err.message || `${name} 로드 실패`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStore(storeName);
  }, [storeName]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 flex flex-col gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">IndexedDB 데이터 보기</h1>
            <p className="text-sm text-gray-600">
              오프라인 캐시에 저장된 데이터를 테이블 형태로 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.keys(STORE_CONFIG).map((name) => (
                <option key={name} value={name}>
                  {STORE_CONFIG[name].label}
                </option>
              ))}
            </select>
            <button
              onClick={() => loadStore(storeName)}
              className="px-3 py-2 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? "불러오는 중..." : "새로고침"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">
            {STORE_CONFIG[storeName]?.label} ({rows.length}건)
          </h2>
          {loading && <span className="text-sm text-gray-500">로딩 중...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={columns.length || 1}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr key={`${storeName}-${idx}`} className="hover:bg-gray-50">
                  {columns.map((col) => {
                    const value = row[col];
                    const display =
                      value === null || value === undefined
                        ? "-"
                        : typeof value === "object"
                        ? JSON.stringify(value)
                        : value;
                    return (
                      <td
                        key={`${col}-${idx}`}
                        className="px-4 py-3 whitespace-nowrap text-sm text-gray-700"
                        title={display}
                      >
                        {String(display).length > 50
                          ? `${String(display).slice(0, 50)}...`
                          : String(display)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
