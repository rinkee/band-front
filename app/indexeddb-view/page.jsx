"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAllFromStore,
  isIndexedDBAvailable,
  clearAllStores,
} from "../lib/indexedDbClient";
import Toast from "../components/Toast";
import ClearIndexedDBButton from "../components/ClearIndexedDBButton";

const STORE_CONFIG = {
  orders: {
    label: "orders",
    columns: [
      "order_id",
      "user_id",
      "post_number",
      "band_number",
      "customer_name",
      "comment",
      "status",
      "ordered_at",
      "updated_at",
      "post_key",
      "band_key",
      "comment_key",
      "memo",
    ],
  },
  products: {
    label: "products",
    columns: [
      "product_id",
      "user_id",
      "band_number",
      "title",
      "base_price",
      "barcode",
      "post_id",
      "updated_at",
      "pickup_date",
      "post_key",
      "band_key",
    ],
  },
  posts: {
    label: "posts",
    columns: [
      "post_id",
      "user_id",
      "band_number",
      "band_post_url",
      "author_name",
      "title",
      "pickup_date",
      "post_key",
      "band_key",
      "content",
      "posted_at",
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
  const [page, setPage] = useState(1);
  const [filterText, setFilterText] = useState("");
  const PAGE_SIZE = 100;

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
      setPage(1);
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

  const filteredRows = useMemo(() => {
    const sorted = (() => {
      if (storeName === "orders" && rows.length > 0) {
        return [...rows].sort((a, b) => {
          const aTime = a.ordered_at ? new Date(a.ordered_at).getTime() : 0;
          const bTime = b.ordered_at ? new Date(b.ordered_at).getTime() : 0;
          return bTime - aTime;
        });
      }
      if (storeName === "products" && rows.length > 0) {
        return [...rows].sort((a, b) => {
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return bTime - aTime;
        });
      }
      return rows;
    })();

    if (!filterText) return sorted;
    const lower = filterText.toLowerCase();
    return sorted.filter((row) =>
      columns.some((col) => {
        const val = row[col];
        if (val === null || val === undefined) return false;
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return str.toLowerCase().includes(lower);
      })
    );
  }, [rows, storeName, filterText, columns]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 flex flex-col gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">IndexedDB 데이터 보기</h1>
          <p className="text-sm text-gray-600">
            오프라인 캐시에 저장된 데이터를 테이블 형태로 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(STORE_CONFIG).map((name) => (
            <button
              key={name}
              onClick={() => setStoreName(name)}
              className={`px-3 py-2 text-sm rounded-lg border ${
                storeName === name
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {STORE_CONFIG[name].label}
            </button>
          ))}
          <button
            onClick={() => loadStore(storeName)}
            className="px-3 py-2 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            disabled={loading}
          >
            {loading ? "불러오는 중..." : "새로고침"}
          </button>
          <div className="ml-2">
            <ClearIndexedDBButton />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">
            {STORE_CONFIG[storeName]?.label} ({filteredRows.length}건)
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="text"
              placeholder="이 테이블에서 검색"
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50"
            >
              이전
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50"
            >
              다음
            </button>
          </div>
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
              {pagedRows.map((row, idx) => (
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

      <div className="flex items-center justify-center gap-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-2 rounded border border-gray-300 disabled:opacity-50"
        >
          이전
        </button>
        <span>
          {page} / {totalPages} (페이지당 {PAGE_SIZE}건)
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-3 py-2 rounded border border-gray-300 disabled:opacity-50"
        >
          다음
        </button>
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
