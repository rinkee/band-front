"use client";

import React, { useState, useEffect, useRef, forwardRef } from "react"; // React Fragment 사용을 위해 React 추가
import { useRouter } from "next/navigation";
import Link from "next/link";

// Date Picker 라이브러리 및 CSS 임포트
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale"; // 한국어 로케일

import { api } from "../lib/fetcher";
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트 import 추가
import JsBarcode from "jsbarcode";
import { useUser, useProducts } from "../hooks";
import {
  useOrdersClient,
  useOrderClientMutations,
} from "../hooks/useOrdersClient";
import { StatusButton } from "../components/StatusButton"; // StatusButton 다시 임포트
import { useSWRConfig } from "swr";
import UpdateButton from "../components/UpdateButton"; // UpdateButton 추가
import { useScroll } from "../context/ScrollContext"; // <<< ScrollContext 임포트

// --- 아이콘 (Heroicons) ---
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  DocumentTextIcon, // DocumentTextIcon 다시 사용
  QrCodeIcon,
  LinkIcon,
  PencilSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon, // PencilSquareIcon 다시 사용
  ChevronUpDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowUturnLeftIcon, // 추가: 검색 초기화 아이콘
  ArrowPathIcon,
  UserCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowTopRightOnSquareIcon,
  CurrencyDollarIcon,
  XMarkIcon,
  CalendarDaysIcon,
  FunnelIcon,
  TagIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

function calculateTotalAmount(qty, priceOptions, fallbackPrice) {
  if (!Array.isArray(priceOptions) || priceOptions.length === 0) {
    return fallbackPrice * qty;
  }
  const sortedOptions = [...priceOptions].sort(
    (a, b) => b.quantity - a.quantity
  );
  let remain = qty;
  let total = 0;
  for (const opt of sortedOptions) {
    const cnt = Math.floor(remain / opt.quantity);
    if (cnt > 0) {
      total += cnt * opt.price;
      remain -= cnt * opt.quantity;
    }
  }
  if (remain > 0) {
    const smallest = sortedOptions[sortedOptions.length - 1];
    total += remain * (smallest.price / smallest.quantity);
  }
  return Math.round(total);
}

// --- 커스텀 라디오 버튼 그룹 컴포넌트 ---
function CustomRadioGroup({
  name,
  options,
  selectedValue,
  onChange,
  disabled = false,
}) {
  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-center cursor-pointer ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <div
            onClick={() => !disabled && onChange(option.value)}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mr-2 flex-shrink-0 ${
              selectedValue === option.value
                ? "bg-orange-500 border-orange-500"
                : "bg-white border-gray-300 hover:border-gray-400"
            } ${disabled ? "!bg-gray-100 !border-gray-200" : ""} `}
          >
            {selectedValue === option.value && (
              <CheckIcon className="w-3.5 h-3.5 text-white" />
            )}
          </div>
          <span
            className={`text-sm ${
              disabled ? "text-gray-400" : "text-gray-700"
            }`}
          >
            {option.label}
          </span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={() => !disabled && onChange(option.value)}
            className="sr-only"
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}

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
      bgColor = "bg-gray-800";
      textColor = "text-gray-100";
      Icon = ExclamationCircleIcon;
      break;
    case "결제완료":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-700";
      Icon = CurrencyDollarIcon;
      break;
    case "미수령":
      bgColor = "bg-red-200";
      textColor = "text-red-700";
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
      className={`inline-flex items-center gap-x-1 rounded-md px-2 py-1 text-sm font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-5 w-5" /> {status}
    </span>
  );
}

// --- 라이트 테마 카드 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl  border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

// --- 바코드 컴포넌트 ---
const Barcode = ({ value, width = 2, height = 100, fontSize = 16 }) => {
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
  return <svg ref={barcodeRef} className="block mx-auto" />;
};

// --- 상태 변경 버튼 스타일 함수 ---
const getStatusButtonStyle = (status) => {
  let baseStyle =
    " inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-medium text-xs sm:text-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
  let statusClass = "";
  // 모달 내 상태 버튼 (주문완료, 주문취소, 확인필요)
  if (status === "주문완료")
    statusClass =
      "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200";
  else if (status === "주문취소")
    statusClass =
      "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200";
  else if (status === "확인필요")
    statusClass = "bg-gray-700 text-white hover:bg-gray-800";
  // 모달 푸터 수령 완료 버튼
  else if (status === "수령완료")
    statusClass = "bg-green-600 text-white hover:bg-green-700";
  else if (status === "미수령")
    statusClass = "bg-green-600 text-white hover:bg-green-700";
  else statusClass = "bg-gray-800 text-white hover:bg-gray-900"; // 기본/폴백
  return `${baseStyle} ${statusClass}`;
};

// --- 상태에 따른 아이콘 반환 함수 ---
const getStatusIcon = (status) => {
  switch (status) {
    case "수령완료":
      return <CheckCircleIcon className="w-4 h-4" />;
    case "주문취소":
      return <XCircleIcon className="w-4 h-4" />;
    case "주문완료":
      return <SparklesIcon className="w-4 h-4" />;
    case "확인필요":
      return <ExclamationCircleIcon className="w-4 h-4" />;
    case "미수령":
      return <ExclamationCircleIcon className="w-4 h-4" />;
    default:
      return null;
  }
};

