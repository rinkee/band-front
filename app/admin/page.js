'use client';

import { useState, useEffect } from 'react';
import supabase from '../lib/supabaseClient';
import {
  UserGroupIcon,
  CogIcon,
  CheckIcon,
  XMarkIcon,
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

  // 사용자 정보 페이지 (개선된 디자인)
  const UsersView = () => (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 - 고정 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('menu')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="메뉴로 돌아가기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">사용자 정보</h1>
                <p className="text-sm text-gray-500">{users.length}명의 사용자</p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      </div>

      {/* 컨텐츠 영역 */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 사용자 카드 그리드 - 반응형 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((user) => (
            <div
              key={user.user_id}
              className={`bg-white rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${
                user.is_active ? 'border-gray-200' : 'border-gray-300 opacity-75'
              }`}
            >
              {/* 카드 바디 - 주요 정보 */}
              <div className="p-6">
                {/* 사용자 기본 정보 - 명확한 계층 구조 */}
                <div className="mb-6">
                  {/* 주요 정보 (크고 굵게) */}
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {user.owner_name || '이름 없음'}
                  </h3>
                  {/* 부가 정보 (중간 크기) */}
                  <p className="text-base text-gray-700 mb-3">
                    {user.store_name || '스토어명 없음'}
                  </p>

                  {/* 세부 정보 (작은 크기, 회색) - 모든 필드 표시 */}
                  <div className="space-y-1.5 text-sm text-gray-500">
                    <div className="flex items-center">
                      <span className="font-medium mr-2">ID:</span>
                      <span>{user.login_id || '-'}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium mr-2">연락처:</span>
                      <span>{user.phone_number || '-'}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium mr-2">밴드:</span>
                      <span>{user.band_number ? `#${user.band_number}` : '-'}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium mr-2">가입:</span>
                      <span>{user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium mr-2">최근 로그인:</span>
                      <span>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('ko-KR') : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* 액션 버튼 - 시각적 포인트 */}
                {user.login_id && user.login_password && (
                  <button
                    onClick={() => handlePoderAccess(user)}
                    className="w-full bg-blue-200 hover:bg-blue-400 text-blue-500 py-2.5 px-4 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                  >
                    Poder 접근
                  </button>
                )}

                {/* 상태 배지 영역 - 활성 상태, Function, 관리자 모두 표시 */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-2">
                    {/* 활성 상태 배지 */}
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                      user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {user.is_active ? '활성' : '비활성'}
                    </span>

                    {/* Function 번호 배지 */}
                    {user.function_number !== null && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                        user.function_number === 0 ? 'bg-gray-100 text-gray-700' :
                        user.function_number === 1 ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        Function #{user.function_number}
                      </span>
                    )}

                    {/* 관리자 배지 */}
                    {user.role === 'admin' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                        관리자
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 빈 상태 */}
        {users.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <UserGroupIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-lg">등록된 사용자가 없습니다</p>
            <button
              onClick={loadData}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
            >
              새로고침
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // 활성 관리 페이지 (개선된 디자인)
  const ActivationView = () => (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 - 고정 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('menu')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="메뉴로 돌아가기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">활성 관리</h1>
                <p className="text-sm text-gray-500">
                  {users.filter(u => u.is_active).length}/{users.length}명 활성
                </p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      </div>

      {/* 컨텐츠 영역 */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 활성화 카드 목록 - 단일 열로 간결하게 */}
        <div className="space-y-4">
          {users.map((user) => (
            <div
              key={user.user_id}
              className="bg-white rounded-xl border border-gray-200 transition-all hover:shadow-md"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  {/* 왼쪽: 사용자 정보 - 계층 구조 적용 */}
                  <div className="flex-1">
                    <div className="flex items-start space-x-4">
                      {/* 상태 인디케이터 */}
                      <div className={`w-2 h-12 rounded-full flex-shrink-0 ${
                        user.is_active ? 'bg-green-400' : 'bg-gray-300'
                      }`} />

                      {/* 정보 계층 */}
                      <div className="flex-1">
                        {/* 주요 정보 - 관리자 표시 우측에 */}
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {user.owner_name || '이름 없음'}
                          </h3>
                          {user.role === 'admin' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                              관리자
                            </span>
                          )}
                        </div>
                        {/* 부가 정보 */}
                        <p className="text-base text-gray-700 mb-1">
                          {user.store_name || '스토어명 없음'}
                        </p>
                        {/* 세부 정보 */}
                        <div className="flex items-center space-x-3 text-sm text-gray-500">
                          <span>{user.login_id}</span>
                          {user.band_number && (
                            <>
                              <span>•</span>
                              <span>밴드 #{user.band_number}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 오른쪽: 활성화 스위치 with 레이블 */}
                  <div className="ml-6 text-center">
                    <p className="text-xs text-gray-600 font-medium mb-1">고객 활성</p>
                    <button
                      onClick={() => toggleUserActive(user.user_id, user.is_active)}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        user.is_active
                          ? 'bg-green-500 hover:bg-green-600 focus:ring-green-500'
                          : 'bg-gray-300 hover:bg-gray-400 focus:ring-gray-500'
                      }`}
                      aria-label={`${user.owner_name} 활성화 상태 변경`}
                    >
                      <span className="sr-only">활성화 토글</span>
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                          user.is_active ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 추가 정보 - 필요시 표시 */}
                {user.last_login_at && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      마지막 로그인: {new Date(user.last_login_at).toLocaleDateString('ko-KR')} {new Date(user.last_login_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 빈 상태 */}
        {users.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CogIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-lg">등록된 사용자가 없습니다</p>
            <button
              onClick={loadData}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
            >
              새로고침
            </button>
          </div>
        )}

        {/* 통계 요약 - 하단 고정 */}
        {users.length > 0 && (
          <div className="mt-8 p-4 bg-white rounded-xl border border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                <p className="text-sm text-gray-500">전체</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {users.filter(u => u.is_active).length}
                </p>
                <p className="text-sm text-gray-500">활성</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">
                  {users.filter(u => !u.is_active).length}
                </p>
                <p className="text-sm text-gray-500">비활성</p>
              </div>
            </div>
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