"use client";

import { useState } from "react";
import { clearAllStores, isIndexedDBAvailable } from "../lib/indexedDbClient";
import Toast from "./Toast";

export default function ClearIndexedDBButton() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleClear = async () => {
    if (!isIndexedDBAvailable()) {
      setToast({ type: "error", message: "IndexedDB를 지원하지 않습니다." });
      return;
    }
    if (!confirm("로컬 IndexedDB 데이터를 모두 삭제할까요?")) return;
    setLoading(true);
    try {
      await clearAllStores();
      setToast({ type: "success", message: "IndexedDB 데이터를 모두 삭제했습니다." });
    } catch (err) {
      setToast({
        type: "error",
        message: err.message || "삭제 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleClear}
        disabled={loading}
        className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
          loading ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {loading ? "삭제 중..." : "IndexedDB 초기화"}
      </button>
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