// --- 메인 페이지 컴포넌트 ---
export default function OrdersPage() {
  const router = useRouter();
  const { scrollToTop } = useScroll();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inputValue, setInputValue] = useState(""); // 검색 입력값 상태
  const [searchTerm, setSearchTerm] = useState(""); // 디바운스된 검색어 상태
  const [sortBy, setSortBy] = useState("ordered_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterSelection, setFilterSelection] = useState("주문완료"); // 사용자가 UI에서 선택한 값
  const [exactCustomerFilter, setExactCustomerFilter] = useState(null); // <<< 정확한 고객명 필터용 상태 추가
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false); // 일괄 상태 변경 로딩 상태

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);
  const [products, setProducts] = useState([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState("status");
  // statsLoading 제거 - 클라이언트에서 직접 계산하므로 불필요
  const [filterDateRange, setFilterDateRange] = useState("30days");
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  // --- 주문 정보 수정 관련 상태 복구 ---
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [tempItemNumber, setTempItemNumber] = useState(1);
  const [tempQuantity, setTempQuantity] = useState(1);
  const [tempPrice, setTempPrice] = useState(0);

  // --- 바코드 저장 관련 상태 및 함수 ---
  const [newBarcodeValue, setNewBarcodeValue] = useState("");
  const [isSavingBarcode, setIsSavingBarcode] = useState(false);

  const displayOrders = orders || [];

  // --- 현재 페이지 주문들의 총 수량 계산 ---

  // --- 현재 페이지 주문들의 총 수량 및 총 금액 계산 ---
  const { currentPageTotalQuantity, currentPageTotalAmount } =
    displayOrders.reduce(
      (totals, order) => {
        const quantity = parseInt(order.quantity, 10);
        const amount = parseFloat(order.total_amount); // <<< total_amount는 실수일 수 있으므로 parseFloat 사용

        totals.currentPageTotalQuantity += isNaN(quantity) ? 0 : quantity;
        totals.currentPageTotalAmount += isNaN(amount) ? 0 : amount; // <<< 총 금액 합산

        return totals;
      },
      { currentPageTotalQuantity: 0, currentPageTotalAmount: 0 } // <<< 초기값을 객체로 설정
    );
  // --- 총 수량 및 총 금액 계산 끝 ---
  const checkbox = useRef();

  const { mutate } = useSWRConfig(); //

  const dateRangeOptions = [
    { value: "90days", label: "3개월" },
    { value: "30days", label: "1개월" },
    { value: "7days", label: "1주" },
    { value: "today", label: "오늘" },
  ];
  const orderStatusOptions = [
    { value: "all", label: "전체" },
    { value: "주문완료", label: "주문완료" },
    { value: "수령완료", label: "수령완료" },
    { value: "미수령", label: "미수령" },
    { value: "주문취소", label: "주문취소" },
    { value: "결제완료", label: "결제완료" },
    { value: "확인필요", label: "확인필요" },
  ];

  // SWR 옵션 설정
  const swrOptions = {
    revalidateOnFocus: true, // 창 포커스 시 재검증 (유지 권장)
    revalidateOnReconnect: true, // 네트워크 재연결 시 재검증 (유지 권장)
    refreshInterval: 600000, // <<<--- 10분(600,000ms)마다 자동 재검증 추가
    dedupingInterval: 30000, // 중복 요청 방지 간격 (기존 유지 또는 조정)
    onError: (err) => console.error("SWR Error:", err),
    keepPreviousData: true, // 이전 데이터 유지 (기존 유지)
  };
  const {
    data: userDataFromHook,
    error: userError,
    isLoading: isUserLoading,
  } = useUser(userData?.userId, swrOptions);
  // useOrdersClient 훅 호출 부분 수정
  const {
    data: ordersData,
    error: ordersError,
    isLoading: isOrdersLoading,
    mutate: mutateOrders,
  } = useOrdersClient(
    userData?.userId,
    currentPage,
    {
      limit: itemsPerPage,
      sortBy,
      sortOrder,
      // --- status 와 subStatus 파라미터를 filterSelection 값에 따라 동적 결정 ---
      status: (() => {
        // 사용자가 '확인필요', '미수령' 또는 'none'(부가 상태 없음)을 선택한 경우,
        // 주 상태(status) 필터는 적용하지 않음 (undefined)
        if (
          filterSelection === "확인필요" ||
          filterSelection === "미수령" ||
          filterSelection === "none"
        ) {
          return undefined;
        }
        // 사용자가 'all'을 선택한 경우에도 주 상태 필터는 적용하지 않음
        if (filterSelection === "all") {
          return undefined;
        }
        // 그 외의 경우 (주문완료, 수령완료, 주문취소, 결제완료)는 해당 값을 status 필터로 사용
        return filterSelection;
      })(),
      subStatus: (() => {
        // 사용자가 '확인필요', '미수령', 또는 'none'을 선택한 경우, 해당 값을 subStatus 필터로 사용
        if (
          filterSelection === "확인필요" ||
          filterSelection === "미수령" ||
          filterSelection === "none"
        ) {
          return filterSelection;
        }
        // 그 외의 경우 (전체 또는 주 상태 필터링 시)는 subStatus 필터를 적용하지 않음 (undefined)
        return undefined;
      })(),
      // --- 파라미터 동적 결정 로직 끝 ---
      // --- 👇 검색 관련 파라미터 수정 👇 ---
      search: searchTerm.trim() || undefined, // 일반 검색어
      exactCustomerName: exactCustomerFilter || undefined, // <<< 정확한 고객명 파라미터 추가
      // --- 👆 검색 관련 파라미터 수정 👆 ---
      startDate: calculateDateFilterParams(
        filterDateRange,
        customStartDate,
        customEndDate
      ).startDate,
      endDate: calculateDateFilterParams(
        filterDateRange,
        customStartDate,
        customEndDate
      ).endDate,
    },
    swrOptions
  );

  const {
    data: productsData,
    error: productsError,
    mutate: mutateProducts,
  } = useProducts(
    userData?.userId,
    1,
    { limit: 1000 },
    {
      ...swrOptions,
      revalidateOnFocus: true, // 페이지 포커스 시 상품 데이터 새로고침
      refreshInterval: 300000, // 상품 데이터는 5분마다 업데이트 (주문보다 자주)
    }
  );
  // useOrderStatsClient 제거 - 클라이언트에서 직접 계산

  // 클라이언트 사이드 mutation 함수들
  const { updateOrderStatus, updateOrderDetails, bulkUpdateOrderStatus } =
    useOrderClientMutations();

  const isDataLoading = isUserLoading || isOrdersLoading;
  const displayedOrderIds = displayOrders.map((o) => o.order_id);
  const isAllDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.every((id) => selectedOrderIds.includes(id));
  const isSomeDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.some((id) => selectedOrderIds.includes(id));

  useEffect(() => {
    if (!isUserLoading) {
      console.log("User Data from Hook:", userDataFromHook);
    }
  }, [isUserLoading, userDataFromHook]);

  useEffect(() => {
    if (checkbox.current)
      checkbox.current.indeterminate =
        isSomeDisplayedSelected && !isAllDisplayedSelected;
  }, [isSomeDisplayedSelected, isAllDisplayedSelected]);
  const handleCheckboxChange = (e, orderId) => {
    const isChecked = e.target.checked;
    setSelectedOrderIds((prev) =>
      isChecked
        ? [...new Set([...prev, orderId])]
        : prev.filter((id) => id !== orderId)
    );
  };
  const handleSelectAllChange = (e) => {
    const isChecked = e.target.checked;
    const currentIds = displayOrders.map((order) => order.order_id);
    setSelectedOrderIds((prev) => {
      const others = prev.filter((id) => !currentIds.includes(id));
      return isChecked ? [...new Set([...others, ...currentIds])] : others;
    });
  };

  // --- 검색창 업데이트 및 검색 실행 함수 ---
  const handleCellClickToSearch = (searchValue) => {
    if (!searchValue) return; // 빈 값은 무시
    const trimmedValue = searchValue.trim();
    setInputValue(trimmedValue); // 검색창 UI 업데이트
    setSearchTerm(trimmedValue); // 실제 검색 상태 업데이트
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    setSelectedOrderIds([]); // 검색 시 선택된 항목 초기화 (선택적)
    // 필요하다면 검색 후 맨 위로 스크롤
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrderIds.length === 0) return;
    setBulkUpdateLoading(true);

    const ordersToUpdateFilter = orders.filter(
      (order) =>
        selectedOrderIds.includes(order.order_id) && order.status !== newStatus
    );
    const orderIdsToProcess = ordersToUpdateFilter.map(
      (order) => order.order_id
    );
    const skippedCount = selectedOrderIds.length - orderIdsToProcess.length;

    if (orderIdsToProcess.length === 0) {
      setBulkUpdateLoading(false);
      setSelectedOrderIds([]);
      alert(`건너뛴 주문: ${skippedCount}개. 변경할 주문이 없습니다.`);
      return;
    }

    if (
      !window.confirm(
        `${orderIdsToProcess.length}개의 주문을 '${newStatus}' 상태로 변경하시겠습니까?` +
          (skippedCount > 0
            ? `\n(${skippedCount}개는 이미 해당 상태이거나 제외되어 건너뜁니다.)`
            : "")
      )
    ) {
      setBulkUpdateLoading(false);
      return;
    }

    console.log(
      `Attempting to bulk update ${orderIdsToProcess.length} orders to ${newStatus} via client-side`
    );

    let successCount = 0;
    let failCount = 0;

    try {
      await bulkUpdateOrderStatus(
        orderIdsToProcess,
        newStatus,
        userData.userId
      );
      successCount = orderIdsToProcess.length;
      console.log("일괄 업데이트 성공 (client-side)");
    } catch (err) {
      console.error("Failed to bulk update orders (client-side):", err);
      failCount = orderIdsToProcess.length;
      alert(`일괄 업데이트 중 오류 발생: ${err.message}`);
    } finally {
      setBulkUpdateLoading(false);
      setSelectedOrderIds([]);

      let message = "";
      if (successCount > 0) message += `${successCount}건 성공. `;
      if (failCount > 0) message += `${failCount}건 실패. `;
      if (skippedCount > 0) message += `${skippedCount}건 건너뜀.`;
      if (
        !message &&
        successCount === 0 &&
        failCount === 0 &&
        skippedCount === 0
      )
        message = "변경 대상 없음.";
      else if (!message) message = "일괄 처리 완료.";

      console.log("최종 일괄 처리 결과:", message);
    }
  };
  function calculateDateFilterParams(range, customStart, customEnd) {
    const now = new Date();
    let startDate = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    if (range === "custom" && customStart) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(customStart);
      end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    switch (range) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "7days":
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "30days":
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "90days":
        startDate.setMonth(now.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        return { startDate: undefined, endDate: undefined };
    }
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }
  const CustomDateInputButton = forwardRef(
    ({ value, onClick, isActive, disabled }, ref) => (
      <button
        className={`flex items-center pl-3 pr-8 py-1.5 rounded-md text-xs font-medium transition border whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none ${
          isActive
            ? "bg-orange-500 text-white border-orange-500 shadow-sm"
            : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400"
        } ${
          disabled
            ? "!bg-gray-100 !border-gray-200 text-gray-400 cursor-not-allowed opacity-50"
            : ""
        }`}
        onClick={onClick}
        ref={ref}
        disabled={disabled}
        title={value || "날짜 직접 선택"}
      >
        <CalendarDaysIcon
          className={`w-4 h-4 mr-1.5 flex-shrink-0 ${
            isActive ? "text-white" : "text-gray-400"
          }`}
        />
        <span className="overflow-hidden text-ellipsis">
          {value || "직접 선택"}
        </span>
      </button>
    )
  );
  CustomDateInputButton.displayName = "CustomDateInputButton";
  useEffect(() => {
    const checkAuth = async () => {
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
      } catch (err) {
        console.error("Auth Error:", err);
        setError("Auth Error");
        sessionStorage.clear();
        localStorage.removeItem("userId");
        router.replace("/login");
      }
    };
    checkAuth();
  }, [router]);
  useEffect(() => {
    if (userData && !isDataLoading) setLoading(false);
    else if (!userData || isDataLoading) setLoading(true);
  }, [userData, isDataLoading]);
  useEffect(() => {
    if (productsData?.data) setProducts(productsData.data);
    if (productsError) console.error("Product Error:", productsError);
  }, [productsData, productsError]);

  // 페이지 가시성 변경 및 포커스 감지하여 상품 데이터 업데이트
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && userData?.userId) {
        console.log("Page became visible, refreshing products data...");
        mutateProducts(); // 상품 데이터 새로고침
      }
    };

    const handleWindowFocus = () => {
      if (userData?.userId) {
        console.log("Window focused, refreshing products data...");
        mutateProducts(); // 윈도우 포커스 시에도 상품 데이터 새로고침
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [mutateProducts, userData?.userId]);

  // 페이지 로드 시 상품 데이터 새로고침 (라우팅으로 인한 페이지 진입 감지)
  useEffect(() => {
    if (userData?.userId) {
      console.log("Orders page mounted, refreshing products data...");
      mutateProducts(); // 페이지 진입 시 상품 데이터 새로고침
    }
  }, [userData?.userId]); // mutateProducts를 의존성에서 제거하여 무한 루프 방지

  // localStorage 플래그 감지하여 바코드 옵션 업데이트 확인
  useEffect(() => {
    const checkBarcodeOptionsUpdate = () => {
      const lastUpdated = localStorage.getItem("barcodeOptionsUpdated");
      if (lastUpdated && userData?.userId) {
        const updateTime = parseInt(lastUpdated);
        const now = Date.now();
        // 5분 이내의 업데이트만 유효하다고 간주
        if (now - updateTime < 5 * 60 * 1000) {
          console.log(
            "Barcode options were updated, refreshing products data..."
          );
          mutateProducts();
          // 플래그 제거하여 중복 업데이트 방지
          localStorage.removeItem("barcodeOptionsUpdated");
        }
      }
    };

    // 컴포넌트 마운트 시 체크
    checkBarcodeOptionsUpdate();

    // storage 이벤트 리스너 (다른 탭에서 변경사항이 있을 때)
    window.addEventListener("storage", checkBarcodeOptionsUpdate);

    return () => {
      window.removeEventListener("storage", checkBarcodeOptionsUpdate);
    };
  }, [mutateProducts, userData?.userId]);
  useEffect(() => {
    if (ordersData?.data) setOrders(ordersData.data);
    if (ordersError) {
      console.error("Order Error:", ordersError);
      setError("Order Fetch Error");
    }
    if (
      ordersData?.pagination &&
      currentPage > ordersData.pagination.totalPages
    )
      setCurrentPage(1);
  }, [ordersData, ordersError, currentPage, searchTerm]);
  // statsLoading useEffect 제거 - 더 이상 필요하지 않음
  // 검색 디바운스 useEffect
  // useEffect(() => {
  //   const timerId = setTimeout(() => {
  //     if (inputValue !== searchTerm) {
  //       setSearchTerm(inputValue);
  //       setCurrentPage(1);
  //       setSelectedOrderIds([]);
  //     }
  //   }, 1500);
  //   return () => clearTimeout(timerId);
  // }, [inputValue, searchTerm]); // 의존성 배열에 searchTerm 추가

  // currentPage 변경 감지하여 스크롤하는 useEffect 추가

  const getTimeDifferenceInMinutes = (ds) => {
    if (!ds) return "알 수 없음";
    const dt = new Date(ds),
      nw = new Date(),
      mins = Math.floor((nw.getTime() - dt.getTime()) / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return `${Math.floor(mins / 1440)}일 전`;
  };
  const getProductNameById = (id) =>
    products.find((p) => p.product_id === id)?.title || "상품명 없음";
  const getProductBarcode = (id) =>
    products.find((p) => p.product_id === id)?.barcode || "";
  const getProductById = (id) =>
    products.find((p) => p.product_id === id) || null;
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
      if (isNaN(d.getTime())) return "Invalid Date";
      const mo = String(d.getMonth() + 1).padStart(2, "0"),
        da = String(d.getDate()).padStart(2, "0"),
        hr = String(d.getHours()).padStart(2, "0"),
        mi = String(d.getMinutes()).padStart(2, "0");
      return `${mo}.${da} ${hr}:${mi}`;
    } catch (e) {
      console.error("Date Format Err:", e);
      return "Error";
    }
  };
  const formatDateForPicker = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  };

  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !userData?.userId) return;
    try {
      const allowed = ["주문완료", "주문취소", "수령완료", "확인필요"];
      if (!allowed.includes(newStatus)) return;

      const updateData = { status: newStatus };
      const nowISO = new Date().toISOString();

      // 상태별 추가 필드 설정
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
      } else if (newStatus === "확인필요") {
        updateData.pickupTime = null;
        updateData.completed_at = null;
        updateData.canceled_at = null;
      }

      console.log("Updating order status via client-side:", {
        orderId,
        updateData,
      });

      await updateOrderStatus(orderId, updateData, userData.userId);

      console.log("Order status updated successfully via client-side");
      setIsDetailModalOpen(false); // 모달 닫기
    } catch (err) {
      console.error("Status Change Error (client-side):", err);
      alert(err.message || "주문 상태 업데이트에 실패했습니다.");
    }
  };
  const handleTabChange = (tab) => setActiveTab(tab);
  const openDetailModal = (order) => {
    setSelectedOrder({ ...order });
    // 주문 정보 수정 상태 초기화 복구
    setTempItemNumber(order.item_number || 1);
    setTempQuantity(order.quantity || 1);
    setTempPrice(order.price ?? 0);
    setIsEditingDetails(false); // 편집 모드 비활성화로 시작
    setActiveTab("status");
    setIsDetailModalOpen(true);
  };
  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null);
    setIsEditingDetails(false);
  }; // isEditingDetails 리셋 추가
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleSearchChange = (e) => {
    setInputValue(e.target.value);
  }; // inputValue 업데이트만

  // <<< 추가: 검색창 내용 지우기 함수 >>>
  const clearInputValue = () => {
    setInputValue("");
    // 선택: 내용을 지울 때 바로 검색을 실행할지, 아니면 사용자가 다시 검색 버튼을 누르도록 할지 결정
    // setSearchTerm(""); // 만약 바로 검색 결과도 초기화하고 싶다면 이 줄의 주석을 해제
    // setCurrentPage(1); // 첫 페이지로 이동
  };

  // 검색 버튼 클릭 이벤트 핸들러
  const handleSearch = () => {
    setSearchTerm(inputValue.trim());
    setCurrentPage(1);
    setExactCustomerFilter(null); // <<< 일반 검색 시 정확 필터 초기화
  };

  // --- 👇 [추가] 테이블 셀 클릭 시 정확 필터 적용 함수 👇 ---
  const handleExactCustomerSearch = (customerName) => {
    if (!customerName || customerName === "-") return; // 이름 없거나 '-' 이면 무시
    const trimmedName = customerName.trim();
    console.log(`Exact customer search triggered for: "${trimmedName}"`); // 디버깅 로그
    setInputValue(trimmedName); // 검색창에도 표시 (선택적)
    setSearchTerm(""); // <<< 정확 필터 시 일반 검색어 초기화
    setExactCustomerFilter(trimmedName); // <<< 정확 필터 설정
    setCurrentPage(1);
    setSelectedOrderIds([]); // 선택 항목 초기화
  };
  // --- 👆 [추가] 테이블 셀 클릭 시 정확 필터 적용 함수 👆 ---

  // 입력란에서 엔터 키 누를 때 이벤트 핸들러
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // --- 검색 초기화 함수 ---
  const handleClearSearch = () => {
    setInputValue(""); // 검색 입력 필드 클리어
    setFilterDateRange("30days");
    setSearchTerm("");
    setExactCustomerFilter(null); // <<< 정확 필터도 초기화
    setCurrentPage(1);
    setFilterSelection("주문완료");
    // useEffect 디바운스에 의해 searchTerm이 자동으로 빈 문자열로 업데이트됨
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
  // 필터 변경 핸들러 (선택된 값을 filterSelection state에 저장)
  const handleFilterChange = (selectedValue) => {
    setFilterSelection(selectedValue); // 사용자가 선택한 값을 그대로 저장
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  const handleDateRangeChange = (range) => {
    setFilterDateRange(range);
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };
  const handleCustomDateChange = (dates) => {
    const [start, end] = dates;
    setCustomStartDate(start);
    setCustomEndDate(end);
    if (start) {
      setFilterDateRange("custom");
      setCurrentPage(1);
      setSelectedOrderIds([]);
    } else {
      handleDateRangeChange("7days");
    }
  };

  useEffect(() => {
    console.log(
      `OrdersPage: Current page changed to ${currentPage}, calling scrollToTop from context.`
    );
    if (scrollToTop) {
      // scrollToTop 함수가 존재할 때만 호출
      // 약간의 지연을 주어 DOM 업데이트 후 스크롤 시도
      const timerId = setTimeout(() => {
        scrollToTop();
      }, 0); // 0ms 지연으로도 충분할 수 있음, 필요시 50ms 등으로 조정
      return () => clearTimeout(timerId);
    }
  }, [currentPage, scrollToTop]); // scrollToTop도 의존성 배열에 추가

  const paginate = (pageNumber) => {
    const total = ordersData?.pagination?.totalPages || 1;
    if (pageNumber >= 1 && pageNumber <= total) {
      setCurrentPage(pageNumber);
      // scrollToTop();
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

  // --- 주문 정보 수정 핸들러 복구 ---
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
    const itemNum = Math.max(1, parseInt(tempItemNumber, 10) || 1);

    const updateData = {
      item_number: itemNum,
      quantity: qty,
      price: price,
      total_amount: price * qty,
    };

    try {
      console.log("Updating order details via client-side:", {
        order_id,
        updateData,
      });

      await updateOrderDetails(order_id, updateData, userData.userId);

      console.log("Order details updated successfully via client-side");
      setIsEditingDetails(false); // 편집 모드 종료
      setIsDetailModalOpen(false); // 모달 닫기
    } catch (err) {
      console.error("Update Error (client-side):", err);
      alert(err.message || "주문 정보 업데이트에 실패했습니다.");
    }
  };

  // --- 바코드 옵션 변경 핸들러 ---
  const handleBarcodeOptionChange = async (orderId, selectedOption) => {
    if (!userData?.userId) {
      console.error("User ID is missing");
      return;
    }

    try {
      // orders 테이블의 selected_barcode_option과 total_amount 업데이트
      const updateData = {
        selected_barcode_option: {
          barcode: selectedOption.barcode,
          name: selectedOption.name,
          price: selectedOption.price,
          field_reference: selectedOption.field_reference,
        },
        total_amount: selectedOption.price,
        price_option_used: selectedOption.name,
        price_option_description: `${selectedOption.name} (${
          selectedOption.barcode
        }) - ₩${selectedOption.price.toLocaleString()}`,
      };

      console.log("Updating order barcode option:", { orderId, updateData });

      await updateOrderDetails(orderId, updateData, userData.userId);

      console.log("Barcode option updated successfully");

      // 주문 목록과 상품 목록 새로고침
      mutateOrders();
      mutateProducts(); // 상품 데이터도 새로고침하여 최신 바코드 옵션 반영
    } catch (error) {
      console.error("Failed to update barcode option:", error);
      alert("바코드 옵션 변경에 실패했습니다.");
    }
  };

  // --- 바코드 저장 함수 ---
  const handleSaveBarcode = async (productId, barcodeValue) => {
    // <<< --- 디버깅 로그 추가 --- >>>
    console.log("handleSaveBarcode called with:", { productId, barcodeValue });
    console.log("Current userData:", userData);
    // <<< --- 디버깅 로그 추가 끝 --- >>>

    if (!barcodeValue.trim()) {
      return;
    }

    // --- !!! 중요: userData.id 대신 userData.userId 사용 확인 !!! ---
    if (!userData || !userData.userId) {
      // userData.id 였던 부분을 userData.userId로 변경
      alert("사용자 정보가 유효하지 않습니다. 다시 로그인해주세요."); // 사용자에게 피드백
      console.error(
        "User data or userId is missing. Current userData:",
        userData
      );
      return;
    }
    const userId = userData.userId; // userId 사용
    // --- !!! 중요 수정 끝 !!! ---

    setIsSavingBarcode(true);
    // <<< --- 디버깅 로그 추가 --- >>>
    console.log("setIsSavingBarcode(true) executed. Proceeding to fetch.");
    // <<< --- 디버깅 로그 추가 끝 --- >>>

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // <<< --- 디버깅 로그 추가 --- >>>
      console.log("Supabase URL:", supabaseUrl);
      console.log("Supabase Anon Key (exists):", !!supabaseAnonKey); // 실제 키 값은 로깅하지 않음
      // <<< --- 디버깅 로그 추가 끝 --- >>>

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase URL 또는 Anon Key가 설정되지 않았습니다.");
        throw new Error("애플리케이션 설정 오류가 발생했습니다.");
      }

      // Supabase 함수 호출 URL 구성 (productId와 userId를 쿼리 파라미터로 전달)
      const functionUrl = `${supabaseUrl}/functions/v1/products-update-barcode?productId=${encodeURIComponent(
        productId
      )}&userId=${encodeURIComponent(userId)}`;

      // <<< --- 디버깅 로그 추가 --- >>>
      console.log("Constructed Function URL:", functionUrl);
      console.log("Request Body:", { barcode: barcodeValue });
      // <<< --- 디버깅 로그 추가 끝 --- >>>

      const response = await fetch(functionUrl, {
        method: "PATCH", // 백엔드 API가 PATCH 메소드를 사용하므로 변경
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey, // Supabase Anon Key를 헤더에 추가
          // 백엔드 함수에서 사용자 인증을 위해 Supabase의 Authorization 헤더가 필요할 수 있습니다.
          // 현재 제공된 함수 코드에는 명시적인 JWT 토큰 검증 로직은 없으나,
          // RLS(Row Level Security) 등이 적용되어 있다면 필요할 수 있습니다.
          // const { data: { session } } = await supabase.auth.getSession();
          // if (session) headers.Authorization = `Bearer ${session.access_token}`;
        },
        body: JSON.stringify({ barcode: barcodeValue }), // 요청 본문에 바코드 값 전달
      });

      const responseData = await response.json(); // 응답을 JSON으로 파싱

      // 응답 상태 및 백엔드 응답의 success 필드로 성공 여부 판단
      if (!response.ok || !responseData.success) {
        throw new Error(
          responseData.message || "바코드 저장 중 오류가 발생했습니다."
        );
      }

      console.log("바코드 저장 성공:", responseData);

      // --- !!! 수정된 부분 !!! ---
      // refreshOrdersAndProducts() 대신 SWR의 mutate 함수를 사용합니다.
      if (mutateProducts) {
        await mutateProducts(); // 상품 목록 SWR 캐시 갱신
        console.log("Products list revalidated via SWR mutate.");
      } else {
        console.warn(
          "mutateProducts is not available. Product list might not be up-to-date."
        );
      }
      // --- !!! 수정된 부분 끝 !!! ---

      // 성공 시
      setNewBarcodeValue(""); // 입력 필드 초기화
    } catch (error) {
      console.error("Failed to save barcode:", error);
    } finally {
      setIsSavingBarcode(false);
    }
  };

  // --- 로딩 / 에러 UI ---
  if (!userData && loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10 text-orange-500" />
        <p className="ml-3 text-gray-600">인증 정보 확인 중...</p>
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {error === "Auth Error"
              ? "인증 정보가 유효하지 않습니다. 다시 로그인해주세요."
              : "데이터 처리 중 문제가 발생했습니다."}
          </p>
          <div className="flex gap-3 justify-center">
            {error !== "Auth Error" && (
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
              >
                <ArrowPathIcon className="w-4 h-4" /> 새로고침
              </button>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" /> 로그아웃
            </button>
          </div>
        </LightCard>
      </div>
    );

  // --- 데이터 준비 ---
  const filteredTotalItems = ordersData?.pagination?.totalItems ?? 0;
  const totalItems = ordersData?.pagination?.totalItems || 0;
  const totalPages = ordersData?.pagination?.totalPages || 1;

  // 현재 검색된 주문 데이터에서 직접 통계 계산
  const currentOrders = ordersData?.data || [];

  // 클라이언트 사이드에서 통계 계산 함수
  const calculateClientStats = (orders) => {
    const statusCounts = {};
    const subStatusCounts = {};
    let completedCount = 0;
    let pendingCount = 0;

    orders.forEach((order) => {
      // Status 카운트
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

      // Sub_status 카운트
      if (order.sub_status) {
        subStatusCounts[order.sub_status] =
          (subStatusCounts[order.sub_status] || 0) + 1;
      }

      // 완료/미완료 카운트
      if (order.status === "수령완료") {
        completedCount++;
      } else if (order.sub_status === "미수령") {
        pendingCount++;
      }
    });

    return {
      totalOrders: orders.length,
      completedOrders: completedCount,
      pendingOrders: pendingCount,
      statusCounts,
      subStatusCounts,
    };
  };

  const clientStats = calculateClientStats(currentOrders);
  const totalStatsOrders = clientStats.totalOrders;
  const totalCompletedOrders = clientStats.completedOrders;
  const totalPendingOrders = clientStats.pendingOrders;

  // 디버깅용 로그
  console.log("Current search term:", searchTerm);
  console.log("Current filter selection:", filterSelection);
  console.log("Current orders data:", currentOrders);
  console.log("Client calculated stats:", clientStats);
  console.log("Calculated totals:", {
    totalStatsOrders,
    totalCompletedOrders,
    totalPendingOrders,
  });

  const completionRate =
    totalStatsOrders > 0
      ? Math.round((totalCompletedOrders / totalStatsOrders) * 100)
      : 0;

  // --- 메인 UI ---
  return (
    <div
      className="min-h-screen bg-gray-100 text-gray-900 overflow-y-auto px-4 py-2 sm:px-6 sm:py-4  pb-[300px]" // 패딩 추가
    >
      {/* 일괄 처리 중 로딩 오버레이 */}
      {bulkUpdateLoading && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 ">
          <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center">
            <LoadingSpinner className="h-12 w-12 text-orange-500 mb-3" />
            <p className="text-gray-700 font-medium">상태 변경 중...</p>
          </div>
        </div>
      )}
      <main className="max-w-[1440px] mx-auto">
        {/* 헤더 */}
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                주문 관리
              </h1>
              <p className="text-sm text-gray-500 mb-2">
                등록된 주문을 관리하고 주문 상태를 변경할 수 있습니다.
              </p>
              <UpdateButton
                onClick={() => {
                  mutateOrders();
                  mutateProducts();
                }}
                loading={isDataLoading}
                disabled={isDataLoading}
                className="w-full md:w-auto" // w-full md:w-auto
              >
                업데이트
              </UpdateButton>
              {/* <p className="text-sm md:text-base text-gray-600">
              최근 업데이트:
              {userDataFromHook?.last_crawl_at
                ? getTimeDifferenceInMinutes(userDataFromHook.last_crawl_at)
                : "알 수 없음"}
              {isUserLoading && (
                <LoadingSpinner
                  className="inline-block ml-2 h-4 w-4"
                  color="text-gray-400"
                />
              )}
            </p> */}

              <p className="text-xs md:text-sm text-gray-600">
                최근 업데이트 :
                {userDataFromHook?.data?.last_crawl_at // Change this line! Access via .data
                  ? getTimeDifferenceInMinutes(
                      userDataFromHook.data.last_crawl_at
                    ) // Also change here
                  : "알 수 없음"}
                {isUserLoading && (
                  <LoadingSpinner
                    className="inline-block ml-2 h-4 w-4"
                    color="text-gray-400"
                  />
                )}
              </p>
            </div>
          </div>
          <div className="w-full md:w-auto relative ">
            {/* statsLoading 제거 - 클라이언트 계산으로 즉시 반영 */}
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm w-full md:w-auto">
              {/* --- 총 주문 --- */}
              <div
                className="flex flex-col items-start cursor-pointer p-2 -m-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1"
                onClick={() => handleFilterChange("all")} // 클릭 시 전체 필터 적용
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleFilterChange("all");
                }}
                title="전체 주문 보기" // 툴팁 추가
              >
                <dt className="text-sm text-gray-500 uppercase">
                  {searchTerm ||
                  filterSelection !== "all" ||
                  filterDateRange !== "30days" || // 기본값 변경 반영
                  (filterDateRange === "custom" &&
                    (customStartDate || customEndDate))
                    ? "필터된 주문"
                    : "총 주문"}
                </dt>
                <dd className="font-semibold text-lg mt-0.5">
                  {filteredTotalItems.toLocaleString()}
                </dd>
              </div>
              <div
                className="flex flex-col items-start cursor-pointer p-2 -m-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1"
                onClick={() => handleFilterChange("수령완료")} // 클릭 시 수령완료 필터 적용
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleFilterChange("수령완료");
                }}
                title="수령완료 주문 필터링" // 툴팁 추가
              >
                <dt className="text-sm text-gray-500 uppercase">수령완료</dt>
                <dd className="font-semibold text-lg mt-0.5">
                  {totalCompletedOrders.toLocaleString()}
                </dd>
              </div>
              {/* --- 미수령 (여기가 핵심 수정 부분) --- */}
              <div
                className="flex flex-col items-start cursor-pointer p-2 -m-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1"
                onClick={() => handleFilterChange("미수령")} // 클릭 시 미수령 필터 적용
                role="button" // 접근성을 위해 role 추가
                tabIndex={0} // 키보드 포커스 가능하도록 설정
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleFilterChange("미수령");
                }} // Enter/Space 키로도 동작하도록
                title="미수령 주문 필터링" // 툴팁 추가
              >
                <dt className="text-sm text-gray-500 uppercase">미수령</dt>
                <dd className="font-semibold text-lg mt-0.5">
                  {totalPendingOrders.toLocaleString()}
                </dd>
              </div>
              <div className="flex flex-col items-start">
                <dt className="text-sm text-gray-500 uppercase">완료율</dt>
                <dd className="font-semibold text-lg mt-0.5">
                  {completionRate}%
                </dd>
              </div>
            </div>
          </div>
        </div>

        {/* 필터 섹션 */}
        <LightCard padding="p-0" className="mb-6 md:mb-8 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {/* 조회 기간 */}
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <CalendarDaysIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                조회 기간
              </div>
              <div className="bg-white px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
                <DatePicker
                  selectsRange={true}
                  startDate={customStartDate}
                  endDate={customEndDate}
                  onChange={handleCustomDateChange}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  maxDate={new Date()}
                  isClearable={true}
                  placeholderText="날짜 선택"
                  disabled={isDataLoading}
                  popperPlacement="bottom-start"
                  customInput={
                    <CustomDateInputButton
                      isActive={filterDateRange === "custom"}
                      disabled={isDataLoading}
                      value={
                        customStartDate
                          ? `${formatDateForPicker(customStartDate)}${
                              customEndDate
                                ? ` ~ ${formatDateForPicker(customEndDate)}`
                                : ""
                            }`
                          : ""
                      }
                    />
                  }
                />
                <CustomRadioGroup
                  name="dateRange"
                  options={dateRangeOptions}
                  selectedValue={
                    filterDateRange === "custom" ? "" : filterDateRange
                  }
                  onChange={handleDateRangeChange}
                  disabled={isDataLoading}
                />
              </div>
            </div>
            {/* 상태 필터 */}
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <FunnelIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                상태
              </div>
              <div className="bg-white px-4 py-3">
                <CustomRadioGroup
                  name="orderStatus"
                  options={orderStatusOptions}
                  selectedValue={filterSelection}
                  onChange={handleFilterChange}
                  disabled={isDataLoading}
                />
              </div>
            </div>
            {/* 검색 필터 */}
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <TagIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                검색
              </div>
              {/* 검색 입력 및 버튼들 - 반응형 레이아웃 재조정 */}
              <div className="bg-white flex-grow w-full px-4 py-0 flex flex-wrap md:flex-nowrap md:items-center gap-2">
                {/* 검색 입력 */}
                <div className="relative w-full md:flex-grow md:max-w-sm order-1">
                  {" "}
                  {/* order-1 */}
                  <input
                    type="text"
                    placeholder="고객명, 상품명, 바코드..."
                    value={inputValue}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isDataLoading}
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  {/* --- 👇 X 버튼 추가 👇 --- */}
                  {inputValue && ( // inputValue가 있을 때만 X 버튼 표시
                    <button
                      type="button"
                      onClick={clearInputValue}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                      aria-label="검색 내용 지우기"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {/* 검색/초기화 버튼 그룹 */}
                <div className="flex flex-row gap-2 w-full py-2 sm:w-auto order-2">
                  {" "}
                  {/* order-2, sm:w-auto */}
                  <button
                    onClick={handleSearch}
                    className="flex-1 sm:flex-none px-8 py-2 font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed" // flex-1 sm:flex-none
                    disabled={isDataLoading}
                  >
                    검색
                  </button>
                  <button
                    onClick={handleClearSearch}
                    disabled={isDataLoading}
                    className="flex-1 sm:flex-none flex items-center justify-center px-5 py-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" // flex-1 sm:flex-none
                    aria-label="검색 초기화"
                    title="검색 및 필터 초기화"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4 mr-1" />
                    초기화
                  </button>
                </div>
              </div>
            </div>
          </div>
        </LightCard>

        {/* 주문 테이블 */}
        <LightCard padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="relative w-20 px-6 sm:w-16 sm:px-8 py-3"
                  >
                    <input
                      type="checkbox"
                      className="absolute left-4 top-1/2 -mt-2 h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 sm:left-6 cursor-pointer"
                      ref={checkbox}
                      checked={isAllDisplayedSelected}
                      onChange={handleSelectAllChange}
                      disabled={isDataLoading || displayOrders.length === 0}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    상품명
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("customer_name")} // 정렬 함수
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      고객명 {getSortIcon("customer_name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
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
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      금액 {getSortIcon("total_amount")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("ordered_at")}
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      주문일시 {getSortIcon("ordered_at")}
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
                {isOrdersLoading && !ordersData && (
                  <tr>
                    <td colSpan="11" className="px-6 py-10 text-center">
                      <LoadingSpinner className="h-6 w-6 mx-auto text-gray-400" />
                      <span className="text-sm text-gray-500 mt-2 block">
                        주문 목록 로딩 중...
                      </span>
                    </td>
                  </tr>
                )}
                {!isOrdersLoading && displayOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan="11"
                      className="px-6 py-10 text-center text-sm text-gray-500"
                    >
                      {searchTerm ||
                      filterSelection !== "all" ||
                      filterDateRange !== "30days" || // 기본값 변경 반영
                      (filterDateRange === "custom" &&
                        (customStartDate || customEndDate))
                        ? "조건에 맞는 주문이 없습니다."
                        : "표시할 주문이 없습니다."}
                    </td>
                  </tr>
                )}
                {displayOrders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.order_id);
                  const product = getProductById(order.product_id);
                  const hasMultipleBarcodeOptions =
                    product?.barcode_options?.options?.length > 1;

                  return (
                    <React.Fragment key={order.order_id}>
                      <tr
                        className={`${
                          isSelected ? "bg-orange-50" : "hover:bg-gray-50"
                        } transition-colors group cursor-pointer ${
                          isOrdersLoading ? "opacity-70" : ""
                        }`}
                        onClick={() => openDetailModal(order)}
                      >
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="relative w-12 px-6 sm:w-16 sm:px-8"
                        >
                          <div className="absolute inset-y-0 left-4 sm:left-6 flex items-center">
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                              value={order.order_id}
                              checked={isSelected}
                              onChange={(e) =>
                                handleCheckboxChange(e, order.order_id)
                              }
                            />
                          </div>
                        </td>
                        <td
                          className="px-4 py-10 text-sm text-gray-700 font-medium max-w-[200px] truncate hover:text-orange-600 hover:underline cursor-pointer" // 호버 시 색상/밑줄, 커서 포인터 추가
                          title={getProductNameById(order.product_id)}
                          onClick={(e) => {
                            // 클릭 핸들러 추가
                            e.stopPropagation(); // 행의 onClick(모달 열기) 이벤트 전파 중단
                            handleCellClickToSearch(
                              getProductNameById(order.product_id)
                            ); // 검색 함수 호출
                            setFilterSelection("all");
                          }}
                        >
                          {getProductNameById(order.product_id)}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap max-w-[100px] truncate hover:text-orange-600 hover:underline cursor-pointer"
                          title={order.customer_name}
                          onClick={(e) => {
                            e.stopPropagation(); // 행 전체 onClick(모달) 방지
                            handleExactCustomerSearch(order.customer_name); // <<< 정확 필터 함수 호출 확인
                          }}
                        >
                          {order.customer_name || "-"}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-gray-600 max-w-[100px] truncate hidden md:table-cell"
                          title={order.comment || ""}
                        >
                          {order.comment || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 font-medium">
                          {order.item_number || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                          {order.quantity || 0}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                          {formatCurrency(order.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(order.ordered_at)}
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {(() => {
                            // 선택된 바코드 옵션이 있으면 해당 바코드, 없으면 기본 바코드
                            const selectedOption =
                              order.selected_barcode_option;
                            const displayBarcode =
                              selectedOption?.barcode ||
                              getProductBarcode(order.product_id);

                            return displayBarcode ? (
                              <Barcode
                                value={displayBarcode}
                                height={50}
                                width={1.2}
                                fontSize={12}
                              />
                            ) : (
                              <span className="text-xs text-gray-400">
                                없음
                              </span>
                            );
                          })()}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {(() => {
                            // 즉시 실행 함수 표현식(IIFE) 또는 별도 헬퍼 함수 사용 가능
                            const actualStatus = order.status;
                            const actualSubStatus = order.sub_status; // sub_status 값도 가져옴
                            return (
                              <div className="flex flex-col items-center">
                                {" "}
                                {/* 세로 정렬을 위해 div 추가 */}
                                {/* 메인 상태 배지 (항상 order.status 기준) */}
                                <StatusBadge status={actualStatus} />
                                {/* 부가 상태가 있으면 추가 배지 표시 (수령완료일 때는 표시하지 않음) */}
                                {actualStatus !== "수령완료" &&
                                  actualSubStatus === "확인필요" && (
                                    <span
                                      className="mt-2 inline-flex items-center rounded-full bg-gray-700 px-2 py-0.5 text-xs font-medium text-white"
                                      title="부가 상태: 확인필요"
                                    >
                                      <ExclamationCircleIcon className="w-3 h-3 mr-1" />{" "}
                                      확인 필요
                                    </span>
                                  )}
                                {actualStatus !== "수령완료" &&
                                  actualSubStatus === "미수령" && (
                                    <span
                                      className="mt-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white"
                                      title="부가 상태: 미수령"
                                    >
                                      <ExclamationCircleIcon className="w-3 h-3 mr-1" />{" "}
                                      미수령
                                    </span>
                                  )}
                                {actualStatus === "수령완료" && (
                                  <span
                                    className="mt-1 inline-flex items-center  px-2 py-0.5 text-xs font-medium text-gray-700"
                                    title="부가 상태: 수령완료"
                                  >
                                    {/* <CheckCircleIcon className="w-3 h-3 mr-1" />{" "} */}
                                    {formatDate(order.completed_at)}
                                  </span>
                                )}
                                {/* 다른 sub_status 값에 대한 처리 추가 가능 */}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>

                      {/* 바코드 옵션 행 - 옵션이 여러 개인 경우만 표시 */}
                      {hasMultipleBarcodeOptions && (
                        <tr className={`${isSelected ? "bg-orange-50" : ""}`}>
                          <td colSpan="11" className="px-4 py-2">
                            <div onClick={(e) => e.stopPropagation()}>
                              <BarcodeOptionSelector
                                order={order}
                                product={product}
                                onOptionChange={handleBarcodeOptionChange}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalItems > itemsPerPage && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 bg-white sm:px-6 rounded-b-xl">
              <div>
                <p className="text-sm text-gray-700">
                  총
                  <span className="font-medium">
                    {totalItems.toLocaleString()}
                  </span>
                  개 중
                  <span className="font-medium">
                    {(currentPage - 1) * itemsPerPage + 1}-
                    {Math.min(currentPage * itemsPerPage, totalItems)}
                  </span>
                  표시
                </p>
              </div>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1 || isDataLoading}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={isDataLoading}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                          currentPage === page
                            ? "z-10 bg-gray-200 border-gray-500 text-gray-600"
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
                  disabled={currentPage === totalPages || isDataLoading}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLongRightIcon className="h-5 w-5" />
                </button>
              </nav>
            </div>
          )}
        </LightCard>

        <div className="pt-[100px]"></div>

        {/* 일괄 처리 버튼 */}
        <div className="fixed flex justify-end bottom-0 left-0 right-0 z-40 p-5 bg-white border-t border-gray-300 shadow-md">
          {selectedOrderIds.length === 0 && !isDataLoading && (
            <span className="text-sm text-gray-500 italic h-[38px] flex items-center mr-2">
              항목을 선택하여 일괄 처리하세요.
            </span>
          )}
          <button
            onClick={() => handleBulkStatusUpdate("주문취소")}
            disabled={
              selectedOrderIds.length === 0 ||
              isDataLoading ||
              bulkUpdateLoading
            }
            className={`mr-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${
              selectedOrderIds.length === 0
                ? "opacity-0 scale-95 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
            aria-hidden={selectedOrderIds.length === 0}
          >
            <XCircleIcon className="w-5 h-5" /> 선택 주문취소 (
            {selectedOrderIds.length})
          </button>
          <button
            onClick={() => handleBulkStatusUpdate("결제완료")}
            disabled={
              selectedOrderIds.length === 0 ||
              isDataLoading ||
              bulkUpdateLoading
            }
            className={`mr-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${
              selectedOrderIds.length === 0
                ? "opacity-0 scale-95 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
            aria-hidden={selectedOrderIds.length === 0}
          >
            <CurrencyDollarIcon className="w-5 h-5" /> 선택 결제완료 (
            {selectedOrderIds.length})
          </button>
          <button
            onClick={() => handleBulkStatusUpdate("수령완료")}
            disabled={
              selectedOrderIds.length === 0 ||
              isDataLoading ||
              bulkUpdateLoading
            }
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${
              selectedOrderIds.length === 0
                ? "opacity-0 scale-95 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
            aria-hidden={selectedOrderIds.length === 0}
          >
            <CheckCircleIcon className="w-5 h-5" /> 선택 수령완료 (
            {selectedOrderIds.length})
          </button>
        </div>

        {/* --- 주문 상세 모달 (주문 정보 탭 복구) --- */}
        {isDetailModalOpen && selectedOrder && (
          <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* 모달 헤더 */}
              <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <h3 className="text-lg font-semibold text-gray-900">
                  {getProductNameById(selectedOrder.product_id)}
                </h3>
                <button
                  onClick={closeDetailModal}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              {/* 모달 본문 */}
              <div className="flex-grow overflow-y-auto p-4 sm:p-6">
                {/* 탭 네비게이션 */}
                <div className="border-b border-gray-200 mb-6">
                  <div className="flex -mb-px space-x-6 sm:space-x-8">
                    {/* 상태 관리 탭 */}
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
                    {/* 주문 정보 탭 (복구) */}
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
                    {/* 주문 보러가기 탭 */}
                    {getPostUrlByProductId(selectedOrder.product_id) && (
                      <a
                        href={getPostUrlByProductId(selectedOrder.product_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation(); // 모달 닫힘 방지
                          // handleTabChange("go"); // 탭 상태 변경 (선택사항)
                        }}
                        className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`} // 'go' 탭은 활성 상태를 시각적으로 표시하지 않음
                      >
                        <ArrowTopRightOnSquareIcon className="w-5 h-5 mr-1.5" />
                        주문 보러가기
                      </a>
                    )}
                  </div>
                </div>

                {/* 탭 콘텐츠 */}
                <div className="space-y-6">
                  {/* 상태 관리 탭 내용 */}
                  {activeTab === "status" && (
                    <div className="space-y-5">
                      <LightCard
                        padding="p-4"
                        className="text-center bg-gray-50"
                      >
                        <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                          상품 바코드
                        </label>
                        <div className="max-w-xs mx-auto h-[70px] flex items-center justify-center">
                          {" "}
                          {/* 세로 정렬 및 최소 높이 보장 */}
                          {getProductBarcode(selectedOrder.product_id) ? (
                            <Barcode
                              value={getProductBarcode(
                                selectedOrder.product_id
                              )}
                              width={1.8}
                              height={45}
                              fontSize={12}
                            />
                          ) : (
                            // 바코드가 없을 때 입력 필드와 저장 버튼 표시
                            <div className="flex flex-col items-center space-y-2 w-full px-2 py-2">
                              <input
                                type="text"
                                placeholder="바코드 입력"
                                value={newBarcodeValue}
                                onChange={(e) =>
                                  setNewBarcodeValue(e.target.value)
                                }
                                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                              />
                              <button
                                onClick={() =>
                                  handleSaveBarcode(
                                    selectedOrder.product_id,
                                    newBarcodeValue
                                  )
                                }
                                disabled={
                                  !newBarcodeValue.trim() || isSavingBarcode
                                }
                                className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed w-full"
                              >
                                {isSavingBarcode ? (
                                  <LoadingSpinner className="h-4 w-4 mr-1 text-white" />
                                ) : null}{" "}
                                {/* 로딩 스피너 색상 및 간격 조정 */}
                                저장
                              </button>
                            </div>
                          )}
                        </div>
                      </LightCard>
                      <LightCard padding="p-4" className="">
                        <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                          고객 주문 정보
                        </label>
                        <div className="flex items-start space-x-3">
                          <UserCircleIcon className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 font-semibold">
                              {selectedOrder.customer_name || "이름 없음"}
                            </p>
                            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">
                              {selectedOrder.comment || (
                                <span className="italic text-gray-400">
                                  댓글 없음
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </LightCard>
                      <LightCard padding="p-4" className="">
                        <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                          주문 상태 변경
                        </label>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <span className="text-sm font-medium text-gray-500 mr-2">
                              현재:
                            </span>
                            <StatusBadge status={selectedOrder.status} />
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 items-center w-full sm:w-auto">
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
                                    {getStatusIcon(status)} {status} 처리
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </LightCard>
                    </div>
                  )}
                  {/* 주문 정보 탭 내용 (복구) */}
                  {activeTab === "info" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {[
                        {
                          label: "상품명",
                          value: getProductNameById(selectedOrder.product_id),
                          readOnly: true,
                        },
                        // --- REMOVE INCORRECT DUPLICATE 상품명 HERE ---
                        // {
                        //   label: "상품명", // This was incorrect
                        //   value: getProductNameById(
                        //     selectedOrder.price_option_description
                        //   ),
                        //   readOnly: true,
                        // },
                        // --- END REMOVAL ---

                        {
                          label: "고객명",
                          value: selectedOrder.customer_name || "-",
                          readOnly: true,
                        },

                        // --- ADD PRICE OPTION DESCRIPTION HERE ---
                        {
                          label: "선택 옵션", // Or "가격 옵션 설명"
                          value: selectedOrder.price_option_description || "-",
                          readOnly: true,
                          colSpan: 2, // Make it full width as it might be long
                          preWrap: true, // Allow line breaks if needed
                        },
                        // --- ADD PRODUCT PICKUP DATE HERE ---
                        {
                          label: "상품 픽업 예정일",
                          // Use the new helper function
                          value: formatDate(selectedOrder.product_pickup_date),
                          readOnly: true,
                        },
                        {
                          label: "주문 일시",
                          value: formatDate(selectedOrder.ordered_at),
                          readOnly: true,
                        },
                        {
                          label: "수령 일시",
                          value: formatDate(selectedOrder.completed_at),
                          readOnly: true,
                        },
                        {
                          label: "주문 ID",
                          value: selectedOrder.order_id,
                          readOnly: true,
                          smallText: true,
                          colSpan: 2,
                        },
                        {
                          label: "고객 댓글",
                          value: selectedOrder.comment || (
                            <span className="italic text-gray-400">
                              댓글 없음
                            </span>
                          ),
                          colSpan: 2,
                          readOnly: true,
                          preWrap: true,
                        },
                        // --- Editable fields below ---
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
                          label: "총 금액 (계산됨)",
                          value: formatCurrency(
                            calculateTotalAmount(
                              parseInt(tempQuantity, 10) || 0,
                              selectedOrder?.product?.price_options || [
                                { price: tempPrice, quantity: 1 },
                              ],
                              parseFloat(tempPrice) || 0
                            )
                          ),
                          readOnly: true,
                          highlight: true,
                        },
                      ].map((item, index) => (
                        // ... The existing rendering logic for each item ...
                        <div
                          key={item.label + index}
                          className={item.colSpan === 2 ? "md:col-span-2" : ""}
                        >
                          <label
                            htmlFor={item.field}
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            {item.label}
                          </label>
                          {item.readOnly ? (
                            <div
                              className={`px-3 py-2 rounded-md border ${
                                item.highlight
                                  ? "bg-orange-50 border-orange-200 text-orange-700 font-semibold text-lg"
                                  : "bg-gray-100 border-gray-200 text-gray-800"
                              } ${
                                item.smallText ? "text-xs break-all" : "text-sm"
                              } ${
                                item.preWrap // Apply preWrap style if needed
                                  ? "whitespace-pre-wrap break-words"
                                  : ""
                              } min-h-[38px] flex items-center`}
                            >
                              {/* Display simple value or React node */}
                              {typeof item.value === "string" ||
                              typeof item.value === "number" ||
                              React.isValidElement(item.value)
                                ? item.value
                                : String(item.value)}
                            </div>
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
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                              // Disable editing for readOnly fields conceptually,
                              // though we render a div above for readOnly=true
                              disabled={item.readOnly}
                            />
                          )}
                        </div>
                      ))}
                      {/* 저장 버튼 */}
                      <div className="md:col-span-2 flex justify-end pt-2">
                        <StatusButton
                          onClick={saveOrderDetails}
                          variant="primary"
                          icon={PencilSquareIcon}
                          isLoading={false /* 필요 시 로딩 상태 추가 */}
                        >
                          변경사항 저장
                        </StatusButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* 모달 푸터 */}
              <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={closeDetailModal}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
                >
                  닫기
                </button>
                {/* 푸터에는 수령완료 버튼만 표시 (info 탭에서는 저장 버튼이 본문에 있음) */}
                {activeTab === "status" && (
                  <button
                    onClick={() =>
                      handleStatusChange(selectedOrder.order_id, "수령완료")
                    }
                    disabled={selectedOrder.status === "수령완료"}
                    className={`${getStatusButtonStyle(
                      "수령완료"
                    )} px-4 py-2 text-sm`}
                  >
                    {getStatusIcon("수령완료")} 수령완료 처리
                  </button>
                )}
                {/* info 탭일 때 푸터에 빈 공간 유지 (선택사항) */}
                {activeTab === "info" && <div className="w-[130px]"></div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// 바코드 옵션 선택 컴포넌트
function BarcodeOptionSelector({ order, product, onOptionChange }) {
  const [selectedOption, setSelectedOption] = useState(null);

  // 바코드 옵션이 있는지 확인
  const barcodeOptions = product?.barcode_options?.options || [];
  const hasOptions = barcodeOptions.length > 1; // 기본 옵션 외에 다른 옵션이 있는지

  // 초기 선택값 설정 (저장된 선택값 또는 메인 옵션)
  useEffect(() => {
    if (order.selected_barcode_option) {
      // 이미 선택된 옵션이 있으면 해당 옵션 선택
      const savedOption = barcodeOptions.find(
        (opt) => opt.barcode === order.selected_barcode_option.barcode
      );
      setSelectedOption(
        savedOption || barcodeOptions.find((opt) => opt.is_main)
      );
    } else {
      // 기본값은 메인 옵션
      const mainOption = barcodeOptions.find((opt) => opt.is_main);
      setSelectedOption(mainOption || barcodeOptions[0]);
    }
  }, [order, barcodeOptions]);

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    onOptionChange(order.order_id, option);
  };

  // 옵션이 없거나 1개만 있으면 선택 UI 표시 안함
  if (!hasOptions) {
    return null;
  }

  return (
    <div className="mt-1 ml-6 pl-4 border-l-2 border-gray-300 bg-gray-50/30 rounded-r-lg">
      <div className="py-2">
        {/* 가로 배치 옵션들 - 간소화 */}
        <div className="flex flex-wrap gap-2">
          {barcodeOptions.map((option, index) => (
            <label
              key={index}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-all text-sm ${
                selectedOption?.barcode === option.barcode
                  ? "border-blue-400 bg-blue-100 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`barcode-option-${order.order_id}`}
                checked={selectedOption?.barcode === option.barcode}
                onChange={() => handleOptionSelect(option)}
                className="h-3 w-3 text-gray-600 focus:ring-gray-500"
              />
              <span className="text-sm font-medium text-gray-900">
                {option.name}
                {option.is_main && (
                  <span className="text-gray-500 ml-1">(기본)</span>
                )}
              </span>
              <span className="text-xs text-gray-600">
                ₩{option.price?.toLocaleString()}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
