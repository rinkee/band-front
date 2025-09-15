'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../../lib/supabaseClient';
import {
  UserGroupIcon
} from '@heroicons/react/24/outline';

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'inactive'
  const [searchQuery, setSearchQuery] = useState(''); // 검색어

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
              <h1 className="text-base font-semibold text-gray-900">사용자({filteredUsers.length})</h1>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 검색 및 필터 영역 - 컴팩트 */}
        <div className="max-w-6xl mx-auto px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* 검색 입력 */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="지점명, 고객명, ID, 연락처로 검색..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            />

            {/* 필터 버튼 */}
            <div className="flex space-x-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                전체({users.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  filter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                활성({users.filter(u => u.is_active).length})
              </button>
              <button
                onClick={() => setFilter('inactive')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  filter === 'inactive'
                    ? 'bg-gray-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                비활성({users.filter(u => !u.is_active).length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 컨텐츠 영역 - 컴팩트 */}
      <div className="max-w-6xl mx-auto px-3 py-4">
        {/* 사용자 카드 그리드 - 컴팩트 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
}