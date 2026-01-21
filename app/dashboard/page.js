"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTopCommentPosts } from "../hooks"; // Assuming these hooks fetch data correctly
import { getPostPrimaryImageUrl } from "../lib/postImageUtils";

// --- 아이콘 ---
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
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
    posts: topCommentPosts,
    error: topCommentPostsError,
    isLoading: isTopCommentPostsLoading,
    isLoadingMore: isTopCommentPostsLoadingMore,
    isReachingEnd: isTopCommentPostsReachingEnd,
    loadMore: loadMoreTopCommentPosts,
  } = useTopCommentPosts(userId, {
    dateRange: customDateRange.isActive ? "custom" : dateRange,
    startDate: customDateRange.isActive ? customDateRange.startDate : undefined,
    endDate: customDateRange.isActive ? customDateRange.endDate : undefined,
    limit: 10,
  });

  // Combined loading/error state
  const isDataLoading =
    initialLoading || isTopCommentPostsLoading;

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

  const getTopPostsRangeLabel = () => {
    if (
      customDateRange.isActive &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      const start = new Date(customDateRange.startDate);
      const end = new Date(customDateRange.endDate);
      return `${start.getMonth() + 1}/${start.getDate()} ~ ${
        end.getMonth() + 1
      }/${end.getDate()}`;
    }
    const labels = {
      today: "오늘",
      "7days": "최근 7일",
      "30days": "최근 30일",
      "90days": "최근 90일",
    };
    return labels[dateRange] || "최근";
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
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
            )}
          </div>
        </div>

        {/* Popular Products */}
        <section className="mb-8">
          <LightCard className="p-0 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  인기상품
                </h2>
                <p className="text-xs text-gray-500">
                  {getTopPostsRangeLabel()} 기준 댓글 많은 상품
                </p>
              </div>
              <button
                onClick={loadMoreTopCommentPosts}
                disabled={
                  isTopCommentPostsLoadingMore || isTopCommentPostsReachingEnd
                }
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isTopCommentPostsLoadingMore
                  ? "불러오는 중..."
                  : isTopCommentPostsReachingEnd
                  ? "모두 불러옴"
                  : "더보기"}
              </button>
            </div>
            <div className="p-4 sm:p-6">
              {topCommentPostsError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  인기상품 데이터를 불러오지 못했습니다. 잠시 후 다시
                  시도해주세요.
                </div>
              )}
              {isTopCommentPostsLoading && topCommentPosts.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-gray-500">
                  <LoadingSpinner className="h-6 w-6" />
                </div>
              ) : topCommentPosts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {topCommentPosts.map((post) => {
                    const imageUrl = getPostPrimaryImageUrl(post, {
                      thumbnail: "w300",
                    });
                    return (
                      <div
                        key={post.post_key || post.post_id}
                        className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="relative h-36 bg-gray-100">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={post.title || "인기상품 이미지"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 bg-gradient-to-br from-gray-100 to-gray-200">
                              이미지 없음
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                            {post.title || "제목 없음"}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                            <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
                            댓글 {post.comment_count || 0}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-gray-500">
                  인기상품 데이터가 없습니다.
                </div>
              )}
            </div>
          </LightCard>
        </section>

        <div className="grid grid-cols-1">
          <div className="space-y-4" />
        </div>
      </main>
    </div>
  );
}
