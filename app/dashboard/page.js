"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  useUser,
  useProducts,
  useOrders,
  useCustomers,
  useOrderStats,
} from "../hooks";

export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    customers: 0,
    totalSales: 0,
    recentActivity: [],
  });

  // 최근 주문 데이터
  const [recentOrders, setRecentOrders] = useState([]);

  // 최근 상품 데이터
  const [products, setProducts] = useState([]);

  // 컴포넌트 마운트 시 로컬 스토리지에서 userId 가져오기
  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  // SWR 옵션 (에러 발생 시 재시도 및 새로고침 간격 설정)
  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 30000, // 30초마다 자동으로 데이터 새로고침
    onError: (error) => {
      console.error("데이터 로딩 오류:", error);
    },
  };

  // 사용자 정보 가져오기
  const {
    data: user,
    isLoading: isUserLoading,
    isError: isUserError,
  } = useUser(userId, swrOptions);

  // 상품 데이터 가져오기 (첫 페이지만)
  const { data: productsData, error: productsError } = useProducts(
    userId,
    1,
    {},
    swrOptions
  );

  // 주문 데이터 가져오기 (첫 페이지만)
  const { data: ordersData, error: ordersError } = useOrders(
    userId,
    1,
    {},
    swrOptions
  );

  // 고객 데이터 가져오기 (첫 페이지만)
  // const { data: customersData, error: customersError } = useCustomers(
  //   userId,
  //   1,
  //   {},
  //   swrOptions
  // );

  // 주문 통계 가져오기 (월간)
  const { data: orderStatsData, error: orderStatsError } = useOrderStats(
    userId,
    "month",
    swrOptions
  );

  // 목업 데이터 생성 함수
  const createMockData = () => {
    // 목업 상품 데이터
    const mockProducts = Array.from({ length: 10 }, (_, index) => ({
      product_id: `prod_${index + 1}`,
      name: [
        "고기세트식당양념갈비",
        "대패삼겹살 1kg",
        "한돈 삼겹살 500g",
        "목심 스테이크 600g",
        "와규 등심 300g",
      ][index % 5],
      price: [15000, 12000, 18000, 25000, 35000][index % 5],
      stock: Math.floor(Math.random() * 100),
      status: ["판매중", "품절", "판매중지"][index % 3],
    }));

    // 목업 주문 데이터
    const mockOrders = Array.from({ length: 10 }, (_, index) => {
      const productIndex = index % 5;
      const product = {
        name: [
          "고기세트식당양념갈비",
          "대패삼겹살 1kg",
          "한돈 삼겹살 500g",
          "목심 스테이크 600g",
          "와규 등심 300g",
        ][productIndex],
        price: [15000, 12000, 18000, 25000, 35000][productIndex],
      };

      return {
        order_id: `ORD${(index + 1).toString().padStart(5, "0")}`,
        customer_name: `고객${(index % 10) + 1}`,
        products: [product],
        status: ["confirmed", "delivered", "pending"][index % 3],
        total_amount: product.price * (Math.floor(Math.random() * 3) + 1),
        comment: [
          "2개 주세요",
          "배송 빨리 해주세요. 급해요.",
          "3일 내로 받을 수 있을까요?",
          "선물용으로 포장 부탁드립니다.",
          "1kg 2개 주문합니다. 맛있게 포장해주세요.",
          "명절 선물용으로 예쁘게 포장 가능한가요? 진공포장 원합니다.",
          "오늘 주문하면 언제 배송 가능할까요?",
          "김포공항 근처인데 당일 배송 가능할까요?",
          "3만원 이상 무료배송 맞나요?",
          "2세트 주문합니다.",
        ][index % 10],
      };
    });

    // 목업 고객 데이터
    const mockCustomers = Array.from({ length: 10 }, (_, index) => ({
      customer_id: `cust_${index + 1}`,
      name: `고객${index + 1}`,
      phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(
        1000 + Math.random() * 9000
      )}`,
      orderCount: Math.floor(Math.random() * 10) + 1,
    }));

    // 목업 주문 통계 데이터
    const mockOrderStats = {
      totalSales: 1250000,
      orderCount: 45,
      averageOrderValue: 27778,
      recentActivity: Array.from({ length: 5 }, (_, index) => ({
        type: "order",
        customerName: `고객${(index % 10) + 1}`,
        productName: [
          "고기세트식당양념갈비",
          "대패삼겹살 1kg",
          "한돈 삼겹살 500g",
          "목심 스테이크 600g",
          "와규 등심 300g",
        ][index % 5],
        amount:
          [15000, 12000, 18000, 25000, 35000][index % 5] *
          (Math.floor(Math.random() * 3) + 1),
        timestamp: new Date(
          Date.now() - Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000
        ).toISOString(),
      })),
    };

    return {
      products: mockProducts,
      orders: mockOrders,
      customers: mockCustomers,
      orderStats: mockOrderStats,
    };
  };

  // 로딩 상태 확인
  const isLoading = isUserLoading || loading;

  // 에러 상태 확인
  const isError =
    isUserError ||
    productsError ||
    ordersError ||
    // customersError ||
    orderStatsError;

  // 데이터 가져오기
  useEffect(() => {
    if (!isLoading && userId) {
      // 실제 데이터 또는 목업 데이터 사용
      const mockData = createMockData();

      if (!productsData?.data || productsError) {
        setProducts(mockData.products);
      } else {
        setProducts(productsData.data);
      }

      if (!ordersData?.data || ordersError) {
        setRecentOrders(mockData.orders);
      } else {
        setRecentOrders(ordersData.data);
      }

      if (!orderStatsData?.data || orderStatsError) {
        setStats({
          products: mockData.products.length,
          orders: mockData.orders.length,
          customers: mockData.customers.length,
          totalSales: mockData.orderStats.totalSales,
          recentActivity: mockData.orderStats.recentActivity,
        });
      } else {
        setStats({
          products: productsData?.data?.length || 0,
          orders: ordersData?.data?.length || 0,
          customers: 0, // 고객 데이터가 없을 경우 0으로 설정
          totalSales: orderStatsData.data.totalSales || 0,
          recentActivity: orderStatsData.data.recentActivity || [],
        });
      }
    }
  }, [
    isLoading,
    userId,
    productsData,
    ordersData,
    orderStatsData,
    productsError,
    ordersError,
    orderStatsError,
  ]);

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
        setUserId(userDataObj.userId);
        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    router.replace("/login");
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
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // 주문 상태 텍스트 변환 함수
  function getOrderStatusText(status) {
    const statusMap = {
      pending: "대기 중",
      confirmed: "주문 확인",
      shipping: "배송 중",
      delivered: "배송 완료",
      canceled: "취소됨",
    };
    return statusMap[status] || status;
  }

  // 백엔드 서버에서 데이터 사용
  const displayProductsData = productsData;
  const displayOrdersData = ordersData;
  // const displayCustomersData = customersData;
  const displayOrderStatsData = orderStatsData;

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

  if (error || isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-red-600 mb-4">오류 발생</h2>
            <p className="text-gray-600 mb-6">
              {error || "데이터를 불러오는 중 오류가 발생했습니다."}
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-gray-700 mb-2">
                다음 사항을 확인해보세요:
              </h3>
              <ul className="list-disc pl-5 text-sm text-gray-600">
                <li className="mb-1">
                  백엔드 서버가 실행 중인지 확인 (http://localhost:8000)
                </li>
                <li className="mb-1">
                  API 엔드포인트가 올바르게 설정되어 있는지 확인
                </li>
                <li>네트워크 연결 상태를 확인</li>
              </ul>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return null;
  } // 유저 데이터 가져오기

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 - 미디움 사이즈 이상에서만 보임 */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-48 bg-white border-r border-gray-200 z-10">
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="px-2 space-y-1">
            <li>
              <a
                href="/dashboard"
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
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Home
              </a>
            </li>
            <li>
              <a
                href="/products"
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
        {/* 모바일 헤더 */}
        <header className="md:hidden bg-white border-b border-gray-200 py-4 px-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
          <button className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        {/* 상단 헤더 */}
        <header className="hidden md:block bg-white border-b border-gray-200 py-4 px-8 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">대시보드</h1>
              <p className="text-sm text-gray-500">
                안녕하세요,{" "}
                {userData.displayName || userData.ownerName || userData.loginId}
                님
              </p>
            </div>
            <div className="flex items-center space-x-4">
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
          {/* 사용자 정보 확인 (디버깅용) */}
          {user && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-bold mb-2">사용자 정보</h3>
              <p>밴드 ID: {user.band_id || "정보 없음"}</p>
              <p>네이버 ID: {user.naver_id || "정보 없음"}</p>
              <p>상점명: {user.store_name || "정보 없음"}</p>
            </div>
          )}

          {/* 인사말 */}
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">
              안녕하세요, {userData.ownerName || userData.loginId}님
            </h2>
            <p className="text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
          </div>

          {/* 주요 통계 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 상품
                </h3>
                <span className="text-blue-600">📦</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {displayProductsData?.data?.length || 0}개
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                {!displayProductsData?.data && "데이터 없음"}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 주문
                </h3>
                <span className="text-blue-600">🛒</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {displayOrdersData?.data?.length || 0}건
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                {!displayOrdersData?.data && "데이터 없음"}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 고객
                </h3>
                <span className="text-blue-600">👥</span>
              </div>
              {/* <p className="text-lg md:text-2xl font-bold">
                {displayCustomersData?.data?.length || 0}명
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                {!displayCustomersData?.data && "데이터 없음"}
              </p> */}
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 매출
                </h3>
                <span className="text-blue-600">💰</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {formatCurrency(displayOrderStatsData?.data?.totalSales || 0)}
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                {!displayOrderStatsData?.data && "데이터 없음"}
              </p>
            </div>
          </div>

          {/* 최근 주문 & 상품 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 최근 주문 */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">최근 주문</h3>
                <Link
                  href="/orders"
                  className="text-sm text-blue-600 hover:underline"
                >
                  전체보기
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                        고객
                      </th>
                      <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                        댓글
                      </th>

                      <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                        상품
                      </th>
                      <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                        금액
                      </th>
                      <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayOrdersData?.data?.length > 0 ? (
                      displayOrdersData.data.slice(0, 5).map((order) => (
                        <tr key={order.order_id} className="hover:bg-gray-50">
                          <td className="py-3 text-sm text-gray-500">
                            {order.customer_name || "알 수 없음"}
                          </td>
                          <td className="py-3 text-sm font-medium text-gray-900 truncate max-w-[150px]">
                            {order.comment?.length > 20
                              ? `${order.comment.substring(0, 20)}...`
                              : order.comment || ""}
                          </td>
                          <td className="py-3 text-sm text-gray-500">
                            {order.products?.length > 0
                              ? order.products[0].name +
                                (order.products.length > 1
                                  ? ` 외 ${order.products.length - 1}건`
                                  : "")
                              : "상품정보 없음"}
                          </td>
                          <td className="py-3 text-sm text-gray-900 font-medium">
                            {formatCurrency(order.total_amount || 0)}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                order.status === "confirmed"
                                  ? "bg-blue-100 text-blue-800"
                                  : order.status === "delivered"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {getOrderStatusText(order.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="5"
                          className="py-4 text-center text-gray-500"
                        >
                          주문 데이터가 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 상품 목록 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">상품 현황</h3>
                <Link
                  href="/products"
                  className="text-sm text-blue-600 hover:underline"
                >
                  전체보기
                </Link>
              </div>

              <div className="space-y-4">
                {displayProductsData?.data?.length > 0 ? (
                  displayProductsData.data.slice(0, 5).map((product) => (
                    <div
                      key={product.product_id}
                      className="flex items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          재고: {product.stock || "무제한"}개
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">
                          {formatCurrency(product.price || 0)}
                        </p>
                        <span
                          className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                            product.status === "판매중"
                              ? "bg-green-100 text-green-800"
                              : product.status === "품절"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {product.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-gray-500">
                    상품 데이터가 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 최근 활동 타임라인 */}
          <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6">최근 활동</h3>
            {displayOrderStatsData?.data?.recentActivity?.length > 0 ? (
              <div className="space-y-4">
                {displayOrderStatsData.data.recentActivity.map(
                  (activity, index) => (
                    <div key={index} className="flex items-start">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-4">
                        {activity.type === "order" ? "🛒" : "👤"}
                      </div>
                      <div>
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">
                            {activity.customerName}
                          </span>
                          님이
                          <span className="font-medium">
                            {" "}
                            {activity.productName}
                          </span>
                          을(를) 주문했습니다.
                        </p>
                        <div className="flex mt-1 text-xs text-gray-500">
                          <span>{formatCurrency(activity.amount)}</span>
                          <span className="mx-1">•</span>
                          <span>{formatDate(activity.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-10">
                최근 활동 데이터가 없습니다. 백엔드에서 데이터를 확인해주세요.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
