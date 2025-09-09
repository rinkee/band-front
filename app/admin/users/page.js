'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminGuard from '../components/AdminGuard';
import AdminLayout from '../components/AdminLayout';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';
import { MagnifyingGlassIcon, UserPlusIcon, ArrowDownTrayIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useAdminApi } from '../hooks/useAdminApi';
import ErrorMessage from '../components/ErrorMessage';
import RefreshButton from '../components/RefreshButton';

/**
 * 사용자 관리 페이지
 */
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const { fetchAdminApi } = useAdminApi();
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, filter]);

  const fetchUsers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        filter,
        ...(search && { search })
      });

      const data = await fetchAdminApi(`/api/admin/users?${params}`);
      setUsers(data.users || []);
      setPagination(data.pagination);
    } catch (error) {
      setError('사용자 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchUsers();
  };

  const handleUserUpdate = async (userId, updates) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates })
      });

      if (res.ok) {
        alert('사용자 정보가 업데이트되었습니다.');
        fetchUsers();
      } else {
        alert('업데이트 실패');
      }
    } catch (error) {
      console.error('Update error:', error);
      setError('업데이트 중 오류가 발생했습니다.');
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
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
    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  // Poder 자동 로그인 함수
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

  // CSV 다운로드
  const downloadCSV = () => {
    const headers = ['로그인ID', '상점명', '역할', '상태', '밴드연결', 'Function#', '게시물수', '주문수', '최근로그인'];
    const rows = users.map(user => [
      user.login_id,
      user.store_name || '',
      user.role || 'user',
      user.is_active ? '활성' : '비활성',
      user.has_band ? '연결됨' : '미연결',
      user.function_number || '',
      user.total_posts || 0,
      user.total_orders || 0,
      user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('ko-KR') : ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // 선택된 사용자 처리
  const toggleUserSelection = (userId) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const selectAllUsers = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.user_id)));
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ko-KR');
  };

  return (
    <AdminGuard>
      <AdminLayout title="사용자 관리">
        <div className="space-y-6">
          {/* 헤더 영역 */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">사용자 관리</h2>
            <div className="flex gap-2">
              <button
                onClick={downloadCSV}
                disabled={users.length === 0}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
                CSV 다운로드
              </button>
              <RefreshButton 
                onRefresh={() => fetchUsers(false)} 
                autoRefresh={false}
              />
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <ErrorMessage 
              message={error} 
              onClose={() => setError(null)}
              type="error"
            />
          )}

          {/* 검색 및 필터 */}
          <div className="bg-white shadow rounded-lg p-4">
            <div className="flex gap-4">
              <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="로그인 ID 또는 상점명으로 검색..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  검색
                </button>
              </form>
              
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">전체</option>
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
                <option value="admin">관리자</option>
                <option value="has_band">밴드 연결</option>
              </select>
            </div>
          </div>

          {/* 사용자 테이블 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedUsers.size === users.length && users.length > 0}
                            onChange={selectAllUsers}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          로그인 ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          상점명
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          역할
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          상태
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          밴드
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Function #
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          게시물/주문
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          최근 로그인
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          작업
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.user_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedUsers.has(user.user_id)}
                              onChange={() => toggleUserSelection(user.user_id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {user.login_id}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user.store_name || '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              user.role === 'admin' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.role || 'user'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              user.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.is_active ? '활성' : '비활성'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              user.has_band 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.has_band ? '연결됨' : '미연결'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.function_number ? (
                              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                                user.function_number === 1 ? 'bg-blue-100 text-blue-800' :
                                user.function_number === 2 ? 'bg-green-100 text-green-800' :
                                user.function_number === 3 ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                #{user.function_number}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.total_posts || 0} / {user.total_orders || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(user.last_login_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-y-1">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => toggleUserStatus(user.user_id, user.is_active)}
                                className={`px-3 py-1 rounded text-white text-xs ${
                                  user.is_active 
                                    ? 'bg-red-600 hover:bg-red-700' 
                                    : 'bg-green-600 hover:bg-green-700'
                                }`}
                              >
                                {user.is_active ? '비활성화' : '활성화'}
                              </button>
                              
                              {user.login_id && user.login_password && (
                                <button
                                  onClick={() => handlePoderAccess(user)}
                                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center justify-center gap-1"
                                >
                                  <KeyIcon className="w-3 h-3" />
                                  Poder 접근
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {pagination.totalPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          총 <span className="font-medium">{pagination.total}</span>명 중{' '}
                          <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> -{' '}
                          <span className="font-medium">
                            {Math.min(pagination.page * pagination.limit, pagination.total)}
                          </span> 표시
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                          <button
                            onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                            disabled={pagination.page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            이전
                          </button>
                          <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                            {pagination.page} / {pagination.totalPages}
                          </span>
                          <button
                            onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                            disabled={pagination.page === pagination.totalPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            다음
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}