"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, usePosts } from "../hooks"; // useUser 훅 추가
import PostCard from "../components/PostCard";
import { api } from "../lib/fetcher"; // 필요시 사용

// --- 아이콘 (Heroicons) ---
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  SparklesIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  InboxIcon,
  ArrowUturnLeftIcon,
  TagIcon,
  FunnelIcon, // TagIcon, FunnelIcon 추가
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  CheckIcon, // 페이지네이션, 라디오 버튼 아이콘 추가
  XMarkIcon, // 모달 닫기 아이콘 (PostCard 등에서 사용될 수 있음)
} from "@heroicons/react/24/outline";

// --- 커스텀 라디오 버튼 그룹 컴포넌트 ---
function CustomRadioGroup({
  name,
  options,
  selectedValue,
  onChange,
  disabled = false,
}) {
  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-center cursor-pointer ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <div
            onClick={() => !disabled && onChange(option.value)}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mr-2 flex-shrink-0 ${
              selectedValue === option.value
                ? "bg-orange-500 border-orange-500"
                : "bg-white border-gray-300 hover:border-gray-400"
            } ${disabled ? "!bg-gray-100 !border-gray-200" : ""} `}
          >
            {selectedValue === option.value && (
              <CheckIcon className="w-3.5 h-3.5 text-white" />
            )}
          </div>
          <span
            className={`text-sm ${
              disabled ? "text-gray-400" : "text-gray-700"
            }`}
          >
            {option.label}
          </span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={() => !disabled && onChange(option.value)}
            className="sr-only"
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}

// --- 로딩 스피너 ---
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

// --- 상태 배지 (게시물 활성/비활성) ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "활성":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "비활성":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIconOutline;
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

// --- 카드 래퍼 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export default function PostsPage() {
  const router = useRouter();
  const topRef = useRef(null); // 스크롤용 ref
  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posts, setPosts] = useState([]);
  const [inputValue, setInputValue] = useState(""); // 검색 입력값 상태 추가
  const [searchTerm, setSearchTerm] = useState(""); // 디바운스된 검색어
  const [sortBy, setSortBy] = useState("posted_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all"); // 'all', '활성', '비활성'

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12); // 페이지당 12개

  // 게시물 상태 필터 옵션
  const postStatusOptions = [
    { value: "all", label: "전체" },
    { value: "활성", label: "활성" },
    { value: "비활성", label: "비활성" },
  ];

  // SWR 옵션
  const swrOptions = {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 60000,
    onError: (error) => {
      console.error("SWR 데이터 로딩 오류:", error);
      setError(error.message || "데이터 로딩 중 오류 발생");
    },
    keepPreviousData: true,
  };

  // 사용자 인증 상태 확인
  useEffect(() => {
    /* 로직 동일 */
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj);
      } catch (e) {
        console.error("인증 처리 오류:", e);
        setError("인증 처리 중 오류가 발생했습니다.");
        handleLogout();
      } finally {
        setInitialLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // 사용자 정보 훅 (로딩 상태 확인용)
  const {
    data: userDataFromHook,
    error: userError,
    isLoading: isUserLoading,
  } = useUser(userData?.userId, swrOptions);

  // 게시물 데이터 가져오기 (usePosts 훅 사용)
  const {
    data: postsData,
    error: postsError,
    isLoading: isPostsLoading,
  } = usePosts(
    userData?.bandNumber, // bandNumber 사용
    currentPage,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined, // 디바운스된 검색어 사용
      limit: itemsPerPage,
      // userId: userData?.userId // 필요하다면 userId도 전달
    },
    swrOptions
  );

  // 통합 로딩 상태
  const isDataLoading = initialLoading || isUserLoading || isPostsLoading;

  // 게시물 데이터 상태 업데이트
  useEffect(() => {
    if (postsData?.data) {
      setPosts(postsData.data);
    } else if (postsError) {
      setPosts([]);
    }
    // 페이지네이션 오류 방지
    if (
      postsData?.pagination &&
      currentPage > postsData.pagination.totalPages &&
      postsData.pagination.totalPages > 0
    ) {
      setCurrentPage(1);
    }
  }, [postsData, postsError, currentPage]);

  // 검색 디바운스
  useEffect(() => {
    const handler = setTimeout(() => {
      if (inputValue !== searchTerm) {
        setSearchTerm(inputValue);
        setCurrentPage(1);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [inputValue, searchTerm]);

  // --- 핸들러 함수들 ---
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleSearchChange = (e) => {
    setInputValue(e.target.value);
  }; // inputValue 업데이트
  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };
  const scrollToTop = () =>
    topRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const paginate = (pageNumber) => {
    const totalPages = postsData?.pagination?.totalPages || 1;
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      scrollToTop();
    }
  };
  const goToPreviousPage = () => paginate(currentPage - 1);
  const goToNextPage = () => paginate(currentPage + 1);

  // 로딩 UI
  if (initialLoading || !userData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner className="h-10 w-10" color="text-gray-500" />
        <p className="ml-3 text-gray-600">데이터 로딩 중...</p>
      </div>
    );
  // 에러 UI
  const combinedError = error || postsError || userError;
  if (combinedError)
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

  // 페이지네이션 계산
  const totalItems = postsData?.pagination?.totalItems || 0; // API 응답 구조 확인 필요
  const totalPages =
    postsData?.pagination?.totalPages ||
    Math.ceil(totalItems / itemsPerPage) ||
    1; // API 응답 구조 확인 필요

  return (
    <div
      ref={topRef}
      className="min-h-screen bg-gray-100 text-gray-900  overflow-y-auto"
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">게시물 관리</h1>
          <p className="text-sm text-gray-500">
            밴드 게시물 목록을 확인하고 관련 정보를 확인할 수 있습니다.
          </p>
        </div>

        {/* --- 필터 섹션 (테이블 스타일) --- */}
        <LightCard padding="p-0" className="mb-6 md:mb-8 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {/* 상태 필터 행 */}
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <FunnelIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />{" "}
                상태
              </div>
              <div className="bg-white px-4 py-3">
                <CustomRadioGroup
                  name="postStatus"
                  options={postStatusOptions} // 게시물 상태 옵션 사용
                  selectedValue={filterStatus}
                  onChange={handleFilterChange}
                  disabled={isDataLoading}
                />
              </div>
            </div>
            {/* 검색 필터 행 */}
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <TagIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />{" "}
                검색
              </div>
              <div className="bg-white px-4 py-3 flex items-center">
                <div className="relative w-full sm:max-w-xs">
                  <input
                    type="search"
                    placeholder="게시물 내용, 작성자 검색..."
                    value={inputValue}
                    onChange={handleSearchChange}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 disabled:bg-gray-100"
                    disabled={isDataLoading}
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    {" "}
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />{" "}
                  </div>
                </div>
                <span className="ml-auto text-sm text-gray-500">
                  {" "}
                  총 {totalItems > 0 ? totalItems.toLocaleString() : "0"}개
                  게시물{" "}
                </span>
              </div>
            </div>
          </div>
        </LightCard>

        {/* 게시물 그리드 */}
        {isPostsLoading && posts.length === 0 ? ( // 초기 로딩 또는 필터링 중 데이터 없을 때
          <div className="text-center py-16">
            <LoadingSpinner className="h-8 w-8 mx-auto text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">
              게시물을 불러오는 중...
            </p>
          </div>
        ) : !isPostsLoading && posts.length === 0 ? ( // 로딩 완료 후 데이터 없을 때
          <LightCard className="text-center" padding="py-16 px-6">
            <InboxIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              표시할 게시물이 없습니다
            </p>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              현재 조건에 맞는 게시물이 없거나 아직 게시물이 등록되지
              않았습니다.
            </p>
            <button
              onClick={() => {
                setSearchTerm("");
                setInputValue("");
                setFilterStatus("all");
                setCurrentPage(1);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" /> 필터 초기화
            </button>
          </LightCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {posts.map((post) => (
              <PostCard key={post.post_id || post.id} post={post} />
            ))}
          </div>
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
                disabled={currentPage === 1 || isDataLoading}
                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                  currentPage === 1 || isDataLoading
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {" "}
                <span className="sr-only">Previous</span>{" "}
                <ArrowLongLeftIcon className="h-5 w-5" aria-hidden="true" />{" "}
              </button>
              {(() => {
                /* 페이지 번호 로직 */
                const pageNumbers = [];
                const maxPagesToShow = 5;
                const halfMaxPages = Math.floor(maxPagesToShow / 2);
                let startPage = Math.max(1, currentPage - halfMaxPages);
                let endPage = Math.min(
                  totalPages,
                  startPage + maxPagesToShow - 1
                );
                if (endPage - startPage + 1 < maxPagesToShow) {
                  startPage = Math.max(1, endPage - maxPagesToShow + 1);
                }
                if (startPage > 1) {
                  pageNumbers.push(
                    <button
                      key={1}
                      onClick={() => paginate(1)}
                      disabled={isDataLoading}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      disabled={isDataLoading}
                      aria-current={currentPage === i ? "page" : undefined}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                        currentPage === i
                          ? "z-10 bg-orange-50 border-orange-500 text-orange-600"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
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
                      disabled={isDataLoading}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {totalPages}
                    </button>
                  );
                }
                return pageNumbers;
              })()}
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages || isDataLoading}
                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                  currentPage === totalPages || isDataLoading
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {" "}
                <span className="sr-only">Next</span>{" "}
                <ArrowLongRightIcon className="h-5 w-5" aria-hidden="true" />{" "}
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
