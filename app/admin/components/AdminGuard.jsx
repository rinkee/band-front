'use client';

import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import { useUser } from '../hooks/useAdminUser';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';

/**
 * AdminGuard 컴포넌트
 * 관리자 권한을 체크하고 권한이 없으면 리다이렉트
 * 
 * 사용법:
 * <AdminGuard>
 *   <AdminContent />
 * </AdminGuard>
 */
export default function AdminGuard({ children }) {
  const { user, loading } = useUser();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!loading) {
      console.log('AdminGuard - User info:', user); // 디버깅용
      
      // 로그인하지 않았거나 관리자가 아닌 경우
      if (!user) {
        redirect('/login?redirect=/admin');
      } else if (user.role !== 'admin') {
        // 관리자가 아닌 경우 대시보드로 리다이렉트
        console.log('AdminGuard - Not admin:', user.role, user.login_id); // 디버깅용
        alert('관리자 권한이 필요합니다.');
        redirect('/dashboard');
      } else {
        // 권한 확인 완료
        console.log('AdminGuard - Admin confirmed'); // 디버깅용
        setIsChecking(false);
      }
    }
  }, [user, loading]);

  // 로딩 중이거나 권한 체크 중일 때
  if (loading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">권한을 확인하는 중...</p>
        </div>
      </div>
    );
  }

  // 권한이 확인된 경우 children 렌더링
  return <>{children}</>;
}