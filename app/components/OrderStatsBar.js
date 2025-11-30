"use client";

import React, { useMemo } from "react";
import {
  ClockIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export default function OrderStatsBar({
  statsData,
  onFilterChange,
  isLoading = false,
}) {
  // 통계 계산
  const stats = useMemo(() => {
    if (!statsData?.data) {
      return {
        pending: 0,
        needsAttention: 0,
        undelivered: 0,
      };
    }

    const { statusCounts = {}, subStatusCounts = {} } = statsData.data;

    return {
      pending: statusCounts["주문완료"] || 0,
      needsAttention: subStatusCounts["확인필요"] || 0,
      undelivered: subStatusCounts["미수령"] || 0,
    };
  }, [statsData]);

  // 통계 카드 설정
  const statCards = [
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
      id: 'undelivered',
      title: '미수령',
      value: stats.undelivered,
      icon: ExclamationTriangleIcon,
      color: 'text-yellow-600 bg-yellow-100',
      borderColor: 'border-yellow-200',
      hoverColor: 'hover:bg-yellow-50',
      onClick: () => onFilterChange('미수령'),
      isClickable: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="grid grid-cols-3 gap-4">
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
  );
}