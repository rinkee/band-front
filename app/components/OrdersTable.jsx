"use client";

import { useState } from "react";

// 밴드 특수 태그 처리 함수
const processBandTags = (text) => {
  if (!text) return text;

  let processedText = text;

  // <band:refer user_key="...">사용자명</band:refer> → @사용자명
  processedText = processedText.replace(
    /<band:refer\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:refer>/g,
    "@$1"
  );

  // <band:mention user_key="...">사용자명</band:mention> → @사용자명 (혹시 있다면)
  processedText = processedText.replace(
    /<band:mention\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:mention>/g,
    "@$1"
  );

  // 기타 밴드 태그들도 내용만 남기기
  processedText = processedText.replace(
    /<band:[^>]*>([^<]+)<\/band:[^>]*>/g,
    "$1"
  );

  // 자동 닫힘 밴드 태그 제거 (예: <band:something />)
  processedText = processedText.replace(/<band:[^>]*\/>/g, "");

  return processedText;
};

export default function OrdersTable({ orders = [], onOrderUpdate }) {
  const [editingOrder, setEditingOrder] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [availableProducts, setAvailableProducts] = useState({});

  // comment_key로 주문들을 그룹화
  const groupOrdersByComment = (orders) => {
    const grouped = {};
    
    orders.forEach(order => {
      const commentKey = order.comment_key || 'no-comment';
      
      if (!grouped[commentKey]) {
        grouped[commentKey] = {
          // 그룹의 대표 정보 (첫 번째 주문 기준)
          comment_key: commentKey,
          customer_name: order.customer_name,
          comment: order.comment,
          ordered_at: order.ordered_at,
          status: order.status,
          // 그룹에 속한 모든 주문들
          orders: []
        };
      }
      
      grouped[commentKey].orders.push(order);
    });
    
    return Object.values(grouped);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    // 유효하지 않은 날짜 확인
    if (isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const fetchProductsForPost = async (postId) => {
    if (availableProducts[postId]) {
      return availableProducts[postId];
    }

    try {
      const response = await fetch(`/api/posts/${postId}/products`);
      const result = await response.json();
      
      if (result.success) {
        setAvailableProducts(prev => ({
          ...prev,
          [postId]: result.data
        }));
        return result.data;
      }
    } catch (error) {
      console.error('상품 목록 조회 실패:', error);
    }
    
    return [];
  };

  const handleEditStart = async (order) => {
    setEditingOrder(order.order_id);
    setEditValues({
      product_id: order.product_id || '',
      product_name: order.product_name || '',
      quantity: order.quantity || 1
    });

    // 해당 게시물의 상품 목록 가져오기
    if (order.post_number) {
      await fetchProductsForPost(order.post_number);
    }
  };

  const handleEditCancel = () => {
    setEditingOrder(null);
    setEditValues({});
  };

  const handleEditSave = async (order) => {
    if (!onOrderUpdate) return;
    
    setSaving(true);
    try {
      await onOrderUpdate(order.order_id, editValues);
      setEditingOrder(null);
      setEditValues({});
    } catch (error) {
      console.error('주문 업데이트 실패:', error);
      alert('주문 정보 업데이트에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleProductSelect = (productId) => {
    const currentOrder = orders.find(order => order.order_id === editingOrder);
    const products = availableProducts[currentOrder?.post_number] || [];
    const selectedProduct = products.find(p => p.product_id === productId);
    
    if (selectedProduct) {
      setEditValues(prev => ({
        ...prev,
        product_id: productId,
        product_name: selectedProduct.title
      }));
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              고객명
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              상품명
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              고객 댓글
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              수량
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              금액
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              주문일시
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              상태
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              작업
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.length > 0 ? (
            groupOrdersByComment(orders).map((orderGroup) => {
              // 총 금액과 수량 계산
              const totalAmount = orderGroup.orders.reduce((sum, order) => sum + (order.price || 0), 0);
              const totalQuantity = orderGroup.orders.reduce((sum, order) => sum + (order.quantity || 0), 0);
              const firstOrder = orderGroup.orders[0]; // 첫 번째 주문을 대표로 사용
              const isEditing = editingOrder && orderGroup.orders.some(order => order.order_id === editingOrder);
              
              return (
                <tr key={orderGroup.comment_key} className="hover:bg-gray-50">
                  {/* 고객명 */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {orderGroup.customer_name}
                  </td>
                  
                  {/* 상품명 - 여러 상품 표시 */}
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {isEditing ? (
                      <select
                        value={editValues.product_id}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">상품을 선택하세요</option>
                        {(availableProducts[firstOrder.post_number] || []).map(product => (
                          <option key={product.product_id} value={product.product_id}>
                            {product.title}
                            {product.base_price && ` (₩${product.base_price.toLocaleString()})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-1">
                        {orderGroup.orders.map((order, index) => (
                          <div key={index} className="text-gray-900 font-medium">
                            {order.product_name || '상품명 없음'} 
                            <span className="text-gray-500 text-xs ml-2">× {order.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  
                  {/* 고객 댓글 */}
                  <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {processBandTags(orderGroup.comment)}
                  </td>
                  
                  {/* 총 수량 */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {isEditing ? (
                      <input
                        type="number"
                        min="1"
                        value={editValues.quantity}
                        onChange={(e) => handleInputChange('quantity', parseInt(e.target.value))}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      `${totalQuantity}개`
                    )}
                  </td>
                  
                  {/* 총 금액 */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(totalAmount)}
                  </td>
                  
                  {/* 주문일시 */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(orderGroup.ordered_at)}
                  </td>
                  
                  {/* 상태 */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full 
                      ${
                        orderGroup.status === "주문완료"
                          ? "bg-blue-100 text-blue-800"
                          : orderGroup.status === "수령완료"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {orderGroup.status || "주문완료"}
                    </span>
                  </td>
                  
                  {/* 작업 버튼 */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {isEditing ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditSave(firstOrder)}
                          disabled={saving}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                        >
                          {saving ? '저장중...' : '저장'}
                        </button>
                        <button
                          onClick={handleEditCancel}
                          disabled={saving}
                          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditStart(firstOrder)}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium"
                      >
                        수정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan="8"
                className="px-4 py-4 text-center text-sm text-gray-500"
              >
                주문 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
