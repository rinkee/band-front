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
    <div className="min-h-screen bg-gray-50 p-4">
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
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

        {/* 사용자 카드 목록 - 2열 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {users.map((user) => (
            <div key={user.user_id} className="relative bg-white rounded-3xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              {/* 상태 배지 - 우상단 */}
              <div className="absolute top-6 right-6">
                {user.is_active ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-gray-800 text-white">
                    활성
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium border border-gray-300 text-gray-500">
                    비활성
                  </span>
                )}
              </div>

              {/* 프로필 아이콘 영역 */}
              <div className="mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">
                    {(user.owner_name || user.store_name || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>

              {/* 사용자 정보 - 메인 */}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {user.owner_name || '이름 없음'}
                </h3>
                <p className="text-lg text-gray-700 mb-4">
                  {user.store_name || '스토어명 없음'}
                </p>

                {/* 태그 형식의 추가 정보 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                    {user.login_id}
                  </span>
                  {user.band_number && (
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                      밴드 #{user.band_number}
                    </span>
                  )}
                  {user.role === 'admin' && (
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
                      관리자
                    </span>
                  )}
                </div>
              </div>

              {/* 하단 정보 및 액션 */}
              <div className="space-y-4">
                {/* 메타 정보 */}
                <div className="text-sm text-gray-500">
                  <div className="mb-1">{user.phone_number || '전화번호 없음'}</div>
                  <div>가입일: {new Date(user.created_at).toLocaleDateString('ko-KR')}</div>
                </div>

                {/* Poder 접근 버튼 */}
                {user.login_id && user.login_password && (
                  <button
                    onClick={() => handlePoderAccess(user)}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                  >
                    Poder 접근
                  </button>
                )}
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

  // 활성 관리 페이지
  const ActivationView = () => (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
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

        {/* 사용자 활성화 카드 목록 - 2열 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {users.map((user) => (
            <div key={user.user_id} className="bg-white rounded-3xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              {/* 프로필 영역 */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xl font-bold">
                      {(user.owner_name || user.store_name || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {user.owner_name || '이름 없음'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {user.store_name || '스토어명 없음'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {user.login_id}
                    </p>
                  </div>
                </div>
              </div>

              {/* 활성화 스위치 - 중앙 정렬 */}
              <div className="flex justify-center">
                <button
                  onClick={() => toggleUserActive(user.user_id, user.is_active)}
                  className={`relative inline-flex h-16 w-32 items-center rounded-full transition-all duration-300 ${
                    user.is_active
                      ? 'bg-gradient-to-r from-green-400 to-green-500 shadow-lg'
                      : 'bg-gray-200'
                  }`}
                >
                  <span className="sr-only">활성화 토글</span>
                  <span
                    className={`absolute h-14 w-14 transform rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
                      user.is_active ? 'translate-x-[68px]' : 'translate-x-[2px]'
                    }`}
                  >
                    {user.is_active ? (
                      <CheckCircleIcon className="h-8 w-8 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-8 w-8 text-gray-400" />
                    )}
                  </span>
                  <span className={`absolute text-xs font-medium transition-opacity duration-300 ${
                    user.is_active
                      ? 'left-3 text-white opacity-100'
                      : 'right-3 text-gray-500 opacity-100'
                  }`}>
                    {user.is_active ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* 상태 텍스트 */}
              <div className="text-center mt-4">
                <span className={`text-sm font-medium ${
                  user.is_active ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {user.is_active ? '서비스 활성화됨' : '서비스 비활성화됨'}
                </span>
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      <div className="min-h-screen bg-gray-50 p-4">
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