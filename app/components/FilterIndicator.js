"use client";

import React from "react";
import {
  XMarkIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

export default function FilterIndicator({
  currentFilter,
  searchTerm,
  exactCustomerFilter,
  dateRange,
  onClearFilter,
  onClearSearch,
  onClearCustomer,
  onClearDateRange,
  filteredCount = 0,
}) {
  // 활성화된 필터가 있는지 확인
  const hasActiveFilters = 
    (currentFilter && currentFilter !== "all") ||
    searchTerm ||
    exactCustomerFilter ||
    (dateRange && dateRange !== "30days");

  if (!hasActiveFilters) {
    return null; // 필터가 없으면 아무것도 표시하지 않음
  }

  const getFilterDisplayName = (filter) => {
    const filterNames = {
      "주문완료": "주문완료",
      "수령완료": "수령완료", 
      "미수령": "미수령",
      "주문취소": "주문취소",
      "결제완료": "결제완료",
      "확인필요": "확인필요",
    };
    return filterNames[filter] || filter;
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            현재 필터 적용 중 ({filteredCount.toLocaleString()}건)
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 활성화된 필터들 표시 */}
          <div className="flex items-center gap-1 flex-wrap">
            
            {/* 상태 필터 */}
            {currentFilter && currentFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-md">
                상태: {getFilterDisplayName(currentFilter)}
                <button
                  onClick={onClearFilter}
                  className="hover:bg-blue-200 rounded-full p-0.5"
                  title="상태 필터 해제"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
            
            {/* 검색어 */}
            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-md">
                검색: "{searchTerm}"
                <button
                  onClick={onClearSearch}
                  className="hover:bg-green-200 rounded-full p-0.5"
                  title="검색어 해제"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
            
            {/* 정확한 고객명 */}
            {exactCustomerFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-md">
                고객: {exactCustomerFilter}
                <button
                  onClick={onClearCustomer}
                  className="hover:bg-purple-200 rounded-full p-0.5"
                  title="고객 필터 해제"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
            
            {/* 날짜 범위 */}
            {dateRange && dateRange !== "30days" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-md">
                기간: {dateRange === "custom" ? "사용자 지정" : dateRange}
                <button
                  onClick={onClearDateRange}
                  className="hover:bg-orange-200 rounded-full p-0.5"
                  title="날짜 필터 해제"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          
          {/* 모든 필터 해제 버튼 */}
          <button
            onClick={() => {
              onClearFilter();
              onClearSearch();
              onClearCustomer();
              onClearDateRange();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            title="모든 필터 해제"
          >
            <XMarkIcon className="h-3 w-3" />
            모두 해제
          </button>
        </div>
      </div>
    </div>
  );
}