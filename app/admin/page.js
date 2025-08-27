'use client';

import { useState, useEffect } from 'react';
import AdminGuard from './components/AdminGuard';
import AdminLayout from './components/AdminLayout';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';
import { useAdminApi } from './hooks/useAdminApi';
import ErrorMessage from './components/ErrorMessage';
import RefreshButton from './components/RefreshButton';
import { 
  ChartBarIcon, 
  ShoppingCartIcon, 
  UsersIcon, 
  DocumentTextIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  FireIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

/**
 * 관리자 대시보드 메인 페이지
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentBands, setRecentBands] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
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
        fetchAdminApi('/api/admin/bands?limit=10&sortBy=last_post_at'),
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
          today_sales: 0,
          yesterday_orders: 0,
          yesterday_sales: 0,
          pending_orders: 0,
          inactive_bands: 0,
          new_users_today: 0,
          active_bands: 0,
          today_posts: 0
        });
      }

      // 밴드 데이터 처리
      if (bandsData.status === 'fulfilled') {
        setRecentBands(bandsData.value.bands || []);
      }

      // 주문 데이터 처리 및 인기 상품 추출
      if (ordersData.status === 'fulfilled') {
        setRecentOrders(ordersData.value.orders || []);
        
        // 주문 데이터에서 인기 상품 추출
        const productCounts = {};
        (ordersData.value.orders || []).forEach(order => {
          const productName = order.product_name || '상품명 없음';
          if (!productCounts[productName]) {
            productCounts[productName] = {
              name: productName,
              count: 0,
              total_amount: 0
            };
          }
          productCounts[productName].count += (order.quantity || 1);
          productCounts[productName].total_amount += (order.total_amount || 0);
        });
        
        const popular = Object.values(productCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setPopularProducts(popular);
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

  // 오늘의 통계 계산
  const todayStats = {
    todayOrders: stats?.today_orders || 0,
    todaySales: stats?.today_sales || 0,
    yesterdayOrders: stats?.yesterday_orders || 0,
    yesterdaySales: stats?.yesterday_sales || 0,
  };

  const calculateChange = (today, yesterday) => {
    if (!yesterday || yesterday === 0) return { value: 0, isIncrease: true };
    const change = ((today - yesterday) / yesterday * 100).toFixed(1);
    return { 
      value: Math.abs(change), 
      isIncrease: change >= 0 
    };
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
                    <p className="text-sm font-medium text-gray-500">오늘 주문</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{todayStats.todayOrders.toLocaleString()}</p>
                    <div className="flex items-center mt-3">
                      {calculateChange(todayStats.todayOrders, todayStats.yesterdayOrders).isIncrease ? (
                        <ArrowUpIcon className="w-4 h-4 text-emerald-500 mr-1" />
                      ) : (
                        <ArrowDownIcon className="w-4 h-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm font-medium ${
                        calculateChange(todayStats.todayOrders, todayStats.yesterdayOrders).isIncrease 
                          ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {calculateChange(todayStats.todayOrders, todayStats.yesterdayOrders).value}%
                      </span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <ShoppingCartIcon className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">오늘 매출</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {todayStats.todaySales >= 10000 
                        ? `${(todayStats.todaySales / 10000).toFixed(1)}만원`
                        : `${todayStats.todaySales.toLocaleString()}원`
                      }
                    </p>
                    <div className="flex items-center mt-3">
                      {calculateChange(todayStats.todaySales, todayStats.yesterdaySales).isIncrease ? (
                        <ArrowUpIcon className="w-4 h-4 text-emerald-500 mr-1" />
                      ) : (
                        <ArrowDownIcon className="w-4 h-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm font-medium ${
                        calculateChange(todayStats.todaySales, todayStats.yesterdaySales).isIncrease 
                          ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {calculateChange(todayStats.todaySales, todayStats.yesterdaySales).value}%
                      </span>
                      <span className="text-sm text-gray-400 ml-2">전일 대비</span>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <CurrencyDollarIcon className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">총 게시물</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total_posts?.toLocaleString() || '0'}</p>
                    <div className="flex items-center mt-3">
                      <span className="text-sm text-gray-500">오늘 {stats?.today_posts || 0}건 추가</span>
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
                    <p className="text-sm font-medium text-gray-500">활성 밴드</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.active_bands || stats?.total_bands || '0'}</p>
                    <div className="flex items-center mt-3">
                      <span className="text-sm text-gray-500">총 {stats?.total_users || 0}개 등록</span>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <ChartBarIcon className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* 주요 컨텐츠 영역 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 최근 주문 - 2/3 너비 */}
              <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">최근 주문 현황</h3>
                  <button className="text-sm text-gray-500 hover:text-gray-700">
                    전체보기
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 rounded-lg">
                      <tr>
                        <th className="px-4 py-3 text-left">시간</th>
                        <th className="px-4 py-3 text-left">고객명</th>
                        <th className="px-4 py-3 text-left">상품</th>
                        <th className="px-4 py-3 text-center">수량</th>
                        <th className="px-4 py-3 text-right">금액</th>
                        <th className="px-4 py-3 text-center">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentOrders.slice(0, 8).map((order, index) => (
                        <tr key={`order-${index}-${order.order_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(order.created_at).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">
                              {order.customer_name}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700 truncate max-w-[200px]">
                              {order.product_name}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-medium text-gray-900">
                              {order.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-gray-900">
                              {order.total_amount?.toLocaleString()}원
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                              완료
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {recentOrders.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-400 text-sm">최근 주문 내역이 없습니다</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 인기 상품 TOP 5 - 1/3 너비 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">인기 상품 TOP 5</h3>
                  <FireIcon className="w-5 h-5 text-orange-500" />
                </div>
                <div className="space-y-3">
                  {popularProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex items-center flex-1">
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          ${
                            index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-100 text-gray-700' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-50 text-gray-600'
                          }
                        `}>
                          {index + 1}
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {product.total_amount ? `${(product.total_amount / 10000).toFixed(1)}만원` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {product.count}건
                        </span>
                      </div>
                    </div>
                  ))}
                  {popularProducts.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-400 text-sm">주문 데이터가 없습니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 활성 밴드 및 주의 필요 사항 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 활성 밴드 현황 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">활성 밴드 현황</h3>
                  <ClockIcon className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-3">
                  {recentBands.slice(0, 5).map((band) => (
                    <div key={band.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{band.store_name}</p>
                        <p className="text-xs text-gray-500">
                          게시물 {band.post_count} | 주문 {band.order_count}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {band.last_post_at ? 
                            `${Math.floor((Date.now() - new Date(band.last_post_at)) / (1000 * 60 * 60))}시간 전` : 
                            '활동 없음'
                          }
                        </p>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full mt-1 ${
                          band.function_number === 1 ? 'bg-blue-100 text-blue-700' :
                          band.function_number === 2 ? 'bg-emerald-100 text-emerald-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          F#{band.function_number}
                        </span>
                      </div>
                    </div>
                  ))}
                  {recentBands.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-400 text-sm">활성 밴드가 없습니다</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 주의 필요 사항 */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">주의 필요 사항</h3>
                  <ExclamationCircleIcon className="w-5 h-5 text-amber-500" />
                </div>
                <div className="space-y-3">
                  {/* 미처리 주문 */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start">
                      <ExclamationCircleIcon className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">미처리 주문</p>
                        <p className="text-xs text-gray-600 mt-1">
                          24시간 이상 처리되지 않은 주문이 <span className="font-semibold">{stats?.pending_orders || 0}건</span> 있습니다
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 비활성 밴드 */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-start">
                      <ClockIcon className="w-5 h-5 text-gray-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">비활성 밴드</p>
                        <p className="text-xs text-gray-600 mt-1">
                          7일 이상 활동이 없는 밴드가 <span className="font-semibold">{stats?.inactive_bands || 0}개</span> 있습니다
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 신규 가입 */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start">
                      <UsersIcon className="w-5 h-5 text-emerald-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">오늘 신규 가입</p>
                        <p className="text-xs text-gray-600 mt-1">
                          오늘 <span className="font-semibold">{stats?.new_users_today || 0}명</span>의 새로운 사용자가 가입했습니다
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}