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
import UpdateButton from "../components/UpdateButtonWithPersistentState"; // 상태 유지 업데이트 버튼

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
  const [limit] = useState(20); // 4줄 x 5개 = 20개씩 표시

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
      post: post, // 재처리를 위한 post 정보 추가
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
              <div className="flex items-center space-x-6 text-base">
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

          {/* 업데이트 버튼 */}
          <div className="mt-3">
            <UpdateButton pageType="posts" />
          </div>

          {/* 검색 바 */}
          <div className="mt-3 flex items-center justify-between">
            <form
              onSubmit={handleSearch}
              className="flex items-center space-x-3"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-6 w-6 text-gray-400"
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
                  className="block w-96 pl-10 pr-3 py-2.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-base"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                검색
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center px-4 py-2.5 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg
                    className="h-5 w-5 mr-2"
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
                <div className="text-gray-400 text-base mb-4">
                  다른 검색어를 시도해보세요.
                </div>
                <button
                  onClick={handleClearSearch}
                  className="inline-flex items-center px-4 py-2.5 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  모든 게시물 보기
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-lg">게시물이 없습니다.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
        onEnableReprocess={() => {
          if (selectedPostForComments?.post) {
            handleToggleReprocess(selectedPostForComments.post, true);
            handleCloseCommentsModal();
          }
        }}
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
    // 디버깅을 위한 로그 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      console.log('Post image data:', {
        post_key: post.post_key,
        image_urls: post.image_urls,
        photos_data: post.photos_data,
        image_urls_type: typeof post.image_urls,
        photos_data_type: typeof post.photos_data
      });
    }

    // 1. image_urls 필드 확인 (가장 우선순위)
    if (post.image_urls) {
      // 배열인 경우
      if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
        // 빈 배열이 아니고, 실제 URL이 있는지 확인
        const validUrls = post.image_urls.filter(url => url && typeof url === 'string');
        if (validUrls.length > 0) {
          return validUrls;
        }
      }
      
      // 문자열로 저장된 JSON인 경우
      if (typeof post.image_urls === 'string' && post.image_urls !== 'null' && post.image_urls !== '[]') {
        try {
          const parsed = JSON.parse(post.image_urls);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validUrls = parsed.filter(url => url && typeof url === 'string');
            if (validUrls.length > 0) {
              return validUrls;
            }
          }
        } catch (e) {
          console.error('Failed to parse image_urls:', e, post.post_key);
        }
      }
    }

    // 2. photos_data 필드 확인 (두 번째 우선순위)
    if (post.photos_data) {
      // 배열인 경우
      if (Array.isArray(post.photos_data) && post.photos_data.length > 0) {
        const urls = post.photos_data
          .map((photo) => {
            // photo가 객체이고 url 속성이 있는 경우
            if (photo && typeof photo === 'object' && photo.url) {
              return photo.url;
            }
            // photo가 직접 URL 문자열인 경우
            if (typeof photo === 'string') {
              return photo;
            }
            return null;
          })
          .filter((url) => url && typeof url === 'string');
        
        if (urls.length > 0) {
          return urls;
        }
      }
      
      // 문자열로 저장된 JSON인 경우
      if (typeof post.photos_data === 'string' && post.photos_data !== 'null' && post.photos_data !== '[]') {
        try {
          const parsed = JSON.parse(post.photos_data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const urls = parsed
              .map((photo) => {
                if (photo && typeof photo === 'object' && photo.url) {
                  return photo.url;
                }
                if (typeof photo === 'string') {
                  return photo;
                }
                return null;
              })
              .filter((url) => url && typeof url === 'string');
            
            if (urls.length > 0) {
              return urls;
            }
          }
        } catch (e) {
          console.error('Failed to parse photos_data:', e, post.post_key);
        }
      }
    }

    // 3. 이미지가 없는 경우
    return [];
  };

  const imageUrls = getImageUrls();
  const mainImage = imageUrls[0];
  const hasImages = imageUrls.length > 0;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 transition-all duration-200 cursor-pointer group"
      onClick={() => onClick(post.post_id)}
    >
      {/* 이미지 섹션 - KREAM 스타일 정사각형 */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {hasImages ? (
          <img
            src={mainImage}
            alt={post.title || "게시물 이미지"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none';
              const parent = e.target.parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="w-full h-full flex items-center justify-center bg-gray-50">
                    <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                `;
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <svg
              className="w-8 h-8 text-gray-300"
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
          </div>
        )}
      </div>

      {/* 상품 정보 섹션 - KREAM 스타일 */}
      <div className="p-3 space-y-1">
        {/* 브랜드명/작성일 */}
        <p className="text-xs text-gray-400 font-medium">
          {formatDate(post.posted_at)}
        </p>
        
        {/* 상품명 */}
        {post.products && Array.isArray(post.products) && post.products.length > 0 ? (
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
            {post.products.slice(0, 1).map((product, index) => (
              <span key={product.product_id || index}>
                {product.title || product.name}
              </span>
            ))}
            {post.products.length > 1 && (
              <span className="text-gray-500 ml-1">
                외 {post.products.length - 1}개
              </span>
            )}
          </h3>
        ) : post.title && (
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
            {post.title}
          </h3>
        )}

        {/* 가격/댓글 정보 */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            {post.products && Array.isArray(post.products) && post.products.length > 0 && post.products[0].base_price && (
              <span className="text-sm font-bold text-gray-900">
                {Number(post.products[0].base_price).toLocaleString()}원
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            댓글 {post.comment_count || 0}
          </span>
        </div>
      </div>
    </div>
  );
}

// PostCard 컴포넌트 완료 - KREAM 스타일 적용
// 원래 액션 버튼 기능들은 카드 클릭으로 대체됨

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
              className="px-3 py-2 text-base text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
            >
              1
            </button>
            {startPage > 2 && (
              <span className="px-2 py-2 text-base text-gray-400">...</span>
            )}
          </>
        )}

        {/* 이전 페이지 */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 text-base text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          ← 이전
        </button>

        {/* 페이지 번호들 */}
        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-2 text-base rounded-md transition-colors ${
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
          className="px-3 py-2 text-base text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          다음 →
        </button>

        {/* 마지막 페이지로 이동 */}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span className="px-2 py-2 text-base text-gray-400">...</span>
            )}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-2 text-base text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}
      </div>

      {/* 페이지 정보 */}
      <div className="mt-3 text-center">
        <span className="text-sm text-gray-500">
          {currentPage} / {totalPages} 페이지
        </span>
      </div>
    </div>
  );
}
