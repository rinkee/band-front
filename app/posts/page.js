"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import ProductBarcodeModal from "../components/ProductBarcodeModal";
import CommentsModal from "../components/Comments";
import ToastContainer from "../components/ToastContainer";
import { useToast } from "../hooks/useToast";
import supabase from "../lib/supabaseClient";
import { useScroll } from "../context/ScrollContext";

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
  const [limit] = useState(18); // 3x6 = 18개씩

  // 검색 관련 상태 - sessionStorage에서 복원
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
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 댓글 모달 관련 상태
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

  // 재처리 알림 표시 여부 (세션 스토리지로 관리)
  const [hasShownReprocessAlert, setHasShownReprocessAlert] = useState(false);

  // 사용자 데이터 가져오기
  useEffect(() => {
    const sessionData = sessionStorage.getItem("userData");
    if (sessionData) {
      const userDataObj = JSON.parse(sessionData);
      setUserData(userDataObj);
    } else {
      router.push("/login");
    }

    // 재처리 알림 표시 여부 확인
    const alertShown = sessionStorage.getItem("reprocessAlertShown");
    if (alertShown) {
      setHasShownReprocessAlert(true);
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

  // 스크롤 위치 실시간 저장
  useEffect(() => {
    if (!scrollableContentRef?.current) return;
    
    let scrollTimer;
    
    const handleScroll = () => {
      // 디바운싱으로 성능 최적화
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const container = scrollableContentRef.current;
        if (container) {
          const scrollPos = container.scrollTop;
          
          if (scrollPos >= 0) {
            sessionStorage.setItem('postsLastScrollPosition', scrollPos.toString());
            // 스크롤 위치 저장됨
          }
        }
      }, 100);
    };

    const container = scrollableContentRef.current;
    container.addEventListener('scroll', handleScroll);

    // 클린업 함수
    return () => {
      clearTimeout(scrollTimer);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scrollableContentRef]);

  // Supabase에서 직접 posts 데이터 가져오기
  const fetchPosts = async () => {
    try {
      // 전체 통계를 위한 별도 쿼리
      let statsQuery = supabase
        .from("posts")
        .select("is_product, comment_sync_status", { count: 'exact', head: false })
        .eq("user_id", userData.userId);

      // 검색어가 있으면 통계 쿼리에도 적용
      if (searchQuery) {
        statsQuery = statsQuery.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`);
      }

      const { data: statsData, count: totalCount } = await statsQuery;

      // 전체 통계 계산
      const totalStats = {
        totalPosts: totalCount || 0,
        totalProductPosts: statsData?.filter(post => post.is_product).length || 0,
        totalCompletedPosts: statsData?.filter(post => post.comment_sync_status === 'success').length || 0,
      };

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

      // 데이터 형식 변환 - products_data JSONB 필드에서 products 추출
      const formattedData = data?.map(post => {
        return {
          ...post,
          products: Array.isArray(post.products_data) ? post.products_data : []
        };
      }) || [];

      // order_needs_ai가 true인 게시물 확인
      const aiPosts = formattedData.filter(post => post.order_needs_ai);

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
  } = useSWR(
    userData?.userId ? ['posts', userData.userId, page, limit, searchQuery] : null,
    fetchPosts,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  // 데이터 로딩 완료 후 스크롤 위치 복원
  useEffect(() => {
    // postsData가 로드되고, sessionStorage에 스크롤 위치가 있을 때
    if (postsData && postsData.posts && scrollableContentRef?.current) {
      // 두 가지 키 모두 확인 (postsScrollPosition 또는 postsLastScrollPosition)
      const savedScrollPosition = sessionStorage.getItem('postsScrollPosition') || 
                                  sessionStorage.getItem('postsLastScrollPosition');
      
      if (savedScrollPosition) {
        const position = parseInt(savedScrollPosition, 10);
        
        // 즉시 복원 시도
        if (scrollableContentRef.current) {
          scrollableContentRef.current.scrollTop = position;
          // 스크롤 위치 즉시 복원
        }
        
        // 이미지 로딩을 위한 추가 복원 (더 짧은 지연)
        const scrollTimeout = setTimeout(() => {
          if (scrollableContentRef.current) {
            scrollableContentRef.current.scrollTop = position;
            // 스크롤 위치 복원 확인
          }
          
          // 복원 후 삭제 (한 번만 복원)
          sessionStorage.removeItem('postsScrollPosition');
        }, 100); // 100ms로 줄임

        return () => clearTimeout(scrollTimeout);
      }
    }
  }, [postsData, scrollableContentRef]);

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
    
    // sessionStorage도 초기화
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsSearchTerm', '');
      sessionStorage.setItem('postsSearchQuery', '');
      sessionStorage.setItem('postsPageNumber', '1');
      sessionStorage.removeItem('postsScrollPosition'); // 스크롤 위치도 초기화
      sessionStorage.removeItem('postsLastScrollPosition'); // 실시간 저장된 스크롤 위치도 초기화
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

  const handleProductUpdate = (updatedProduct) => {
    // 바코드 업데이트 후 posts 데이터 즉시 반영
    console.log("Posts 페이지: 바코드 업데이트 후 즉시 반영", updatedProduct);
    
    // 낙관적 업데이트 - 즉시 UI에 반영
    mutate(
      (currentData) => {
        if (!currentData || !currentData.posts) return currentData;
        
        const updatedPosts = currentData.posts.map(post => {
          if (post.post_id === selectedPostId) {
            // 상품 데이터 업데이트
            const updatedProducts = post.products?.map(p => 
              p.product_id === updatedProduct?.product_id ? updatedProduct : p
            ) || [];
            
            return {
              ...post,
              products: updatedProducts,
              products_data: updatedProducts // products_data도 업데이트
            };
          }
          return post;
        });
        
        return {
          ...currentData,
          posts: updatedPosts
        };
      },
      {
        revalidate: false // 서버 요청 없이 로컬 데이터만 업데이트
      }
    );
    
    // 이후 백그라운드에서 서버 데이터 동기화
    setTimeout(() => {
      mutate(); // 서버에서 최신 데이터 가져오기
    }, 1000);
  };

  const handleViewOrders = (postKey) => {
    if (!postKey) return;

    // 페이지 상태만 저장 (스크롤 위치는 PostCard에서 이미 저장됨)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsPageNumber', page.toString());
      sessionStorage.setItem('postsSearchTerm', searchTerm);
      sessionStorage.setItem('postsSearchQuery', searchQuery);
    }

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
      backupAccessToken: userData.band_backup_access_token, // 백업 토큰 추가
      postContent: post.content || "",
    });
    setIsCommentsModalOpen(true);
  };

  // 댓글 모달 닫기 함수
  const handleCloseCommentsModal = () => {
    setIsCommentsModalOpen(false);
    setSelectedPostForComments(null);
  };

  // 게시물 삭제 함수
  const handleDeletePost = async (post) => {
    if (!post || !post.post_id) {
      showError('삭제할 게시물 정보가 없습니다.');
      return;
    }

    // 연관 데이터 확인
    let confirmMessage = `"${post.title || '제목 없음'}" 게시물을 삭제하시겠습니까?\n\n`;
    
    // 상품 정보 표시
    if (post.products && Array.isArray(post.products) && post.products.length > 0) {
      confirmMessage += `⚠️ 연관된 상품 ${post.products.length}개가 함께 삭제됩니다.\n`;
    }
    
    confirmMessage += `⚠️ 연관된 모든 주문 데이터가 함께 삭제됩니다.\n\n`;
    confirmMessage += `삭제된 데이터는 복구할 수 없습니다.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Edge Function을 통한 삭제 요청
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/posts-delete?postId=${post.post_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || '게시물 삭제에 실패했습니다.');
      }

      // 성공 메시지 표시
      showSuccess(`삭제 완료: ${result.message}`);
      
      // 데이터 새로고침
      mutate();
      
    } catch (error) {
      console.error('게시물 삭제 오류:', error);
      showError(`게시물 삭제 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 댓글 재처리 토글 함수
  const handleToggleReprocess = async (post, isEnabled) => {
    if (!post || !post.post_key) {
      showError('게시물 정보가 없습니다.');
      return;
    }

    // 최초 클릭 시 알림 표시
    if (!hasShownReprocessAlert && isEnabled) {
      alert('⚠️ 누락 주문 재처리 안내\n\n이 기능을 활성화하면 다음 자동 업데이트 시(보통 1-5분 이내) 해당 게시물의 댓글을 다시 가져와서 누락된 주문을 재처리합니다.\n\n실시간으로 처리되지 않고, 다음 업데이트 시점에 처리됩니다.');
      sessionStorage.setItem("reprocessAlertShown", "true");
      setHasShownReprocessAlert(true);
    }

    try {
      if (isEnabled) {
        // 재처리 활성화 - pending으로 변경
        const { error } = await supabase
          .from('posts')
          .update({ 
            comment_sync_status: 'pending',
            last_sync_attempt: null,
            sync_retry_count: 0
          })
          .eq('post_key', post.post_key);

        if (error) throw error;
        showSuccess(`누락 주문 재처리 예약됨 (다음 업데이트 시 적용)`);
      } else {
        // 재처리 비활성화 - completed로 변경
        const { error } = await supabase
          .from('posts')
          .update({ 
            comment_sync_status: 'completed'
          })
          .eq('post_key', post.post_key);

        if (error) throw error;
        showSuccess(`재처리 예약 취소됨`);
      }
      
      // 데이터 새로고침
      mutate();
      
    } catch (error) {
      console.error('재처리 토글 오류:', error);
      showError(`설정 변경 중 오류가 발생했습니다: ${error.message}`);
    }
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
                onDeletePost={handleDeletePost}
                onToggleReprocess={handleToggleReprocess}
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
        onClose={() => {
          handleCloseModal();
          // 모달 닫을 때도 데이터 동기화
          mutate();
        }}
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
        backupAccessToken={selectedPostForComments?.backupAccessToken}
        postContent={selectedPostForComments?.postContent}
      />

      {/* 토스트 알림 컨테이너 */}
      <ToastContainer toasts={toasts} hideToast={hideToast} />
    </div>
  );
}

// 그리드용 게시물 카드 컴포넌트
function PostCard({ post, onClick, onViewOrders, onViewComments, onDeletePost, onToggleReprocess }) {
  // 사용자 친화적인 상태 표시
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending':
        return { text: '재처리 예약됨', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
      case 'processing':
        return { text: '처리 중...', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' };
      case 'completed':
      case 'success':
        return { text: '처리 완료', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' };
      case 'failed':
      case 'error':
        return { text: '처리 실패', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
      default:
        return { text: '대기 중', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' };
    }
  };

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
    // image_urls 필드에서 이미지 URL 배열 가져오기
    if (post.image_urls && Array.isArray(post.image_urls)) {
      return post.image_urls;
    }

    // photos_data가 있으면 URL 추출
    if (post.photos_data && Array.isArray(post.photos_data)) {
      const urls = post.photos_data
        .map((photo) => photo.url)
        .filter((url) => url);
      return urls;
    }

    // 혹시 image_urls가 JSON 문자열로 저장되어 있다면
    if (typeof post.image_urls === "string") {
      try {
        const parsed = JSON.parse(post.image_urls);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  };

  const imageUrls = getImageUrls();
  const mainImage = imageUrls[0];
  const hasImages = imageUrls.length > 0;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col"
      onClick={() => onClick(post.post_id)}
    >
      {/* 내용 섹션 - 고정 높이 */}
      <div className="p-4 flex-grow">
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
        {post.products && Array.isArray(post.products) && post.products.length > 0 && (
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
              {post.products.slice(0, 1).map((product, index) => (
                <div key={product.product_id || index}>
                  {product.title || product.name}{" "}
                  {(product.base_price || product.price) &&
                    `${Number(product.base_price || product.price).toLocaleString()}원`}
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

      {/* 이미지 섹션 - 고정 높이 유지 */}
      <div className="relative h-64 bg-gray-100">
        {hasImages ? (
          <img
            src={mainImage}
            alt={post.title || "게시물 이미지"}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = "/default-avatar.png"; // fallback 이미지
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-300 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-gray-400 text-sm">이미지 없음</span>
            </div>
          </div>
        )}
      </div>

      {/* 하단 섹션 - 컴팩트한 디자인 */}
      <div className="p-3">
        {/* 메인 액션 버튼들 - 더 작게 */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* 바코드 등록 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(post.post_id);
            }}
            className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
            <span className="text-xs text-gray-600 mt-0.5">바코드</span>
          </button>

          {/* 주문보기 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewOrders(post.post_key);
            }}
            className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg
              className="w-4 h-4 text-gray-600"
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
            <span className="text-xs text-gray-600 mt-0.5">주문</span>
          </button>

          {/* 실시간 댓글 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewComments(post);
            }}
            className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg
              className="w-4 h-4 text-gray-600"
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
            <span className="text-xs text-gray-600 mt-0.5">실시간 댓글</span>
          </button>
        </div>
        
        {/* 추가 옵션들 - 더 컴팩트하게 */}
        <div className="mt-2 flex items-center justify-between gap-2">
          {/* 재처리 스위치 - 미니멀 디자인, is_product가 true일 때만 활성화 */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!post.is_product) return; // is_product가 false면 클릭 무시
                const isCurrentlyPending = post.comment_sync_status === 'pending';
                onToggleReprocess(post, !isCurrentlyPending);
              }}
              disabled={!post.is_product}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                !post.is_product
                  ? 'bg-gray-100 cursor-not-allowed'
                  : post.comment_sync_status === 'pending'
                  ? 'bg-amber-500'
                  : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full transition-transform ${
                  !post.is_product
                    ? 'bg-gray-300'
                    : post.comment_sync_status === 'pending'
                    ? 'translate-x-5 bg-white'
                    : 'translate-x-1 bg-white'
                }`}
              />
            </button>
            <span className={`text-xs ${
              !post.is_product
                ? 'text-gray-300'
                : post.comment_sync_status === 'pending'
                ? 'text-amber-600 font-medium'
                : 'text-gray-400'
            }`}>
              {!post.is_product 
                ? '상품이 아님' 
                : post.comment_sync_status === 'pending' 
                ? '누락주문 재처리 예약' 
                : '누락주문 재처리'
              }
            </span>
          </div>
          
          {/* 삭제 버튼 - 아이콘만 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeletePost(post);
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="삭제"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
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
