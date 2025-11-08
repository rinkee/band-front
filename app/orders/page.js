"use client";

import React, { useState, useEffect, useRef, forwardRef, useMemo } from "react"; // React Fragment 사용을 위해 React 추가
import { useRouter, useSearchParams } from "next/navigation";
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
  useOrderStatsClient,
} from "../hooks/useOrdersClient";
import { StatusButton } from "../components/StatusButton"; // StatusButton 다시 임포트
import { useSWRConfig } from "swr";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction"; // execution_locks 확인 기능 활성화된 버튼
import { useScroll } from "../context/ScrollContext"; // <<< ScrollContext 임포트
import CommentsModal from "../components/Comments"; // 댓글 모달 import
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import dynamic from "next/dynamic";
const CommentOrdersViewClient = dynamic(() => import("./CommentOrdersView"), { ssr: false });

// Dispatcher: choose raw comment-orders view or legacy orders page
export default function OrdersPage() {
  const [mode, setMode] = useState("unknown"); // 'unknown' | 'raw' | 'legacy'
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("userData");
      const session = s ? JSON.parse(s) : null;
      const m =
        session?.orderProcessingMode ||
        session?.order_processing_mode ||
        session?.user?.orderProcessingMode ||
        session?.user?.order_processing_mode ||
        "legacy";
      setMode(String(m).toLowerCase() === "raw" ? "raw" : "legacy");
    } catch (_) {
      setMode("legacy");
    }
  }, []);

  if (mode === "unknown") return null; // keep SSR/CSR consistent on first paint
  if (mode === "raw") return <CommentOrdersViewClient />;
  return <LegacyOrdersPage />;
}

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
  PencilIcon,
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
  CodeBracketIcon,
  ChatBubbleOvalLeftEllipsisIcon,
} from "@heroicons/react/24/outline";

