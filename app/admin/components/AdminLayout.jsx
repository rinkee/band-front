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
  CogIcon,
  Squares2X2Icon,
  BellIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

/**
 * AdminLayout 컴포넌트
 * 관리자 페이지의 공통 레이아웃 (사이드바 + 헤더)
 */
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { user, logout } = useUser();

  const navigation = [
    { name: '대시보드', href: '/admin', icon: Squares2X2Icon },
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
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-6 h-16">
          {/* 왼쪽: 로고 및 검색 */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-emerald-600">NAVER</div>
              <div className="text-xl font-medium text-gray-700">부동산</div>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="검색어를 입력하세요"
                className="w-96 pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* 오른쪽: 알림 및 프로필 */}
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <BellIcon className="h-5 w-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user?.store_name || user?.login_id}</div>
                <div className="text-xs text-gray-500">관리자</div>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {(user?.store_name || user?.login_id || 'A').charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 사이드바 */}
      <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200">
        <nav className="flex flex-col h-full">
          <div className="flex-1 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                             (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all
                    ${isActive 
                      ? 'text-emerald-600 bg-emerald-50 border-r-2 border-emerald-600' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                  `}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* 로그아웃 버튼 */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 w-full text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              로그아웃
            </button>
          </div>
        </nav>
      </aside>

      {/* 메인 컨텐츠 영역 */}
      <main className="ml-64 pt-16">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}