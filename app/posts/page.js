"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import ProductBarcodeModal from "../components/ProductBarcodeModal";
import ProductManagementModal from "../components/ProductManagementModal";
import PostDetailModal from "../components/PostDetailModal";
import CommentsModal from "../components/Comments";
import ToastContainer from "../components/ToastContainer";
import { useToast } from "../hooks/useToast";
import supabase from "../lib/supabaseClient";
import { useScroll } from "../context/ScrollContext";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction"; // execution_locks 확인 기능 활성화된 버튼
import TestUpdateButton from "../components/TestUpdateButton"; // 테스트 업데이트 버튼

// 네이버 이미지 프록시 헬퍼 함수
const getProxiedImageUrl = (url) => {
  if (!url) return url;

  // 네이버 도메인인지 확인
  const isNaverHost = (urlString) => {
    try {
      const u = new URL(urlString);
      const host = u.hostname.toLowerCase();
      return host.endsWith('.naver.net') ||
             host.endsWith('.naver.com') ||
             host.endsWith('.pstatic.net') ||
             host === 'naver.net' ||
             host === 'naver.com' ||
             host === 'pstatic.net';
    } catch {
      return false;
    }
  };

  // 네이버 도메인이면 프록시 사용
  if (isNaverHost(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
};

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

  // 게시물 상세 모달 관련 상태 (raw 모드용)
  const [isPostDetailModalOpen, setIsPostDetailModalOpen] = useState(false);
  const [selectedPostForDetail, setSelectedPostForDetail] = useState(null);

  // 수령일 수정 관련 상태
  const [isEditingPickupDate, setIsEditingPickupDate] = useState(false);
  const [editPickupDate, setEditPickupDate] = useState('');
  const [editPickupTime, setEditPickupTime] = useState('00:00');

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
      const detail = event?.detail || {};
      console.log('게시물 업데이트 이벤트 수신:', detail);
      // 낙관적 반영: title / is_product 가 포함되어 있으면 로컬 캐시 반영
      if (detail.postKey && (detail.title !== undefined || detail.is_product !== undefined)) {
        mutate((currentData) => {
          if (!currentData || !Array.isArray(currentData.posts)) return currentData;
          const updatedPosts = currentData.posts.map(p => {
            if (p.post_key === detail.postKey) {
              return {
                ...p,
                title: detail.title !== undefined ? detail.title : p.title,
                is_product: detail.is_product !== undefined ? detail.is_product : p.is_product,
              };
            }
            return p;
          });
          return { ...currentData, posts: updatedPosts };
        }, { revalidate: false });
      }
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

    // 주문 관리 페이지로 이동: postKey를 직접 전달 (raw 모드 지원)
    router.push(`/orders?postKey=${encodeURIComponent(postKey)}`);
  };

  // 댓글 보기 동작 - Row 모드에서는 밴드 원본으로 이동, 기본은 모달
  const handleViewComments = (post) => {
    // Row 모드 감지: 쿼리 파라미터 또는 세션 저장값을 폭넓게 지원
    const isRowMode = (() => {
      if (typeof window === 'undefined') return false;
      try {
        const params = new URLSearchParams(window.location.search);
        const qp = (params.get('view') || params.get('layout') || params.get('mode') || '').toLowerCase();
        if (qp === 'row' || qp === 'rows' || qp === 'list' || qp === 'row-mode') return true;

        const keys = ['postsViewMode', 'posts_layout', 'postsLayout', 'posts_view_mode'];
        for (const k of keys) {
          const v = (sessionStorage.getItem(k) || '').toLowerCase();
          if (v === 'row' || v === 'rows' || v === 'list' || v === 'row-mode' || v === '1' || v === 'true') return true;
        }
      } catch (_) {}
      return false;
    })();

    // Row 모드에서는 실시간 댓글 클릭 시 밴드 게시물 새 탭으로 이동
    if (isRowMode && post?.band_post_url) {
      if (typeof window !== 'undefined') {
        window.open(post.band_post_url, '_blank', 'noopener');
      }
      return;
    }

    // 기본 동작: 댓글 모달 열기
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
    console.log('handleOpenProductManagementModal called with post:', post);

    // raw 모드 확인 - 세션 데이터의 order_processing_mode / orderProcessingMode 확인
    const isRawMode = (() => {
      if (typeof window === 'undefined') return false;
      const sessionData = sessionStorage.getItem('userData');
      if (!sessionData) return false;

      try {
        const userData = JSON.parse(sessionData);
        const mode = (userData.orderProcessingMode ?? userData.order_processing_mode ?? 'legacy');
        console.log('order processing mode:', mode);
        return mode === 'raw';
      } catch (e) {
        console.error('세션 데이터 파싱 오류:', e);
        return false;
      }
    })();

    console.log('isRawMode:', isRawMode);

    if (isRawMode) {
      // raw 모드일 때는 게시물 상세 모달 열기
      console.log('Setting post for detail modal:', post);
      setSelectedPostForDetail(post);
      setIsPostDetailModalOpen(true);
    } else {
      // legacy 모드일 때는 상품 관리 모달 열기
      console.log('Setting post for product management modal:', post);
      setSelectedPostForProductManagement(post);
      setIsProductManagementModalOpen(true);
    }
  };

  // 상품 관리 모달 닫기 함수
  const handleCloseProductManagementModal = () => {
    setIsProductManagementModalOpen(false);
    setSelectedPostForProductManagement(null);
  };

  // 게시물 상세 모달 닫기 함수
  const handleClosePostDetailModal = () => {
    setIsPostDetailModalOpen(false);
    setSelectedPostForDetail(null);
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
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;

      if (!userId) {
        throw new Error('사용자 인증 정보를 찾을 수 없습니다.');
      }

      // 1. comment_orders 삭제 (raw 모드용)
      const { error: commentOrdersError } = await supabase
        .from('comment_orders')
        .delete()
        .eq('user_id', userId)
        .eq('post_key', post.post_key);

      if (commentOrdersError) {
        console.warn('comment_orders 삭제 중 오류:', commentOrdersError);
        // 에러가 있어도 계속 진행 (테이블이 없을 수도 있음)
      }

      // 2. Edge Function을 통한 나머지 삭제 (posts, products, orders)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/posts-delete?postId=${post.post_id}&userId=${userId}`,
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

  // 바코드 모달에서 "상품 추가"를 눌렀을 때, 해당 게시물에 대한 상품 관리 모달을 열어주는 핸들러
  const openProductManagementForSelected = () => {
    try {
      if (!selectedPostId) return;
      const target = posts?.find((p) => p.post_id === selectedPostId);
      if (!target) return;
      setSelectedPostForProductManagement(target);
      setIsProductManagementModalOpen(true);
    } catch (_) {}
  };

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

            {/* 통계 요약 및 업데이트 버튼 */}
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
              <div className="flex items-center gap-3">
                <UpdateButton pageType="posts" />
                <TestUpdateButton />
              </div>
            </div>
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
                className="inline-flex items-center px-4 py-2.5 border border-transparent text-base font-medium rounded-md   text-white bg-black hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600"
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
          <div className="bg-white rounded-lg   p-12 text-center">
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
          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.post_key}
                post={post}
                onClick={handlePostClick}
                onViewOrders={handleViewOrders}
                onViewComments={handleViewComments}
                onDeletePost={handleDeletePost}
                onToggleReprocess={handleToggleReprocess}
                onOpenProductManagement={() => handleOpenProductManagementModal(post)}
                onOpenProductModal={() => {
                  // 상품 버튼 전용 - 항상 ProductManagementModal 열기
                  setSelectedPostForProductManagement(post);
                  setIsProductManagementModalOpen(true);
                }}
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
        onOpenProductManagement={openProductManagementForSelected}
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

      {/* 상품 관리 모달 */}
      <ProductManagementModal
        isOpen={isProductManagementModalOpen}
        onClose={handleCloseProductManagementModal}
        post={selectedPostForProductManagement}
      />

      {/* 게시물 상세 모달 (raw 모드용) */}
      {isPostDetailModalOpen && selectedPostForDetail && (() => {
        // 수령일 수정 처리
        const handleSavePickupDate = async () => {
          try {
            const datetime = editPickupTime === '00:00'
              ? `${editPickupDate}T00:00:00+09:00`
              : `${editPickupDate}T${editPickupTime}:00+09:00`;

            // 1. posts 테이블 업데이트
            const { error: postsError } = await supabase
              .from('posts')
              .update({ pickup_date: datetime })
              .eq('post_id', selectedPostForDetail.post_id);

            if (postsError) throw postsError;

            // 2. products 테이블 업데이트 (해당 게시물의 모든 상품)
            const { error: productsError } = await supabase
              .from('products')
              .update({ pickup_date: datetime })
              .eq('post_key', selectedPostForDetail.post_key)
              .eq('user_id', userData?.userId);

            if (productsError) {
              console.error('products 테이블 업데이트 오류:', productsError);
              // products 업데이트 실패해도 계속 진행
            }

            // 로컬 상태 업데이트
            selectedPostForDetail.pickup_date = datetime;
            setIsEditingPickupDate(false);

            // 성공 메시지
            showSuccess('수령일이 업데이트되었습니다.');

            // 전체 데이터 새로고침
            mutate();
          } catch (error) {
            console.error('수령일 수정 오류:', error);
            showError('수령일 수정에 실패했습니다.');
          }
        };

        const handleStartEditPickupDate = () => {
          if (selectedPostForDetail.pickup_date) {
            const date = new Date(selectedPostForDetail.pickup_date);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            setEditPickupDate(`${year}-${month}-${day}`);
            setEditPickupTime(`${hours}:${minutes}`);
          } else {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            setEditPickupDate(`${year}-${month}-${day}`);
            setEditPickupTime('00:00');
          }
          setIsEditingPickupDate(true);
        };

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
              {/* 헤더 */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">게시물 상세</h2>
                  <button
                    onClick={handleClosePostDetailModal}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

            {/* 콘텐츠 영역 */}
            <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-120px)]">
              {/* 작성자 정보 - 간소화 */}
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                  {(selectedPostForDetail.profile_image || selectedPostForDetail.author_profile) ? (
                    <img
                      src={selectedPostForDetail.profile_image || selectedPostForDetail.author_profile}
                      alt={selectedPostForDetail.author_name || '익명'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextElementSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className="w-full h-full bg-blue-500 flex items-center justify-center" style={{ display: (selectedPostForDetail.profile_image || selectedPostForDetail.author_profile) ? 'none' : 'flex' }}>
                    <span className="text-white font-medium text-xs">
                      {selectedPostForDetail.author_name ? selectedPostForDetail.author_name.charAt(0) : '익'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{selectedPostForDetail.author_name || '익명'}</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-500">
                    {(() => {
                      const date = new Date(selectedPostForDetail.posted_at);
                      const now = new Date();
                      const diffMs = now - date;
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                      if (diffDays === 0) {
                        const hours = date.getHours();
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        const period = hours < 12 ? '오전' : '오후';
                        const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                        return `오늘 ${period} ${hour12}:${minutes}`;
                      } else if (diffDays === 1) {
                        return '어제';
                      } else if (diffDays < 7) {
                        return `${diffDays}일 전`;
                      } else {
                        return `${date.getMonth() + 1}월 ${date.getDate()}일`;
                      }
                    })()}
                  </span>
                </div>
              </div>

              {/* 제목 */}
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {selectedPostForDetail.title?.replace(/\[[^\]]+\]\s*/, '').trim() || '제목 없음'}
                </h3>

                {/* 수령일 및 밴드 링크 */}
                <div className="flex items-center gap-3 flex-wrap">
                  {isEditingPickupDate ? (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md">
                      <input
                        type="date"
                        value={editPickupDate}
                        onChange={(e) => setEditPickupDate(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="time"
                        value={editPickupTime}
                        onChange={(e) => setEditPickupTime(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        onClick={handleSavePickupDate}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setIsEditingPickupDate(false)}
                        className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    selectedPostForDetail.pickup_date ? (
                      <button
                        onClick={handleStartEditPickupDate}
                        className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm hover:bg-blue-100 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        수령일: {(() => {
                          const date = new Date(selectedPostForDetail.pickup_date);
                          const month = date.getMonth() + 1;
                          const day = date.getDate();
                          const hours = date.getHours();
                          const minutes = date.getMinutes();
                          const days = ['일', '월', '화', '수', '목', '금', '토'];
                          const dayName = days[date.getDay()];

                          if (hours === 0 && minutes === 0) {
                            return `${month}월 ${day}일(${dayName})`;
                          } else {
                            const period = hours < 12 ? '오전' : '오후';
                            const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                            return `${month}월 ${day}일(${dayName}) ${period} ${hour12}:${minutes.toString().padStart(2, '0')}`;
                          }
                        })()}
                        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={handleStartEditPickupDate}
                        className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-sm hover:bg-gray-200 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        수령일 추가
                      </button>
                    )
                  )}

                  {selectedPostForDetail.band_post_url && (
                    <a
                      href={selectedPostForDetail.band_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md text-sm transition-colors"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      밴드에서 보기
                    </a>
                  )}
                </div>
              </div>

              {/* 내용 */}
              <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <div className="text-gray-700 whitespace-pre-wrap break-words">
                  {selectedPostForDetail.content || '내용이 없습니다.'}
                </div>
              </div>

              {/* 이미지 */}
              {selectedPostForDetail.image_urls && selectedPostForDetail.image_urls.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">첨부 이미지</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {(Array.isArray(selectedPostForDetail.image_urls) ? selectedPostForDetail.image_urls : JSON.parse(selectedPostForDetail.image_urls || '[]')).slice(0, 4).map((url, index) => (
                      <div key={index} className="relative w-full h-40 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        <img
                          src={getProxiedImageUrl(url)}
                          alt={`이미지 ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const parent = e.target.parentElement;
                            if (parent) {
                              parent.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center bg-gray-50">
                                  <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              `;
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 연결된 상품 정보 */}
              {selectedPostForDetail.products_data && (
                <div className="border-t pt-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">연결된 상품</h4>
                  {(() => {
                    console.log('products_data:', selectedPostForDetail.products_data);

                    const products = Array.isArray(selectedPostForDetail.products_data)
                      ? selectedPostForDetail.products_data
                      : (selectedPostForDetail.products_data?.products || []);

                    if (products.length === 0) {
                      return <p className="text-gray-500 text-sm">연결된 상품이 없습니다.</p>;
                    }

                    return (
                      <div className="space-y-2">
                        {products.map((product, index) => {
                          console.log('Product data:', product);

                          return (
                            <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <h5 className="font-medium text-gray-900">
                                    {product.name || product.title || product.product_name || `상품 ${index + 1}`}
                                  </h5>

                                  <div className="flex items-center gap-4 mt-1 text-sm">
                                    <span className="text-gray-600">
                                      가격: <span className="font-medium text-gray-900">
                                        {product.price || product.base_price || product.basePrice || '미입력'}
                                        {(product.price || product.base_price || product.basePrice) && '원'}
                                      </span>
                                    </span>

                                    <span className="text-gray-600">
                                      바코드: <span className="font-medium text-gray-900">
                                        {product.barcode || product.productBarcode || '미입력'}
                                      </span>
                                    </span>

                                    {(product.quantity !== undefined && product.quantity !== null) && (
                                      <span className="text-gray-600">
                                        수량: <span className="font-medium text-gray-900">{product.quantity}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* 이미지 */}
                                {(product.image_url || product.imageUrl || product.imageURL) && (
                                  <div className="w-16 h-16 bg-gray-100 rounded-md ml-3 flex-shrink-0 overflow-hidden">
                                    <img
                                      src={product.image_url || product.imageUrl || product.imageURL}
                                      alt={product.name || product.title || '상품 이미지'}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const parent = e.target.parentElement;
                                        if (parent) {
                                          parent.innerHTML = `
                                            <div class="w-full h-full flex items-center justify-center bg-gray-50">
                                              <svg class="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          `;
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 하단 액션 버튼 */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    if (confirm(`"${selectedPostForDetail.title || '제목 없음'}" 게시물을 삭제하시겠습니까?\n\n⚠️ 연관된 모든 상품과 주문 데이터가 함께 삭제됩니다.\n삭제된 데이터는 복구할 수 없습니다.`)) {
                      handleDeletePost(selectedPostForDetail);
                      handleClosePostDetailModal();
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    게시물 삭제
                  </span>
                </button>
                <button
                  onClick={handleClosePostDetailModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 토스트 알림 컨테이너 */}
      <ToastContainer toasts={toasts} hideToast={hideToast} />
    </div>
  );
}

// 그리드용 게시물 카드 컴포넌트
function PostCard({ post, onClick, onViewOrders, onViewComments, onDeletePost, onToggleReprocess, onOpenProductManagement, onOpenProductModal }) {
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
    if (Number.isNaN(date.getTime())) return "-";

    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // 1분 미만인 경우
    if (diffMinutes < 1) {
      return '방금 전';
    }
    // 1시간 미만인 경우
    if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    }
    // 24시간 미만인 경우
    if (diffHours < 24) {
      return `${diffHours}시간 전`;
    }
    // 7일 미만인 경우
    if (diffDays < 7) {
      return `${diffDays}일 전`;
    }
    // 7일 이상인 경우
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${m}월 ${d}일`;
  };

  // 이미지 URL 파싱 개선
  const getImageUrls = () => {

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

  // 수령일 추출 함수 (fallback용 - 제목에서 추출)
  const extractDeliveryDate = (title) => {
    const match = title.match(/\[([^\]]+)\]/);
    if (match) {
      const dateStr = match[1];
      // "9월8일" 형태를 파싱해서 요일과 "수령" 텍스트 추가
      const dateMatch = dateStr.match(/(\d+)월(\d+)일/);
      if (dateMatch) {
        const month = parseInt(dateMatch[1]);
        const day = parseInt(dateMatch[2]);
        const currentYear = new Date().getFullYear();
        const date = new Date(currentYear, month - 1, day);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = days[date.getDay()];
        return `${month}월${day}일 ${dayName} 수령`;
      }
      return `${dateStr} 수령`; // 파싱 실패 시에도 "수령" 추가
    }
    return null;
  };

  // 제목에서 수령일 제거하여 순수 제목 추출
  const extractCleanTitle = (title) => {
    return title.replace(/\[[^\]]+\]\s*/, '').trim();
  };

  // 내용을 3줄까지 표시하도록 줄이기
  const formatContent = (content) => {
    if (!content) return "";
    // HTML 태그 제거
    const cleanContent = content.replace(/<[^>]*>/g, '');
    // 줄바꿈으로 분할하여 3줄까지만 표시
    const lines = cleanContent.split('\n').filter(line => line.trim()).slice(0, 3);
    return lines.join('\n');
  };

  const imageUrls = getImageUrls();
  const mainImage = imageUrls[0];
  const hasImages = imageUrls.length > 0;
  
  const title = post.title || '';
  const content = post.content || '';
  
  // posts 테이블의 pickup_date 기반으로 수령일 계산 (KST 표기를 위해 +9h 보정)
  const getPickupDateFromPost = () => {
    const pd = post?.pickup_date;
    if (!pd) return null;
    try {
      const raw = new Date(pd);
      if (isNaN(raw.getTime())) return null;
      const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
      const month = kst.getUTCMonth() + 1;
      const day = kst.getUTCDate();
      const hours = kst.getUTCHours();
      const minutes = kst.getUTCMinutes();
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dow = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())).getUTCDay();
      const dayName = days[dow];
      if (hours !== 0 || minutes !== 0) {
        const hh12 = hours % 12 === 0 ? 12 : hours % 12;
        const ampm = hours < 12 ? '오전' : '오후';
        const timeStr = `${ampm} ${hh12}:${minutes.toString().padStart(2, '0')}`;
        return `${month}월${day}일 ${dayName} ${timeStr} 수령`;
      }
      return `${month}월${day}일 ${dayName} 수령`;
    } catch (_) {
      return null;
    }
  };

  // products 테이블의 pickup_date 기반으로 수령일 계산 (백업용, KST 표기 +9h)
  const getPickupDateFromProducts = () => {
    if (post.products && post.products.length > 0) {
      const firstProduct = post.products[0];
      if (firstProduct.pickup_date) {
        try {
          const raw = new Date(firstProduct.pickup_date);
          if (!isNaN(raw.getTime())) {
            const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
            const month = kst.getUTCMonth() + 1;
            const day = kst.getUTCDate();
            const hours = kst.getUTCHours();
            const minutes = kst.getUTCMinutes();
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const dow = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())).getUTCDay();
            const dayName = days[dow];
            if (hours !== 0 || minutes !== 0) {
              const hh12 = hours % 12 === 0 ? 12 : hours % 12;
              const ampm = hours < 12 ? '오전' : '오후';
              const timeStr = `${ampm} ${hh12}:${minutes.toString().padStart(2, '0')}`;
              return `${month}월${day}일 ${dayName} ${timeStr} 수령`;
            }
            return `${month}월${day}일 ${dayName} 수령`;
          }
        } catch (e) {
          console.log('pickup_date 파싱 실패:', e);
        }
      }
    }
    return null;
  };
  
  const deliveryDate = getPickupDateFromPost() || getPickupDateFromProducts() || extractDeliveryDate(title);
  const cleanTitle = extractCleanTitle(title);
  const shortContent = formatContent(content);

  return (
    <div
      className="bg-white rounded-lg   border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col"
      onClick={() => onOpenProductManagement && onOpenProductManagement()}
    >
      {/* 헤더 - 작성자 정보와 작성 시간 */}
      <div className="p-4 flex-grow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200">
              {(post.profile_image || post.author_profile) ? (
                <img
                  src={getProxiedImageUrl(post.profile_image || post.author_profile)}
                  alt={`${post.author_name || '익명'} 프로필`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="w-full h-full bg-blue-500 flex items-center justify-center" style={{ display: (post.profile_image || post.author_profile) ? 'none' : 'flex' }}>
                <span className="text-white font-medium text-sm">
                  {post.author_name ? post.author_name.charAt(0) : '익'}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {post.author_name || '익명'}
              </div>
              <div className="text-xs text-gray-500">
                {post.posted_at || '-'}
              </div>
            </div>
          </div>
          {/* 수령일 표시 - 공지사항(is_product가 false)이 아닌 경우만 표시 */}
          {deliveryDate && post.is_product !== false && (
            <div className="text-xs text-gray-600 font-medium bg-blue-50 px-2 py-1 rounded">
              {deliveryDate}
            </div>
          )}
        </div>

        {/* 제목 */}
        <h3 className="font-bold text-gray-600 mb-2 line-clamp-2 text-lg leading-snug">
          {cleanTitle || '제목 없음'}
        </h3>

        {/* 내용 */}
        <p className="text-gray-600 text-base line-clamp-3 leading-relaxed mb-3">
          {shortContent || '내용 없음'}
        </p>
      </div>

      {/* 이미지 섹션 - 이미지가 없어도 최소 높이 유지 */}
      <div className="relative h-64 bg-gray-100">
        {hasImages ? (
          <img
            src={getProxiedImageUrl(mainImage)}
            alt={cleanTitle || "게시물 이미지"}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              const parent = e.target.parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="w-full h-full flex items-center justify-center bg-gray-50">
                    <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                    </svg>
                  </div>
                `;
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* 하단 액션 영역 */}
      <div className="p-3">
        {/* 3개 버튼 그리드 */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // 상품 버튼은 항상 ProductManagementModal을 열어야 함
              onOpenProductModal && onOpenProductModal();
            }}
            className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm text-gray-600 mt-0.5">상품</span>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onViewOrders(post.post_key);
            }}
            className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm text-gray-600 mt-0.5">주문</span>
          </button>
          {post?.band_post_url ? (
            <a
              href={post.band_post_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm text-gray-600 mt-0.5">실시간 댓글</span>
            </a>
          ) : (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onViewComments(post);
              }}
              className="flex flex-col items-center justify-center py-2 px-1 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm text-gray-600 mt-0.5">실시간 댓글</span>
            </button>
          )}
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
    <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
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
