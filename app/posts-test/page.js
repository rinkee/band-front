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

  // 상품 관리 모달 관련 상태
  const [isProductManagementModalOpen, setIsProductManagementModalOpen] = useState(false);
  const [selectedPostForProductManagement, setSelectedPostForProductManagement] = useState(null);

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

  // postUpdated 이벤트 리스너 추가 (수령일 실시간 업데이트)
  useEffect(() => {
    const handlePostUpdated = (event) => {
      console.log('게시물 업데이트 이벤트 수신:', event.detail);
      // SWR 캐시 갱신하여 게시물 목록 새로고침
      mutate();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('postUpdated', handlePostUpdated);
      return () => {
        window.removeEventListener('postUpdated', handlePostUpdated);
      };
    }
  }, [mutate]);

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

  // 상품 관리 모달 열기 함수
  const handleOpenProductManagementModal = (post) => {
    setSelectedPostForProductManagement(post);
    setIsProductManagementModalOpen(true);
  };

  // 상품 관리 모달 닫기 함수
  const handleCloseProductManagementModal = () => {
    setIsProductManagementModalOpen(false);
    setSelectedPostForProductManagement(null);
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
            <UpdateButton pageType="posts" />
          </div>

          {/* 검색 */}
          <div className="mt-4">
            <form onSubmit={handleSearch} className="flex items-center space-x-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="검색..."
                className="block w-80 px-3 py-2 bg-gray-50 border-0 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-200"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-black bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                검색
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-black transition-colors"
                >
                  초기화
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* 게시물 목록 */}
      <div className="max-w-6xl mx-auto px-6 py-6">
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
          <div className="space-y-6">
            {posts.map((post) => (
              <PostItem
                key={post.post_key}
                post={post}
                onViewOrders={handleViewOrders}
                onViewComments={handleViewComments}
                onOpenProductManagement={() => handleOpenProductManagementModal(post)}
              />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
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
        onProductUpdate={handleProductUpdate}
      />

      <CommentsModal
        isOpen={isCommentsModalOpen}
        onClose={handleCloseCommentsModal}
        postKey={selectedPostForComments?.postKey}
        bandKey={selectedPostForComments?.bandKey}
        postTitle={selectedPostForComments?.productName}
        accessToken={selectedPostForComments?.accessToken}
        backupAccessToken={selectedPostForComments?.backupAccessToken}
        postContent={selectedPostForComments?.postContent}
        post={selectedPostForComments?.post}
        onToggleReprocess={handleToggleReprocess}
        onDeletePost={handleDeletePost}
        onEnableReprocess={() => {
          if (selectedPostForComments?.post) {
            handleToggleReprocess(selectedPostForComments.post, true);
            handleCloseCommentsModal();
          }
        }}
      />

      <ProductManagementModal
        isOpen={isProductManagementModalOpen}
        onClose={handleCloseProductManagementModal}
        post={selectedPostForProductManagement}
      />

      <ToastContainer toasts={toasts} hideToast={hideToast} />
    </div>
  );
}

// 새로운 게시물 아이템 컴포넌트 (좌우 레이아웃)
function PostItem({ post, onViewOrders, onViewComments, onOpenProductManagement }) {
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
    // image_urls에서 첫 번째 이미지
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
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
    }
    
    // photos_data에서 첫 번째 이미지
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
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
    }
    
    return null;
  };

  // 제목 정리 (대괄호 제거)
  const cleanTitle = (title) => {
    return title ? title.replace(/\[[^\]]+\]\s*/, '').trim() : '제목 없음';
  };

  // 내용 요약
  const summarizeContent = (content) => {
    if (!content) return '내용 없음';
    const cleaned = content.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
    return cleaned.length > 150 ? cleaned.substring(0, 150) + '...' : cleaned;
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
    <div className="border-b last:border-b-0 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 왼쪽 영역: 게시물 정보 */}
        <div className="space-y-6">
          {/* 작성자 정보 */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-600">
                {post.author_name ? post.author_name.charAt(0) : '?'}
              </span>
            </div>
            <div>
              <div className="text-sm font-medium text-black">{post.author_name || '익명'}</div>
              <div className="text-xs text-gray-500">{formatDate(post.posted_at)}</div>
            </div>
          </div>

          {/* 제목 */}
          <div>
            <h2 className="text-lg font-medium text-black leading-relaxed">
              {cleanTitle(post.title)}
            </h2>
          </div>

          {/* 이미지 */}
          {firstImage && (
            <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
              <img
                src={firstImage}
                alt="게시물 이미지"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.parentElement.innerHTML = '<div class="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">이미지 로드 실패</div>';
                }}
              />
            </div>
          )}

          {/* 내용 */}
          <div className="text-sm text-gray-600 leading-relaxed">
            {summarizeContent(post.content)}
          </div>

          {/* 최근 댓글 3개 */}
          {latestComments.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-black">최근 댓글</div>
              <div className="space-y-2">
                {latestComments.map((comment, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                      <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-gray-600">
                          {comment.author?.name ? comment.author.name.charAt(0) : '?'}
                        </span>
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

          {/* 액션 버튼들 */}
          <div className="flex space-x-4 pt-4">
            <button
              onClick={() => onViewComments(post)}
              className="text-sm text-gray-500 hover:text-black transition-colors"
            >
              댓글 보기
            </button>
            <button
              onClick={() => onViewOrders(post.post_key)}
              className="text-sm text-gray-500 hover:text-black transition-colors"
            >
              주문 관리
            </button>
          </div>
        </div>

        {/* 오른쪽 영역: 상품 정보 */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-black">상품 정보</div>
            <button
              onClick={() => onOpenProductManagement(post)}
              className="text-xs text-gray-500 hover:text-black transition-colors"
            >
              상품 추가
            </button>
          </div>

          {products.length > 0 ? (
            <div className="space-y-4">
              {products.map((product, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-black">
                        {product.title || '제품명 없음'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {product.category || '카테고리 없음'}
                      </div>
                    </div>
                    
                    {product.price && (
                      <div className="text-lg font-semibold text-black">
                        {product.price.toLocaleString()}원
                      </div>
                    )}

                    {product.quantity && (
                      <div className="text-sm text-gray-600">
                        수량: {product.quantity}
                      </div>
                    )}

                    {product.productId && (
                      <div className="text-xs text-gray-400 font-mono">
                        ID: {product.productId.split('_').pop()}
                      </div>
                    )}

                    {product.description && (
                      <div className="text-sm text-gray-600 leading-relaxed">
                        {product.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <div className="text-sm text-gray-400 mb-3">추출된 상품이 없습니다</div>
              <button
                onClick={() => onOpenProductManagement(post)}
                className="text-sm text-gray-600 hover:text-black transition-colors"
              >
                상품 추가하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 심플한 페이지네이션 컴포넌트
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
