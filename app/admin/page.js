'use client';

import { useState, useEffect } from 'react';
import supabase from '../lib/supabaseClient';
import {
  UserGroupIcon,
  CogIcon,
  ChevronRightIcon,
  UserIcon,
  BuildingStorefrontIcon,
  PhoneIcon,
  CalendarIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

export default function AdminPage() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu', 'users', 'activation'
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 데이터 로드
  const loadData = async () => {
    try {
      setLoading(true);

      // 사용자 데이터 로드
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select(`
          user_id,
          login_id,
          login_password,
          store_name,
          owner_name,
          phone_number,
          is_active,
          role,
          created_at,
          last_login_at,
          band_url,
          band_number,
          function_number
        `)
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // 기본 통계 계산
      const totalUsers = usersData?.length || 0;
      const activeUsers = usersData?.filter(u => u.is_active).length || 0;

      setStats({
        totalUsers,
        activeUsers
      });

    } catch (err) {
      setError(err.message);
      console.error('데이터 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  // is_active 토글
  const toggleUserActive = async (userId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('user_id', userId);

      if (error) throw error;

      // UI 업데이트
      setUsers(users.map(user =>
        user.user_id === userId
          ? { ...user, is_active: !currentStatus }
          : user
      ));

      // 통계 업데이트
      setStats(prev => ({
        ...prev,
        activeUsers: !currentStatus ? prev.activeUsers + 1 : prev.activeUsers - 1
      }));

    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  // Poder 자동 로그인
  const handlePoderAccess = (user) => {
    if (!user.login_id || !user.login_password) {
      alert('로그인 정보가 없습니다.');
      return;
    }

    // 로그인 정보를 sessionStorage에 저장
    sessionStorage.setItem('autoLogin', JSON.stringify({
      loginId: user.login_id,
      password: user.login_password
    }));

    // 로그인 페이지를 새 탭에서 열기
    window.open('/login?autoLogin=true', '_blank');
  };

  useEffect(() => {
    loadData();
  }, []);

  // 메인 메뉴 화면
  const MenuView = () => (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">관리자 메뉴</h1>

        <div className="grid grid-cols-2 gap-4">
          {/* 사용자 정보 메뉴 */}
          <button
            onClick={() => setCurrentView('users')}
            className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col items-center justify-center space-y-3"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-8 h-8 text-blue-600" />
            </div>
            <span className="text-gray-700 font-medium">사용자 정보</span>
          </button>

          {/* 활성 관리 메뉴 */}
          <button
            onClick={() => setCurrentView('activation')}
            className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col items-center justify-center space-y-3"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CogIcon className="w-8 h-8 text-green-600" />
            </div>
            <span className="text-gray-700 font-medium">활성 관리</span>
          </button>
        </div>

        {/* 통계 표시 */}
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
      </div>
    </div>
  );

  // 사용자 정보 페이지 (카드 디자인)
  const UsersView = () => (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setCurrentView('menu')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← 뒤로
          </button>
          <h1 className="text-xl font-bold text-gray-900">사용자 정보</h1>
          <button
            onClick={loadData}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            새로고침
          </button>
        </div>

        {/* 사용자 카드 목록 */}
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.user_id} className={`bg-white rounded-xl p-4 shadow ${!user.is_active ? 'opacity-60' : ''}`}>
              {/* 상태 배지 */}
              <div className="flex justify-between items-start mb-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  user.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {user.is_active ? '활성' : '비활성'}
                </span>
                {user.role === 'admin' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    관리자
                  </span>
                )}
              </div>

              {/* 사용자 정보 */}
              <div className="space-y-2 mb-4">
                <div className="flex items-start space-x-2">
                  <UserIcon className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{user.owner_name || '이름 없음'}</div>
                    <div className="text-xs text-gray-500">ID: {user.login_id}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <BuildingStorefrontIcon className="w-4 h-4 text-gray-400" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-700">{user.store_name || '스토어명 없음'}</div>
                    {user.band_number && (
                      <div className="text-xs text-gray-500">밴드: {user.band_number}</div>
                    )}
                  </div>
                </div>

                {user.phone_number && (
                  <div className="flex items-center space-x-2">
                    <PhoneIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{user.phone_number}</span>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    가입: {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>

              {/* Poder 접근 버튼 */}
              {user.login_id && user.login_password && (
                <button
                  onClick={() => handlePoderAccess(user)}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <KeyIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">Poder 접근</span>
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {users.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-500">등록된 사용자가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );

  // 활성 관리 페이지
  const ActivationView = () => (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setCurrentView('menu')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← 뒤로
          </button>
          <h1 className="text-xl font-bold text-gray-900">활성 관리</h1>
          <button
            onClick={loadData}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            새로고침
          </button>
        </div>

        {/* 사용자 활성화 카드 목록 */}
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.user_id} className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between">
                {/* 사용자 정보 */}
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{user.owner_name || '이름 없음'}</div>
                  <div className="text-sm text-gray-500">{user.store_name || '스토어명 없음'}</div>
                  <div className="text-xs text-gray-400">ID: {user.login_id}</div>
                </div>

                {/* 활성화 스위치 */}
                <button
                  onClick={() => toggleUserActive(user.user_id, user.is_active)}
                  className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors ${
                    user.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">활성화 토글</span>
                  <span
                    className={`inline-block h-10 w-10 transform rounded-full bg-white shadow transition-transform ${
                      user.is_active ? 'translate-x-12' : 'translate-x-1'
                    }`}
                  >
                    {user.is_active ? (
                      <CheckCircleIcon className="h-10 w-10 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-10 w-10 text-gray-400" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {users.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-500">등록된 사용자가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );

  // 로딩 화면
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">로딩중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error && currentView !== 'menu') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">오류: {error}</p>
            <button
              onClick={() => setCurrentView('menu')}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
            >
              메뉴로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 현재 뷰에 따라 화면 렌더링
  switch (currentView) {
    case 'users':
      return <UsersView />;
    case 'activation':
      return <ActivationView />;
    default:
      return <MenuView />;
  }
}