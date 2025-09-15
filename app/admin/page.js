'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../lib/supabaseClient';
import {
  UserGroupIcon,
  CogIcon
} from '@heroicons/react/24/outline';

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0
  });
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 데이터 로드 (통계만)
  const loadData = async () => {
    try {
      setLoading(true);

      // 사용자 통계 데이터 로드
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('is_active');

      if (usersError) throw usersError;

      // 기본 통계 계산
      const totalUsers = usersData?.length || 0;
      const activeUsers = usersData?.filter(u => u.is_active).length || 0;

      setStats({
        totalUsers,
        activeUsers
      });

    } catch (err) {
      console.error('데이터 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  };


  // 관리자 권한 확인
  const checkAdminAuth = async () => {
    try {
      setCheckingAuth(true);

      // 세션에서 userId 가져오기 - 여러 가능한 키 확인
      let userId = null;

      // 1. 'userData' 키 확인 (실제로 사용되는 키)
      const userDataString = sessionStorage.getItem('userData');
      if (userDataString) {
        try {
          const parsed = JSON.parse(userDataString);
          userId = parsed.userId;
        } catch (e) {
          console.error('userData 파싱 오류:', e);
        }
      }

      // 2. 'session' 키 확인 (대체 키)
      if (!userId) {
        const sessionData = sessionStorage.getItem('session');
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            userId = parsed.userId;
          } catch (e) {
            console.error('session 파싱 오류:', e);
          }
        }
      }

      // 로그인 상태가 아니면 로그인 페이지로
      if (!userId) {
        window.location.href = '/login';
        return;
      }

      // 데이터베이스에서 직접 role 확인
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (userError || !userData) {
        // 사용자를 찾을 수 없으면 대시보드로
        window.location.href = '/dashboard';
        return;
      }

      // role이 admin인지 확인
      if (userData.role === 'admin') {
        setIsAuthorized(true);
        await loadData(); // 권한이 있으면 데이터 로드
      } else {
        // 관리자가 아니면 대시보드로
        window.location.href = '/dashboard';
      }

    } catch (err) {
      console.error('권한 확인 오류:', err);
      window.location.href = '/dashboard';
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkAdminAuth();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">관리자 메뉴</h1>

        <div className="grid grid-cols-2 gap-4">
          {/* 사용자 정보 메뉴 */}
          <button
            onClick={() => router.push('/admin/users')}
            className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col items-center justify-center space-y-3"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-8 h-8 text-blue-600" />
            </div>
            <span className="text-gray-700 font-medium">사용자 정보</span>
          </button>

          {/* 활성 관리 메뉴 */}
          <button
            onClick={() => router.push('/admin/activation')}
            className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col items-center justify-center space-y-3"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CogIcon className="w-8 h-8 text-green-600" />
            </div>
            <span className="text-gray-700 font-medium">활성 관리</span>
          </button>
        </div>

        {/* 통계 표시 */}
        {!loading && (
          <div className="mt-6 bg-white rounded-xl p-4 shadow">
            <div className="flex justify-around">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.totalUsers}</div>
                <div className="text-xs text-gray-500">총 사용자</div>
              </div>
              <div className="w-px bg-gray-200"></div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
                <div className="text-xs text-gray-500">활성 사용자</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // 권한 확인 중
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">권한 확인중...</p>
        </div>
      </div>
    );
  }

  // 권한 없음 (이미 리다이렉트 처리했으므로 여기까지 오지 않아야 함)
  if (!isAuthorized) {
    return null;
  }
}