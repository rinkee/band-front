'use client';

import { 
  UsersIcon, 
  BuildingStorefrontIcon, 
  DocumentTextIcon, 
  ShoppingCartIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline';

/**
 * StatsCards 컴포넌트
 * 대시보드 상단의 주요 통계 카드들
 */
export default function StatsCards({ stats }) {
  // 전일 대비 증감률 계산
  const calculateGrowth = (today, yesterday) => {
    if (!yesterday || yesterday === 0) return 0;
    return ((today - yesterday) / yesterday * 100).toFixed(1);
  };

  const cards = [
    {
      name: '전체 사용자',
      value: stats?.total_users || 0,
      icon: UsersIcon,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      change: stats?.new_users_today || 0,
      changeType: stats?.new_users_today > 0 ? 'increase' : 'neutral'
    },
    {
      name: '활성 밴드',
      value: stats?.active_bands || 0,
      icon: BuildingStorefrontIcon,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600'
    },
    {
      name: '총 게시물',
      value: stats?.total_posts || 0,
      icon: DocumentTextIcon,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-600',
      subtext: `오늘: ${stats?.today_posts || 0}`
    },
    {
      name: '총 주문',
      value: stats?.total_orders || 0,
      icon: ShoppingCartIcon,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      subtext: `오늘: ${stats?.today_orders || 0}`
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.name}
          className="relative bg-white pt-5 px-4 pb-4 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
        >
          <dt>
            <div className={`absolute rounded-md p-3 ${card.color}`}>
              <card.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 text-sm font-medium text-gray-500 truncate">
              {card.name}
            </p>
          </dt>
          <dd className="ml-16">
            <div className="flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">
                {card.value.toLocaleString()}
              </p>
              {card.change !== undefined && card.change !== 0 && (
                <p className={`ml-2 flex items-baseline text-sm font-semibold ${
                  card.changeType === 'increase' ? 'text-green-600' : 
                  card.changeType === 'decrease' ? 'text-red-600' : 
                  'text-gray-500'
                }`}>
                  {card.changeType === 'increase' && (
                    <ArrowUpIcon className="self-center flex-shrink-0 h-4 w-4 text-green-500" />
                  )}
                  {card.changeType === 'decrease' && (
                    <ArrowDownIcon className="self-center flex-shrink-0 h-4 w-4 text-red-500" />
                  )}
                  <span className="sr-only">
                    {card.changeType === 'increase' ? '증가' : '감소'}
                  </span>
                  {Math.abs(card.change)}
                </p>
              )}
            </div>
            {card.subtext && (
              <p className="text-sm text-gray-500 mt-1">
                {card.subtext}
              </p>
            )}
          </dd>
        </div>
      ))}
    </div>
  );
}