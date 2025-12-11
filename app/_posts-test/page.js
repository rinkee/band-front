"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import ProductBarcodeModal from "../components/ProductBarcodeModal";
import ProductManagementModal from "../components/ProductManagementModal";
import CommentsModal from "../components/Comments";
import ToastContainer from "../components/ToastContainer";
import { useToast } from "../hooks/useToast";
import supabase from "../lib/supabaseClient";
import { useScroll } from "../context/ScrollContext";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction";

export default function PostsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const { scrollableContentRef } = useScroll();
  
  // sessionStorage에서 저장된 페이지 번호 복원
  const [page, setPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPage = sessionStorage.getItem('postsPageNumber');
      return savedPage ? parseInt(savedPage, 10) : 1;
    }
    return 1;
  });
  const [limit] = useState(20);

  // 검색 관련 상태
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedSearchTerm = sessionStorage.getItem('postsSearchTerm');
      return savedSearchTerm || "";
    }
    return "";
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedSearchQuery = sessionStorage.getItem('postsSearchQuery');
      return savedSearchQuery || "";
    }
    return "";
  });

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 댓글 모달 관련 상태
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  // 상품 관리 모달 관련 상태
  const [isProductManagementModalOpen, setIsProductManagementModalOpen] = useState(false);
  const [selectedPostForProductManagement, setSelectedPostForProductManagement] = useState(null);

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

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

  // 페이지 번호가 변경될 때마다 sessionStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsPageNumber', page.toString());
    }
  }, [page]);

  // 검색어가 변경될 때마다 sessionStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsSearchTerm', searchTerm);
      sessionStorage.setItem('postsSearchQuery', searchQuery);
    }
  }, [searchTerm, searchQuery]);

  // Supabase에서 직접 posts 데이터 가져오기
  const fetchPosts = async () => {
    try {
      if (!userData) return { posts: [], totalCount: 0, totalPages: 0, totalStats: {} };

      // 전체 통계 가져오기
      const { data: totalStatsData, error: totalStatsError } = await supabase
        .from("posts")
        .select("post_id, products_data")
        .eq("user_id", userData.userId);

      if (totalStatsError) throw totalStatsError;

      // 전체 개수 계산
      const totalPosts = totalStatsData?.length || 0;
      const totalProductPosts = totalStatsData?.filter(post => {
        if (post.products_data) {
          if (Array.isArray(post.products_data)) {
            return post.products_data.length > 0;
          }
          if (typeof post.products_data === 'object') {
            return post.products_data.products && post.products_data.products.length > 0;
          }
          if (typeof post.products_data === 'string') {
            try {
              const parsed = JSON.parse(post.products_data);
              return parsed.products && parsed.products.length > 0;
            } catch (e) {
              return false;
            }
          }
        }
        return false;
      }).length || 0;

      const totalStats = {
        totalPosts,
        totalProductPosts
      };

      // 검색용 카운트 쿼리
      let countQuery = supabase
        .from("posts")
        .select("post_id", { count: "exact" })
        .eq("user_id", userData.userId);

      if (searchQuery) {
        countQuery = countQuery.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`);
      }

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      // 페이지네이션된 데이터 가져오기
      let query = supabase
        .from("posts")
        .select(`*`)
        .eq("user_id", userData.userId)
        .order("posted_at", { ascending: false });

      // 검색어가 있으면 적용
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`);
      }

      // 페이지네이션 적용
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;

      // 데이터 형식 변환
      const formattedData = data?.map(post => {
        return {
          ...post,
          products: Array.isArray(post.products_data) ? post.products_data : []
        };
      }) || [];

      return {
        posts: formattedData,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        totalStats
      };
    } catch (error) {
      console.error("Posts fetch error:", error);
      throw error;
    }
  };

  // SWR로 데이터 가져오기
  const {
    data: postsData,
    error,
    mutate,
    isLoading
  } = useSWR(
    userData ? `posts-${userData.userId}-${page}-${limit}-${searchQuery}` : null,
    fetchPosts,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000
    }
  );

  // 검색 기능
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchTerm);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setSearchQuery("");
    setPage(1);
  };

  // 모달 관련 핸들러
  const handleOpenProductManagementModal = (post) => {
    setSelectedPostForProductManagement(post);
    setIsProductManagementModalOpen(true);
  };

  const handleCloseProductManagementModal = () => {
    setIsProductManagementModalOpen(false);
    setSelectedPostForProductManagement(null);
  };

  const handleViewComments = (post) => {
    setSelectedPostForComments(post);
    setIsCommentsModalOpen(true);
  };

  const handleViewOrders = (postKey) => {
    router.push(`/orders?post=${postKey}`);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPostId(null);
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
          <p className="text-red-600 text-base mt-1">{error.message}</p>
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
      totalProductPosts: 0
    }
  } = postsData;

  return (
    <div className="min-h-screen bg-white">
      {/* 심플한 헤더 */}
      <div className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-medium text-black">게시물</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                총 {totalStats.totalPosts}개 • 상품 {totalStats.totalProductPosts}개
              </p>
            </div>

            {/* 검색 폼 */}
            <div className="flex items-center space-x-4">
              <UpdateButton />
              <form onSubmit={handleSearch} className="flex space-x-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="게시물 검색..."
                  className="px-3 py-1.5 text-sm border border-gray-300 focus:outline-none focus:border-gray-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 hover:border-gray-400 transition-colors"
                >
                  검색
                </button>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="text-sm text-gray-500 hover:text-black"
                  >
                    초기화
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 2분할 레이아웃 */}
      <div className="flex h-screen">
        {/* 좌측: 게시물 리스트 */}
        <div className="w-1/2 overflow-y-auto bg-white border-r">
          <div className="p-6">
            {posts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">게시물이 없습니다</div>
                {searchQuery && (
                  <button
                    onClick={handleClearSearch}
                    className="text-sm text-gray-500 hover:text-black transition-colors"
                  >
                    모든 게시물 보기
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostListItem
                    key={post.post_key}
                    post={post}
                    isSelected={selectedPost?.post_key === post.post_key}
                    onClick={() => setSelectedPost(post)}
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
        </div>

        {/* 우측: 선택된 게시물의 상품 상세 */}
        <div className="w-1/2 bg-gray-50 overflow-y-auto">
          {selectedPost ? (
            <ProductDetailView
              post={selectedPost}
              onViewOrders={handleViewOrders}
              onViewComments={handleViewComments}
              onOpenProductManagement={() => handleOpenProductManagementModal(selectedPost)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              게시물을 선택해주세요
            </div>
          )}
        </div>
      </div>

      {/* 모달들 */}
      <ProductBarcodeModal
        isOpen={isModalOpen}
        onClose={() => {
          handleCloseModal();
          mutate();
        }}
        postId={selectedPostId}
        userId={userData?.userId}
      />

      <CommentsModal
        isOpen={isCommentsModalOpen}
        onClose={() => setIsCommentsModalOpen(false)}
        post={selectedPostForComments}
      />

      <ProductManagementModal
        isOpen={isProductManagementModalOpen}
        onClose={handleCloseProductManagementModal}
        post={selectedPostForProductManagement}
        onProductUpdate={(updatedProduct) => {
          mutate();
        }}
      />

      <ToastContainer toasts={toasts} onRemove={hideToast} />
    </div>
  );
}

// 좌측 게시물 리스트 아이템 컴포넌트
function PostListItem({ post, isSelected, onClick }) {
  // 날짜 포맷팅
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    }
  };

  // 간단한 이미지 URL 추출
  const getFirstImage = () => {
    if (post.image_urls) {
      if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
        return post.image_urls[0];
      }
      if (typeof post.image_urls === 'string' && post.image_urls !== '[]') {
        try {
          const parsed = JSON.parse(post.image_urls);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0];
          }
        } catch (e) {}
      }
    }
    
    if (post.photos_data) {
      if (Array.isArray(post.photos_data) && post.photos_data.length > 0) {
        const firstPhoto = post.photos_data[0];
        return firstPhoto?.url || firstPhoto;
      }
      if (typeof post.photos_data === 'string' && post.photos_data !== '[]') {
        try {
          const parsed = JSON.parse(post.photos_data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0]?.url || parsed[0];
          }
        } catch (e) {}
      }
    }
    
    return null;
  };

  // 제목 정리
  const cleanTitle = (title) => {
    return title ? title.replace(/\[[^\]]+\]\s*/, '').trim() : '제목 없음';
  };

  // 내용 요약
  const summarizeContent = (content) => {
    if (!content) return '내용 없음';
    const cleaned = content.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
    return cleaned.length > 60 ? cleaned.substring(0, 60) + '...' : cleaned;
  };

  // 상품 개수 파싱
  const getProductCount = () => {
    if (post.products_data) {
      if (typeof post.products_data === 'object' && post.products_data.products) {
        return post.products_data.products.length;
      }
      if (typeof post.products_data === 'string') {
        try {
          const parsed = JSON.parse(post.products_data);
          return parsed.products ? parsed.products.length : 0;
        } catch (e) {
          return 0;
        }
      }
    }
    return post.products ? post.products.length : 0;
  };

  const firstImage = getFirstImage();
  const productCount = getProductCount();

  return (
    <div 
      className={`p-4 border cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50 border-gray-200'
      }`}
      onClick={onClick}
    >
      <div className="flex space-x-3">
        {/* 썸네일 이미지 */}
        <div className="w-16 h-16 bg-gray-200 overflow-hidden flex-shrink-0">
          {firstImage ? (
            <img
              src={firstImage}
              alt="게시물 썸네일"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.parentElement.innerHTML = '<div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">이미지<br/>없음</div>';
              }}
            />
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
              이미지<br/>없음
            </div>
          )}
        </div>

        {/* 게시물 정보 */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-black truncate">
            {cleanTitle(post.title)}
          </h3>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {summarizeContent(post.content)}
          </p>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500">
              {post.author_name || '익명'} · {formatDate(post.posted_at)}
            </div>
            <div className="text-xs text-blue-600 font-medium">
              상품 {productCount}개
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 우측 상품 상세 뷰 컴포넌트
function ProductDetailView({ post, onViewOrders, onViewComments, onOpenProductManagement }) {
  // 날짜 포맷팅
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    }
  };

  // 이미지 URL 추출
  const getFirstImage = () => {
    if (post.image_urls) {
      if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
        return post.image_urls[0];
      }
      if (typeof post.image_urls === 'string' && post.image_urls !== '[]') {
        try {
          const parsed = JSON.parse(post.image_urls);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0];
          }
        } catch (e) {}
      }
    }
    
    if (post.photos_data) {
      if (Array.isArray(post.photos_data) && post.photos_data.length > 0) {
        const firstPhoto = post.photos_data[0];
        return firstPhoto?.url || firstPhoto;
      }
      if (typeof post.photos_data === 'string' && post.photos_data !== '[]') {
        try {
          const parsed = JSON.parse(post.photos_data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0]?.url || parsed[0];
          }
        } catch (e) {}
      }
    }
    
    return null;
  };

  // 제목 정리
  const cleanTitle = (title) => {
    return title ? title.replace(/\[[^\]]+\]\s*/, '').trim() : '제목 없음';
  };

  // 상품 데이터 파싱
  const getProducts = () => {
    if (post.products_data) {
      if (typeof post.products_data === 'object' && post.products_data.products) {
        return post.products_data.products;
      }
      if (typeof post.products_data === 'string') {
        try {
          const parsed = JSON.parse(post.products_data);
          return parsed.products || [];
        } catch (e) {
          return [];
        }
      }
    }
    return post.products || [];
  };

  // 최신 댓글 파싱
  const getLatestComments = () => {
    if (post.latest_comments) {
      if (Array.isArray(post.latest_comments)) {
        return post.latest_comments.slice(0, 3);
      }
      if (typeof post.latest_comments === 'string') {
        try {
          const parsed = JSON.parse(post.latest_comments);
          return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
        } catch (e) {
          return [];
        }
      }
    }
    return [];
  };

  const firstImage = getFirstImage();
  const products = getProducts();
  const latestComments = getLatestComments();

  return (
    <div className="p-6 h-full">
      {/* 게시물 헤더 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
              {(post.author_profile || post.profile_image) ? (
                <img 
                  src={post.author_profile || post.profile_image} 
                  alt={`${post.author_name || '익명'} 프로필`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const fallback = document.createElement('span');
                    fallback.className = 'text-sm font-medium text-gray-600';
                    fallback.textContent = post.author_name ? post.author_name.charAt(0) : '?';
                    e.target.parentElement.appendChild(fallback);
                  }}
                />
              ) : (
                <span className="text-sm font-medium text-gray-600">
                  {post.author_name ? post.author_name.charAt(0) : '?'}
                </span>
              )}
            </div>
            <div>
              <div className="font-medium text-black">{post.author_name || '익명'}</div>
              <div className="text-sm text-gray-500">{formatDate(post.posted_at)}</div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onViewComments(post)}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              댓글 보기
            </button>
            <button
              onClick={() => onViewOrders(post.post_key)}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              주문 관리
            </button>
          </div>
        </div>

        <h2 className="text-lg font-medium text-black mb-2">
          {cleanTitle(post.title)}
        </h2>
        
        {/* 이미지 */}
        {firstImage && (
          <div className="aspect-video bg-gray-100 overflow-hidden mb-4">
            <img
              src={firstImage}
              alt="게시물 이미지"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.parentElement.innerHTML = '<div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">이미지 로드 실패</div>';
              }}
            />
          </div>
        )}
      </div>

      {/* 상품 리스트 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-black">상품 목록 ({products.length}개)</h3>
          <button
            onClick={onOpenProductManagement}
            className="px-3 py-1 text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            상품 관리
          </button>
        </div>

        {products.length > 0 ? (
          <div className="space-y-3">
            {products.map((product, idx) => (
              <div key={idx} className="bg-white border p-4 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-black flex-1">
                    {product.name || '상품명 없음'}
                  </h4>
                  <div className="text-lg font-medium text-blue-600 ml-4">
                    {product.price ? `${product.price.toLocaleString()}원` : '가격 미정'}
                  </div>
                </div>
                {product.description && (
                  <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                )}
                {product.barcode && (
                  <div className="text-xs text-gray-500">바코드: {product.barcode}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            추출된 상품이 없습니다
          </div>
        )}
      </div>

      {/* 최근 댓글 */}
      {latestComments.length > 0 && (
        <div className="mt-6 pt-6 border-t">
          <h3 className="text-base font-medium text-black mb-3">최근 댓글</h3>
          <div className="space-y-3">
            {latestComments.map((comment, idx) => (
              <div key={idx} className="bg-gray-50 p-3">
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                    {comment.author?.profile_image_url ? (
                      <img 
                        src={comment.author.profile_image_url}
                        alt={`${comment.author.name || '익명'} 프로필`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const fallback = document.createElement('span');
                          fallback.className = 'text-xs text-gray-600';
                          fallback.textContent = comment.author?.name ? comment.author.name.charAt(0) : '?';
                          e.target.parentElement.appendChild(fallback);
                        }}
                      />
                    ) : (
                      <span className="text-xs text-gray-600">
                        {comment.author?.name ? comment.author.name.charAt(0) : '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 mb-1">
                      {comment.author?.name || '익명'}
                    </div>
                    <div className="text-sm text-gray-700">
                      {comment.body}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 페이지네이션 컴포넌트
function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex items-center justify-center space-x-6">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="text-sm text-gray-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        이전
      </button>
      
      <span className="text-sm text-gray-600">
        {currentPage} / {totalPages}
      </span>
      
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="text-sm text-gray-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        다음
      </button>
    </div>
  );
}