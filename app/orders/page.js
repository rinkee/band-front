"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { api } from "../lib/fetcher"; // API 클라이언트 경로 확인 필요
import JsBarcode from "jsbarcode";
import { useOrders, useProducts, useOrderStats } from "../hooks"; // useOrderStats 추가

// 바코드 컴포넌트
const Barcode = ({ value, width = 2, height = 60, fontSize = 16 }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width: width,
          height: height,
          displayValue: true, // 바코드 아래에 값 표시
          fontSize: fontSize,
          margin: 10,
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
        // 오류 발생 시 바코드 영역 비우기 (선택적)
        if (barcodeRef.current) {
          barcodeRef.current.innerHTML = "";
        }
      }
    } else if (barcodeRef.current) {
      // value가 없을 때도 영역 비우기
      barcodeRef.current.innerHTML = "";
    }
  }, [value, width, height, fontSize]);

  // value가 없으면 아무것도 렌더링하지 않음 (또는 placeholder)
  if (!value)
    return (
      <div className="text-center text-xs text-gray-400 my-4">
        바코드 정보 없음
      </div>
    );

  // SVG 요소에 ref를 연결하고 스타일 적용
  return <svg ref={barcodeRef} className="w-full max-w-xs mx-auto block"></svg>;
};

export default function OrdersPage() {
  const router = useRouter();
  const topRef = useRef(null); // 페이지 상단 스크롤용
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]); // 주문 목록
  const [searchTerm, setSearchTerm] = useState(""); // 검색어
  const [sortBy, setSortBy] = useState("ordered_at"); // 정렬 필드
  const [sortOrder, setSortOrder] = useState("desc"); // 정렬 순서 (asc, desc)
  const [filterStatus, setFilterStatus] = useState("all"); // 상태 필터
  const [currentPage, setCurrentPage] = useState(1); // 현재 페이지 번호
  const [itemsPerPage] = useState(30); // 페이지당 항목 수 (백엔드와 일치 필요)
  const [products, setProducts] = useState([]); // 상품 목록 (상품명 조회용)

  // --- 상세 정보 모달 상태 ---
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false); // 모달 표시 여부
  const [selectedOrder, setSelectedOrder] = useState(null); // 현재 선택된 주문 데이터
  const [isEditingDetails, setIsEditingDetails] = useState(false); // 모달 내 편집 모드 여부
  const [tempItemNumber, setTempItemNumber] = useState(1); // 편집 중인 상품 번호 임시 저장
  const [tempQuantity, setTempQuantity] = useState(1); // 편집 중인 수량 임시 저장
  const [tempPrice, setTempPrice] = useState(0); // 편집 중인 단가 임시 저장
  // 모달 내 활성 탭 상태 ('edit' 또는 'info')
  const [activeTab, setActiveTab] = useState("edit");

  const [filterDateRange, setFilterDateRange] = useState("all"); // 통계용 날짜 범위 상태 추가 (기본값 'all')
  const [statsLoading, setStatsLoading] = useState(true); // 통계 로딩 상태 추가
  // -------------------------

  // SWR 옵션 (데이터 자동 갱신 및 에러 처리 설정)
  const swrOptions = {
    revalidateOnFocus: true, // 창 포커스 시 자동 갱신
    revalidateOnReconnect: true, // 네트워크 재연결 시 자동 갱신
    refreshInterval: 30000, // 30초마다 자동 갱신
    onError: (error) => {
      // 에러 발생 시 콜백
      console.error("SWR 데이터 로딩 오류:", error);
      // 필요 시 전역 에러 상태 설정 또는 사용자 알림
      // setError("데이터 로딩 중 문제가 발생했습니다.");
    },
  };

  // useOrders 훅을 사용하여 주문 데이터 가져오기
  const { data: ordersData, error: ordersError } = useOrders(
    userData?.userId, // userData가 있을 때만 호출
    currentPage, // 현재 페이지 번호 전달
    {
      // 필터 및 정렬 옵션 전달
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined, // 'all'이 아니면 상태 필터 적용
      search: searchTerm.trim() || undefined, // 검색어가 있으면 적용
    },
    swrOptions // SWR 옵션 적용
  );

  // useProducts 훅을 사용하여 상품 데이터 가져오기
  const { data: productsData, error: productsError } = useProducts(
    userData?.userId, // userData가 있을 때만 호출
    1, // 모든 상품 목록을 가져오기 위해 페이지는 1로 고정
    { limit: 200 }, // 충분한 수의 상품을 가져오도록 limit 증가 (필요시 조정)
    swrOptions // SWR 옵션 적용
  );

  // 👇 주문 통계 데이터 가져오기 (OrdersPage 용)
  const { data: orderStatsData, error: orderStatsError } = useOrderStats(
    userData?.userId,
    filterDateRange, // 상태 필터와 별개로 통계용 날짜 범위 사용
    null,
    null, // 사용자 지정 날짜는 필요 시 추가
    swrOptions
  );

  // 사용자 인증 상태 확인 Effect
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true); // 로딩 시작
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login"); // 세션 없으면 로그인 페이지로
          return; // 함수 종료
        }
        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj); // 사용자 데이터 설정
      } catch (error) {
        console.error("인증 확인 또는 데이터 조회 오류:", error);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
        // 필요 시 로그아웃 처리
        sessionStorage.removeItem("userData");
        router.replace("/login");
      } finally {
        setLoading(false); // 로딩 종료
      }
    };
    checkAuth();
  }, [router]); // router 의존성

  // 상품 데이터 상태 업데이트 Effect
  useEffect(() => {
    if (productsData?.data) {
      setProducts(productsData.data); // 가져온 상품 데이터를 상태에 저장
    }
  }, [productsData]); // productsData 변경 시 실행

  // 상품 데이터 로딩 오류 처리 Effect
  useEffect(() => {
    if (productsError) {
      console.error("상품 데이터 로딩 오류:", productsError);
      // 상품 로딩 실패 시 사용자에게 알림 (선택적)
      // setError("상품 정보를 불러오는 데 실패했습니다.");
    }
  }, [productsError]); // productsError 변경 시 실행

  // 주문 데이터 상태 업데이트 Effect
  useEffect(() => {
    if (userData && ordersData?.data) {
      setOrders(ordersData.data || []); // 가져온 주문 데이터를 상태에 저장
    }
  }, [ordersData, userData]); // ordersData 또는 userData 변경 시 실행

  // 주문 데이터 로딩 오류 처리 Effect
  useEffect(() => {
    if (ordersError) {
      console.error("주문 데이터 로딩 오류:", ordersError);
      setError("주문 데이터를 불러오는 데 실패했습니다.");
    } else {
      // 데이터 로딩 성공 시 에러 상태 초기화 (선택적)
      // setError(null);
    }
  }, [ordersError]); // ordersError 변경 시 실행

  // 통계 데이터 로딩 상태 업데이트 Effect
  useEffect(() => {
    // userData 로드 완료 후, orderStatsData 로딩 상태 반영
    if (!loading && userData?.userId) {
      setStatsLoading(!orderStatsData && !orderStatsError); // 데이터도 없고 에러도 없으면 로딩 중
    } else if (orderStatsError) {
      setStatsLoading(false); // 에러 발생 시 로딩 종료
    }
  }, [loading, userData, orderStatsData, orderStatsError]);

  // 상품 ID로 상품명 찾기 헬퍼 함수
  const getProductNameById = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product ? product.title : "상품 정보 없음"; // 상품 못 찾을 경우 메시지 개선
  };

  // 상품 ID로 바코드 찾기 헬퍼 함수
  const getProductBarcode = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.barcode || ""; // 상품 또는 바코드 없으면 빈 문자열 반환
  };

  // 금액 포맷팅 헬퍼 함수
  const formatCurrency = (amount) => {
    const validAmount = amount ?? 0; // null, undefined일 경우 0으로 처리
    try {
      return new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency: "KRW",
        maximumFractionDigits: 0, // 소수점 제거
      }).format(validAmount);
    } catch (e) {
      console.error("Currency formatting error:", e);
      return `${validAmount} 원`; // 포맷팅 실패 시 기본 형식 반환
    }
  };

  // 날짜 포맷팅 헬퍼 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-"; // 날짜 없으면 하이픈 반환
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜"; // 유효하지 않은 날짜 처리
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${month}.${day} ${hours}:${minutes}`; // MM.DD HH:MM 형식
    } catch (e) {
      console.error("Date formatting error:", e);
      return "날짜 형식 오류";
    }
  };

  // 주문 상태에 따른 배지 스타일 반환 헬퍼 함수
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "주문완료":
        return "bg-blue-100 text-blue-800";
      case "수령완료":
        return "bg-green-100 text-green-800";
      case "주문취소":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800"; // 기본 스타일
    }
  };

  // 주문 상태 변경 핸들러 (API 호출 및 상태 업데이트)
  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !userData?.userId) {
      console.error("Cannot change status: orderId or userId missing.");
      return; // 필수 정보 없으면 중단
    }
    try {
      const allowedStatuses = ["주문완료", "주문취소", "수령완료"];
      if (!allowedStatuses.includes(newStatus)) {
        alert("허용되지 않은 주문 상태입니다.");
        return;
      }

      // API 요청 본문 준비
      const updateData = { status: newStatus };
      const nowISO = new Date().toISOString(); // 현재 시간 ISO 형식

      // 상태에 따라 시간 필드 추가
      if (newStatus === "수령완료") {
        updateData.pickupTime = nowISO; // 프론트엔드 표시용 (필요 시)
        updateData.completed_at = nowISO; // 백엔드 저장용
      } else if (newStatus === "주문취소") {
        updateData.canceled_at = nowISO; // 백엔드 저장용
      }

      // API 호출하여 상태 변경 (PUT 요청)
      const response = await api.put(
        `/orders/${orderId}/status?userId=${userData.userId}`, // userId 쿼리 파라미터로 권한 확인
        updateData
      );

      // 응답 성공 여부 확인
      if (response.data?.success) {
        // 로컬 상태 업데이트 (메인 목록)
        setOrders((currentOrders) =>
          currentOrders.map((order) => {
            if (order.order_id === orderId) {
              const updatedOrder = { ...order, status: newStatus };
              // 시간 필드 업데이트
              if (newStatus === "수령완료") updatedOrder.completed_at = nowISO;
              if (newStatus === "주문취소") updatedOrder.canceled_at = nowISO;
              // pickupTime은 completed_at과 동일하게 설정하거나, 백엔드 응답에 따라 설정
              if (newStatus === "수령완료") updatedOrder.pickupTime = nowISO;
              return updatedOrder;
            }
            return order;
          })
        );

        // 모달에 표시된 데이터도 업데이트 (selectedOrder가 있을 경우)
        if (selectedOrder && selectedOrder.order_id === orderId) {
          setSelectedOrder((prev) => {
            if (!prev) return null;
            const updatedModalOrder = { ...prev, status: newStatus };
            if (newStatus === "수령완료")
              updatedModalOrder.completed_at = nowISO;
            if (newStatus === "주문취소")
              updatedModalOrder.canceled_at = nowISO;
            if (newStatus === "수령완료") updatedModalOrder.pickupTime = nowISO;
            return updatedModalOrder;
          });
        }

        alert(`주문이 ${newStatus} 상태로 성공적으로 변경되었습니다.`);
        // 상태 변경 성공 시 상세 모달 닫기 (선택적)
        // closeDetailModal();
      } else {
        // API 응답 실패 시 에러 발생
        throw new Error(
          response.data?.message || "주문 상태 변경에 실패했습니다."
        );
      }
    } catch (error) {
      console.error("주문 상태 변경 오류:", error);
      alert(
        `주문 상태 변경 중 오류 발생: ${error.message || "알 수 없는 오류"}`
      );
    }
    // 상태 변경 액션 후에는 상태 선택 모달(statusModal - 현재 미사용)은 닫음
    // setStatusModal({ show: false, orderId: null });
  };

  // --- 상세 정보 모달 핸들러 ---
  const openDetailModal = (order) => {
    setSelectedOrder({ ...order }); // 객체 복사하여 상태 설정 (원본 불변성 유지)
    // 편집용 임시 상태 초기화 (현재 주문 데이터 기준)
    setTempItemNumber(order.item_number || 1);
    setTempQuantity(order.quantity || 1);
    setTempPrice(order.price ?? 0); // 단가 (null일 경우 0)
    setIsEditingDetails(false); // 초기에는 보기 모드
    setIsDetailModalOpen(true); // 모달 열기
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null); // 선택된 주문 정보 초기화
    setIsEditingDetails(false); // 편집 모드 해제
  };

  // 모달 내 편집 모드 토글 핸들러
  const toggleDetailsEditMode = () => {
    if (isEditingDetails) {
      // 편집 모드 -> 보기 모드로 전환 (취소)
      // 임시 상태를 모달에 표시된 현재 값(selectedOrder)으로 복원
      if (selectedOrder) {
        setTempItemNumber(selectedOrder.item_number || 1);
        setTempQuantity(selectedOrder.quantity || 1);
        setTempPrice(selectedOrder.price ?? 0);
      }
    }
    // 편집 모드 상태 반전
    setIsEditingDetails((prev) => !prev);
  };

  // 모달 내 임시 값 변경 핸들러
  const handleTempInputChange = (field, value) => {
    if (field === "itemNumber") {
      setTempItemNumber(value);
    } else if (field === "quantity") {
      setTempQuantity(value);
    } else if (field === "price") {
      setTempPrice(value);
    }
  };

  // 모달 내 상세 정보 저장 핸들러 (API 호출)
  const saveOrderDetails = async () => {
    if (!selectedOrder || !userData?.userId) {
      console.error("Cannot save details: selectedOrder or userId missing.");
      return;
    }

    const orderId = selectedOrder.order_id;
    // 입력값 파싱 및 기본값 설정
    const parsedItemNumber = parseInt(tempItemNumber, 10) || 1;
    const parsedQuantity = parseInt(tempQuantity, 10) || 1;
    const parsedPrice = parseFloat(tempPrice) || 0; // 소수점 가능, 기본값 0

    // 유효성 검사
    if (parsedItemNumber < 1) {
      alert("상품 번호는 1 이상이어야 합니다.");
      return;
    }
    if (parsedQuantity < 1) {
      alert("수량은 1 이상이어야 합니다.");
      return;
    }
    if (parsedPrice < 0) {
      alert("단가는 0 이상이어야 합니다.");
      return;
    }

    const newTotalAmount = parsedPrice * parsedQuantity; // 총액 재계산

    // DB에 업데이트할 데이터 객체
    const updateData = {
      item_number: parsedItemNumber,
      quantity: parsedQuantity,
      price: parsedPrice, // 단가
      total_amount: newTotalAmount, // 총액
      // product_id는 여기서 변경하지 않는다고 가정
      // status는 별도 버튼으로 변경
    };

    // === API 호출하여 DB 업데이트 ===
    try {
      console.log(
        `API 호출: 주문(${orderId}) 상세 정보 업데이트 ->`,
        updateData
      );
      // --- 실제 API 엔드포인트 및 요청 본문 확인 필요 ---
      // 예시: PUT /api/orders/:orderId
      const response = await api.put(
        `/orders/${orderId}?userId=${userData.userId}`,
        updateData
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "주문 정보 업데이트에 실패했습니다."
        );
      }
      console.log(`주문(${orderId}) 상세 정보 DB 업데이트 성공`);

      // 성공 시 로컬 상태 업데이트
      const updatedOrder = {
        ...selectedOrder, // 기존 주문 정보에
        ...updateData, // 업데이트된 내용 반영
      };
      // 메인 주문 목록 업데이트
      setOrders((currentOrders) =>
        currentOrders.map((o) => (o.order_id === orderId ? updatedOrder : o))
      );
      // 모달에 표시된 데이터도 업데이트
      setSelectedOrder(updatedOrder);
      // 편집 모드 종료
      setIsEditingDetails(false);

      alert("주문 정보가 성공적으로 업데이트되었습니다.");
    } catch (error) {
      console.error("주문 상세 정보 업데이트 오류:", error);
      alert(`주문 정보 업데이트 중 오류 발생: ${error.message}`);
      // API 실패 시, 편집 모드를 유지하여 사용자가 다시 시도하거나 취소할 수 있도록 함
    }
  };
  // --- 상세 정보 모달 핸들러 끝 ---

  // 로그아웃 핸들러
  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData"); // 관련 데이터 모두 제거
    router.replace("/login"); // 로그인 페이지로 이동
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 리셋
    // scrollToTop(); // 페이지 상단 이동 (선택적)
  };

  // 정렬 변경 핸들러
  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc")); // 정렬 방향 토글
    } else {
      setSortBy(field); // 정렬 필드 변경
      setSortOrder("desc"); // 기본 내림차순
    }
    setCurrentPage(1); // 정렬 변경 시 첫 페이지로 리셋
    // scrollToTop(); // 페이지 상단 이동 (선택적)
  };

  // 상태 필터 변경 핸들러
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 리셋
    // scrollToTop(); // 페이지 상단 이동 (선택적)
  };

  // 페이지 상단 이동 함수
  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth" }); // 부드럽게 이동
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" }); // 최상단으로 부드럽게 이동
    }
  };

  // 페이지 번호 변경 핸들러
  const paginate = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      // 유효한 페이지 번호인지 확인
      setCurrentPage(pageNumber);
      scrollToTop(); // 페이지 변경 시 상단으로 이동
    }
  };

  // 이전 페이지 이동 핸들러
  const goToPreviousPage = () => {
    paginate(currentPage - 1);
  };

  // 다음 페이지 이동 핸들러
  const goToNextPage = () => {
    paginate(currentPage + 1);
  };

  // 정렬 아이콘 반환 헬퍼 함수
  const getSortIcon = (field) => {
    if (sortBy !== field) return null; // 현재 정렬 필드가 아니면 아이콘 없음
    return sortOrder === "asc" ? (
      <svg
        className="w-4 h-4 ml-1 inline-block"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg> // 오름차순 아이콘
    ) : (
      <svg
        className="w-4 h-4 ml-1 inline-block"
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
      </svg> // 내림차순 아이콘
    );
  };

  // 테이블 내 수량 증가 핸들러 (stopPropagation 추가)
  const increaseQuantity = (orderId) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.order_id === orderId
          ? {
              ...order,
              quantity: (order.quantity || 0) + 1,
              total_amount: (order.price ?? 0) * ((order.quantity || 0) + 1),
            }
          : order
      )
    );
  };

  // 테이블 내 수량 감소 핸들러 (stopPropagation 추가)
  const decreaseQuantity = (orderId) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.order_id === orderId && (order.quantity || 0) > 1
          ? {
              ...order,
              quantity: order.quantity - 1,
              total_amount: (order.price ?? 0) * (order.quantity - 1),
            }
          : order
      )
    );
  };

  // 상품 ID로 밴드 게시물 URL 찾기 헬퍼 함수
  const getPostUrlByProductId = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.band_post_url || ""; // 없으면 빈 문자열 반환
  };

  // --- 로딩 상태 UI ---
  if (loading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-700">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  // --- 에러 상태 UI ---
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-red-200">
          <h2 className="text-2xl font-bold text-red-600 mb-4 text-center">
            오류 발생
          </h2>
          <p className="text-gray-700 mb-6 text-center">{error}</p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => window.location.reload()} // 페이지 새로고침
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-medium"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout} // 로그아웃
              className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 사용자 데이터 없을 시 (인증 실패 또는 로딩 전) ---
  if (!userData) {
    // 일반적으로 checkAuth에서 리다이렉트되므로 이 상태는 거의 보이지 않음
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          사용자 정보를 불러오는 중이거나 인증에 실패했습니다.
        </p>
      </div>
    );
  }

  // --- 메인 페이지 렌더링 ---
  const totalItems = ordersData?.pagination?.total || 0; // 총 주문 개수
  const totalPages = ordersData?.pagination?.totalPages || 1; // 총 페이지 수
  const displayOrders = orders || []; // 현재 페이지에 표시할 주문 목록

  // 👇 통계 데이터 추출 (기본값 처리 포함)
  const stats = orderStatsData?.data || {
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    estimatedRevenue: 0,
    confirmedRevenue: 0,
  };
  const totalStatsOrders = stats.totalOrders || 0; // 통계 기반 총 주문 수
  const totalCompletedOrders = stats.completedOrders || 0; // 통계 기반 완료 주문 수
  const totalPendingOrders = stats.pendingOrders || 0; // 통계 기반 미수령 주문 수

  return (
    <div ref={topRef} className=" min-h-screen">
      {/* 헤더: 페이지 제목, 요약 정보 */}
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
            주문 관리
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            {/* 👇 통계 데이터 기반으로 문구 수정 */}총 {totalStatsOrders}건의
            주문 목록입니다.
          </p>

          <p className="text-sm md:text-base text-gray-600">
            주문 목록을 확인하고 상태를 업데이트하세요.
          </p>
        </div>
        {/* 요약 정보 */}
        <div className="grid grid-cols-4 gap-3 md:gap-4 text-center w-full md:w-auto">
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">총 주문</div>
            <div className="text-xl md:text-2xl font-semibold text-gray-900">
              {/* 👇 통계 데이터 사용 */}
              {totalStatsOrders}
            </div>
          </div>
          {/* 👇 총 수령완료 (건수) */}
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">
              수령완료
            </div>{" "}
            {/* 라벨 수정 */}
            <div className="text-xl md:text-2xl font-semibold text-green-600">
              {" "}
              {/* 색상 유지 또는 변경 */}
              {totalCompletedOrders} 건{" "}
              {/* totalCompletedOrders 변수 사용하고 '건' 추가 */}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">미수령</div>
            <div className="text-xl md:text-2xl font-semibold text-blue-600">
              {/* 👇 통계 데이터 사용 */}
              {totalPendingOrders}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">완료율</div>
            <div className="text-xl md:text-2xl font-semibold text-green-600">
              {/* 👇 통계 데이터 사용 */}
              {totalStatsOrders > 0
                ? Math.round((totalCompletedOrders / totalStatsOrders) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      </div>

      {/* 필터 & 검색 영역 */}
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
          {/* 상태 필터 버튼 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFilterChange("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              }`}
            >
              전체
            </button>
            <button
              onClick={() => handleFilterChange("주문완료")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === "주문완료"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              }`}
            >
              주문완료
            </button>
            <button
              onClick={() => handleFilterChange("수령완료")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === "수령완료"
                  ? "bg-green-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              }`}
            >
              수령완료
            </button>
            <button
              onClick={() => handleFilterChange("주문취소")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === "주문취소"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              }`}
            >
              주문취소
            </button>
            <button
              onClick={() => handleFilterChange("확인필요")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === "확인필요"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              }`}
            >
              확인필요
            </button>
          </div>

          {/* 검색창 */}
          <div className="relative w-full max-w-[400px]">
            <input
              type="text"
              placeholder="고객명, 상품명, 바코드 검색..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full px-4 py-2 pr-10 text-sm border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg
                className="w-5 h-5 text-gray-400"
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
          </div>
        </div>
      </div>

      {/* 주문 테이블 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6 md:mb-8">
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
                <th className="px-4 py-4 text-center font-semibold">#</th>
                <th className="px-4 py-4 text-left font-semibold">
                  <button
                    onClick={() => handleSortChange("ordered_at")}
                    className="flex items-center hover:text-gray-900"
                  >
                    주문일시 {getSortIcon("ordered_at")}
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-semibold">상품명</th>
                <th className="px-4 py-4 text-left font-semibold">
                  <button
                    onClick={() => handleSortChange("customer_name")}
                    className="flex items-center hover:text-gray-900"
                  >
                    고객명 {getSortIcon("customer_name")}
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-semibold hidden md:table-cell">
                  고객 댓글
                </th>
                <th className="px-4 py-4 text-center font-semibold w-[80px]">
                  상품번호
                </th>
                <th className="px-4 py-4 text-center font-semibold w-[110px]">
                  수량
                </th>
                <th className="px-4 py-4 text-right font-semibold w-[110px]">
                  <button
                    onClick={() => handleSortChange("total_amount")}
                    className="flex items-center justify-end w-full hover:text-gray-900"
                  >
                    금액 {getSortIcon("total_amount")}
                  </button>
                </th>
                <th className="px-4 py-4 text-center font-semibold w-[140px] hidden md:table-cell">
                  바코드
                </th>
                <th className="px-4 py-4 text-center font-semibold w-[100px]">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayOrders.map((order, index) => {
                const startNumberForCurrentPage =
                  totalItems - (currentPage - 1) * itemsPerPage;
                const orderNumber = startNumberForCurrentPage - index;
                const postUrl = getPostUrlByProductId(order.product_id);

                return (
                  <tr
                    key={order.order_id}
                    className="hover:bg-blue-50 transition-colors group cursor-pointer"
                    onClick={() => openDetailModal(order)} // 행 클릭 시 모달 열기
                  >
                    {/* 주문 번호 */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium text-center">
                      {orderNumber}
                    </td>
                    {/* 주문 일시 */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(order.ordered_at)}
                    </td>
                    {/* 상품명 */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-800 font-medium truncate">
                        {getProductNameById(order.product_id)}
                      </div>
                    </td>
                    {/* 고객명 */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 font-semibold truncate">
                        {order.customer_name}
                      </div>
                    </td>
                    {/* 고객 댓글 */}
                    <td className="px-4 py-4 max-w-xs hidden md:table-cell">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-600 line-clamp-1">
                          {order.comment || "-"}
                        </span>
                        {postUrl && (
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()} // 행 클릭 이벤트 막기
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
                            title="원본 댓글 보기"
                          >
                            <svg
                              className="w-3 h-3 mr-1"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
                              <path
                                fillRule="evenodd"
                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                clipRule="evenodd"
                              ></path>
                            </svg>
                            보기
                          </a>
                        )}
                      </div>
                    </td>
                    {/* 상품 번호 (보기 전용) */}
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-gray-800 font-semibold">
                        {order.item_number || "-"}
                      </span>
                    </td>
                    {/* 수량 (+/- 버튼 포함) */}
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-medium text-gray-800">
                        {order.quantity || 0}
                      </span>
                    </td>
                    {/* 금액 */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(order.total_amount)}
                    </td>
                    {/* 바코드 */}
                    <td className="px-4 py-4 whitespace-nowrap text-center hidden md:table-cell">
                      {getProductBarcode(order.product_id) ? (
                        <div className="mx-auto max-w-[120px]">
                          {" "}
                          {/* 최대 너비 유지 */}
                          <Barcode
                            value={getProductBarcode(order.product_id)}
                            height={30}
                            width={1.2}
                            fontSize={10}
                          />{" "}
                          {/* 테이블 내 바코드 크기 조정 */}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">없음</span>
                      )}
                    </td>
                    {/* 상태 */}
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeStyles(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* 주문 데이터 없을 때 */}
              {displayOrders.length === 0 && (
                <tr>
                  <td
                    colSpan="10"
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    표시할 주문 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalItems > itemsPerPage && (
          <div className="px-4 py-4 flex items-center justify-between border-t border-gray-200 bg-white rounded-b-xl">
            <div>
              <p className="text-sm text-gray-600">
                총 <span className="font-semibold">{totalItems}</span>개 중{" "}
                <span className="font-semibold">
                  {(currentPage - 1) * itemsPerPage + 1} -{" "}
                  {Math.min(currentPage * itemsPerPage, totalItems)}
                </span>
              </p>
            </div>
            {/* 페이지네이션 버튼 */}
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
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {/* 페이지 번호 생성 로직 */}
              {(() => {
                const pageNumbers = [];
                const maxPagesToShow = 3; // 중앙에 표시할 최대 페이지 수 (현재 페이지 포함)
                let startPage = Math.max(
                  1,
                  currentPage - Math.floor(maxPagesToShow / 2)
                );
                let endPage = Math.min(
                  totalPages,
                  startPage + maxPagesToShow - 1
                );
                // 시작 페이지 조정 (끝 페이지가 최대 페이지 수보다 작을 경우)
                if (endPage - startPage + 1 < maxPagesToShow) {
                  startPage = Math.max(1, endPage - maxPagesToShow + 1);
                }

                if (startPage > 1) {
                  // 첫 페이지 및 ... 표시
                  pageNumbers.push(1);
                  if (startPage > 2) pageNumbers.push("...");
                }
                for (let i = startPage; i <= endPage; i++) {
                  // 중간 페이지 번호
                  pageNumbers.push(i);
                }
                if (endPage < totalPages) {
                  // 마지막 페이지 및 ... 표시
                  if (endPage < totalPages - 1) pageNumbers.push("...");
                  pageNumbers.push(totalPages);
                }

                return pageNumbers.map((page, idx) =>
                  typeof page === "number" ? (
                    <button
                      key={page}
                      onClick={() => paginate(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === page
                          ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                          : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  ) : (
                    <span
                      key={`ellipsis-${idx}`}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
                    >
                      ...
                    </span>
                  )
                );
              })()}
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                  currentPage === totalPages
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
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

      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 overflow-y-auto flex justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl p-0 my-12">
            {/* 헤더 */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">주문 상세</h2>
              <button
                onClick={closeDetailModal}
                className="text-gray-400 hover:text-gray-600"
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
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* 본문 */}
            <div className="px-6 py-6 space-y-6">
              {/* 바코드 */}
              <div className="text-center">
                <Barcode
                  value={getProductBarcode(selectedOrder.product_id)}
                  width={2.5}
                  height={70}
                  fontSize={18}
                />
                {!getProductBarcode(selectedOrder.product_id) && (
                  <p className="text-sm text-gray-500 mt-2">바코드 정보 없음</p>
                )}
              </div>

              {/* 상품 정보 입력 */}
              <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    상품 번호
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tempItemNumber}
                    onChange={(e) =>
                      handleTempInputChange("itemNumber", e.target.value)
                    }
                    className="w-full border rounded-lg px-4 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    수량
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tempQuantity}
                    onChange={(e) =>
                      handleTempInputChange("quantity", e.target.value)
                    }
                    className="w-full border rounded-lg px-4 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    단가
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tempPrice}
                    onChange={(e) =>
                      handleTempInputChange("price", e.target.value)
                    }
                    className="w-full border rounded-lg px-4 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="text-right font-semibold text-lg text-gray-800">
                총 금액:{" "}
                {formatCurrency(
                  (parseFloat(tempPrice) || 0) *
                    (parseInt(tempQuantity, 10) || 0)
                )}
              </div>

              {/* 댓글 및 작성자 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500 mb-2">
                  작성자:{" "}
                  <span className="text-base font-medium text-gray-800">
                    {selectedOrder.customer_name}
                  </span>
                </p>
                <div className="text-base text-gray-700 whitespace-pre-line">
                  {selectedOrder.comment || "댓글 없음"}
                </div>
              </div>

              {/* 상태 변경 */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-t pt-4">
                {/* 현재 상태 */}
                <div className="text-sm font-medium text-gray-700">
                  현재 상태:{" "}
                  <span
                    className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getStatusBadgeStyles(
                      selectedOrder.status
                    )}`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>

                {/* 상태 변경 버튼 */}
                <div className="flex flex-wrap gap-2">
                  {["주문완료", "수령완료", "주문취소"].map((status) => {
                    const isCurrent = selectedOrder.status === status;
                    const baseClass =
                      "px-4 py-2 rounded-lg font-medium text-sm transition";
                    let statusClass = "";
                    if (status === "주문완료")
                      statusClass = isCurrent
                        ? "bg-blue-200 text-blue-600 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700";
                    else if (status === "수령완료")
                      statusClass = isCurrent
                        ? "bg-green-200 text-green-600 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700";
                    else
                      statusClass = isCurrent
                        ? "bg-red-200 text-red-600 cursor-not-allowed"
                        : "bg-red-600 text-white hover:bg-red-700";

                    return (
                      <button
                        key={status}
                        onClick={() =>
                          handleStatusChange(selectedOrder.order_id, status)
                        }
                        disabled={isCurrent}
                        className={`${baseClass} ${statusClass}`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 푸터 */}
            {/* <div className="flex justify-end px-6 py-4 border-t border-gray-200">
              <button
                onClick={saveOrderDetails}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                저장
              </button>
              <button
                onClick={closeDetailModal}
                className="ml-3 px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
              >
                닫기
              </button>
            </div> */}
          </div>
        </div>
      )}
    </div> // Main container div end
  ); // Component return end
} // Component end
