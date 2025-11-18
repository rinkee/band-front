"use client";

import { useState, useEffect } from "react";
import supabase from "../lib/supabaseClient";

// 밴드 특수 태그 처리 함수
const processBandTags = (text) => {
  if (!text) return text;

  let processedText = text;

  // <band:refer user_key="...">사용자명</band:refer> → @사용자명
  processedText = processedText.replace(
    /<band:refer\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:refer>/g,
    "@$1"
  );

  // <band:mention user_key="...">사용자명</band:mention> → @사용자명
  processedText = processedText.replace(
    /<band:mention\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:mention>/g,
    "@$1"
  );

  // 기타 밴드 태그들도 내용만 남기기
  processedText = processedText.replace(
    /<band:[^>]*>([^<]+)<\/band:[^>]*>/g,
    "$1"
  );

  // 자동 닫힘 밴드 태그 제거
  processedText = processedText.replace(/<band:[^>]*\/>/g, "");

  return processedText;
};

export default function OrdersInfoCard({ bandKey, postKey, userId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bandKey || !postKey || !userId) return;

    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("*")
          .eq("band_key", bandKey)
          .eq("post_key", postKey)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;

        setOrders(data || []);
      } catch (err) {
        console.error("주문 정보 조회 오류:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [bandKey, postKey, userId]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getStatusBadge = (status) => {
    const badges = {
      "주문완료": { color: "bg-blue-100 text-blue-700" },
      "주문대기": { color: "bg-gray-100 text-gray-700" },
      "주문확인": { color: "bg-blue-100 text-blue-700" },
      "배송중": { color: "bg-purple-100 text-purple-700" },
      "수령완료": { color: "bg-green-100 text-green-700" },
      "주문취소": { color: "bg-red-100 text-red-700" },
    };

    const badge = badges[status] || { color: "bg-gray-100 text-gray-700" };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
        {status || "N/A"}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 h-full">
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 h-full">
        <div className="flex items-center justify-center h-32">
          <div className="text-red-500 text-sm">오류: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 h-full flex flex-col">
      {/* 헤더 */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            댓글 정보
          </h3>
          <span className="text-xs text-gray-500">
            {orders.length > 2 ? `최근 2개 / 총 ${orders.length}개` : `총 ${orders.length}개`}
          </span>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-4">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">댓글이 없습니다</div>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 2).map((order, index) => (
              <div
                key={order.order_id || index}
                className="rounded-lg pb-1 hover:bg-gray-50 transition-colors"
              >
                {/* 주문자 정보 */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-gray-800">
                        {order.customer_name || "이름 없음"}
                      </span>
                    </div>
                    {order.customer_phone && (
                      <div className="text-xs text-gray-500">
                        {order.customer_phone}
                      </div>
                    )}
                  </div>
                  <div>
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                {/* 상품 정보 */}
                {order.product_name && (
                  <div className="text-sm text-gray-700 mb-1">
                    {order.product_name}
                    {order.quantity && (
                      <span className="text-gray-500"> × {order.quantity}</span>
                    )}
                  </div>
                )}

                {/* comment 필드 */}
                {order.comment && (
                  <div className="text-xs text-gray-600 bg-blue-50 rounded p-2 mt-1 mb-1 overflow-hidden whitespace-nowrap text-ellipsis">
                    {processBandTags(order.comment)}
                  </div>
                )}

                {/* 댓글 내용 (comment_body) */}
                {order.comment_body && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-1 overflow-hidden whitespace-nowrap text-ellipsis">
                    {processBandTags(order.comment_body)}
                  </div>
                )}

                {/* 시간 정보 */}
                <div className="flex justify-end mt-1">
                  <span className="text-xs text-gray-400">
                    {formatDate(order.created_at)}
                  </span>
                </div>

                {/* 총액 */}
                {order.total_price && (
                  <div className="text-sm font-medium text-blue-600 mt-2">
                    {new Intl.NumberFormat("ko-KR", {
                      style: "currency",
                      currency: "KRW",
                      maximumFractionDigits: 0,
                    }).format(order.total_price)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
