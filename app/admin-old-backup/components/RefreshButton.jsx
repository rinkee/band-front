'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

/**
 * 새로고침 버튼 컴포넌트 (자동 새로고침 지원)
 */
export default function RefreshButton({ onRefresh, autoRefresh = false, interval = 30000 }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(autoRefresh);
  const [countdown, setCountdown] = useState(interval / 1000);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const timer = setInterval(() => {
      handleRefresh();
      setCountdown(interval / 1000);
    }, interval);

    const countdownTimer = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : interval / 1000);
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(countdownTimer);
    };
  }, [autoRefreshEnabled, interval]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        <ArrowPathIcon className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        새로고침
      </button>
      
      <label className="inline-flex items-center text-sm text-gray-600">
        <input
          type="checkbox"
          checked={autoRefreshEnabled}
          onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
        />
        자동 새로고침
        {autoRefreshEnabled && (
          <span className="ml-1 text-xs text-gray-500">
            ({countdown}초)
          </span>
        )}
      </label>
    </div>
  );
}