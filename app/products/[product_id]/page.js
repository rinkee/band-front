"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/fetcher";

export default function ProductDetailPage({ params }) {
  const router = useRouter();
  const { product_id } = params;

  const [userData, setUserData] = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");

  // 사용자 인증 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");

        if (!sessionData) {
          // 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
          router.replace("/login");
          return;
        }

        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj);

        fetchProductDetail(userDataObj.userId, product_id);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError("사용자 인증 정보를 확인하는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };

    checkAuth();
  }, [router, product_id]);

  // 상품 상세 정보 가져오기
  const fetchProductDetail = async (userId, productId) => {
    try {
      setLoading(true);
      const response = await api.get(`/products/${productId}?userId=${userId}`);
      const productData = response.data.data;
      setProduct(productData);
      setBarcodeValue(productData.barcode || "");
      setLoading(false);
    } catch (error) {
      console.error("상품 상세 조회 오류:", error);
      setError("상품 정보를 불러오는데 실패했습니다.");
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  // 밴드 게시물 URL 열기
  const openBandPostUrl = () => {
    if (product?.band_post_url) {
      window.open(product.band_post_url, "_blank");
    }
  };

  // 금액 포맷팅 함수
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // 날짜 포맷팅 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    // 유효하지 않은 날짜 확인
    if (isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "판매중":
        return "bg-green-100 text-green-800";
      case "품절":
        return "bg-red-100 text-red-800";
      case "판매중지":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  // 바코드 저장 함수
  const saveBarcode = async () => {
    try {
      await api.patch(
        `/products/${product.product_id}?userId=${userData.userId}`,
        {
          barcode: barcodeValue,
        }
      );

      // 상품 정보 업데이트
      setProduct({
        ...product,
        barcode: barcodeValue,
      });

      setIsEditing(false);
    } catch (error) {
      console.error("바코드 저장 오류:", error);
      alert("바코드 저장에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl font-medium text-gray-700">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-red-600 mb-4">오류 발생</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="flex justify-between">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!userData || !product) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-48 bg-white border-r border-gray-200 z-10">
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="px-2 space-y-1">
            <li>
              <a
                href="/dashboard"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Home
              </a>
            </li>
            <li>
              <a
                href="/posts"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                  />
                </svg>
                게시물 관리
              </a>
            </li>
            <li>
              <a
                href="/products"
                className="flex items-center px-4 py-2 text-gray-900 bg-blue-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
                상품 관리
              </a>
            </li>
            <li>
              <a
                href="/orders"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                주문 관리
              </a>
            </li>
            <li>
              <a
                href="/customers"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                고객 관리
              </a>
            </li>
          </ul>
        </nav>
        <div className="p-4 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg
              className="w-5 h-5 mr-3 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            로그아웃
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col md:pl-48 w-full">
        {/* 상단 헤더 */}
        <header className="bg-white border-b border-gray-200 py-4 px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => router.push("/products")}
                className="mr-2 p-1 rounded-full hover:bg-gray-100"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">상품 상세</h1>
                <p className="text-sm text-gray-500">{product.title}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                {/* 상품 기본 정보 */}
                <div className="flex-1">
                  <div className="flex justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {product.title}
                    </h2>
                    <span
                      className={`px-3 py-1 inline-flex text-sm leading-5 font-medium rounded-full ${getStatusBadgeStyles(
                        product.status
                      )}`}
                    >
                      {product.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-sm text-gray-500">상품 번호</p>
                      <p className="text-lg font-medium">
                        {product.product_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">가격</p>
                      <p className="text-lg font-medium text-blue-600">
                        {formatCurrency(product.price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">재고 수량</p>
                      <p className="text-lg font-medium">
                        {product.quantity}개
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">판매량</p>
                      <p className="text-lg font-medium">
                        {product.total_order_quantity || 0}개
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">수정일</p>
                      <p className="text-base">
                        {formatDate(product.updated_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">생성일</p>
                      <p className="text-base">
                        {formatDate(product.created_at)}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">바코드</p>
                        {!isEditing && (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            수정
                          </button>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="flex mt-1">
                          <input
                            type="text"
                            value={barcodeValue}
                            onChange={(e) => setBarcodeValue(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="바코드 번호 입력"
                          />
                          <button
                            onClick={saveBarcode}
                            className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
                          >
                            저장
                          </button>
                        </div>
                      ) : (
                        <p className="text-lg font-medium">
                          {product.barcode || "-"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 밴드 원본 게시물 링크 */}
                  {product.band_post_url && (
                    <div className="mt-6">
                      <button
                        onClick={openBandPostUrl}
                        className="inline-flex items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <svg
                          className="w-5 h-5 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        밴드 원본 게시물 보기
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 상품 설명 */}
              {product.description && (
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-2">상품 설명</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {product.description}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 하단 버튼 영역 */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => router.push("/products")}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  목록으로 돌아가기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
