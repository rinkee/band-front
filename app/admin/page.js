'use client';

import { useState, useEffect } from 'react';
import supabase from '../lib/supabaseClient';

export default function SimpleAdminPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalOrders: 0,
    totalPosts: 0
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
      
      // 주문 및 게시물 수 (간단한 카운트)
      const [ordersResult, postsResult] = await Promise.allSettled([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true })
      ]);

      setStats({
        totalUsers,
        activeUsers,
        totalOrders: ordersResult.status === 'fulfilled' ? ordersResult.value.count || 0 : 0,
        totalPosts: postsResult.status === 'fulfilled' ? postsResult.value.count || 0 : 0
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">관리자 대시보드</h1>
          <p className="text-gray-600">사용자 관리 및 시스템 현황</p>
          <button
            onClick={loadData}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            새로고침
          </button>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">오류: {error}</p>
          </div>
        )}

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-gray-900">{stats.totalUsers}</div>
            <div className="text-sm text-gray-500">총 사용자</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
            <div className="text-sm text-gray-500">활성 사용자</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-blue-600">{stats.totalPosts}</div>
            <div className="text-sm text-gray-500">총 게시물</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-purple-600">{stats.totalOrders}</div>
            <div className="text-sm text-gray-500">총 주문</div>
          </div>
        </div>

        {/* 사용자 테이블 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">사용자 관리</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    사용자 정보
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    스토어 정보
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Function
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.user_id} className={!user.is_active ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    {/* 사용자 정보 */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{user.owner_name || '이름 없음'}</div>
                        <div className="text-sm text-gray-500">ID: {user.login_id}</div>
                        <div className="text-sm text-gray-500">{user.phone_number}</div>
                        {user.role === 'admin' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 mt-1">
                            관리자
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 스토어 정보 */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{user.store_name || '스토어명 없음'}</div>
                        {user.band_number && (
                          <div className="text-sm text-gray-500">밴드: {user.band_number}</div>
                        )}
                        {user.band_url && (
                          <a 
                            href={user.band_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            밴드 링크 →
                          </a>
                        )}
                      </div>
                    </td>

                    {/* 상태 */}
                    <td className="px-6 py-4">
                      <div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          user.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? '활성' : '비활성'}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          가입: {new Date(user.created_at).toLocaleDateString('ko-KR')}
                        </div>
                        {user.last_login_at && (
                          <div className="text-xs text-gray-500">
                            로그인: {new Date(user.last_login_at).toLocaleDateString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Function */}
                    <td className="px-6 py-4">
                      {user.function_number !== null ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          user.function_number === 1 ? 'bg-blue-100 text-blue-800' :
                          user.function_number === 2 ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          #{user.function_number}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* 작업 */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        {/* 활성화/비활성화 버튼 */}
                        <button
                          onClick={() => toggleUserActive(user.user_id, user.is_active)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            user.is_active
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {user.is_active ? '비활성화' : '활성화'}
                        </button>

                        {/* Poder 접근 버튼 */}
                        {user.login_id && user.login_password && (
                          <button
                            onClick={() => handlePoderAccess(user)}
                            className="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium"
                          >
                            🔑 Poder 접근
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">등록된 사용자가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}