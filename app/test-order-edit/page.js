"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import OrdersTable from '../components/OrdersTable';
import { useUser } from '../hooks';
import { api } from '../lib/fetcher';

export default function TestOrderEdit() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 테스트를 위해 임시 데이터 사용
    loadMockData();
  }, []);

  const loadMockData = async () => {
    setLoading(true);
    
    // 테스트용 임시 데이터
    const mockOrders = [
      {
        order_id: "test_order_1",
        customer_name: "김철수",
        product_id: "product_1",
        product_name: "레몬 1봉지",
        post_number: "post_123",
        comment: "1봉지 주문합니다",
        quantity: 1,
        total_amount: 4900,
        ordered_at: "2025-08-15T11:33:00Z",
        status: "주문완료"
      },
      {
        order_id: "test_order_2", 
        customer_name: "이영희",
        product_id: "product_2",
        product_name: "레몬 2봉지",
        post_number: "post_123",
        comment: "1봉지요",
        quantity: 1,
        total_amount: 8900,
        ordered_at: "2025-08-15T11:28:00Z",
        status: "주문완료"
      },
      {
        order_id: "test_order_3",
        customer_name: "박민수",
        product_id: "product_5",
        product_name: "사과 1박스",
        post_number: "post_456",
        comment: "2박스 주문해요",
        quantity: 2,
        total_amount: 24000,
        ordered_at: "2025-08-15T10:15:00Z",
        status: "수령완료"
      }
    ];

    // 실제 API 호출을 시뮬레이션
    setTimeout(() => {
      setOrders(mockOrders);
      setLoading(false);
    }, 1000);
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // 최근 20개 주문만 가져오기 (테스트용)
      const response = await api.get(`/api/orders?limit=20&user_id=${user.user_id}`);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      setOrders(response.data || []);
    } catch (err) {
      console.error('주문 데이터 로딩 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Mock API 설정
  useEffect(() => {
    // Mock fetch API for products
    const originalFetch = window.fetch;
    window.fetch = (url, options) => {
      if (url.includes('/api/posts/') && url.includes('/products')) {
        const postId = url.split('/')[3]; // /api/posts/post_123/products에서 post_123 추출
        
        let mockProducts = [];
        if (postId === 'post_123') {
          mockProducts = [
            { product_id: 'product_1', title: '레몬 1봉지', base_price: 4900 },
            { product_id: 'product_2', title: '레몬 2봉지', base_price: 8900 },
            { product_id: 'product_3', title: '레몬 3봉지', base_price: 12900 },
          ];
        } else if (postId === 'post_456') {
          mockProducts = [
            { product_id: 'product_4', title: '사과 1박스', base_price: 12000 },
            { product_id: 'product_5', title: '사과 2박스', base_price: 22000 },
            { product_id: 'product_6', title: '사과 3박스', base_price: 32000 },
          ];
        }
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: mockProducts
          })
        });
      }
      
      return originalFetch(url, options);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleOrderUpdate = async (orderId, updateData) => {
    try {
      // 테스트용 - 실제 API 호출 대신 로컬 상태만 업데이트
      console.log('주문 업데이트:', orderId, updateData);
      
      // API 호출을 시뮬레이션 (1초 지연)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 로컬 상태 업데이트
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.order_id === orderId 
            ? { ...order, ...updateData }
            : order
        )
      );

      alert('주문 정보가 성공적으로 업데이트되었습니다.');
      
    } catch (error) {
      console.error('주문 업데이트 에러:', error);
      throw error; // OrdersTable에서 에러 처리
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">에러가 발생했습니다: {error}</p>
          <button
            onClick={fetchOrders}
            className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">주문 편집 테스트</h1>
          <p className="mt-2 text-gray-600">
            상품명과 수량을 직접 수정할 수 있는 기능을 테스트합니다.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              주문 목록 ({orders.length}개)
            </h2>
          </div>
          
          <div className="p-6">
            <OrdersTable 
              orders={orders} 
              onOrderUpdate={handleOrderUpdate}
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/orders')}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
          >
            메인 주문 페이지로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}