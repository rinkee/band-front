"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import ProductBarcodeModal from "../components/ProductBarcodeModal";
import CommentsModal from "../components/Comments";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PostsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(18); // 3x6 = 18개씩

  // 검색 관련 상태
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 댓글 모달 관련 상태
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  // 사용자 데이터 가져오기
  useEffect(() => {
    const sessionData = sessionStorage.getItem("userData");
    if (sessionData) {
      const userDataObj = JSON.parse(sessionData);
      setUserData(userDataObj);
    } else {
      router.push("/login");
    }
  }, [router]);

  // posts 데이터 가져오기
  const {
    data: postsData,
    error,
    mutate,
  } = useSWR(
    userData?.userId
      ? `/api/posts?userId=${userData.userId}&page=${page}&limit=${limit}${
          searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""
        }`
      : null,
    fetcher
  );

  // 검색 기능
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchTerm);
    setPage(1); // 검색 시 첫 페이지로 이동
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setSearchQuery("");
    setPage(1);
  };

  const handlePostClick = (postId) => {
    setSelectedPostId(postId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPostId(null);
  };

  const handleProductUpdate = () => {
    // 바코드 업데이트 후 posts 데이터 새로고침
    console.log("Posts 페이지: 바코드 업데이트 후 데이터 새로고침");
    mutate();
  };

  const handleViewOrders = (postKey) => {
    if (!postKey) return;

    // 주문 관리 페이지로 이동하면서 post_key로 검색
    router.push(`/orders?search=${encodeURIComponent(postKey)}`);
  };

  // 댓글 모달 열기 함수
  const handleViewComments = (post) => {
    if (!userData?.band_access_token) {
      alert("BAND 토큰이 없습니다. 설정에서 BAND 연동을 확인해주세요.");
      return;
    }

    const bandKey = userData?.band_key || post.band_key;
    if (!bandKey) {
      alert("밴드 정보가 없습니다.");
      return;
    }

    setSelectedPostForComments({
      postKey: post.post_key,
      bandKey: bandKey,
      productName: post.title || "게시물",
      accessToken: userData.band_access_token,
      postContent: post.content || "",
    });
    setIsCommentsModalOpen(true);
  };

  // 댓글 모달 닫기 함수
  const handleCloseCommentsModal = () => {
    setIsCommentsModalOpen(false);
    setSelectedPostForComments(null);
  };

  if (!userData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h3 className="text-red-800 font-medium">오류가 발생했습니다</h3>
          <p className="text-red-600 text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!postsData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">데이터를 불러오는 중...</div>
      </div>
    );
  }

  const {
    posts = [],
    totalCount = 0,
    totalPages = 0,
    totalStats = {
      totalPosts: 0,
      totalProductPosts: 0,
      totalCompletedPosts: 0,
    },
  } = postsData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">게시물 관리</h1>
              <p className="text-gray-600 mt-1">
                총 {totalStats.totalPosts}개의 게시물 • 상품 게시물{" "}
                {totalStats.totalProductPosts}개
                {searchQuery && (
                  <span className="text-blue-600 ml-2">
                    • &quot;{searchQuery}&quot; 검색 결과
                  </span>
                )}
              </p>
            </div>

            {/* 통계 요약 */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {totalStats.totalPosts}
                  </div>
                  <div className="text-gray-500">전체</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {totalStats.totalProductPosts}
                  </div>
                  <div className="text-gray-500">상품</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {totalStats.totalCompletedPosts}
                  </div>
                  <div className="text-gray-500">처리완료</div>
                </div>
              </div>
            </div>
          </div>

          {/* 검색 바 */}
          <div className="mt-6 flex items-center justify-between">
            <form
              onSubmit={handleSearch}
              className="flex items-center space-x-3"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="게시물 제목, 내용, 작성자로 검색..."
                  className="block w-96 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                검색
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg
                    className="h-4 w-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  검색 초기화
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* 게시물 그리드 */}
      <div className="max-w-7xl mx-auto p-6">
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            {searchQuery ? (
              <div>
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <div className="text-gray-500 text-lg mb-2">
                  &quot;{searchQuery}&quot;에 대한 검색 결과가 없습니다.
                </div>
                <div className="text-gray-400 text-sm mb-4">
                  다른 검색어를 시도해보세요.
                </div>
                <button
                  onClick={handleClearSearch}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  모든 게시물 보기
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-lg">게시물이 없습니다.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <PostCard
                key={post.post_key}
                post={post}
                onClick={handlePostClick}
                onViewOrders={handleViewOrders}
                onViewComments={handleViewComments}
              />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* 게시물 상품 바코드 모달 */}
      <ProductBarcodeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        postId={selectedPostId}
        userId={userData?.userId}
        onProductUpdate={handleProductUpdate}
      />

      {/* 댓글 모달 */}
      <CommentsModal
        isOpen={isCommentsModalOpen}
        onClose={handleCloseCommentsModal}
        postKey={selectedPostForComments?.postKey}
        bandKey={selectedPostForComments?.bandKey}
        postTitle={selectedPostForComments?.productName}
        accessToken={selectedPostForComments?.accessToken}
        postContent={selectedPostForComments?.postContent}
      />
    </div>
  );
}

