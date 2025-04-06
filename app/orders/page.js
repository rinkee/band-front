"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOrders, useProducts } from "../hooks";
import { api } from "../lib/fetcher";
import JsBarcode from "jsbarcode";

// 바코드 컴포넌트
const Barcode = ({ value, width = 1.5, height = 40 }) => {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width: width,
          height: height,
          displayValue: true,
          fontSize: 12,
          margin: 5,
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
      }
    }
  }, [value, width, height]);

  if (!value) return null;

  return <svg ref={barcodeRef} className="w-full"></svg>;
};

export default function OrdersPage() {
  const router = useRouter();
  const topRef = useRef(null); // 페이지 상단 참조를 위한 ref 추가
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("ordered_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30); // 서버에서 설정한 페이지당 항목 수 (고정값)

  const [products, setProducts] = useState([]);

  // SWR 옵션 (에러 발생 시 재시도 및 새로고침 간격 설정)
  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 30000, // 30초마다 자동으로 데이터 새로고침
    onError: (error) => {
      console.error("데이터 로딩 오류:", error);
    },
  };

  // 주문 데이터 가져오기
  const { data: ordersData, error: ordersError } = useOrders(
    userData?.userId,
    currentPage,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
    },
    swrOptions
  );

  // 상품 데이터 가져오기 (useProducts 훅 사용)
  const { data: productsData, error: productsError } = useProducts(
    userData?.userId,
    1, // 모든 상품 목록을 가져오기 위해 페이지는 1로 고정
    { limit: 50 }, // status 필터 추가, 페이지 크기 증가
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

        // 상품 목록 가져오기 - 제거 (useProducts 훅으로 대체)
        // fetchProducts(userDataObj.userId);

        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // 상품 데이터 상태 업데이트
  useEffect(() => {
    if (productsData?.data) {
      setProducts(productsData.data);
    }
  }, [productsData]);

  // 상품 데이터 로딩 오류 처리
  useEffect(() => {
    if (productsError) {
      console.error("상품 데이터 로딩 오류:", productsError);
    }
  }, [productsError]);

  // 상품 ID로 상품명 찾기
  const getProductNameById = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product ? product.title : "상품명 없음";
  };

  // 상품 ID로 바코드 찾기
  const getProductBarcode = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.barcode || "";
  };

  // API에서 받은 주문 데이터를 상태에 설정
  useEffect(() => {
    if (userData && ordersData) {
      setOrders(ordersData.data || []);
    }
  }, [ordersData, userData]);

  // 주문 데이터 로딩 오류 처리
  useEffect(() => {
    if (ordersError) {
      setError("주문 데이터를 불러오는데 실패했습니다.");
      console.error("주문 데이터 로딩 오류:", ordersError);
    }
  }, [ordersError]);

  // 댓글에서 수량 추출 함수
  const extractQuantityFromComment = (comment) => {
    if (!comment) return 1;

    // "숫자개" 패턴 찾기 (예: "2개", "3개 주문합니다" 등)
    const koreanPattern = /(\d+)\s*개/;
    const koreanMatch = comment.match(koreanPattern);

    if (koreanMatch && koreanMatch[1]) {
      return parseInt(koreanMatch[1]);
    }

    // 댓글이 숫자로만 이루어진 경우 (예: "2", "3" 등)
    const numericPattern = /^(\d+)$/;
    const numericMatch = comment.match(numericPattern);

    if (numericMatch && numericMatch[1]) {
      return parseInt(numericMatch[1]);
    }

    // 띄어쓰기가 있는 경우 첫 번째 단어가 숫자인지 확인 (예: "2 주문합니다")
    const firstWordPattern = /^(\d+)\s/;
    const firstWordMatch = comment.match(firstWordPattern);

    if (firstWordMatch && firstWordMatch[1]) {
      return parseInt(firstWordMatch[1]);
    }

    // 마지막으로 문자열 내 모든 숫자를 찾아서 첫 번째 숫자 사용
    const anyNumberPattern = /(\d+)/;
    const anyNumberMatch = comment.match(anyNumberPattern);

    if (anyNumberMatch && anyNumberMatch[1]) {
      return parseInt(anyNumberMatch[1]);
    }

    // 숫자를 찾지 못한 경우 기본값 1 반환
    return 1;
  };

  // 댓글 변경 시 수량 자동 업데이트
  const handleCommentChange = (orderId, newComment) => {
    setOrders(
      orders.map((order) => {
        if (order.order_id === orderId) {
          const newQuantity = extractQuantityFromComment(newComment);
          const newTotal = order.price * newQuantity;

          return {
            ...order,
            comment: newComment,
            quantity: newQuantity,
            displayQuantity: newQuantity,
            total_amount: newTotal,
          };
        }
        return order;
      })
    );
  };

  // 수량 수정 핸들러
  const handleQuantityChange = (orderId, newQuantity) => {
    setOrders(
      orders.map((order) =>
        order.order_id === orderId
          ? {
              ...order,
              displayQuantity: newQuantity,
            }
          : order
      )
    );
  };

  // 수량 저장 핸들러
  const saveQuantity = (orderId) => {
    setOrders(
      orders.map((order) => {
        if (order.order_id === orderId) {
          const updatedQuantity = parseInt(order.displayQuantity) || 1;
          const newTotal = order.price * updatedQuantity;

          return {
            ...order,
            quantity: updatedQuantity,
            displayQuantity: updatedQuantity,
            total_amount: newTotal,
            isEditing: false,
          };
        }
        return order;
      })
    );
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "주문완료":
        return "bg-blue-100 text-blue-800";
      case "수령완료":
        return "bg-green-100 text-green-800";
      case "주문취소":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // 주문 상태 변경 핸들러 (DB 저장 함수)
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      // 허용된 상태 값 체크
      const allowedStatuses = ["주문완료", "주문취소", "수령완료"];
      if (!allowedStatuses.includes(newStatus)) {
        alert("허용되지 않은 주문 상태입니다.");
        return;
      }

      // API 요청 데이터 준비
      const updateData = {
        status: newStatus,
      };

      // 상태에 따른 시간 처리
      if (newStatus === "수령완료") {
        updateData.pickupTime = new Date().toISOString(); // 프론트엔드 표시용
        updateData.completed_at = new Date().toISOString(); // 백엔드 호환용
      } else if (newStatus === "주문취소") {
        updateData.canceled_at = new Date().toISOString();
      }

      // API 호출하여 상태 변경
      const response = await api.put(
        `/orders/${orderId}/status?userId=${userData.userId}`,
        updateData
      );

      if (response.data && response.data.success) {
        // 성공 시 로컬 상태 업데이트
        setOrders(
          orders.map((order) => {
            if (order.order_id === orderId) {
              const updatedOrder = {
                ...order,
                status: newStatus,
              };

              // 상태에 따른 시간 필드 설정
              if (newStatus === "수령완료") {
                updatedOrder.pickupTime = new Date().toISOString();
                updatedOrder.completed_at = new Date().toISOString();
              } else if (newStatus === "주문취소") {
                updatedOrder.canceled_at = new Date().toISOString();
              }

              return updatedOrder;
            }
            return order;
          })
        );

        // 상태 변경 알림
        alert(`주문이 ${newStatus} 상태로 변경되었습니다.`);
      } else {
        throw new Error(response.data?.message || "상태 변경에 실패했습니다.");
      }
    } catch (error) {
      console.error("주문 상태 변경 오류:", error);
      alert(
        "주문 상태 변경에 실패했습니다: " + (error.message || "알 수 없는 오류")
      );
    }

    // 상태와 관계없이 모달 닫기
    setStatusModal({ show: false, orderId: null });
  };

  // 모달 관련 상태
  const [statusModal, setStatusModal] = useState({
    show: false,
    orderId: null,
  });

  // 상태 변경 모달 열기
  const openStatusModal = (orderId) => {
    setStatusModal({ show: true, orderId });
  };

  // 로그아웃 처리 함수
  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    scrollToTop();
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
    scrollToTop();
  };

  // 필터 변경 핸들러
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
    scrollToTop();
  };

  // 금액 포맷팅 함수
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // 날짜 포맷팅 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    // 유효하지 않은 날짜 확인
    if (isNaN(date.getTime())) {
      return "-";
    }

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${month}.${day} ${hours}:${minutes}`;
  };

  // 주문 필터링 및 정렬
  const filteredOrders = orders || [];

  // 페이지네이션 - 서버에서 받은 전체 개수 사용
  const totalItems = ordersData?.pagination?.total || 0;
  const totalPages = ordersData?.pagination?.totalPages || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  // 현재 페이지에 표시될 주문목록 (서버에서 페이징처리된 데이터를 그대로 사용)
  const displayOrders = filteredOrders;

  // 페이지 상단으로 스크롤하는 함수
  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo(0, 0);
    }
  };

  // 페이지 변경 핸들러
  const paginate = (pageNumber) => {
    // 페이지 변경
    setCurrentPage(pageNumber);
    // 페이지 상단으로 스크롤
    scrollToTop();
  };

  // 이전/다음 페이지 핸들러
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      scrollToTop();
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      scrollToTop();
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

  // 수정 모드 토글 함수
  const toggleEditMode = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.order_id === orderId
          ? { ...order, isEditing: !order.isEditing }
          : order
      )
    );
  };

  // 수량 증가 핸들러
  const increaseQuantity = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.order_id === orderId
          ? {
              ...order,
              quantity: order.quantity + 1,
              total_amount: order.price * (order.quantity + 1),
            }
          : order
      )
    );
  };

  // 수량 감소 핸들러
  const decreaseQuantity = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.order_id === orderId && order.quantity > 1
          ? {
              ...order,
              quantity: order.quantity - 1,
              total_amount: order.price * (order.quantity - 1),
            }
          : order
      )
    );
  };

  // 상품 ID로 게시물 URL 찾기
  const getPostUrlByProductId = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.band_post_url || "";
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
    <div className="p-3 md:p-6">
      <div className="flex">
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 md:mb-2">
            주문 관리
          </h1>
          <p className="text-xs md:text-sm text-gray-500">
            주문 목록을 확인하고 상태를 업데이트할 수 있습니다.
          </p>
        </div>
        <div className="w-full flex justify-end">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg p-2 flex flex-col items-start">
              <div className="text-md text-gray-500">총 주문</div>
              <div className="text-2xl font-semibold ">{totalItems}</div>
            </div>
            <div className="rounded-lg p-2">
              <div className="text-md text-gray-500">미수령</div>
              <div className="text-2xl font-semibold ">
                {orders.filter((o) => o.status === "주문완료").length}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-md text-gray-500">완료율</div>
              <div className="text-2xl font-semibold ">
                {totalItems
                  ? Math.round(
                      (orders.filter((o) => o.status === "수령완료").length /
                        totalItems) *
                        100
                    )
                  : 0}
                %
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 & 검색 */}
      <div className="pb-5">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="w-full md:w-1/2 flex gap-2">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => handleFilterChange("all")}
                className={`px-4 py-1 rounded-xl text-sm font-medium ${
                  filterStatus === "all"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                전체
              </button>
              <button
                onClick={() => handleFilterChange("주문완료")}
                className={`px-2 py-1 rounded-xl text-sm font-medium ${
                  filterStatus === "주문완료"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                주문완료
              </button>
              <button
                onClick={() => handleFilterChange("수령완료")}
                className={`px-2 py-1 rounded-xl text-sm font-medium ${
                  filterStatus === "수령완료"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                수령완료
              </button>
              <button
                onClick={() => handleFilterChange("주문취소")}
                className={`px-2 py-1 rounded-xl text-sm font-medium ${
                  filterStatus === "주문취소"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                주문취소
              </button>
            </div>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="주문 검색"
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <svg
                  className="w-4 h-4 text-gray-400"
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
      </div>

      {/* 주문 테이블 */}
      <div className="bg-white rounded-xl overflow-hidden mb-4 md:mb-6">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed p-4">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-10 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("id")}
                    className="flex items-center focus:outline-none"
                  >
                    <span className="hidden md:inline">#</span>
                    {getSortIcon("id")}
                  </button>
                </th>
                <th className="w-1/6 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("ordered_at")}
                    className="flex items-center focus:outline-none"
                  >
                    주문일시
                    {getSortIcon("ordered_at")}
                  </button>
                </th>
                <th className="w-1/5 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center">
                    <button
                      onClick={() => handleSortChange("product_id")}
                      className="flex items-center focus:outline-none"
                    >
                      상품명
                    </button>
                  </div>
                </th>
                <th className="w-1/5 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center">
                    <button
                      onClick={() => handleSortChange("customer_name")}
                      className="flex items-center focus:outline-none"
                    >
                      고객명
                      {getSortIcon("customer_name")}
                    </button>
                  </div>
                </th>
                <th className="w-1/5 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  고객 댓글
                </th>
                <th className="w-16 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  수량
                </th>
                <th className="w-20 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("total_amount")}
                    className="flex items-center justify-end focus:outline-none ml-auto"
                  >
                    금액
                    {getSortIcon("total_amount")}
                  </button>
                </th>
                <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  바코드
                </th>
                <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 ">
              {displayOrders.map((order, index) => {
                // 현재 페이지가 1이면 최대 인덱스(37)부터 시작
                // 현재 페이지가 2이면 (37-30=7)부터 시작
                const startNumberForCurrentPage =
                  totalItems - (currentPage - 1) * itemsPerPage;
                const orderNumber = startNumberForCurrentPage - index;

                return (
                  <tr
                    key={order.order_id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500 font-medium text-center">
                      {orderNumber}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.ordered_at)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-sm text-gray-700 truncate">
                        {getProductNameById(order.product_id)}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-sm text-gray-800 font-semibold truncate">
                        {order.customer_name}
                      </div>
                    </td>
                    <td className="px-2 py-2 max-w-xs hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-500 line-clamp-1">
                          {order.comment}
                        </div>
                        {getPostUrlByProductId(order.product_id) && (
                          <a
                            href={getPostUrlByProductId(order.product_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
                            title="밴드 게시물에서 원본 댓글 보기"
                          >
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
                                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                              />
                            </svg>
                            댓글
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => decreaseQuantity(order.order_id)}
                          className="w-7 h-7 flex items-center justify-center rounded-l-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                          disabled={order.quantity <= 1}
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
                              d="M20 12H4"
                            />
                          </svg>
                        </button>
                        <span className="w-8 h-7 flex items-center justify-center text-sm font-medium bg-gray-50 border-t border-b border-gray-200 text-black">
                          {order.quantity}
                        </span>
                        <button
                          onClick={() => increaseQuantity(order.order_id)}
                          className="w-7 h-7 flex items-center justify-center rounded-r-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
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
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap font-medium text-gray-900 text-right">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center hidden md:table-cell">
                      {getProductBarcode(order.product_id) ? (
                        <div style={{ maxWidth: "120px" }} className="mx-auto">
                          <Barcode
                            value={getProductBarcode(order.product_id)}
                            height={30}
                            width={1.2}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          바코드 없음
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-lg ${getStatusBadgeStyles(
                          order.status
                        )} cursor-pointer hover:shadow-sm transition-shadow`}
                        onClick={() => openStatusModal(order.order_id)}
                      >
                        {order.status}
                      </span>
                      {order.status === "수령완료" && order.pickupTime && (
                        <div className="text-xs text-gray-500 mt-1 hidden md:block">
                          {formatDate(order.pickupTime)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayOrders.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="px-2 py-8 text-center text-gray-500"
                  >
                    표시할 주문이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {filteredOrders.length > 0 && (
          <div className="px-2 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  전체 <span className="font-medium">{totalItems}</span>개
                </p>
              </div>
              <div>
                <nav
                  className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                  aria-label="Pagination"
                >
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center px-2 py-1 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                      currentPage === 1
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span className="sr-only">이전</span>
                    <svg
                      className="h-4 w-4"
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
                  {Array.from({ length: Math.min(3, totalPages) }).map(
                    (_, index) => {
                      let pageNumber;

                      // 현재 페이지를 기준으로 앞뒤로 1페이지씩 표시
                      if (totalPages <= 3) {
                        pageNumber = index + 1;
                      } else if (currentPage <= 2) {
                        pageNumber = index + 1;
                      } else if (currentPage >= totalPages - 1) {
                        pageNumber = totalPages - 2 + index;
                      } else {
                        pageNumber = currentPage - 1 + index;
                      }

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => paginate(pageNumber)}
                          className={`relative inline-flex items-center px-3 py-1 border text-xs font-medium ${
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
                    className={`relative inline-flex items-center px-2 py-1 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                      currentPage === totalPages
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span className="sr-only">다음</span>
                    <svg
                      className="h-4 w-4"
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
            </div>
          </div>
        )}
      </div>

      {/* 상태 변경 모달 */}
      {statusModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xs w-full p-4 shadow-xl">
            <h3 className="text-lg font-bold mb-4 text-gray-900">
              주문 상태 변경
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "주문완료")
                }
                className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="text-lg mb-1">💳</span>
                <span className="font-medium text-sm text-gray-900">
                  주문완료
                </span>
              </button>
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "수령완료")
                }
                className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span className="text-lg mb-1">✨</span>
                <span className="font-medium text-sm text-gray-900">
                  수령완료
                </span>
              </button>
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "주문취소")
                }
                className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <span className="text-lg mb-1">❌</span>
                <span className="font-medium text-sm text-gray-900">
                  주문취소
                </span>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStatusModal({ show: false, orderId: null })}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
