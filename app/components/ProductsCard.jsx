"use client";

export default function ProductsCard({ product }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
      <div className="aspect-w-16 aspect-h-9 bg-gray-200">
        {/* 이미지가 없을 경우 기본 이미지 표시 */}
        <div className="h-48 bg-gray-300 flex items-center justify-center">
          <span className="text-gray-600">이미지 없음</span>
        </div>
      </div>
      <div className="p-4">
        <h4 className="text-lg font-medium text-gray-900 mb-1">
          {product.title || "상품명 없음"}
        </h4>
        <p className="text-blue-600 font-bold mb-2">
          {formatCurrency(product.price || 0)}
        </p>
        <div className="flex justify-between text-sm text-gray-500 mb-3">
          <span>재고: {product.quantity || 0}개</span>
          <span>카테고리: {product.category || "기타"}</span>
        </div>
        <div className="flex space-x-2">
          <button className="flex-1 text-center py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
            주문 보기
          </button>
          <button className="flex-1 text-center py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            수정
          </button>
        </div>
      </div>
    </div>
  );
}
