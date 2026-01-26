"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import ProductBarcodeModal from "../components/ProductBarcodeModal";
import ProductManagementModal from "../components/ProductManagementModal";
import PostDetailModal from "../components/PostDetailModal";
import ErrorCard from "../components/ErrorCard";
import CommentsModal from "../components/Comments";
import ToastContainer from "../components/ToastContainer";
import OrdersInfoCard from "../components/OrdersInfoCard";
import BarcodeDisplay from "../components/BarcodeDisplay";
import ProductEditRow from "../components/ProductEditRow";
import ProductAddRow from "../components/ProductAddRow";
import { useToast } from "../hooks/useToast";
import supabase from "../lib/supabaseClient";
import { syncProductsToIndexedDb } from "../lib/indexedDbSync";
import { ensurePostReadyForReprocess } from "../lib/postProcessing/ensurePostReadyForReprocess";
import { useScroll } from "../context/ScrollContext";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction"; // execution_locks 확인 기능 활성화된 버튼
import TestUpdateButton from "../components/TestUpdateButton"; // 테스트 업데이트 버튼
import { EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/24/outline";

// 네이버 이미지 프록시 헬퍼 함수
// thumbnail 옵션: 's150' (150px 정사각형), 'w300' (너비 300px), 'w580' 등
const getProxiedImageUrl = (url, options = {}) => {
  if (!url) return url;

  const { thumbnail } = options;

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
    let targetUrl = url;

    // 썸네일 옵션이 있으면 type 파라미터 추가
    if (thumbnail) {
      try {
        const u = new URL(url);
        u.searchParams.delete('type');
        u.searchParams.set('type', thumbnail);
        targetUrl = u.toString();
      } catch {
        // URL 파싱 실패 시 단순히 쿼리 추가
        targetUrl = url.includes('?') ? `${url}&type=${thumbnail}` : `${url}?type=${thumbnail}`;
      }
    }

    return `/api/image-proxy?url=${encodeURIComponent(targetUrl)}`;
  }

  return url;
};

