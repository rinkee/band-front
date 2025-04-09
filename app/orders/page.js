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
        if (barcodeRef.current) {
          barcodeRef.current.innerHTML = "";
        }
      }
    } else if (barcodeRef.current) {
      barcodeRef.current.innerHTML = "";
    }
  }, [value, width, height, fontSize]);

  if (!value)
    return (
      <div className="text-center text-xs text-gray-400 my-4">
        바코드 정보 없음
      </div>
    );

  return <svg ref={barcodeRef} className="w-full max-w-xs mx-auto block"></svg>;
};

export default function OrdersPage() {
  const router = useRouter();
  const topRef = useRef(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("ordered_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);
  const [products, setProducts] = useState([]);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [tempItemNumber, setTempItemNumber] = useState(1);
  const [tempQuantity, setTempQuantity] = useState(1);
  const [tempPrice, setTempPrice] = useState(0);
  const [activeTab, setActiveTab] = useState("edit");

  const [filterDateRange, setFilterDateRange] = useState("all");
  const [statsLoading, setStatsLoading] = useState(true);

  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 30000,
    onError: (error) => {
      console.error("SWR 데이터 로딩 오류:", error);
    },
  };

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

  const { data: productsData, error: productsError } = useProducts(
    userData?.userId,
    1,
    { limit: 200 },
    swrOptions
  );

  const { data: orderStatsData, error: orderStatsError } = useOrderStats(
    userData?.userId,
    filterDateRange,
    null,
    null,
    swrOptions
  );

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj);
      } catch (error) {
        console.error("인증 확인 또는 데이터 조회 오류:", error);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
        sessionStorage.removeItem("userData");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (productsData?.data) {
      setProducts(productsData.data);
    }
  }, [productsData]);

  useEffect(() => {
    if (productsError) {
      console.error("상품 데이터 로딩 오류:", productsError);
    }
  }, [productsError]);

  useEffect(() => {
    if (userData && ordersData?.data) {
      setOrders(ordersData.data || []);
    }
  }, [ordersData, userData]);

  useEffect(() => {
    if (ordersError) {
      console.error("주문 데이터 로딩 오류:", ordersError);
      setError("주문 데이터를 불러오는 데 실패했습니다.");
    }
  }, [ordersError]);

  useEffect(() => {
    if (!loading && userData?.userId) {
      setStatsLoading(!orderStatsData && !orderStatsError);
    } else if (orderStatsError) {
      setStatsLoading(false);
    }
  }, [loading, userData, orderStatsData, orderStatsError]);

  const getProductNameById = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product ? product.title : "상품 정보 없음";
  };

  const getProductBarcode = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.barcode || "";
  };

  const formatCurrency = (amount) => {
    const validAmount = amount ?? 0;
    try {
      return new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency: "KRW",
        maximumFractionDigits: 0,
      }).format(validAmount);
    } catch (e) {
      console.error("Currency formatting error:", e);
      return `${validAmount} 원`;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${month}.${day} ${hours}:${minutes}`;
    } catch (e) {
      console.error("Date formatting error:", e);
      return "날짜 형식 오류";
    }
  };

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

  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !userData?.userId) {
      console.error("Cannot change status: orderId or userId missing.");
      return;
    }
    try {
      const allowedStatuses = ["주문완료", "주문취소", "수령완료"];
      if (!allowedStatuses.includes(newStatus)) {
        alert("허용되지 않은 주문 상태입니다.");
        return;
      }

      const updateData = { status: newStatus };
      const nowISO = new Date().toISOString();

      if (newStatus === "수령완료") {
        updateData.pickupTime = nowISO;
        updateData.completed_at = nowISO;
      } else if (newStatus === "주문취소") {
        updateData.canceled_at = nowISO;
      }

      const response = await api.put(
        `/orders/${orderId}/status?userId=${userData.userId}`,
        updateData
      );

      if (response.data?.success) {
        setOrders((currentOrders) =>
          currentOrders.map((order) => {
            if (order.order_id === orderId) {
              const updatedOrder = { ...order, status: newStatus };
              if (newStatus === "수령완료") updatedOrder.completed_at = nowISO;
              if (newStatus === "주문취소") updatedOrder.canceled_at = nowISO;
              if (newStatus === "수령완료") updatedOrder.pickupTime = nowISO;
              return updatedOrder;
            }
            return order;
          })
        );

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
      } else {
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
  };

  const openDetailModal = (order) => {
    setSelectedOrder({ ...order });
    setTempItemNumber(order.item_number || 1);
    setTempQuantity(order.quantity || 1);
    setTempPrice(order.price ?? 0);
    setIsEditingDetails(false);
    setIsDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null);
    setIsEditingDetails(false);
  };

  const toggleDetailsEditMode = () => {
    if (isEditingDetails) {
      if (selectedOrder) {
        setTempItemNumber(selectedOrder.item_number || 1);
        setTempQuantity(selectedOrder.quantity || 1);
        setTempPrice(selectedOrder.price ?? 0);
      }
    }
    setIsEditingDetails((prev) => !prev);
  };

  const handleTempInputChange = (field, value) => {
    if (field === "itemNumber") {
      setTempItemNumber(value);
    } else if (field === "quantity") {
      setTempQuantity(value);
    } else if (field === "price") {
      setTempPrice(value);
    }
  };

  const saveOrderDetails = async () => {
    if (!selectedOrder || !userData?.userId) {
      console.error("Cannot save details: selectedOrder or userId missing.");
      return;
    }

    const orderId = selectedOrder.order_id;
    const parsedItemNumber = parseInt(tempItemNumber, 10) || 1;
    const parsedQuantity = parseInt(tempQuantity, 10) || 1;
    const parsedPrice = parseFloat(tempPrice) || 0;

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

    const newTotalAmount = parsedPrice * parsedQuantity;

    const updateData = {
      item_number: parsedItemNumber,
      quantity: parsedQuantity,
      price: parsedPrice,
      total_amount: newTotalAmount,
    };

    try {
      console.log(
        `API 호출: 주문(${orderId}) 상세 정보 업데이트 ->`,
        updateData
      );
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

      const updatedOrder = {
        ...selectedOrder,
        ...updateData,
      };
      setOrders((currentOrders) =>
        currentOrders.map((o) => (o.order_id === orderId ? updatedOrder : o))
      );
      setSelectedOrder(updatedOrder);
      setIsEditingDetails(false);

      alert("주문 정보가 성공적으로 업데이트되었습니다.");
    } catch (error) {
      console.error("주문 상세 정보 업데이트 오류:", error);
      alert(`주문 정보 업데이트 중 오류 발생: ${error.message}`);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const paginate = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      scrollToTop();
    }
  };

  const goToPreviousPage = () => {
    paginate(currentPage - 1);
  };

  const goToNextPage = () => {
    paginate(currentPage + 1);
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return null;
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
      </svg>
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
      </svg>
    );
  };

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

  const getPostUrlByProductId = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    return product?.band_post_url || "";
  };

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
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-medium"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          사용자 정보를 불러오는 중이거나 인증에 실패했습니다.
        </p>
      </div>
    );
  }

  const totalItems = ordersData?.pagination?.total || 0;
  const totalPages = ordersData?.pagination?.totalPages || 1;
  const displayOrders = orders || [];

  const stats = orderStatsData?.data || {
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    estimatedRevenue: 0,
    confirmedRevenue: 0,
  };
  const totalStatsOrders = stats.totalOrders || 0;
  const totalCompletedOrders = stats.completedOrders || 0;
  const totalPendingOrders = stats.pendingOrders || 0;

  return (
    <div ref={topRef} className=" min-h-screen">
      {/* 헤더: 페이지 제목, 요약 정보 */}
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
            주문 관리
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            총 {totalStatsOrders}건의 주문 목록입니다.
          </p>

          <p className="text-sm md:text-base text-gray-600">
            주문 목록을 확인하고 상태를 업데이트하세요.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3 md:gap-4 text-center w-full md:w-auto">
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">총 주문</div>
            <div className="text-xl md:text-2xl font-semibold text-gray-900">
              {totalStatsOrders}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">
              수령완료
            </div>
            <div className="text-xl md:text-2xl font-semibold text-green-600">
              {totalCompletedOrders} 건
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">미수령</div>
            <div className="text-xl md:text-2xl font-semibold text-blue-600">
              {totalPendingOrders}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200">
            <div className="text-xs md:text-sm text-gray-500 mb-1">완료율</div>
            <div className="text-xl md:text-2xl font-semibold text-green-600">
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

      {/* === 주문 테이블 (스타일 수정) === */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6 md:mb-8">
        {/* 1. overflow-x-auto 추가: 테이블이 넘칠 경우 가로 스크롤 생성 */}
        <div className="overflow-x-auto">
          {/* 2. min-w-full 추가: 테이블 내용이 항상 가로로 펼쳐지도록 함 */}
          <div className="min-w-full">
            {/* 3. table 클래스 변경: min-w-full 및 divide 사용 (ProductsPage와 유사하게) */}
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr className="border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wider">
                  {/* --- 테이블 헤더 (th) --- */}
                  {/* 각 th에 px-4 py-3 text-left/center 추가 (ProductsPage 스타일과 유사하게) */}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("ordered_at")}
                      className="flex items-center hover:text-gray-900 focus:outline-none"
                    >
                      주문일시 {getSortIcon("ordered_at")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상품명
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("customer_name")}
                      className="flex items-center hover:text-gray-900 focus:outline-none"
                    >
                      고객명 {getSortIcon("customer_name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    고객 댓글
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상품번호
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    수량
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("total_amount")}
                      className="flex items-center justify-end w-full hover:text-gray-900 focus:outline-none"
                    >
                      금액 {getSortIcon("total_amount")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    바코드
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                </tr>
              </thead>
              {/* 4. tbody에 divide 추가 (테이블과 일관성) */}
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
                      onClick={() => openDetailModal(order)}
                    >
                      {/* --- 테이블 데이터 (td) --- */}
                      {/* 5. 각 td에 px-4 py-4 및 whitespace-nowrap 추가 (필요한 곳에) */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium text-center">
                        {orderNumber}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(order.ordered_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {" "}
                        {/* 상품명: 줄바꿈 방지 */}
                        <div className="text-sm text-gray-800 font-medium truncate max-w-xs">
                          {" "}
                          {/* 필요 시 truncate 추가 */}
                          {getProductNameById(order.product_id)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {" "}
                        {/* 고객명: 줄바꿈 방지 */}
                        <div className="text-sm text-gray-900 font-semibold truncate max-w-[120px]">
                          {" "}
                          {/* 필요 시 truncate 추가 */}
                          {order.customer_name}
                        </div>
                      </td>
                      <td className="px-4 py-4 max-w-xs hidden md:table-cell whitespace-nowrap">
                        {" "}
                        {/* 고객 댓글 TD: 줄바꿈 방지 */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-600 line-clamp-1">
                            {" "}
                            {/* 댓글 내용은 line-clamp 유지 */}
                            {order.comment || "-"}
                          </span>
                          {postUrl && (
                            <a
                              href={postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
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
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {" "}
                        {/* 상품 번호: 줄바꿈 방지 */}
                        <span className="text-sm text-gray-800 font-semibold">
                          {order.item_number || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {" "}
                        {/* 수량: 줄바꿈 방지 */}
                        <span className="text-sm font-medium text-gray-800">
                          {order.quantity || 0}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(order.total_amount)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center hidden md:table-cell">
                        {getProductBarcode(order.product_id) ? (
                          <div className="mx-auto max-w-[120px]">
                            <Barcode
                              value={getProductBarcode(order.product_id)}
                              height={30}
                              width={1.2}
                              fontSize={10}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">없음</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {" "}
                        {/* 상태: 줄바꿈 방지 */}
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
                {displayOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan="10" // colSpan은 기존 헤더 개수와 일치하게 유지
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      표시할 주문 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* === 테이블 끝 === */}

        {/* 페이지네이션 (기존 코드 유지) */}
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
              {(() => {
                const pageNumbers = [];
                const maxPagesToShow = 3;
                let startPage = Math.max(
                  1,
                  currentPage - Math.floor(maxPagesToShow / 2)
                );
                let endPage = Math.min(
                  totalPages,
                  startPage + maxPagesToShow - 1
                );
                if (endPage - startPage + 1 < maxPagesToShow) {
                  startPage = Math.max(1, endPage - maxPagesToShow + 1);
                }

                if (startPage > 1) {
                  pageNumbers.push(1);
                  if (startPage > 2) pageNumbers.push("...");
                }
                for (let i = startPage; i <= endPage; i++) {
                  pageNumbers.push(i);
                }
                if (endPage < totalPages) {
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

      {/* 상세 정보 모달 (기존 코드 유지) */}
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
          </div>
        </div>
      )}
    </div>
  );
}
