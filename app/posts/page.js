"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePosts } from "../hooks";
import PostCard from "../components/PostCard";

export default function PostsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posts, setPosts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("posted_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

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
    // refreshInterval: 30000, // 30초마다 자동으로 데이터 새로고침
    onError: (error) => {
      console.error("데이터 로딩 오류:", error);
    },
  };

  // 게시물 데이터 가져오기
  const { data: postsData, error: postsError } = usePosts(
    userData?.bandId,
    currentPage,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
    },
    swrOptions
  );

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

        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (userData && postsData) {
      setPosts(postsData.data || []);
    }
  }, [postsData, userData]);

  useEffect(() => {
    if (postsError) {
      setError("게시물 데이터를 불러오는데 실패했습니다.");
      console.error("게시물 데이터 로딩 오류:", postsError);
    }
  }, [postsError]);

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 정렬 변경 핸들러
  const handleSortChange = (field) => {
    if (sortBy === field) {
      // 같은 필드를 다시 클릭하면 정렬 방향 전환
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // 다른 필드 선택 시 해당 필드로 정렬 (기본은 내림차순)
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // 필터 변경 핸들러
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
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

  // 게시물 필터링 및 정렬
  const filteredPosts = posts || [];

  // 페이지네이션
  const totalItems = postsData?.totalCount || filteredPosts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  // 페이지 변경 핸들러
  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // 이전/다음 페이지 핸들러
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // 정렬 상태 아이콘 생성
  const getSortIcon = (field) => {
    if (sortBy !== field) return null;

    return sortOrder === "asc" ? (
      <svg
        className="w-4 h-4 ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ) : (
      <svg
        className="w-4 h-4 ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    );
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "활성":
        return "bg-green-100 text-green-800";
      case "비활성":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  // 게시물 내용 줄이기 함수
  const truncateContent = (content, maxLength = 100) => {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
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

  if (!userData) {
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
                홈
              </a>
            </li>
            <li>
              <a
                href="/posts"
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
                    d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                  />
                </svg>
                게시물 관리
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
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
          >
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
              <h1 className="text-xl font-bold text-gray-800">게시물 관리</h1>
              <p className="text-sm text-gray-500">
                밴드 게시물 목록을 관리할 수 있습니다
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
          {/* 상단 필터 및 검색 */}
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 space-y-4 md:space-y-0">
              <div className="flex space-x-2">
                <button
                  onClick={() => handleFilterChange("all")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "all"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => handleFilterChange("활성")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "활성"
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  활성
                </button>
                <button
                  onClick={() => handleFilterChange("비활성")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "비활성"
                      ? "bg-gray-300 text-gray-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  비활성
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="게시물 검색"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full md:w-64 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            <div className="text-sm text-gray-500 mt-2">
              총{" "}
              <span className="font-bold text-gray-900">
                {filteredPosts.length}
              </span>
              개의 게시물
            </div>
          </div>

          {/* 게시물 목록 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map((post) => (
              <PostCard key={post.post_id} post={post} />
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center shadow-sm">
              <svg
                className="w-16 h-16 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                게시물이 없습니다
              </h3>
              <p className="text-gray-500">
                검색 조건을 변경하거나 새로운 게시물을 크롤링해보세요.
              </p>
            </div>
          )}

          {/* 페이지네이션 */}
          {filteredPosts.length > 0 && (
            <div className="mt-8 flex justify-center">
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
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
                  <span className="sr-only">이전</span>
                  <svg
                    className="h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* 페이지 번호 */}
                {Array.from({ length: Math.min(5, totalPages) }).map(
                  (_, index) => {
                    let pageNumber;

                    // 현재 페이지를 기준으로 앞뒤로 2페이지씩 표시
                    if (totalPages <= 5) {
                      pageNumber = index + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = index + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + index;
                    } else {
                      pageNumber = currentPage - 2 + index;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => paginate(pageNumber)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNumber
                            ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  }
                )}

                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                    currentPage === totalPages
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="sr-only">다음</span>
                  <svg
                    className="h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