export default function PostsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userData, setUserData] = useState(null);
  const { scrollableContentRef } = useScroll();
  const { mutate: globalMutate } = useSWRConfig();

  // URL 파라미터에서 페이지 번호 읽기 (없으면 1)
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get('page');
    return pageParam ? parseInt(pageParam, 10) : 1;
  });
  const [limit] = useState(10); // 페이지당 10개씩 표시

  // 검색 관련 상태 - sessionStorage에서 복원
  const searchInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("content");

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bandKeyStatus, setBandKeyStatus] = useState("main"); // main | backup

  // 바코드 편집 상태
  const [editingBarcode, setEditingBarcode] = useState(null); // { postKey, productId, value }
  const [savingBarcode, setSavingBarcode] = useState(null);
  const [savedBarcode, setSavedBarcode] = useState(null); // 저장 완료 배경색 표시용
  const [pendingBarcodes, setPendingBarcodes] = useState({}); // { [productId]: barcodeValue } - 저장 대기 중인 바코드

  // 상품 추가 상태 (postKey별로 관리)
  const [addingProduct, setAddingProduct] = useState({}); // { [postKey]: { title, base_price, barcode } }
  const [savingNewProduct, setSavingNewProduct] = useState(null);

  // 상품 수정 상태
  const [editingProduct, setEditingProduct] = useState(null); // product_id
  const [editingProductData, setEditingProductData] = useState({}); // { title, base_price, barcode }
  const [savingEditProduct, setSavingEditProduct] = useState(null);

  // 댓글 모달 관련 상태
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  // 상품 관리 모달 관련 상태
  const [isProductManagementModalOpen, setIsProductManagementModalOpen] = useState(false);
  const [selectedPostForProductManagement, setSelectedPostForProductManagement] = useState(null);

  // 게시물 상세 모달 관련 상태 (raw 모드용)
  const [isPostDetailModalOpen, setIsPostDetailModalOpen] = useState(false);
  const [selectedPostForDetail, setSelectedPostForDetail] = useState(null);

  // 수령일 수정 관련 상태 (postKey별로 관리)
  const [editingPickupDate, setEditingPickupDate] = useState(null); // postKey
  const [editPickupDateData, setEditPickupDateData] = useState({}); // { [postKey]: { date, time } }
  const [savingPickupDate, setSavingPickupDate] = useState(null); // postKey

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

  // 테스트 업데이트 로딩 상태
  const [isTestUpdating, setIsTestUpdating] = useState(false);
  const [testUpdateResult, setTestUpdateResult] = useState(null);
  const [isRefreshingPosts, setIsRefreshingPosts] = useState(false);
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0);
  const refreshCooldownTimerRef = useRef(null);

  // 타임아웃 상태
  const [loadTimeout, setLoadTimeout] = useState(false);

  const handleRefreshPosts = async () => {
    if (!userData?.userId || isRefreshingPosts) return;
    const now = Date.now();
    const REFRESH_MIN_MS = 1000;
    const REFRESH_COOLDOWN_MS = 3000;
    if (refreshCooldownUntil && now < refreshCooldownUntil) {
      showError("잠시 후 다시 시도해주세요.");
      return;
    }
    setRefreshCooldownUntil(now + REFRESH_COOLDOWN_MS);
    if (refreshCooldownTimerRef.current) {
      clearTimeout(refreshCooldownTimerRef.current);
    }
    refreshCooldownTimerRef.current = setTimeout(() => {
      setRefreshCooldownUntil(0);
      refreshCooldownTimerRef.current = null;
    }, REFRESH_COOLDOWN_MS);
    const start = Date.now();
    setIsRefreshingPosts(true);
    try {
      await globalMutate(
        (key) =>
          Array.isArray(key) && key[0] === "posts" && key[1] === userData.userId,
        (current) => current,
        { revalidate: true }
      );
      showSuccess("게시물/상품 정보를 최신화했습니다.");
    } catch (error) {
      showError(`새로고침 실패: ${error.message || error}`);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < REFRESH_MIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, REFRESH_MIN_MS - elapsed));
      }
      setIsRefreshingPosts(false);
    }
  };

  useEffect(() => {
    return () => {
      if (refreshCooldownTimerRef.current) {
        clearTimeout(refreshCooldownTimerRef.current);
      }
    };
  }, []);

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

  // URL 파라미터에서 페이지 번호 변경 감지
  useEffect(() => {
    const pageParam = searchParams.get('page');
    const newPage = pageParam ? parseInt(pageParam, 10) : 1;
    if (newPage !== page) {
      setPage(newPage);
    }
  }, [searchParams]);

  // 페이지 번호가 변경될 때마다 스크롤 최상단 이동
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 스크롤을 최상단으로 이동
      window.scrollTo(0, 0);
      // 저장된 스크롤 위치 초기화 (두 가지 키 모두)
      sessionStorage.removeItem('postsScrollPosition');
      sessionStorage.removeItem('postsLastScrollPosition');
    }
  }, [page]);

  // 검색 상태 복원 (클라이언트 전용)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedSearchTerm = sessionStorage.getItem("postsSearchTerm") || "";
    const savedSearchQuery = sessionStorage.getItem("postsSearchQuery") || "";
    const savedSearchType = sessionStorage.getItem("postsSearchType") || "content";

    setSearchTerm(savedSearchTerm);
    setSearchQuery(savedSearchQuery);
    setSearchType(savedSearchType);

    if (searchInputRef.current) {
      searchInputRef.current.value = savedSearchTerm;
    }
  }, []);

  // 검색 실행 시에만 sessionStorage에 저장 (searchQuery 변경 시)
  useEffect(() => {
    if (typeof window !== 'undefined' && searchQuery !== undefined) {
      sessionStorage.setItem('postsSearchQuery', searchQuery);
      sessionStorage.setItem('postsSearchTerm', searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsSearchType', searchType);
    }
  }, [searchType]);

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
    const trimmedQuery = (searchQuery || "").trim();
    const hasSearchQuery = trimmedQuery.length > 0;
    const resolvedSearchType = searchType === "product" ? "product" : "content";
    const shouldSearchProducts = resolvedSearchType === "product" && hasSearchQuery;
    const shouldSearchContent = resolvedSearchType === "content" && hasSearchQuery;

    const POSTS_SELECT_FIELDS = [
      "post_id",
      "user_id",
      "band_number",
      "band_post_url",
      "author_name",
      "author_profile",
      "title",
      "content",
      "posted_at",
      "comment_count",
      "is_product",
      "comment_sync_status",
      "ai_extraction_status",
      "order_needs_ai",
      "products_data",
      "image_urls",
      "photos_data",
      "pickup_date",
      "post_key",
      "band_key",
      "post_number",
    ].join(",");

    const PRODUCTS_SELECT_FIELDS = [
      "product_id",
      "user_id",
      "band_number",
      "title",
      "base_price",
      "barcode",
      "post_id",
      "updated_at",
      "pickup_date",
      "post_key",
      "band_key",
      "item_number",
      "quantity",
    ].join(",");

    // AbortController 생성 및 10초 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      // 상품명 검색인 경우에만 상품명으로 post_key 찾기
      let productPostKeys = [];
      if (shouldSearchProducts) {
        const { data: productsWithSearch } = await supabase
          .from('products')
          .select('post_key')
          .eq('user_id', userData.userId)
          .ilike('title', `%${trimmedQuery}%`)
          .abortSignal(controller.signal);

        if (productsWithSearch && productsWithSearch.length > 0) {
          productPostKeys = [...new Set(productsWithSearch.map(p => p.post_key))];
        }
      }

      if (shouldSearchProducts && productPostKeys.length === 0) {
        clearTimeout(timeoutId);
        return {
          posts: [],
          totalCount: 0,
          totalPages: 0,
          totalStats: {
            totalPosts: 0,
            totalProductPosts: 0,
            totalCompletedPosts: 0,
          },
        };
      }

      // 전체 통계: 카운트만 가져와 네트워크/메모리 사용 최소화
      const contentFilter = `title.ilike.%${trimmedQuery}%,content.ilike.%${trimmedQuery}%`;

      const countPosts = supabase
        .from("posts")
        .select("post_id", { count: "estimated", head: true })
        .eq("user_id", userData.userId)
        .abortSignal(controller.signal);
      const countProductPosts = supabase
        .from("posts")
        .select("post_id", { count: "estimated", head: true })
        .eq("user_id", userData.userId)
        .eq("is_product", true)
        .abortSignal(controller.signal);
      const countCompletedPosts = supabase
        .from("posts")
        .select("post_id", { count: "estimated", head: true })
        .eq("user_id", userData.userId)
        .eq("comment_sync_status", "success")
        .abortSignal(controller.signal);

      // 검색어 필터를 각 카운트 쿼리에 적용 (작성자명 제거)
      if (hasSearchQuery) {
        if (shouldSearchProducts) {
          countPosts.in('post_key', productPostKeys);
          countProductPosts.in('post_key', productPostKeys);
          countCompletedPosts.in('post_key', productPostKeys);
        } else if (shouldSearchContent) {
          countPosts.or(contentFilter);
          countProductPosts.or(contentFilter);
          countCompletedPosts.or(contentFilter);
        }
      }

      const [
        { count: totalCount },
        { count: totalProductCount },
        { count: totalCompletedCount }
      ] = await Promise.all([countPosts, countProductPosts, countCompletedPosts]);

      const totalStats = {
        totalPosts: totalCount || 0,
        totalProductPosts: totalProductCount || 0,
        totalCompletedPosts: totalCompletedCount || 0,
      };

      // 페이지네이션된 데이터 가져오기
      let query = supabase
        .from("posts")
        .select(POSTS_SELECT_FIELDS)
        .eq("user_id", userData.userId)
        .order("posted_at", { ascending: false })
        .abortSignal(controller.signal);

      // 검색어가 있으면 적용 (작성자명 제거)
      if (hasSearchQuery) {
        if (shouldSearchProducts) {
          query = query.in('post_key', productPostKeys);
        } else if (shouldSearchContent) {
          query = query.or(contentFilter);
        }
      }

      // 페이지네이션 적용
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;

      // 각 게시물의 상품 정보를 products 테이블에서 가져오기
      const postKeys = data?.map(post => post.post_key) || [];

      let productsData = [];
      if (postKeys.length > 0) {
        // 현재 페이지에 필요한 게시물의 상품만 조회
        const { data: productsResult, error: productsError } = await supabase
          .from('products')
          .select(PRODUCTS_SELECT_FIELDS)
          .eq('user_id', userData.userId)
          .in('post_key', postKeys)
          .order('item_number', { ascending: true })
          .abortSignal(controller.signal);

        if (!productsError && productsResult) {
          productsData = productsResult;
        }
      }

      // 데이터 형식 변환 - products 테이블에서 가져온 데이터를 각 게시물에 매핑
      const formattedData = data?.map(post => {
        const postProducts = productsData
          .filter(p => p.post_key === post.post_key)
          .sort((a, b) => (parseInt(a.item_number) || 0) - (parseInt(b.item_number) || 0));
        return {
          ...post,
          products: postProducts
        };
      }) || [];

      // order_needs_ai가 true인 게시물 확인
      const aiPosts = formattedData.filter(post => post.order_needs_ai);

      // 성공 시 타임아웃 클리어
      clearTimeout(timeoutId);

      return {
        posts: formattedData,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        totalStats
      };
    } catch (error) {
      // 타임아웃 클리어 (메모리 누수 방지)
      clearTimeout(timeoutId);

      // AbortError를 타임아웃 에러로 변환
      if (error.name === 'AbortError') {
        const timeoutError = new Error('데이터 로딩 시간이 초과되었습니다.');
        timeoutError.isTimeout = true;
        console.error("Posts fetch timeout:", timeoutError);
        throw timeoutError;
      }

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
    userData?.userId
      ? ['posts', userData.userId, page, limit, searchQuery, searchQuery ? searchType : 'all']
      : null,
    fetchPosts,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1분간 중복 요청 방지
      onLoadingSlow: () => {
        // 10초 후에도 로딩 중이면 타임아웃 상태 설정
        setLoadTimeout(true);
      },
      loadingTimeout: 10000 // 10초
    }
  );

  // 데이터가 로드되면 타임아웃 상태 해제
  useEffect(() => {
    if (postsData || error) {
      setLoadTimeout(false);
    }
  }, [postsData, error]);

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
  // 페이지 변경 핸들러
  const handlePageChange = (newPage) => {
    router.push(`/posts?page=${newPage}`);
  };

  const handleClearSearch = () => {
    // input ref 초기화
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setSearchTerm("");
    setSearchQuery("");
    setSearchType("content");
    handlePageChange(1);

    // sessionStorage도 초기화
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsSearchTerm', '');
      sessionStorage.setItem('postsSearchQuery', '');
      sessionStorage.setItem('postsSearchType', 'content');
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

  const handleViewOrders = (postKey, postedAt) => {
    if (!postKey) return;

    // 검색 상태만 저장 (스크롤 위치는 PostCard에서 이미 저장됨)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('postsSearchTerm', searchTerm);
      sessionStorage.setItem('postsSearchQuery', searchQuery);
    }

    // 주문 관리 페이지로 이동: postKey와 postedAt을 함께 전달
    let url = `/orders-test?postKey=${encodeURIComponent(postKey)}&ts=${Date.now()}`;
    if (postedAt) {
      url += `&postedAt=${encodeURIComponent(postedAt)}`;
    }
    router.push(url);
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

  // 상품 추가 함수
  const handleAddNewProduct = async (post, productData) => {
    if (!productData.title || !productData.base_price) {
      showError('상품명과 가격은 필수입니다.');
      return;
    }

    setSavingNewProduct(post.post_key);
    try {
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;

      if (!userId) {
        throw new Error('사용자 인증 정보를 찾을 수 없습니다.');
      }

      // DB에서 직접 최신 상품 데이터를 가져와서 최대 item_number 찾기
      const { data: existingProducts, error: fetchError } = await supabase
        .from('products')
        .select('product_id, item_number, pickup_date')
        .eq('post_key', post.post_key)
        .eq('user_id', userId);

      if (fetchError) throw fetchError;

      console.log('기존 상품 조회:', {
        post_key: post.post_key,
        user_id: userId,
        existingProducts
      });

      // item_number 기반 최대값 계산
      const maxByItemNumber = (existingProducts || []).reduce((max, p) => {
        const itemNum = parseInt(p.item_number) || 0;
        return itemNum > max ? itemNum : max;
      }, 0);

      // 기존 상품 개수 (item_number가 null인 경우 대비)
      const existingCount = (existingProducts || []).length;

      // 둘 중 큰 값을 사용하여 중복 방지
      const maxItemNumber = Math.max(maxByItemNumber, existingCount);

      console.log('계산된 maxItemNumber:', maxItemNumber, '(byItemNumber:', maxByItemNumber, ', existingCount:', existingCount, ')');

      // 기존 상품이 있으면 첫 번째 상품의 pickup_date 사용
      const existingPickupDate = existingProducts.length > 0 && existingProducts[0].pickup_date
        ? existingProducts[0].pickup_date
        : (post.pickup_date || null);

      const newItemNumber = maxItemNumber + 1;
      const postKey = post.post_key;
      const bandKey = post.band_key;
      const newProductId = `prod_${userId}_${bandKey}_${postKey}_item${newItemNumber}`;

      console.log('생성할 product_id:', newProductId);

      // product_id 중복 체크 및 삭제
      const { data: duplicateCheck, error: dupCheckError } = await supabase
        .from('products')
        .select('product_id')
        .eq('product_id', newProductId)
        .eq('user_id', userId)
        .maybeSingle();

      console.log('중복 체크 결과:', { duplicateCheck, dupCheckError });

      // 중복된 product_id가 있으면 삭제
      if (duplicateCheck) {
        console.log('중복 발견, 기존 상품 삭제 시도');
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('product_id', newProductId)
          .eq('user_id', userId);

        if (deleteError) {
          console.error('중복 상품 삭제 실패:', deleteError);
        } else {
          console.log('중복 상품 삭제 완료');
        }
      }

      const newProductData = {
        product_id: newProductId,
        user_id: userId,
        post_id: post.post_id,
        band_number: null,
        band_key: post.band_key,
        post_key: post.post_key,
        title: productData.title,
        base_price: parseFloat(productData.base_price) || 0,
        barcode: productData.barcode || '',
        quantity: 1,
        pickup_date: existingPickupDate,
        stock_quantity: 0,
        item_number: newItemNumber,
        quantity_text: '0개',
        status: '판매중',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        band_post_url: post.band_post_url,
        content: post.content,
        post_number: null,
        posted_at: post.posted_at,
        image_urls: post.image_urls || [],
        price_options: [],
        features: [],
        barcode_options: { options: [] },
        product_type: 'individual',
        products_data: {
          title: productData.title,
          price: parseFloat(productData.base_price) || 0,
          basePrice: parseFloat(productData.base_price) || 0,
          productId: newProductId,
          itemNumber: newItemNumber,
          stockQuantity: 0,
          quantityText: '0개',
          created_by_modal: true,
          created_at: new Date().toISOString(),
        }
      };

      const { data: insertedProduct, error } = await supabase
        .from('products')
        .insert(newProductData)
        .select()
        .single();

      if (error) throw error;

      await syncProductsToIndexedDb(insertedProduct || newProductData);

      if (!post?.is_product) {
        const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
        const updateResult = await ensurePostReadyForReprocess({
          supabase,
          userId,
          postKey: post.post_key,
          updates: {
            is_product: true,
            comment_sync_status: 'pending',
            last_sync_attempt: null,
            sync_retry_count: 0,
            updated_at: nowMinus9Iso
          }
        });

        if (!updateResult.success) {
          console.error('manual product add post update failed:', updateResult.error);
        } else if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent('postUpdated', {
            detail: { postKey: post.post_key, is_product: true }
          }));
        }
      }

      showSuccess('상품이 추가되었습니다.');

      // 상품 추가 상태 초기화
      setAddingProduct(prev => {
        const newState = { ...prev };
        delete newState[post.post_key];
        return newState;
      });

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

      // 데이터 새로고침
      mutate();
    } catch (error) {
      console.error('상품 추가 오류:', error);
      showError(`상품 추가 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSavingNewProduct(null);
    }
  };

  // 상품 수정 함수 (editData를 ProductEditRow에서 전달받음)
  const handleUpdateProduct = useCallback(async (productId, originalProduct, editData) => {
    // editData가 전달되지 않으면 기존 editingProductData 사용 (호환성 유지)
    const productData = editData || editingProductData;

    if (!productData.title || !productData.base_price) {
      showError('상품명과 가격은 필수입니다.');
      return;
    }

    if (!productData.item_number || productData.item_number.toString().trim() === '') {
      showError('상품 번호는 필수입니다.');
      return;
    }

    setSavingEditProduct(productId);
    try {
      const nowIso = new Date().toISOString();
      const newItemNumber = productData.item_number.toString().trim();
      const originalItemNumber = originalProduct.item_number?.toString();

      // item_number가 변경되었는지 확인
      const itemNumberChanged = newItemNumber !== originalItemNumber;

      console.log('상품 수정 시도:', {
        productId,
        newItemNumber,
        originalItemNumber,
        itemNumberChanged
      });

      if (itemNumberChanged) {
        // 같은 post_key 내에서 새로운 item_number가 이미 존재하는지 체크
        const { data: duplicateCheck, error: dupError } = await supabase
          .from('products')
          .select('product_id, item_number')
          .eq('post_key', originalProduct.post_key)
          .eq('user_id', userData.userId)
          .eq('item_number', newItemNumber)
          .maybeSingle();

        if (dupError) throw dupError;

        if (duplicateCheck && duplicateCheck.product_id !== productId) {
          showError(`상품 번호 ${newItemNumber}는 이미 사용 중입니다.`);
          setSavingEditProduct(null);
          return;
        }

        // item_number가 변경되면 product_id도 변경해야 함
        // product_id 형식: prod_${userId}_${postKey}_item${itemNumber}
        const oldProductIdParts = productId.split('_item');
        const baseProductId = oldProductIdParts[0]; // prod_${userId}_${postKey}
        const newProductId = `${baseProductId}_item${newItemNumber}`;

        console.log('product_id 변경:', {
          oldProductId: productId,
          newProductId: newProductId
        });

        // 새 product_id로 레코드 생성
        const { data: insertedProduct, error: insertError } = await supabase
          .from('products')
          .insert({
            ...originalProduct,
            product_id: newProductId,
            item_number: newItemNumber,
            title: productData.title,
            base_price: parseFloat(productData.base_price) || 0,
            barcode: productData.barcode || '',
            updated_at: nowIso
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // orders 테이블에서 기존 product_id를 새 product_id로 업데이트
        const { error: ordersUpdateError } = await supabase
          .from('orders')
          .update({ product_id: newProductId })
          .eq('product_id', productId)
          .eq('user_id', userData.userId);

        if (ordersUpdateError) {
          console.error('주문 업데이트 오류:', ordersUpdateError);
          // 주문 업데이트 실패 시에도 계속 진행 (주문이 없을 수도 있음)
        }

        // 기존 product 삭제
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('product_id', productId)
          .eq('user_id', userData.userId);

        if (deleteError) throw deleteError;

        console.log('상품 번호 변경 완료');

        await syncProductsToIndexedDb(insertedProduct || {
          ...originalProduct,
          product_id: newProductId,
          item_number: newItemNumber,
          title: productData.title,
          base_price: parseFloat(productData.base_price) || 0,
          barcode: productData.barcode || '',
          updated_at: nowIso
        });
      } else {
        // item_number가 변경되지 않았으면 일반 업데이트
        const { data: updatedProduct, error } = await supabase
          .from('products')
          .update({
            title: productData.title,
            base_price: parseFloat(productData.base_price) || 0,
            barcode: productData.barcode || '',
            updated_at: nowIso
          })
          .eq('product_id', productId)
          .eq('user_id', userData.userId)
          .select()
          .single();

        if (error) throw error;

        await syncProductsToIndexedDb(updatedProduct || {
          ...originalProduct,
          title: productData.title,
          base_price: parseFloat(productData.base_price) || 0,
          barcode: productData.barcode || '',
          updated_at: nowIso
        });
      }

      showSuccess('상품이 수정되었습니다.');

      // 편집 상태 초기화
      setEditingProduct(null);
      setEditingProductData({});

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

      // 데이터 새로고침
      await mutate();
    } catch (error) {
      console.error('상품 수정 오류:', error);
      showError(`상품 수정 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSavingEditProduct(null);
    }
  }, [editingProductData, userData?.userId, showError, showSuccess, mutate]);

  // 상품 수정 취소 핸들러 (ProductEditRow용)
  const handleCancelEdit = useCallback(() => {
    setEditingProduct(null);
    setEditingProductData({});
  }, []);

  // 검색 실행 핸들러 (Enter 또는 버튼 클릭 시)
  const handleSearch = useCallback((e) => {
    e?.preventDefault?.();
    const value = searchInputRef.current?.value?.trim() || '';
    if (value !== searchQuery) {
      setSearchQuery(value);
      setSearchTerm(value);
      setPage(1);
    }
  }, [searchQuery]);

  // 상품 삭제 함수
  const handleDeleteProduct = async (product) => {
    if (!product || !product.product_id) {
      showError('삭제할 상품 정보가 없습니다.');
      return;
    }

    const confirmMessage = `"${product.title || product.name || '상품명 미입력'}" 상품을 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      console.log('상품 삭제 시도:', {
        product_id: product.product_id,
        user_id: userData.userId
      });

      // 상품 삭제 (주문은 유지)
      const { data: deleteResult, error: productError } = await supabase
        .from('products')
        .delete()
        .eq('product_id', product.product_id)
        .eq('user_id', userData.userId)
        .select();

      console.log('삭제 결과:', { deleteResult, error: productError });

      if (productError) throw productError;

      showSuccess('상품이 삭제되었습니다.');

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

      // 데이터 새로고침 (완료 대기)
      await mutate();
    } catch (error) {
      console.error('상품 삭제 오류:', error);
      showError(`상품 삭제 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 수령일 업데이트 함수
  const handleUpdatePickupDate = async (postKey, dateData) => {
    console.log('수령일 저장 시도:', { postKey, dateData });

    if (!dateData || !dateData.date) {
      console.log('날짜 데이터 누락:', dateData);
      showError('날짜를 선택해주세요.');
      return;
    }

    // 날짜 형식 검증
    const dateParts = dateData.date.split('-');
    if (dateParts.length !== 3 || dateParts.some(part => !part)) {
      console.log('날짜 형식 오류:', dateData.date);
      showError('올바른 날짜 형식을 입력해주세요. (년, 월, 일 모두 입력 필요)');
      return;
    }

    // 날짜와 시간 조합하여 ISO 문자열 생성 (KST 타임존 명시)
    const [year, month, day] = dateParts;
    const hours = dateData.hours || '0';
    const minutes = dateData.minutes || '0';
    const ampm = dateData.ampm || '오전';

    // 12시간 형식을 24시간 형식으로 변환
    let hour24 = parseInt(hours);
    if (ampm === '오후' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm === '오전' && hour24 === 12) {
      hour24 = 0;
    }

    // KST 타임존이 명시된 ISO 문자열 생성 (+09:00)
    const pickupDateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+09:00`;

    // 새 수령일과 현재시간 비교
    const newPickupDateTime = new Date(pickupDateISO);
    const currentTime = new Date();
    const shouldResetUndeliveredStatus = newPickupDateTime > currentTime;

    // 날짜 포맷 함수
    const formatDateTime = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours();
      const ampm = hours < 12 ? '오전' : '오후';
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시`;
    };

    // 기존 수령일 찾기 (postsData에서 해당 post 찾기)
    const currentPost = postsData?.posts?.find(p => p.post_key === postKey);
    const oldPickupDate = currentPost?.pickup_date;
    const oldDateStr = oldPickupDate ? formatDateTime(new Date(oldPickupDate)) : '미정';
    const newDateStr = formatDateTime(newPickupDateTime);

    // 확인 알림
    let confirmMsg = `수령일을 변경하시겠습니까?\n\n`;
    confirmMsg += `기존: ${oldDateStr}\n`;
    confirmMsg += `변경: ${newDateStr}\n\n`;

    if (shouldResetUndeliveredStatus) {
      confirmMsg += `기존 주문들의 미수령 상태가 해제됩니다.`;
    } else {
      confirmMsg += `기존 주문들이 미수령 상태가 됩니다.`;
    }

    if (!confirm(confirmMsg)) {
      return; // 사용자가 취소하면 함수 종료
    }

    setSavingPickupDate(postKey);
    try {

      // 1. posts 테이블 업데이트
      const { error: postError } = await supabase
        .from('posts')
        .update({ pickup_date: pickupDateISO })
        .eq('post_key', postKey)
        .eq('user_id', userData.userId);

      if (postError) throw postError;

      // 2. 해당 게시물의 모든 products 업데이트
      const { error: productsError } = await supabase
        .from('products')
        .update({ pickup_date: pickupDateISO })
        .eq('post_key', postKey)
        .eq('user_id', userData.userId);

      if (productsError) throw productsError;

      // 3. orders 테이블 sub_status 업데이트
      const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
      const bandKey = currentPost?.band_key;

      if (shouldResetUndeliveredStatus) {
        // 수령일이 미래로 변경 → sub_status 초기화
        console.log('수령일이 미래로 변경되어 미수령 주문 상태를 초기화합니다.');

        const { error: ordersResetError } = await supabase
          .from('orders')
          .update({
            sub_status: null,
            updated_at: nowMinus9Iso
          })
          .eq('user_id', userData.userId)
          .eq('post_key', postKey)
          .eq('band_key', bandKey)
          .not('sub_status', 'is', null);

        if (ordersResetError) {
          console.error('주문 상태 초기화 실패:', ordersResetError);
          // 에러가 발생해도 수령일 업데이트는 계속 진행
        } else {
          console.log('미수령 주문 상태 초기화 완료');
        }
      } else if (newPickupDateTime <= currentTime) {
        // 수령일이 과거 → sub_status를 '미수령'으로 설정
        console.log('수령일이 과거이므로 주문을 미수령 상태로 설정합니다.');

        const { error: ordersUndeliveredError } = await supabase
          .from('orders')
          .update({
            sub_status: '미수령',
            updated_at: nowMinus9Iso
          })
          .eq('user_id', userData.userId)
          .eq('post_key', postKey)
          .eq('band_key', bandKey)
          .eq('status', '주문완료');

        if (ordersUndeliveredError) {
          console.error('미수령 상태 설정 실패:', ordersUndeliveredError);
        } else {
          console.log('미수령 상태 설정 완료');
        }
      }

      showSuccess('수령일이 수정되었습니다.');

      // 편집 상태 초기화
      setEditingPickupDate(null);
      setEditPickupDateData(prev => {
        const newState = { ...prev };
        delete newState[postKey];
        return newState;
      });

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

      // orders-test 페이지의 SWR 캐시 무효화 (orders 관련 모든 캐시 키)
      globalMutate(
        (key) => Array.isArray(key) && key[0] === 'orders',
        undefined,
        { revalidate: true }
      );

      // 데이터 새로고침
      mutate();
    } catch (error) {
      console.error('수령일 수정 오류:', error);
      showError(`수령일 수정 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSavingPickupDate(null);
    }
  };

  // 바코드 저장 함수
  const handleSaveBarcode = async (productId, postKey, barcodeValue) => {
    if (!barcodeValue || !barcodeValue.trim()) {
      showError('바코드를 입력해주세요.');
      return;
    }

    setSavingBarcode(productId);
    try {
      const { data: updatedProduct, error } = await supabase
        .from('products')
        .update({
          barcode: barcodeValue.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('product_id', productId)
        .eq('user_id', userData.userId)
        .select()
        .single();

      if (error) throw error;

      // 편집 상태 초기화
      setEditingBarcode(null);

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

      // 데이터 즉시 새로고침 (바코드 이미지 바로 표시)
      mutate();

      await syncProductsToIndexedDb(updatedProduct || {
        product_id: productId,
        barcode: barcodeValue.trim(),
        updated_at: new Date().toISOString()
      });

      // 성공 배경색 표시
      setSavedBarcode(productId);

      // 1초 후 배경색만 제거
      setTimeout(() => {
        setSavedBarcode(null);
      }, 1000);
    } catch (error) {
      console.error('바코드 저장 오류:', error);
      showError(`바코드 저장 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSavingBarcode(null);
    }
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

      // orders-test 페이지의 상품 캐시 무효화
      sessionStorage.removeItem('ordersProductsByPostKey');
      sessionStorage.removeItem('ordersProductsByBandPost');

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

    // 재처리 활성화 시 알림 표시
    if (isEnabled) {
      if (!confirm('이 게시물의 주문을 재추출하시겠습니까?\n\n다음 업데이트 시 진행됩니다')) {
        return;
      }
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
    // 타임아웃 에러와 일반 에러 구분
    const isTimeoutError = error.isTimeout ||
      error.name === 'AbortError' ||
      error.message?.includes('시간이 초과') ||
      error.message?.includes('AbortError') ||
      error.message?.includes('aborted');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <ErrorCard
          title="서버와 연결이 불안정합니다."
          message="다시 시도하거나 백업 페이지를 이용해주세요."
          onRetry={() => {
            setLoadTimeout(false);
            mutate();
          }}
          offlineHref="/offline-orders"
          retryLabel="다시 시도"
          className="max-w-md w-full"
        />
      </div>
    );
  }

  if (!postsData) {
    // 타임아웃이 발생한 경우 ErrorCard 표시
    if (loadTimeout) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
          <ErrorCard
            title="서버와 연결이 불안정합니다."
            message="잠시 후 다시 시도해주세요."
            onRetry={() => {
              setLoadTimeout(false);
              mutate();
            }}
            offlineHref="/offline-orders"
            retryLabel="다시 시도"
            className="max-w-md w-full"
          />
        </div>
      );
    }

    // 정상 로딩 중
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

  const searchPlaceholder =
    searchType === "product"
      ? "상품명으로 검색..."
      : "게시물 내용(제목 포함)으로 검색...";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-2 sm:px-3 py-2 sm:py-2.5">
          {/* 검색 영역 */}
          <div className="mb-2 sm:mb-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-wrap items-center gap-2"
            >
              <div className="flex items-center bg-gray-100 px-1 py-1 rounded-md border border-gray-300">
                <label
                  className={`cursor-pointer select-none rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm transition whitespace-nowrap ${
                    searchType === "content"
                      ? "bg-black text-white shadow-sm font-semibold"
                      : "text-gray-800 hover:text-gray-900"
                  }`}
                >
                  <input
                    type="radio"
                    name="postsSearchType"
                    checked={searchType === "content"}
                    onChange={() => setSearchType("content")}
                    className="sr-only"
                  />
                  내용
                </label>
                <label
                  className={`cursor-pointer select-none rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm transition whitespace-nowrap ${
                    searchType === "product"
                      ? "bg-black text-white shadow-sm font-semibold"
                      : "text-gray-800 hover:text-gray-900"
                  }`}
                >
                  <input
                    type="radio"
                    name="postsSearchType"
                    checked={searchType === "product"}
                    onChange={() => setSearchType("product")}
                    className="sr-only"
                  />
                  상품명
                </label>
              </div>
              <div className="relative flex-1 min-w-[200px] max-w-xl">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <svg
                    className="h-4 w-4 text-gray-400"
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
                  ref={searchInputRef}
                  type="text"
                  defaultValue={searchTerm}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="block w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                검색
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg
                    className="h-3 w-3 sm:h-4 sm:w-4 mr-1"
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

          {/* 통계 및 버튼 영역 배포가 안됌*/}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {/* 통계 요약 */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-center">
                <div className="text-sm sm:text-lg font-bold text-gray-900">
                  {totalStats.totalPosts}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">전체</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-lg font-bold text-blue-600">
                  {totalStats.totalProductPosts}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">상품</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-lg font-bold text-green-600">
                  {totalStats.totalCompletedPosts}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">처리완료</div>
              </div>
            </div>

            {/* 업데이트 버튼 */}
            <div className="flex items-center gap-3">
              {/* function_number가 9이면 TestUpdateButton, 아니면 UpdateButton */}
              {userData?.function_number === 9 ? (
                <div className="relative group">
                  <TestUpdateButton
                    onProcessingChange={(isProcessing, result) => {
                      setIsTestUpdating(isProcessing);
                      if (!isProcessing && result) {
                        setTestUpdateResult(result);
                        // 3초 후 결과 닫기
                        setTimeout(() => {
                          setTestUpdateResult(null);
                        }, 3000);
                      }
                    }}
                    onKeyStatusChange={({ keyStatus }) => {
                      if (keyStatus) setBandKeyStatus(keyStatus);
                    }}
                  />
                  <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    {bandKeyStatus === "backup" ? "백업키 사용중" : "기본키 사용중"}
                  </span>
                </div>
              ) : (
                <UpdateButton pageType="posts" />
              )}
              <button
                type="button"
                onClick={handleRefreshPosts}
                disabled={isRefreshingPosts || !userData?.userId || (refreshCooldownUntil && Date.now() < refreshCooldownUntil)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center min-w-[88px]"
                title="캐시를 초기화하고 최신 게시물/상품 데이터를 다시 불러옵니다"
              >
                {isRefreshingPosts ? (
                  <svg
                    className="h-4 w-4 animate-spin text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-label="로딩 중"
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
                  "새로고침"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 게시물 그리드 */}
      <div className="mx-auto p-2 sm:p-3 px-2 sm:px-3 2xl:px-20">
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg p-6 sm:p-8 text-center">
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
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.post_key} className="grid grid-cols-3 gap-1.5">
                {/* 게시물 카드 (1/3) - 모든 화면에서 표시 */}
                <div className="col-span-1">
                  <PostCard
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
                </div>

                {/* 상품정보 테이블 (2/3) - 모든 화면에서 표시 */}
                <div className="col-span-2 bg-white border border-gray-200 overflow-hidden flex flex-col">
                  <div className={`px-2 py-2 border-b border-gray-200 ${
                    (post.products && post.products.length > 0 &&
                     !post.pickup_date &&
                     !(post.products[0] && post.products[0].pickup_date))
                      ? 'bg-red-100 border-red-300'
                      : ''
                  }`}>
                    {editingPickupDate === post.post_key ? (
                      // 편집 모드
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            placeholder="2025"
                            min="2020"
                            max="2099"
                            value={(() => {
                              const date = editPickupDateData[post.post_key]?.date;
                              return date ? date.split('-')[0] : '';
                            })()}
                            onChange={(e) => {
                              const currentData = editPickupDateData[post.post_key] || { date: '', hours: '9', minutes: '0', ampm: '오전' };
                              const parts = currentData.date ? currentData.date.split('-') : ['', '', ''];
                              const newDate = `${e.target.value || ''}-${parts[1] || ''}-${parts[2] || ''}`;
                              setEditPickupDateData(prev => ({
                                ...prev,
                                [post.post_key]: { ...currentData, date: newDate }
                              }));
                            }}
                            className="w-20 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <span className="text-sm text-gray-600">년</span>
                          <input
                            type="number"
                            placeholder="11"
                            min="1"
                            max="12"
                            value={(() => {
                              const date = editPickupDateData[post.post_key]?.date;
                              return date ? parseInt(date.split('-')[1]) || '' : '';
                            })()}
                            onChange={(e) => {
                              const currentData = editPickupDateData[post.post_key] || { date: '', hours: '9', minutes: '0', ampm: '오전' };
                              const parts = currentData.date ? currentData.date.split('-') : ['', '', ''];
                              const month = e.target.value ? String(e.target.value).padStart(2, '0') : '';
                              const newDate = `${parts[0] || ''}-${month}-${parts[2] || ''}`;
                              setEditPickupDateData(prev => ({
                                ...prev,
                                [post.post_key]: { ...currentData, date: newDate }
                              }));
                            }}
                            className="w-16 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <span className="text-sm text-gray-600">월</span>
                          <input
                            type="number"
                            placeholder="18"
                            min="1"
                            max="31"
                            value={(() => {
                              const date = editPickupDateData[post.post_key]?.date;
                              return date ? parseInt(date.split('-')[2]) || '' : '';
                            })()}
                            onChange={(e) => {
                              const currentData = editPickupDateData[post.post_key] || { date: '', hours: '9', minutes: '0', ampm: '오전' };
                              const parts = currentData.date ? currentData.date.split('-') : ['', '', ''];
                              const day = e.target.value ? String(e.target.value).padStart(2, '0') : '';
                              const newDate = `${parts[0] || ''}-${parts[1] || ''}-${day}`;
                              setEditPickupDateData(prev => ({
                                ...prev,
                                [post.post_key]: { ...currentData, date: newDate }
                              }));
                            }}
                            className="w-16 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <span className="text-sm text-gray-600">일</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <select
                            value={editPickupDateData[post.post_key]?.ampm || '오전'}
                            onChange={(e) => setEditPickupDateData(prev => ({
                              ...prev,
                              [post.post_key]: { ...prev[post.post_key], ampm: e.target.value }
                            }))}
                            className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          >
                            <option value="오전">오전</option>
                            <option value="오후">오후</option>
                          </select>
                          <input
                            type="number"
                            placeholder="11"
                            min="1"
                            max="12"
                            value={editPickupDateData[post.post_key]?.hours || ''}
                            onChange={(e) => setEditPickupDateData(prev => ({
                              ...prev,
                              [post.post_key]: { ...prev[post.post_key], hours: e.target.value }
                            }))}
                            className="w-12 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <span className="text-sm text-gray-600">시</span>
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            max="59"
                            value={editPickupDateData[post.post_key]?.minutes || ''}
                            onChange={(e) => setEditPickupDateData(prev => ({
                              ...prev,
                              [post.post_key]: { ...prev[post.post_key], minutes: e.target.value }
                            }))}
                            className="w-12 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <span className="text-sm text-gray-600">분</span>
                        </div>
                        <button
                          onClick={() => handleUpdatePickupDate(post.post_key, editPickupDateData[post.post_key])}
                          disabled={savingPickupDate === post.post_key}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors"
                        >
                          {savingPickupDate === post.post_key ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingPickupDate(null);
                            setEditPickupDateData(prev => {
                              const newState = { ...prev };
                              delete newState[post.post_key];
                              return newState;
                            });
                          }}
                          className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      // 표시 모드
                      <div
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => {
                          // 현재 수령일을 편집 데이터로 설정
                          const pd = post?.pickup_date || (post.products && post.products.length > 0 ? post.products[0].pickup_date : null);
                          let dateValue = '';
                          let hoursValue = '9';
                          let minutesValue = '0';
                          let ampmValue = '오전';

                          if (pd) {
                            try {
                              const raw = new Date(pd);
                              if (!isNaN(raw.getTime())) {
                                const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
                                const year = kst.getUTCFullYear();
                                const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
                                const day = String(kst.getUTCDate()).padStart(2, '0');
                                const hour24 = kst.getUTCHours();
                                const minutes = kst.getUTCMinutes();

                                dateValue = `${year}-${month}-${day}`;
                                minutesValue = String(minutes);

                                // 24시간을 12시간 형식으로 변환
                                if (hour24 === 0) {
                                  hoursValue = '12';
                                  ampmValue = '오전';
                                } else if (hour24 < 12) {
                                  hoursValue = String(hour24);
                                  ampmValue = '오전';
                                } else if (hour24 === 12) {
                                  hoursValue = '12';
                                  ampmValue = '오후';
                                } else {
                                  hoursValue = String(hour24 - 12);
                                  ampmValue = '오후';
                                }
                              }
                            } catch (_) {}
                          } else {
                            // 수령일 미정인 경우 오늘 날짜로 초기화
                            const today = new Date();
                            const year = today.getFullYear();
                            const month = String(today.getMonth() + 1).padStart(2, '0');
                            const day = String(today.getDate()).padStart(2, '0');
                            dateValue = `${year}-${month}-${day}`;
                          }

                          setEditPickupDateData({
                            ...editPickupDateData,
                            [post.post_key]: { date: dateValue, hours: hoursValue, minutes: minutesValue, ampm: ampmValue }
                          });
                          setEditingPickupDate(post.post_key);
                        }}
                      >
                        {(() => {
                          // 수령일 계산 및 날짜 차이 계산
                          const getPickupDateWithBadge = () => {
                            const pd = post?.pickup_date || (post.products && post.products.length > 0 ? post.products[0].pickup_date : null);

                            if (!pd) {
                              return (
                                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                  수령일 미정
                                </span>
                              );
                            }

                            try {
                              const raw = new Date(pd);
                              if (isNaN(raw.getTime())) {
                                return (
                                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                    수령일 미정
                                  </span>
                                );
                              }

                              const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
                              const month = kst.getUTCMonth() + 1;
                              const day = kst.getUTCDate();
                              const hours = kst.getUTCHours();
                              const minutes = kst.getUTCMinutes();
                              const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
                              const weekday = weekdays[kst.getUTCDay()];

                              // 날짜 차이 계산 (시간 무시하고 날짜만 비교)
                              const today = new Date();
                              const todayKST = new Date(today.getTime() + 9 * 60 * 60 * 1000);
                              const todayDate = new Date(todayKST.getUTCFullYear(), todayKST.getUTCMonth(), todayKST.getUTCDate());
                              const pickupDate = new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());

                              const diffTime = pickupDate - todayDate;
                              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                              // 뱃지 텍스트 및 색상 결정
                              let badgeText = '';
                              let badgeColor = '';

                              if (diffDays === 0) {
                                badgeText = '오늘 수령';
                                badgeColor = 'bg-green-100 text-green-700';
                              } else if (diffDays === 1) {
                                badgeText = '내일';
                                badgeColor = 'bg-gray-100 text-gray-600';
                              } else if (diffDays > 1) {
                                badgeText = `${diffDays}일 후`;
                                badgeColor = 'bg-gray-100 text-gray-600';
                              } else if (diffDays === -1) {
                                badgeText = '1일 전';
                                badgeColor = 'bg-red-100 text-red-700';
                              } else {
                                badgeText = `${Math.abs(diffDays)}일 전`;
                                badgeColor = 'bg-red-100 text-red-700';
                              }

                              let timeStr = '';
                              if (hours !== 0 || minutes !== 0) {
                                const hh12 = hours % 12 === 0 ? 12 : hours % 12;
                                const ampm = hours < 12 ? '오전' : '오후';
                                timeStr = ` ${ampm} ${hh12}시`;
                              }

                              return (
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
                                    {badgeText}
                                  </span>
                                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                    {month}월 {day}일 ({weekday}){timeStr}
                                  </span>
                                </div>
                              );
                            } catch (_) {
                              return (
                                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                  수령일 미정
                                </span>
                              );
                            }
                          };

                          return getPickupDateWithBadge();
                        })()}
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {(() => {
                      const products = post.products || [];
                      const isAddingNewProduct = addingProduct[post.post_key];

                      return (
                        <table className="w-full border-collapse table-fixed">
                          <colgroup>
                            <col style={{ width: '5%' }} />
                            <col style={{ width: '35%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '15%' }} />
                          </colgroup>
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-1 py-1.5 text-center text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">번호</th>
                              <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">상품명</th>
                              <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">가격</th>
                              <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">바코드</th>
                              <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">작업</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {products.map((product, index) => {
                              const hasBarcode = product.barcode || product.productBarcode;
                              const isEditing = editingProduct === product.product_id;
                              const isSaved = savedBarcode === product.product_id;

                              if (isEditing) {
                                return (
                                  <ProductEditRow
                                    key={product.product_id || index}
                                    product={product}
                                    index={index}
                                    initialData={editingProductData}
                                    onSave={handleUpdateProduct}
                                    onCancel={handleCancelEdit}
                                    isSaving={savingEditProduct === product.product_id}
                                  />
                                );
                              }

                              return (
                                <tr key={product.product_id || index} className="hover:bg-gray-50 transition-colors relative border-b border-gray-200">
                                  <td className="px-1 py-1.5 text-center text-xs font-medium text-gray-900 border-r border-gray-200">
                                    {product.item_number || index + 1}
                                  </td>
                                  <td className="px-2 py-1.5 text-xs font-medium text-gray-900 border-r border-gray-200">
                                    {product.title || product.name || product.product_name || '상품명 미입력'}
                                  </td>
                                  <td className="px-2 py-1.5 text-xs text-gray-900 border-r border-gray-200">
                                    {product.base_price || product.price || product.basePrice ?
                                      `${(product.base_price || product.price || product.basePrice).toLocaleString()}원` :
                                      '미입력'}
                                  </td>
                                  <td className={`px-2 py-1.5 text-xs text-gray-900 border-r border-gray-200 relative transition-colors duration-500 ${isSaved ? 'bg-green-100' : ''}`}>
                                    <div className="flex flex-col items-center gap-2">
                                      {(() => {
                                        const currentBarcode = product.barcode || product.productBarcode || '';
                                        const pendingBarcode = pendingBarcodes[product.product_id];
                                        const isEditingBarcode = pendingBarcode !== undefined;

                                        // 바코드가 있고 수정 중이 아니면 이미지만 표시
                                        if (currentBarcode && !isEditingBarcode) {
                                          return (
                                            <BarcodeDisplay
                                              value={currentBarcode}
                                              height={40}
                                              width={1.5}
                                              displayValue={true}
                                              fontSize={10}
                                              margin={5}
                                              productName={product.title || product.name || product.product_name || ''}
                                              price={product.base_price || product.price || product.basePrice}
                                            />
                                          );
                                        }

                                        // 바코드가 없거나 수정 중이면 input 표시
                                        return (
                                          <>
                                            {/* 바코드 이미지 (입력값이 있을 때만) */}
                                            {(isEditingBarcode && pendingBarcode) && (
                                              <BarcodeDisplay
                                                value={pendingBarcode}
                                                height={40}
                                                width={1.5}
                                                displayValue={true}
                                                fontSize={10}
                                                margin={5}
                                                productName={product.title || product.name || product.product_name || ''}
                                                price={product.base_price || product.price || product.basePrice}
                                              />
                                            )}
                                            {/* 바코드 입력 필드 */}
                                            <input
                                              type="text"
                                              placeholder="바코드 입력"
                                              value={pendingBarcode ?? currentBarcode}
                                              onFocus={(e) => {
                                                // 다른 상품에 저장되지 않은 바코드가 있는지 확인
                                                const unsavedBarcodes = Object.entries(pendingBarcodes).filter(([pid, value]) => {
                                                  if (pid === product.product_id) return false; // 현재 상품은 제외
                                                  const prod = products.find(p => p.product_id === pid);
                                                  const originalBarcode = prod?.barcode || prod?.productBarcode || '';
                                                  return value !== originalBarcode;
                                                });

                                                if (unsavedBarcodes.length > 0) {
                                                  e.target.blur(); // 포커스 해제
                                                  alert('저장하지 않은 바코드가 있습니다. 먼저 저장해주세요.');
                                                  return;
                                                }
                                              }}
                                              onChange={(e) => {
                                                setPendingBarcodes(prev => ({
                                                  ...prev,
                                                  [product.product_id]: e.target.value
                                                }));
                                              }}
                                              className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
                                            />
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-xs text-gray-900">
                                    <div className="flex gap-1">
                                      {(() => {
                                        // 바코드가 변경되었는지 확인
                                        const currentBarcode = product.barcode || product.productBarcode || '';
                                        const pendingBarcode = pendingBarcodes[product.product_id];
                                        const hasBarcodeChanged = pendingBarcode !== undefined && pendingBarcode !== currentBarcode;

                                        return hasBarcodeChanged ? (
                                          <>
                                            <button
                                              onClick={async () => {
                                                await handleSaveBarcode(product.product_id, post.post_key, pendingBarcode);
                                                // 저장 후 pending 상태 제거
                                                setPendingBarcodes(prev => {
                                                  const newPending = { ...prev };
                                                  delete newPending[product.product_id];
                                                  return newPending;
                                                });
                                              }}
                                              disabled={savingBarcode === product.product_id}
                                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors"
                                            >
                                              {savingBarcode === product.product_id ? '저장 중...' : '저장'}
                                            </button>
                                            <button
                                              onClick={() => {
                                                // 취소: pending 상태 제거
                                                setPendingBarcodes(prev => {
                                                  const newPending = { ...prev };
                                                  delete newPending[product.product_id];
                                                  return newPending;
                                                });
                                              }}
                                              className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                                            >
                                              취소
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => {
                                                // 다른 상품에 저장되지 않은 바코드가 있는지 확인
                                                const unsavedBarcodes = Object.entries(pendingBarcodes).filter(([pid, value]) => {
                                                  if (pid === product.product_id) return false; // 현재 상품은 제외
                                                  const prod = products.find(p => p.product_id === pid);
                                                  const originalBarcode = prod?.barcode || prod?.productBarcode || '';
                                                  return value !== originalBarcode;
                                                });

                                                if (unsavedBarcodes.length > 0) {
                                                  alert('저장하지 않은 바코드가 있습니다. 먼저 저장해주세요.');
                                                  return;
                                                }

                                                // 전체 상품 정보 수정 모드로 전환
                                                setEditingProduct(product.product_id);
                                                setEditingProductData({
                                                  item_number: product.item_number,
                                                  title: product.title || product.name || product.product_name,
                                                  base_price: product.base_price || product.price || product.basePrice,
                                                  barcode: product.barcode || product.productBarcode || ''
                                                });
                                              }}
                                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded transition-colors"
                                            >
                                              수정
                                            </button>
                                            <button
                                              onClick={() => {
                                                // 저장되지 않은 바코드가 있는지 확인
                                                const unsavedBarcodes = Object.entries(pendingBarcodes).filter(([pid, value]) => {
                                                  const prod = products.find(p => p.product_id === pid);
                                                  const originalBarcode = prod?.barcode || prod?.productBarcode || '';
                                                  return value !== originalBarcode;
                                                });

                                                if (unsavedBarcodes.length > 0) {
                                                  alert('저장하지 않은 바코드가 있습니다. 먼저 저장해주세요.');
                                                  return;
                                                }

                                                handleDeleteProduct(product);
                                              }}
                                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded transition-colors"
                                            >
                                              삭제
                                            </button>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* 상품 추가 행 */}
                            {isAddingNewProduct ? (
                              <ProductAddRow
                                post={post}
                                nextItemNumber={(() => {
                                  const maxByItemNumber = products.reduce((max, p) => {
                                    const itemNum = parseInt(p.item_number) || 0;
                                    return itemNum > max ? itemNum : max;
                                  }, 0);
                                  const existingCount = products.length;
                                  return Math.max(maxByItemNumber, existingCount) + 1;
                                })()}
                                onSave={handleAddNewProduct}
                                onCancel={() => setAddingProduct(prev => {
                                  const newState = { ...prev };
                                  delete newState[post.post_key];
                                  return newState;
                                })}
                                isSaving={savingNewProduct === post.post_key}
                              />
                            ) : (
                              <tr>
                                <td colSpan="5" className="px-4 py-3">
                                  <button
                                    onClick={() => setAddingProduct(prev => ({
                                      ...prev,
                                      [post.post_key]: { title: '', base_price: '', barcode: '' }
                                    }))}
                                    className="w-full flex items-center justify-center gap-2 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors text-sm font-medium"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    상품 추가
                                  </button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>

                {/* 댓글 정보 카드 (1/7) */}
                {/* <div className="col-span-1 pl-3">
                  <OrdersInfoCard
                    bandKey={post.band_key}
                    postKey={post.post_key}
                    userId={userData?.userId}
                  />
                </div> */}
              </div>
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
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

            // 새 수령일을 Date 객체로 변환 (한국 시간 기준)
            const newPickupDateTime = new Date(datetime);
            const currentTime = new Date();

            // 수령일이 미래로 변경되었는지 확인
            const shouldResetUndeliveredStatus = newPickupDateTime > currentTime;

            // 날짜 포맷 함수
            const formatDateTime = (date) => {
              const year = date.getFullYear();
              const month = date.getMonth() + 1;
              const day = date.getDate();
              const hours = date.getHours();
              const ampm = hours < 12 ? '오전' : '오후';
              const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
              return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시`;
            };

            // 기존 수령일과 새 수령일 포맷
            const oldPickupDate = selectedPostForDetail.pickup_date;
            const oldDateStr = oldPickupDate ? formatDateTime(new Date(oldPickupDate)) : '미정';
            const newDateStr = formatDateTime(newPickupDateTime);

            // 확인 알림
            let confirmMsg = `수령일을 변경하시겠습니까?\n\n`;
            confirmMsg += `기존: ${oldDateStr}\n`;
            confirmMsg += `변경: ${newDateStr}\n\n`;

            if (shouldResetUndeliveredStatus) {
              confirmMsg += `기존 주문들의 미수령 상태가 해제됩니다.`;
            } else {
              confirmMsg += `기존 주문들이 미수령 상태가 됩니다.`;
            }

            if (!confirm(confirmMsg)) {
              return; // 사용자가 취소하면 함수 종료
            }

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

            // 3. orders 테이블 sub_status 업데이트
            const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
            const postKey = selectedPostForDetail.post_key;
            const bandKey = selectedPostForDetail.band_key;
            const userId = userData?.userId;

            if (shouldResetUndeliveredStatus) {
              // 수령일이 미래로 변경 → sub_status 초기화
              console.log('수령일이 미래로 변경되어 미수령 주문 상태를 초기화합니다.');

              const { error: ordersResetError } = await supabase
                .from('orders')
                .update({
                  sub_status: null,
                  updated_at: nowMinus9Iso
                })
                .eq('user_id', userId)
                .eq('post_key', postKey)
                .eq('band_key', bandKey)
                .not('sub_status', 'is', null);

              if (ordersResetError) {
                console.error('주문 상태 초기화 실패:', ordersResetError);
                // 에러가 발생해도 수령일 업데이트는 계속 진행
              } else {
                console.log('미수령 주문 상태 초기화 완료');
              }
            } else if (newPickupDateTime <= currentTime) {
              // 수령일이 과거 → sub_status를 '미수령'으로 설정
              console.log('수령일이 과거이므로 주문을 미수령 상태로 설정합니다.');

              const { error: ordersUndeliveredError } = await supabase
                .from('orders')
                .update({
                  sub_status: '미수령',
                  updated_at: nowMinus9Iso
                })
                .eq('user_id', userId)
                .eq('post_key', postKey)
                .eq('band_key', bandKey)
                .eq('status', '주문완료');

              if (ordersUndeliveredError) {
                console.error('미수령 상태 설정 실패:', ordersUndeliveredError);
              } else {
                console.log('미수령 상태 설정 완료');
              }
            }

            // 로컬 상태 업데이트
            selectedPostForDetail.pickup_date = datetime;
            setIsEditingPickupDate(false);

            // orders-test 페이지의 상품 캐시 무효화
            sessionStorage.removeItem('ordersProductsByPostKey');
            sessionStorage.removeItem('ordersProductsByBandPost');

            // orders-test 페이지의 SWR 캐시 무효화 (orders 관련 모든 캐시 키)
            globalMutate(
              (key) => Array.isArray(key) && key[0] === 'orders',
              undefined,
              { revalidate: true }
            );

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
                          src={getProxiedImageUrl(url, { thumbnail: 's150' })}
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

      {/* 테스트 업데이트 로딩 오버레이 */}
      {(isTestUpdating || testUpdateResult) && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
        >
          <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center gap-4 border-2 border-gray-200">
            {isTestUpdating ? (
              <>
                <svg className="animate-spin h-12 w-12 text-green-600" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div className="text-lg font-semibold text-gray-900">업데이트 진행 중...</div>
                <div className="text-sm text-gray-600">페이지를 떠나지 말고 기다려주세요</div>
              </>
            ) : testUpdateResult ? (
              <>
                <div className="text-5xl mb-2">✅</div>
                <div className="text-xl font-bold text-gray-900 mb-4">업데이트 완료</div>
                <div className="space-y-2 text-center">
                  <div className="text-lg">
                    <span className="text-gray-600">신규 게시물:</span>{' '}
                    <span className="font-bold text-green-600">{testUpdateResult.stats?.newPosts || 0}개</span>
                  </div>
                  <div className="text-lg">
                    <span className="text-gray-600">추출 상품:</span>{' '}
                    <span className="font-bold text-blue-600">{testUpdateResult.stats?.productsExtracted || 0}개</span>
                  </div>
                  <div className="text-lg">
                    <span className="text-gray-600">처리 댓글:</span>{' '}
                    <span className="font-bold text-purple-600">{testUpdateResult.stats?.commentsProcessed || 0}개</span>
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-2">3초 후 자동으로 닫힙니다</div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// 그리드용 게시물 카드 컴포넌트
function PostCard({ post, onClick, onViewOrders, onViewComments, onDeletePost, onToggleReprocess, onOpenProductManagement, onOpenProductModal }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const aiStatus = (post?.ai_extraction_status || "").toLowerCase();
  const isAiRetryPending = post?.is_product && (aiStatus === "error" || aiStatus === "failed");

  // 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

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
      className="bg-white  border border-gray-200 overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col"
    >
      {/* 상단: 프로필 & 작성자 정보 */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
            {(post.profile_image || post.author_profile) ? (
              <img
                src={getProxiedImageUrl(post.profile_image || post.author_profile, { thumbnail: 's150' })}
                alt={`${post.author_name || '익명'} 프로필`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="w-full h-full bg-blue-500 flex items-center justify-center" style={{ display: (post.profile_image || post.author_profile) ? 'none' : 'flex' }}>
              <span className="text-white font-medium text-xs">
                {post.author_name ? post.author_name.charAt(0) : '익'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">
              {post.author_name || '익명'}
            </div>
            <div className="text-xs text-gray-500">
              {formatDate(post.posted_at)}
            </div>
          </div>
        </div>

        {/* 메뉴 버튼 */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            title="메뉴"
          >
            <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
          </button>

          {/* 드롭다운 메뉴 */}
          {isMenuOpen && (
            <div className="absolute right-0 top-8 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onDeletePost(post);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                삭제하기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 중간: 본문 내용 & 이미지 */}
      <div className="flex flex-1">
        {/* 왼쪽: 텍스트 내용 */}
        <div className="flex-1 p-4">
          <div className={`text-gray-700 text-sm leading-relaxed ${isExpanded ? '' : 'line-clamp-5'}`}>
            {content || '내용 없음'}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {content && content.length > 200 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="text-blue-600 hover:text-blue-700 text-xs font-medium"
              >
                {isExpanded ? '접기' : '더보기'}
              </button>
            )}
            <span className="text-xs text-gray-600">댓글 {post.comment_count || 0}</span>
          </div>
        </div>

        {/* 오른쪽: 이미지 & 개수 */}
        {hasImages && (
          <div className="relative w-16 h-16 lg:w-24 lg:h-24 flex-shrink-0 m-2 lg:m-4">
            <img
              src={getProxiedImageUrl(mainImage, { thumbnail: 's150' })}
              alt={cleanTitle || "게시물 이미지"}
              className="w-full h-full object-cover rounded-lg"
              onError={(e) => {
                e.target.style.display = 'none';
                const parent = e.target.parentElement;
                if (parent && parent.children.length > 1) {
                  parent.children[1].style.display = 'flex';
                }
              }}
            />
            <div className="w-full h-full rounded-lg bg-gray-100 flex items-center justify-center absolute top-0 left-0" style={{ display: 'none' }}>
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* 하단: 액션 버튼 */}
      <div className="p-3 border-t border-gray-100 mt-auto">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewOrders(post.post_key, post.posted_at);
            }}
            className="flex flex-row items-center justify-center gap-1.5 py-1.5 px-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs text-gray-600">주문 보기</span>
          </button>
          {post?.band_post_url ? (
            <a
              href={post.band_post_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex flex-row items-center justify-center gap-1.5 py-1.5 px-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs text-gray-600">실시간 댓글</span>
            </a>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewComments(post);
              }}
              className="flex flex-row items-center justify-center gap-1.5 py-1.5 px-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs text-gray-600">실시간 댓글</span>
            </button>
          )}
        </div>

        {/* 누락 주문 재처리 버튼 */}
        <div className="mt-2">
          <button
            onClick={async (e) => {
              e.stopPropagation();

              // is_product가 false인 경우 true로 변경
              if (!post.is_product) {
                if (!confirm('이 게시물을 상품 게시물로 변경하시겠습니까?\n\n다음 업데이트 시 상품 추출이 진행됩니다.')) {
                  return;
                }

                try {
                  const { error } = await supabase
                    .from('posts')
                    .update({
                      is_product: true,
                      comment_sync_status: 'pending',
                      order_needs_ai: true,
                      last_sync_attempt: null,
                      sync_retry_count: 0
                    })
                    .eq('post_key', post.post_key);

                  if (error) throw error;

                  // 부모 컴포넌트에 이벤트 전달
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('postUpdated', {
                      detail: { postKey: post.post_key, is_product: true }
                    }));
                  }

                  alert('상품 게시물로 변경되었습니다. 다음 업데이트 시 상품이 추출됩니다.');
                } catch (error) {
                  console.error('is_product 업데이트 실패:', error);
                  alert(`게시물 업데이트에 실패했습니다.\n에러: ${error.message || error}`);
                }
                return;
              }

              // is_product가 true인 경우 기존 재처리 로직
              if (!onToggleReprocess) return;
              const isCurrentlyPending = post.comment_sync_status === 'pending';
              onToggleReprocess(post, !isCurrentlyPending);
            }}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-all text-xs font-medium ${
              !post.is_product
                ? 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                : isAiRetryPending || post.comment_sync_status === 'pending'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                !post.is_product
                  ? 'bg-gray-400'
                  : isAiRetryPending || post.comment_sync_status === 'pending'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-gray-400'
              }`}
            />
            <span>
              {!post.is_product
                ? '상품으로 재처리'
                : isAiRetryPending
                ? '재처리중'
                : post.comment_sync_status === 'pending'
                ? '재처리중'
                : '누락 주문 재처리'
              }
            </span>
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
