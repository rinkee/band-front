"use client";

import React from "react";
import Link from "next/link";
import {
  XCircleIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";

export default function ErrorCard({
  title = "서버와 연결이 불안정합니다.",
  message = "잠시 후 다시 시도해주세요.",
  onRetry,
  offlineHref = "/offline-orders",
  retryLabel = "다시 시도",
  className = "",
}) {
  const handleRetry = () => {
    if (typeof onRetry === "function") {
      onRetry();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div
      className={`bg-white border border-red-200 shadow-sm rounded-xl p-6 text-center ${className}`}
    >
      <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-600 mb-5">{message}</p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
        >
          <ArrowPathIcon className="w-4 h-4" />
          {retryLabel}
        </button>
        {offlineHref && (
          <Link
            href={offlineHref}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            백업 페이지로 이동
          </Link>
        )}
      </div>
    </div>
  );
}