// 밴드 특수 태그 처리 함수
const processBandTags = (text) => {
  if (!text) return text;

  let processedText = text;

  // <band:refer user_key="...">사용자명</band:refer> → @사용자명
  processedText = processedText.replace(
    /<band:refer\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:refer>/g,
    "@$1"
  );

  // <band:mention user_key="...">사용자명</band:mention> → @사용자명 (혹시 있다면)
  processedText = processedText.replace(
    /<band:mention\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:mention>/g,
    "@$1"
  );

  // 기타 밴드 태그들도 내용만 남기기
  processedText = processedText.replace(
    /<band:[^>]*>([^<]+)<\/band:[^>]*>/g,
    "$1"
  );

  // 자동 닫힘 밴드 태그 제거 (예: <band:something />)
  processedText = processedText.replace(/<band:[^>]*\/>/g, "");

  return processedText;
};

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
function StatusBadge({ status, processingMethod }) {
  let bgColor, textColor;
  
  switch (status) {
    case "수령완료":
      bgColor = "bg-green-100";
      textColor = "text-green-700";
      break;
    case "주문취소":
      bgColor = "bg-[#f06595]";
      textColor = "text-white";
      break;
    case "주문완료":
      bgColor = "bg-blue-100";
      textColor = "text-blue-700";
      break;
    case "확인필요":
      bgColor = "bg-[#ffe5e5]"; // 연한 빨강 배경
      textColor = "text-[#ff0000]"; // 완전한 빨강 텍스트
      break;
    case "결제완료":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-700";
      break;
    case "미수령":
      bgColor = "bg-red-200";
      textColor = "text-red-700";
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-600";
      break;
  }

  const getProcessingIcon = () => {
    if (!processingMethod) return null;

    switch (processingMethod) {
      case "ai":
        return <SparklesIcon className="h-2.5 w-2.5 mr-1" />;
      case "ai-fallback":
        return <SparklesIcon className="h-2.5 w-2.5 mr-1 opacity-60" />;
      case "pattern":
        return <FunnelIcon className="h-2.5 w-2.5 mr-1" />;
      case "manual":
        return <PencilIcon className="h-2.5 w-2.5 mr-1" />;
      default:
        return null;
    }
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-medium ${bgColor} ${textColor}`}
    >
      {getProcessingIcon()}
      {status}
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
function LegacyOrdersPage() {
  // --- 클라이언트에서만 raw 모드 전환 (SSR과 동일 마크업으로 하이드레이션 보장) ---
  const [mounted, setMounted] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("userData");
      if (s) {
        const session = JSON.parse(s);
        const mode =
          session?.orderProcessingMode ||
          session?.order_processing_mode ||
          session?.user?.orderProcessingMode ||
          session?.user?.order_processing_mode ||
          "legacy";
        setRawMode(String(mode).toLowerCase() === "raw");
      }
    } catch (_) {}
    setMounted(true);
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { scrollToTop } = useScroll();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const searchInputRef = useRef(null); // 검색 입력 ref (uncontrolled)
  const [pendingSearchUi, setPendingSearchUi] = useState(null); // 쿼리 유입 시 UI 채우기 보조
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
  
  // 편집 관련 상태들
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [availableProducts, setAvailableProducts] = useState({});
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

  // --- 댓글 관련 상태 ---
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

  // 클라이언트 사이드 렌더링 확인 상태
  const [isClient, setIsClient] = useState(false);

  // 클라이언트 사이드 렌더링 확인
  useEffect(() => {
    setIsClient(true);
  }, []);

  // --- raw 모드면 클라이언트 전용 컴포넌트로 렌더 (SSR과의 초기 마크업 불일치 방지) ---
  // Note: LegacyOrdersPage is rendered only when dispatcher decides legacy mode

  // 같은 고객 주문들을 순서 번호로 정렬하고 첫 번째 _0 주문에만 댓글 표시
  const processOrdersForDisplay = (orders) => {
    if (!orders || orders.length === 0) return [];
    
    // 1단계: 주문 그룹 키 생성 함수
    const getOrderGroupKey = (orderId) => {
      if (!orderId) return 'no-group';
      return orderId.replace(/_item\d+_\d+$/, '');
    };
    
    // 2단계: 주문 순서 번호 추출 함수 (_뒤의 숫자)
    const getOrderNumber = (orderId) => {
      if (!orderId) return 999;
      const match = orderId.match(/_(\d+)$/);
      return match ? parseInt(match[1], 10) : 999;
    };
    
    // 3단계: 같은 고객별로 그룹화하고 순서 번호로 정렬
    const groupedOrders = new Map();
    
    orders.forEach(order => {
      const groupKey = getOrderGroupKey(order.order_id);
      if (!groupedOrders.has(groupKey)) {
        groupedOrders.set(groupKey, []);
      }
      groupedOrders.get(groupKey).push(order);
    });
    
    // 각 그룹 내에서 순서 번호로 정렬
    const sortedOrders = [];
    groupedOrders.forEach((groupOrders, groupKey) => {
      const sorted = groupOrders.sort((a, b) => {
        return getOrderNumber(a.order_id) - getOrderNumber(b.order_id);
      });
      sortedOrders.push(...sorted);
    });
    
    // 4단계: 각 그룹의 첫 번째 _0 주문 식별
    const groupFirstZeroOrders = new Map();
    
    for (const order of sortedOrders) {
      const orderGroupKey = getOrderGroupKey(order.order_id);
      const endsWithZero = order.order_id && order.order_id.endsWith('_0');
      
      if (endsWithZero && !groupFirstZeroOrders.has(orderGroupKey)) {
        groupFirstZeroOrders.set(orderGroupKey, order.order_id);
      }
    }
    
    // 5단계: 댓글 표시 로직 적용
    return sortedOrders.map(order => {
      const orderGroupKey = getOrderGroupKey(order.order_id);
      const endsWithZero = order.order_id && order.order_id.endsWith('_0');
      const orderNumber = getOrderNumber(order.order_id);
      
      // 해당 주문이 그룹의 첫 번째 _0 주문인지 확인
      const showComment = endsWithZero && groupFirstZeroOrders.get(orderGroupKey) === order.order_id;
      
      
      return {
        ...order,
        showComment: showComment
      };
    });
  };

  const displayOrders = useMemo(() => processOrdersForDisplay(orders), [orders]);

  // --- 현재 페이지 주문들의 총 수량 계산 ---

  // --- 현재 페이지 주문들의 총 수량 및 총 금액 계산 ---
  const { currentPageTotalQuantity, currentPageTotalAmount } = useMemo(() => {
    return displayOrders.reduce(
      (totals, order) => {
        const quantity = parseInt(order.quantity, 10);
        const amount = parseFloat(order.total_amount); // <<< total_amount는 실수일 수 있으므로 parseFloat 사용

        totals.currentPageTotalQuantity += isNaN(quantity) ? 0 : quantity;
        totals.currentPageTotalAmount += isNaN(amount) ? 0 : amount; // <<< 총 금액 합산

        return totals;
      },
      { currentPageTotalQuantity: 0, currentPageTotalAmount: 0 } // <<< 초기값을 객체로 설정
    );
  }, [displayOrders]);
  // --- 총 수량 및 총 금액 계산 끝 ---
  const checkbox = useRef();

  const { mutate: globalMutate } = useSWRConfig(); //

  const dateRangeOptions = [
    { value: "90days", label: "3개월" },
    { value: "30days", label: "1개월" },
    { value: "7days", label: "1주" },
    { value: "today", label: "오늘" },
  ];
  const orderStatusOptions = [
    { value: "all", label: "전체" },
    { value: "주문완료", label: "주문완료" },
    { value: "주문완료+수령가능", label: "주문완료+수령가능" },
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
    onError: (err, key) => {
      // 에러가 실제로 있을 때만 로그
      if (err) {
        // 문자열인 경우와 객체인 경우를 구분하여 처리
        if (typeof err === 'string') {
          console.error("SWR Error (string):", err);
          console.error("Error occurred for key:", key);
        } else if (typeof err === 'object' && err !== null) {
          console.error("SWR Error Details:", {
            key: key,
            message: err?.message || "Unknown error",
            status: err?.status,
            data: err?.data,
            type: typeof err,
            errorKeys: Object.keys(err)
          });
          
          // 401 에러인 경우 로그인 페이지로 리다이렉트 고려
          if (err?.status === 401) {
          }
        } else {
          console.error("SWR Unknown Error Type:", typeof err, err);
        }
      }
    },
    keepPreviousData: true, // 이전 데이터 유지 (기존 유지)
  };
  const {
    data: userDataFromHook,
    error: userError,
    isLoading: isUserLoading,
  } = useUser(userData?.userId, swrOptions);
  // useOrdersClient 훅 호출 부분 수정
  
  // 날짜 필터 파라미터 계산
  const dateFilterParams = calculateDateFilterParams(
    filterDateRange,
    customStartDate,
    customEndDate
  );
  
  // 필터 객체 생성
  const filters = {
    // 검색어가 있으면 페이지네이션 없이 전체 표시 (최대 10000개)
    limit: searchTerm ? 10000 : itemsPerPage,
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
      // '주문완료+수령가능' 선택 시 주문완료 상태로 필터링
      if (filterSelection === "주문완료+수령가능") {
        return "주문완료";
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
      // '주문완료+수령가능' 선택 시 특별 플래그 전달
      if (filterSelection === "주문완료+수령가능") {
        return "수령가능";
      }
      // 그 외의 경우 (전체 또는 주 상태 필터링 시)는 subStatus 필터를 적용하지 않음 (undefined)
      return undefined;
    })(),
    // --- 파라미터 동적 결정 로직 끝 ---
    // --- 👇 검색 관련 파라미터 수정 👇 ---
    search: searchTerm.trim() || undefined, // 일반 검색어
    exactCustomerName: exactCustomerFilter || undefined, // <<< 정확한 고객명 파라미터 추가
    // --- 👆 검색 관련 파라미터 수정 👆 ---
    startDate:
      filterSelection === "주문완료+수령가능"
        ? undefined
        : dateFilterParams.startDate,
    endDate:
      filterSelection === "주문완료+수령가능"
        ? undefined
        : dateFilterParams.endDate,
  };
  
  
  const {
    data: ordersData,
    error: ordersError,
    isLoading: isOrdersLoading,
    mutate: mutateOrders,
  } = useOrdersClient(
    userData?.userId,
    currentPage,
    filters,
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
  
  // 전체 주문 통계를 위한 hook 사용 - 날짜 필터만 적용
  const {
    data: statsData,
    error: statsError,
    isLoading: isStatsLoading,
  } = useOrderStatsClient(
    userData?.userId,
    {
      // 날짜 필터만 적용 (상태 필터는 제외)
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    swrOptions
  );

  // 클라이언트 사이드 mutation 함수들
  const { updateOrderStatus, updateOrderDetails, bulkUpdateOrderStatus } =
    useOrderClientMutations();

  const isDataLoading = isUserLoading || isOrdersLoading;
  const displayedOrderIds = useMemo(() => displayOrders.map((o) => o.order_id), [displayOrders]);
  const isAllDisplayedSelected = useMemo(
    () =>
      displayedOrderIds.length > 0 &&
      displayedOrderIds.every((id) => selectedOrderIds.includes(id)),
    [displayedOrderIds, selectedOrderIds]
  );
  const isSomeDisplayedSelected = useMemo(
    () =>
      displayedOrderIds.length > 0 &&
      displayedOrderIds.some((id) => selectedOrderIds.includes(id)),
    [displayedOrderIds, selectedOrderIds]
  );

  // 선택된 주문들의 총 수량과 총 금액 계산
  const selectedOrderTotals = useMemo(() => {
    const selectedOrders = displayOrders.filter(order => 
      selectedOrderIds.includes(order.order_id)
    );
    
    const totalQuantity = selectedOrders.reduce((sum, order) => {
      const quantity = parseInt(order.quantity, 10);
      return sum + (isNaN(quantity) ? 0 : quantity);
    }, 0);
    
    const totalAmount = selectedOrders.reduce((sum, order) => {
      // selected_barcode_option이 있으면 그 가격 사용, 없으면 기본 가격 사용
      let price = 0;
      if (order.selected_barcode_option?.price) {
        price = order.selected_barcode_option.price;
      } else if (order.price) {
        price = order.price;
      }
      const quantity = parseInt(order.quantity, 10) || 0;
      return sum + (price * quantity);
    }, 0);
    
    return { totalQuantity, totalAmount };
  }, [displayOrders, selectedOrderIds]);

  useEffect(() => {
    if (!isUserLoading) {
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
    if (searchInputRef.current) {
      searchInputRef.current.value = trimmedValue; // 검색창 UI 업데이트
    }
    setSearchTerm(trimmedValue); // 실제 검색 상태 업데이트
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    setSelectedOrderIds([]); // 검색 시 선택된 항목 초기화 (선택적)
    // 필요하다면 검색 후 맨 위로 스크롤
  };

  // 편집 관련 함수들
  const fetchProductsForPost = async (postId, bandKey, userId) => {
    if (!userId) {
      console.error('userId가 없습니다. 로그인이 필요합니다.');
      return [];
    }

    // 캐시 키를 band_key와 post_key 조합으로 변경
    const cacheKey = `${bandKey}_${postId}`;
    
    if (availableProducts[cacheKey]) {
      return availableProducts[cacheKey];
    }

    try {
      // user_id와 band_key를 쿼리 파라미터로 추가
      const url = bandKey 
        ? `${window.location.origin}/api/posts/${postId}/products?user_id=${userId}&band_key=${bandKey}`
        : `${window.location.origin}/api/posts/${postId}/products?user_id=${userId}`;
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setAvailableProducts(prev => ({
          ...prev,
          [cacheKey]: result.data
        }));
        return result.data;
      } else {
        console.error('상품 목록 조회 실패:', result.error);
      }
    } catch (error) {
      console.error('상품 목록 조회 실패:', error);
    }
    
    return [];
  };

  const handleEditStart = async (order) => {
    setEditingOrderId(order.order_id);
    setEditValues({
      product_id: order.product_id || '',
      product_name: order.product_name || '',
      quantity: order.quantity || 1,
      product_price: order.price || 0
    });

    // 해당 게시물의 상품 목록 가져오기 - post_key와 band_key 사용
    const postKey = order.post_key;
    const bandKey = order.band_key;
    console.log('Edit start - order:', order);
    console.log('Using postKey:', postKey, 'bandKey:', bandKey);
    
    if (postKey && bandKey && userData?.userId) {
      await fetchProductsForPost(postKey, bandKey, userData.userId);
    } else {
      console.error('post_key, band_key 또는 userId가 없습니다:', { postKey, bandKey, userId: userData?.userId });
    }
  };

  const handleEditCancel = () => {
    setEditingOrderId(null);
    setEditValues({});
  };

  // 토스트 알림 함수
  const addToast = (message, type = 'info') => {
    alert(message); // 임시로 alert 사용, 나중에 토스트 라이브러리로 교체 가능
  };

  const handleEditSave = async (order) => {
    setSavingEdit(true);
    
    // product_name이 없다면 기존 값을 사용
    const updateData = {
      ...editValues,
      product_name: editValues.product_name || order.product_name || '상품명 없음'
    };

    console.log('저장할 데이터:', updateData);
    
    try {
      const response = await fetch(`${window.location.origin}/api/orders/${order.order_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '업데이트 실패');
      }

      // 성공 시 데이터 새로고침 - DB에서 최신 데이터 가져오기
      await mutateOrders(undefined, { revalidate: true });

      setEditingOrderId(null);
      setEditValues({});
      
      // Toast 알림 표시
      addToast('주문 정보가 성공적으로 업데이트되었습니다.');
      
    } catch (error) {
      console.error('주문 업데이트 에러:', error);
      addToast('주문 정보 업데이트에 실패했습니다: ' + error.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // 상품명에서 날짜 부분을 제거하는 함수
  const cleanProductName = (productName) => {
    if (!productName) return productName;
    // [날짜] 패턴 제거 (예: [8월18일], [08월18일], [8/18] 등)
    return productName.replace(/^\[[\d월일/\s]+\]\s*/g, '').trim();
  };


  const handleProductSelect = (productId, order) => {
    const postKey = order.post_key;
    const bandKey = order.band_key;
    const cacheKey = `${bandKey}_${postKey}`;
    const products = availableProducts[cacheKey] || [];
    const selectedProduct = products.find(p => p.product_id === productId);
    
    if (selectedProduct) {
      setEditValues(prev => ({
        ...prev,
        product_id: productId,
        product_name: cleanProductName(selectedProduct.title),
        product_price: selectedProduct.base_price || 0
      }));
    }
  };

  const handleQuantityChange = (quantity) => {
    setEditValues(prev => ({
      ...prev,
      quantity: parseInt(quantity) || 1
    }));
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


    let successCount = 0;
    let failCount = 0;

    try {
      await bulkUpdateOrderStatus(
        orderIdsToProcess,
        newStatus,
        userData.userId
      );
      successCount = orderIdsToProcess.length;

      // 즉시 주문 리스트 새로고침
      await mutateOrders(undefined, { revalidate: true });

      // 글로벌 캐시도 무효화 (더 확실한 업데이트를 위해)
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "orders" &&
          key[1] === userData.userId,
        undefined,
        { revalidate: true }
      );
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
    
    const result = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
    
    return result;
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

  // URL 파라미터에서 검색어 및 필터 처리하는 useEffect 추가
  useEffect(() => {
    const searchParam = searchParams.get("search");
    const filterParam = searchParams.get("filter");
    const postKeyParam = searchParams.get("postKey");
    const postParam = searchParams.get("post"); // posts-test 등 호환

    if (searchParam) {
      setPendingSearchUi(searchParam);
      setSearchTerm(searchParam);
      setCurrentPage(1);
      setExactCustomerFilter(null);
      setSelectedOrderIds([]);
    }

    // postKey 파라미터 처리 - posts 페이지에서 넘어온 경우
    const incomingPostKey = postKeyParam || postParam;
    if (incomingPostKey) {
      setPendingSearchUi(incomingPostKey);
      setSearchTerm(incomingPostKey);
      setCurrentPage(1);
      setExactCustomerFilter(null);
      setSelectedOrderIds([]);
    }

    // 미수령 필터 파라미터 처리
    if (filterParam === "unpicked") {
      setFilterSelection("미수령");
      setCurrentPage(1);
      setSelectedOrderIds([]);
    }

    // URL에서 파라미터 제거 (한 번만 실행되도록)
    if (searchParam || filterParam || postKeyParam || postParam) {
      const newUrl = new URL(window.location);
      newUrl.searchParams.delete("search");
      newUrl.searchParams.delete("filter");
      newUrl.searchParams.delete("postKey");
      newUrl.searchParams.delete("post");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [searchParams]);

  // 쿼리 유입 값으로 UI 채우기 (ref가 준비된 뒤 한 번 더 보정)
  useEffect(() => {
    if (pendingSearchUi != null && searchInputRef.current) {
      searchInputRef.current.value = pendingSearchUi;
      setPendingSearchUi(null);
    }
  }, [pendingSearchUi]);

  // 페이지 가시성 변경 및 포커스 감지하여 상품 데이터 업데이트
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && userData?.userId) {
        mutateProducts(); // 상품 데이터 새로고침
      }
    };

    const handleWindowFocus = () => {
      if (userData?.userId) {
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

  // 페이지 로드 시 상품 및 주문 데이터 새로고침 (라우팅으로 인한 페이지 진입 감지)
  useEffect(() => {
    if (userData?.userId) {
      mutateProducts(); // 페이지 진입 시 상품 데이터 새로고침
      mutateOrders(undefined, { revalidate: true }); // 페이지 진입 시 주문 데이터도 새로고침
    }
  }, [userData?.userId, mutateProducts, mutateOrders]);

  // 게시물 업데이트 이벤트 리스너 - Comments 모달에서 수령일 변경 시 주문 데이터 새로고침
  useEffect(() => {
    const handlePostUpdated = (event) => {
      console.log('주문 페이지: 게시물 업데이트 이벤트 수신:', event.detail);
      if (userData?.userId && mutateOrders) {
        // 주문 데이터 새로고침
        mutateOrders(undefined, { revalidate: true });
        console.log('주문 데이터 새로고침 완료');
      }
    };

    window.addEventListener('postUpdated', handlePostUpdated);
    
    return () => {
      window.removeEventListener('postUpdated', handlePostUpdated);
    };
  }, [mutateOrders, userData?.userId]);

  // localStorage 플래그 감지하여 수령일 업데이트 확인
  useEffect(() => {
    const checkPickupDateUpdate = () => {
      const lastUpdated = localStorage.getItem("pickupDateUpdated");
      if (lastUpdated && userData?.userId) {
        const updateTime = parseInt(lastUpdated);
        const now = Date.now();
        // 5분 이내의 업데이트만 유효하다고 간주
        if (now - updateTime < 5 * 60 * 1000) {
          console.log('수령일 변경 감지됨, 주문 데이터 새로고침');
          mutateOrders(undefined, { revalidate: true });
          // 플래그 제거하여 중복 업데이트 방지
          localStorage.removeItem("pickupDateUpdated");
        }
      }
    };

    // 컴포넌트 마운트 시 체크
    checkPickupDateUpdate();

    // storage 이벤트 리스너 (다른 탭에서 변경사항이 있을 때)
    window.addEventListener("storage", checkPickupDateUpdate);

    return () => {
      window.removeEventListener("storage", checkPickupDateUpdate);
    };
  }, [mutateOrders, userData?.userId]);

  // localStorage 플래그 감지하여 바코드 옵션 업데이트 확인
  useEffect(() => {
    const checkBarcodeOptionsUpdate = () => {
      const lastUpdated = localStorage.getItem("barcodeOptionsUpdated");
      if (lastUpdated && userData?.userId) {
        const updateTime = parseInt(lastUpdated);
        const now = Date.now();
        // 5분 이내의 업데이트만 유효하다고 간주
        if (now - updateTime < 5 * 60 * 1000) {
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
    if (ordersData?.data) {
      
      // 날짜 분석
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      
      // 오늘 주문된 건수
      const todayOrderedCount = ordersData.data.filter(order => {
        const orderDate = new Date(order.ordered_at);
        return orderDate >= today && orderDate <= todayEnd;
      }).length;
      
      // 오늘 수령완료된 건수
      const todayCompletedCount = ordersData.data.filter(order => {
        if (!order.completed_at) return false;
        const completedDate = new Date(order.completed_at);
        return completedDate >= today && completedDate <= todayEnd;
      }).length;
      setOrders(ordersData.data);
    }
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
  const getProductNameById = (id) => {
    // products 배열에서 product_id로 찾기
    const product = products.find((p) => p.product_id === id);
    if (product?.title) {
      return product.title;
    }
    
    // orders 데이터에서 product_name 필드 사용 (폴백)
    const order = orders.find((o) => o.product_id === id);
    if (order?.product_name && order.product_name !== "상품명 없음") {
      return order.product_name;
    }
    
    // product_title 필드도 확인 (orders_with_products 뷰에서)
    if (order?.product_title) {
      return order.product_title;
    }
    
    return "상품명 없음";
  };

  // 상품명을 파싱하여 날짜와 상품명을 분리하는 함수
  const parseProductName = (productName) => {
    if (!productName || productName === "상품명 없음") {
      return { name: productName, date: null };
    }

    // [날짜] 패턴 찾기 (예: [12/25], [2024-12-25], [25일] 등)
    const datePattern = /^\[([^\]]+)\]\s*(.*)$/;
    const match = productName.match(datePattern);

    if (match) {
      return {
        date: match[1], // 대괄호 안의 날짜 부분
        name: match[2].trim() || productName, // 나머지 상품명 부분
      };
    }

    // 패턴이 없으면 전체를 상품명으로 처리
    return { name: productName, date: null };
  };

  // 수령일 날짜를 Date 객체로 변환하는 함수
  const parsePickupDate = (dateString) => {
    if (!dateString) return null;

    try {
      const currentYear = new Date().getFullYear();

      // [7월11일] 형태 파싱
      const monthDayPattern = /^(\d{1,2})월(\d{1,2})일?$/;
      const match = dateString.match(monthDayPattern);

      if (match) {
        const month = parseInt(match[1], 10) - 1; // 월은 0부터 시작
        const day = parseInt(match[2], 10);
        return new Date(currentYear, month, day);
      }

      // 다른 형태의 날짜도 처리 가능하도록 확장 가능
      // [12/25], [2024-12-25] 등

      return null;
    } catch (error) {
      console.error("날짜 파싱 오류:", error);
      return null;
    }
  };

  // KST YMD 변환 유틸
  const toKstYmd = (dateInput) => {
    if (!dateInput) return null;
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    try {
      let y, m, d;
      if (typeof dateInput === 'string' && dateInput.includes('T')) {
        const dt = new Date(dateInput);
        const k = new Date(dt.getTime() + KST_OFFSET);
        y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
      } else if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        const [datePart] = dateInput.split(' ');
        const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
        y = yy; m = mm; d = dd;
      } else if (typeof dateInput === 'string') {
        const md = dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (md) {
          const now = new Date(new Date().getTime() + KST_OFFSET);
          y = now.getUTCFullYear(); m = parseInt(md[1], 10); d = parseInt(md[2], 10);
        } else {
          const dt = new Date(dateInput);
          const k = new Date(dt.getTime() + KST_OFFSET);
          y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
        }
      } else if (dateInput instanceof Date) {
        const k = new Date(dateInput.getTime() + KST_OFFSET);
        y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
      } else {
        return null;
      }
      return y * 10000 + m * 100 + d;
    } catch (_) {
      return null;
    }
  };

  const pickEffectivePickupSource = (primary, titleDate) => {
    const y1 = toKstYmd(primary);
    const y2 = toKstYmd(titleDate);
    if (y1 && y2) return y1 <= y2 ? primary : titleDate;
    return primary || titleDate || null;
  };

  // 수령 가능 여부(KST 날짜 기준, 당일 0시부터)를 판단하는 함수
  const isPickupAvailable = (dateInput) => {
    if (!isClient || !dateInput) return false;

    const KST_OFFSET = 9 * 60 * 60 * 1000;

    // now in KST (Y/M/D only)
    const nowUtc = new Date();
    const nowKst = new Date(nowUtc.getTime() + KST_OFFSET);
    const nowY = nowKst.getUTCFullYear();
    const nowM = nowKst.getUTCMonth();
    const nowD = nowKst.getUTCDate();
    const nowYmd = nowY * 10000 + (nowM + 1) * 100 + nowD;

    // pickup date as KST Y/M/D
    let y, m, d;
    try {
      if (typeof dateInput === 'string' && dateInput.includes('T')) {
        const dt = new Date(dateInput); // absolute UTC
        const k = new Date(dt.getTime() + KST_OFFSET);
        y = k.getUTCFullYear();
        m = k.getUTCMonth() + 1;
        d = k.getUTCDate();
      } else if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        const [datePart] = dateInput.split(' ');
        const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
        y = yy; m = mm; d = dd;
      } else if (typeof dateInput === 'string') {
        const md = dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (md) {
          const now = new Date(nowUtc.getTime() + KST_OFFSET);
          y = now.getUTCFullYear();
          m = parseInt(md[1], 10);
          d = parseInt(md[2], 10);
        } else {
          const dt = new Date(dateInput);
          const k = new Date(dt.getTime() + KST_OFFSET);
          y = k.getUTCFullYear();
          m = k.getUTCMonth() + 1;
          d = k.getUTCDate();
        }
      } else if (dateInput instanceof Date) {
        const k = new Date(dateInput.getTime() + KST_OFFSET);
        y = k.getUTCFullYear();
        m = k.getUTCMonth() + 1;
        d = k.getUTCDate();
      } else {
        return false;
      }
    } catch (_) {
      return false;
    }

    const pickYmd = y * 10000 + m * 100 + d;
    return nowYmd >= pickYmd;
  };

  // KST 기준 수령일 라벨 포맷터: "[M월D일]"
  const formatPickupKSTLabel = (dateInput) => {
    if (!dateInput) return "";
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    try {
      let y, m, d;
      if (typeof dateInput === 'string' && dateInput.includes('T')) {
        const dt = new Date(dateInput);
        const k = new Date(dt.getTime() + KST_OFFSET);
        m = k.getUTCMonth() + 1; d = k.getUTCDate();
        return `${m}월${d}일`;
      }
      if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        const [datePart] = dateInput.split(' ');
        const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
        return `${mm}월${dd}일`;
      }
      const md = typeof dateInput === 'string' ? dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) : null;
      if (md) {
        return `${parseInt(md[1], 10)}월${parseInt(md[2], 10)}일`;
      }
      const dt = new Date(dateInput);
      const k = new Date(dt.getTime() + KST_OFFSET);
      m = k.getUTCMonth() + 1; d = k.getUTCDate();
      return `${m}월${d}일`;
    } catch (_) {
      return "";
    }
  };
  const getProductBarcode = (id) => {
    // products 배열에서 product_id로 찾기
    const product = products.find((p) => p.product_id === id);
    if (product?.barcode) {
      return product.barcode;
    }
    
    // orders 데이터에서 product_barcode 필드 사용 (폴백)
    const order = orders.find((o) => o.product_id === id);
    if (order?.product_barcode) {
      return order.product_barcode;
    }
    
    return "";
  };
  const getProductById = (id) =>
    products.find((p) => p.product_id === id) || null;
  const getPostUrlByProductId = (id) =>
    products.find((p) => p.product_id === id)?.band_post_url || "";

  // --- Debug logging for pickup availability by band ---
  const debugPickupLogging = () => {
    if (typeof window === 'undefined') return;
    let debug = false;
    try { debug = window.localStorage.getItem('debugPickup') === 'true'; } catch {}
    if (!debug) return;

    try {
      const all = orders || [];
      const KSTflag = 'KST day-based';
      const byBandAll = new Map();
      const byBandAvail = new Map();
      const samples = [];

      const extractBracketDate = (title) => {
        if (!title || typeof title !== 'string') return null;
        const m = title.match(/^\s*\[([^\]]+)\]/);
        return m ? m[1] : null;
      };

      for (const o of all) {
        const bandKey = o.band_key || 'unknown';
        byBandAll.set(bandKey, (byBandAll.get(bandKey) || 0) + 1);

        const prod = getProductById(o.product_id);
        const productName = getProductNameById(o.product_id);
        const { date: titleDateFromName } = parseProductName(productName);
        const titleDate = titleDateFromName || extractBracketDate(o.product_title);
        const source = o.product_pickup_date || prod?.pickup_date || titleDate;
        const avail = source ? isPickupAvailable(source) : false;
        if (avail) {
          byBandAvail.set(bandKey, (byBandAvail.get(bandKey) || 0) + 1);
        }
        if (samples.length < 30) {
          samples.push({ band_key: bandKey, order_id: o.order_id, product_title: o.product_title || productName, product_pickup_date: o.product_pickup_date, products_pickup_date: prod?.pickup_date || null, titleDate, usedSource: source, available: avail });
        }
      }

      const objFromMap = (m) => Object.fromEntries(Array.from(m.entries()));
      console.groupCollapsed('[Pickup Debug] Orders Page');
      console.log('filterSelection', filterSelection, '| mode:', KSTflag);
      console.log('counts', { all: all.length, available: Array.from(byBandAvail.values()).reduce((a,b)=>a+b,0) });
      console.log('byBand', { all: objFromMap(byBandAll), available: objFromMap(byBandAvail) });
      console.table(samples);
      console.groupEnd();
    } catch (e) {
      console.warn('Pickup debug logging failed (page):', e);
    }
  };

  // 주문 ID에서 게시물 키를 추출하는 함수
  const extractPostKeyFromOrderId = (orderId) => {
    if (!orderId || typeof orderId !== "string") return null;

    // order_AADlR1ebdBcadJk0v-It9wZj_AAAUM7DZve7GrqtKaCpxuUoX_AAC6BX4X4vfcxrBGtomcNcIf_item1
    // 패턴: order_{bandKey}_{postKey}_{commentKey}_{itemNumber}
    const parts = orderId.split("_");
    if (parts.length >= 4 && parts[0] === "order") {
      return parts[2]; // 세 번째 부분이 게시물 키
    }
    return null;
  };
  const formatCurrency = (amt) =>
    new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amt ?? 0);
  const formatDate = (ds) => {
    if (!ds) return "-";
    try {
      // 화면 표시를 KST처럼 보이도록 +9시간 보정해 출력
      if (typeof ds === 'string' && ds.includes('T')) {
        const d = new Date(ds);
        if (Number.isNaN(d.getTime())) return ds;
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const MM = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const DD = String(kst.getUTCDate()).padStart(2, '0');
        const hh = String(kst.getUTCHours()).padStart(2, '0');
        const mm = String(kst.getUTCMinutes()).padStart(2, '0');
        return `${MM}.${DD} ${hh}:${mm}`;
      } else if (typeof ds === 'string' && ds.includes('-')) {
        // 날짜만 있는 경우 (YYYY-MM-DD)
        const d = new Date(`${ds}T00:00:00.000Z`);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const MM = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const DD = String(kst.getUTCDate()).padStart(2, '0');
        return `${MM}.${DD}`;
      } else if (ds instanceof Date) {
        const kst = new Date(ds.getTime() + 9 * 60 * 60 * 1000);
        const MM = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const DD = String(kst.getUTCDate()).padStart(2, '0');
        const hh = String(kst.getUTCHours()).padStart(2, '0');
        const mm = String(kst.getUTCMinutes()).padStart(2, '0');
        return `${MM}.${DD} ${hh}:${mm}`;
      }
      return String(ds);
    } catch (e) {
      console.error("Date Format Err:", e);
      return ds || "Error";
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
        updateData.completed_at = nowISO;
        updateData.canceled_at = null;
        updateData.sub_status = null;  // 수령완료 시 미수령 상태 제거
      } else if (newStatus === "주문취소") {
        updateData.canceled_at = nowISO;
        updateData.completed_at = null;
        updateData.sub_status = null;  // 주문취소 시 미수령 상태 제거
      } else if (newStatus === "주문완료") {
        updateData.completed_at = null;
        updateData.canceled_at = null;
      } else if (newStatus === "확인필요") {
        updateData.completed_at = null;
        updateData.canceled_at = null;
      }

      console.log("Updating order status via client-side:", {
        orderId,
        updateData,
      });

      await updateOrderStatus(orderId, updateData, userData.userId);

      console.log("Order status updated successfully via client-side");

      // 즉시 주문 리스트 새로고침
      console.log("🔄 주문 상태 변경 후 리스트 새로고침 중...");
      await mutateOrders(undefined, { revalidate: true });

      // 글로벌 캐시도 무효화 (더 확실한 업데이트를 위해)
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "orders" &&
          key[1] === userData.userId,
        undefined,
        { revalidate: true }
      );

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
  };
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };

  const clearInputValue = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      searchInputRef.current.focus();
    }
  };

  // 검색 버튼 클릭 또는 Enter 키 입력 시 실제 검색 실행
  const handleSearch = () => {
    const trimmedInput = searchInputRef.current?.value.trim() || "";
    // 현재 검색어와 다를 때만 상태 업데이트 및 API 재요청
    if (trimmedInput !== searchTerm) {
      console.log(`[Search] New search triggered: "${trimmedInput}"`);
      setSearchTerm(trimmedInput);
      setCurrentPage(1); // 검색 시 항상 1페이지로
      setExactCustomerFilter(null); // 일반 검색 시 정확 고객명 필터 초기화
      setSelectedOrderIds([]); // 선택 초기화
    }
  };

  // 입력란에서 엔터 키 누를 때 이벤트 핸들러
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // 검색 초기화 함수
  const handleClearSearch = () => {
    console.log("[Search] Clearing search and filters.");
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    setSearchTerm("");
    setExactCustomerFilter(null);
    setCurrentPage(1);
    setFilterSelection("주문완료"); // 기본 필터로 복귀
    setFilterDateRange("30days"); // 기본 날짜로 복귀
    setCustomStartDate(null);
    setCustomEndDate(null);
    setSelectedOrderIds([]);
  };

  // 정확한 고객명 검색
  const handleExactCustomerSearch = (customerName) => {
    if (!customerName || customerName === "-") return;
    const trimmedName = customerName.trim();
    console.log(`[Search] Exact customer search: "${trimmedName}"`);
    if (searchInputRef.current) {
      searchInputRef.current.value = trimmedName;
    }
    setSearchTerm(""); // 일반 검색어는 비움
    setExactCustomerFilter(trimmedName); // 정확 검색어 설정
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  // --- 기존 검색 관련 useEffect 및 핸들러들은 위 함수들로 대체/통합 ---

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

      // 즉시 주문 리스트 새로고침
      console.log("🔄 주문 정보 수정 후 리스트 새로고침 중...");
      await mutateOrders(undefined, { revalidate: true });

      // 글로벌 캐시도 무효화 (더 확실한 업데이트를 위해)
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "orders" &&
          key[1] === userData.userId,
        undefined,
        { revalidate: true }
      );

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
      console.log("🔄 바코드 옵션 변경 후 리스트 새로고침 중...");
      await mutateOrders(undefined, { revalidate: true });
      await mutateProducts(undefined, { revalidate: true }); // 상품 데이터도 새로고침하여 최신 바코드 옵션 반영

      // 글로벌 캐시도 무효화 (더 확실한 업데이트를 위해)
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "orders" &&
          key[1] === userData.userId,
        undefined,
        { revalidate: true }
      );
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "products" &&
          key[1] === userData.userId,
        undefined,
        { revalidate: true }
      );
    } catch (error) {
      console.error("Failed to update barcode option:", error);
      alert("바코드 옵션 변경에 실패했습니다.");
    }
  };

  // --- 바코드 저장 함수 ---
  // 댓글 모달 열기 함수
  const openCommentsModal = async (order, tryKeyIndex = 0) => {
    const extractedPostKey = extractPostKeyFromOrderId(order.order_id);
    const postKey = order.post_key || order.post_number || extractedPostKey;
    const bandKey = userData?.band_key || order.band_key;

    if (!postKey || !bandKey) {
      showError("게시물/밴드 정보가 없어 댓글을 불러올 수 없습니다.");
      return;
    }

    // 메인 + 백업키 배열
    const allAccessTokens = [
      userData.band_access_token,
      ...(userData.backup_band_keys || []),
    ];

    if (!allAccessTokens[tryKeyIndex]) {
      showError("모든 BAND API 키가 할당량 초과 또는 오류입니다.");
      return;
    }

    const product = getProductById(order.product_id);
    // product의 content 필드에 게시물 내용이 저장되어 있음
    const postContent = product?.content || product?.description || "";
    
    // 디버깅용 로그
    console.log("Opening comments for order:", order.order_id);
    console.log("Product ID:", order.product_id);
    console.log("Found product:", product);
    console.log("Product content:", product?.content);
    console.log("Final postContent:", postContent);

    setSelectedPostForComments({
      postKey,
      bandKey,
      productName: getProductNameById(order.product_id),
      accessToken: allAccessTokens[tryKeyIndex],
      postContent,
      tryKeyIndex, // 현재 시도 중인 키 인덱스
      order, // 원본 order도 넘김
    });
    setIsCommentsModalOpen(true);
  };

  // 댓글 모달 닫기 함수
  const closeCommentsModal = () => {
    setIsCommentsModalOpen(false);
    setSelectedPostForComments(null);
  };

  // 댓글 모달에서 failover 요청 시 다음 키로 재시도
  const handleCommentsFailover = (order, prevTryKeyIndex = 0) => {
    setIsCommentsModalOpen(false);
    setTimeout(() => {
      openCommentsModal(order, prevTryKeyIndex + 1);
    }, 100);
  };

  const handleSaveBarcode = async (productId, barcodeValue) => {

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

  // 전체 통계 데이터 사용 (useOrderStatsClient hook에서 가져온 데이터)
  const totalStatsOrders = statsData?.data?.totalOrders || 0;
  const totalCompletedOrders = statsData?.data?.statusCounts?.["수령완료"] || 0;
  const totalPendingOrders = statsData?.data?.subStatusCounts?.["미수령"] || 0;
  const statusCounts = statsData?.data?.statusCounts || {};
  const subStatusCounts = statsData?.data?.subStatusCounts || {};


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
              <UpdateButton pageType="orders" />
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
        <LightCard padding="p-0" className="mb-2 md:mb-2 overflow-hidden">
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
                    ref={searchInputRef}
                    type="text"
                    placeholder="고객명, 상품명, 바코드, post_key..."
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isDataLoading}
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  {/* X 버튼 - 항상 표시 */}
                  <button
                    type="button"
                    onClick={clearInputValue}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="검색 내용 지우기"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
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

        {/* 주의 안내 문구 */}
        <p className="text-sm text-gray-600 px-1 py-2">
          * 상품과 수량이 잘못 처리될 수 있습니다. 상품명과 고객댓글 수량을 꼭 확인하세요.
        </p>

        {/* 주문 테이블 */}
        <LightCard padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-text-plus2">
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
                  <th className="py-2 pr-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">
                    상품명
                  </th>
                  <th className="py-2 pr-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                    <button
                      onClick={() => handleSortChange("customer_name")} // 정렬 함수
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      고객명 {getSortIcon("customer_name")}
                    </button>
                  </th>
                  <th className="py-2 pr-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell w-60">
                    고객 댓글
                  </th>

                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-16">
                    수량
                  </th>
                  <th className="py-2 pr-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                    <button
                      onClick={() => handleSortChange("total_amount")}
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      금액 {getSortIcon("total_amount")}
                    </button>
                  </th>
                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                    <button
                      onClick={() => handleSortChange("ordered_at")}
                      className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDataLoading}
                    >
                      주문일시 {getSortIcon("ordered_at")}
                    </button>
                  </th>
                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell w-32">
                    바코드
                  </th>
                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                    상태
                  </th>
                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                    서브상태
                  </th>
                  <th className="py-2 pr-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-44">
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isOrdersLoading && !ordersData && (
                  <tr>
                    <td colSpan="13" className="px-6 py-10 text-center">
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
                      colSpan="13"
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
                          editingOrderId === order.order_id 
                            ? "bg-blue-50 border-l-4 border-blue-400" 
                            : order.sub_status === "미수령"
                              ? "bg-red-50 border-l-4 border-red-400"
                              : isSelected 
                                ? "bg-orange-50" 
                                : "hover:bg-gray-50"
                        } transition-colors group cursor-pointer ${
                          isOrdersLoading ? "opacity-70" : ""
                        }`}
                        onClick={() => editingOrderId === order.order_id ? null : openDetailModal(order)}
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
                          className="py-2 pr-4 text-sm text-gray-700 font-medium w-44" 
                          title={getProductNameById(order.product_id)}
                        >
                          {editingOrderId === order.order_id ? (
                            // 편집 모드
                            <select
                              value={editValues.product_id}
                              onChange={(e) => handleProductSelect(e.target.value, order)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">상품을 선택하세요</option>
                              {(availableProducts[`${order.band_key}_${order.post_key}`] || []).map(product => (
                                <option key={product.product_id} value={product.product_id}>
                                  {cleanProductName(product.title)}
                                  {product.base_price && ` (₩${product.base_price.toLocaleString()})`}
                                </option>
                              ))}
                            </select>
                          ) : (
                            // 일반 표시 모드
                            <div 
                              className="hover:text-orange-600 hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClickToSearch(
                                  getProductNameById(order.product_id)
                                );
                                setFilterSelection("all");
                              }}
                            >
                              {(() => {
                                const productName = getProductNameById(
                                  order.product_id
                                );
                                const { name, date } =
                                  parseProductName(productName);
                                const product = getProductById(order.product_id);
                                const primary = order.product_pickup_date || product?.pickup_date;
                                const pickupDate = pickEffectivePickupSource(primary, date);
                                const isAvailable =
                                  isClient && pickupDate
                                    ? isPickupAvailable(pickupDate)
                                    : false;

                                return (
                                  <div className="flex flex-col">
                                    <div
                                      className={`font-medium ${
                                        isAvailable
                                          ? "text-orange-600 font-bold"
                                          : ""
                                      }`}
                                    >
                                      {name}
                                    </div>
                                    {pickupDate && (
                                      <div className="text-xs mt-0.5 text-gray-500">
                                        [{formatPickupKSTLabel(pickupDate)}]
                                        {isAvailable && (
                                          <span className="ml-1 text-gray-500">✓ 수령가능</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td
                          className="py-2 pr-4 text-sm text-gray-700 whitespace-nowrap w-24 truncate hover:text-orange-600 hover:underline cursor-pointer"
                          title={order.customer_name}
                          onClick={(e) => {
                            e.stopPropagation(); // 행 전체 onClick(모달) 방지
                            handleExactCustomerSearch(order.customer_name); // <<< 정확 필터 함수 호출 확인
                          }}
                        >
                          {order.customer_name || "-"}
                        </td>
                        <td
                          className="py-2 pr-2 text-sm text-gray-600 w-60 hidden md:table-cell"
                          title={order.showComment ? (processBandTags(order.comment) || "") : ""}
                        >
                          <div className="line-clamp-3 break-words leading-tight whitespace-pre-line">
                            {order.showComment ? (
                              <span>{processBandTags(order.comment) || "댓글 없음"}</span>
                            ) : (
                              <span className="text-gray-400 text-lg">⤷</span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 pr-2 text-center text-sm font-medium text-gray-700 w-16">
                          {editingOrderId === order.order_id ? (
                            <input
                              type="number"
                              min="1"
                              value={editValues.quantity}
                              onChange={(e) => handleQuantityChange(e.target.value)}
                              className="w-12 px-1 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            order.quantity || 0
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-sm font-medium text-gray-700 w-24">
                          {editingOrderId === order.order_id ? (
                            <span className="text-orange-600 font-semibold">
                              ₩{((editValues.quantity || 1) * (editValues.product_price || 0)).toLocaleString()}
                            </span>
                          ) : (
                            formatCurrency(order.total_amount)
                          )}
                        </td>
                        <td className="py-2 pr-2 text-center text-sm text-gray-600 whitespace-nowrap w-32">
                          {formatDate(order.ordered_at)}
                        </td>
                        <td className="py-2 pr-2 text-center hidden md:table-cell w-32">
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
                                height={30}
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

                        <td className="py-2 pr-2 text-center whitespace-nowrap w-24">
                          <StatusBadge
                            status={order.status}
                            processingMethod={order.processing_method}
                          />
                        </td>

                        {/* 서브상태 셀 */}
                        <td className="py-2 pr-2 text-center w-24">
                          {(() => {
                            const actualStatus = order.status;
                            const actualSubStatus = order.sub_status;

                            // 확인필요 상태 - updated_at 시간 표시
                            if (
                              actualStatus !== "수령완료" &&
                              actualSubStatus === "확인필요"
                            ) {
                              return (
                                <div>
                                  <span className="inline-flex items-center rounded-full bg-gray-700 px-2 py-0.5 text-xs font-medium text-white">
                                    확인필요
                                  </span>
                                  {order.updated_at && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {formatDate(order.updated_at)}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // 주문취소 상태 - updated_at 시간 표시
                            if (actualStatus === "주문취소") {
                              return (
                                <div>
                                  <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                                    취소
                                  </span>
                                  {order.updated_at && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {formatDate(order.updated_at)}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // 미수령 상태
                            if (
                              actualStatus !== "수령완료" &&
                              actualSubStatus === "미수령"
                            ) {
                              return (
                                <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                                  미수령
                                </span>
                              );
                            }

                            // 수령완료 상태
                            if (
                              actualStatus === "수령완료" &&
                              order.completed_at
                            ) {
                              return (
                                <span className="text-xs text-gray-600">
                                  {formatDate(order.completed_at)}
                                </span>
                              );
                            }

                            return "-";
                          })()}
                        </td>

                        {/* 작업 버튼들 */}
                        <td className="py-2 pr-2 text-center w-44" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            {/* 게시물 보기 버튼 */}
                            {(() => {
                              // 주문 ID에서 게시물 키 추출 시도
                              const extractedPostKey = extractPostKeyFromOrderId(
                                order.order_id
                              );
                              const hasPostInfo =
                                order.post_key ||
                                order.post_number ||
                                extractedPostKey;

                              return hasPostInfo;
                            })() ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // 행 클릭 이벤트 방지
                                  openCommentsModal(order);
                                }}
                                className="inline-flex items-center justify-center w-10 h-9 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                                title="게시물 보기"
                              >
                                <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                disabled
                                className="inline-flex items-center justify-center w-10 h-9 text-gray-400 cursor-not-allowed rounded-md"
                                title="게시물 정보 없음"
                              >
                                <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 opacity-50" />
                              </button>
                            )}
                            
                            {/* 편집 버튼 */}
                            {editingOrderId === order.order_id ? (
                              <div className="flex space-x-1 animate-pulse">
                                <button
                                  onClick={() => handleEditSave(order)}
                                  disabled={savingEdit}
                                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-r-md text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105 transition-all duration-200"
                                  title="저장"
                                >
                                  {savingEdit ? '저장중...' : '저장'}
                                </button>
                                <button
                                  onClick={handleEditCancel}
                                  disabled={savingEdit}
                                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105 transition-all duration-200 ml-1"
                                  title="취소"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleEditStart(order)}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors"
                                title="주문 수정"
                              >
                                주문 수정
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* 바코드 옵션 행 - 옵션이 여러 개인 경우만 표시 */}
                      {hasMultipleBarcodeOptions && (
                        <tr className={`${isSelected ? "bg-orange-50" : ""}`}>
                          <td colSpan="13" className="py-2 pr-2">
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

          {/* 페이지네이션 - 검색어가 없을 때만 표시 */}
          {!searchTerm && totalItems > itemsPerPage && (
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
        <div className="fixed flex justify-between items-center bottom-0 left-0 right-0 z-40 p-5 bg-white border-t border-gray-300 shadow-md">
          {/* 왼쪽 영역 - 안내 메시지 */}
          <div className="flex items-center">
            {selectedOrderIds.length === 0 && !isDataLoading && (
              <span className="text-sm text-gray-500 italic">
                항목을 선택하여 일괄 처리하세요
              </span>
            )}
          </div>
          
          {/* 오른쪽 영역 - 총계 및 버튼 */}
          <div className="flex items-center gap-4">
            {/* 총계 표시 */}
            {selectedOrderIds.length > 0 ? (
              <>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">선택 항목</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedOrderIds.length}개 선택됨
                  </span>
                </div>
                <div className="h-10 w-px bg-gray-300"></div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">선택 수량</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedOrderTotals.totalQuantity.toLocaleString()}개
                  </span>
                </div>
                <div className="h-10 w-px bg-gray-300"></div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">선택 금액</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ₩{selectedOrderTotals.totalAmount.toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              displayOrders.length > 0 && (
                <>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">현재 페이지</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {displayOrders.length}개 항목
                    </span>
                  </div>
                  <div className="h-10 w-px bg-gray-300"></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">총 수량</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {currentPageTotalQuantity.toLocaleString()}개
                    </span>
                  </div>
                  <div className="h-10 w-px bg-gray-300"></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">총 금액</span>
                    <span className="text-sm font-semibold text-gray-900">
                      ₩{currentPageTotalAmount.toLocaleString()}
                    </span>
                  </div>
                </>
              )
            )}
            
            {/* 일괄 처리 버튼들 */}
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
        </div>

        {/* --- 주문 상세 모달 (주문 정보 탭 복구) --- */}
        {isDetailModalOpen && selectedOrder && (
          <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl max-w-4xl w-full shadow-xl max-h-[85vh] overflow-hidden flex flex-col">
              {/* 모달 헤더 */}
              <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-200 bg-gray-50 rounded-t-xl flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  {(() => {
                    const productName = getProductNameById(
                      selectedOrder.product_id
                    );
                    const { name, date } = parseProductName(productName);
                    const product = getProductById(selectedOrder.product_id);
                    const primary = selectedOrder.product_pickup_date || product?.pickup_date;
                    const pickupDate = pickEffectivePickupSource(primary, date);
                    const isAvailable =
                      isClient && pickupDate ? isPickupAvailable(pickupDate) : false;

                    return (
                      <div className="flex flex-col">
                        <div
                          className={`${
                            isAvailable ? "text-orange-600 font-bold" : ""
                          }`}
                        >
                          {name}
                        </div>
                        {pickupDate && (
                          <div className="text-sm mt-1 text-gray-500">
                            [{formatPickupKSTLabel(pickupDate)}]
                            {isAvailable && (
                              <span className="ml-1 text-gray-500">✓ 수령가능</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
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
                    {/* 주문 처리 탭 */}
                    <button
                      onClick={() => handleTabChange("processing")}
                      className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${
                        activeTab === "processing"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <SparklesIcon className="w-5 h-5 mr-1.5" /> 주문 처리
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

                    {/* 댓글 보기 탭 */}
                    {selectedOrder.post_number && (
                      <button
                        onClick={() => openCommentsModal(selectedOrder)}
                        className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`}
                      >
                        <ChatBubbleBottomCenterTextIcon className="w-5 h-5 mr-1.5" />
                        댓글 보기
                      </button>
                    )}
                  </div>
                </div>

                {/* 탭 콘텐츠 */}
                <div className="space-y-6">
                  {/* 상태 관리 탭 내용 - 토스 디자인 스타일 */}
                  {activeTab === "status" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* 왼쪽 열 */}
                      <div className="space-y-5">
                        {/* 고객 정보 카드 - 토스 스타일 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <h3 className="text-xs font-semibold text-gray-500 mb-4">고객 정보</h3>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                              <span className="text-xl">👤</span>
                            </div>
                            <div>
                              <p className="text-base font-semibold text-gray-900">{selectedOrder.customer_name}</p>
                              <p className="text-sm text-gray-500 mt-0.5">{selectedOrder.product_names || '2팩'}</p>
                            </div>
                          </div>
                          {selectedOrder.status === 'completed' && (
                            <div className="mt-4 px-3 py-2 bg-green-50 rounded-xl">
                              <p className="text-xs font-semibold text-green-700">✓ 수령 완료</p>
                            </div>
                          )}
                        </div>

                        {/* 바코드 카드 - 토스 스타일 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <h3 className="text-xs font-semibold text-gray-500 mb-4">상품 바코드</h3>
                          <div className="bg-gray-50 rounded-xl p-4">
                            {getProductBarcode(selectedOrder.product_id) ? (
                              <Barcode
                                value={getProductBarcode(selectedOrder.product_id)}
                                width={1.3}
                                height={35}
                                fontSize={10}
                              />
                            ) : (
                              <input
                                type="text"
                                placeholder="바코드를 입력하세요"
                                value={newBarcodeValue}
                                onChange={(e) => setNewBarcodeValue(e.target.value)}
                                className="w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                              />
                            )}
                          </div>
                          {!getProductBarcode(selectedOrder.product_id) && (
                            <button 
                              onClick={() => handleSaveBarcode(selectedOrder.product_id, newBarcodeValue)}
                              disabled={!newBarcodeValue.trim() || isSavingBarcode}
                              className="w-full mt-3 px-4 py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:bg-gray-300"
                            >
                              저장
                            </button>
                          )}
                        </div>

                        {/* 주문 상태 카드 - 토스 스타일 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <h3 className="text-xs font-semibold text-gray-500 mb-4">주문 상태 변경</h3>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => handleStatusChange(selectedOrder.order_id, "주문완료")}
                              className="px-3 py-3 bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-200 transition-all"
                            >
                              주문완료
                            </button>
                            <button 
                              onClick={() => handleStatusChange(selectedOrder.order_id, "주문취소")}
                              className="px-3 py-3 bg-red-100 text-red-700 text-sm font-semibold rounded-xl hover:bg-red-200 transition-all"
                            >
                              주문취소
                            </button>
                            <button 
                              onClick={() => handleStatusChange(selectedOrder.order_id, "확인필요")}
                              className="px-3 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-all"
                            >
                              확인필요
                            </button>
                            <button 
                              onClick={() => handleStatusChange(selectedOrder.order_id, "수령완료")}
                              disabled={selectedOrder.status === '수령완료'}
                              className={`px-3 py-3 text-sm font-semibold rounded-xl transition-all ${
                                selectedOrder.status === '수령완료' 
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              수령완료
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 오른쪽 열 */}
                      <div className="space-y-5">
                        {/* 주문 정보 수정 카드 - 토스 스타일 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <h3 className="text-xs font-semibold text-gray-500 mb-4">주문 정보</h3>
                          
                          <div className="space-y-4">
                            {/* 상품 표시 */}
                            <div>
                              <label className="text-xs font-semibold text-gray-500 mb-2 block">상품</label>
                              <div className="bg-gray-50 rounded-xl px-4 py-3">
                                <span className="text-base font-semibold text-gray-900">
                                  {cleanProductName(getProductNameById(selectedOrder.product_id))}
                                </span>
                              </div>
                            </div>

                            {/* 수량 표시 */}
                            <div>
                              <label className="text-xs font-semibold text-gray-500 mb-2 block">수량</label>
                              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center">
                                <span className="flex-1 text-base font-semibold text-gray-900">
                                  {selectedOrder.quantity}
                                </span>
                                <span className="text-sm text-gray-500">개</span>
                              </div>
                            </div>
                            
                            {/* 단가 표시 */}
                            <div>
                              <label className="text-xs font-semibold text-gray-500 mb-2 block">단가</label>
                              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center">
                                <span className="flex-1 text-base font-semibold text-gray-900">
                                  ₩{(selectedOrder.price || 0).toLocaleString()}
                                </span>
                                <span className="text-sm text-gray-500">원</span>
                              </div>
                            </div>
                            
                            {/* 총 금액 표시 */}
                            <div>
                              <label className="text-xs font-semibold text-gray-500 mb-2 block">총 금액</label>
                              <div className="bg-orange-50 rounded-xl px-4 py-3 flex items-center justify-between border border-orange-200">
                                <span className="text-base font-semibold text-orange-700">
                                  ₩{(selectedOrder.total_amount || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 주문 정보 탭 내용 (복구) */}
                  {activeTab === "info" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {[
                        {
                          label: "상품명",
                          value: (() => {
                            const productName = getProductNameById(
                              selectedOrder.product_id
                            );
                            const { name, date } =
                              parseProductName(productName);
                            const product = getProductById(selectedOrder.product_id);
                            const primary = selectedOrder.product_pickup_date || product?.pickup_date;
                            const pickupDate = pickEffectivePickupSource(primary, date);
                            const isAvailable =
                              isClient && pickupDate
                                ? isPickupAvailable(pickupDate)
                                : false;

                            return (
                              <div className="flex flex-col">
                                <div
                                  className={`${
                                    isAvailable
                                      ? "text-orange-600 font-bold"
                                      : ""
                                  }`}
                                >
                                  {name}
                                </div>
                                {pickupDate && (
                                  <div className="text-sm mt-1 text-gray-500">
                                    [{formatPickupKSTLabel(pickupDate)}]
                                    {isAvailable && (
                                      <span className="ml-1 text-gray-500">✓ 수령가능</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })(),
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
                          // DB에서 직접 가져온 product_pickup_date 사용 (orders 테이블)
                          // 없으면 products 테이블의 pickup_date 사용
                          value: (() => {
                            const product = getProductById(selectedOrder.product_id);
                            const pickupDate = selectedOrder.product_pickup_date || product?.pickup_date;
                            return pickupDate ? formatDate(pickupDate) : "-";
                          })(),
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
                          value: processBandTags(selectedOrder.comment) || (
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
                          value: selectedOrder.quantity + "개",
                          readOnly: true,
                        },
                        {
                          label: "단가 (원)",
                          value: "₩" + (selectedOrder.price || 0).toLocaleString(),
                          readOnly: true,
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
                              disabled={item.readOnly}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 주문 처리 탭 내용 */}
                  {activeTab === "processing" && (
                    <div className="space-y-5">
                      {/* 처리 방법 카드 */}
                      <LightCard padding="p-4">
                        <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                          주문 처리 방법
                        </label>
                        <div className="flex items-center space-x-3">
                          {selectedOrder.processing_method === "pattern" && (
                            <>
                              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircleIcon className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-green-700">
                                  패턴 처리
                                </p>
                                <p className="text-xs text-gray-600">
                                  숫자나 수량 단위가 감지되어 자동
                                  처리되었습니다.
                                </p>
                              </div>
                            </>
                          )}
                          {selectedOrder.processing_method === "ai" && (
                            <>
                              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <SparklesIcon className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-blue-700">
                                  AI 처리
                                </p>
                                <p className="text-xs text-gray-600">
                                  AI가 댓글을 분석하여 주문을 추출했습니다.
                                </p>
                              </div>
                            </>
                          )}
                          {selectedOrder.processing_method === "fallback" && (
                            <>
                              <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                                <ExclamationCircleIcon className="w-5 h-5 text-yellow-600" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-yellow-700">
                                  Fallback 처리
                                </p>
                                <p className="text-xs text-gray-600">
                                  패턴이나 AI로 처리되지 않아 기본값으로
                                  처리되었습니다.
                                </p>
                              </div>
                            </>
                          )}
                          {!selectedOrder.processing_method && (
                            <>
                              <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                <XCircleIcon className="w-5 h-5 text-gray-400" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-500">
                                  처리 방법 없음
                                </p>
                                <p className="text-xs text-gray-600">
                                  처리 방법이 기록되지 않았습니다.
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </LightCard>

                      {/* 패턴 처리 상세 정보 */}
                      {selectedOrder.processing_method === "pattern" && (
                        <LightCard padding="p-4">
                          <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                            패턴 처리 상세
                          </label>
                          <div className="space-y-3">
                            {/* 감지된 패턴 */}
                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                              <span className="text-sm font-medium text-gray-700">
                                감지된 패턴
                              </span>
                              <div className="flex items-center space-x-2">
                                {(() => {
                                  const comment =
                                    processBandTags(selectedOrder.comment) ||
                                    "";
                                  const quantity = selectedOrder.quantity || 1;

                                  // 숫자만 있는 경우 (패턴 1)
                                  if (/^\s*\d+\s*$/.test(comment)) {
                                    return (
                                      <div className="flex items-center space-x-1">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                          숫자 패턴
                                        </span>
                                        <span className="text-sm text-gray-600">
                                          &quot;{comment.trim()}&quot;
                                        </span>
                                      </div>
                                    );
                                  }

                                  // 숫자 + 단위가 있는 경우 (패턴 2)
                                  if (/\d+\s*[가-힣]+/.test(comment)) {
                                    return (
                                      <div className="flex items-center space-x-1">
                                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                          수량 단위
                                        </span>
                                        <span className="text-sm text-gray-600">
                                          &quot;{comment.trim()}&quot;
                                        </span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="flex items-center space-x-1">
                                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                        기타 패턴
                                      </span>
                                      <span className="text-sm text-gray-600">
                                        &quot;{comment.trim()}&quot;
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* 추출된 수량 */}
                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                              <span className="text-sm font-medium text-gray-700">
                                추출된 수량
                              </span>
                              <span className="text-sm text-gray-900 font-semibold">
                                {selectedOrder.quantity}개
                              </span>
                            </div>

                            {/* 처리 속도 */}
                            <div className="flex items-center justify-between py-2">
                              <span className="text-sm font-medium text-gray-700">
                                처리 속도
                              </span>
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-sm text-green-600 font-medium">
                                  즉시 처리
                                </span>
                              </div>
                            </div>
                          </div>
                        </LightCard>
                      )}

                      {/* AI 추출 결과 카드 */}
                      {selectedOrder.processing_method === "ai" &&
                        selectedOrder.ai_extraction_result && (
                          <LightCard padding="p-4">
                            <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                              AI 추출 결과
                            </label>

                            {(() => {
                              try {
                                const aiResult =
                                  typeof selectedOrder.ai_extraction_result ===
                                  "string"
                                    ? JSON.parse(
                                        selectedOrder.ai_extraction_result
                                      )
                                    : selectedOrder.ai_extraction_result;

                                return (
                                  <div className="space-y-4">
                                    {/* 추출된 수량 */}
                                    {aiResult.quantity !== undefined && (
                                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <span className="text-sm font-medium text-gray-700">
                                          추출된 수량
                                        </span>
                                        <span className="text-sm text-gray-900 font-semibold">
                                          {aiResult.quantity}개
                                        </span>
                                      </div>
                                    )}

                                    {/* AI 추론 과정 */}
                                    {aiResult.reason && (
                                      <div>
                                        <span className="text-sm font-medium text-gray-700 block mb-2">
                                          AI 추론 과정
                                        </span>
                                        <div className="bg-gray-50 rounded-md p-3">
                                          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                            {aiResult.reason}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {/* 상품 매칭 정보 */}
                                    {aiResult.productItemNumber && (
                                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <span className="text-sm font-medium text-gray-700">
                                          매칭된 상품 번호
                                        </span>
                                        <span className="text-sm text-gray-900 font-semibold">
                                          #{aiResult.productItemNumber}
                                        </span>
                                      </div>
                                    )}

                                    {/* 가격 정보 */}
                                    {aiResult.actualUnitPrice && (
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between py-1">
                                          <span className="text-sm text-gray-600">
                                            단가
                                          </span>
                                          <span className="text-sm text-gray-900">
                                            {formatCurrency(
                                              aiResult.actualUnitPrice
                                            )}
                                          </span>
                                        </div>
                                        {aiResult.actualTotalPrice && (
                                          <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-2">
                                            <span className="text-sm font-medium text-gray-700">
                                              총 금액
                                            </span>
                                            <span className="text-sm text-gray-900 font-semibold">
                                              {formatCurrency(
                                                aiResult.actualTotalPrice
                                              )}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 처리 상태 */}
                                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                      <span className="text-sm font-medium text-gray-700">
                                        처리 상태
                                      </span>
                                      <div className="flex items-center space-x-2">
                                        {aiResult.isOrder ? (
                                          <>
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span className="text-sm text-green-600 font-medium">
                                              주문 확인
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                            <span className="text-sm text-red-600 font-medium">
                                              주문 아님
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* 모호성 여부 */}
                                    {aiResult.isAmbiguous !== undefined && (
                                      <div className="flex items-center justify-between py-2">
                                        <span className="text-sm font-medium text-gray-700">
                                          모호성 여부
                                        </span>
                                        <div className="flex items-center space-x-2">
                                          {aiResult.isAmbiguous ? (
                                            <>
                                              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                              <span className="text-sm text-yellow-600 font-medium">
                                                모호함
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                              <span className="text-sm text-green-600 font-medium">
                                                명확함
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              } catch (error) {
                                return (
                                  <div className="bg-red-50 rounded-md p-3">
                                    <p className="text-xs text-red-700">
                                      AI 결과 파싱 오류: {error.message}
                                    </p>
                                    <details className="mt-2">
                                      <summary className="text-xs text-red-600 cursor-pointer">
                                        원본 데이터 보기
                                      </summary>
                                      <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap break-all">
                                        {JSON.stringify(
                                          selectedOrder.ai_extraction_result,
                                          null,
                                          2
                                        )}
                                      </pre>
                                    </details>
                                  </div>
                                );
                              }
                            })()}
                          </LightCard>
                        )}

                      {/* 원본 댓글 카드 */}
                      <LightCard padding="p-4">
                        <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                          원본 고객 댓글
                        </label>
                        <div className="bg-gray-50 rounded-md p-3">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                            {processBandTags(selectedOrder.comment) || (
                              <span className="italic text-gray-400">
                                댓글 없음
                              </span>
                            )}
                          </p>
                        </div>
                      </LightCard>

                      {/* 처리 시간 정보 */}
                      <LightCard padding="p-4">
                        <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                          처리 시간 정보
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="text-sm font-medium text-gray-700 block">
                              주문 생성
                            </span>
                            <span className="text-sm text-gray-600">
                              {formatDate(selectedOrder.ordered_at)}
                            </span>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-700 block">
                              처리 소요시간
                            </span>
                            <span className="text-sm text-gray-600">
                              {selectedOrder.ordered_at
                                ? (() => {
                                    const minutes = getTimeDifferenceInMinutes(
                                      selectedOrder.ordered_at
                                    );
                                    if (minutes < 60) {
                                      return `${minutes}분 전`;
                                    } else if (minutes < 1440) {
                                      return `${Math.floor(
                                        minutes / 60
                                      )}시간 전`;
                                    } else {
                                      return `${Math.floor(
                                        minutes / 1440
                                      )}일 전`;
                                    }
                                  })()
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </LightCard>
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
                {/* info, processing 탭일 때 푸터에 빈 공간 유지 (선택사항) */}
                {(activeTab === "info" || activeTab === "processing") && (
                  <div className="w-[130px]"></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 댓글 모달 */}
        <CommentsModal
          isOpen={isCommentsModalOpen}
          onClose={closeCommentsModal}
          postKey={selectedPostForComments?.postKey}
          bandKey={selectedPostForComments?.bandKey}
          postTitle={selectedPostForComments?.productName}
          accessToken={selectedPostForComments?.accessToken}
          postContent={selectedPostForComments?.postContent}
          tryKeyIndex={selectedPostForComments?.tryKeyIndex || 0}
          order={selectedPostForComments?.order}
          onFailover={handleCommentsFailover}
        />

        {/* 토스트 알림 컨테이너 */}
        <ToastContainer toasts={toasts} hideToast={hideToast} />
      </main>
    </div>
  );
}

// 바코드 옵션 선택 컴포넌트
function BarcodeOptionSelector({ order, product, onOptionChange }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const isCompleted = order.status === "수령완료";

  // 바코드 옵션이 있는지 확인
  const barcodeOptions = useMemo(
    () => product?.barcode_options?.options || [],
    [product?.barcode_options?.options]
  );
  const hasOptions = barcodeOptions.length > 1; // 기본 옵션 외에 다른 옵션이 있는지

  // AI가 매칭한 옵션과 바코드 옵션을 매칭하는 함수
  const findMatchingBarcodeOption = (aiSelectedOption, customerComment) => {
    if (!aiSelectedOption && !customerComment) return null;

    // 매칭 키워드 정의
    const matchingKeywords = {
      반통: ["반통", "반"],
      "1통": ["1통", "한통", "일통", "1개", "한개"],
      "2통": ["2통", "두통", "이통", "2개", "두개"],
      "3통": ["3통", "세통", "삼통", "3개", "세개"],
      "4통": ["4통", "네통", "사통", "4개", "네개"],
      "5통": ["5통", "다섯통", "오통", "5개", "다섯개"],
      "1개": ["1개", "한개", "일개"],
      "2개": ["2개", "두개", "이개"],
      "3개": ["3개", "세개", "삼개"],
      "1팩": ["1팩", "한팩", "일팩"],
      "2팩": ["2팩", "두팩", "이팩"],
      "1박스": ["1박스", "한박스", "일박스"],
      "2박스": ["2박스", "두박스", "이박스"],
      "1세트": ["1세트", "한세트", "일세트"],
      "2세트": ["2세트", "두세트", "이세트"],
    };

    // 1. AI가 선택한 옵션과 바코드 옵션 직접 매칭
    if (aiSelectedOption) {
      const aiOption = aiSelectedOption.toLowerCase();
      const matchedOption = barcodeOptions.find((option) => {
        const optionName = option.name.toLowerCase();
        return optionName.includes(aiOption) || aiOption.includes(optionName);
      });
      if (matchedOption) {
        console.log(
          `[바코드 옵션] AI 매칭: "${aiSelectedOption}" → "${matchedOption.name}"`
        );
        return matchedOption;
      }
    }

    // 2. 고객 댓글과 바코드 옵션 키워드 매칭
    if (customerComment) {
      const comment = customerComment.toLowerCase();

      for (const [optionKey, keywords] of Object.entries(matchingKeywords)) {
        // 댓글에 해당 키워드가 포함되어 있는지 확인
        const hasKeyword = keywords.some((keyword) =>
          comment.includes(keyword)
        );
        if (hasKeyword) {
          // 바코드 옵션에서 해당 키워드를 포함한 옵션 찾기
          const matchedOption = barcodeOptions.find((option) => {
            const optionName = option.name.toLowerCase();
            return keywords.some((keyword) => optionName.includes(keyword));
          });
          if (matchedOption) {
            console.log(
              `[바코드 옵션] 댓글 매칭: "${customerComment}" → "${matchedOption.name}"`
            );
            return matchedOption;
          }
        }
      }
    }

    return null;
  };

  // 초기 선택값 설정 (우선순위: 저장된 선택값 > AI 매칭 > 메인 옵션)
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
      // 🔥 AI가 매칭한 옵션을 기본값으로 설정
      const aiMatchedOption = findMatchingBarcodeOption(
        order.ai_extraction_result?.selectedOption,
        order.comment
      );

      if (aiMatchedOption) {
        setSelectedOption(aiMatchedOption);
      } else {
        // AI 매칭 실패 시 기본값은 메인 옵션
        const mainOption = barcodeOptions.find((opt) => opt.is_main);
        setSelectedOption(mainOption || barcodeOptions[0]);
      }
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
              className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                isCompleted ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } transition-all text-sm ${
                selectedOption?.barcode === option.barcode
                  ? "border-blue-400 bg-blue-100 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`barcode-option-${order.order_id}`}
                checked={selectedOption?.barcode === option.barcode}
                disabled={isCompleted}
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