// 그리드용 게시물 카드 컴포넌트
function PostCard({ post, onClick, onViewOrders, onViewComments }) {
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // 이미지 URL 파싱 개선
  const getImageUrls = () => {
    console.log("Post data:", post.post_key, {
      image_urls: post.image_urls,
      photos_data: post.photos_data,
      image_urls_type: typeof post.image_urls,
    });

    // image_urls 필드에서 이미지 URL 배열 가져오기
    if (post.image_urls && Array.isArray(post.image_urls)) {
      console.log("Found image_urls array:", post.image_urls);
      return post.image_urls;
    }

    // photos_data가 있으면 URL 추출
    if (post.photos_data && Array.isArray(post.photos_data)) {
      const urls = post.photos_data
        .map((photo) => photo.url)
        .filter((url) => url);
      console.log("Extracted from photos_data:", urls);
      return urls;
    }

    // 혹시 image_urls가 JSON 문자열로 저장되어 있다면
    if (typeof post.image_urls === "string") {
      try {
        const parsed = JSON.parse(post.image_urls);
        console.log("Parsed from string:", parsed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    console.log("No images found for post:", post.post_key);
    return [];
  };

  const imageUrls = getImageUrls();
  const mainImage = imageUrls[0];
  const hasImages = imageUrls.length > 0;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(post.post_id)}
    >
      {/* 내용 섹션 */}
      <div className="p-4">
        {/* 작성자 정보 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            {/* 작성자 프로필 이미지 */}
            <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200">
              {post.author_profile ? (
                <img
                  src={post.author_profile}
                  alt={post.author_name || "프로필"}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextElementSibling.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className={`w-full h-full bg-blue-500 flex items-center justify-center ${
                  post.author_profile ? "hidden" : ""
                }`}
              >
                <span className="text-white font-medium text-xs">
                  {post.author_name ? post.author_name.charAt(0) : "?"}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {post.author_name || "알 수 없음"}
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(post.posted_at)}
              </div>
            </div>
          </div>
          
          {/* 댓글 AI 처리 뱃지 */}
          {post.order_needs_ai && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              댓글 AI 처리
            </div>
          )}
        </div>

        {/* 게시물 제목 */}
        {post.title && (
          <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 text-sm leading-snug">
            {post.title}
          </h3>
        )}

        {/* 게시물 내용 */}
        {post.content && (
          <p className="text-gray-600 text-sm line-clamp-3 leading-relaxed mb-3">
            {post.content}
          </p>
        )}

        {/* 연관 상품 정보 */}
        {post.products && post.products.length > 0 && (
          <div className="bg-blue-50 rounded-md p-2 mb-3 border border-blue-100">
            <div className="flex items-center space-x-1 mb-1">
              <svg
                className="w-3 h-3 text-blue-600"
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
              <span className="text-xs font-medium text-blue-900">
                상품 {post.products.length}개
              </span>
            </div>
            <div className="text-xs text-blue-800 line-clamp-2">
              {post.products.slice(0, 1).map((product) => (
                <div key={product.product_id}>
                  {product.title}{" "}
                  {product.base_price &&
                    `${Number(product.base_price).toLocaleString()}원`}
                </div>
              ))}
              {post.products.length > 1 && (
                <div className="text-blue-600">
                  외 {post.products.length - 1}개...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 이미지 섹션 */}
      {hasImages && (
        <div className="relative">
          <img
            src={mainImage}
            alt={post.title || "게시물 이미지"}
            className="w-full h-64 object-cover"
            onError={(e) => {
              e.target.src = "/default-avatar.png"; // fallback 이미지
            }}
          />
        </div>
      )}

      {/* 하단 섹션 - 3개 버튼 */}
      <div className="p-4">
        {/* 액션 버튼들 */}
        <div className="grid grid-cols-3 gap-2">
          {/* 바코드 등록 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(post.post_id);
            }}
            className="flex flex-col items-center justify-center py-3 px-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <svg
              className="w-5 h-5 text-gray-600 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span className="text-xs font-medium text-gray-700">
              바코드 등록
            </span>
          </button>

          {/* 주문보기 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewOrders(post.post_key);
            }}
            className="flex flex-col items-center justify-center py-3 px-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <svg
              className="w-5 h-5 text-gray-600 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span className="text-xs font-medium text-gray-700">주문보기</span>
          </button>

          {/* 댓글보기 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewComments(post);
            }}
            className="flex flex-col items-center justify-center py-3 px-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <svg
              className="w-5 h-5 text-gray-600 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-xs font-medium text-gray-700">댓글보기</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 페이지네이션 컴포넌트 (10페이지씩 표시)
function Pagination({ currentPage, totalPages, onPageChange }) {
  // 현재 페이지를 기준으로 표시할 페이지 범위 계산
  const getPageNumbers = () => {
    const maxVisiblePages = 10;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // 끝 페이지가 조정된 경우 시작 페이지도 재조정
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return { pages, startPage, endPage };
  };

  const { pages, startPage, endPage } = getPageNumbers();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-4">
      <div className="flex items-center justify-center space-x-2">
        {/* 첫 페이지로 이동 */}
        {startPage > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
            >
              1
            </button>
            {startPage > 2 && (
              <span className="px-2 py-2 text-sm text-gray-400">...</span>
            )}
          </>
        )}

        {/* 이전 페이지 */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          ← 이전
        </button>

        {/* 페이지 번호들 */}
        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-2 text-sm rounded-md transition-colors ${
              page === currentPage
                ? "bg-blue-600 text-white font-medium"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {page}
          </button>
        ))}

        {/* 다음 페이지 */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          다음 →
        </button>

        {/* 마지막 페이지로 이동 */}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span className="px-2 py-2 text-sm text-gray-400">...</span>
            )}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}
      </div>

      {/* 페이지 정보 */}
      <div className="mt-3 text-center">
        <span className="text-xs text-gray-500">
          {currentPage} / {totalPages} 페이지
        </span>
      </div>
    </div>
  );
}
