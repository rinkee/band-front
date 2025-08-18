'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '../hooks/useAdminUser';
import { 
  HomeIcon, 
  UsersIcon, 
  ChartBarIcon, 
  ClipboardDocumentListIcon,
  ArrowLeftOnRectangleIcon,
  CogIcon
} from '@heroicons/react/24/outline';

/**
 * AdminLayout 컴포넌트
 * 관리자 페이지의 공통 레이아웃 (사이드바 + 헤더)
 */
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { user, logout } = useUser();

  const navigation = [
    { name: '대시보드', href: '/admin', icon: HomeIcon },
    { name: '밴드 관리', href: '/admin/bands', icon: ChartBarIcon },
    { name: '사용자 관리', href: '/admin/users', icon: UsersIcon },
    { name: '주문 현황', href: '/admin/orders', icon: ClipboardDocumentListIcon },
    { name: '설정', href: '/admin/settings', icon: CogIcon },
  ];

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 사이드바 */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900">
        <div className="flex flex-col h-full">
          {/* 로고 */}
          <div className="flex items-center justify-center h-16 bg-gray-800">
            <h1 className="text-xl font-bold text-white">Band Admin</h1>
          </div>

          {/* 네비게이션 */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                             (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center px-2 py-2 text-sm font-medium rounded-md
                    ${isActive 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'}
                  `}
                >
                  <item.icon
                    className={`mr-3 h-6 w-6 ${isActive ? 'text-white' : 'text-gray-400'}`}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* 사용자 정보 */}
          <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
            <div className="flex items-center">
              <div>
                <div className="text-base font-medium text-white">
                  {user?.store_name || user?.login_id}
                </div>
                <div className="text-sm font-medium text-gray-400">관리자</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="pl-64">
        {/* 헤더 */}
        <header className="bg-white shadow">
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {navigation.find(item => 
                pathname === item.href || 
                (item.href !== '/admin' && pathname.startsWith(item.href))
              )?.name || '관리자 페이지'}
            </h2>
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4 mr-2" />
              로그아웃
            </button>
          </div>
        </header>

        {/* 페이지 컨텐츠 */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}