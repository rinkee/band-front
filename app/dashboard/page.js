"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { useProducts, useOrders, useOrderStats } from "../hooks"; // Assuming these hooks fetch data correctly

// --- 아이콘 ---
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  TagIcon,
  ArrowUpRightIcon,
  XCircleIcon as XCircleIconOutline,
  SparklesIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
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
  // ⚠️ Ensure these status strings EXACTLY match your DB 'orders.status' column values
  switch (status) {
    case "수령완료": // Example status
    case "판매중": // For products
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "주문취소": // Example status
    case "품절": // For products
    case "판매중지": // For products
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIcon;
      break;
    case "주문완료": // Example status
    case "확인필요": // Example status
    case "미수령": // Example status (Make sure this matches the status counted as 'pendingOrders')
      bgColor = "bg-orange-100"; // Changed color for distinction
      textColor = "text-orange-600";
      Icon = ClockIcon; // Use clock for pending/unreceived
      break;
    // Add other potential statuses like '결제완료', '배송중' if needed
    case "결제완료":
      bgColor = "bg-blue-100";
      textColor = "text-blue-600";
      Icon = SparklesIcon;
      break;
    default: // Fallback for unknown or null status
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
      {status || "알 수 없음"}{" "}
      {/* Display '알 수 없음' if status is null/undefined */}
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
  );
}

