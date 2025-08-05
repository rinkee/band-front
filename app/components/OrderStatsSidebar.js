"use client";

import React, { useState, useEffect } from "react";
import { 
  ShoppingCartIcon, 
  TruckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  ChartBarIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";

const OrderStatsSidebar = ({ stats, isLoading, newOrdersCount = 0, onFilterChange, filterDateRange = null, currentFilter = "주문완료" }) => {
  const [showNewOrdersAnimation, setShowNewOrdersAnimation] = useState(false);


  // 새 주문이 추가되면 애니메이션 표시
  useEffect(() => {
    if (newOrdersCount > 0) {
      setShowNewOrdersAnimation(true);
      const timer = setTimeout(() => {
        setShowNewOrdersAnimation(false);
      }, 3000); // 3초 후 애니메이션 제거
      return () => clearTimeout(timer);
    }
  }, [newOrdersCount]);

  // 통계 계산 - 실제 데이터 구조에 맞게 수정
  const statsData = stats?.data || {};
  const totalOrders = statsData.totalOrders || 0;
  
  // 상태별 카운트
  const statusCounts = statsData.statusCounts || {};
  const subStatusCounts = statsData.subStatusCounts || {};
  
  // 각 상태별 주문 수
  // 미수령: sub_status가 '미수령'인 모든 주문
  const pendingOrders = subStatusCounts['미수령'] || 0;
  // 확인필요: sub_status가 '확인필요'인 모든 주문
  const needCheckOrders = subStatusCounts['확인필요'] || 0;
  // 수령완료: status가 '수령완료'인 모든 주문
  const completedOrders = statusCounts['수령완료'] || 0;
  // 주문완료: status가 '주문완료'인 전체 주문 (미수령, 확인필요 포함)
  const orderCompletedOrders = statusCounts['주문완료'] || 0;
  const completionRate = totalOrders > 0 
    ? Math.round((completedOrders / totalOrders) * 100) 
    : 0;

  const statsItems = [
    {
      label: "전체주문",
      value: totalOrders,
      icon: ShoppingCartIcon,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
      filterValue: "all",
    },
    {
      label: "주문완료",
      value: orderCompletedOrders,
      icon: ShoppingCartIcon,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      filterValue: "주문완료",
    },
    {
      label: "미수령",
      value: pendingOrders,
      icon: TruckIcon,
      color: "text-red-600",
      bgColor: "bg-red-100",
      filterValue: "미수령",
    },
    {
      label: "확인필요",
      value: needCheckOrders,
      icon: ExclamationTriangleIcon,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      filterValue: "확인필요",
    },
    {
      label: "수령완료",
      value: completedOrders,
      icon: CheckCircleIcon,
      color: "text-green-600",
      bgColor: "bg-green-100",
      filterValue: "수령완료",
    },
  ];

  // 기간 표시 텍스트 - 실제 조회기간에 맞춰 표시
  const getDateRangeText = () => {
    if (!filterDateRange || filterDateRange === "all") return "전체 기간";
    const labels = {
      "7": "최근 7일",
      "30": "최근 1개월",
      "90": "최근 3개월",
      "custom": "사용자 지정"
    };
    return labels[filterDateRange] || "전체 기간";
  };

  return (
    <div className="space-y-4">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <ChartBarIcon className="w-4 h-4 mr-1.5" />
            주문 현황
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{getDateRangeText()}</p>
        </div>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        )}
      </div>

      {/* 첫 번째 열 - 주요 상태 */}
      <div className="grid grid-cols-2 gap-3">
        {statsItems.slice(0, 4).map((item) => (
          <div
            key={item.label}
            onClick={() => onFilterChange && onFilterChange(item.filterValue)}
            className={`
              ${item.bgColor} rounded-lg p-3 
              ${currentFilter === item.filterValue ? 'ring-2 ring-blue-500 ring-opacity-75' : ''}
              transition-all duration-200 hover:shadow-sm cursor-pointer
              hover:scale-105 active:scale-95
            `}
          >
            <div className="flex items-center justify-between mb-1">
              <item.icon className={`w-5 h-5 ${item.color}`} />
              <span className={`text-xs font-medium ${item.color}`}>
                {item.label}
              </span>
            </div>
            <div className={`text-xl font-bold ${item.color}`}>
              {isLoading ? "-" : item.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      
      {/* 두 번째 열 - 수령완료와 완료율 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 수령완료 */}
        <div
          onClick={() => onFilterChange && onFilterChange(statsItems[4].filterValue)}
          className={`
            ${statsItems[4].bgColor} rounded-lg p-3 
            ${currentFilter === statsItems[4].filterValue ? 'ring-2 ring-blue-500 ring-opacity-75' : ''}
            transition-all duration-200 hover:shadow-sm cursor-pointer
            hover:scale-105 active:scale-95
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <CheckCircleIcon className={`w-5 h-5 ${statsItems[4].color}`} />
            <span className={`text-xs font-medium ${statsItems[4].color}`}>
              수령완료
            </span>
          </div>
          <div className={`text-xl font-bold ${statsItems[4].color}`}>
            {isLoading ? "-" : statsItems[4].value.toLocaleString()}
          </div>
        </div>
        
        {/* 완료율 카드 */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <ChartBarIcon className="w-5 h-5 text-gray-600" />
            <span className="text-xs font-medium text-gray-600">완료율</span>
          </div>
          <div className="text-xl font-bold text-gray-800 mb-2">
            {isLoading ? "-" : `${completionRate}%`}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: isLoading ? "0%" : `${completionRate}%` }}
            />
          </div>
        </div>
      </div>


      {/* 새 주문 알림 */}
      {showNewOrdersAnimation && newOrdersCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 animate-pulse">
          <div className="flex items-center text-blue-700">
            <SparklesIcon className="w-5 h-5 mr-2 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium">새 주문 {newOrdersCount}개</span>
              <span className="text-xs block text-blue-600">
                업데이트가 완료되었습니다
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OrderStatsSidebar;