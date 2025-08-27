'use client';

import { useState, useEffect } from 'react';
import AdminGuard from './components/AdminGuard';
import AdminLayout from './components/AdminLayout';
import StatsCards from './components/StatsCards';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';
import { useAdminApi } from './hooks/useAdminApi';
import ErrorMessage from './components/ErrorMessage';
import RefreshButton from './components/RefreshButton';
import { ChartBarIcon, ShoppingCartIcon, UsersIcon, DocumentTextIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * 관리자 대시보드 메인 페이지
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentBands, setRecentBands] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { fetchAdminApi } = useAdminApi();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    try {
      // 병렬로 모든 데이터 가져오기
      const [statsData, bandsData, ordersData] = await Promise.allSettled([
        fetchAdminApi('/api/admin/stats'),
        fetchAdminApi('/api/admin/bands?limit=5&sortBy=last_post_at'),
        fetchAdminApi('/api/admin/orders?limit=10')
      ]);

      // 통계 데이터 처리
      if (statsData.status === 'fulfilled') {
        setStats(statsData.value);
      } else {
        setStats({
          total_users: 0,
          total_bands: 0,
          total_posts: 0,
          total_orders: 0,
          total_sales: 0,
          today_orders: 0,
          today_sales: 0
        });
      }

      // 밴드 데이터 처리
      if (bandsData.status === 'fulfilled') {
        setRecentBands(bandsData.value.bands || []);
      }

      // 주문 데이터 처리
      if (ordersData.status === 'fulfilled') {
        setRecentOrders(ordersData.value.orders || []);
      }

      setLastUpdated(new Date());
      
      // 모든 요청이 실패한 경우에만 에러 표시
      if (statsData.status === 'rejected' && 
          bandsData.status === 'rejected' && 
          ordersData.status === 'rejected') {
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      }
    } catch (error) {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 차트 데이터 생성
  const salesChartData = {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    datasets: [
      {
        label: '2024',
        data: [65, 78, 66, 44, 56, 67, 75, 82, 72, 85, 92, 88],
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true,
      },
      {
        label: '2023',
        data: [45, 52, 38, 24, 33, 46, 52, 48, 55, 62, 68, 72],
        borderColor: 'rgb(156, 163, 175)',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 14,
        },
        bodyFont: {
          size: 13,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          borderDash: [3, 3],
          color: '#e5e7eb',
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 12,
          },
          callback: function(value) {
            return value + '만';
          },
        },
      },
    },
  };

  return (
    <AdminGuard>
      <AdminLayout title="대시보드">
        {/* 헤더 영역 */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">대시보드</h1>
              <p className="text-sm text-gray-500 mt-1">
                실시간 매장 현황을 한눈에 확인하세요
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-gray-400">
                  마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
                </span>
              )}
              <RefreshButton 
                onRefresh={() => fetchDashboardData(false)} 
                autoRefresh={true}
                interval={60000}
              />
            </div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4">
            <ErrorMessage 
              message={error} 
              onClose={() => setError(null)}
              type="error"
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 주요 지표 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">방문자 수</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total_users?.toLocaleString() || '0'}</p>
                    <div className="flex items-center mt-3">
                      <ArrowUpIcon className="w-4 h-4 text-emerald-500 mr-1" />
                      <span className="text-sm font-medium text-emerald-500">13.77%</span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <UsersIcon className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">문의내역</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total_orders?.toLocaleString() || '0'}</p>
                    <div className="flex items-center mt-3">
                      <ArrowUpIcon className="w-4 h-4 text-emerald-500 mr-1" />
                      <span className="text-sm font-medium text-emerald-500">32.5%</span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <ShoppingCartIcon className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">등록매물</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total_posts?.toLocaleString() || '0'}</p>
                    <div className="flex items-center mt-3">
                      <ArrowDownIcon className="w-4 h-4 text-red-500 mr-1" />
                      <span className="text-sm font-medium text-red-500">5.72%</span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <DocumentTextIcon className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">거래완료</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total_bands?.toLocaleString() || '0'}</p>
                    <div className="flex items-center mt-3">
                      <ArrowUpIcon className="w-4 h-4 text-emerald-500 mr-1" />
                      <span className="text-sm font-medium text-emerald-500">3.18%</span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <ChartBarIcon className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* 차트와 테이블 영역 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 매출 그래프 - 2/3 너비 */}
              <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">매물 거래량</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full mr-2"></span>
                      <span className="text-sm text-gray-600">2024</span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
                      <span className="text-sm text-gray-600">2023</span>
                    </div>
                  </div>
                </div>
                <div className="h-64">
                  <Line data={salesChartData} options={chartOptions} />
                </div>
              </div>

              {/* 실시간 인기 매물 - 1/3 너비 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">실시간 인기 매물</h3>
                <div className="space-y-3">
                  {recentBands.slice(0, 8).map((band, index) => (
                    <div key={band.user_id} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm font-semibold text-gray-400 w-6">{index + 1}</span>
                        <p className="text-sm font-medium text-gray-700 ml-3 truncate max-w-[150px]">
                          {band.store_name}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {band.order_count || 0} 건
                      </span>
                    </div>
                  ))}
                  {recentBands.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">데이터가 없습니다</p>
                  )}
                </div>
              </div>
            </div>

            {/* 페이지 분석 및 방문자 추이 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 페이지 분석 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">페이지 분석</h3>
                  <button className="text-sm text-gray-500 hover:text-gray-700">더보기</button>
                </div>
                <div className="space-y-4">
                  {recentOrders.slice(0, 5).map((order, index) => (
                    <div key={`page-${index}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">{order.product_name || '상품명'}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {((index + 1) * 1237).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-2 rounded-full"
                          style={{ width: `${100 - (index * 15)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                  {recentOrders.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">데이터가 없습니다</p>
                  )}
                </div>
              </div>

              {/* 방문자 추이 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">방문자 추이</h3>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">신규방문</button>
                    <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">재방문</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-6">
                  {['1일', '2일', '3일', '4일'].map((day, index) => (
                    <div key={day} className="text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-full bg-gray-100 rounded-lg h-32 relative mb-2">
                          <div 
                            className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-lg"
                            style={{ height: `${60 + (index * 10)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">{day}</span>
                        <span className="text-sm font-semibold text-gray-900 mt-1">
                          {(15 + (index * 3))}k
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}