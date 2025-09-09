'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '../components/AdminGuard';
import AdminLayout from '../components/AdminLayout';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { useAdminApi } from '../hooks/useAdminApi';
import ErrorMessage from '../components/ErrorMessage';
import RefreshButton from '../components/RefreshButton';

/**
 * 밴드 관리 페이지
 */
export default function AdminBands() {
  const [bands, setBands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBands, setSelectedBands] = useState(new Set());
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [sortBy, setSortBy] = useState('last_post_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const { fetchAdminApi } = useAdminApi();

  useEffect(() => {
    fetchBands();
  }, [pagination.page, sortBy, sortOrder]);

  const fetchBands = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
        ...(search && { search })
      });

      const data = await fetchAdminApi(`/api/admin/bands?${params}`);
      setBands(data.bands || []);
      setPagination(data.pagination);
    } catch (error) {
      setError('밴드 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchBands();
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ko-KR');
  };

  // CSV 다운로드
  const downloadCSV = () => {
    const headers = ['상점명', '로그인ID', 'Function#', '게시물', '주문', '총매출', '최근활동'];
    const rows = bands.map(band => [
      band.store_name,
      band.login_id,
      band.function_number || '',
      band.post_count,
      band.order_count,
      band.total_sales || 0,
      band.last_post_at ? new Date(band.last_post_at).toLocaleDateString('ko-KR') : ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bands_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // 통계 정보
  const getStatistics = () => {
    const totalSales = bands.reduce((sum, band) => sum + (band.total_sales || 0), 0);
    const totalPosts = bands.reduce((sum, band) => sum + band.post_count, 0);
    const totalOrders = bands.reduce((sum, band) => sum + band.order_count, 0);
    const activeBands = bands.filter(band => band.last_post_at && 
      new Date(band.last_post_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    return { totalSales, totalPosts, totalOrders, activeBands };
  };

  const stats = getStatistics();

  return (
    <AdminGuard>
      <AdminLayout title="밴드 관리">
        <div className="space-y-6">
          {/* 헤더 영역 */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">밴드 관리</h1>
              <p className="text-sm text-gray-500 mt-1">등록된 밴드들의 활동 현황을 관리합니다</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={downloadCSV}
                disabled={bands.length === 0}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                CSV 다운로드
              </button>
              <RefreshButton 
                onRefresh={() => fetchBands(false)} 
                autoRefresh={false}
              />
            </div>
          </div>

          {/* 통계 카드 */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">활성 밴드</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeBands}</p>
                    <p className="text-xs text-gray-400 mt-2">최근 7일 활동</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <ChartBarIcon className="h-6 w-6 text-emerald-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">총 게시물</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPosts.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-2">누적 게시물 수</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <ChartBarIcon className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">총 주문</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalOrders.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-2">누적 주문 수</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <ChartBarIcon className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">총 매출</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{(stats.totalSales / 10000).toFixed(0)}만원</p>
                    <p className="text-xs text-gray-400 mt-2">누적 매출액</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <ChartBarIcon className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <ErrorMessage 
              message={error} 
              onClose={() => setError(null)}
              type="error"
            />
          )}

          {/* 검색 바 */}
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상점명 또는 로그인 ID로 검색..."
                  className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                검색
              </button>
            </form>
          </div>

          {/* 밴드 테이블 */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th 
                          onClick={() => handleSort('store_name')}
                          className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            상점명
                            {sortBy === 'store_name' && (
                              <span className="ml-1 text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          로그인 ID
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Function #
                        </th>
                        <th 
                          onClick={() => handleSort('post_count')}
                          className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            게시물
                            {sortBy === 'post_count' && (
                              <span className="ml-1 text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('order_count')}
                          className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            주문
                            {sortBy === 'order_count' && (
                              <span className="ml-1 text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('total_sales')}
                          className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            총 매출
                            {sortBy === 'total_sales' && (
                              <span className="ml-1 text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('last_post_at')}
                          className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            최근 활동
                            {sortBy === 'last_post_at' && (
                              <span className="ml-1 text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {bands.map((band) => (
                        <tr key={band.user_id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {band.store_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{band.login_id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-lg ${
                              band.function_number === 1 ? 'bg-blue-100 text-blue-700' :
                              band.function_number === 2 ? 'bg-emerald-100 text-emerald-700' :
                              band.function_number === 3 ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              #{band.function_number || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {band.post_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {band.order_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {band.total_sales?.toLocaleString()}원
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(band.last_post_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {pagination.totalPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={pagination.page === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        이전
                      </button>
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                        disabled={pagination.page === pagination.totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        다음
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          총 <span className="font-medium">{pagination.total}</span>개 중{' '}
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