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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [inactiveReason, setInactiveReason] = useState('');

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
          inactive_reason,
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
    // 비활성화 시도 시 모달 표시
    if (currentStatus) {
      setSelectedUserId(userId);
      setShowReasonModal(true);
      return;
    }

    // 활성화는 바로 처리
    try {
      const updateData = {
        is_active: true,
        inactive_reason: null // 활성화 시 이유 제거
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;

      // UI 업데이트
      setUsers(users.map(user =>
        user.user_id === userId
          ? { ...user, is_active: true, inactive_reason: null }
          : user
      ));

      // 통계 업데이트
      setStats(prev => ({
        ...prev,
        activeUsers: prev.activeUsers + 1
      }));

    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  // 비활성화 처리 (이유 포함)
  const handleDeactivate = async () => {
    if (!inactiveReason.trim()) {
      alert('비활성화 이유를 입력해주세요.');
      return;
    }

    try {
      const updateData = {
        is_active: false,
        inactive_reason: inactiveReason.trim()
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', selectedUserId);

      if (error) throw error;

      // UI 업데이트
      setUsers(users.map(user =>
        user.user_id === selectedUserId
          ? { ...user, is_active: false, inactive_reason: inactiveReason.trim() }
          : user
      ));

      // 통계 업데이트
      setStats(prev => ({
        ...prev,
        activeUsers: prev.activeUsers - 1
      }));

      // 모달 닫기
      setShowReasonModal(false);
      setInactiveReason('');
      setSelectedUserId(null);

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
  const UsersView = () => {
    const [filter, setFilter] = useState('all'); // 'all', 'active', 'inactive'
    const [searchQuery, setSearchQuery] = useState(''); // 검색어

    // 필터링된 사용자 목록
    const filteredUsers = users.filter(user => {
      // 활성/비활성 필터
      if (filter === 'active' && !user.is_active) return false;
      if (filter === 'inactive' && user.is_active) return false;

      // 검색 필터
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          (user.store_name && user.store_name.toLowerCase().includes(query)) ||
          (user.owner_name && user.owner_name.toLowerCase().includes(query)) ||
          (user.login_id && user.login_id.toLowerCase().includes(query)) ||
          (user.phone_number && user.phone_number.includes(query))
        );
      }

      return true;
    });

    return (
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
                  <p className="text-sm text-gray-500">{filteredUsers.length}명의 사용자</p>
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

          {/* 검색 및 필터 영역 */}
          <div className="max-w-6xl mx-auto px-4 py-3 bg-gray-50">
            {/* 검색 입력 */}
            <div className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="지점명, 고객명, ID, 연락처로 검색..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 필터 버튼 */}
            <div className="flex space-x-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                전체 ({users.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                활성 ({users.filter(u => u.is_active).length})
              </button>
              <button
                onClick={() => setFilter('inactive')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'inactive'
                    ? 'bg-gray-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                비활성 ({users.filter(u => !u.is_active).length})
              </button>
            </div>
          </div>
        </div>

        {/* 컨텐츠 영역 */}
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* 사용자 카드 그리드 - 반응형 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.map((user) => (
              <div
                key={user.user_id}
                className={`rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${
                  user.is_active
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-200 border-gray-300 opacity-60'
                }`}
              >
                {/* 카드 바디 - 주요 정보 */}
                <div className="p-6">
                  {/* 사용자 기본 정보 - 명확한 계층 구조 */}
                  <div className="mb-6">
                    {/* 주요 정보 (크고 굵게) - 지점명 */}
                    <h3 className={`text-lg font-bold mb-1 ${
                      user.is_active ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {user.store_name || '스토어명 없음'}
                    </h3>
                    {/* 부가 정보 (중간 크기) - 고객명 */}
                    <p className={`text-base mb-3 ${
                      user.is_active ? 'text-gray-700' : 'text-gray-500'
                    }`}>
                      {user.owner_name || '이름 없음'}
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

                    {/* 서버 배지 */}
                    {user.function_number !== null && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                        user.function_number === 0 ? 'bg-gray-100 text-gray-700' :
                        user.function_number === 1 ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        서버 {user.function_number === 0 ? 'D' : user.function_number === 1 ? 'A' : 'B'}
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
          {filteredUsers.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <UserGroupIcon className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 text-lg">
                {filter === 'active' ? '활성 사용자가 없습니다' :
                 filter === 'inactive' ? '비활성 사용자가 없습니다' :
                 '등록된 사용자가 없습니다'}
              </p>
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
  };

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
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  {/* 왼쪽: 사용자 정보 - 계층 구조 적용 */}
                  <div className="flex-1">
                    <div className="flex items-start space-x-3 sm:space-x-4">
                      {/* 상태 인디케이터 */}
                      <div className={`w-2 h-12 rounded-full flex-shrink-0 ${
                        user.is_active ? 'bg-green-400' : 'bg-gray-300'
                      }`} />

                      {/* 정보 계층 */}
                      <div className="flex-1 min-w-0">
                        {/* 주요 정보 */}
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                          {user.owner_name || '이름 없음'}
                        </h3>

                        {/* 부가 정보 */}
                        <p className="text-sm sm:text-base text-gray-700 mb-1 truncate">
                          {user.store_name || '스토어명 없음'}
                        </p>

                        {/* 세부 정보 및 배지 */}
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-500">
                          <span className="truncate">{user.login_id}</span>
                          {user.band_number && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="truncate">밴드 #{user.band_number}</span>
                            </>
                          )}
                          {user.role === 'admin' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                              관리자
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 오른쪽: 활성화 스위치 - 모바일에서는 우측 정렬 */}
                  <div className="mt-4 sm:mt-0 sm:ml-4 flex flex-col items-end sm:items-center">
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

                {/* 비활성 이유 표시 */}
                {!user.is_active && user.inactive_reason && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-700">
                      <span className="font-medium">비활성 이유:</span> {user.inactive_reason}
                    </p>
                  </div>
                )}

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
  return (
    <>
      {/* 비활성 이유 입력 모달 */}
      {showReasonModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* 배경 오버레이 */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => {
                setShowReasonModal(false);
                setInactiveReason('');
                setSelectedUserId(null);
              }}
            />

            {/* 모달 컨텐츠 */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      고객 비활성화
                    </h3>
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-3">
                        비활성화 이유를 입력해주세요:
                      </p>
                      <textarea
                        value={inactiveReason}
                        onChange={(e) => setInactiveReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        rows={3}
                        placeholder="예: 장기 미결제, 서비스 해지 요청, 연락 두절 등..."
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  비활성화
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReasonModal(false);
                    setInactiveReason('');
                    setSelectedUserId(null);
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 현재 뷰 렌더링 */}
      {currentView === 'users' && <UsersView />}
      {currentView === 'activation' && <ActivationView />}
      {currentView === 'menu' && <MenuView />}
    </>
  );
}