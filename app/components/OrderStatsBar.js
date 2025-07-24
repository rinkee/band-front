"use client";

import React, { useMemo } from "react";
import {
  CalendarDaysIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

// 금액 포맷팅 함수
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(amount);
};

export default function OrderStatsBar({
  statsData,
  orders = [],
  onFilterChange,
  isLoading = false,
}) {
  // 오늘 날짜 구하기
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  // 날짜 문자열 파싱 함수
  const parsePickupDate = (dateString) => {
    if (!dateString) return null;
    
    // "12월 25일 (수)" 형식 파싱
    const dateMatch = dateString.match(/(\d+)월\s*(\d+)일/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1;
      const day = parseInt(dateMatch[2]);
      const year = new Date().getFullYear();
      
      const date = new Date(year, month, day);
      
      // 만약 날짜가 과거라면 다음 해로 설정
      if (date < today) {
        date.setFullYear(year + 1);
      }
      
      return date;
    }
    
    return null;
  };

  // 통계 계산
  const stats = useMemo(() => {
    if (!statsData?.data) {
      return {
        todayPickups: 0,
        urgentPickups: 0,
        pending: 0,
        needsAttention: 0,
        todayTotal: 0,
        todayCompleted: 0,
        todayCompletionRate: 0,
        undelivered: 0,
        longUndelivered: 0,
        weeklyRevenue: 0,
      };
    }

    const { filteredData = [], statusCounts = {}, subStatusCounts = {} } = statsData.data;

    // 오늘 픽업 예정 주문 계산
    let todayPickups = 0;
    let urgentPickups = 0;
    let longUndelivered = 0;
    let todayTotal = 0;
    let todayCompleted = 0;

    // 오늘 날짜 문자열
    const todayStr = today.toISOString().split('T')[0];

    filteredData.forEach((order) => {
      // 오늘 생성된 주문인지 확인
      const orderDate = new Date(order.ordered_at);
      const orderDateStr = orderDate.toISOString().split('T')[0];
      
      if (orderDateStr === todayStr) {
        todayTotal++;
        if (order.status === "수령완료") {
          todayCompleted++;
        }
      }

      // 오늘 픽업 예정인지 확인
      const pickupDate = parsePickupDate(order.product_pickup_date);
      if (pickupDate) {
        const pickupDateStr = pickupDate.toISOString().split('T')[0];
        if (pickupDateStr === todayStr && order.status !== "수령완료" && order.status !== "주문취소") {
          todayPickups++;
          
          // 긴급 여부 확인 (현재 시간 기준 2시간 이내)
          const now = new Date();
          const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
          if (pickupDate <= twoHoursLater) {
            urgentPickups++;
          }
        }
      }

      // 장기 미수령 확인 (3일 이상)
      if (order.sub_status === "미수령") {
        const daysSinceOrder = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));
        if (daysSinceOrder >= 3) {
          longUndelivered++;
        }
      }
    });

    // 주간 매출 계산 (최근 7일)
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyRevenue = filteredData
      .filter(order => new Date(order.ordered_at) >= weekAgo)
      .reduce((sum, order) => sum + (order.total_amount || 0), 0);

    const todayCompletionRate = todayTotal > 0 
      ? Math.round((todayCompleted / todayTotal) * 100) 
      : 0;

    return {
      todayPickups,
      urgentPickups,
      pending: statusCounts["주문완료"] || 0,
      needsAttention: subStatusCounts["확인필요"] || 0,
      todayTotal,
      todayCompleted,
      todayCompletionRate,
      undelivered: subStatusCounts["미수령"] || 0,
      longUndelivered,
      weeklyRevenue,
    };
  }, [statsData, today]);

  // 통계 카드 설정
  const statCards = [
    {
      id: 'todayPickup',
      title: '오늘 픽업',
      value: stats.todayPickups,
      subtitle: stats.urgentPickups > 0 ? `긴급: ${stats.urgentPickups}건` : null,
      icon: CalendarDaysIcon,
      color: stats.urgentPickups > 0 ? 'text-orange-600 bg-orange-100' : 'text-blue-600 bg-blue-100',
      borderColor: stats.urgentPickups > 0 ? 'border-orange-200' : 'border-blue-200',
      hoverColor: stats.urgentPickups > 0 ? 'hover:bg-orange-50' : 'hover:bg-blue-50',
      onClick: () => {
        // 오늘 픽업 필터 적용 로직
        console.log("오늘 픽업 필터 클릭");
      },
      pulse: stats.urgentPickups > 0,
      isClickable: true,
    },
    {
      id: 'pending',
      title: '처리 대기',
      value: stats.pending,
      subtitle: '주문완료 상태',
      icon: ClockIcon,
      color: 'text-blue-600 bg-blue-100',
      borderColor: 'border-blue-200',
      hoverColor: 'hover:bg-blue-50',
      onClick: () => onFilterChange('주문완료'),
      isClickable: true,
    },
    {
      id: 'needsAttention',
      title: '확인필요',
      value: stats.needsAttention,
      icon: ExclamationCircleIcon,
      color: 'text-red-600 bg-red-100',
      borderColor: 'border-red-200',
      hoverColor: 'hover:bg-red-50',
      onClick: () => onFilterChange('확인필요'),
      pulse: stats.needsAttention > 0,
      isClickable: true,
    },
    {
      id: 'todayCompletion',
      title: '오늘 완료',
      value: `${stats.todayCompletionRate}%`,
      subtitle: `${stats.todayCompleted}/${stats.todayTotal}건`,
      icon: ChartBarIcon,
      color: 'text-green-600 bg-green-100',
      borderColor: 'border-green-200',
      isClickable: false,
    },
    {
      id: 'undelivered',
      title: '미수령',
      value: stats.undelivered,
      subtitle: stats.longUndelivered > 0 ? `3일+: ${stats.longUndelivered}건` : null,
      icon: ExclamationTriangleIcon,
      color: 'text-yellow-600 bg-yellow-100',
      borderColor: 'border-yellow-200',
      hoverColor: 'hover:bg-yellow-50',
      onClick: () => onFilterChange('미수령'),
      isClickable: true,
    },
    {
      id: 'weeklyRevenue',
      title: '주간 매출',
      value: formatCurrency(stats.weeklyRevenue),
      icon: CurrencyDollarIcon,
      color: 'text-gray-600 bg-gray-100',
      borderColor: 'border-gray-200',
      isClickable: false,
    },
  ];

  // 긴급 알림 계산 (항상 실행되어야 함 - Hook 순서 유지)
  const urgentAlerts = useMemo(() => {
    if (isLoading) return [];
    
    const alerts = [];
    
    if (!statsData?.data?.filteredData) return alerts;
    
    const { filteredData } = statsData.data;
    
    // 30분 내 픽업 예정 찾기
    const now = new Date();
    const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000);
    
    filteredData.forEach((order) => {
      if (order.status === "수령완료" || order.status === "주문취소") return;
      
      const pickupDate = parsePickupDate(order.product_pickup_date);
      if (pickupDate && pickupDate <= thirtyMinutesLater && pickupDate >= now) {
        alerts.push({
          type: 'urgent',
          text: `${order.customer_name} ${order.product_title} ${order.quantity}개 - 30분 내 픽업`,
          orderId: order.order_id,
        });
      }
      
      // 5일 이상 미수령
      if (order.sub_status === "미수령") {
        const daysSinceOrder = Math.floor((today - new Date(order.ordered_at)) / (1000 * 60 * 60 * 24));
        if (daysSinceOrder >= 5) {
          alerts.push({
            type: 'overdue',
            text: `${order.customer_name} - ${daysSinceOrder}일째 미수령`,
            orderId: order.order_id,
          });
        }
      }
    });
    
    // 최대 3개만 표시
    return alerts.slice(0, 3);
  }, [statsData, today, isLoading]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      {/* 통계 카드 섹션 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.id}
              onClick={stat.isClickable ? stat.onClick : undefined}
              className={`
                relative overflow-hidden rounded-lg p-4 border-2 transition-all duration-200
                ${stat.borderColor || 'border-gray-200'}
                ${stat.isClickable 
                  ? `cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95 ${stat.hoverColor || 'hover:bg-gray-50'}` 
                  : 'cursor-default hover:shadow-sm'
                }
                ${stat.pulse ? 'animate-pulse shadow-lg' : 'shadow-sm'}
                ${stat.isClickable ? 'hover:border-opacity-60' : ''}
              `}
              style={{
                background: stat.isClickable 
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)'
                  : 'rgba(255,255,255,0.9)'
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      {stat.title}
                    </p>
                    {stat.isClickable && (
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {stat.value}
                  </p>
                  {stat.subtitle && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {stat.subtitle}
                    </p>
                  )}
                </div>
                <div className={`p-2 rounded-lg transition-all duration-200 ${stat.color} ${stat.isClickable ? 'group-hover:scale-110' : ''}`}>
                  <stat.icon className={`h-5 w-5 transition-transform duration-200 ${stat.isClickable ? 'hover:scale-110' : ''}`} />
                </div>
              </div>
              
              {/* 클릭 가능한 카드 표시 - 개선된 인디케이터 */}
              {stat.isClickable && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <div className="w-1 h-1 bg-blue-400 rounded-full opacity-60"></div>
                  <div className="w-1 h-1 bg-blue-400 rounded-full opacity-80"></div>
                  <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                </div>
              )}
              
              {/* 호버 시 필터 적용 힌트 */}
              {stat.isClickable && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none"></div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* 긴급 알림 배너 */}
      {urgentAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">긴급 확인 필요</h4>
              <ul className="space-y-1">
                {urgentAlerts.map((alert, index) => (
                  <li key={index} className="text-sm text-red-700">
                    • {alert.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}