"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { api } from "../lib/fetcher";
import JsBarcode from "jsbarcode";
import { useUser, useOrders, useProducts, useOrderStats } from "../hooks";
import { StatusButton } from "../components/StatusButton";

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
  CurrencyDollarIcon,
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
      bgColor = "bg-black";
      textColor = "text-gray-100";
      Icon = ExclamationCircleIcon;
      break;

    case "결제완료":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-700";
      Icon = CurrencyDollarIcon;
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
  const [statsLoading, setStatsLoading] = useState(true);
  // --- Add: 통계 기간 필터 상태 추가 (대시보드처럼 'today' 기본값) ---
  const [filterDateRange, setFilterDateRange] = useState("today");
  // --- Add: 선택된 주문 ID 목록 상태 ---
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const displayOrders = orders || [];
  // --- Add: Ref for header checkbox indeterminate state ---
  const checkbox = useRef();

  // --- Add: Calculate if all *displayed* orders are selected ---
  const displayedOrderIds = displayOrders.map((o) => o.order_id);
  const isAllDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.every((id) => selectedOrderIds.includes(id));
  const isSomeDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.some((id) => selectedOrderIds.includes(id));

  // --- Add: Set indeterminate state for header checkbox ---
  useEffect(() => {
    if (checkbox.current) {
      checkbox.current.indeterminate =
        isSomeDisplayedSelected && !isAllDisplayedSelected;
    }
  }, [isSomeDisplayedSelected, isAllDisplayedSelected]);

  // --- Add: Individual checkbox change handler ---
  const handleCheckboxChange = (e, orderId) => {
    const isChecked = e.target.checked;
    setSelectedOrderIds((prevSelectedIds) => {
      if (isChecked) {
        // Add ID if checked
        return [...new Set([...prevSelectedIds, orderId])]; // Use Set to avoid duplicates
      } else {
        // Remove ID if unchecked
        return prevSelectedIds.filter((id) => id !== orderId);
      }
    });
  };

  // --- Add: Select All checkbox change handler ---
  const handleSelectAllChange = (e) => {
    const isChecked = e.target.checked;
    const currentDisplayedIds = displayOrders.map((order) => order.order_id);

    setSelectedOrderIds((prevSelectedIds) => {
      const otherSelectedIds = prevSelectedIds.filter(
        (id) => !currentDisplayedIds.includes(id)
      ); // Keep IDs selected from other pages
      if (isChecked) {
        // Select all currently displayed + keep others
        return [...new Set([...otherSelectedIds, ...currentDisplayedIds])];
      } else {
        // Deselect all currently displayed, keep others
        return otherSelectedIds;
      }
    });
  };

  // --- Add: Bulk status update handler ---
  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrderIds.length === 0) {
      alert("먼저 주문을 선택해주세요.");
      return;
    }

    // --- Backend Note: "결제완료" requires backend implementation ---
    const targetStatus = newStatus === "결제완료" ? "결제완료" : "수령완료"; // Determine target status
    const statusVerb = targetStatus === "수령완료" ? "수령 완료" : "결제 완료"; // For confirmation message

    if (
      !window.confirm(
        `${selectedOrderIds.length}개의 주문을 '${statusVerb}' 상태로 변경하시겠습니까?`
      )
    ) {
      return;
    }

    console.log(
      `Attempting to update ${selectedOrderIds.length} orders to ${targetStatus}`
    );

    // --- Option 1: Sequential Update (Simpler, potentially slow) ---
    let successCount = 0;
    let failCount = 0;
    const updatedIds = []; // Track successfully updated IDs for potential UI update

    setLoading(true); // Indicate bulk operation is in progress

    for (const orderId of selectedOrderIds) {
      try {
        // --- Reuse existing single status change logic ---
        // Prepare update data based on targetStatus
        const updateData = { status: targetStatus };
        const nowISO = new Date().toISOString();

        if (targetStatus === "수령완료") {
          updateData.pickupTime = nowISO;
          updateData.completed_at = nowISO;
          updateData.canceled_at = null; // Ensure cancellation time is cleared
        } else if (targetStatus === "결제완료") {
          // Define what happens for "결제완료" - **Requires Backend Logic**
          // Example: updateData.payment_status = 'paid'; updateData.paid_at = nowISO;
          console.warn(
            `Backend logic for '결제완료' status on order ${orderId} needs implementation.`
          );
        }
        // Add other status logic if needed (e.g., for '주문취소')

        const response = await api.put(
          `/orders/${orderId}/status?userId=${userData.userId}`,
          updateData
        );

        if (!response.data?.success) {
          throw new Error(
            response.data?.message || `Order ${orderId} status update failed`
          );
        }
        successCount++;
        updatedIds.push(orderId); // Add to successfully updated list
      } catch (err) {
        console.error(`Failed to update status for order ${orderId}:`, err);
        failCount++;
        // Optionally stop on first error: break;
      }
    }

    setLoading(false); // End loading state

    // --- Update UI and State ---
    if (successCount > 0) {
      // 1. Update local 'orders' state optimistically for successful ones
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          updatedIds.includes(order.order_id)
            ? { ...order, status: targetStatus }
            : order
        )
      );
      // 2. Refetch data from server for consistency
      mutateOrders();
      mutateOrderStats(); // Stats likely changed
    }

    // 3. Clear selection regardless of outcome
    setSelectedOrderIds([]);

    // 4. Provide feedback
    let message = "";
    if (successCount > 0) message += `${successCount}건 성공. `;
    if (failCount > 0) message += `${failCount}건 실패.`;
    if (!message) message = "상태 변경 작업 완료."; // Should not happen if selection wasn't empty
    alert(message);

    // --- Option 2: Bulk API Endpoint (Preferred for many selections) ---
    /*
    if (!window.confirm(`${selectedOrderIds.length}개의 주문을 '${statusVerb}' 상태로 변경하시겠습니까?`)) {
        return;
    }
    try {
        setLoading(true);
        const response = await api.patch('/orders/bulk-status', { // Example endpoint
            userId: userData.userId,
            orderIds: selectedOrderIds,
            status: targetStatus,
        });
        if (!response.data?.success) {
            throw new Error(response.data?.message || 'Bulk update failed');
        }
        alert(`${response.data.updatedCount || selectedOrderIds.length}건 상태 변경 완료.`);
        setSelectedOrderIds([]);
        mutateOrders();
        mutateOrderStats();
    } catch (err) {
        console.error("Bulk update error:", err);
        alert(`일괄 변경 실패: ${err.message}`);
    } finally {
        setLoading(false);
    }
    */
  };

  // --- Add: 날짜 범위 파라미터 계산 함수 ---
  const calculateDateFilterParams = (range) => {
    const now = new Date();
    let startDate = new Date();
    const endDate = new Date(now); // 항상 오늘 자정 직전까지

    // Set end date to the very end of today
    endDate.setHours(23, 59, 59, 999);

    switch (range) {
      case "today":
        startDate.setHours(0, 0, 0, 0); // 오늘 자정
        break;
      case "7days":
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0); // 7일 전 자정
        break;
      case "30days":
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0); // 1달 전 자정
        break;
      case "90days":
        startDate.setMonth(now.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0); // 3달 전 자정
        break;
      default:
        // 'all' 또는 정의되지 않은 경우, 날짜 필터 없음 (API가 null/undefined 처리 가정)
        return { startDate: undefined, endDate: undefined };
    }

    // API가 요구하는 형식으로 변환 (예: ISO 문자열)
    // API 명세에 따라 'YYYY-MM-DD' 등으로 변경 필요할 수 있음
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  };

  const { startDate, endDate } = calculateDateFilterParams(filterDateRange); // 계산된 날짜 가져오기

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
  // 변경: useOrders -> useUser 훅으로 변경
  const {
    data: userDataFromHook,
    error: userError,
    isLoading: isUserLoading,
  } = useUser(userData?.userId, swrOptions); // useUser 훅 사용

  const {
    data: ordersData,
    error: ordersError,
    isLoading: isOrdersLoading,
    mutate: mutateOrders, // mutate 함수 가져오기
  } = useOrders(
    userData?.userId,
    currentPage,
    {
      limit: itemsPerPage,
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
      startDate: startDate, // startDate 추가
      endDate: endDate, // endDate 추가
    },
    swrOptions
  );
  const { data: productsData, error: productsError } = useProducts(
    userData?.userId,
    1,
    { limit: 1000 },
    swrOptions
  );
  // --- Modify: useOrderStats 훅에 filterDateRange 사용 및 mutate 함수 가져오기 ---
  const {
    data: orderStatsData,
    error: orderStatsError,
    isLoading: isOrderStatsLoading,
    mutate: mutateOrderStats, // 통계 새로고침용 mutate 함수 추가
  } = useOrderStats(
    userData?.userId,
    filterDateRange, // <-- 여기를 filterDateRange 상태로 변경
    null,
    null,
    swrOptions
  );

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

  // --- Add: 기간 필터 버튼 옵션 정의 ---
  const dateRangeOptions = [
    { value: "today", label: "오늘", shortLabel: "1D" },
    { value: "7days", label: "1주", shortLabel: "7D" },
    { value: "30days", label: "1개월", shortLabel: "1M" },
    { value: "90days", label: "3개월", shortLabel: "3M" },
  ];

  // 주문 데이터 업데이트 표시
  const getTimeDifferenceInMinutes = (dateString) => {
    if (!dateString) return "알 수 없음";

    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000); // Convert milliseconds to minutes

    if (minutes < 1) {
      return "방금 전";
    } else if (minutes < 60) {
      return `${minutes}분 전`;
    } else if (minutes < 1440) {
      // Less than 24 hours
      const hours = Math.floor(minutes / 60);
      return `${hours}시간 전`;
    } else {
      const days = Math.floor(minutes / 1440);
      return `${days}일 전`;
    }
  };

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
      mutateOrders(); // 기존 주문 목록 갱신
      mutateOrderStats(); // <-- 추가: 통계 데이터도 갱신 요청
    } catch (err) {
      mutateOrders(); // 기존 주문 목록 갱신
      mutateOrderStats(); // <-- 추가: 통계 데이터도 갱신 요청
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
      mutateOrders(); // 기존 주문 목록 갱신
      mutateOrderStats(); // <-- 추가: 통계 데이터도 갱신 요청 (가격/수량 변경 시)
    } catch (err) {
      mutateOrders(); // 에러 시에도 원상복구 위해
      mutateOrderStats(); // 에러 시에도 원상복구 위해
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
    setSelectedOrderIds([]); // <<< 검색 시 선택 초기화 추가
  };
  const handleSortChange = (field) => {
    if (sortBy === field)
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
    setSelectedOrderIds([]); // <<< 정렬 변경 시 선택 초기화 (선택 사항)
  };
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
    setSelectedOrderIds([]); // <<< 상태 필터 변경 시 선택 초기화 추가
  };
  // --- Add: 기간 필터 버튼 클릭 핸들러 ---
  const handleDateRangeChange = (range) => {
    setFilterDateRange(range);
    setCurrentPage(1);
    setSelectedOrderIds([]); // <<< 기간 필터 변경 시 선택 초기화 추가
    // SWR이 filterDateRange 변경을 감지하고 자동으로 useOrderStats 훅 데이터 갱신
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
            {/* <p className="text-sm md:text-base text-gray-600">
              총 {totalStatsOrders}건 주문 (
              {filterDateRange === "all" ? "전체" : filterDateRange})
            </p> */}
            <p className="text-sm md:text-base text-gray-600">
              최근 업데이트:{" "}
              {userDataFromHook?.last_crawl_at
                ? getTimeDifferenceInMinutes(userDataFromHook?.last_crawl_at)
                : "알 수 없음"}
            </p>
          </div>

          {/* --- Add: Combined Stats and Filter Card --- */}

          {statsLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
              <LoadingSpinner color="text-gray-500" />
            </div>
          )}
          {/* Content Wrapper: Flex 레이아웃 사용 */}
          <div className="flex flex-col">
            {/* Date Range Filter Buttons */}
            <div className="flex-shrink-0 mb-4">
              {" "}
              {/* 상단 간격 추가 (모바일) */}
              <div className="flex items-center bg-white border border-gray-300 rounded-lg p-1 space-x-1 shadow-sm">
                {dateRangeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDateRangeChange(option.value)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      filterDateRange === option.value
                        ? "bg-gray-200 text-gray-900" // 활성 스타일
                        : "text-gray-600 hover:bg-gray-100" // 비활성 스타일
                    }`}
                  >
                    <span className="">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Statistics Display (Compact) */}
            <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-sm w-full sm:w-auto">
              {" "}
              {/* 반응형 그리드 */}
              {/* Stat Item: 총 주문 */}
              <div className="flex flex-col items-start">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">
                  총 주문
                </dt>
                <dd className="font-semibold text-xl text-gray-900 mt-0.5">
                  {totalStatsOrders}
                </dd>
              </div>
              {/* Stat Item: 수령완료 */}
              <div className="flex flex-col items-start">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">
                  수령완료
                </dt>
                <dd className="font-semibold text-xl text-gray-900 mt-0.5">
                  {totalCompletedOrders}
                </dd>
              </div>
              {/* Stat Item: 미수령 */}
              <div className="flex flex-col items-start">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">
                  미수령
                </dt>
                <dd className="font-semibold text-xl text-gray-900 mt-0.5">
                  {totalPendingOrders}
                </dd>
              </div>
              {/* Stat Item: 완료율 */}
              <div className="flex flex-col items-start">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">
                  완료율
                </dt>
                <dd className="font-semibold text-xl text-gray-900 mt-0.5">
                  {completionRate}%
                </dd>
              </div>
            </div>
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
                { value: "결제완료", label: "결제완료" },
                { value: "확인필요", label: "확인필요" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleFilterChange(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    filterStatus === s.value
                      ? "bg-blue-100 text-blue-500  shadow-sm"
                      : "bg-white text-gray-700 hover:bg-gray-100"
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
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 bg-gray-50 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
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
                      <button
                        onClick={() => handleSortChange("completed_at")}
                        className="inline-flex items-center bg-none border-none p-0 cursor-pointer font-inherit text-inherit"
                      >
                        수령일시 {getSortIcon("completed_at")}
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
                    <th
                      scope="col"
                      className="relative w-12 px-6 sm:w-16 sm:px-8"
                    >
                      <input
                        type="checkbox"
                        className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 sm:left-6"
                        ref={checkbox} // Ref for indeterminate state
                        checked={isAllDisplayedSelected} // Calculated below
                        onChange={handleSelectAllChange}
                      />
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
                      const isSelected = selectedOrderIds.includes(
                        order.order_id
                      );
                      return (
                        <tr
                          key={order.order_id}
                          className={`${
                            isSelected ? "bg-orange-50" : "hover:bg-gray-50" // isSelected 사용
                          } transition-colors group`}
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            {orderNum}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatDate(order.ordered_at)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatDate(order.completed_at)}
                          </td>
                          <td
                            className="px-4 py-4 text-sm text-blue-600 font-medium max-w-[150px] truncate"
                            title={getProductNameById(order.product_id)}
                            onClick={() => openDetailModal(order)}
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
                            className="px-4 py-4 text-sm text-gray-900 font-semibold max-w-[150px] truncate hidden md:table-cell "
                            title={order.comment || ""}
                            onClick={() => openDetailModal(order)}
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
                          <td className="relative w-12 px-6 sm:w-16 sm:px-8">
                            {/* Optional: Add visual indication when selected */}

                            <input
                              type="checkbox"
                              className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 sm:left-6"
                              value={order.order_id}
                              checked={isSelected}
                              onChange={(e) =>
                                handleCheckboxChange(e, order.order_id)
                              }
                              // Prevent row onClick when clicking checkbox
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Modify: Footer Area Logic --- */}

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
                            ? "z-10 bg-gray-50 border-gray-500 text-gray-600"
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

          {/* Left: Bulk Action Buttons (항상 공간은 차지, 내용은 선택 시 보임) */}
          <div className="flex items-center space-x-3 flex-row-reverse ">
            {/* 선택된 항목이 있을 때만 버튼 내용 활성화 */}
            <button
              onClick={() => handleBulkStatusUpdate("수령완료")}
              disabled={selectedOrderIds.length === 0 || loading} // Disable if no selection or during loading
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${
                selectedOrderIds.length === 0
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100" // 선택 없을 시 숨김
              }`}
              aria-hidden={selectedOrderIds.length === 0} // 접근성 개선
            >
              <CheckCircleIcon className="w-6 h-6" />
              선택 수령완료 ({selectedOrderIds.length})
            </button>
            <button
              onClick={() => handleBulkStatusUpdate("결제완료")}
              disabled={selectedOrderIds.length === 0 || loading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${
                selectedOrderIds.length === 0
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100" // 선택 없을 시 숨김
              }`}
              aria-hidden={selectedOrderIds.length === 0} // 접근성 개선
            >
              <CurrencyDollarIcon className="w-6 h-6" />
              선택 결제완료 ({selectedOrderIds.length})
            </button>
            {/* 선택된 항목이 없을 때 보여줄 플레이스홀더 (선택사항) */}
            {selectedOrderIds.length === 0 && (
              <span className="text-xs text-gray-400 italic h-[26px] flex items-center mr-4">
                항목을 선택하세요
              </span> // 버튼 높이와 유사하게 맞춤
            )}
          </div>
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
                    <StatusButton
                      onClick={saveOrderDetails}
                      variant="primary" // primary variant 사용
                      icon={PencilSquareIcon}
                      isLoading={/* 저장 중 상태 변수 */ false} // 로딩 상태 연결 (예: isSaving)
                    >
                      변경사항 저장
                    </StatusButton>
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
