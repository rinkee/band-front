'use client';

import { useState, useEffect } from 'react';
import AdminGuard from './components/AdminGuard';
import AdminLayout from './components/AdminLayout';
import StatsCards from './components/StatsCards';
import { LoadingSpinner } from '@/app/components/LoadingSpinner';
import { useAdminApi } from './hooks/useAdminApi';

/**
 * 관리자 대시보드 메인 페이지
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentBands, setRecentBands] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { fetchAdminApi } = useAdminApi();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // 통계 데이터 가져오기
      try {
        const statsData = await fetchAdminApi('/api/admin/stats');
        console.log('Stats data received:', statsData);
        setStats(statsData);
      } catch (err) {
        console.error('Stats fetch error:', err);
      }

      // 최근 활동 밴드 가져오기
      try {
        const bandsData = await fetchAdminApi('/api/admin/bands?limit=5&sortBy=last_post_at');
        console.log('Bands data received:', bandsData);
        setRecentBands(bandsData.bands || []);
      } catch (err) {
        console.error('Bands fetch error:', err);
      }

      // 최근 주문 가져오기
      try {
        const ordersData = await fetchAdminApi('/api/admin/orders?limit=10');
        console.log('Orders data received:', ordersData);
        setRecentOrders(ordersData.orders || []);
      } catch (err) {
        console.error('Orders fetch error:', err);
      }
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 통계 카드 */}
            <StatsCards stats={stats} />

            {/* 그리드 레이아웃 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 최근 활동 밴드 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  최근 활동 밴드
                </h3>
                <div className="space-y-3">
                  {recentBands.length > 0 ? (
                    recentBands.map((band) => (
                      <div key={band.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium text-gray-900">{band.store_name}</p>
                          <p className="text-sm text-gray-500">
                            게시물: {band.post_count} | 주문: {band.order_count}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {band.last_post_at ? new Date(band.last_post_at).toLocaleDateString() : '-'}
                          </p>
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            band.function_number === 1 ? 'bg-blue-100 text-blue-800' :
                            band.function_number === 2 ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            Function #{band.function_number}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">활동 중인 밴드가 없습니다</p>
                  )}
                </div>
              </div>

              {/* 최근 주문 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  최근 주문
                </h3>
                <div className="space-y-3">
                  {recentOrders.length > 0 ? (
                    recentOrders.map((order, index) => (
                      <div key={`order-${index}-${order.order_id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {order.customer_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {order.product_name} x {order.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900 text-sm">
                            {order.total_amount?.toLocaleString()}원
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(order.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">최근 주문이 없습니다</p>
                  )}
                </div>
              </div>
            </div>

            {/* Function Number 분산 현황 */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Function Number 부하 분산
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((num) => {
                  const activeCount = recentBands.filter(b => b.function_number === num).length;
                  return (
                    <div key={num} className="text-center p-4 bg-gray-50 rounded">
                      <p className="text-2xl font-bold text-gray-900">#{num}</p>
                      <p className="text-sm text-gray-500">활성: {activeCount}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}