"use client";

import { useState, useEffect } from "react";
import {
  X,
  Package,
  ShoppingCart,
  MessageCircle,
  TrendingUp,
  User,
  Clock,
  ChevronRight,
} from "lucide-react";

export default function PostDetailModal({ isOpen, onClose, postId, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("상품");

  useEffect(() => {
    if (isOpen && postId && userId) {
      fetchPostDetails();
    } else {
      // 모달이 닫힐 때 데이터 초기화
      setData(null);
      setActiveTab("상품");
    }
  }, [isOpen, postId, userId]);

  const fetchPostDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/posts/${postId}?userId=${userId}`);
      const result = await response.json();

      if (response.ok) {
        console.log("API Response:", result); // 디버깅용
        setData(result);
      } else {
        setError(result.error || "데이터를 불러오는데 실패했습니다.");
      }
    } catch (error) {
      console.error("Error fetching post details:", error);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPrice = (price) => {
    if (typeof price !== "number") return "0원";
    return `${price.toLocaleString()}원`;
  };

  const getStatusBadge = (status) => {
    const styles = {
      주문완료: "bg-green-100 text-green-800",
      입금대기: "bg-yellow-100 text-yellow-800",
      주문취소: "bg-red-100 text-red-800",
      배송중: "bg-blue-100 text-blue-800",
      배송완료: "bg-purple-100 text-purple-800",
      pending: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
      기본: "bg-gray-100 text-gray-800",
    };
    const style = styles[status] || styles["기본"];
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${style}`}>
        {status}
      </span>
    );
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-lg text-gray-600">데이터를 불러오는 중...</div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-red-600 p-4 bg-red-50 rounded-md">{error}</div>
        </div>
      );
    }
    if (!data) {
      return (
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-lg text-gray-600">데이터가 없습니다.</div>
        </div>
      );
    }

    const {
      post,
      products = [],
      orders = [],
      comments = [],
      statistics = {},
    } = data;

    return (
      <div className="flex-grow p-6">
        {/* 게시물 기본 정보 - 최소화 */}
        <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {post.title || "제목 없음"}
              </h3>
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span className="flex items-center">
                  <User size={12} className="mr-1" />
                  {post.author_name || "작성자 미상"}
                </span>
                <span className="flex items-center">
                  <Clock size={12} className="mr-1" />
                  {formatDate(post.posted_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 통계 요약 - 더 크게 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {[
            {
              label: "상품",
              value: statistics.total_products || 0,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "주문",
              value: statistics.total_orders || 0,
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "매출",
              value: formatPrice(statistics.total_revenue || 0),
              color: "text-purple-600",
              bg: "bg-purple-50",
            },
            {
              label: "댓글",
              value: statistics.total_comments || 0,
              color: "text-orange-600",
              bg: "bg-orange-50",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`text-center p-6 ${item.bg} rounded-xl border-2 border-gray-100`}
            >
              <div className={`text-3xl font-bold ${item.color} mb-1`}>
                {item.value}
              </div>
              <div className="text-sm font-medium text-gray-600">
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* 상품과 주문 비교 뷰 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* 상품 섹션 - 스티키 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden sticky top-6 self-start">
            <div className="bg-blue-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center">
                <Package size={18} className="mr-2 text-blue-600" />
                <h3 className="text-lg font-semibold text-blue-900">
                  상품 ({products.length})
                </h3>
              </div>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <ProductList products={products} formatPrice={formatPrice} />
            </div>
          </div>

          {/* 주문 섹션 - 스크롤 가능 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-green-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center">
                <ShoppingCart size={18} className="mr-2 text-green-600" />
                <h3 className="text-lg font-semibold text-green-900">
                  주문 ({orders.length})
                </h3>
              </div>
            </div>
            <div className="p-4">
              <OrderList
                orders={orders}
                formatPrice={formatPrice}
                formatDate={formatDate}
                getStatusBadge={getStatusBadge}
              />
            </div>
          </div>
        </div>

        {/* 댓글 섹션 (접을 수 있도록) */}
        {comments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-orange-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center">
                <MessageCircle size={18} className="mr-2 text-orange-600" />
                <h3 className="text-lg font-semibold text-orange-900">
                  댓글 ({comments.length})
                </h3>
              </div>
            </div>
            <div className="p-4 max-h-60 overflow-y-auto">
              <CommentList comments={comments} formatDate={formatDate} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-gray-50 rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-800">게시물 상세 정보</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full -mr-2"
          >
            <X size={20} />
          </button>
        </div>
        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-grow overflow-y-auto">{renderContent()}</div>
      </div>
    </div>
  );
}

function ProductList({ products, formatPrice }) {
  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        연관된 상품이 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {products.map((product, index) => (
        <div key={product.product_id} className="bg-gray-50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">
              상품 #{index + 1}
            </span>
            <span className="text-lg font-bold text-green-600">
              {formatPrice(product.total_revenue || 0)}
            </span>
          </div>
          <h4 className="font-semibold text-gray-900 text-base mb-3">
            {product.title}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">기본가격</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatPrice(product.base_price)}
                </span>
              </div>
              {product.quantity_text && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">수량단위</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {product.quantity_text}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">주문건수</span>
                <span className="text-sm font-semibold text-gray-900">
                  {product.total_orders || 0}건
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">상태</span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    product.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {product.status === "active" ? "판매중" : "판매종료"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderList({ orders, formatPrice, formatDate, getStatusBadge }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        연관된 주문이 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {orders.map((order, index) => (
        <div key={order.order_id} className="bg-gray-50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">
              주문 #{index + 1}
            </span>
            <div className="flex items-center space-x-3">
              {order.processing_method && (
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full ${
                    order.processing_method === "ai"
                      ? "bg-purple-100 text-purple-700"
                      : order.processing_method === "pattern"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {order.processing_method === "ai"
                    ? "AI 추출"
                    : order.processing_method === "pattern"
                    ? "패턴 추출"
                    : "수동 입력"}
                </span>
              )}
              {getStatusBadge(order.status)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">수량</span>
                <span className="text-sm font-semibold text-gray-900">
                  {order.quantity}개
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">단가</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatPrice(order.price_per_unit)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">총가격</span>
                <span className="text-lg font-bold text-blue-600">
                  {formatPrice(order.total_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">주문일</span>
                <span className="text-xs text-gray-500">
                  {formatDate(order.ordered_at)}
                </span>
              </div>
            </div>
          </div>

          {order.comment && (
            <div className="mt-3 p-3 bg-white rounded-lg">
              <div className="text-xs text-gray-500 mb-1">댓글</div>
              <div className="text-sm text-gray-700">"{order.comment}"</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CommentList({ comments, formatDate }) {
  if (!comments || comments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">댓글이 없습니다.</div>
    );
  }
  return (
    <ul className="space-y-4">
      {comments.map((comment, index) => (
        <li
          key={comment.comment_id || index}
          className="bg-white p-4 rounded-lg border border-gray-200"
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <img
                className="h-8 w-8 rounded-full"
                src={comment.author?.profile_image_url || "/default-avatar.png"}
                alt=""
              />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                {comment.author?.name || "익명"}
              </div>
              <p className="mt-1 text-sm text-gray-700">
                {comment.body || comment.content}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {formatDate(comment.created_at)}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
