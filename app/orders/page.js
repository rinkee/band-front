"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { api } from "../lib/fetcher";
import JsBarcode from "jsbarcode";
import { useOrders, useProducts, useOrderStats } from "../hooks";

// --- 아이콘 (Heroicons) ---
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  SparklesIcon, // 상태 아이콘
  MagnifyingGlassIcon,
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  DocumentTextIcon,
  QrCodeIcon,
  LinkIcon,
  PencilSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowUturnLeftIcon,
  ArrowPathIcon,
  UserCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  return (
    <svg
      className={`animate-spin ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
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
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

// --- 상태 배지 ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "수령완료":
      bgColor = "bg-green-100";
      textColor = "text-green-700";
      Icon = CheckCircleIcon;
      break;
    case "주문취소":
      bgColor = "bg-red-100";
      textColor = "text-red-700";
      Icon = XCircleIcon;
      break;
    case "주문완료":
      bgColor = "bg-blue-100";
      textColor = "text-blue-700";
      Icon = SparklesIcon;
      break;
    case "확인필요":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-700";
      Icon = ExclamationCircleIcon;
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-600";
      Icon = ExclamationCircleIcon;
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-3.5 w-3.5" /> {status}
    </span>
  );
}

// --- 라이트 테마 카드 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

// --- 바코드 컴포넌트 ---
const Barcode = ({ value, width = 2, height = 60, fontSize = 16 }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width,
          height,
          displayValue: true,
          fontSize,
          margin: 10,
          background: "transparent",
        });
      } catch (error) {
        console.error("Barcode Error:", error);
        if (barcodeRef.current) barcodeRef.current.innerHTML = "";
      }
    } else if (barcodeRef.current) barcodeRef.current.innerHTML = "";
  }, [value, width, height, fontSize]);
  if (!value)
    return (
      <div className="text-center text-xs text-gray-500 my-4">
        바코드 정보 없음
      </div>
    );
  return <svg ref={barcodeRef} className="block mx-auto"></svg>;
};

// --- 상태 변경 버튼 스타일 함수 ---
const getStatusButtonStyle = (status) => {
  // isCurrent 인자 제거, 비활성화는 disabled 속성으로만 처리
  let baseStyle =
    "inline-flex items-center gap-1.5 px-3 py-3 rounded-md font-medium text-xs sm:text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"; // 아이콘 공간 gap 추가
  let statusClass = "";
  if (status === "주문완료")
    statusClass = "bg-blue-600 text-white hover:bg-blue-700";
  else if (status === "수령완료")
    statusClass = "bg-green-600 text-white hover:bg-green-700";
  else if (status === "주문취소")
    statusClass = "bg-red-600 text-white hover:bg-red-700";
  else if (status === "확인필요")
    statusClass = "bg-yellow-500 text-white hover:bg-yellow-600";
  else statusClass = "bg-gray-600 text-white hover:bg-gray-700";

  return `${baseStyle} ${statusClass}`;
};

// --- 상태에 따른 아이콘 반환 함수 ---
const getStatusIcon = (status) => {
  switch (status) {
    case "수령완료":
      return <CheckCircleIcon className="w-5 h-5" />;
    case "주문취소":
      return <XCircleIcon className="w-5 h-5" />;
    case "주문완료":
      return <SparklesIcon className="w-5 h-5" />;
    case "확인필요":
      return <ExclamationCircleIcon className="w-4 h-4" />;
    default:
      return null;
  }
};

// --- 메인 페이지 컴포넌트 ---
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
  const [activeTab, setActiveTab] = useState("status");
  const [filterDateRange, setFilterDateRange] = useState("all");
  const [statsLoading, setStatsLoading] = useState(true);

  // SWR Hooks
  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 60000,
    dedupingInterval: 30000,
    onError: (err) => {
      console.error("SWR Error:", err);
    },
  };
  const {
    data: ordersData,
    error: ordersError,
    isLoading: isOrdersLoading,
  } = useOrders(
    userData?.userId,
    currentPage,
    {
      limit: itemsPerPage,
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
    { limit: 1000 },
    swrOptions
  );
  const {
    data: orderStatsData,
    error: orderStatsError,
    isLoading: isOrderStatsLoading,
  } = useOrderStats(userData?.userId, filterDateRange, null, null, swrOptions);

  // useEffect Hooks
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      setError(null);
      try {
        const d = sessionStorage.getItem("userData");
        if (!d) {
          router.replace("/login");
          return;
        }
        const o = JSON.parse(d);
        if (!o?.userId) throw new Error("Invalid session");
        setUserData(o);
        setLoading(false);
      } catch (err) {
        console.error("Auth Error:", err);
        setError("Auth Error");
        sessionStorage.clear();
        localStorage.removeItem("userId");
        router.replace("/login");
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);
  useEffect(() => {
    if (productsData?.data) setProducts(productsData.data);
    if (productsError) console.error("Product Error:", productsError);
  }, [productsData, productsError]);
  useEffect(() => {
    if (ordersData?.data) setOrders(ordersData.data);
    if (ordersError) {
      console.error("Order Error:", ordersError);
      setError("Order Fetch Error");
    }
  }, [ordersData, ordersError]);
  useEffect(() => {
    setStatsLoading(isOrderStatsLoading);
  }, [isOrderStatsLoading]);

  // Helper Functions
  const getProductNameById = (id) =>
    products.find((p) => p.product_id === id)?.title || "N/A";
  const getProductBarcode = (id) =>
    products.find((p) => p.product_id === id)?.barcode || "";
  const getPostUrlByProductId = (id) =>
    products.find((p) => p.product_id === id)?.band_post_url || "";
  const formatCurrency = (amt) =>
    new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amt ?? 0);
  const formatDate = (ds) => {
    if (!ds) return "-";
    try {
      const d = new Date(ds);
      if (isNaN(d.getTime())) return "Error";
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const hr = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${mo}.${da} ${hr}:${mi}`;
    } catch (e) {
      return "Error";
    }
  };

  // Event Handlers
  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !userData?.userId) return;
    try {
      const allowed = ["주문완료", "주문취소", "수령완료", "확인필요"];
      if (!allowed.includes(newStatus)) return;
      const updateData = { status: newStatus };
      const nowISO = new Date().toISOString();
      if (newStatus === "수령완료") {
        updateData.pickupTime = nowISO;
        updateData.completed_at = nowISO;
        updateData.canceled_at = null;
      } else if (newStatus === "주문취소") {
        updateData.canceled_at = nowISO;
        updateData.pickupTime = null;
        updateData.completed_at = null;
      } else if (newStatus === "주문완료") {
        updateData.pickupTime = null;
        updateData.completed_at = null;
        updateData.canceled_at = null;
      }
      const response = await api.put(
        `/orders/${orderId}/status?userId=${userData.userId}`,
        updateData
      );
      if (!response.data?.success)
        throw new Error(response.data?.message || "Status Change Failed");
      setOrders((current) =>
        current.map((o) =>
          o.order_id === orderId ? { ...o, ...updateData } : o
        )
      );
      if (selectedOrder?.order_id === orderId)
        setSelectedOrder((prev) => (prev ? { ...prev, ...updateData } : null));
      // 수령완료 처리 시 모달 닫기 추가
      if (newStatus === "수령완료") {
        closeDetailModal();
      }
    } catch (err) {
      console.error("Status Change Error:", err);
      alert(`Status Error: ${err.message}`);
    }
  };
  const handleTabChange = (tab) => setActiveTab(tab);
  const openDetailModal = (order) => {
    setSelectedOrder({ ...order });
    setTempItemNumber(order.item_number || 1);
    setTempQuantity(order.quantity || 1);
    setTempPrice(order.price ?? 0);
    setIsEditingDetails(false);
    setActiveTab("status");
    setIsDetailModalOpen(true);
  };
  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null);
    setIsEditingDetails(false);
  };
  const toggleDetailsEditMode = () => setIsEditingDetails((prev) => !prev);
  const handleTempInputChange = (field, value) => {
    let numVal;
    if (field === "itemNumber" || field === "quantity")
      numVal = Math.max(1, parseInt(value, 10) || 1);
    else if (field === "price") numVal = Math.max(0, parseFloat(value) || 0);
    else return;
    if (field === "itemNumber") setTempItemNumber(numVal);
    else if (field === "quantity") setTempQuantity(numVal);
    else if (field === "price") setTempPrice(numVal);
  };
  const saveOrderDetails = async () => {
    if (!selectedOrder?.order_id || !userData?.userId) return;
    const { order_id } = selectedOrder;
    const qty = Math.max(1, parseInt(tempQuantity, 10) || 1);
    const price = Math.max(0, parseFloat(tempPrice) || 0);
    const updateData = {
      item_number: Math.max(1, parseInt(tempItemNumber, 10) || 1),
      quantity: qty,
      price: price,
      total_amount: price * qty,
    };
    try {
      const response = await api.put(
        `/orders/${order_id}?userId=${userData.userId}`,
        updateData
      );
      if (!response.data?.success)
        throw new Error(response.data?.message || "Update Failed");
      const updated = { ...selectedOrder, ...updateData };
      setOrders((current) =>
        current.map((o) => (o.order_id === order_id ? updated : o))
      );
      setSelectedOrder(updated);
      setIsEditingDetails(false);
      alert("Update Success.");
    } catch (err) {
      console.error("Update Error:", err);
      alert(`Update Error: ${err.message}`);
    }
  };
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };
  const handleSortChange = (field) => {
    if (sortBy === field)
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const paginate = (pageNumber) => {
    const total = ordersData?.pagination?.totalPages || 1;
    if (pageNumber >= 1 && pageNumber <= total) {
      setCurrentPage(pageNumber);
      scrollToTop();
    }
  };
  const goToPreviousPage = () => paginate(currentPage - 1);
  const goToNextPage = () => paginate(currentPage + 1);
  const getSortIcon = (field) =>
    sortBy !== field ? (
      <ChevronUpDownIcon className="w-4 h-4 ml-1 text-gray-400" />
    ) : sortOrder === "asc" ? (
      <ChevronUpIcon className="w-4 h-4 ml-1 text-gray-700" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 ml-1 text-gray-700" />
    );

  // --- 로딩 및 에러 UI ---
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10 text-orange-500" />
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Error</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
            >
              <ArrowPathIcon className="w-4 h-4" /> Reload
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" /> Logout
            </button>
          </div>
        </LightCard>
      </div>
    );
  if (!userData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">User data unavailable.</p>
      </div>
    );

  // --- 데이터 준비 ---
  const totalItems = ordersData?.pagination?.total || 0;
  const totalPages = ordersData?.pagination?.totalPages || 1;
  const displayOrders = orders || [];
  const stats = orderStatsData?.data || {
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
  };
  const {
    totalOrders: totalStatsOrders,
    completedOrders: totalCompletedOrders,
    pendingOrders: totalPendingOrders,
  } = stats;
  const completionRate =
    totalStatsOrders > 0
      ? Math.round((totalCompletedOrders / totalStatsOrders) * 100)
      : 0;

  // --- 메인 UI ---
  return (
    <div ref={topRef} className="min-h-screen bg-gray-100 text-gray-900">
      <main className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6 md:mb-8 flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              주문 관리
            </h1>
            <p className="text-sm md:text-base text-gray-600">
              총 {totalStatsOrders}건 주문 (
              {filterDateRange === "all" ? "전체" : filterDateRange})
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 text-center w-full md:w-auto relative">
            {statsLoading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl z-10 col-span-full">
                <LoadingSpinner color="text-gray-500" />
              </div>
            )}
            <LightCard padding="p-3 md:p-4 " className="!shadow-sm">
              <div className="text-xs md:text-sm text-gray-500 mb-1">
                총 주문
              </div>
              <div className="text-xl md:text-2xl font-semibold text-gray-900">
                {totalStatsOrders}
              </div>
            </LightCard>
            <LightCard padding="p-3 md:p-4" className="!shadow-sm">
              <div className="text-xs md:text-sm text-gray-500 mb-1">
                수령완료
              </div>
              <div className="text-xl md:text-2xl font-semibold text-green-600">
                {totalCompletedOrders}
              </div>
            </LightCard>
            <LightCard padding="p-3 md:p-4" className="!shadow-sm">
              <div className="text-xs md:text-sm text-gray-500 mb-1">
                미수령
              </div>
              <div className="text-xl md:text-2xl font-semibold text-blue-600">
                {totalPendingOrders}
              </div>
            </LightCard>
            <LightCard padding="p-3 md:p-4" className="!shadow-sm">
              <div className="text-xs md:text-sm text-gray-500 mb-1">
                완료율
              </div>
              <div className="text-xl md:text-2xl font-semibold text-orange-600">
                {completionRate}%
              </div>
            </LightCard>
          </div>
        </div>

        {/* 필터 & 검색 */}
        <LightCard className="mb-6 md:mb-8" padding="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: "all", label: "전체" },
                { value: "주문완료", label: "주문완료" },
                { value: "수령완료", label: "수령완료" },
                { value: "주문취소", label: "주문취소" },
                { value: "확인필요", label: "확인필요" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleFilterChange(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    filterStatus === s.value
                      ? "bg-gray-300  shadow-sm"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-auto md:min-w-[300px]">
              <input
                type="text"
                placeholder="고객명, 상품명, 바코드 검색..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>
        </LightCard>

        {/* 주문 테이블 */}
        <LightCard padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-full align-middle inline-block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("ordered_at")}
                        className="inline-flex items-center bg-none border-none p-0 cursor-pointer font-inherit text-inherit"
                      >
                        주문일시 {getSortIcon("ordered_at")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      상품명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("customer_name")}
                        className="inline-flex items-center bg-none border-none p-0 cursor-pointer font-inherit text-inherit"
                      >
                        고객명 {getSortIcon("customer_name")}
                      </button>
                    </th>
                    {/* 고객 댓글 열 너비 수정: max-w-xs 사용 (약 160px) */}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell max-w-[160ㅔpx]">
                      고객 댓글
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      상품번호
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      수량
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("total_amount")}
                        className="inline-flex items-center bg-none border-none p-0 cursor-pointer font-inherit text-inherit"
                      >
                        금액 {getSortIcon("total_amount")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
                      바코드
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isOrdersLoading && (
                    <tr>
                      <td colSpan="10" className="px-6 py-10 text-center">
                        <LoadingSpinner className="h-6 w-6 mx-auto text-gray-400" />
                        <span className="text-sm text-gray-500 mt-2 block">
                          로딩 중...
                        </span>
                      </td>
                    </tr>
                  )}
                  {!isOrdersLoading && displayOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan="10"
                        className="px-6 py-10 text-center text-sm text-gray-500"
                      >
                        표시할 주문 없음
                        {filterStatus !== "all" || searchTerm
                          ? " (필터/검색 확인)"
                          : ""}
                      </td>
                    </tr>
                  )}
                  {!isOrdersLoading &&
                    displayOrders.map((order, index) => {
                      const startNum =
                        totalItems - (currentPage - 1) * itemsPerPage;
                      const orderNum = startNum - index;
                      const postUrl = getPostUrlByProductId(order.product_id);
                      return (
                        <tr
                          key={order.order_id}
                          className="hover:bg-gray-50 transition-colors group cursor-pointer"
                          onClick={() => openDetailModal(order)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            {orderNum}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatDate(order.ordered_at)}
                          </td>
                          <td
                            className="px-4 py-4 text-sm text-gray-900 font-medium max-w-[200px] truncate"
                            title={getProductNameById(order.product_id)}
                          >
                            {getProductNameById(order.product_id)}
                          </td>
                          <td
                            className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-medium max-w-[100px] truncate"
                            title={order.customer_name}
                          >
                            {order.customer_name || "-"}
                          </td>
                          {/* 고객 댓글 셀 너비 수정: max-w-xs 사용 */}
                          <td
                            className="px-4 py-4 text-sm text-gray-900 font-semibold max-w-xs truncate hidden md:table-cell "
                            title={order.comment || ""}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex-1 truncate">
                                {order.comment || "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-700 font-medium">
                            {order.item_number || "-"}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-700">
                            {order.quantity || 0}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-700 text-right">
                            {formatCurrency(order.total_amount)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center hidden md:table-cell">
                            {getProductBarcode(order.product_id) ? (
                              <div className="mx-auto max-w-[100px] h-[40px] flex items-center justify-center">
                                <Barcode
                                  value={getProductBarcode(order.product_id)}
                                  height={30}
                                  width={1}
                                  fontSize={8}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">
                                없음
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <StatusBadge status={order.status} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
          {/* 페이지네이션 */}
          {totalItems > itemsPerPage && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 bg-white sm:px-6 rounded-b-xl">
              <div>
                <p className="text-sm text-gray-700">
                  총 <span className="font-medium">{totalItems}</span>개 중{" "}
                  <span className="font-medium">
                    {(currentPage - 1) * itemsPerPage + 1}-
                    {Math.min(currentPage * itemsPerPage, totalItems)}
                  </span>{" "}
                  표시
                </p>
              </div>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                  aria-label="Previous"
                >
                  <ArrowLongLeftIcon className="h-5 w-5" />
                </button>
                {(() => {
                  const pageNumbers = [];
                  const maxPagesToShow = 5;
                  const halfMaxPages = Math.floor(maxPagesToShow / 2);
                  let startPage = Math.max(1, currentPage - halfMaxPages);
                  let endPage = Math.min(
                    totalPages,
                    startPage + maxPagesToShow - 1
                  );
                  if (endPage - startPage + 1 < maxPagesToShow)
                    startPage = Math.max(1, endPage - maxPagesToShow + 1);
                  if (startPage > 1) {
                    pageNumbers.push(1);
                    if (startPage > 2) pageNumbers.push("...");
                  }
                  for (let i = startPage; i <= endPage; i++)
                    pageNumbers.push(i);
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
                            ? "z-10 bg-orange-50 border-orange-500 text-orange-600"
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        }`}
                        aria-current={currentPage === page ? "page" : undefined}
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
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                  aria-label="Next"
                >
                  <ArrowLongRightIcon className="h-5 w-5" />
                </button>
              </nav>
            </div>
          )}
        </LightCard>

        {/* 주문 상세 모달 */}
        {isDetailModalOpen && selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* 1. 모달 헤더 */}
              <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  주문 상세 (ID: {selectedOrder.order_id.substring(0, 8)}...)
                </h3>
                <button
                  onClick={closeDetailModal}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>
              {/* 2. 모달 본문 */}
              <div className="flex-grow overflow-y-auto p-4 sm:p-6">
                {/* 탭 네비게이션 */}
                <div className="border-b border-gray-200 mb-6">
                  <div className="flex -mb-px space-x-6 sm:space-x-8">
                    <button
                      onClick={() => handleTabChange("status")}
                      className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${
                        activeTab === "status"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <QrCodeIcon className="w-5 h-5 mr-1.5" /> 상태 관리
                    </button>
                    <button
                      onClick={() => handleTabChange("info")}
                      className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${
                        activeTab === "info"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <DocumentTextIcon className="w-5 h-5 mr-1.5" /> 주문 정보
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(
                          getPostUrlByProductId(selectedOrder.product_id),
                          "_blank"
                        );
                      }}
                      className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${
                        activeTab === "go"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <ArrowTopRightOnSquareIcon className="w-5 h-5 mr-1.5" />
                      주문 보러가기
                    </button>
                  </div>
                </div>
                {/* 탭 내용 */}
                <div className="space-y-6">
                  {activeTab === "status" && (
                    <div className="space-y-6">
                      <LightCard
                        padding="p-4"
                        className="!shadow-sm text-center bg-gray-50"
                      >
                        <h4 className="text-base font-medium text-gray-800 mb-3">
                          상품 바코드
                        </h4>
                        <div className="max-w-xs mx-auto h-[80px] flex items-center justify-center">
                          {getProductBarcode(selectedOrder.product_id) ? (
                            <Barcode
                              value={getProductBarcode(
                                selectedOrder.product_id
                              )}
                              width={1.8}
                              height={50}
                              fontSize={14}
                            />
                          ) : (
                            <span className="text-sm text-gray-500">
                              바코드 없음
                            </span>
                          )}
                        </div>
                      </LightCard>
                      <LightCard padding="p-4" className="!shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          고객 주문 정보
                        </label>
                        <div className="flex ">
                          <div className="flex items-center ">
                            <span className="text-sm text-gray-800 font-semibold">
                              {selectedOrder.customer_name || "-"} :
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="flex-1">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {selectedOrder.comment || "댓글 없음"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </LightCard>
                      <LightCard padding="p-4" className="!shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                              현재 상태
                            </label>
                            <StatusBadge status={selectedOrder.status} />
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 items-end">
                            {/* 상태 버튼 (아이콘 추가, 디자인 일관성) */}
                            {["주문완료", "주문취소", "확인필요"].map(
                              (status) => {
                                const isCurrent =
                                  selectedOrder.status === status;
                                return (
                                  <button
                                    key={status}
                                    onClick={() =>
                                      handleStatusChange(
                                        selectedOrder.order_id,
                                        status
                                      )
                                    }
                                    disabled={isCurrent}
                                    className={getStatusButtonStyle(status)}
                                  >
                                    {getStatusIcon(status)} {/* 아이콘 추가 */}
                                    {status} 처리
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </LightCard>
                    </div>
                  )}
                  {activeTab === "info" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {[
                        {
                          label: "상품명",
                          value: getProductNameById(selectedOrder.product_id),
                          colSpan: 1,
                          readOnly: true,
                        },
                        {
                          label: "고객명",
                          value: selectedOrder.customer_name,
                          readOnly: true,
                        },
                        {
                          label: "고객 댓글",
                          value: selectedOrder.comment || "댓글 없음",
                          colSpan: 2,
                          readOnly: true,
                          preWrap: true,
                        },
                        {
                          label: "주문 일시",
                          value: formatDate(selectedOrder.ordered_at),
                          readOnly: true,
                        },
                        {
                          label: "상품 번호",
                          field: "itemNumber",
                          type: "number",
                          value: tempItemNumber,
                          min: 1,
                        },
                        {
                          label: "수량",
                          field: "quantity",
                          type: "number",
                          value: tempQuantity,
                          min: 1,
                        },
                        {
                          label: "단가 (원)",
                          field: "price",
                          type: "number",
                          value: tempPrice,
                          min: 0,
                          step: 100,
                        },
                        {
                          label: "총 금액",
                          value: formatCurrency(
                            (parseFloat(tempPrice) || 0) *
                              (parseInt(tempQuantity, 10) || 0)
                          ),
                          readOnly: true,
                          highlight: false,
                        },
                        {
                          label: "주문 ID",
                          value: selectedOrder.order_id,
                          readOnly: true,
                          smallText: true,
                        },
                        // {
                        //   label: "밴드 게시물",
                        //   link: getPostUrlByProductId(selectedOrder.product_id),
                        // },
                      ].map((item, index) => (
                        <div
                          key={index}
                          className={item.colSpan === 2 ? "md:col-span-2" : ""}
                        >
                          <label
                            htmlFor={item.field}
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            {item.label}
                          </label>
                          {item.readOnly ? (
                            <p
                              className={`px-3 py-2 rounded-md border ${
                                item.highlight
                                  ? "bg-orange-50 border-orange-200 text-orange-700 font-semibold text-right text-lg"
                                  : "bg-gray-100 border-gray-200 text-gray-800"
                              } ${
                                item.smallText ? "text-xs break-all" : "text-sm"
                              } ${item.preWrap ? "whitespace-pre-wrap" : ""}`}
                            >
                              {item.value}
                            </p>
                          ) : item.link ? (
                            item.link && (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                              >
                                <LinkIcon className="w-3 h-3 mr-1" />
                                밴드 보기
                              </a>
                            )
                          ) : (
                            <input
                              id={item.field}
                              type={item.type || "text"}
                              min={item.min}
                              step={item.step}
                              value={item.value}
                              onChange={(e) =>
                                handleTempInputChange(
                                  item.field,
                                  e.target.value
                                )
                              }
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* 3. 모달 푸터 (수정됨) */}
              <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={closeDetailModal}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
                >
                  닫기
                </button>
                <div className="flex space-x-3">
                  {activeTab === "status" && (
                    <button
                      onClick={() =>
                        handleStatusChange(selectedOrder.order_id, "수령완료")
                      }
                      disabled={selectedOrder.status === "수령완료"}
                      className={getStatusButtonStyle("수령완료")}
                    >
                      {getStatusIcon("수령완료")} {/* 아이콘 추가 */}
                      수령완료 처리
                    </button>
                  )}

                  {activeTab === "info" && (
                    <button
                      onClick={saveOrderDetails}
                      className="inline-flex items-center gap-2 px-3 py-3 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
                    >
                      <PencilSquareIcon className="w-5 h-5" /> 변경사항 저장
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