// --- Main Dashboard Page Component ---
export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null); // For component-specific errors, if needed
  const [dateRange, setDateRange] = useState("30days"); // Default range
  const [userData, setUserData] = useState(null); // Store user data from session
  const [customDateRange, setCustomDateRange] = useState({
    startDate: "",
    endDate: "",
    isActive: false,
  }); // Custom date range state
  const [showDatePicker, setShowDatePicker] = useState(false); // Show/hide date picker
  const [showMoreFilters, setShowMoreFilters] = useState(false); // Show/hide more filters
  const [selectedMonth, setSelectedMonth] = useState(0); // 0: 이번달, -1: 저번달, null: 직접입력
  const [includeUnreceived, setIncludeUnreceived] = useState(false); // 미수령 포함 여부

  // Initialize state with keys matching the FINAL API response (camelCase)
  // aa
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    estimatedRevenue: 0,
    confirmedRevenue: 0,
  });

  const { mutate } = useSWRConfig();
  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute
    onError: (err, key) => {
      // Log SWR errors with the key
      console.error(`SWR Error for key ${key}:`, err);
      // Optionally update UI or log to a service
      // setError(err.message || "데이터 로딩 중 오류가 발생했습니다."); // Be careful setting state here
    },
    keepPreviousData: true, // Show stale data while revalidating
  };

  // 초기값을 이번달로 설정
  useEffect(() => {
    setMonthlyRange(0); // 컴포넌트 마운트 시 이번달로 설정
  }, []);

  // Authentication check useEffect
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
            setUserId(currentUserId);
            if (storedUserId !== currentUserId) {
              localStorage.setItem("userId", currentUserId);
            }
            setInitialLoading(false);
            // console.log("Session data loaded, userId set:", currentUserId);
          } else {
            throw new Error("Invalid session data structure");
          }
        } catch (e) {
          console.error("Session parse error or invalid data:", e);
          handleLogout(); // Log out if session data is invalid
        }
      } else if (storedUserId) {
        console.warn(
          "Session data missing, using localStorage userId:",
          storedUserId
        );
        setUserId(storedUserId);
        setInitialLoading(false);
      } else {
        console.log("No user ID found, redirecting to login.");
        router.replace("/login");
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // Include handleLogout if it's defined outside and used inside

  // SWR Hooks for fetching data
  const {
    data: productsData, // API response shape: { data: [], pagination: {} }
    isLoading: isProductsLoading,
    error: productsError,
  } = useProducts(userId, 1, { limit: 5, status: "판매중" }, swrOptions);

  const {
    data: ordersData, // API response shape: { data: [], pagination: {} }
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useOrders(userId, 1, { limit: 5 }, swrOptions); // Fetch recent 5 orders

  const {
    data: orderStatsData,
    isLoading: isOrderStatsLoading,
    error: orderStatsError,
    mutate: orderStatsMutate,
  } = useOrderStats(
    userId,
    {
      dateRange: customDateRange.isActive ? "custom" : dateRange,
      startDate: customDateRange.isActive
        ? customDateRange.startDate
        : undefined,
      endDate: customDateRange.isActive ? customDateRange.endDate : undefined,
      includeUnreceived, // 미수령 포함 여부 추가
    }, // 커스텀 날짜 범위 지원
    swrOptions
  );

  // Combined loading/error state
  const isDataLoading =
    initialLoading ||
    isProductsLoading ||
    isOrdersLoading ||
    isOrderStatsLoading;
  const combinedError =
    error || productsError || ordersError || orderStatsError; // Combine SWR errors

  // Update local 'stats' state when 'orderStatsData' from SWR changes
  useEffect(() => {
    const statsFromApi = orderStatsData; // 클라이언트 버전은 직접 데이터 반환

    if (statsFromApi && typeof statsFromApi === "object") {
      // console.log("Updating stats from API:", statsFromApi); // Good for debugging
      setStats({
        totalOrders: statsFromApi.totalOrders ?? 0, // Use nullish coalescing for safety
        completedOrders: statsFromApi.completedOrders ?? 0,
        pendingOrders: statsFromApi.pendingOrders ?? 0, // Use the camelCase key from API
        estimatedRevenue: statsFromApi.estimatedRevenue ?? 0,
        confirmedRevenue: statsFromApi.confirmedRevenue ?? 0,
      });
    } else if (orderStatsData !== undefined && !isOrderStatsLoading) {
      // If data fetch finished but API returned invalid structure or no data object
      // console.warn("Stats API did not return a valid data object. Resetting stats.");
      setStats({
        // Reset to zeros
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        estimatedRevenue: 0,
        confirmedRevenue: 0,
      });
    }
  }, [orderStatsData, isOrderStatsLoading]); // Rerun when data or loading state changes

  // Re-fetch stats data when dateRange, customDateRange or userId changes
  useEffect(() => {
    if (userId && !initialLoading) {
      // Ensure userId is set and initial load is done
      // console.log(`Date range or userId changed, revalidating stats for ${userId}...`);
      orderStatsMutate(); // Tell SWR to re-fetch the stats
    }
  }, [
    dateRange,
    customDateRange,
    userId,
    includeUnreceived,
    orderStatsMutate,
    initialLoading,
  ]);

  // Helper Functions
  const timeAgo = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    const seconds = Math.round((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.round(hours / 24);
    return `${days}일 전`; // Show days for older entries
    // return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  };

  const formatFullDateTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // Use 24-hour format for clarity
    });
  };

  const formatCurrency = (amount) => {
    const num = Number(amount); // Ensure it's a number
    if (isNaN(num)) {
      return "0원";
    }
    // Use compact notation for very large numbers if needed, otherwise standard formatting
    const options = {
      style: "currency",
      currency: "KRW", // Specify currency explicitly
      maximumFractionDigits: 0, // No decimals
    };
    return new Intl.NumberFormat("ko-KR", options).format(num);
  };

  // 이번달, 저번달 버튼을 위한 함수
  const getCurrentMonthLabel = () => {
    const now = new Date();
    return `${now.getMonth() + 1}월`;
  };

  const getPreviousMonthLabel = () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prevMonth.getMonth() + 1}월`;
  };

  // 월별 날짜 범위 설정 함수
  const setMonthlyRange = (monthOffset = 0) => {
    const now = new Date();
    const targetDate = new Date(
      now.getFullYear(),
      now.getMonth() + monthOffset,
      1
    );

    const startDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      1
    );

    const endDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0
    );

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    setCustomDateRange({
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      isActive: true,
    });
    setDateRange("custom");
    setSelectedMonth(monthOffset);
    setShowDatePicker(false);
  };

  // 날짜 범위를 텍스트로 포맷하는 함수
  const getDateRangeText = () => {
    if (selectedMonth !== null && customDateRange.isActive) {
      const start = new Date(customDateRange.startDate);
      const end = new Date(customDateRange.endDate);
      return `${start.getMonth() + 1}/${start.getDate()} ~ ${
        end.getMonth() + 1
      }/${end.getDate()}`;
    }
    return "직접입력";
  };

  // 직접 날짜 입력 처리 함수
  const handleCustomDateSubmit = () => {
    if (customDateRange.startDate && customDateRange.endDate) {
      setCustomDateRange((prev) => ({ ...prev, isActive: true }));
      setDateRange("custom");
      setSelectedMonth(null); // 직접입력 모드
      setShowDatePicker(false);
    }
  };

  // 커스텀 날짜 범위 초기화 함수 - 이번달로 설정
  const resetCustomDateRange = () => {
    setMonthlyRange(0); // 이번달로 설정
  };

  // Event Handlers
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    setUserId(null); // Clear local state
    setUserData(null);
    // Optionally clear SWR cache if needed: mutate(() => true, undefined, { revalidate: false });
    router.replace("/login");
  };

  // --- Loading UI ---
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
        <p className="ml-3 text-gray-600">대시보드 로딩 중...</p>
      </div>
    );
  }

  // --- Error UI ---
  // Display a general error if any SWR hook fails
  if (combinedError && !isDataLoading) {
    // Show error only if not actively loading
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해
            주세요.
          </p>
          {/* Display specific error message for debugging */}
          <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg mb-6 font-mono break-all">
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
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-5">
      {/* Top Loading Bar */}
      {isDataLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-orange-100 z-50 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-400 to-orange-600 animate-progress-bar"
            style={{
              width: "100%", // Simple pulse or use a more complex animation
              animation: `progress-bar-animation 1.5s linear infinite`,
            }}
          ></div>
        </div>
      )}
      {/* Add CSS for progress-bar-animation if needed */}
      <style jsx global>{`
        @keyframes progress-bar-animation {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-progress-bar {
          animation: progress-bar-animation 1.5s linear infinite;
        }
      `}</style>

      <main className="max-w-7xl mx-auto">
        {/* Header and Date Filter */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* 통합 날짜 필터 카드 */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 space-x-1 shadow-sm">
              {/* 저번달 버튼 */}
              <button
                onClick={() => {
                  setMonthlyRange(-1);
                  setShowMoreFilters(false);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  selectedMonth === -1
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                disabled={isOrderStatsLoading}
              >
                {getPreviousMonthLabel()}
              </button>

              {/* 이번달 버튼 */}
              <button
                onClick={() => {
                  setMonthlyRange(0);
                  setShowMoreFilters(false);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  selectedMonth === 0
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                disabled={isOrderStatsLoading}
              >
                {getCurrentMonthLabel()}
              </button>

              {/* 직접 입력 버튼 */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowDatePicker(!showDatePicker);
                    setShowMoreFilters(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    selectedMonth === null && customDateRange.isActive
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  disabled={isOrderStatsLoading}
                >
                  <CalendarDaysIcon className="w-4 h-4" />
                  {getDateRangeText()}
                  <ChevronDownIcon
                    className={`w-3 h-3 transition-transform ${
                      showDatePicker ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* 날짜 선택 드롭다운 */}
                {showDatePicker && (
                  <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 min-w-[280px]">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          시작일
                        </label>
                        <input
                          type="date"
                          value={customDateRange.startDate}
                          onChange={(e) =>
                            setCustomDateRange((prev) => ({
                              ...prev,
                              startDate: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          종료일
                        </label>
                        <input
                          type="date"
                          value={customDateRange.endDate}
                          onChange={(e) =>
                            setCustomDateRange((prev) => ({
                              ...prev,
                              endDate: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleCustomDateSubmit}
                          disabled={
                            !customDateRange.startDate ||
                            !customDateRange.endDate
                          }
                          className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                        >
                          적용
                        </button>
                        <button
                          onClick={() => setShowDatePicker(false)}
                          className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* 초기화 버튼 */}
              {customDateRange.isActive && (
                <button
                  onClick={resetCustomDateRange}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition"
                >
                  ✕ 초기화
                </button>
              )}
            </div>

            {/* 더보기 필터 버튼 */}
            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              더보기
              <ChevronRightIcon
                className={`w-3 h-3 transition-transform ${
                  showMoreFilters ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* 더보기 필터들 */}
            {showMoreFilters && (
              <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 space-x-1 shadow-sm">
                {[
                  { v: "90days", l: "3개월" },
                  { v: "30days", l: "1개월" },
                  { v: "7days", l: "1주" },
                  { v: "today", l: "오늘" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => {
                      setDateRange(opt.v);
                      setCustomDateRange({
                        startDate: "",
                        endDate: "",
                        isActive: false,
                      });
                      setSelectedMonth(null);
                      setShowDatePicker(false);
                      // setShowMoreFilters(false);
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                      dateRange === opt.v && !customDateRange.isActive
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                    disabled={isOrderStatsLoading}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative">
          {/* Loading Overlay for Stats Section */}
          {isOrderStatsLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-xl z-10 -m-1">
              <LoadingSpinner className="h-6 w-6" color="text-gray-500" />
            </div>
          )}

          {/* Estimated Revenue */}
          <LightCard className="md:col-span-1" padding="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <dt className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                예상 매출
              </dt>
              <ChartPieIcon className="w-5 h-5 text-gray-400" />
            </div>
            <dd className="mt-1 text-3xl font-bold text-blue-600">
              {formatCurrency(stats.estimatedRevenue)}
            </dd>
            {/* 미수령 포함/제외 스위치 */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">미수령 포함</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeUnreceived}
                  onChange={(e) => setIncludeUnreceived(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </LightCard>

          {/* Sub-grid for Total/Pending */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Total Orders */}
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  총 주문 (취소 제외)
                </dt>
                <ShoppingCartIcon className="w-5 h-5 text-gray-400" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.totalOrders}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
            {/* Pending Orders */}
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  미수령 주문
                </dt>
                <ClockIcon className="w-5 h-5 text-orange-500" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.pendingOrders}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
          </div>

          {/* Confirmed Revenue */}
          <LightCard className="md:col-span-1" padding="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <dt className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                확정 매출
              </dt>
              <CurrencyDollarIcon className="w-5 h-5 text-gray-400" />
            </div>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-green-600">
              {formatCurrency(stats.confirmedRevenue)}
            </dd>
          </LightCard>

          {/* Sub-grid for Completed/Last Update */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Completed Orders */}
            <LightCard padding="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  수령 완료
                </dt>
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                {stats.completedOrders}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </dd>
            </LightCard>
          </div>
        </div>

        {/* Recent Activity Grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Recent Orders Table */}
          <LightCard className="lg:col-span-1" padding="p-0">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ShoppingCartIcon className="w-5 h-5 text-gray-500" /> 최근 주문
                {isOrdersLoading && <LoadingSpinner className="h-4 w-4 ml-1" />}
              </h2>
              <Link
                href="/orders"
                className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                전체보기 <ArrowUpRightIcon className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider sm:pl-6"
                    >
                      고객
                    </th>
                    {/* Removed 'Comment' column header */}
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      주문ID
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      금액
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      상태
                    </th>
                    <th
                      scope="col"
                      className="py-3 pl-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider sm:pr-6"
                    >
                      주문 시간
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {/* Conditional Rendering for Orders */}
                  {isOrdersLoading && !ordersData?.data ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-10 text-center text-gray-500"
                      >
                        <LoadingSpinner className="h-5 w-5 mx-auto" />
                      </td>
                    </tr>
                  ) : ordersData?.data?.length > 0 ? (
                    ordersData.data.map((order) => (
                      <tr
                        key={order.order_id}
                        className="hover:bg-gray-50 transition-colors text-sm"
                      >
                        <td className="whitespace-nowrap py-3 pl-4 pr-3 font-medium text-gray-900 sm:pl-6">
                          {order.customer_name || "-"}
                        </td>
                        {/* Removed 'Comment' cell */}
                        <td
                          className="whitespace-nowrap px-3 py-3 text-gray-500 font-mono"
                          title={order.order_id}
                        >
                          {order.order_id?.substring(0, 8)}...{" "}
                          {/* Show partial ID */}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-800">
                          {formatCurrency(order.total_amount)}{" "}
                          {/* Already handles non-numbers */}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                        <td
                          className="whitespace-nowrap py-3 pl-3 pr-4 text-gray-600 sm:pr-6"
                          title={formatFullDateTime(
                            order.ordered_at || order.created_at
                          )}
                        >
                          {timeAgo(order.ordered_at || order.created_at)}{" "}
                          {/* Use ordered_at first */}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-10 text-center text-sm text-gray-500 italic"
                      >
                        최근 주문 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </LightCard>

          {/* Selling Products List */}
          <LightCard className="lg:col-span-1" padding="p-0">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex justify-between items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-gray-500" /> 판매중 상품 현황
                {isProductsLoading && (
                  <LoadingSpinner className="h-4 w-4 ml-1" />
                )}
              </h2>
              <Link
                href="/products"
                className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                전체보기 <ArrowUpRightIcon className="w-3 h-3" />
              </Link>
            </div>
            <ul className="divide-y divide-gray-200">
              {/* Conditional Rendering for Products */}
              {isProductsLoading && !productsData?.data ? (
                <li className="px-6 py-10 text-center text-gray-500">
                  <LoadingSpinner className="h-5 w-5 mx-auto" />
                </li>
              ) : productsData?.data?.length > 0 ? (
                productsData.data.map((product) => (
                  <li
                    key={product.product_id}
                    className="px-4 sm:px-6 py-3 flex justify-between items-center gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium text-gray-900 truncate"
                        title={product.title}
                      >
                        {product.title || "이름 없음"}
                      </p>
                      <p className="text-xs text-gray-700">
                        {formatCurrency(product.base_price)}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <StatusBadge status={product.status} />
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-6 py-10 text-center text-sm text-gray-500 italic">
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
