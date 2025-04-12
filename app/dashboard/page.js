"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import {
  useUser,
  useProducts,
  useOrders,
  useOrderStats,
  // useUserMutations, // 필요시 활성화
} from "../hooks";

// --- 아이콘 (Heroicons 추천) ---
import {
  ClockIcon,
  CheckCircleIcon, // 'Done' 상태
  XCircleIcon, // 'Cancelled' 상태
  ExclamationCircleIcon, // 'Pending/Error' 상태 or 확인필요
  ArrowPathIcon,
  ChartPieIcon, // 통계 아이콘 예시
  CurrencyDollarIcon, // 매출 아이콘 예시
  ShoppingCartIcon,
  TagIcon,
  ArrowUpRightIcon,
  UserCircleIcon,
  MagnifyingGlassIcon, // 검색 아이콘
  PlusIcon, // 추가 아이콘
  AdjustmentsHorizontalIcon, // 필터 아이콘
  CalendarDaysIcon, // 날짜 아이콘
  ArrowLongRightIcon, // 다음 페이지 아이콘
  ArrowLongLeftIcon, // 이전 페이지 아이콘
  SparklesIcon, // 'In Progress' 또는 특별 상태
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

// --- 상태 배지 (라이트 테마) ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "수령완료": // Done
    case "판매중":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "주문취소": // Cancelled
    case "품절":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIcon;
      break;
    case "주문완료": // In Progress or Pending
    case "확인필요":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-600";
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
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
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
      className={`bg-white rounded-xl shadow-lg border border-gray-300 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("today");

  // --- 상태 및 SWR 훅 ---
  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    expectedSales: 0,
    completedSales: 0,
  });
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlingStatus, setCrawlingStatus] = useState("");
  const [crawlingError, setCrawlingError] = useState(null);
  const { mutate } = useSWRConfig();

  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err) => {
      // 에러 처리 로직
    },
  };

  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    const sessionData = sessionStorage.getItem("userData");
    if (storedUserId) {
      setUserId(storedUserId);
      if (sessionData) setUserData(JSON.parse(sessionData));
      setInitialLoading(false);
    } else if (sessionData) {
      try {
        const d = JSON.parse(sessionData);
        setUserData(d);
        setUserId(d.userId);
        localStorage.setItem("userId", d.userId);
        setInitialLoading(false);
      } catch (e) {
        handleLogout();
      }
    } else {
      router.replace("/login");
    }
  }, [router]);

  const {
    data: user,
    isLoading: isUserLoading,
    error: userError,
  } = useUser(userId, swrOptions);
  const {
    data: productsData,
    isLoading: isProductsLoading,
    error: productsError,
  } = useProducts(userId, 1, { limit: 5, status: "판매중" }, swrOptions);
  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useOrders(userId, 1, { limit: 5 }, swrOptions);
  const {
    data: orderStatsData,
    isLoading: isOrderStatsLoading,
    error: orderStatsError,
    mutate: orderStatsMutate,
  } = useOrderStats(userId, dateRange, null, null, swrOptions);

  const combinedError =
    error || userError || productsError || ordersError || orderStatsError;

  useEffect(() => {
    if (orderStatsData?.data) {
      setStats({
        totalOrders: orderStatsData.data.totalOrders || 0,
        completedOrders: orderStatsData.data.completedOrders || 0,
        pendingOrders: orderStatsData.data.pendingOrders || 0,
        expectedSales: orderStatsData.data.estimatedRevenue || 0,
        completedSales: orderStatsData.data.confirmedRevenue || 0,
      });
    }
  }, [orderStatsData]);

  useEffect(() => {
    if (userId) orderStatsMutate();
  }, [dateRange, userId, orderStatsMutate]);

  // --- 헬퍼 함수 ---
  const timeAgo = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    const secs = Math.round((new Date().getTime() - d.getTime()) / 1000);
    if (secs < 60) return `${secs}초 전`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  };

  const formatFullDateTime = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
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
    // 1. 숫자 타입이 아니면 "0원" 반환 (기존 ₩0 대신)
    if (typeof amount !== "number") {
      return "0원";
    }

    // 2. 숫자 포맷팅 옵션 설정
    const options = {
      // style: "currency" 와 currency: "KRW" 제거
      maximumFractionDigits: 0, // 소수점 이하 자릿수 없음 (유지)
    };

    // 3. compact 옵션이 true일 경우 notation 추가 (유지)
    if (compact) {
      options.notation = "compact";
      // compact 표기 시 소수점 자리가 필요할 수 있으므로 maximumFractionDigits를
      // 상황에 따라 조절하거나, 아래처럼 significant digits를 사용할 수도 있습니다.
      // 예: options.maximumSignificantDigits = 3;
    }

    // 4. Intl.NumberFormat으로 숫자 부분만 포맷
    // 'ko-KR' 로케일은 숫자 그룹 구분(,)과 compact 표기(만, 억 등)에 여전히 중요
    const formattedNumber = new Intl.NumberFormat("ko-KR", options).format(
      amount
    );

    // 5. 포맷된 숫자 뒤에 "원"을 붙여서 반환
    return `${formattedNumber}원`;
  };

  // --- 이벤트 핸들러 ---
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleStartCrawling = async () => {
    // API 호출 로직
  };

  // --- 로딩 및 에러 UI (라이트 테마) ---
  if (initialLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner className="h-10 w-10" color="text-gray-500" />
      </div>
    );
  if (combinedError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            데이터 로딩에 실패했습니다. 네트워크 연결을 확인하거나 잠시 후 다시
            시도하세요.
          </p>
          <p className="text-xs text-red-500 bg-red-100 p-3 rounded-lg mb-6">
            {combinedError.message || String(combinedError)}
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

  // --- 메인 대시보드 UI (라이트 테마) ---
  return (
    <div className="min-h-screen  text-gray-900 bg-gray-100">
      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto ">
        {/* 통계 헤더 및 기간 필터 */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">통계 요약</h1>
          <div className="flex items-center bg-gray-100 border border-gray-300 rounded-lg p-1 space-x-1">
            <button
              onClick={() => setDateRange("today")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                dateRange === "today"
                  ? "bg-gray-300 text-gray-900"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="hidden sm:inline">오늘</span>
              <span className="sm:hidden">1D</span>
            </button>
            <button
              onClick={() => setDateRange("7days")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                dateRange === "7days"
                  ? "bg-gray-300 text-gray-900"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="hidden sm:inline">1주</span>
              <span className="sm:hidden">7D</span>
            </button>
            <button
              onClick={() => setDateRange("30days")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                dateRange === "30days"
                  ? "bg-gray-300 text-gray-900"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="hidden sm:inline">1개월</span>
              <span className="sm:hidden">1M</span>
            </button>
            <button
              onClick={() => setDateRange("90days")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                dateRange === "90days"
                  ? "bg-gray-300 text-gray-900"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="hidden sm:inline">3개월</span>
              <span className="sm:hidden">3M</span>
            </button>
          </div>
        </div>

        {/* 통계 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative">
          {isOrderStatsLoading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl z-10">
              <LoadingSpinner color="text-gray-500" />
            </div>
          )}
          {/* 주 통계 (확정 매출) - 중요 지표에 오렌지 포인트 */}
          <LightCard
            className="md:col-span-1 flex flex-col justify-center items-center text-center"
            padding="py-8 px-6"
          >
            <dt className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wider">
              확정 매출
            </dt>
            <dd className="text-5xl font-bold tracking-tight text-orange-400">
              {formatCurrency(stats.completedSales)}
            </dd>
          </LightCard>
          {/* 보조 통계 */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <LightCard>
              <dt className="text-sm font-medium text-gray-600 truncate">
                예상 매출
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {formatCurrency(stats.expectedSales)}
              </dd>
            </LightCard>
            <LightCard>
              <dt className="text-sm font-medium text-gray-600 truncate">
                총 주문 (완료)
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {stats.completedOrders}
                <span className="text-lg text-gray-600 ml-1">건</span>
              </dd>
            </LightCard>
            <LightCard>
              <dt className="text-sm font-medium text-gray-600 truncate">
                총 주문 (전체)
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {stats.totalOrders}
                <span className="text-lg text-gray-600 ml-1">건</span>
              </dd>
            </LightCard>
            <LightCard>
              <dt className="text-sm font-medium text-gray-600 truncate">
                미수령 주문
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {stats.pendingOrders}
                <span className="text-lg text-gray-600 ml-1">건</span>
              </dd>
            </LightCard>
          </div>
        </div>

        {/* 최근 주문 테이블 */}
        <LightCard className="mb-8" padding="p-0">
          <div className="p-4 sm:p-6 border-b border-gray-300 flex flex-wrap justify-between items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ShoppingCartIcon className="w-5 h-5 text-gray-600" />
              최근 주문
              {isOrdersLoading && <LoadingSpinner className="h-4 w-4 ml-2" />}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href="/orders"
                className="text-xs font-medium text-grey-500 hover:text-grey-600 flex items-center gap-1"
              >
                전체보기 <ArrowUpRightIcon className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-gray-300">
                <tr>
                  <th
                    scope="col"
                    className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-gray-600 sm:pl-6 uppercase"
                  >
                    고객
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase"
                  >
                    댓글 요약
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase"
                  >
                    금액
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase"
                  >
                    상태
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase"
                  >
                    주문 시간
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ordersData?.data?.length > 0 ? (
                  ordersData.data.map((order) => (
                    <tr
                      key={order.order_id}
                      className="hover:bg-gray-100 transition-colors"
                    >
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {order.customer_name || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-700 truncate max-w-xs">
                        {order.comment || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                        {formatCurrency(order.total_amount || 0)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <StatusBadge status={order.status} />
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-4 text-sm text-gray-700"
                        title={formatFullDateTime(order.created_at)}
                      >
                        {timeAgo(order.created_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-6 py-10 text-center text-sm text-gray-600"
                    >
                      {isOrdersLoading ? "로딩 중..." : "최근 주문이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </LightCard>

        {/* 최근 상품 목록 */}
        <LightCard padding="p-0">
          <div className="p-4 sm:p-6 border-b border-gray-300 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-gray-600" />
              판매중 상품 현황
              {isProductsLoading && <LoadingSpinner className="h-4 w-4 ml-2" />}
            </h2>
            <Link
              href="/products"
              className="text-xs font-medium text-grey-500 hover:text-grey-600 flex items-center gap-1"
            >
              전체보기 <ArrowUpRightIcon className="w-3 h-3" />
            </Link>
          </div>
          <ul className="divide-y divide-gray-200">
            {productsData?.data?.length > 0 ? (
              productsData.data.map((product) => (
                <li
                  key={product.product_id}
                  className="px-4 sm:px-6 py-3 flex justify-between items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.title}
                    </p>
                    <p className="text-xs text-gray-700">
                      {formatCurrency(product.base_price || 0)}
                    </p>
                  </div>
                  <StatusBadge status={product.status} />
                </li>
              ))
            ) : (
              <li className="px-6 py-10 text-center text-sm text-gray-600">
                {isProductsLoading ? "로딩 중..." : "판매중인 상품이 없습니다."}
              </li>
            )}
          </ul>
        </LightCard>
      </main>
    </div>
  );
}
