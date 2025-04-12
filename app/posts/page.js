"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePosts } from "../hooks"; // 훅 경로 확인 필요
import PostCard from "../components/PostCard"; // PostCard 컴포넌트 경로 확인 필요
import { api } from "../lib/fetcher"; // 필요시 사용 (현재 코드에서는 미사용)

// --- 아이콘 (Heroicons) ---
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon, // Logout icon
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  SparklesIcon,
  ExclamationCircleIcon, // Status Icons
  DocumentTextIcon,
  InboxIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 (DashboardPage 스타일) ---
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

// --- 상태 배지 (DashboardPage 스타일) ---
// PostsPage에서는 사용되지 않지만, PostCard 컴포넌트에서 사용할 수 있으므로 유지합니다.
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  // '활성', '비활성' 상태에 대한 스타일 정의
  switch (status) {
    case "활성": // 판매중과 유사하게 처리
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "비활성": // 품절과 유사하게 처리
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIconOutline;
      break;
    default: // 기본 회색 스타일
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

// --- 카드 래퍼 (DashboardPage 스타일) ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-lg border border-gray-300 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export default function PostsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true); // 초기 로딩 상태
  const [error, setError] = useState(null);
  const [posts, setPosts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("posted_at"); // 기본 정렬 필드
  const [sortOrder, setSortOrder] = useState("desc"); // 기본 정렬 순서
  const [filterStatus, setFilterStatus] = useState("all"); // 기본 필터 상태

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12); // 페이지당 게시물 수 조정 (예: 12개)

  // SWR 옵션
  const swrOptions = {
    revalidateOnFocus: false, // 포커스 시 자동 재검증 비활성화
    revalidateOnReconnect: true,
    dedupingInterval: 60000, // 1분간 중복 요청 방지
    onError: (error) => {
      console.error("SWR 데이터 로딩 오류:", error);
      setError(error.message || "데이터 로딩 중 오류 발생"); // SWR 에러도 error 상태에 반영
    },
  };

  // 사용자 인증 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        // bandNumber가 없으면 기본값 또는 다른 처리 필요
        if (!userDataObj.bandNumber) {
          console.warn("세션 데이터에 bandNumber가 없습니다.");
          // 예: 기본 밴드 번호 설정 또는 에러 처리
          // setError("밴드 정보를 찾을 수 없습니다.");
          // setInitialLoading(false);
          // return;
        }
        setUserData(userDataObj);
        setInitialLoading(false);
      } catch (e) {
        console.error("인증 처리 오류:", e);
        setError("인증 처리 중 오류가 발생했습니다.");
        setInitialLoading(false);
        handleLogout(); // 에러 시 로그아웃
      }
    };
    checkAuth();
  }, [router]);

  // 게시물 데이터 가져오기
  const { data: postsData, error: postsError } = usePosts(
    userData?.bandNumber, // bandNumber가 있을 때만 요청
    currentPage,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
      limit: itemsPerPage, // 페이지당 항목 수 적용
      // 필요한 경우 다른 파라미터 추가 (예: userId)
      // userId: userData?.userId
    },
    swrOptions
  );

  // 게시물 데이터 상태 업데이트
  useEffect(() => {
    if (postsData?.data) {
      setPosts(postsData.data);
    } else if (postsError) {
      // 에러 발생 시 빈 배열로 설정
      setPosts([]);
    }
  }, [postsData, postsError]);

  // 에러 상태 처리 (제거 - combinedError 정의 위치로 이동)

  // --- 핸들러 함수들 ---
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };
  const handleSortChange = (field) => {
    /* 이전과 동일 */
  }; // 정렬 기능 필요 시 유지
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };
  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }; // 페이지 변경 시 스크롤 추가
  const goToPreviousPage = () => {
    if (currentPage > 1) paginate(currentPage - 1);
  };
  const goToNextPage = () => {
    if (currentPage < totalPages) paginate(currentPage + 1);
  };

  // 로딩 UI (DashboardPage 스타일)
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner className="h-10 w-10" color="text-gray-500" />
      </div>
    );
  }

  // 에러 처리 UI 전에 combinedError 정의
  const combinedError = error || postsError;

  // 에러 UI (DashboardPage 스타일)
  if (combinedError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {combinedError.message || "데이터 처리 중 오류가 발생했습니다."}
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
  }

  if (!userData) return null;

  // 페이지네이션 계산
  const totalItems = postsData?.meta?.totalItems || posts.length; // API 응답에 totalItems가 있는지 확인
  const totalPages =
    postsData?.meta?.totalPages || Math.ceil(totalItems / itemsPerPage); // API 응답에 totalPages가 있는지 확인

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          게시물 관리
        </h1>
        <p className="text-sm text-gray-500">
          밴드 게시물 목록을 확인하고 관련 정보를 확인할 수 있습니다.
        </p>
      </div>

      {/* 검색, 필터링 컨트롤 */}
      <LightCard className="mb-6" padding="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* 검색창 */}
          <div className="md:col-span-2">
            {" "}
            {/* 검색창 너비 조정 */}
            <label htmlFor="search" className="sr-only">
              검색
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                id="search"
                name="search"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition duration-150"
                placeholder="게시물 내용, 작성자 등으로 검색..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          {/* 필터 버튼 그룹 */}
          <div className="md:col-span-1 flex flex-wrap justify-start md:justify-end items-center gap-2">
            {/* <span className="text-sm font-medium text-gray-500 mr-2 hidden sm:inline">상태:</span> */}
            {["all", "활성", "비활성"].map(
              (
                status // '활성', '비활성'으로 변경
              ) => (
                <button
                  key={status}
                  onClick={() => handleFilterChange(status)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition duration-150 ${
                    filterStatus === status
                      ? "bg-gray-300 text-gray-900"
                      : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {status === "all" ? "전체" : status}
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          총 {totalItems}개 게시물
          {/* 필요시 정렬 버튼 추가 */}
          {/* <button onClick={() => handleSortChange('posted_at')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                정렬: 등록일 {getSortIcon('posted_at')}
            </button> */}
        </div>
      </LightCard>

      {/* 게시물 그리드 */}
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {posts.map((post) => (
            // PostCard에 필요한 props 전달 확인 (예: post 객체 전체)
            <PostCard key={post.post_id || post.id} post={post} />
          ))}
        </div>
      ) : (
        <LightCard className="text-center" padding="py-16 px-6">
          <InboxIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            표시할 게시물이 없습니다
          </p>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            현재 조건에 맞는 게시물이 없거나 아직 게시물이 등록되지 않았습니다.
          </p>
          <button
            onClick={() => {
              setSearchTerm("");
              setFilterStatus("all");
              setCurrentPage(1);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            필터 초기화
          </button>
        </LightCard>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <nav
            className="inline-flex rounded-md shadow-sm -space-x-px"
            aria-label="Pagination"
          >
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                currentPage === 1
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span className="sr-only">Previous</span>
              <ChevronUpIcon
                className="h-5 w-5 transform rotate-[-90deg]"
                aria-hidden="true"
              />
            </button>

            {/* 페이지 번호 로직 (최대 5개 표시, 현재 페이지 중앙) */}
            {(() => {
              const pageNumbers = [];
              const maxPagesToShow = 5;
              let startPage = Math.max(
                1,
                currentPage - Math.floor(maxPagesToShow / 2)
              );
              let endPage = Math.min(
                totalPages,
                startPage + maxPagesToShow - 1
              );

              // 시작 페이지 조정 (끝 페이지가 부족할 경우)
              if (endPage - startPage + 1 < maxPagesToShow) {
                startPage = Math.max(1, endPage - maxPagesToShow + 1);
              }

              if (startPage > 1) {
                pageNumbers.push(
                  <button
                    key={1}
                    onClick={() => paginate(1)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    1
                  </button>
                );
                if (startPage > 2) {
                  pageNumbers.push(
                    <span
                      key="start-ellipsis"
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
                    >
                      ...
                    </span>
                  );
                }
              }

              for (let i = startPage; i <= endPage; i++) {
                pageNumbers.push(
                  <button
                    key={i}
                    onClick={() => paginate(i)}
                    aria-current={currentPage === i ? "page" : undefined}
                    className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium ${
                      currentPage === i
                        ? "z-10 bg-orange-50 border-orange-500 text-orange-600" // 활성 페이지 색상
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {i}
                  </button>
                );
              }

              if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                  pageNumbers.push(
                    <span
                      key="end-ellipsis"
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
                    >
                      ...
                    </span>
                  );
                }
                pageNumbers.push(
                  <button
                    key={totalPages}
                    onClick={() => paginate(totalPages)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {totalPages}
                  </button>
                );
              }

              return pageNumbers;
            })()}

            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                currentPage === totalPages
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span className="sr-only">Next</span>
              <ChevronDownIcon
                className="h-5 w-5 transform rotate-[-90deg]"
                aria-hidden="true"
              />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
