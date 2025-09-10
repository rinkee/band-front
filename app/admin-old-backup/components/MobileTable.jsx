'use client';

/**
 * 모바일 친화적 테이블 컴포넌트
 */
export default function MobileTable({ children, className = '' }) {
  return (
    <div className={`w-full ${className}`}>
      {/* 데스크톱에서는 일반 테이블 */}
      <div className="hidden lg:block overflow-x-auto">
        {children}
      </div>
      
      {/* 모바일에서는 카드 형식 */}
      <div className="lg:hidden">
        <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
          <div className="bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            모바일에서는 좌우로 스크롤하여 확인하세요
          </div>
          <div className="overflow-x-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 모바일 카드 아이템 컴포넌트
 */
export function MobileCard({ title, items, actions }) {
  return (
    <div className="bg-white shadow rounded-lg p-4 mb-3">
      <h3 className="font-medium text-gray-900 mb-2">{title}</h3>
      <div className="space-y-1 text-sm">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between">
            <span className="text-gray-500">{item.label}:</span>
            <span className="text-gray-900 font-medium">{item.value}</span>
          </div>
        ))}
      </div>
      {actions && (
        <div className="mt-3 flex gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}