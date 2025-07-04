"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import PostDetailModal from "../components/PostDetailModal";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PostsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(18); // 3x6 = 18개씩
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      ? `/api/posts?userId=${userData.userId}&page=${page}&limit=${limit}`
      : null,
    fetcher
  );

  // 게시물 업데이트 함수
  const handleUpdatePosts = async () => {
    if (!userData?.userId || isUpdating) return;

    setIsUpdating(true);
    try {
      const response = await fetch("/api/posts/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userData.userId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const { newPosts, totalPosts } = result.data;

        if (newPosts > 0) {
          alert(
            `${newPosts}개의 새로운 게시물을 가져왔습니다! (전체: ${totalPosts}개)`
          );
          mutate(); // 데이터 새로고침
        } else {
          alert("새로운 게시물이 없습니다.");
        }
      } else {
        alert(`업데이트 실패: ${result.message}`);
      }
    } catch (error) {
      console.error("게시물 업데이트 중 오류:", error);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProcessPost = async (postKey) => {
    if (!postKey) return;

    try {
      const response = await fetch("/api/posts/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userData.userId,
          postKey: postKey,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert("게시물 처리가 완료되었습니다.");
        mutate(); // 데이터 새로고침
      } else {
        alert(`처리 실패: ${result.message}`);
      }
    } catch (error) {
      console.error("게시물 처리 중 오류:", error);
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  const handlePostClick = (postId) => {
    setSelectedPostId(postId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPostId(null);
  };

  const handleViewOrders = (postKey) => {
    if (!postKey) return;

    // 주문 관리 페이지로 이동하면서 post_key로 검색
    router.push(`/orders?search=${encodeURIComponent(postKey)}`);
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

  const { posts = [], totalCount = 0, totalPages = 0 } = postsData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">게시물 관리</h1>
              <p className="text-gray-600 mt-1">
                총 {totalCount}개의 게시물 • 상품 게시물{" "}
                {posts.filter((post) => post.is_product).length}개
              </p>
            </div>

            {/* 통계 요약과 버튼들 */}
            <div className="flex items-center space-x-6">
              {/* 업데이트 버튼 */}
              <button
                onClick={handleUpdatePosts}
                disabled={isUpdating}
                className={`${
                  isUpdating
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2`}
              >
                {isUpdating ? (
                  <svg
                    className="w-5 h-5 animate-spin"
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
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
                <span>{isUpdating ? "업데이트 중..." : "업데이트"}</span>
              </button>

              {/* 글쓰기 버튼 */}
              <button
                onClick={() => router.push("/posts/write")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>글쓰기</span>
              </button>

              {/* 통계 요약 */}
              <div className="hidden md:flex items-center space-x-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {totalCount}
                  </div>
                  <div className="text-gray-500">전체</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {posts.filter((post) => post.is_product).length}
                  </div>
                  <div className="text-gray-500">상품</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {
                      posts.filter(
                        (post) => post.ai_extraction_status === "completed"
                      ).length
                    }
                  </div>
                  <div className="text-gray-500">처리완료</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 게시물 그리드 */}
      <div className="max-w-7xl mx-auto p-6">
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-gray-500 text-lg">게시물이 없습니다.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <PostCard
                key={post.post_key}
                post={post}
                onProcess={handleProcessPost}
                onClick={handlePostClick}
                onViewOrders={handleViewOrders}
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

      {/* 게시물 상세 정보 모달 */}
      <PostDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        postId={selectedPostId}
        userId={userData?.userId}
      />
    </div>
  );
}

// 그리드용 게시물 카드 컴포넌트
function PostCard({ post, onProcess, onClick, onViewOrders }) {
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
        <div className="flex items-center space-x-2 mb-3">
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
          {/* 액션 버튼 */}
          <div>
            <PostActions
              post={post}
              onProcess={onProcess}
              onViewOrders={onViewOrders}
            />
          </div>
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

          {/* 이미지 개수 표시 */}
          {imageUrls.length > 1 && (
            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
              1/{imageUrls.length}
            </div>
          )}

          {/* 상태 태그 */}
          <div className="absolute top-2 left-2 flex flex-col space-y-1">
            {post.is_product && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                상품
              </span>
            )}
            {post.ai_extraction_status && (
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  post.ai_extraction_status === "completed"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {post.ai_extraction_status === "completed"
                  ? "AI완료"
                  : "AI처리중"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 하단 섹션 */}
      <div className="p-4">
        {/* 댓글바 (통계) */}
        <div className="flex items-center justify-between text-xs text-gray-500 pb-3 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <span>댓글 {post.comment_count || 0}개</span>
            {post.emotion_count > 0 && (
              <span>좋아요 {post.emotion_count}개</span>
            )}
          </div>
        </div>

        {/* 최근 댓글 */}
        {post.latest_comments && post.latest_comments.length > 0 && (
          <div className="mt-3">
            <div className="space-y-2">
              {post.latest_comments.slice(0, 3).map((comment, index) => (
                <div key={index} className="flex items-start space-x-2">
                  {/* 댓글 작성자 프로필 이미지 */}
                  <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 mt-0.5">
                    {comment.author?.profile_image_url ? (
                      <img
                        src={comment.author.profile_image_url}
                        alt={comment.author?.name || "프로필"}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextElementSibling.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-full h-full bg-gray-400 flex items-center justify-center ${
                        comment.author?.profile_image_url ? "hidden" : ""
                      }`}
                    >
                      <span className="text-white font-medium text-[8px]">
                        {comment.author?.name
                          ? comment.author.name.charAt(0)
                          : "?"}
                      </span>
                    </div>
                  </div>

                  {/* 댓글 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline space-x-1">
                      <span className="text-xs font-medium text-gray-800">
                        {comment.author?.name || "익명"}
                      </span>
                      {comment.created_at && (
                        <span className="text-[10px] text-gray-400">
                          {formatDate(
                            new Date(comment.created_at).toISOString()
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 게시물 액션 메뉴 컴포넌트 (간소화)
function PostActions({ post, onProcess, onViewOrders }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="w-8 h-8 rounded-full bg-white bg-opacity-80 hover:bg-opacity-100 flex items-center justify-center transition-all shadow-sm"
      >
        <svg
          className="w-4 h-4 text-gray-600"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            {post.is_product && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOrders(post.post_key);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-xs text-blue-700 hover:bg-blue-50 flex items-center space-x-2"
              >
                <svg
                  className="w-3 h-3"
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
                <span>주문보기</span>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onProcess(post.post_key);
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              재처리
            </button>
            {post.band_post_url && (
              <a
                href={post.band_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              >
                원본보기
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 페이지네이션 컴포넌트
function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-4">
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← 이전
        </button>

        <span className="px-4 py-2 text-sm text-gray-700 font-medium">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
