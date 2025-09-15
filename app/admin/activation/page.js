'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../../lib/supabaseClient';
import {
  CogIcon
} from '@heroicons/react/24/outline';

export default function ActivationPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
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

      // 모달 닫기
      setShowReasonModal(false);
      setInactiveReason('');
      setSelectedUserId(null);

    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
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
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">오류: {error}</p>
            <button
              onClick={() => router.push('/admin')}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
            >
              메뉴로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="min-h-screen bg-gray-50">
        {/* 상단 헤더 - 컴팩트 (스크롤 가능) */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => router.push('/admin')}
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  aria-label="뒤로가기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-base font-semibold text-gray-900">
                  활성관리({users.filter(u => u.is_active).length}/{users.length})
                </h1>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>

        {/* 컨텐츠 영역 - 컴팩트 */}
        <div className="max-w-4xl mx-auto px-3 py-4">
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
    </>
  );
}