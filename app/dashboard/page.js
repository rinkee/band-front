"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import { useUser, useProducts, useOrders, useOrderStats } from "../hooks";

// --- 아이콘 (Heroicons 추천) ---
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  TagIcon,
  ArrowUpRightIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  AdjustmentsHorizontalIcon,
  CalendarDaysIcon,
  ArrowLongRightIcon,
  ArrowLongLeftIcon,
  SparklesIcon,
  PowerIcon,
  XMarkIcon as XMarkIconOutline,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 (라이트 테마) ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  return (
    <svg
      className={`animate-spin ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      {" "}
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>{" "}
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>{" "}
    </svg>
  );
}

// --- 상태 배지 (라이트 테마) ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "수령완료":
    case "판매중":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "주문취소":
    case "품절":
    case "판매중지":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIcon;
      break; // 판매중지 추가
    case "주문완료":
    case "확인필요":
      bgColor = "bg-blue-100";
      textColor = "text-blue-600";
      Icon = SparklesIcon;
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-500";
      Icon = ExclamationCircleIcon;
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

// --- 라이트 테마 카드 컴포넌트 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  ); // 테두리 색상 연하게
}

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("30days");
  const [userData, setUserData] = useState(null); // 세션에서 가져온 유저 데이터 저장
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    expectedSales: 0,
    completedSales: 0,
  });
  // Crawling 관련 상태는 제거 (필요시 다시 추가)
  const { mutate } = useSWRConfig();

  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err) => {
      console.error(
        "SWR Error:",
        err
      ); /* setError(err.message || "데이터 로딩 오류"); */
    },
    keepPreviousData: true,
  };

  useEffect(() => {
    const checkAuth = () => {
      const storedUserId = localStorage.getItem("userId");
      const sessionData = sessionStorage.getItem("userData");
      let currentUserId = null;

      if (sessionData) {
        try {
          const d = JSON.parse(sessionData);
          if (d?.userId) {
            setUserData(d);
            currentUserId = d.userId;
            setUserId(currentUserId); // userId 상태 설정
            // 로컬 스토리지 동기화 (선택적)
            if (storedUserId !== currentUserId) {
              localStorage.setItem("userId", currentUserId);
            }
            setInitialLoading(false);
            console.log("Session data loaded, userId set:", currentUserId);
          } else {
            throw new Error("Invalid session data");
          }
        } catch (e) {
          console.error("Session parse error:", e);
          handleLogout();
        }
      } else if (storedUserId) {
        console.warn(
          "Session data missing, using localStorage userId:",
          storedUserId
        );
        setUserId(storedUserId); // 로컬 스토리지 값으로 우선 설정
        setInitialLoading(false);
        // 세션 데이터가 없으므로 userData는 null일 수 있음
      } else {
        console.log("No user ID found, redirecting to login.");
        router.replace("/login");
      }
    };
    checkAuth();
  }, [router]);

  // SWR 훅 호출 (userId가 설정된 후에 실행됨)
  const {
    data: user,
    isLoading: isUserLoading,
    error: userError,
  } = useUser(userId, swrOptions);
  const {
    data: productsData,
    isLoading: isProductsLoading,
    error: productsError,
  } = useProducts(userId, 1, { limit: 5, status: "판매중" }, swrOptions); // 판매중 상품만 5개
  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useOrders(userId, 1, { limit: 5 }, swrOptions); // 최근 주문 5개
  const {
    data: orderStatsData,
    isLoading: isOrderStatsLoading,
    error: orderStatsError,
    mutate: orderStatsMutate,
  } = useOrderStats(userId, dateRange, null, null, swrOptions);

  // 데이터 로딩 상태 통합
  const isDataLoading =
    initialLoading ||
    isUserLoading ||
    isProductsLoading ||
    isOrdersLoading ||
    isOrderStatsLoading;
  // 에러 상태 통합
  const combinedError =
    error || userError || productsError || ordersError || orderStatsError;

  // 통계 데이터 상태 업데이트
  useEffect(() => {
    if (orderStatsData?.data) {
      setStats({
        totalOrders: orderStatsData.data.totalOrders || 0,
        completedOrders: orderStatsData.data.completedOrders || 0,
        pendingOrders: orderStatsData.data.pendingOrders || 0,
        expectedSales: orderStatsData.data.estimatedRevenue || 0, // 필드명 확인 필요
        completedSales: orderStatsData.data.confirmedRevenue || 0, // 필드명 확인 필요
      });
    }
  }, [orderStatsData]);

  // 기간 변경 시 통계 데이터 다시 가져오기
  useEffect(() => {
    if (userId) orderStatsMutate();
  }, [dateRange, userId, orderStatsMutate]);

  // --- 헬퍼 함수 ---
  const timeAgo = (ds) => {
    if (!ds) return "-";
    const dt = new Date(ds);
    if (isNaN(dt.getTime())) return "-";
    const secs = Math.round((new Date().getTime() - dt.getTime()) / 1000);
    if (secs < 60) return `${secs}초 전`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return dt.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  };
  const formatFullDateTime = (ds) => {
    if (!ds) return "-";
    const d = new Date(ds);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };
  const formatCurrency = (amount, compact = false) => {
    if (typeof amount !== "number") {
      return "0원";
    }
    const options = { maximumFractionDigits: 0 };
    if (compact) {
      options.notation = "compact";
    }
    const formattedNumber = new Intl.NumberFormat("ko-KR", options).format(
      amount
    );
    return `${formattedNumber}원`;
  };

  // --- 이벤트 핸들러 ---
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  // const handleStartCrawling = async () => { /* 크롤링 시작 로직 */ };

  // --- 로딩 및 에러 UI ---
  if (initialLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
        <p className="ml-3 text-gray-600">대시보드 로딩 중...</p>
      </div>
    );
  if (combinedError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {combinedError.message || "데이터 로딩 중 오류가 발생했습니다."}
          </p>
          <p className="text-xs text-red-500 bg-red-100 p-3 rounded-lg mb-6">
            {" "}
            {combinedError.message || String(combinedError)}{" "}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  if (!userId)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">사용자 정보를 로드할 수 없습니다.</p>
      </div>
    ); // userId가 없는 경우 처리

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {" "}
      {/* 페이지 패딩 추가 */}
      {/* 백그라운드 로딩 표시 */}
      {isDataLoading && !initialLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-orange-100 z-50">
          {" "}
          <div
            className="h-full bg-orange-500 animate-pulse-fast"
            style={{
              animation: `pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
            }}
          ></div>{" "}
        </div>
      )}
      <main className="max-w-7xl mx-auto">
        {/* 통계 헤더 및 기간 필터 */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>{" "}
          {/* 폰트 굵게 */}
          <div
            className="flex items-center bg-white border border-gray-300 rounded-lg p-1 space-x-1 
          "
          >
            {" "}
            {/* 버튼 그룹 스타일 */}
            {[
              { v: "90days", l: "3개월" },
              { v: "30days", l: "1개월" },
              { v: "7days", l: "1주" },
              { v: "today", l: "오늘" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setDateRange(opt.v)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  dateRange === opt.v
                    ? "bg-orange-500 text-white "
                    : "text-gray-600 hover:bg-gray-100"
                }`} // 활성 스타일 변경
                disabled={isOrderStatsLoading} // 통계 로딩 중 비활성화
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* --- 통계 카드 그리드 (레이아웃 변경) --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative">
          {isOrderStatsLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-xl z-10 -m-1">
              <LoadingSpinner color="text-gray-500" />
            </div>
          )}

          {/* --- 1행: 예상 매출 (크게) / 완료 건수 / 미수령 건수 --- */}
          {/* 예상 매출 카드 (크게 표시) */}
          <LightCard className="md:col-span-1 " padding="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <dt className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                예상 매출
              </dt>
              <ChartPieIcon className="w-5 h-5 text-gray-400" />
            </div>
            <dd className="mt-1 text-3xl font-bold text-blue-500">
              {" "}
              {/* 색상/크기 조정 */}
              {formatCurrency(stats.expectedSales)}
            </dd>
          </LightCard>

          {/* 주문 완료 / 미수령 카드 (나란히 배치) */}

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  총 주문 (전체)
                </dt>
                <ShoppingCartIcon className="w-5 h-5 text-gray-400" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.totalOrders}
                <span className="text-base text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  미수령 주문
                </dt>
                <ClockIcon className="w-5 h-5 text-red-500" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.pendingOrders}
                <span className="text-base text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
          </div>

          {/* --- 2행: 확정 매출 / 총 주문 / 마지막 업데이트 --- */}
          {/* 확정 매출 카드 (작게 표시) */}
          <LightCard className="md:col-span-1  " padding="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <dt className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                확정 매출
              </dt>
              <CurrencyDollarIcon className="w-5 h-5 text-gray-400" />
            </div>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-orange-500">
              {" "}
              {/* 크기 조정 */}
              {formatCurrency(stats.completedSales)}
            </dd>
          </LightCard>

          {/* 총 주문 / 마지막 업데이트 시간 카드 (나란히 배치) */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {" "}
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  주문 완료
                </dt>
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.completedOrders}
                <span className="text-base text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
            {/* 마지막 업데이트 시간 카드 */}
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  최근 업데이트
                </dt>
                <ClockIcon className="w-5 h-5 text-gray-400" />
              </div>
              <dd
                className="mt-1 text-xl font-semibold tracking-tight text-gray-900"
                title={user ? formatFullDateTime(user.last_crawl_at) : ""}
              >
                {" "}
                {/* 상세 시간 툴팁 */}
                {user?.last_crawl_at ? timeAgo(user.last_crawl_at) : "-"}{" "}
                {/* useUser 훅 데이터 사용 */}
                {isUserLoading && (
                  <LoadingSpinner className="inline-block ml-2 h-4 w-4" />
                )}
              </dd>
            </LightCard>
          </div>
        </div>

        {/* 최근 주문 및 상품 목록 (2열 그리드) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* 최근 주문 테이블 */}
          <LightCard className="lg:col-span-1" padding="p-0">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2">
              {" "}
              {/* 패딩 조정 */}
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {" "}
                <ShoppingCartIcon className="w-5 h-5 text-gray-500" /> 최근 주문{" "}
                {isOrdersLoading && <LoadingSpinner className="h-4 w-4 ml-1" />}{" "}
              </h2>
              <Link
                href="/orders"
                className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                {" "}
                전체보기 <ArrowUpRightIcon className="w-3 h-3" />{" "}
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  {" "}
                  {/* thead 배경색 추가 */}
                  <tr>
                    <th
                      scope="col"
                      className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-600 sm:pl-6 uppercase"
                    >
                      고객
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase"
                    >
                      댓글 요약
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase"
                    >
                      금액
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase"
                    >
                      상태
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase pr-4 sm:pr-6"
                    >
                      주문 시간
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {isOrdersLoading && !ordersData?.data ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-10 text-center">
                        <LoadingSpinner className="h-5 w-5 mx-auto" />
                      </td>
                    </tr>
                  ) : ordersData?.data?.length > 0 ? (
                    ordersData.data.map((order) => (
                      <tr
                        key={order.order_id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {" "}
                        <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                          {order.customer_name || "-"}
                        </td>{" "}
                        <td className="px-3 py-3 text-sm text-gray-700 truncate max-w-xs">
                          {order.comment || "-"}
                        </td>{" "}
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-800">
                          {formatCurrency(order.total_amount || 0)}
                        </td>{" "}
                        <td className="whitespace-nowrap px-3 py-3 text-sm">
                          <StatusBadge status={order.status} />
                        </td>{" "}
                        <td
                          className="whitespace-nowrap px-3 py-3 text-sm text-gray-600 pr-4 sm:pr-6"
                          title={formatFullDateTime(order.created_at)}
                        >
                          {timeAgo(order.created_at)}
                        </td>{" "}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-10 text-center text-sm text-gray-500"
                      >
                        최근 주문이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </LightCard>

          {/* 판매중 상품 현황 */}
          <LightCard className="lg:col-span-1" padding="p-0">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex justify-between items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {" "}
                <TagIcon className="w-5 h-5 text-gray-500" /> 판매중 상품 현황{" "}
                {isProductsLoading && (
                  <LoadingSpinner className="h-4 w-4 ml-1" />
                )}{" "}
              </h2>
              <Link
                href="/products"
                className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                {" "}
                전체보기 <ArrowUpRightIcon className="w-3 h-3" />{" "}
              </Link>
            </div>
            <ul className="divide-y divide-gray-200">
              {isProductsLoading && !productsData?.data ? (
                <li className="px-6 py-10 text-center">
                  <LoadingSpinner className="h-5 w-5 mx-auto" />
                </li>
              ) : productsData?.data?.length > 0 ? (
                productsData.data.map((product) => (
                  <li
                    key={product.product_id}
                    className="px-4 sm:px-6 py-3 flex justify-between items-center gap-3 hover:bg-gray-50 transition-colors"
                  >
                    {" "}
                    <div className="flex-1 min-w-0">
                      {" "}
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {product.title}
                      </p>{" "}
                      <p className="text-xs text-gray-700">
                        {formatCurrency(product.base_price || 0)}
                      </p>{" "}
                    </div>{" "}
                    <StatusBadge status={product.status} />{" "}
                  </li>
                ))
              ) : (
                <li className="px-6 py-10 text-center text-sm text-gray-500">
                  판매중인 상품이 없습니다.
                </li>
              )}
            </ul>
          </LightCard>
        </div>
      </main>
    </div>
  );
}
