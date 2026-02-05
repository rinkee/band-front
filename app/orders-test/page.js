"use client";

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback, startTransition } from "react"; // React Fragment 사용을 위해 React 추가
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Date Picker 라이브러리 및 CSS 임포트
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale"; // 한국어 로케일

// Global style for datepicker z-index
const datePickerStyle = `
  .react-datepicker-popper {
    z-index: 9999 !important;
  }
  .react-datepicker__close-icon {
    display: none;
  }
`;

import { api } from "../lib/fetcher";
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트 import 추가
import getAuthedClient from "../lib/authedSupabaseClient";
import JsBarcode from "jsbarcode";
import { useCommentOrdersClient, useCommentOrderClientMutations } from "../hooks";
import { useOrdersClient, useOrderClientMutations } from "../hooks/useOrdersClient";
import { StatusButton } from "../components/StatusButton"; // StatusButton 다시 임포트
import { useSWRConfig } from "swr";
import useSWR from "swr";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction"; // execution_locks 확인 기능 활성화된 버튼
import ErrorCard from "../components/ErrorCard";
import TestUpdateButton from "../components/TestUpdateButton"; // 테스트 업데이트 버튼
import { useScroll } from "../context/ScrollContext"; // <<< ScrollContext 임포트
import CommentsModal from "../components/Comments"; // 댓글 모달 import
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import FilterIndicator from "../components/FilterIndicator"; // 필터 상태 표시 컴포넌트
import { calculateDaysUntilPickup } from "../lib/band-processor/shared/utils/dateUtils"; // 날짜 유틸리티
import { syncOrdersToIndexedDb } from "../lib/indexedDbSync";

const ORDER_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MANUAL_SEARCH_REFRESH_MIN_INTERVAL_MS = 800;
const MANUAL_SEARCH_COOLDOWN_ALERT_MIN_INTERVAL_MS = 2500;

const readGlobalStatsCache = (cacheKey) => {
  if (!cacheKey || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = parsed?.savedAt;
    if (!savedAt || Date.now() - savedAt > ORDER_STATS_CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed?.data ?? null;
  } catch (error) {
    console.warn("[글로벌 통계] 캐시 읽기 실패:", error);
    return null;
  }
};

const writeGlobalStatsCache = (cacheKey, data) => {
  if (!cacheKey || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ data, savedAt: Date.now() })
    );
  } catch (error) {
    console.warn("[글로벌 통계] 캐시 쓰기 실패:", error);
  }
};
import {
  clearOrdersTestProductsCache,
  readOrdersTestProductsByBandPostCache,
  readOrdersTestProductsByPostKeyCache,
  writeOrdersTestProductsCache,
} from "../lib/ordersTestProductsCache";

const OrdersSearchBar = forwardRef(function OrdersSearchBar(
  {
    initialSearchType = "customer",
    onSearchTypeChange,
    searchInputRef,
    isDataLoading,
    isSyncing,
    onSearch,
    onClearSearch,
    onSyncNow,
    onClearInput,
    onRefreshOrders,
    onMutateProducts,
    totalItems,
    userFunctionNumber,
    onKeyStatusChange,
    onProcessingChange,
  },
  ref
) {
  const [searchType, setSearchType] = useState(initialSearchType);
  const [showSearchMore, setShowSearchMore] = useState(false);
  const dropdownRef = useRef(null);
  const moreButtonRef = useRef(null);

  useEffect(() => {
    if (!showSearchMore) return;
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(event.target)
      ) {
        setShowSearchMore(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSearchMore]);

  const applySearchType = useCallback(
    (nextType) => {
      setSearchType(nextType);
      if (typeof onSearchTypeChange === "function") {
        onSearchTypeChange(nextType);
      }
    },
    [onSearchTypeChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      setSearchType: (nextType) => {
        applySearchType(nextType);
      },
    }),
    [applySearchType]
  );

  return (
    <div className="sticky top-0 z-50 bg-gray-200 px-4 lg:px-6 pb-4 mt-6">
      <div>
        <div className="w-full px-3 md:px-4 py-3 bg-white border border-gray-200 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <div className="relative flex items-center flex-1 lg:flex-none lg:w-[500px] border border-gray-300 rounded-lg bg-white overflow-visible min-w-0">
              <div className="flex items-center bg-gray-100 px-1 py-1 flex-shrink-0">
                <div className="flex items-center border-gray-200 bg-gray-100 p-1 text-sm lg:text-base">
                  <label
                    className={`cursor-pointer select-none rounded-md px-2 lg:px-3 py-1 transition whitespace-nowrap ${
                      searchType === "customer"
                        ? "bg-black text-white shadow-sm font-semibold"
                        : "text-gray-800 hover:text-gray-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchType"
                      checked={searchType === "customer"}
                      onChange={() => applySearchType("customer")}
                      disabled={isDataLoading}
                      className="sr-only"
                    />
                    <span className="text-xs lg:text-base">고객명</span>
                  </label>
                  <label
                    className={`cursor-pointer select-none rounded-md px-2 lg:px-3 py-1 transition whitespace-nowrap ${
                      searchType === "product"
                        ? "bg-black text-white shadow-sm font-semibold"
                        : "text-gray-800 hover:text-gray-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchType"
                      checked={searchType === "product"}
                      onChange={() => applySearchType("product")}
                      disabled={isDataLoading}
                      className="sr-only"
                    />
                    <span className="text-xs lg:text-base">상품명</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowSearchMore(!showSearchMore)}
                    ref={moreButtonRef}
                    className="hidden sm:inline-block ml-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    ▼
                  </button>
                </div>
              </div>

              {showSearchMore && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 top-full mt-2 w-40 rounded-md border border-gray-200 bg-white shadow-lg z-[70]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      applySearchType("comment");
                      setShowSearchMore(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      searchType === "comment" ? "bg-gray-100 font-semibold" : ""
                    }`}
                  >
                    댓글내용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applySearchType("post_key");
                      setShowSearchMore(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      searchType === "post_key" ? "bg-gray-100 font-semibold" : ""
                    }`}
                  >
                    post_key
                  </button>
                </div>
              )}

              <div className="relative flex-1 min-w-0">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={
                    searchType === "product"
                      ? "상품명으로 검색하세요"
                      : searchType === "comment"
                        ? "댓글내용으로 검색하세요"
                        : searchType === "post_key"
                          ? "post_key로 검색하세요"
                          : "고객명으로 검색하세요"
                  }
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                  className="w-full pl-2 pr-7 py-2 text-sm lg:pl-3 lg:py-3 lg:text-base border-0 focus:outline-none focus:ring-0 bg-transparent"
                  disabled={isDataLoading}
                />
                <button
                  type="button"
                  onClick={onClearInput}
                  className="absolute inset-y-0 right-0 flex items-center pr-2"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
                    <XMarkIcon className="w-4 h-4" />
                  </span>
                </button>
              </div>
            </div>

            <button
              onClick={onSearch}
              className="flex-shrink-0 px-3 lg:px-5 py-2 lg:py-3 text-sm lg:text-base font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 whitespace-nowrap"
              disabled={isDataLoading}
            >
              검색
            </button>

            <button
              onClick={onClearSearch}
              className="flex-shrink-0 flex items-center justify-center px-3 lg:px-4 py-2 lg:py-3 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
              title="초기화"
            >
              <ArrowUturnLeftIcon className="w-5 h-5 lg:mr-1" />
              <span className="hidden lg:inline text-sm font-medium">초기화</span>
            </button>

            <button
              onClick={() => onSyncNow({ force: true })}
              disabled={isSyncing}
              className="flex-shrink-0 flex items-center justify-center px-3 lg:px-4 py-2 lg:py-3 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
              title="새로고침"
            >
              <ArrowPathIcon className={`w-5 h-5 lg:mr-1 ${isSyncing ? "animate-spin" : ""}`} />
              <span className="hidden lg:inline text-sm font-medium">새로고침</span>
            </button>
          </div>

          <div className="flex-none flex items-center justify-end">
            {userFunctionNumber === 9 ? (
              <div className="relative group">
                <TestUpdateButton
                  refreshSWRCacheOnComplete={false}
                  onKeyStatusChange={({ keyStatus }) => {
                    if (onKeyStatusChange) onKeyStatusChange(keyStatus);
                  }}
                  onProcessingChange={(isProcessing, result) => {
                    if (onProcessingChange) onProcessingChange(isProcessing, result);
                  }}
                  onComplete={async () => {
                    try {
                      if (onRefreshOrders) await onRefreshOrders();
                    } catch (_) {}
                  }}
                />
              </div>
            ) : (
              <UpdateButton
                pageType="orders"
                totalItems={totalItems}
                onSuccess={async () => {
                  try {
                    if (onRefreshOrders) await onRefreshOrders();
                    if (onMutateProducts) await onMutateProducts();
                  } catch (_) {}
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// --- 아이콘 (Heroicons) ---
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  ArrowLongLeftIcon,
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
  ChevronLeftIcon,
  ChevronRightIcon,
  UserCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowTopRightOnSquareIcon,
  CurrencyDollarIcon,
  XMarkIcon,
  CalendarDaysIcon,
  FunnelIcon,
  CheckIcon,
  CodeBracketIcon,
  ClockIcon,
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

// --- 라이트 테마 카드 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
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
    <div className="flex items-center gap-x-4 md:gap-x-4 gap-y-3 flex-wrap">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-center cursor-pointer group ${disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <div
            onClick={() => !disabled && onChange(option.value)}
            className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-colors mr-2 md:mr-2 flex-shrink-0 ${selectedValue === option.value
              ? "bg-orange-500 border-orange-500"
              : "bg-white border-gray-300 group-hover:border-gray-400"
              } ${disabled ? "!bg-gray-100 !border-gray-200" : ""} `}
          >
            {selectedValue === option.value && (
              <CheckIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
            )}
          </div>
          <span className="flex items-center">
            <span
              className={`text-sm md:text-base ${disabled ? "text-gray-400" : "text-gray-700"
                }`}
            >
              {option.label}
            </span>
            {typeof option.badgeCount === "number" && option.badgeCount > 0 && (
              <span
                className={`ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] md:min-w-[22px] md:h-[22px] px-1 rounded-full text-white text-[11px] md:text-xs leading-none ${option.badgeColor === "blue"
                  ? "bg-blue-500"
                  : option.badgeColor === "yellow"
                    ? "bg-yellow-500 text-gray-900"
                    : "bg-red-500"
                  }`}
              >
                {option.badgeCount.toLocaleString()}
              </span>
            )}
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
function StatusBadge({
  status,
  processingMethod,
  completedAt,
  orderedAt,
  paidAt,
  canceledAt,
}) {
  let bgColor, textColor;
  switch (status) {
    case "수령완료":
      bgColor = "bg-green-100";
      textColor = "text-green-700";
      break;
    case "주문취소":
      bgColor = "bg-red-100";
      textColor = "text-red-700";
      break;
    case "주문완료":
      bgColor = "bg-blue-100";
      textColor = "text-blue-700";
      break;
    case "확인필요":
      bgColor = "bg-gray-800";
      textColor = "text-gray-100";
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
        return <SparklesIcon className="h-2 w-2 xl:h-2.5 xl:w-2.5 mr-1" />;
      case "ai-fallback":
        return <SparklesIcon className="h-2 w-2 xl:h-2.5 xl:w-2.5 mr-1 opacity-60" />;
      case "pattern":
        return <FunnelIcon className="h-2 w-2 xl:h-2.5 xl:w-2.5 mr-1" />;
      case "manual":
        return <PencilIcon className="h-2 w-2 xl:h-2.5 xl:w-2.5 mr-1" />;
      default:
        return null;
    }
  };

  const formatStatusAt = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  };

  const getStatusTimestamp = () => {
    if (status === "수령완료") return completedAt;
    if (status === "주문취소") return canceledAt;
    if (status === "결제완료") return paidAt;
    if (status === "주문완료") return orderedAt;
    return null;
  };

  const statusTimestamp = getStatusTimestamp();

  return (
    <div className="flex flex-col items-center">
      <span
        className={`inline-flex items-center rounded-md px-1.5 xl:px-2 py-0.5 xl:py-1 text-xs xl:text-sm font-medium ${bgColor} ${textColor}`}
      >
        {getProcessingIcon()}
        {status}
      </span>
      {statusTimestamp && (
        <span className="text-[10px] text-gray-500 mt-0.5">
          {formatStatusAt(statusTimestamp)}
        </span>
      )}
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
        if (process.env.NODE_ENV === "development") {
          console.error("Barcode Error:", error);
        }
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
// 모드에 따라 다른 테이블 사용 (raw: comment_orders, legacy: orders)
function OrdersTestPageContent({ mode = "raw" }) {
  // Feature flag: 새로운 통계 바 사용 여부
  const useNewStatsBar = true; // false로 변경하면 기존 UI 사용
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scrollToTop } = useScroll();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const searchInputRef = useRef(null); // 검색 입력 ref (uncontrolled)
  const mainTopRef = useRef(null); // 페이지 최상단 스크롤용 ref

  // 토글 상태 추가
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(""); // 디바운스된 검색어 상태
  const [appliedSearchType, setAppliedSearchType] = useState("customer"); // "customer" | "product" | "post_key"
  const searchTypeRef = useRef("customer");
  const searchBarRef = useRef(null);
  const [postKeySearchNonce, setPostKeySearchNonce] = useState("0");
  const [pendingPostKey, setPendingPostKey] = useState(null); // { postKey, postedAt, ts }
  const [urlPostKeyFilter, setUrlPostKeyFilter] = useState(null);
  const [bandKeyStatus, setBandKeyStatus] = useState("main"); // main | backup
  const [sortBy, setSortBy] = useState(null); // 기본값: 정렬 안함
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterSelection, setFilterSelection] = useState("주문완료"); // 사용자가 UI에서 선택한 값
  const [exactCustomerFilter, setExactCustomerFilter] = useState(null); // <<< 정확한 고객명 필터용 상태 추가
  // 수령가능만 보기 상태 - localStorage에서 복원
  const [showPickupAvailableOnly, setShowPickupAvailableOnly] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('showPickupAvailableOnly');
      return savedState === 'true';
    }
    return false;
  });
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false); // 일괄 상태 변경 로딩 상태
  const hasRecentStatusChangeRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);

  useEffect(() => {
    if (mode === "raw" && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [mode, currentPage]);
  const [products, setProducts] = useState([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState("status");
  const tableContainerRef = useRef(null); // 테이블 컨테이너 스크롤 제어용
  const ENABLE_DETAIL_MODAL = false;

  // 편집 관련 상태들
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [availableProducts, setAvailableProducts] = useState({});

  // statsLoading 제거 - 클라이언트에서 직접 계산하므로 불필요
  const [filterDateRange, setFilterDateRange] = useState("30days");
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [pickupViewMode, setPickupViewMode] = useState("detailed"); // 'simple' | 'detailed'
  const [barcodeViewMode, setBarcodeViewMode] = useState("small"); // 'small' | 'large'
  // 하단 버튼 순서 토글 - localStorage에서 복원
  const [isButtonsReversed, setIsButtonsReversed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orders-buttons-reversed');
      return saved === 'true';
    }
    return false;
  });
  // 현재 날짜 필터의 실제 범위 (카운트에도 동일 적용)
  const dateFilterParams = useMemo(
    () => calculateDateFilterParams(filterDateRange, customStartDate, customEndDate),
    [filterDateRange, customStartDate, customEndDate]
  );

  // --- 주문 정보 수정 관련 상태 복구 ---
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [tempItemNumber, setTempItemNumber] = useState(1);
  const [tempQuantity, setTempQuantity] = useState(1);
  const [tempPrice, setTempPrice] = useState(0);

  // --- 바코드 저장 관련 상태 및 함수 ---
  const [newBarcodeValue, setNewBarcodeValue] = useState("");
  const [isSavingBarcode, setIsSavingBarcode] = useState(false);

  // --- 메모 저장 관련 상태 ---
  const [memoSavingStates, setMemoSavingStates] = useState({}); // { orderId: 'saving' | 'saved' | 'error' }
  const [memoValues, setMemoValues] = useState({}); // { orderId: memoText }
  const [focusedMemoId, setFocusedMemoId] = useState(null); // 현재 포커스된 메모 ID
  const [originalMemoValues, setOriginalMemoValues] = useState({}); // 원본 메모 값 (취소용)

  // --- 댓글 관련 상태 ---
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState(null);

  const CUSTOM_DATE_STORAGE_KEY = "orders-test-custom-date-range";

  // raw 상품 조회용 맵 (post_key 또는 band+post 조합) - sessionStorage에서 복원
  const [postProductsByPostKey, setPostProductsByPostKey] = useState(() => {
    return readOrdersTestProductsByPostKeyCache();
  });
  const [postProductsByBandPost, setPostProductsByBandPost] = useState(() => {
    return readOrdersTestProductsByBandPostCache();
  });
  const [postsImages, setPostsImages] = useState({}); // key: `${band_key}_${post_key}` => [urls]

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

  // 테스트 업데이트 로딩 상태
  const [isTestUpdating, setIsTestUpdating] = useState(false);
  const [testUpdateResult, setTestUpdateResult] = useState(null);

  // 클라이언트 사이드 렌더링 확인 상태
  const [isClient, setIsClient] = useState(false);

  // 안내 모달 상태
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeChecked, setNoticeChecked] = useState(false); // 내용 확인 체크
  const [dontShowAgain, setDontShowAgain] = useState(false); // 다시 보지 않기 체크
  const [isSyncing, setIsSyncing] = useState(false); // 수동 동기화 버튼 로딩 상태
  const [productReloadToken, setProductReloadToken] = useState(0); // 강제 상품 재조회 트리거
  const [initialSyncing, setInitialSyncing] = useState(true); // 첫 진입 동기화 진행 여부
  const [lastSyncAt, setLastSyncAt] = useState(0); // 마지막 동기화 시각 (ms)
  const syncTimeoutRef = useRef(null);
  const timeoutsRef = useRef(new Set());
  const lastManualSearchRefreshAtRef = useRef(0);
  const lastManualSearchCooldownAlertAtRef = useRef(0);

  const warnSearchCooldown = useCallback(() => {
    const now = Date.now();
    if (now - lastManualSearchCooldownAlertAtRef.current < MANUAL_SEARCH_COOLDOWN_ALERT_MIN_INTERVAL_MS) {
      return;
    }
    lastManualSearchCooldownAlertAtRef.current = now;
    if (typeof window !== "undefined") {
      alert("검색을 너무 빠르게 반복하고 있어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    showError("검색을 너무 빠르게 반복하고 있어요. 잠시 후 다시 시도해주세요.");
  }, [showError]);

  const setSafeTimeout = useCallback((fn, delayMs) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, delayMs);
    timeoutsRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const id of timeouts) {
        clearTimeout(id);
      }
      timeouts.clear();
    };
  }, []);

  // 클라이언트 사이드 렌더링 확인
  useEffect(() => {
    setIsClient(true);

    // localStorage에서 "다시 보지 않기" 확인
    const dontShowAgain = localStorage.getItem('orderNoticeConfirmed');
    if (!dontShowAgain) {
      setShowNoticeModal(true); // 저장된 값이 없으면 모달 표시
    }
  }, []);

  // 직접 선택한 기간 로컬스토리지 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CUSTOM_DATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.start) return;
      const start = new Date(parsed.start);
      const end = parsed?.end ? new Date(parsed.end) : null;
      if (isNaN(start.getTime())) return;
      setCustomStartDate(start);
      setCustomEndDate(end && !isNaN(end.getTime()) ? end : null);
      setFilterDateRange("custom");
    } catch (_) {
      // ignore parse errors
    }
  }, []);

  // 직접 선택 기간 저장 (custom일 때만 유지)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (filterDateRange === "custom" && customStartDate) {
      localStorage.setItem(
        CUSTOM_DATE_STORAGE_KEY,
        JSON.stringify({
          start: customStartDate.toISOString(),
          end: customEndDate ? customEndDate.toISOString() : null,
        })
      );
    } else {
      localStorage.removeItem(CUSTOM_DATE_STORAGE_KEY);
    }
  }, [filterDateRange, customStartDate, customEndDate]);

  // URL에서 postKey를 받아서 대기 상태로 저장
  const replaceUrlSearchParams = useCallback((mutator) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (typeof mutator === "function") {
        mutator(url.searchParams);
      }
      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;
      startTransition(() => {
        router.replace(next, { scroll: false });
      });
    } catch (_) {
      // ignore
    }
  }, [router]);

  const stripOrdersTestNavParams = useCallback(() => {
    replaceUrlSearchParams((sp) => {
      sp.delete("postKey");
      sp.delete("post_key");
      sp.delete("postedAt");
      sp.delete("ts");
    });
  }, [replaceUrlSearchParams]);

  const urlPostKeyParam = searchParams.get('postKey') || searchParams.get('post_key');
  const urlPostedAtParam = searchParams.get('postedAt');
  const urlTsParam = searchParams.get('ts');

  useEffect(() => {
    const postKey = urlPostKeyParam;
    if (!postKey) return;
    const postedAt = urlPostedAtParam || null;
    const ts = urlTsParam || null;

    // 같은 postKey라도 ts가 바뀌면 SWR 키가 바뀌도록 (뒤로가기 후 재진입 포함)
    if (ts) {
      setPostKeySearchNonce(ts);
    } else {
      setPostKeySearchNonce(String(Date.now()));
    }

    setPendingPostKey({ postKey, postedAt, ts });
  }, [urlPostKeyParam, urlPostedAtParam, urlTsParam]);

  // 초기 동기화 완료 후 postKey 검색 적용
  useEffect(() => {
    if (initialSyncing) return;
    if (!pendingPostKey) return;

    const postKey = pendingPostKey.postKey;
    const postedAt = pendingPostKey.postedAt;
    if (postKey) {
      // 검색어 설정
      setSearchTerm(postKey);
      setUrlPostKeyFilter(postKey);
      searchTypeRef.current = "post_key";
      setAppliedSearchType("post_key");
      if (searchBarRef.current?.setSearchType) {
        searchBarRef.current.setSearchType("post_key");
      }

      // 검색 인풋에 값 설정 (여러 번 시도하여 확실하게 설정)
      const setInputValue = () => {
        if (searchInputRef.current) {
          searchInputRef.current.value = postKey;
          console.log('검색 인풋에 postKey 설정:', postKey);
        }
      };

      setInputValue(); // 즉시 실행
      setSafeTimeout(setInputValue, 0); // 다음 틱에 실행
      setSafeTimeout(setInputValue, 100); // 100ms 후 실행
      setSafeTimeout(setInputValue, 300); // 300ms 후 실행

      // 상태를 "전체"로 변경
      setFilterSelection("all");

      // 게시일 기준으로 조회 기간 자동 설정
      if (postedAt) {
        try {
          const postedDate = new Date(postedAt);
          const today = new Date();
          const diffTime = Math.abs(today - postedDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // 일수 차이에 따라 조회 기간 설정
          if (diffDays <= 30) {
            setFilterDateRange("30days");
          } else if (diffDays <= 60) {
            setFilterDateRange("60days");
          } else if (diffDays <= 90) {
            setFilterDateRange("90days");
          } else if (diffDays <= 180) {
            setFilterDateRange("180days");
          } else {
            setFilterDateRange("all");
          }
        } catch (e) {
          // 날짜 파싱 실패 시 기본값 유지
          console.error("Failed to parse postedAt:", e);
        }
      } else {
        // postedAt이 없으면 기간 제한 없이 조회
        setFilterDateRange("all");
        setCustomStartDate(null);
        setCustomEndDate(null);
      }

      setCurrentPage(1);
      setExactCustomerFilter(null);
      setSelectedOrderIds([]);

      // URL에서 파라미터 즉시 제거 (다른 검색 동작을 방해하지 않도록)
      stripOrdersTestNavParams();
    }
    setPendingPostKey(null);
  }, [pendingPostKey, initialSyncing, stripOrdersTestNavParams, setSafeTimeout]);

  // 동기화 타임아웃 (10초 무응답 시 오류 카드 표출)
  useEffect(() => {
    if (!(isSyncing || initialSyncing)) {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      return;
    }
    const timer = setTimeout(() => {
      setError("동기화 응답이 없습니다. 새로고침하거나 백업 페이지에서 계속 작업해주세요.");
      setIsSyncing(false);
      setInitialSyncing(false);
    }, 10_000);
    syncTimeoutRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (syncTimeoutRef.current === timer) {
        syncTimeoutRef.current = null;
      }
    };
  }, [isSyncing, initialSyncing]);

  // comment_orders -> legacy orders shape 매핑
  const mapCommentOrderToLegacy = useCallback((row) => {
    return {
      // 핵심 식별자 및 기본 정보
      order_id: String(row.comment_order_id ?? row.id ?? row.order_id ?? crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`),
      customer_name: row.commenter_name || row.customer_name || "-",
      comment: row.comment_body || row.comment || "",
      comment_change: row.comment_change || row.commentChange || null,
      status: row.order_status || row.status || "주문완료",
      sub_status: row.sub_status || undefined,
      ordered_at: row.ordered_at || row.comment_created_at || row.created_at || null,
      paid_at: row.paid_at || null,
      updated_at: row.updated_at || row.modified_at || row.updatedAt || row.updated_at || null,
      completed_at: row.received_at || row.completed_at || null,
      canceled_at: row.canceled_at || null,
      processing_method: "raw",

      // 상품 관련
      product_id: row.selected_product_id || row.product_id || null,
      product_name: row.product_name || null,

      // 게시물/댓글 식별
      post_key: row.post_key || null,
      post_number: row.post_number != null ? String(row.post_number) : null,
      band_key: row.band_key || null,
      band_number: row.band_number != null ? row.band_number : null,
      comment_key: row.comment_key || row.commentKey || null,

      // 기타 UI가 참조하는 필드들 (없으면 안전한 기본값)
      memo: row.memo || null,
    };
  }, []);

  // 클라이언트 필터링 최소화 (서버에서 처리 불가능한 것만)
  const displayOrders = useMemo(() => {
    const toKstYmdLocal = (dateInput) => {
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
      } catch (_) { return null; }
    };

    const isAvailableLocal = (dateInput) => {
      if (!dateInput) return false;
      const now = new Date();
      const KST_OFFSET = 9 * 60 * 60 * 1000;
      const k = new Date(now.getTime() + KST_OFFSET);
      const todayYmd = k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate();
      const ymd = toKstYmdLocal(dateInput);
      return ymd ? todayYmd >= ymd : false;
    };

    let arr = orders || [];

    // 헬퍼 함수: 주문의 pickup_date 가져오기
    const getOrderPickupDate = (o) => {
      const pk = o.post_key || o.postKey;
      const band = o.band_number || o.bandNumber || o.band_key || o.bandKey;
      const postNum = o.post_number ?? o.postNumber;

      let list = [];
      if (pk && postProductsByPostKey[pk]) {
        list = postProductsByPostKey[pk];
      } else if (band != null && postNum != null) {
        const k = `${band}_${String(postNum)}`;
        if (postProductsByBandPost[k]) {
          list = postProductsByBandPost[k];
        }
      }

      let displayProd = null;
      if (o.product_id && Array.isArray(list)) {
        displayProd = list.find(p => p.product_id === o.product_id);
      }
      if (!displayProd && Array.isArray(list)) {
        displayProd = list[0];
      }

      return displayProd?.pickup_date || null;
    };

    // 수령가능 필터링은 이제 서버 RPC 함수에서 처리됨 (pickupAvailable 파라미터)
    // 클라이언트 필터링 불필요

    // 미수령, 확인필요는 서버에서 sub_status로 필터링됨 (클라이언트 필터링 불필요)

    return arr;
  }, [orders, postProductsByPostKey, postProductsByBandPost]);

  const calculateStats = useCallback((dataArray) => {
    if (!dataArray || dataArray.length === 0) {
      return {
        totalOrders: 0,
        statusCounts: {},
        subStatusCounts: {},
      };
    }

    const statusCounts = {};
    const subStatusCounts = {};

    dataArray.forEach(order => {
      const status = order.status || '';
      const subStatus = order.sub_status || '';

      // 상태별 카운트
      if (status) {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      // 서브상태별 카운트
      if (subStatus) {
        subStatusCounts[subStatus] = (subStatusCounts[subStatus] || 0) + 1;
      }
    });

    return {
      totalOrders: dataArray.length,
      statusCounts,
      subStatusCounts,
    };
  }, []);

  // 전체 통계 계산 (필터 무관, 원본 orders 데이터 기반)
  const allStats = useMemo(
    () => calculateStats(orders),
    [calculateStats, orders]
  );

  // 필터링된 통계 계산 (현재 필터 적용된 displayOrders 기반)
  const clientStats = useMemo(
    () => calculateStats(displayOrders),
    [calculateStats, displayOrders]
  );

  const unreceivedCount =
    clientStats.subStatusCounts?.["미수령"] ||
    allStats.subStatusCounts?.["미수령"] ||
    0;

  // 그룹 키: 주문 단위로만 선택되도록 order_id를 1차 키로 사용
  const getGroupKey = useCallback((o) => {
    const orderId = o.order_id || o.comment_order_id || o.id;
    if (orderId) return String(orderId);

    // 안전장치: order_id가 없을 경우 충돌을 최대한 피하기 위해 여러 필드를 결합
    const band = o.band_key ?? (o.band_number != null ? String(o.band_number) : "");
    const post =
      o.post_key ||
      o.postKey ||
      (o.post_number != null ? String(o.post_number) : "") ||
      (o.postNumber != null ? String(o.postNumber) : "");
    const commentKey = o.comment_key || o.commentKey || "";
    const commenter = o.commenter_name || o.customer_name || "";
    const comment = o.comment_body || o.comment || "";
    const orderedAt = o.ordered_at || o.comment_created_at || o.created_at || "";
    const updatedAt = o.updated_at || o.modified_at || o.updatedAt || "";

    return JSON.stringify({
      band,
      post,
      commentKey,
      commenter,
      comment,
      orderedAt,
      updatedAt,
    });
  }, []);

  // 대표행 그룹 목록 계산
  const allGroupedOrders = useMemo(() => {
    const map = new Map();
    for (const o of displayOrders) {
      const key = getGroupKey(o);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    const groups = [];
    const getOrderedAtTime = (order) =>
      order?.ordered_at ? new Date(order.ordered_at).getTime() : 0;
    for (const [key, rows] of map.entries()) {
      // 대표행 선택: ordered_at 최소값 기준 (정렬 없이 O(n))
      let rep = rows[0];
      let minTime = rep ? getOrderedAtTime(rep) : Infinity;
      for (let i = 1; i < rows.length; i++) {
        const candidate = rows[i];
        const t = getOrderedAtTime(candidate);
        if (t < minTime) {
          minTime = t;
          rep = candidate;
        }
      }
      groups.push({ groupId: key, rows, rep, orderIds: rows.map(r => r.order_id) });
    }
    // 정렬이 비활성화되면 원본 순서 유지
    if (!sortBy) {
      return groups;
    }

    // 정렬은 대표행 기준으로 수행 (pickup_date 정렬 비활성화)
    return groups.sort((g1, g2) => {
      const currentSort = sortBy === 'pickup_date' ? 'ordered_at' : sortBy;
      let val1, val2;

      if (currentSort === 'customer_name') {
        val1 = (g1.rep?.customer_name || g1.rep?.commenter_name || '').toLowerCase();
        val2 = (g2.rep?.customer_name || g2.rep?.commenter_name || '').toLowerCase();
        const result = val1.localeCompare(val2);
        return sortOrder === 'asc' ? result : -result;
      } else if (currentSort === 'ordered_at') {
        val1 = g1.rep?.ordered_at ? new Date(g1.rep.ordered_at).getTime() : 0;
        val2 = g2.rep?.ordered_at ? new Date(g2.rep.ordered_at).getTime() : 0;
        return sortOrder === 'asc' ? (val1 - val2) : (val2 - val1);
      }

      // 기본값: 정렬 안함
      return 0;
    });
  }, [displayOrders, getGroupKey, sortBy, sortOrder, postProductsByPostKey, postProductsByBandPost]);

  // 서버 페이지네이션 사용 (클라이언트 페이지네이션 제거)
  const groupedOrders = useMemo(() => {
    // 서버에서 이미 페이지네이션된 데이터를 그대로 사용
    return allGroupedOrders;
  }, [allGroupedOrders]);

  // comment_orders에 맞는 상품 배치 조회 (orders 페이지의 raw 로직 참고)
  // NOTE: ordersData 선언 이후에 위치해야 TDZ 에러가 발생하지 않음

  // 행에서 상품 후보 리스트 얻기
  const getCandidateProductsForOrder = useCallback((order) => {
    const pk = order.post_key || order.postKey;
    const band = order.band_number || order.bandNumber || order.band_key || order.bandKey;
    const postNum = order.post_number ?? order.postNumber;
    let list = [];
    if (pk && postProductsByPostKey[pk]) list = postProductsByPostKey[pk];
    else if (band != null && postNum != null) {
      const k = `${band}_${String(postNum)}`;
      if (postProductsByBandPost[k]) list = postProductsByBandPost[k];
    }
    return Array.isArray(list) ? list : [];
  }, [postProductsByPostKey, postProductsByBandPost]);

  // --- 현재 페이지 총 수량/금액 계산 제거 (사용 안함) ---
  const checkbox = useRef();

  const { mutate: globalMutate } = useSWRConfig(); //

  const dateRangeOptions = [
    { value: "90days", label: "3개월" },
    { value: "30days", label: "1개월" },
    { value: "7days", label: "1주" },
    { value: "today", label: "오늘" },
  ];

  // SWR 옵션 설정 - 데이터 최신화 우선
  const swrOptions = useMemo(() => ({
    revalidateOnMount: true, // 첫 진입 시에는 반드시 서버 검증
    revalidateOnFocus: false, // 서버 보호: 포커스 자동 재호출 OFF (수동 새로고침/업데이트로만)
    revalidateOnReconnect: false, // 서버 보호: 재연결 시 자동 재호출 OFF
    revalidateIfStale: false, // 서버 보호: stale 자동 재호출 OFF
    refreshInterval: 0, // 자동 주기 새로고침은 유지하지 않음
    dedupingInterval: 10000, // 서버 보호: 중복 요청 방지 간격 확대
    shouldRetryOnError: false, // 서버 보호: 자동 재시도 OFF (폭주 방지)
    errorRetryCount: 0,
    onError: (err) => {
      if (process.env.NODE_ENV === "development") {
        console.error("SWR Error:", err);
      }
    },
    keepPreviousData: true, // 깜빡임 방지
    fallbackData: undefined, // fallback 없음 (캐시 우선)
  }), []);
  // 서버 사이드 필터링 + 진짜 페이지네이션 (효율적 데이터 로딩)
  const ordersFilters = useMemo(() => {
    const dateParams = calculateDateFilterParams(
      filterDateRange,
      customStartDate,
      customEndDate
    );

    const normalizedSearchTerm = (searchTerm || "").trim();
    const isPostKeySearch = appliedSearchType === "post_key";
    const resolvedPostKey = urlPostKeyFilter || (isPostKeySearch ? (normalizedSearchTerm || undefined) : undefined);
    const resolvedSearch = resolvedPostKey ? undefined : (normalizedSearchTerm || undefined);
    const resolvedSearchType = resolvedSearch
      ? (isPostKeySearch ? "combined" : appliedSearchType)
      : undefined;

    console.log('🔑 [ordersFilters] searchTerm:', searchTerm, '-> postKey:', resolvedPostKey);

    // 수령가능만 보기 필터 활성화 여부
    const isPickupAvailable = showPickupAvailableOnly || filterSelection === "주문완료+수령가능";

    return {
      limit: 30, // 한 페이지에 30개씩 기본 제한
      // 서버 보호 모드: legacy(get_orders)에서는 총건수(count) 호출을 생략하고 "더보기/다음" UX로 대체
      includeCount: false,
      sortBy,
      sortOrder,
      // 수령가능만 보기 필터 (RPC 함수 사용)
      pickupAvailable: isPickupAvailable,
      // 서버에서 필터링 가능한 항목들
      status: (() => {
        // '주문완료+수령가능'은 주문완료로 필터링
        if (filterSelection === "주문완료+수령가능") return "주문완료";
        // 미수령, 확인필요, none은 subStatus로 필터링하므로 status는 undefined
        if (filterSelection === "미수령" || filterSelection === "확인필요" || filterSelection === "none") {
          return undefined;
        }
        // all이면 전체
        if (filterSelection === "all") return undefined;
        // 그 외는 해당 상태로 필터링
        return filterSelection;
      })(),
      subStatus: (() => {
        if (filterSelection === "미수령") return "미수령";
        if (filterSelection === "확인필요") return "확인필요";
        if (filterSelection === "none") return "none";
        return undefined;
      })(),
      // post_key 전용 검색이면 postKey로 직접 필터링
      postKey: resolvedPostKey,
      // post_key가 아닐 때만 일반 검색어로 처리
      search: resolvedSearch,
      searchType: resolvedSearchType, // "customer" | "product"
      searchNonce: postKeySearchNonce,
      commenterExact: mode === "raw" ? (exactCustomerFilter || undefined) : undefined,
      exactCustomerName: mode === "legacy" ? (exactCustomerFilter || undefined) : undefined,
      // 날짜 필터
      startDate: dateParams.startDate,
      endDate: dateParams.endDate,
    };
  }, [sortBy, sortOrder, filterSelection, searchTerm, appliedSearchType, mode, exactCustomerFilter, filterDateRange, customStartDate, customEndDate, showPickupAvailableOnly, postKeySearchNonce, urlPostKeyFilter]);

  const isRawMode = mode === "raw";

  // raw 모드는 페이지네이션 없이 1페이지 고정
  const effectivePage = isRawMode ? 1 : currentPage;

  const shouldFetchOrders = !!userData?.userId && (
    !pendingPostKey ? true : (!initialSyncing && !!urlPostKeyFilter)
  );

  const rawOrdersResult = useCommentOrdersClient(
    mode === "raw" && shouldFetchOrders ? userData?.userId : null,
    effectivePage,
    ordersFilters,
    swrOptions
  );

  const legacyOrdersResult = useOrdersClient(
    mode === "legacy" && shouldFetchOrders ? userData?.userId : null,
    effectivePage,
    ordersFilters,
    swrOptions
  );

  const {
    data: ordersData,
    error: ordersError,
    isLoading: isOrdersLoading,
    isValidating: isOrdersValidating,
    mutate: mutateOrders,
  } = mode === "raw" ? rawOrdersResult : legacyOrdersResult;

  // 주문 리스트 재검증을 단일 채널로 관리 (동시에 여러 번 호출되는 것 방지)
  const refreshOrdersInFlight = useRef(null);
  const refreshOrders = useCallback(async ({ force = false } = {}) => {
    if (refreshOrdersInFlight.current) return refreshOrdersInFlight.current;
    const promise = mutateOrders(undefined, { revalidate: true, dedupe: !force }).finally(() => {
      refreshOrdersInFlight.current = null;
    });
    refreshOrdersInFlight.current = promise;
    return promise;
  }, [mutateOrders]);

  // 상태 변경 직후 필터 전환 시 1회만 재조회하여 누락 방지
  useEffect(() => {
    if (!hasRecentStatusChangeRef.current) return;
    hasRecentStatusChangeRef.current = false;
    refreshOrders({ force: true });
  }, [filterSelection, showPickupAvailableOnly, refreshOrders]);

  // 주문 보기(postKey)는 SWR 키 변경으로 1회만 호출

  // 서버 페이지네이션 데이터 사용
  const totalItems = ordersData?.pagination?.totalItems ?? null;
  const totalPages = ordersData?.pagination?.totalPages ?? null;
  const hasMore = ordersData?.pagination?.hasMore ?? false;
  const isTotalCountKnown = typeof totalItems === "number" && Number.isFinite(totalItems);
  const showPagination = !isRawMode && (
    isTotalCountKnown
      ? totalItems > itemsPerPage
      : currentPage > 1 || hasMore
  );

  // 메모 디버깅
  useEffect(() => {
    if (ordersData?.data && ordersData.data.length > 0) {
      const firstOrder = ordersData.data[0];
      console.log('[메모 디버깅] 첫 번째 주문 데이터:', {
        order_id: firstOrder.order_id,
        memo: firstOrder.memo,
        hasMemoField: 'memo' in firstOrder,
        allKeys: Object.keys(firstOrder).filter(k => k.includes('memo'))
      });
    }
  }, [ordersData]);

  // comment_change 디버깅
  useEffect(() => {
    if (ordersData?.data && ordersData.data.length > 0) {
      const sample = ordersData.data.slice(0, 5).map((o) => ({
        order_id: o.order_id,
        comment: o.comment,
        comment_change: o.comment_change,
      }));
      console.log('[comment_change 디버깅] 샘플 5개:', sample);
    }
  }, [ordersData?.data]);

  // 주문 데이터의 시그니처 (주문 ID 조합) - 실제 내용 기반
  const ordersSignature = useMemo(() => {
    if (!ordersData?.data || ordersData.data.length === 0) {
      return 'empty';
    }
    // 주문 ID와 post_key 조합으로 시그니처 생성
    const ids = ordersData.data
      .map(o => `${o.order_id || ''}_${o.post_key || o.postKey || ''}`)
      .sort()
      .join(',');
    return ids;
  }, [ordersData?.data]);

  // 상품 키 시그니처를 useMemo로 계산 (ordersSignature가 변경될 때만 재계산)
  const productKeysSignature = useMemo(() => {
    if (!ordersData?.data || ordersData.data.length === 0) {
      return null;
    }

    const items = ordersData.data;
    const postKeys = Array.from(new Set(items.map((r) => r.post_key || r.postKey).filter(Boolean)));
    const bandMap = new Map();
    items.forEach((r) => {
      if (!r.post_key && !r.postKey) {
        const band = r.band_number || r.bandNumber;
        const postNum = r.post_number ?? r.postNumber;
        if (band != null && postNum != null) {
          const key = String(band);
          if (!bandMap.has(key)) bandMap.set(key, new Set());
          bandMap.get(key).add(String(postNum));
        }
      }
    });

    return JSON.stringify({
      postKeys: postKeys.sort(),
      bandMap: Array.from(bandMap.entries()).map(([k, v]) => [k, Array.from(v).sort()]).sort()
    });
  }, [ordersSignature]); // ordersData?.data 대신 ordersSignature 사용

  // 마지막으로 로드한 상품/이미지 signature 저장 (중복 fetch 방지)
  const lastProductSignatureRef = useRef(null);
  const lastImageSignatureRef = useRef(null);
  const forceProductRefetchRef = useRef(false);

  // Posts 이미지 조회 - orders에서 직접 post_key 추출 (누적 캐싱)
  useEffect(() => {
    const fetchPostImages = async () => {
      try {
        if (!userData?.userId || !ordersData?.data || ordersData.data.length === 0) {
          return;
        }

        const items = ordersData.data;
        const postKeys = Array.from(new Set(items.map((r) => r.post_key || r.postKey).filter(Boolean)));

        // signature 생성
        const imageSignature = JSON.stringify(postKeys.sort());

        // 이미 로드한 signature면 건너뛰기
        if (lastImageSignatureRef.current === imageSignature) {
          console.log('✅ [이미지] 캐시 사용 - fetch 스킵');
          return;
        }

        console.log('🔄 [이미지] fetch 시작...');
        lastImageSignatureRef.current = imageSignature;

        const uid = userData.userId;
        const sb = getAuthedClient();

        // 이미 캐시된 이미지 확인
        const cachedImageKeys = new Set();
        Object.keys(postsImages).forEach(key => {
          // "bandKey_postKey" 형식에서 postKey 추출
          const pk = key.split('_').pop();
          if (pk) cachedImageKeys.add(pk);
        });

        // 신규 post_key만 필터링
        const newPostKeys = postKeys.filter(pk => !cachedImageKeys.has(pk));

        console.log(`🖼️ [이미지] 캐시: ${cachedImageKeys.size}개, 신규: ${newPostKeys.length}개`);

        if (newPostKeys.length > 0) {
          const { data: posts, error: pe } = await sb
            .from("posts")
            .select("band_key, post_key, image_urls")
            .eq("user_id", uid)
            .in("post_key", newPostKeys);

          if (!pe && Array.isArray(posts)) {
            const newMap = { ...postsImages }; // 기존 캐시 복사
            for (const row of posts) {
              const key = `${row.band_key || ''}_${row.post_key || ''}`;
              let urls = row.image_urls;
              try {
                if (typeof urls === 'string') urls = JSON.parse(urls);
              } catch { }
              if (Array.isArray(urls) && urls.length > 0) newMap[key] = urls;
            }
            setPostsImages(newMap);
            console.log('✅ [이미지] 누적 캐시:', Object.keys(newMap).length, '게시물');
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("이미지 조회 실패:", e?.message || e);
        }
      }
    };
    fetchPostImages();
  }, [userData?.userId, ordersData?.data, postsImages, productReloadToken]);

  // comment_orders에 맞는 상품 배치 조회 - 누적 캐싱 적용
  useEffect(() => {
    const fetchBatchProducts = async () => {
      try {
        if (!userData?.userId || !productKeysSignature) {
          return;
        }

        const forceRefetch = forceProductRefetchRef.current === true;
        if (forceRefetch) {
          // 1회성 강제 새로고침 플래그 소진
          forceProductRefetchRef.current = false;
        }

        // 이미 로드한 signature면 건너뛰기
        if (!forceRefetch && lastProductSignatureRef.current === productKeysSignature) {
          console.log('✅ [상품] 캐시 사용 - fetch 스킵');
          return;
        }

        console.log(`🔄 [상품] fetch 시작...${forceRefetch ? ' (force)' : ''}`);

        const uid = userData.userId;
        const sb = getAuthedClient();

        // productKeysSignature에서 필요한 post_key와 band_number/post_number 추출
        const sigData = JSON.parse(productKeysSignature);
        const postKeys = sigData.postKeys || [];
        const bandMap = new Map(sigData.bandMap || []);

        let newPostKeys = [];
        let newBandMap = new Map();

        if (forceRefetch) {
          newPostKeys = postKeys;
          newBandMap = new Map(bandMap);
          console.log(`📦 [상품] 강제 새로고침: post_key ${newPostKeys.length}개, band/post ${Array.from(newBandMap.values()).reduce((a, b) => a + b.length, 0)}개`);
        } else {
          // 캐시에서 이미 있는 것 확인
          const cachedPostKeys = new Set(Object.keys(postProductsByPostKey));
          const cachedBandPosts = new Set(Object.keys(postProductsByBandPost));

          // 신규로 가져올 post_key 필터링
          newPostKeys = postKeys.filter(pk => !cachedPostKeys.has(pk));

          // 신규로 가져올 band/post 필터링
          newBandMap = new Map();
          for (const [band, postNums] of bandMap.entries()) {
            const newNums = postNums.filter(num => {
              const key = `${band}_${String(num)}`;
              return !cachedBandPosts.has(key);
            });
            if (newNums.length > 0) {
              newBandMap.set(band, newNums);
            }
          }

          console.log(`📦 [상품] 캐시: ${cachedPostKeys.size + cachedBandPosts.size}개, 신규: ${newPostKeys.length + Array.from(newBandMap.values()).reduce((a, b) => a + b.length, 0)}개`);
        }

        const results = [];

        // 신규 post_key로 상품 조회
        if (newPostKeys.length > 0) {
          const { data: byPk, error: e1 } = await sb
            .from("products")
            .select("product_id,title,base_price,barcode,pickup_date,image_urls,post_key,band_key,band_number,post_number,item_number")
            .eq("user_id", uid)
            .in("post_key", newPostKeys)
            .order("item_number", { ascending: true })
            .range(0, 9999); // 최대 10000개까지 가져오기

          if (e1) {
            console.error('[상품] post_key 조회 실패:', e1);
            throw e1;
          }
          if (Array.isArray(byPk)) results.push(...byPk);
        }

        // 신규 band_number + post_number로 상품 조회
        for (const [band, postNums] of newBandMap.entries()) {
          if (postNums.length === 0) continue;
          const { data: byPair, error: e2 } = await sb
            .from("products")
            .select("product_id,title,base_price,barcode,pickup_date,image_urls,post_key,band_key,band_number,post_number,item_number")
            .eq("user_id", uid)
            .eq("band_number", band)
            .in("post_number", postNums)
            .order("item_number", { ascending: true })
            .range(0, 9999); // 최대 10000개까지 가져오기

          if (e2) {
            console.error('[상품] band/post 조회 실패:', e2);
            throw e2;
          }
          if (Array.isArray(byPair)) results.push(...byPair);
        }

        // 기존 캐시와 병합 (누적)
        const byPostKeyMap = { ...postProductsByPostKey };
        const byBandPostMap = { ...postProductsByBandPost };

        // 강제 새로고침: 요청한 키들의 기존 캐시를 제거 후 갱신 (중복/구버전 잔존 방지)
        if (forceRefetch) {
          for (const pk of newPostKeys) {
            if (pk) delete byPostKeyMap[pk];
          }
          for (const [band, postNums] of newBandMap.entries()) {
            (postNums || []).forEach((num) => {
              const k = `${band}_${String(num)}`;
              delete byBandPostMap[k];
            });
          }
        }

        results.forEach((p) => {
          if (p.post_key) {
            if (!byPostKeyMap[p.post_key]) byPostKeyMap[p.post_key] = [];
            byPostKeyMap[p.post_key].push(p);
          } else if (p.band_number != null && p.post_number != null) {
            const k = `${p.band_number}_${String(p.post_number)}`;
            if (!byBandPostMap[k]) byBandPostMap[k] = [];
            byBandPostMap[k].push(p);
          }
        });

        console.log('✅ [상품] 누적 캐시:', Object.keys(byPostKeyMap).length + Object.keys(byBandPostMap).length, '게시물');
        setPostProductsByPostKey(byPostKeyMap);
        setPostProductsByBandPost(byBandPostMap);

        // sessionStorage에 누적 저장
        writeOrdersTestProductsCache({ byPostKeyMap, byBandPostMap });

        // 성공적으로 누적 후에만 시그니처 저장 (실패 시 재시도 가능)
        lastProductSignatureRef.current = productKeysSignature;

      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("상품 배치 조회 실패:", e?.message || e);
        }
        // 실패 시 재시도할 수 있도록 시그니처 무효화
        lastProductSignatureRef.current = null;
      }
    };
    fetchBatchProducts();
  }, [userData?.userId, productKeysSignature, productReloadToken]); // 강제 재조회 토큰 포함

  // useProducts 훅 비활성화 - fetchBatchProducts에서 이미 전체 products를 가져오고 있음 (중복 방지)
  const productsData = null;
  const productsError = null;
  const mutateProducts = useCallback(async () => {
    // 강제 상품/이미지 재조회 트리거 (주문 RPC 재호출 없이)
    setProductReloadToken((v) => v + 1);
  }, []);

  // 글로벌 통계 데이터 (날짜 필터만 적용, 상태 필터는 제외) - 통계 카드용
  // RPC 함수로 통합: 미수령/주문완료/결제완료 카운트를 한 번에 조회
  const forceGlobalStatsRef = useRef(false);
  const globalStatsCacheKey =
    userData?.userId && mode
      ? `orders-test-global-stats:${userData.userId}:${mode}:${filterDateRange}:${dateFilterParams.startDate || "none"}:${dateFilterParams.endDate || "none"}`
      : null;
  const cachedGlobalStats = readGlobalStatsCache(globalStatsCacheKey);

  const {
    data: globalStatsData,
    mutate: mutateGlobalStats,
    isLoading: isGlobalStatsLoading,
    isValidating: isGlobalStatsValidating,
  } = useSWR(
    userData?.userId
      ? [
        "global-stats",
        mode,
        userData.userId,
        filterDateRange,
        dateFilterParams.startDate,
        dateFilterParams.endDate,
      ]
      : null,
    async () => {
      const shouldBypassCache = forceGlobalStatsRef.current;
      if (!shouldBypassCache) {
        const cached = readGlobalStatsCache(globalStatsCacheKey);
        if (cached) {
          if (process.env.NODE_ENV === "development") {
            console.log("📦 [글로벌 통계] 캐시 사용");
          }
          return cached;
        }
      }
      forceGlobalStatsRef.current = false;

      const sb = getAuthedClient();
      const rpcCandidates =
        mode === "raw"
          ? ["get_comment_order_stats"]
          : ["get_order_stats"];

      if (process.env.NODE_ENV === "development") {
        console.log(`📊 [글로벌 통계] RPC 호출: ${rpcCandidates[0]}`);
      }

      const rpcParams = {
        p_user_id: userData.userId,
        p_status: null,
        p_sub_status: null,
        p_search: null,
        p_start_date: dateFilterParams.startDate || null,
        p_end_date: dateFilterParams.endDate || null,
        p_date_type: 'ordered',
      };

      let data;
      let error;
      for (const rpcName of rpcCandidates) {
        const res = await sb.rpc(rpcName, rpcParams);
        data = res?.data;
        error = res?.error;
        if (!error) break;
        if (process.env.NODE_ENV === "development") {
          console.warn(`[글로벌 통계] RPC 실패 (${rpcName})`, error);
        }
      }

      if (error) {
        console.error("[글로벌 통계] RPC error:", error);
        return { statusCounts: {}, subStatusCounts: {} };
      }

      const normalized = data || { statusCounts: {}, subStatusCounts: {} };
      writeGlobalStatsCache(globalStatsCacheKey, normalized);
      if (process.env.NODE_ENV === "development") {
        console.log(`📊 [글로벌 통계] 결과:`, normalized);
      }
      return normalized;
    },
    {
      revalidateOnFocus: false, // 포커스 시 중복 호출 방지
      revalidateOnReconnect: false, // 서버 보호: 재연결 시 자동 재호출 OFF
      revalidateIfStale: false, // 서버 보호: stale 자동 재호출 OFF
      dedupingInterval: 60000,
      revalidateOnMount: cachedGlobalStats ? false : true,
      fallbackData: cachedGlobalStats || undefined,
    }
  );

  // RPC 결과에서 개별 카운트 추출
  const unreceivedCountData = globalStatsData?.subStatusCounts?.["미수령"] || 0;
  const completedCountData = globalStatsData?.statusCounts?.["주문완료"] || 0;
  const paidCountData = globalStatsData?.statusCounts?.["결제완료"] || 0;

  const refreshStats = useCallback(
    (force = false) => {
      if (force) {
        forceGlobalStatsRef.current = true;
        if (typeof window !== "undefined" && globalStatsCacheKey) {
          try {
            localStorage.removeItem(globalStatsCacheKey);
          } catch (_) {}
        }
      }
      return mutateGlobalStats(undefined, { revalidate: true, dedupe: !force });
    },
    [mutateGlobalStats, globalStatsCacheKey]
  );

  // 기간 필터 변경 시 통계는 SWR 키 변경으로 1회만 재호출됨

  // 상태 변경 시 배지 카운트를 낙관적으로 맞춰주는 헬퍼 (증가/감소 모두 처리)
  const adjustBadgeCountsOptimistically = useCallback(
    (changedOrders, nextStatus, nextSubStatus) => {
      if (!Array.isArray(changedOrders) || changedOrders.length === 0) return;

      const statusDelta = new Map();
      const subStatusDelta = new Map();

      const addDelta = (map, key, delta) => {
        if (!key || !delta) return;
        map.set(key, (map.get(key) || 0) + delta);
      };

      changedOrders.forEach((o) => {
        const prevStatus = o?.status || null;
        const prevSub = o?.sub_status ?? null;
        const nextSt = nextStatus ?? prevStatus;
        const nextSub =
          nextSubStatus !== undefined ? nextSubStatus : prevSub;

        if (prevStatus !== nextSt) {
          if (prevStatus) addDelta(statusDelta, prevStatus, -1);
          if (nextSt) addDelta(statusDelta, nextSt, 1);
        }
        if (prevSub !== nextSub) {
          if (prevSub) addDelta(subStatusDelta, prevSub, -1);
          if (nextSub) addDelta(subStatusDelta, nextSub, 1);
        }
      });

      if (statusDelta.size === 0 && subStatusDelta.size === 0) return;

      mutateGlobalStats(
        (prev) => {
          if (!prev || typeof prev !== "object") return prev;

          const statusCounts = { ...(prev.statusCounts || {}) };
          const subStatusCounts = { ...(prev.subStatusCounts || {}) };

          const applyDeltaToCounts = (counts, key, delta) => {
            if (!key || !delta) return;
            const current = Number(counts[key] ?? 0);
            const currentValue = Number.isFinite(current) ? current : 0;
            counts[key] = Math.max(0, currentValue + delta);
          };

          for (const [k, d] of statusDelta.entries()) {
            applyDeltaToCounts(statusCounts, k, d);
          }
          for (const [k, d] of subStatusDelta.entries()) {
            applyDeltaToCounts(subStatusCounts, k, d);
          }

          return { ...prev, statusCounts, subStatusCounts };
        },
        { revalidate: false }
      );
    },
    [mutateGlobalStats]
  );

  // 현재 필터가 기대하는 주문만 남기기 (상태 변경 후 불필요한 get_orders 재호출 대신 사용)
  const isOrderVisibleInCurrentView = useCallback(
    (order) => {
      if (!order) return false;
      const status = order.status;
      const subStatus = order.sub_status ?? null;

      if (filterSelection === "all") return true;
      if (filterSelection === "주문완료+수령가능") return status === "주문완료";
      if (filterSelection === "미수령") return subStatus === "미수령";
      if (filterSelection === "확인필요") return subStatus === "확인필요";
      if (filterSelection === "none") return !subStatus;
      return status === filterSelection;
    },
    [filterSelection]
  );

  const isSearchCountingActive = Boolean((searchTerm || "").trim());
  const unreceivedBadgeCount = unreceivedCountData ?? 0;

  const waitForNextPaint = useCallback(() => {
    if (typeof requestAnimationFrame !== "function") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }, []);

  const deferNonCritical = useCallback((fn) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => fn());
      return;
    }
    setSafeTimeout(() => fn(), 0);
  }, [setSafeTimeout]);

  const orderStatusOptions = useMemo(
    () => [
      { value: "all", label: "전체" },
      { value: "주문완료", label: "주문완료", badgeCount: completedCountData ?? 0, badgeColor: "blue" },
      { value: "주문완료+수령가능", label: "수령가능만 보기" },
      { value: "수령완료", label: "수령완료" },
      { value: "미수령", label: "미수령", badgeCount: unreceivedBadgeCount },
      { value: "주문취소", label: "주문취소" },
      { value: "결제완료", label: "결제완료", badgeCount: paidCountData ?? 0, badgeColor: "yellow" },
    ],
    [completedCountData, paidCountData, unreceivedBadgeCount]
  );

  // 필터된 통계 데이터 - 사용하지 않으므로 비활성화 (불필요한 전체 데이터 페칭 방지)
  // const {
  //   data: filteredStatsData,
  //   error: filteredStatsError,
  //   isLoading: isFilteredStatsLoading,
  // } = useOrderStatsClient(
  //   userData?.userId,
  //   {
  //     ...필터 옵션...
  //   },
  //   swrOptions
  // );

  // 클라이언트 사이드 mutation 함수들 (모드에 따라 다름)
  const rawMutations = useCommentOrderClientMutations();
  const legacyMutations = useOrderClientMutations();

  // 모드에 상관없이 사용할 수 있는 통합 update 함수
  const updateCommentOrder = async (orderId, updateData, userId, options = {}) => {
    if (mode === "raw") {
      return await rawMutations.updateCommentOrder(orderId, updateData, userId, options);
    } else {
      // legacy 테이블은 status/sub_status 필드 사용. 재검증은 여기서 건너뛰고 낙관적 상태 사용.
      const payload = {
        status: updateData.status,
      };
      if (updateData.sub_status !== undefined) {
        payload.sub_status = updateData.sub_status;
      }
      if (updateData.received_at !== undefined) {
        payload.completed_at = updateData.received_at;
      }
      if (updateData.canceled_at !== undefined) {
        payload.canceled_at = updateData.canceled_at;
      }
      if (updateData.paid_at !== undefined) {
        payload.paid_at = updateData.paid_at;
      }
      return await legacyMutations.updateOrderStatus(orderId, payload, userId, { revalidate: false });
    }
  };

  const isDataLoading = isOrdersLoading;
  const isSearchLoading = isOrdersLoading;
  const hasLoadedOrdersOnceRef = useRef(false);
  useEffect(() => {
    if (ordersData?.data) {
      hasLoadedOrdersOnceRef.current = true;
    }
  }, [ordersData?.data]);
  // 검색 중 오버레이는 제거하고 버튼 내부 스피너만 사용
  const showSearchOverlay = false;
  const displayedOrderIds = useMemo(
    () => groupedOrders.flatMap((g) => g.orderIds),
    [groupedOrders]
  );
  const selectedOrderIdSet = useMemo(
    () => new Set(selectedOrderIds),
    [selectedOrderIds]
  );

  const isAllDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.every((id) => selectedOrderIdSet.has(id));
  const isSomeDisplayedSelected =
    displayedOrderIds.length > 0 &&
    displayedOrderIds.some((id) => selectedOrderIdSet.has(id));

  useEffect(() => {
    if (checkbox.current)
      checkbox.current.indeterminate =
        isSomeDisplayedSelected && !isAllDisplayedSelected;
  }, [isSomeDisplayedSelected, isAllDisplayedSelected]);

  // 수령일시 지난 주문 자동 미수령 처리 (전체 주문 대상)
  const autoUpdateProcessedRef = useRef(false);
  // Supabase cron에서 수령일 지난 주문을 미수령으로 전환하므로 프론트 자동처리는 비활성화
  const AUTO_MISSED_STATUS_UPDATE_ENABLED = false;
  useEffect(() => {
    if (!AUTO_MISSED_STATUS_UPDATE_ENABLED) return;
    console.log('[자동 미수령] useEffect 실행됨');

    // 한 번만 실행
    if (autoUpdateProcessedRef.current) {
      console.log('[자동 미수령] 이미 처리됨, 스킵');
      return;
    }

    console.log('[자동 미수령] 조건 체크:', {
      userId: userData?.userId,
      products: products?.length,
      mode
    });

    if (!userData?.userId) {
      console.log('[자동 미수령] userId 없음');
      return;
    }
    if (!products || products.length === 0) {
      console.log('[자동 미수령] products 없음');
      return;
    }

    const processAutoUpdate = async () => {
      try {
        console.log('[자동 미수령] 전체 주문 처리 시작 (Supabase 직접 업데이트)');

        // KST 기준 오늘 날짜 (YYYYMMDD)
        const now = new Date();
        const KST_OFFSET = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + KST_OFFSET);
        const todayYmd = kstNow.getUTCFullYear() * 10000 + (kstNow.getUTCMonth() + 1) * 100 + kstNow.getUTCDate();

        console.log('[자동 미수령] 오늘 날짜 (KST YYYYMMDD):', todayYmd);

        // 날짜를 YYYYMMDD로 변환하는 헬퍼 함수
        const toKstYmd = (dateInput) => {
          if (!dateInput) return null;
          try {
            let dt;
            if (typeof dateInput === 'string' && dateInput.includes('T')) {
              dt = new Date(dateInput);
            } else if (dateInput instanceof Date) {
              dt = dateInput;
            } else {
              return null;
            }
            if (isNaN(dt.getTime())) return null;
            const kst = new Date(dt.getTime() + KST_OFFSET);
            return kst.getUTCFullYear() * 10000 + (kst.getUTCMonth() + 1) * 100 + kst.getUTCDate();
          } catch {
            return null;
          }
        };

        // 상품 ID와 pickup_date 매핑 생성 (어제 이전인 것만)
        const productIdsWithPastPickup = products
          .filter(p => {
            if (!p.pickup_date) return false;
            const pickupYmd = toKstYmd(p.pickup_date);
            if (!pickupYmd) return false;
            // pickup_date가 오늘보다 이전 (오늘 제외)
            return pickupYmd < todayYmd;
          })
          .map(p => p.product_id);

        console.log('[자동 미수령] 어제 이전 수령일시 상품:', productIdsWithPastPickup.length, '개');

        if (productIdsWithPastPickup.length > 0) {
          console.log('[자동 미수령] 샘플 상품 3개:', products
            .filter(p => productIdsWithPastPickup.includes(p.product_id))
            .slice(0, 3)
            .map(p => ({
              product_id: p.product_id,
              title: p.title,
              pickup_date: p.pickup_date,
              pickup_ymd: toKstYmd(p.pickup_date)
            }))
          );
        }

        if (productIdsWithPastPickup.length === 0) {
          console.log('[자동 미수령] 업데이트할 상품 없음');
          autoUpdateProcessedRef.current = true;
          return;
        }

        // Supabase에서 직접 업데이트
        const tableName = mode === 'raw' ? 'comment_orders' : 'orders';
        const statusField = 'status'; // raw/legacy 모두 status 사용

        console.log('[자동 미수령] 쿼리 조건:', {
          tableName,
          statusField,
          userId: userData.userId,
          productIds: productIdsWithPastPickup.slice(0, 5)
        });

        // 먼저 해당 조건의 주문이 있는지 확인 (URL 길이 제한으로 주석 처리)
        // const { data: existingOrders, error: selectError } = await supabase
        //   .from(tableName)
        //   .select('order_id, product_id, ' + statusField + ', sub_status')
        //   .eq('user_id', userData.userId)
        //   .in('product_id', productIdsWithPastPickup);

        // if (selectError) {
        //   console.error('[자동 미수령] 조회 오류:', selectError);
        // } else {
        //   console.log('[자동 미수령] 해당 product_id 가진 주문 총:', existingOrders?.length || 0, '건');
        //   if (existingOrders && existingOrders.length > 0) {
        //     console.log('[자동 미수령] 샘플 주문 3개:', existingOrders.slice(0, 3));

        //     // 주문완료인 것만 필터링
        //     const completedOrders = existingOrders.filter(o => o[statusField] === '주문완료');
        //     console.log('[자동 미수령] 주문완료 상태:', completedOrders.length, '건');

        //     // 주문완료 + (sub_status null 또는 수령가능)
        //     const targetOrders = completedOrders.filter(o => !o.sub_status || o.sub_status === '수령가능');
        //     console.log('[자동 미수령] 업데이트 대상 (주문완료 + null/수령가능):', targetOrders.length, '건');
        //     if (targetOrders.length > 0) {
        //       console.log('[자동 미수령] 샘플 대상:', targetOrders.slice(0, 3));
        //     }
        //   }
        // }

        // const { data, error } = await supabase
        //   .from(tableName)
        //   .update({
        //     sub_status: '미수령',
        //     updated_at: new Date().toISOString()
        //   })
        //   .eq('user_id', userData.userId)
        //   .eq(statusField, '주문완료')
        //   .or(`sub_status.is.null,sub_status.eq.수령가능`)
        //   .in('product_id', productIdsWithPastPickup)
        //   .select();

        // if (error) {
        //   console.error('[자동 미수령] 업데이트 오류:', error);
        //   throw error;
        // }

        // console.log('[자동 미수령] 업데이트 완료:', data?.length || 0, '건');
        // if (data && data.length > 0) {
        //   console.log('[자동 미수령] 업데이트된 주문 샘플:', data.slice(0, 3));
        // }

        // 데이터 갱신
        console.log('[자동 미수령] 데이터 갱신 중');
        // 네트워크 재호출 대신 로컬 상태 유지, 필요 시 동기화 버튼에서 수동 갱신
        autoUpdateProcessedRef.current = true;
        console.log('[자동 미수령] 처리 완료, 플래그 설정');
      } catch (error) {
        console.error('[자동 미수령 처리] 오류:', error);
      }
    };

    processAutoUpdate();
  }, [userData, products, mode, mutateOrders]);

  // 필터 변경 시 페이지를 1로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSelection]);

  const handleCheckboxChange = (e, groupId) => {
    const isChecked = e.target.checked;
    const group = groupedOrders.find((g) => g.groupId === groupId);
    const ids = group ? group.orderIds : [];
    setSelectedOrderIds((prev) => {
      if (isChecked) {
        return [...new Set([...prev, ...ids])];
      } else {
        return prev.filter((id) => !ids.includes(id));
      }
    });
  };
  const handleSelectAllChange = useCallback((e) => {
    const isChecked = e.target.checked;
    const currentIds = groupedOrders.flatMap((g) => g.orderIds);
    setSelectedOrderIds((prev) => {
      const others = prev.filter((id) => !currentIds.includes(id));
      return isChecked ? [...new Set([...others, ...currentIds])] : others;
    });
  }, [groupedOrders]);

  // --- 검색창 업데이트 및 검색 실행 함수 ---
  const handleCellClickToSearch = useCallback((searchValue, postKey = null) => {
    const trimmedSearchValue = (searchValue || "").trim();
    const trimmedPostKey = (postKey || "").trim();
    if (!trimmedSearchValue && !trimmedPostKey) return; // 빈 값은 무시

    const nextType = trimmedSearchValue ? "product" : "post_key";
    const nextTerm = trimmedSearchValue || trimmedPostKey;
    const nextPostKeyFilter = nextType === "post_key" ? (nextTerm || null) : null;
    const currentPostKeyFilter = urlPostKeyFilter || null;

    // 클릭으로 검색을 명시적으로 트리거했는데 조건이 동일하면, 1회 재검증만 수행
    if (nextTerm === searchTerm && nextType === appliedSearchType && currentPostKeyFilter === nextPostKeyFilter) {
      const now = Date.now();
      if (now - lastManualSearchRefreshAtRef.current < MANUAL_SEARCH_REFRESH_MIN_INTERVAL_MS) {
        warnSearchCooldown();
        return;
      }
      lastManualSearchRefreshAtRef.current = now;
      refreshOrders({ force: true });
      return;
    }

    if (trimmedSearchValue) {
      searchTypeRef.current = "product";
      setAppliedSearchType("product");
      if (searchBarRef.current?.setSearchType) {
        searchBarRef.current.setSearchType("product");
      }
      if (searchInputRef.current) {
        searchInputRef.current.value = trimmedSearchValue;
      }
      setSearchTerm(trimmedSearchValue);
      setUrlPostKeyFilter(null);
    } else if (trimmedPostKey) {
      searchTypeRef.current = "post_key";
      setAppliedSearchType("post_key");
      if (searchBarRef.current?.setSearchType) {
        searchBarRef.current.setSearchType("post_key");
      }
      if (searchInputRef.current) {
        searchInputRef.current.value = trimmedPostKey;
      }
      setSearchTerm(trimmedPostKey);
      setUrlPostKeyFilter(trimmedPostKey || null);
    }

    setExactCustomerFilter(null);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    setSelectedOrderIds([]); // 검색 시 선택된 항목 초기화 (선택적)
    // 검색 후 맨 위로 스크롤
    if (scrollToTop) {
      setSafeTimeout(() => scrollToTop(), 100);
    }
  }, [scrollToTop, appliedSearchType, searchTerm, urlPostKeyFilter, refreshOrders, setSafeTimeout, warnSearchCooldown]);

  // 편집 관련 함수들
  const fetchProductsForPost = async (postId) => {
    if (availableProducts[postId]) {
      return availableProducts[postId];
    }

    try {
      const userId = userData?.userId;
      if (!userId) return [];

      const url = new URL(`/api/posts/${postId}/products`, window.location.origin);
      url.searchParams.set("user_id", userId);
      const response = await fetch(url.toString());
      const result = await response.json();

      if (result.success) {
        setAvailableProducts(prev => ({
          ...prev,
          [postId]: result.data
        }));
        return result.data;
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

    // 해당 게시물의 상품 목록 가져오기 - post_key 사용
    const postKey = order.post_key;
    console.log('Edit start - order:', order);
    console.log('Using postKey:', postKey);

    if (postKey) {
      await fetchProductsForPost(postKey);
    } else {
      console.error('post_key가 없습니다:', order);
    }
  };

  const handleEditCancel = () => {
    setEditingOrderId(null);
    setEditValues({});
  };

  const handleEditSave = async (order) => {
    setSavingEdit(true);

    // 레거시 UI 필드 -> comment_orders 컬럼 매핑
    const selectedProductId = editValues.product_id ?? order.product_id ?? null;
    const selectedQty = Math.max(1, parseInt(editValues.quantity ?? order.quantity ?? 1, 10) || 1);
    const selectedPrice = parseFloat(editValues.product_price ?? order.price ?? 0) || 0;
    const productName = editValues.product_name || order.product_name || '상품명 없음';

    try {
      await updateCommentOrder(
        order.order_id,
        {
          selected_product_id: selectedProductId,
          selected_quantity: selectedQty,
          // 가격 컬럼이 존재하는 경우에만 업데이트하려면 서버에서 스키마를 허용해야 함
          selected_price: selectedPrice,
          product_name: productName,
        },
        userData.userId,
        { revalidate: false }
      );

      // 로컬/SWR 캐시만 업데이트 (네트워크 재호출 없음)
      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === order.order_id
            ? {
              ...o,
              product_id: selectedProductId,
              product_name: productName,
              quantity: selectedQty,
              price: selectedPrice,
            }
            : o
        )
      );
      await mutateOrders(
        (prev) => {
          if (!prev?.data) return prev;
          return {
            ...prev,
            data: prev.data.map((o) =>
              o.order_id === order.order_id
                ? {
                  ...o,
                  product_id: selectedProductId,
                  product_name: productName,
                  quantity: selectedQty,
                  price: selectedPrice,
                }
                : o
            ),
          };
        },
        { revalidate: false, rollbackOnError: true }
      );

      setEditingOrderId(null);
      setEditValues({});

      alert('주문 정보가 성공적으로 업데이트되었습니다.');
    } catch (error) {
      console.error('주문 업데이트 에러:', error);
      alert('주문 정보 업데이트에 실패했습니다: ' + (error?.message || ''));
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
    const products = availableProducts[postKey] || [];
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

  const handleBulkStatusUpdate = useCallback(async (newStatus) => {
    const summarizeOrders = (list) =>
      list.map((o) => {
        // 테이블에서 보여주는 상품명을 최대한 동일하게 재구성
        const candidates = getCandidateProductsForOrder
          ? getCandidateProductsForOrder(o)
          : [];
        const selected =
          Array.isArray(candidates) && o.product_id
            ? candidates.find((p) => p?.product_id === o.product_id)
            : null;
        const fallbackProd =
          selected ||
          (Array.isArray(candidates) && candidates.length > 0
            ? candidates[0]
            : null);
        const rawTitle =
          o.product_name ||
          fallbackProd?.title ||
          fallbackProd?.name ||
          fallbackProd?.product_name ||
          "-";
        const productName = cleanProductName ? cleanProductName(rawTitle) : rawTitle;
        const customer = o.customer_name || o.commenter_name || "-";
        return `${customer} / ${productName}`;
      });

    if (selectedOrderIds.length === 0) return;

    // orders 배열에서 필터링 (orders 페이지와 동일하게)
    const ordersToUpdateFilter = orders.filter(
      (order) =>
        selectedOrderIds.includes(order.order_id) && order.status !== newStatus
    );
    // 중복 제거하여 unique 주문 ID만 추출
    const orderIdsToProcess = [...new Set(ordersToUpdateFilter.map(
      (order) => order.order_id
    ))];
    const skippedCount = selectedOrderIds.length - orderIdsToProcess.length;

    if (orderIdsToProcess.length === 0) {
      setBulkUpdateLoading(false);
      setSelectedOrderIds([]);
      alert(`건너뛴 주문: ${skippedCount}개. 변경할 주문이 없습니다.`);
      return;
    }

    const updateList = summarizeOrders(ordersToUpdateFilter);
    const confirmMessage =
      (updateList.length
        ? `선택된 주문:\n${updateList
          .map((s, idx) => `${idx + 1}. ${s}`)
          .join("\n")}\n\n`
        : "") +
      `${orderIdsToProcess.length}개의 주문을 '${newStatus}' 상태로 변경하시겠습니까?` +
      (skippedCount > 0
        ? `\n(${skippedCount}개는 이미 해당 상태이거나 제외되어 건너뜁니다.)`
        : "");

    if (!window.confirm(confirmMessage)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let successfulOrderIds = [];

    const shouldClearSubStatus =
      mode === "raw" || newStatus === "수령완료" || newStatus === "주문취소";

    setBulkUpdateLoading(true);
    await waitForNextPaint();

    try {
      if (mode === "raw") {
        // Raw 모드: 각 주문을 개별적으로 업데이트
        const nowISO = new Date().toISOString();
        const paidAtById = new Map(orders.map((order) => [order.order_id, order.paid_at]));
        const getAllowedOrderStatus = (st) => {
          const allowed = ["주문완료", "수령완료", "결제완료", "미수령", "주문취소", "확인필요"];
          if (allowed.includes(st)) return st;
          return "주문완료";
        };

        const buildUpdate = (st, orderId) => {
          const base = {
            order_status: getAllowedOrderStatus(st),
            canceled_at: null,
            received_at: null,
            sub_status: null,
          };

          if (st === "수령완료") {
            base.received_at = nowISO;
          } else if (st === "주문취소") {
            base.canceled_at = nowISO;
          } else if (st === "결제완료") {
            const existingPaidAt = paidAtById.get(orderId) || null;
            if (!existingPaidAt) {
              base.paid_at = nowISO;
            }
          } else if (["미수령", "확인필요", "수령가능"].includes(st)) {
            base.sub_status = st;
          }

          return base;
        };

        const results = await Promise.allSettled(
          orderIdsToProcess.map(id =>
            rawMutations.updateCommentOrder(id, buildUpdate(newStatus, id), userData.userId, { revalidate: false })
          )
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount += 1;
            successfulOrderIds.push(orderIdsToProcess[index]);
          } else {
            failCount += 1;
          }
        });
      } else {
        // Legacy 모드: bulkUpdateOrderStatus 사용 (orders 페이지와 동일)
        await legacyMutations.bulkUpdateOrderStatus(
          orderIdsToProcess,
          newStatus,
          userData.userId,
          undefined,
          { revalidate: false }
        );
        successCount = orderIdsToProcess.length;
        successfulOrderIds = [...orderIdsToProcess];
      }

      const updatedIdSet = new Set(successfulOrderIds);

      // 일괄 상태 변경 후 로컬 상태만 optimistic update (서버 재검증 없음)
      if (successfulOrderIds.length > 0) {
        await waitForNextPaint();
        startTransition(() => {
          setOrders((prevOrders) => {
            const next = prevOrders.map((order) =>
              updatedIdSet.has(order.order_id)
                ? {
                  ...order,
                  status: newStatus,
                  sub_status: shouldClearSubStatus ? null : order.sub_status,
                }
                : order
            );
            return next.filter(isOrderVisibleInCurrentView);
          });
        });
      }

      if (successfulOrderIds.length > 0) {
        const successfulOrders = orders.filter((o) =>
          successfulOrderIds.includes(o.order_id)
        );
        const nextSub = shouldClearSubStatus ? null : undefined;
        adjustBadgeCountsOptimistically(successfulOrders, newStatus, nextSub);
      }

      // SWR 캐시만 동기 반영 (네트워크 재호출 없음)
      if (successfulOrderIds.length > 0) {
        await waitForNextPaint();
        startTransition(() => {
          void mutateOrders(
            (prev) => {
              if (!prev?.data) return prev;
              const nextData = prev.data.map((o) =>
                updatedIdSet.has(o.order_id)
                  ? {
                    ...o,
                    status: newStatus,
                    sub_status: shouldClearSubStatus ? null : o.sub_status,
                  }
                  : o
              );
              return {
                ...prev,
                data: nextData.filter(isOrderVisibleInCurrentView),
              };
            },
            { revalidate: false, rollbackOnError: true }
          );
        });
      }

      if (successCount > 0) {
        console.log(`✅ ${successCount}개 주문이 '${newStatus}'로 변경되었습니다.`);
        showSuccess(`${successCount}개 주문을 '${newStatus}'로 변경했습니다.`);
        hasRecentStatusChangeRef.current = true;
      }
      if (failCount > 0) {
        console.warn(`⚠️ ${failCount}건 업데이트 실패`);
        showError(`${failCount}건 업데이트에 실패했습니다.`);
      }

      // IndexedDB 반영 + 오프라인 페이지 갱신 이벤트
      // ordersToUpdateFilter 재사용 (orders.find가 못 찾는 경우 방지)
      // 한국시간 ISO 문자열 생성 (기존 데이터와 일관성 유지)
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const koreanISOString = kstDate.toISOString().replace('Z', '+09:00');
      const updatedOrdersForLocal = ordersToUpdateFilter
        .filter((order) => updatedIdSet.has(order.order_id))
        .map((order) => ({
          ...order,
          user_id: userData?.userId || order.user_id,
          status: newStatus,
          updated_at: koreanISOString,
        }));
      if (updatedOrdersForLocal.length > 0) {
        deferNonCritical(() => {
          syncOrdersToIndexedDb(updatedOrdersForLocal).catch((err) => {
            if (process.env.NODE_ENV === "development") {
              console.warn("IndexedDB 동기화 지연 실패:", err);
            }
          });
        });
      }
    } catch (err) {
      alert(`❌ 일괄 업데이트 중 오류 발생: ${err.message}`);
    } finally {
      setBulkUpdateLoading(false);
      setSelectedOrderIds([]);
    }
  }, [selectedOrderIds, userData, mode, rawMutations, legacyMutations, mutateOrders, orders, syncOrdersToIndexedDb, adjustBadgeCountsOptimistically, getCandidateProductsForOrder, cleanProductName, isOrderVisibleInCurrentView, showError, showSuccess, waitForNextPaint, deferNonCritical]);
  function calculateDateFilterParams(range, customStart, customEnd) {
    const now = new Date();
    let startDate = new Date();
    const endDate = new Date(now);

    if (range === "custom" && customStart) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(customStart);
      end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    switch (range) {
      case "today":
        // 로컬 시간으로 오늘의 시작과 끝 설정
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        console.log("Today filter debug:", {
          localNow: now.toString(),
          startDate: todayStart.toISOString(),
          endDate: todayEnd.toISOString()
        });

        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
        break;
      case "7days":
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "60days":
        startDate.setDate(now.getDate() - 60);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "30days":
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "90days":
        startDate.setMonth(now.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "180days":
        startDate.setDate(now.getDate() - 180);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "all":
        return { startDate: undefined, endDate: undefined };
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
        className={`flex items-center pl-3 pr-8 py-2 md:py-2.5 rounded-md text-xs md:text-sm font-medium transition border whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none ${isActive
          ? "bg-gray-300 text-gray-700 hover:bg-gray-400"
          : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400"
          } ${disabled
            ? "!bg-gray-100 !border-gray-200 text-gray-400 cursor-not-allowed opacity-50"
            : ""
          }`}
        onClick={onClick}
        ref={ref}
        disabled={disabled}
        title={value || "날짜 직접 선택"}
      >
        <CalendarDaysIcon
          className={`w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2 flex-shrink-0 ${isActive ? "text-black" : "text-gray-400"
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
        if (process.env.NODE_ENV === "development") {
          console.error("Auth Error:", err);
        }
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
  // productsData 처리 제거 - fetchBatchProducts에서 직접 처리함
  // useEffect(() => {
  //   if (productsData?.data) setProducts(productsData.data);
  //   if (productsError && process.env.NODE_ENV === "development") {
  //     console.error("Product Error:", productsError);
  //   }
  // }, [productsData, productsError]);

  // URL 파라미터에서 검색어 처리하는 useEffect 추가
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      // Auto-searching from URL parameter
      if (searchInputRef.current) {
        searchInputRef.current.value = searchParam;
      }
      setSearchTerm(searchParam);
      setCurrentPage(1);
      setExactCustomerFilter(null);
      setSelectedOrderIds([]);

      // URL에서 검색 파라미터 제거 (한 번만 실행되도록)
      replaceUrlSearchParams((sp) => {
        sp.delete("search");
      });
    }
  }, [searchParams, replaceUrlSearchParams]);

  // 페이지 가시성 변경 및 포커스 감지하여 상품 데이터 업데이트
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && userData?.userId) {
        // Page became visible, refreshing products data
        mutateProducts(); // 상품 데이터 새로고침
      }
    };

    const handleWindowFocus = () => {
      if (userData?.userId) {
        // Window focused, refreshing products data
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
      // Orders page mounted, refreshing products data
      mutateProducts(); // 페이지 진입 시 상품 데이터 새로고침
    }
  }, [userData?.userId, mutateProducts]);

  // localStorage 플래그 감지하여 바코드 옵션 업데이트 확인
  useEffect(() => {
    const checkBarcodeOptionsUpdate = () => {
      const lastUpdated = localStorage.getItem("barcodeOptionsUpdated");
      if (lastUpdated && userData?.userId) {
        const updateTime = parseInt(lastUpdated);
        const now = Date.now();
        // 5분 이내의 업데이트만 유효하다고 간주
        if (now - updateTime < 5 * 60 * 1000) {
          // Barcode options were updated, refreshing products data
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
      if (mode === "raw") {
        // comment_orders 데이터를 레거시 UI가 기대하는 형태로 변환하여 표시
        try {
          const mapped = Array.isArray(ordersData.data)
            ? ordersData.data.map(mapCommentOrderToLegacy)
            : [];
          setOrders(mapped);
        } catch (_) {
          setOrders(ordersData.data);
        }
      } else {
        setOrders(ordersData.data);
      }
      // Debug pickup availability per band (beta)
      debugPickupLogging();
    }
    if (ordersError) {
      if (process.env.NODE_ENV === "development") {
        console.error("Order Error:", ordersError);
      }
      setError("Order Fetch Error");
    }
    // 클라이언트 측 페이지네이션에서는 필터 변경 시 이미 setCurrentPage(1) 처리됨
    // 서버 데이터 체크는 불필요 (항상 page=1로 요청하므로)
  }, [ordersData, ordersError, mode, mapCommentOrderToLegacy]);
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

  const productTitleById = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => {
      if (p?.product_id == null) return;
      if (p.title) map.set(p.product_id, p.title);
    });
    return map;
  }, [products]);

  const orderProductNameById = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      if (o?.product_id == null) return;
      if (o.product_name && o.product_name !== "상품명 없음") {
        if (!map.has(o.product_id)) map.set(o.product_id, o.product_name);
        return;
      }
      if (o.product_name && !map.has(o.product_id)) {
        map.set(o.product_id, o.product_name);
      }
    });
    return map;
  }, [orders]);

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
  const getProductNameById = useCallback(
    (id) => {
      if (id == null) return "상품명 없음";

      const title = productTitleById.get(id);
      if (title) return title;

      const fromOrder = orderProductNameById.get(id);
      if (fromOrder) return fromOrder;

      return "상품명 없음";
    },
    [orderProductNameById, productTitleById]
  );

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
      if (process.env.NODE_ENV === "development") {
        console.error("날짜 파싱 오류:", error);
      }
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

  // 수령 가능 여부(KST 날짜 기준, 당일 포함)
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
        // ISO(UTC) → shift to KST and take YMD
        const dt = new Date(dateInput);
        const k = new Date(dt.getTime() + KST_OFFSET);
        y = k.getUTCFullYear();
        m = k.getUTCMonth() + 1;
        d = k.getUTCDate();
      } else if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        const [datePart] = dateInput.split(' ');
        const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
        y = yy; m = mm; d = dd;
      } else if (typeof dateInput === 'string') {
        // 문자열에 한국어 월/일 표기가 있는 경우
        const md = dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (md) {
          const now = new Date(nowUtc.getTime() + KST_OFFSET);
          y = now.getUTCFullYear();
          m = parseInt(md[1], 10);
          d = parseInt(md[2], 10);
        } else {
          // 일반 Date 파싱 후 KST로 보정
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

  // 수령일 라벨(KST) 출력
  const formatPickupKSTLabel = (dateInput) => {
    if (!dateInput) return "";
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    try {
      if (typeof dateInput === 'string' && dateInput.includes('T')) {
        const dt = new Date(dateInput);
        const k = new Date(dt.getTime() + KST_OFFSET);
        const m = k.getUTCMonth() + 1;
        const d = k.getUTCDate();
        return `${m}월${d}일`;
      }
      if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        const [datePart] = dateInput.split(' ');
        const [, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
        return `${mm}월${dd}일`;
      }
      const md = typeof dateInput === 'string' ? dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) : null;
      if (md) {
        return `${parseInt(md[1], 10)}월${parseInt(md[2], 10)}일`;
      }
      const dt = new Date(dateInput);
      const k = new Date(dt.getTime() + KST_OFFSET);
      const m = k.getUTCMonth() + 1;
      const d = k.getUTCDate();
      return `${m}월${d}일`;
    } catch (_) {
      return "";
    }
  };

  // 수령일을 상대 시간과 절대 시간 두 줄로 표시 (CommentOrdersView와 동일)
  const formatPickupRelativeDateTime = (value) => {
    if (!value) return null;

    try {
      // 1. 절대 시간 포맷 (두 번째 줄에 표시)
      let dateOnly = null;
      let timeOnly = null;

      // ISO / Date 객체 처리 (시간 표시)
      let dt = null;
      if (value instanceof Date) {
        dt = value;
      } else if (typeof value === 'string' && value.includes('T')) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) dt = d;
      }

      if (dt) {
        const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
        const month = kst.getUTCMonth() + 1;
        const day = kst.getUTCDate();
        let hours = kst.getUTCHours();
        const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
        const ampm = hours < 12 ? '오전' : '오후';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        dateOnly = `${month}.${day}`;
        // 분이 00이면 시간만, 아니면 시간:분 형식
        timeOnly = minutes === '00' ? `${ampm}${hours}시` : `${ampm}${hours}:${minutes}`;
      } else if (typeof value === 'string' && /\d{4}-\d{1,2}-\d{1,2}/.test(value)) {
        // YYYY-MM-DD 형식
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) {
          const month = d.getMonth() + 1;
          const day = d.getDate();
          dateOnly = `${month}.${day}`;
          timeOnly = null;
        }
      } else if (typeof value === 'string') {
        // 'M월D일' 패턴
        const m = value.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (m) {
          const month = parseInt(m[1], 10);
          const day = parseInt(m[2], 10);
          dateOnly = `${month}.${day}`;
          timeOnly = null;
        }
      }

      // 2. 상대 시간 계산
      const { days, isPast, relativeText } = calculateDaysUntilPickup(value);

      // 3. 색상 결정
      let textColorClass = "text-gray-400"; // 기본값 (미래: 연한 회색)
      if (isPast) {
        textColorClass = "text-red-500"; // 지난 날짜 - 빨간색
      } else if (days === 0) {
        textColorClass = "text-green-600 font-semibold"; // 오늘 - 초록색
      }

      // 4. 세 줄로 표시 (첫 줄: 상대 시간, 둘째 줄: 날짜, 셋째 줄: 시간)
      if (relativeText && dateOnly) {
        return (
          <span className="inline-flex flex-col leading-tight">
            <span className={textColorClass}>{relativeText}</span>
            <span className="text-sm text-gray-600">{dateOnly}</span>
            {timeOnly && <span className="text-sm text-gray-600">{timeOnly}</span>}
          </span>
        );
      }

      // 폴백: 기존 형식 사용
      if (dateOnly) {
        return (
          <span className="inline-flex flex-col leading-tight">
            <span>{dateOnly}</span>
            {timeOnly && <span className="text-sm text-gray-600">{timeOnly}</span>}
          </span>
        );
      }
    } catch (err) {
      console.error("[formatPickupRelativeDateTime] Error:", err);
    }

    return null;
  };

  const renderPickupDisplay = (pickupDate) => {
    if (!pickupDate) return "-";

    if (pickupViewMode === "simple") {
      // 간단 모드: 상대 시간만 표시 (오늘, 내일, 4일 전, 6일 후)
      const { days, isPast, relativeText } = calculateDaysUntilPickup(pickupDate);

      // 색상 결정
      let textColorClass = "text-gray-400"; // 기본값 (미래: 연한 회색)
      if (isPast) {
        textColorClass = "text-red-500"; // 지난 날짜 - 빨간색
      } else if (days === 0) {
        textColorClass = "text-green-600"; // 오늘 - 초록색
      }

      return <span className={textColorClass}>{relativeText}</span>;
    }

    // detailed 모드: 상대 시간 + 날짜 + 시간
    const relative = formatPickupRelativeDateTime(pickupDate);
    return relative || "-";
  };

  const getProductBarcode = (id) => {
    // products 배열에서 product_id로 찾기
    const product = products.find((p) => p.product_id === id);
    if (product?.barcode) {
      return product.barcode;
    }

    return "";
  };
  const getProductById = (id) =>
    products.find((p) => p.product_id === id) || null;
  const getPostUrlByProductId = (id) =>
    products.find((p) => p.product_id === id)?.band_post_url || "";

  // --- Debug logging for pickup availability by band (Beta page) ---
  const debugPickupLogging = () => {
    if (typeof window === 'undefined') return;
    let debug = false;
    try { debug = window.localStorage.getItem('debugPickup') === 'true'; } catch { }
    if (!debug) return;

    try {
      const all = orders || [];
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
        const titleDate = titleDateFromName || extractBracketDate(o.product_name);
        const source = prod?.pickup_date || titleDate;
        const avail = source ? isPickupAvailable(source) : false;
        if (avail) {
          byBandAvail.set(bandKey, (byBandAvail.get(bandKey) || 0) + 1);
        }
        if (samples.length < 30) {
          samples.push({ band_key: bandKey, order_id: o.order_id, product_title: o.product_name || productName, products_pickup_date: prod?.pickup_date || null, titleDate, usedSource: source, available: avail });
        }
      }

      const objFromMap = (m) => Object.fromEntries(Array.from(m.entries()));
      console.groupCollapsed('[Pickup Debug] Orders Beta Page');
      console.log('filterSelection', filterSelection);
      console.log('counts', { all: all.length, available: Array.from(byBandAvail.values()).reduce((a, b) => a + b, 0) });
      console.log('byBand', { all: objFromMap(byBandAll), available: objFromMap(byBandAvail) });
      console.table(samples);
      console.groupEnd();
    } catch (e) {
      console.warn('Pickup debug logging failed (beta):', e);
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
      const d = new Date(ds);
      if (isNaN(d.getTime())) return "Invalid Date";
      const mo = String(d.getMonth() + 1).padStart(2, "0"),
        da = String(d.getDate()).padStart(2, "0"),
        hr = String(d.getHours()).padStart(2, "0"),
        mi = String(d.getMinutes()).padStart(2, "0");
      return `${mo}.${da} ${hr}:${mi}`;
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("Date Format Err:", e);
      }
      return "Error";
    }
  };
  const formatPickupDate = (ds) => {
    if (!ds) return "-";
    try {
      const d = new Date(ds);
      if (isNaN(d.getTime())) return "Invalid Date";
      const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const weekday = weekdays[d.getDay()];
      return `${month}월 ${day}일 (${weekday})`;
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("Date Format Err:", e);
      }
      return "Error";
    }
  };
  const formatDateForPicker = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const yy = String(d.getFullYear()).slice(-2);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${yy}년 ${m}월 ${day}일`;
  };

  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !userData?.userId) return;
    try {
      // 메인 상태: 주문완료, 수령완료, 주문취소, 결제완료
      // 보조 상태(sub_status): 미수령, 확인필요, 수령가능
      const mainStatuses = ["주문완료", "수령완료", "주문취소", "결제완료"];
      const subStatuses = ["미수령", "확인필요", "수령가능"];
      const allowed = [...mainStatuses, ...subStatuses];
      if (!allowed.includes(newStatus)) return;

      const nowISO = new Date().toISOString();
      const updateData = {};
      const existingOrder =
        orders.find((o) => o.order_id === orderId) || selectedOrder || null;
      const existingPaidAt = existingOrder?.paid_at || null;

      // 메인 상태 변경
      if (mainStatuses.includes(newStatus)) {
        updateData.status = newStatus;
        if (newStatus === "수령완료") {
          updateData.received_at = nowISO;
          updateData.canceled_at = null;
          updateData.sub_status = null;
        } else if (newStatus === "주문취소") {
          updateData.canceled_at = nowISO;
          updateData.received_at = null;
          updateData.sub_status = null;
        } else if (newStatus === "결제완료") {
          updateData.canceled_at = null;
          updateData.received_at = null;
          if (!existingPaidAt) {
            updateData.paid_at = nowISO;
          }
        } else if (newStatus === "주문완료") {
          updateData.canceled_at = null;
          updateData.received_at = null;
        }
      } else {
        // 보조 상태 변경 (메인 상태는 주문완료 유지)
        updateData.status = "주문완료";
        updateData.sub_status = newStatus;
        updateData.received_at = null;
        updateData.canceled_at = null;
      }

      await updateCommentOrder(orderId, updateData, userData.userId, { revalidate: false });

      const targetOrder =
        orders.find((o) => o.order_id === orderId) || selectedOrder || null;
      if (targetOrder) {
        const nextStatus = updateData.status || newStatus;
        adjustBadgeCountsOptimistically([targetOrder], nextStatus, updateData.sub_status);

        // 로컬 목록에도 즉시 반영 (현재 필터와 불일치하면 목록에서 제거)
        setOrders((prev) => {
          const next = [];
          let found = false;

          for (const o of prev) {
            if (o.order_id !== orderId) {
              next.push(o);
              continue;
            }
            found = true;

            const updated = {
              ...o,
              status: nextStatus,
              sub_status: updateData.sub_status ?? o.sub_status ?? null,
            };
            if (isOrderVisibleInCurrentView(updated)) {
              next.push(updated);
            }
          }

          if (!found) {
            const candidate = {
              ...targetOrder,
              status: nextStatus,
              sub_status: updateData.sub_status ?? targetOrder.sub_status ?? null,
            };
            if (isOrderVisibleInCurrentView(candidate)) {
              next.push(candidate);
            }
          }

          return next;
        });
      }

      setIsDetailModalOpen(false); // 모달 닫기
      // SWR 캐시만 동기 반영 (네트워크 재호출 없음)
      await mutateOrders(
        (prev) => {
          if (!prev?.data) return prev;
          const nextData = prev.data.map((o) =>
            o.order_id === orderId
              ? {
                ...o,
                status: updateData.status || newStatus,
                sub_status: updateData.sub_status ?? o.sub_status ?? null,
              }
              : o
          );
          return {
            ...prev,
            data: nextData.filter(isOrderVisibleInCurrentView),
          };
        },
        { revalidate: false, rollbackOnError: true }
      );
      showSuccess(`주문 상태를 '${updateData.status || newStatus}'로 변경했습니다.`);
      hasRecentStatusChangeRef.current = true;
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Status Change Error (client-side):", err);
      }
      alert(err.message || "주문 상태 업데이트에 실패했습니다.");
    }
  };
  const handleTabChange = (tab) => setActiveTab(tab);
  const openDetailModal = (order) => {
    if (!ENABLE_DETAIL_MODAL) return;
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

  const clearInputValue = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      searchInputRef.current.focus();
    }
  };

  // 개별 필터 해제 함수들
  const clearStatusFilter = () => {
    setFilterSelection("all");
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  const clearSearchFilter = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    setSearchTerm("");
    setUrlPostKeyFilter(null);
    setCurrentPage(1);
    setSelectedOrderIds([]);

    // URL 파라미터 제거
    stripOrdersTestNavParams();
  };

  const clearCustomerFilter = () => {
    setExactCustomerFilter(null);
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  const clearDateRangeFilter = () => {
    setFilterDateRange("30days");
    setCustomStartDate(null);
    setCustomEndDate(null);
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  // 검색 버튼 클릭 또는 Enter 키 입력 시 실제 검색 실행
  const handleSearch = useCallback(() => {
    const trimmedInput = searchInputRef.current?.value.trim() || "";
    if (!trimmedInput) {
      return;
    }
    // 현재 검색어와 다를 때만 상태 업데이트 및 API 재요청
    const currentSearchType = searchTypeRef.current || "customer";
    const shouldUpdateSearchType = currentSearchType !== appliedSearchType;
    const nextPostKeyFilter = currentSearchType === "post_key" ? (trimmedInput || null) : null;
    const shouldUpdatePostKeyFilter = (urlPostKeyFilter || null) !== nextPostKeyFilter;

    // 사용자가 "검색"을 명시적으로 눌렀는데 조건이 동일하면, 키를 바꾸지 않고 1회 재검증만 수행
    // (캐시 엔트리 폭증 방지 + 원하는 타이밍에 반드시 최신 결과 보장)
    if (trimmedInput === searchTerm && !shouldUpdateSearchType && !shouldUpdatePostKeyFilter) {
      const now = Date.now();
      if (now - lastManualSearchRefreshAtRef.current < MANUAL_SEARCH_REFRESH_MIN_INTERVAL_MS) {
        warnSearchCooldown();
        return;
      }
      lastManualSearchRefreshAtRef.current = now;
      refreshOrders({ force: true });
      return;
    }

    if (trimmedInput !== searchTerm || shouldUpdateSearchType || shouldUpdatePostKeyFilter) {
      // New search triggered
      if (trimmedInput !== searchTerm) {
        setSearchTerm(trimmedInput);
      }
      if (shouldUpdateSearchType) {
        setAppliedSearchType(currentSearchType);
      }
      if (currentSearchType === "post_key") {
        setUrlPostKeyFilter(nextPostKeyFilter);
      } else {
        setUrlPostKeyFilter(null);
      }
      setCurrentPage(1); // 검색 시 항상 1페이지로
      setExactCustomerFilter(null); // 일반 검색 시 정확 고객명 필터 초기화
      setSelectedOrderIds([]); // 선택 초기화
      // 검색 후 맨 위로 스크롤
      if (scrollToTop) {
        setSafeTimeout(() => scrollToTop(), 100);
      }
    }
  }, [searchTerm, appliedSearchType, scrollToTop, refreshOrders, urlPostKeyFilter, setSafeTimeout, warnSearchCooldown]);

  // 입력란에서 엔터 키 누를 때 이벤트 핸들러
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // 검색 초기화 함수
  const handleClearSearch = () => {
    // Clearing search and filters
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    searchTypeRef.current = "customer";
    setAppliedSearchType("customer");
    setUrlPostKeyFilter(null);
    if (searchBarRef.current?.setSearchType) {
      searchBarRef.current.setSearchType("customer");
    }
    setSearchTerm("");
    setExactCustomerFilter(null);
    setCurrentPage(1);
    setFilterSelection("주문완료"); // 기본 필터로 복귀
    setShowPickupAvailableOnly(false); // 수령가능만 보기 초기화
    // localStorage에서 수령가능만 보기 상태 삭제
    if (typeof window !== 'undefined') {
      localStorage.removeItem('showPickupAvailableOnly');
    }
    // 직접선택(custom)일 때는 기간 유지, 그 외는 기본 기간으로 초기화
    if (filterDateRange !== "custom") {
      setFilterDateRange("30days"); // 기본 날짜로 복귀
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
    setSelectedOrderIds([]);

    // URL 파라미터 제거
    stripOrdersTestNavParams();

    // 페이지 최상단으로 즉시 스크롤
    if (mainTopRef.current) {
      mainTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  };

  // (상단 별도 검색바 없음) — 기존 입력과 버튼 사용

  // 정확한 고객명 검색
  const handleExactCustomerSearch = (customerName) => {
    if (!customerName || customerName === "-") return;
    const trimmedName = customerName.trim();
    // Exact customer search
    if (searchInputRef.current) {
      searchInputRef.current.value = trimmedName;
    }
    searchTypeRef.current = "customer";
    setAppliedSearchType("customer");
    if (searchBarRef.current?.setSearchType) {
      searchBarRef.current.setSearchType("customer");
    }
    setSearchTerm(""); // 일반 검색어는 비움
    setExactCustomerFilter(trimmedName); // 정확 검색어 설정
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  // 서버와 강제 동기화 버튼
  const handleSyncNow = useCallback(async ({ skipIfInFlight = false, force = false } = {}) => {
    const now = Date.now();
    if (!userData?.userId || isSyncing) return;
    if (!force && skipIfInFlight && (
      isOrdersLoading || isOrdersValidating || isGlobalStatsLoading || isGlobalStatsValidating
    )) {
      return;
    }
    // 10초 쿨다운
    if (!force && lastSyncAt && now - lastSyncAt < 10_000) {
      showError("너무 빠르게 요청했습니다. 잠시 후 다시 시도하세요.");
      return;
    }
    setIsSyncing(true);
    const start = Date.now();
    try {
      if (force) {
        // 새로고침 버튼에서 호출 시: 상품 캐시도 무조건 최신으로 당겨오기
        forceProductRefetchRef.current = true;
      }

      // 리스트/통계 캐시 완전 무효화
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          (key[0] === "comment_orders" || key[0] === "orders") &&
          key[1] === userData.userId,
        undefined,
        { revalidate: false }
      );
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          ["unreceived-count", "completed-count", "paid-count"].includes(key[0]) &&
          key[2] === userData.userId,
        undefined,
        { revalidate: false }
      );

      // 캐시된 시그니처 무효화해서 재조회 강제
      lastProductSignatureRef.current = null;
      lastImageSignatureRef.current = null;
      // 상품/이미지 캐시 초기화
      setPostProductsByPostKey({});
      setPostProductsByBandPost({});
      setPostsImages({});
      clearOrdersTestProductsCache();
      setProductReloadToken((v) => v + 1); // 상품/이미지 fetch useEffect 강제 재실행

      // 주문/배지/상품 모두 강제 재검증 (동일 키는 dedupe로 병합)
      await Promise.all([
        refreshOrders({ force }),
        refreshStats(force),
      ]);
    } finally {
      const elapsed = Date.now() - start;
      const minDuration = 1000; // 최소 1초는 로딩 표시 유지
      if (elapsed < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
      }
      setLastSyncAt(Date.now());
      setIsSyncing(false);
    }
  }, [userData?.userId, refreshOrders, refreshStats, isSyncing, lastSyncAt, globalMutate, isOrdersLoading, isOrdersValidating, isGlobalStatsLoading, isGlobalStatsValidating]);

  const handleOrdersErrorRetry = useCallback(() => {
    setError(null);
    refreshOrders();
  }, [refreshOrders]);

  // 페이지 진입 시 1회 자동 동기화
  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (userData?.userId && !initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      const run = async () => {
        setInitialSyncing(true);
        try {
          await handleSyncNow({ skipIfInFlight: true });
        } finally {
          setInitialSyncing(false);
        }
      };
      run();
    }
  }, [userData?.userId, handleSyncNow]);

  // --- 메모 입력 ref 관리 (uncontrolled input으로 성능 최적화) ---
  const memoInputRefs = useRef({});

  // --- 메모 포커스 핸들러 ---
  const handleMemoFocus = useCallback((orderId, currentValue) => {
    setFocusedMemoId(orderId);
    // 원본 값 저장 (취소 시 복원용)
    setOriginalMemoValues(prev => ({ ...prev, [orderId]: currentValue }));
  }, []);

  // --- 메모 저장 핸들러 ---
  const handleMemoSave = useCallback(async (orderId) => {
    // input ref에서 현재 값 가져오기
    const value = memoInputRefs.current[orderId]?.value || "";

    setMemoSavingStates(prev => ({ ...prev, [orderId]: 'saving' }));

    try {
      const currentUserId = userData?.userId;
      if (!currentUserId) {
        throw new Error("로그인이 필요합니다.");
      }

      // 인증된 클라이언트로 본인 주문만 업데이트
      const sb = getAuthedClient();

      // DB 저장
      const isRawMode = mode === "raw";
      const targetTable = isRawMode ? "comment_orders" : "orders";
      const idColumn = isRawMode ? "comment_order_id" : "order_id";

      const { data, error } = await sb
        .from(targetTable)
        .update({ memo: value || null })
        .eq(idColumn, orderId)
        .eq('user_id', currentUserId)
        .select()
        .single();

      if (error) throw error;

      // 저장 완료
      setMemoSavingStates(prev => ({ ...prev, [orderId]: 'saved' }));
      setFocusedMemoId(null);

      // 2초 후 저장 완료 표시 제거
      setSafeTimeout(() => {
        setMemoSavingStates(prev => {
          const newState = { ...prev };
          delete newState[orderId];
          return newState;
        });
      }, 2000);

      // 로컬/SWR 캐시만 업데이트 (네트워크 재호출 없음)
      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === orderId ? { ...o, memo: data?.memo ?? null } : o
        )
      );
      await mutateOrders(
        (prev) => {
          if (!prev?.data) return prev;
          return {
            ...prev,
            data: prev.data.map((o) =>
              o.order_id === orderId ? { ...o, memo: data?.memo ?? null } : o
            ),
          };
        },
        { revalidate: false, rollbackOnError: true }
      );
      await syncOrdersToIndexedDb([{ ...data }]);
    } catch (error) {
      console.error('메모 저장 오류:', error);
      setMemoSavingStates(prev => ({ ...prev, [orderId]: 'error' }));

      setSafeTimeout(() => {
        setMemoSavingStates(prev => {
          const newState = { ...prev };
          delete newState[orderId];
          return newState;
        });
      }, 3000);
    }
  }, [userData, mutateOrders, syncOrdersToIndexedDb, setSafeTimeout]);

  // --- 메모 취소 핸들러 ---
  const handleMemoCancel = useCallback((orderId) => {
    // 원본 값으로 복원
    const originalValue = originalMemoValues[orderId] || "";
    if (memoInputRefs.current[orderId]) {
      memoInputRefs.current[orderId].value = originalValue;
    }
    setFocusedMemoId(null);
  }, [originalMemoValues]);

  // --- 기존 검색 관련 useEffect 및 핸들러들은 위 함수들로 대체/통합 ---

  const handleSortChange = (field) => {
    if (field === "pickup_date") return; // 수령일시 정렬 비활성화
    if (sortBy === field) {
      // 같은 필드를 다시 클릭: desc → asc → 정렬 해제
      if (sortOrder === "desc") {
        setSortOrder("asc");
      } else if (sortOrder === "asc") {
        setSortBy(null); // 정렬 해제
        setSortOrder("desc"); // 다음에 다시 클릭할 때를 위해 기본값 설정
      }
    } else {
      // 다른 필드 클릭: desc부터 시작
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const togglePickupViewMode = () => {
    setPickupViewMode((prev) => (prev === "simple" ? "detailed" : "simple"));
  };

  const toggleBarcodeViewMode = () => {
    setBarcodeViewMode((prev) => (prev === "small" ? "large" : "small"));
  };
  // 필터 변경 핸들러 (선택된 값을 filterSelection state에 저장)
  const handleFilterChange = (selectedValue) => {
    setFilterSelection(selectedValue); // 사용자가 선택한 값을 그대로 저장
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  // 수령가능만 보기 토글 핸들러
  const handlePickupAvailableToggle = () => {
    const newToggleState = !showPickupAvailableOnly;
    setShowPickupAvailableOnly(newToggleState);

    // localStorage에 상태 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('showPickupAvailableOnly', newToggleState.toString());
    }

    if (newToggleState) {
      // 수령가능만 보기가 활성화되면 주문완료로 설정하고 수령가능 필터 추가
      setFilterSelection("주문완료");
    }

    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  const handleDateRangeChange = (range) => {
    setFilterDateRange(range);
    if (range !== "custom") {
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
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
      handleDateRangeChange("30days");
    }
  };

  useEffect(() => {
    // Page changed, scrolling to top
    if (scrollToTop) {
      // scrollToTop 함수가 존재할 때만 호출
      // 약간의 지연을 주어 DOM 업데이트 후 스크롤 시도
      const timerId = setTimeout(() => {
        scrollToTop();
      }, 0); // 0ms 지연으로도 충분할 수 있음, 필요시 50ms 등으로 조정
      return () => clearTimeout(timerId);
    }
  }, [currentPage, scrollToTop]); // scrollToTop도 의존성 배열에 추가

  const paginate = useCallback((pageNumber) => {
    const total = ordersData?.pagination?.totalPages;
    if (pageNumber < 1) return;
    if (typeof total === "number" && Number.isFinite(total) && pageNumber > total) return;
    setCurrentPage(pageNumber);
    // 테이블 스크롤 위치 초기화
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [ordersData?.pagination?.totalPages]);
  const goToPreviousPage = useCallback(() => paginate(currentPage - 1), [paginate, currentPage]);
  const goToNextPage = useCallback(() => paginate(currentPage + 1), [paginate, currentPage]);
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
      // comment_orders 상세 정보 업데이트
      await updateCommentOrder(order_id, updateData, userData.userId, { revalidate: false });

      // 로컬/SWR 캐시만 업데이트 (네트워크 재호출 없음)
      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === order_id
            ? { ...o, ...updateData }
            : o
        )
      );
      await mutateOrders(
        (prev) => {
          if (!prev?.data) return prev;
          return {
            ...prev,
            data: prev.data.map((o) =>
              o.order_id === order_id ? { ...o, ...updateData } : o
            ),
          };
        },
        { revalidate: false, rollbackOnError: true }
      );

      setIsEditingDetails(false); // 편집 모드 종료
      setIsDetailModalOpen(false); // 모달 닫기
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Update Error (client-side):", err);
      }
      alert(err.message || "주문 정보 업데이트에 실패했습니다.");
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
    setSafeTimeout(() => {
      openCommentsModal(order, prevTryKeyIndex + 1);
    }, 100);
  };

  const handleSaveBarcode = async (productId, barcodeValue) => {
    // handleSaveBarcode called

    if (!barcodeValue.trim()) {
      return;
    }

    // --- !!! 중요: userData.id 대신 userData.userId 사용 확인 !!! ---
    if (!userData || !userData.userId) {
      // userData.id 였던 부분을 userData.userId로 변경
      alert("사용자 정보가 유효하지 않습니다. 다시 로그인해주세요."); // 사용자에게 피드백
      if (process.env.NODE_ENV === "development") {
        console.error(
          "User data or userId is missing. Current userData:",
          userData
        );
      }
      return;
    }
    const userId = userData.userId; // userId 사용
    // --- !!! 중요 수정 끝 !!! ---

    setIsSavingBarcode(true);
    // <<< --- 디버깅 로그 추가 --- >>>
    // Starting barcode save process

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Supabase configuration validated

      if (!supabaseUrl || !supabaseAnonKey) {
        if (process.env.NODE_ENV === "development") {
          console.error("Supabase URL 또는 Anon Key가 설정되지 않았습니다.");
        }
        throw new Error("애플리케이션 설정 오류가 발생했습니다.");
      }

      // Supabase 함수 호출 URL 구성 (productId와 userId를 쿼리 파라미터로 전달)
      const functionUrl = `${supabaseUrl}/functions/v1/products-update-barcode?productId=${encodeURIComponent(
        productId
      )}&userId=${encodeURIComponent(userId)}`;

      // Function URL and request prepared

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

      // 바코드 저장 성공

      // --- !!! 수정된 부분 !!! ---
      // refreshOrdersAndProducts() 대신 SWR의 mutate 함수를 사용합니다.
      if (mutateProducts) {
        await mutateProducts(); // 상품 목록 SWR 캐시 갱신
        // Products list revalidated via SWR mutate
      } else {
        // mutateProducts is not available
      }
      // --- !!! 수정된 부분 끝 !!! ---

      // 성공 시
      setNewBarcodeValue(""); // 입력 필드 초기화
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to save barcode:", error);
      }
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

  // 초기 동기화 중이거나 동기화 버튼 실행 중이면 전체 로딩 화면 유지
  if (initialSyncing || isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-5">
          <ArrowPathIcon className="w-12 h-12 text-gray-400 animate-spin" />
          <div className="text-center space-y-1.5">
            <p className="text-lg font-medium text-gray-900">데이터 동기화 중</p>
            <p className="text-sm text-gray-500">잠시만 기다려주세요</p>
          </div>
        </div>
      </div>
    );
  }
  // 오류가 발생하면 즉시 표시 (로그아웃 대신 새로고침/백업 페이지 이동)
  const forceErrorCard =
    (typeof window !== "undefined" &&
      window?.location?.search?.includes("debugErrorCard=1")) ||
    false;

  if (error || forceErrorCard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <ErrorCard
          title="서버와 연결이 불안정합니다."
          message="새로고침하거나 비상 모드로 이동해 계속 작업하세요."
          onRetry={handleOrdersErrorRetry}
          offlineHref="/offline-orders"
          retryLabel="새로고침"
          className="max-w-md w-full"
        />
      </div>
    );
  }

  // --- 메인 UI ---
  return (
    <div className="min-h-screen bg-gray-200 text-gray-900 flex">
      <style>{datePickerStyle}</style>
      {/* 수동 동기화 로딩 인디케이터 */}
      {isSyncing && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 bg-white border border-gray-200 shadow-lg rounded-lg flex items-center gap-2">
          <ArrowPathIcon className="w-5 h-5 text-orange-500 animate-spin" />
          <span className="text-sm font-medium text-gray-700">동기화 중...</span>
        </div>
      )}

      {/* 주문 방식 변경 안내 모달 */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <ExclamationCircleIcon className="h-6 w-6 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  ⚠️ 주문 방식 변경 안내
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  <strong className="text-red-600">더 이상 상품 매칭 방식이 아닙니다.</strong><br />
                  해당 게시물의 모든 상품이 댓글에 표시되니,<br />
                  <strong className="text-orange-600">댓글 내용을 잘 확인하고 바코드를 찍어주세요.</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={noticeChecked}
                  onChange={(e) => setNoticeChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 select-none">
                  내용을 확인했습니다
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 select-none">
                  다시 보지 않기
                </span>
              </label>
            </div>

            <button
              onClick={() => {
                if (noticeChecked) {
                  // "다시 보지 않기" 체크 시 localStorage에 저장
                  if (dontShowAgain) {
                    localStorage.setItem('orderNoticeConfirmed', 'true');
                  }
                  setShowNoticeModal(false);
                }
              }}
              disabled={!noticeChecked}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${noticeChecked
                ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 일괄 처리 중 로딩 오버레이 */}
      {bulkUpdateLoading && (
        <div className="fixed inset-0 bg-gray-900/60 z-[80] flex items-center justify-center p-4 ">
          <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center">
            <LoadingSpinner className="h-12 w-12 text-orange-500 mb-3" />
            <p className="text-gray-700 font-medium">상태 변경 중...</p>
          </div>
        </div>
      )}

      {/* 테스트 업데이트 로딩 오버레이 */}
      {(isTestUpdating || testUpdateResult) && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[80]"
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

      {/* 우측 메인 컨텐츠 영역 - 페이지 스크롤 */}
      <main className="flex-1">
        {/* 스크롤 최상단 앵커 */}
        <div ref={mainTopRef} className="h-0"></div>
        {/* 필터 섹션 - 임시로 숨김 */}
        <div className="hidden">
          <LightCard padding="p-0" className="mb-6 md:mb-8 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {/* 조회 기간 */}
              <div className="grid grid-cols-[max-content_1fr] items-center">
                <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                  <CalendarDaysIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                  기간
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <DatePicker
                      selectsRange={true}
                      startDate={customStartDate}
                      endDate={customEndDate}
                      onChange={handleCustomDateChange}
                      locale={ko}
                      dateFormat="yyyy.MM.dd"
                      maxDate={new Date()}
                      isClearable={false}
                      placeholderText="날짜 선택"
                      disabled={isDataLoading}
                      popperPlacement="bottom-start"
                      customInput={
                        <CustomDateInputButton
                          isActive={filterDateRange === "custom"}
                          disabled={isDataLoading}
                          value={
                            customStartDate
                              ? `${formatDateForPicker(customStartDate)}${customEndDate
                                ? ` ~ ${formatDateForPicker(customEndDate)}`
                                : ""
                              }`
                              : ""
                          }
                        />
                      }
                    />
                    {customStartDate && (
                      <div className="flex items-center gap-2">
                        
                        <button
                          type="button"
                          onClick={clearDateRangeFilter}
                          className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                          title="기간 초기화"
                          disabled={isDataLoading}
                        >
                          <XMarkIcon className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    )}
                  </div>
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
            </div>
          </LightCard>
        </div>



        {/* 필터 섹션 */}
        <div className="px-4 lg:px-6 pt-4 relative z-[60]">
          <div>
            <LightCard padding="p-0" className="relative z-[60] overflow-visible">
              <div className="divide-y divide-gray-200">
                {/* 조회 기간 */}
                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-3 md:px-5 py-3 md:py-4 text-xs md:text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-20 md:w-20 self-stretch rounded-tl-xl">
                    
                    <span className="hidden sm:inline">기간</span>
                    <span className="sm:hidden">기간</span>
                  </div>
                  <div className="bg-white px-4 md:px-4 py-0 md:py-0 flex items-center gap-x-4 md:gap-x-4 gap-y-3 flex-wrap rounded-tr-xl relative z-50">
                    <div className="flex items-center gap-2">
                      <DatePicker
                        selectsRange={true}
                        startDate={customStartDate}
                        endDate={customEndDate}
                        onChange={handleCustomDateChange}
                        locale={ko}
                        dateFormat="yyyy.MM.dd"
                        maxDate={new Date()}
                        isClearable={false}
                        placeholderText="직접 선택"
                        disabled={isDataLoading}
                        popperPlacement="bottom-start"
                        popperProps={{ strategy: 'fixed' }}
                        popperClassName="!z-50"
                        customInput={
                          <CustomDateInputButton
                            isActive={filterDateRange === "custom"}
                            disabled={isDataLoading}
                            value={
                              customStartDate
                                ? `${formatDateForPicker(customStartDate)}${customEndDate
                                  ? ` ~ ${formatDateForPicker(customEndDate)}`
                                  : ""
                                }`
                                : ""
                            }
                          />
                        }
                      />
                      {customStartDate && (
                        <div className="flex items-center gap-2">
                          
                          <button
                            type="button"
                            onClick={clearDateRangeFilter}
                            className="w-8 h-8 rounded-full bg-orange-500 text-orange-200 hover:bg-orange-200 hover:text-orange-800 transition-colors"
                            title="기간 초기화"
                            disabled={isDataLoading}
                          >
                            <XMarkIcon className="w-4 h-4 mx-auto" />
                            
                          </button>
                        </div>
                      )}
                    </div>
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
                  <div className="bg-gray-50 px-3 md:px-5 py-3 md:py-2 text-xs md:text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-20 md:w-20 self-stretch rounded-bl-xl">
                    
                    상태
                  </div>
                  <div className="bg-white px-4 md:px-6 py-3 md:py-3 rounded-br-xl">
                    <CustomRadioGroup
                      name="orderStatus"
                      options={orderStatusOptions}
                      selectedValue={filterSelection}
                      onChange={handleFilterChange}
                      disabled={isDataLoading}
                    />
                  </div>
                </div>
              </div>
            </LightCard>
          </div>
        </div>

        {/* 검색 필터 - sticky */}
        <OrdersSearchBar
          ref={searchBarRef}
          initialSearchType={appliedSearchType}
          onSearchTypeChange={(nextType) => {
            searchTypeRef.current = nextType;
          }}
          searchInputRef={searchInputRef}
          isDataLoading={isDataLoading}
          isSyncing={isSyncing}
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          onSyncNow={handleSyncNow}
          onClearInput={clearInputValue}
          onRefreshOrders={refreshOrders}
          onMutateProducts={mutateProducts}
          totalItems={totalItems}
          userFunctionNumber={userData?.function_number}
          onKeyStatusChange={(keyStatus) => {
            if (keyStatus) setBandKeyStatus(keyStatus);
          }}
          onProcessingChange={(isProcessing, result) => {
            setIsTestUpdating(isProcessing);
            if (!isProcessing && result) {
              setTestUpdateResult(result);
              setSafeTimeout(() => setTestUpdateResult(null), 3000);
            }
          }}
        />

        {/* 주문 리스트 영역 */}
        <div className="pb-24 px-2 lg:px-6 pt-4 mt-0">
          <div className="bg-white rounded-lg shadow-sm">
            {/* 업데이트 버튼 제거: 상단 우측 영역으로 이동 */}
            {/* 테이블 컨테이너 */}
            <div ref={tableContainerRef} className="relative">
              <table className="min-w-full ">
              <thead className="bg-black sticky top-[140px] sm:top-[120px] md:top-[88px] lg:top-[92px] z-10">
                  <tr>
                    <th
                      scope="col"
                      className="relative w-20 px-6 sm:w-16 sm:px-8 py-3 bg-gray-50"
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
                    <th className="py-2 px-1 lg:px-2 xl:px-3 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-26 bg-gray-50">
                      <button
                        onClick={() => handleSortChange("customer_name")}
                        className="inline-flex items-center bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isDataLoading}
                      >
                        고객명 {getSortIcon("customer_name")}
                      </button>
                    </th>
                    <th className="py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-24 bg-gray-50">
                      상태
                    </th>
                    <th
                      className={`py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-700 uppercase tracking-wider w-20 xl:w-32 bg-gray-50 transition-colors ${isDataLoading
                        ? "cursor-not-allowed"
                        : "cursor-pointer select-none hover:bg-gray-100"
                        }`}
                      onClick={isDataLoading ? undefined : togglePickupViewMode}
                      onKeyDown={isDataLoading ? undefined : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePickupViewMode();
                        }
                      }}
                      role="button"
                      tabIndex={isDataLoading ? -1 : 0}
                      title={isDataLoading ? "로딩 중..." : "수령일 보기 모드 전환"}
                    >
                      <span className="text-gray-800 hover:text-orange-600">수령일</span>
                    </th>
                    <th className="py-2 px-2 lg:px-4 xl:px-6 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                      댓글
                    </th>
                    <th className="py-2 px-2 lg:px-4 xl:px-6 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-60 bg-gray-50">
                      상품정보
                    </th>
                    <th
                      className={`py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-700 uppercase tracking-wider w-40 bg-gray-50 transition-colors ${isDataLoading
                        ? "cursor-not-allowed"
                        : "cursor-pointer select-none hover:bg-gray-100"
                        }`}
                      onClick={isDataLoading ? undefined : toggleBarcodeViewMode}
                      onKeyDown={isDataLoading ? undefined : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleBarcodeViewMode();
                        }
                      }}
                      role="button"
                      tabIndex={isDataLoading ? -1 : 0}
                      title={isDataLoading ? "로딩 중..." : "바코드 크기 전환"}
                    >
                      <div className="inline-flex items-center justify-center gap-1.5 text-gray-800 hover:text-orange-600">
                        <span>바코드</span>
                        {barcodeViewMode === "small" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                          </svg>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isOrdersLoading && !ordersData && (
                    <tr>
                      <td colSpan="7" className="px-6 py-10 text-center">
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
                        colSpan="7"
                        className="px-6 py-10 text-center text-base md:text-lg text-gray-500"
                      >
                        {searchTerm
                          ? `'${searchTerm}'로 검색 결과가 없습니다. 다른 이름으로 검색해주세요.`
                          : filterSelection !== "all" ||
                            filterDateRange !== "30days" || // 기본값 변경 반영
                            (filterDateRange === "custom" &&
                              (customStartDate || customEndDate))
                            ? "조건에 맞는 주문이 없습니다."
                            : "표시할 주문이 없습니다."}
                      </td>
                    </tr>
                  )}
                  {groupedOrders.map((group) => {
                    const order = group.rep;
                    const isSelected = group.orderIds.every((id) => selectedOrderIdSet.has(id));
                    const product = getProductById(order.product_id);
                    const hasMultipleBarcodeOptions =
                      product?.barcode_options?.options?.length > 1;

                    return (
                      <React.Fragment key={group.groupId}>
                        <tr
                          className={`${editingOrderId === order.order_id
                            ? "bg-blue-50 border-l-4 border-blue-400"
                            : isSelected
                              ? "bg-orange-50"
                              : "hover:bg-gray-50"
                            } transition-colors group ${isOrdersLoading ? "opacity-70" : ""
                            }`}
                        >
                          <td
                            onClick={(e) => e.stopPropagation()}
                            className="relative w-12 px-6 sm:w-16 sm:px-8"
                          >
                            <div className="absolute inset-y-0 left-4 sm:left-6 flex items-center">
                              <input
                                type="checkbox"
                                className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                                value={group.groupId}
                                checked={selectedOrderIdSet.has(order.order_id)}
                                onChange={(e) => handleCheckboxChange(e, group.groupId)}
                              />
                            </div>
                          </td>
                          {/* 고객명 */}
                          <td
                            className="py-2 xl:py-3 pr-1 md:pr-2 xl:pr-3 w-24"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExactCustomerSearch(order.customer_name);
                            }}
                          >
                            <div className="flex items-center min-h-[60px]">
                              <span
                                className="text-md text-gray-700 font-medium hover:text-orange-600 hover:underline cursor-pointer break-words line-clamp-2 xl:line-clamp-1"
                                title={order.customer_name}
                              >
                                {order.customer_name || "-"}
                              </span>
                            </div>
                          </td>
                          {/* 상태 */}
                          <td className="py-2 xl:py-3 px-1 lg:px-4 xl:px-6 text-center whitespace-nowrap w-24">
                            <StatusBadge
                              status={order.status}
                              processingMethod={order.processing_method}
                              completedAt={order.completed_at}
                              orderedAt={order.ordered_at}
                              paidAt={order.paid_at}
                              canceledAt={order.canceled_at}
                            />
                          </td>
                          {/* 수령일시 */}
                          <td className="py-2 xl:py-3 px-1 md:px-3 lg:px-4 xl:px-6 text-center w-20 md:w-24 xl:w-32">
                            {(() => {
                              const list = getCandidateProductsForOrder(order);
                              let displayProd = null;
                              if (order.product_id) {
                                displayProd = list.find(p => p.product_id === order.product_id) || getProductById(order.product_id) || null;
                              }
                              if (!displayProd) displayProd = list[0] || null;
                              const pickupDate = displayProd?.pickup_date || null;
                              return (
                                <div className="text-sm md:text-base font-medium text-gray-900">
                                  {renderPickupDisplay(pickupDate)}
                                </div>
                              );
                            })()}
                          </td>
                          {/* 댓글 */}
                          <td className="py-2 xl:py-3 px-2 md:px-3 lg:px-4 xl:px-6 w-60 md:w-72 xl:w-80">
                            <div>
                              {(() => {
                                const currentComment = processBandTags(order.comment || "");
                                let commentChangeData = null;

                                // comment_change 파싱
                                try {
                                  if (order.comment_change) {
                                    const parsed = typeof order.comment_change === 'string'
                                      ? JSON.parse(order.comment_change)
                                      : order.comment_change;
                                    if (
                                      parsed &&
                                      (parsed.status === 'updated' || parsed.status === 'deleted') &&
                                      Array.isArray(parsed.history) &&
                                      parsed.history.length > 0
                                    ) {
                                      commentChangeData = parsed;
                                    }
                                  }
                                } catch (e) {
                                  // JSON 파싱 실패 시 무시
                                }

                                // 수정/삭제 되지 않은 댓글
                                if (!commentChangeData) {
                                  return (
                                    <div className="break-words leading-tight font-semibold" title={currentComment}>
                                      {order.sub_status === "확인필요" && (
                                        <span className="text-orange-500 font-bold mr-1">[확인필요]</span>
                                      )}
                                      {currentComment || "-"}
                                    </div>
                                  );
                                }

                                // 수정/삭제된 댓글: 이전/현재 모두 표시
                                const history = commentChangeData.history || [];
                                const pickPrevious = () => {
                                  // 직전 버전(마지막 항목 제외)에서 삭제 아닌 내용 찾기
                                  for (let i = history.length - 2; i >= 0; i -= 1) {
                                    const entry = history[i] || '';
                                    if (entry.includes('[deleted]')) continue;
                                    return entry.replace(/^version:\d+\s*/, '');
                                  }
                                  return '';
                                };
                                const previousComment = pickPrevious();
                                const latestCommentRaw = commentChangeData.current || currentComment || '';
                                const latestComment = commentChangeData.status === 'deleted'
                                  ? (previousComment || currentComment || '')
                                  : processBandTags(latestCommentRaw);
                                const showPrevious =
                                  commentChangeData.status !== 'deleted' &&
                                  previousComment &&
                                  previousComment.trim() !== latestComment.trim();

                                return (
                                  <div className="space-y-1">
                                    {showPrevious && (
                                      <div className="text-gray-500 line-through text-sm">
                                        <span className="font-semibold text-gray-400 mr-1">[기존댓글]</span>
                                        <span className="break-words leading-tight font-semibold">{previousComment}</span>
                                      </div>
                                    )}
                                    <div className="break-words leading-tight">
                                      {order.sub_status === "확인필요" && (
                                        <span className="text-orange-500 font-bold mr-1">[확인필요]</span>
                                      )}
                                      <span className="text-sm font-semibold text-orange-600 mr-1">
                                        {commentChangeData.status === 'deleted' ? '[유저에 의해 삭제된 댓글]' : '[수정됨]'}
                                      </span>
                                      <span className="font-semibold">{latestComment}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* 주문일시 */}
                              <div className="text-xs xl:text-sm text-gray-400 mt-1">
                                {formatDate(order.ordered_at)}
                              </div>
                              {/* 메모 */}
                              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                {(() => {
                                  // 디버깅: 실제 렌더링되는 order 확인
                                  if (order.order_id === 'order_AACtJhiiFjk5bNW_h69B8PUa_AABo75gGOTZMybZkBI7Nh0S0_item1') {
                                    console.log('[렌더링 디버깅]', {
                                      order_id: order.order_id,
                                      memo: order.memo,
                                      hasMemo: 'memo' in order,
                                      memoType: typeof order.memo,
                                      memoLength: order.memo?.length
                                    });
                                  }
                                  return null;
                                })()}
                                <div className="relative">
                                  <input
                                    type="text"
                                    ref={(el) => {
                                      if (el) {
                                        memoInputRefs.current[order.order_id] = el;
                                      }
                                    }}
                                    className={`w-full px-2 xl:px-3 py-1.5 xl:py-2 text-sm md:text-base xl:text-lg border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${order.memo ? "bg-red-50 text-red-600 font-semibold border-red-300" : ""
                                      }`}
                                    placeholder="메모 입력..."
                                    defaultValue={order.memo || ""}
                                    onFocus={() => handleMemoFocus(order.order_id, order.memo || "")}
                                  />

                                  {/* 저장/취소 버튼 (포커스 시 표시) */}
                                  {focusedMemoId === order.order_id && !memoSavingStates[order.order_id] && (
                                    <div className="absolute top-full left-0 mt-1 flex gap-1 z-50 shadow-md">
                                      <button
                                        onClick={() => handleMemoSave(order.order_id)}
                                        className="px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:scale-[0.99] transition"
                                      >
                                        저장
                                      </button>
                                      <button
                                        onClick={() => handleMemoCancel(order.order_id)}
                                        className="px-3 py-2 text-sm bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 active:scale-[0.99] transition"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  )}

                                  {/* 저장 상태 표시 */}
                                  {memoSavingStates[order.order_id] && (
                                    <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1 text-xs">
                                      {memoSavingStates[order.order_id] === 'saving' && (
                                        <>
                                          <svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                          </svg>
                                          <span className="text-gray-500">저장 중...</span>
                                        </>
                                      )}
                                      {memoSavingStates[order.order_id] === 'saved' && (
                                        <>
                                          <svg className="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                          </svg>
                                          <span className="text-green-600">저장됨</span>
                                        </>
                                      )}
                                      {memoSavingStates[order.order_id] === 'error' && (
                                        <>
                                          <svg className="h-3 w-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                          </svg>
                                          <span className="text-red-600">저장 실패</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* 상품정보: 게시물의 모든 상품을 표시 (raw 모드처럼) */}
                          <td
                            className="py-2 xl:py-3 pl-2 lg:pl-4 xl:pl-6 text-sm md:text-base xl:text-xl text-gray-700 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              const list = getCandidateProductsForOrder(order) || [];
                              if (!Array.isArray(list) || list.length === 0) {
                                return <span className="text-gray-400">-</span>;
                              }

                              const getItemNumber = (p, idx) => {
                                const n1 = Number(p?.item_number);
                                if (Number.isFinite(n1) && n1 > 0) return n1;
                                try {
                                  const m = String(p?.product_id || '').match(/item(\d+)/i);
                                  if (m && m[1]) {
                                    const n = parseInt(m[1], 10);
                                    if (Number.isFinite(n) && n > 0) return n;
                                  }
                                } catch { }
                                return idx + 1;
                              };


                              return (
                                <div className="space-y-2">
                                  {list.map((p, idx) => {
                                    const itemNo = getItemNumber(p, idx);
                                    const rawTitle = p?.title || p?.name || '-';
                                    const title = cleanProductName(rawTitle);
                                    const price = Number.isFinite(Number(p?.base_price))
                                      ? Number(p.base_price)
                                      : (Number.isFinite(Number(p?.price)) ? Number(p.price) : null);
                                    let imgUrl = p?.image_url || p?.thumbnail_url || p?.thumb_url || null;
                                    if (!imgUrl) {
                                      const bk = p?.band_key || order?.band_key;
                                      const pk = p?.post_key || order?.post_key;
                                      if (bk && pk) {
                                        const key = `${bk}_${pk}`;
                                        const arr = postsImages[key];
                                        if (Array.isArray(arr) && arr.length > 0) imgUrl = arr[0];
                                      }
                                    }
                                    const isLastProduct = idx === list.length - 1;
                                    return (
                                      <div
                                        key={p?.product_id || `${idx}`}
                                        className={`p-2 flex items-start gap-2 ${!isLastProduct ? "border-b border-gray-200 " : ""}`}
                                        style={{ minHeight: "86px" }}
                                        title={title}
                                      >
                                        <div className="w-14 h-14 rounded-md overflow-hidden bg-white flex-shrink-0 border border-gray-200">
                                          {imgUrl ? (
                                            <img
                                              src={getProxiedImageUrl(imgUrl, { thumbnail: 's150' })}
                                              alt={title}
                                              loading="lazy"
                                              width="56"
                                              height="56"
                                              className="w-full h-full object-cover"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">이미지</div>
                                          )}
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-start xl:items-center gap-2">
                                            {list.length > 1 && (
                                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 flex-shrink-0">
                                                {itemNo}번
                                              </span>
                                            )}
                                            <span
                                              className={`text-sm md:text-base xl:text-lg leading-snug text-gray-900 font-medium break-words line-clamp-2 xl:whitespace-nowrap cursor-pointer hover:text-orange-600 hover:underline`}
                                              onClick={() => handleCellClickToSearch(title, order.post_key)}
                                              title="클릭하여 이 게시물의 주문 검색"
                                            >
                                              {title}
                                            </span>
                                          </div>
                                          {price != null && (
                                            <div className="text-sm md:text-base xl:text-lg text-gray-700 mt-0.5">₩{price.toLocaleString()}</div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </td>
                          {/* 바코드 */}
                          <td className="py-2 xl:py-3 pr-1 lg:pr-4 xl:pr-6 text-center text-base xl:text-lg text-gray-700 w-32 align-top">
                            {(() => {
                              const list = getCandidateProductsForOrder(order) || [];
                              if (!Array.isArray(list) || list.length === 0) return <span className="text-sm text-gray-400">없음</span>;
                              return (
                                <div className="space-y-2">
                                  {list.map((p, idx) => {
                                    const barcodeVal = p?.barcode || '';
                                    const isLastBarcode = idx === list.length - 1;
                                    return (
                                      <div
                                        key={p?.product_id || `${idx}`}
                                        className={`flex items-center justify-center px-2 ${isLastBarcode ? "py-2" : "pt-2  border-b border-gray-200"}`}
                                        style={{ minHeight: barcodeViewMode === "large" ? "120px" : "86px" }}
                                      >
                                        {barcodeVal ? (
                                          <Barcode
                                            value={barcodeVal}
                                            height={barcodeViewMode === "large" ? 50 : 32}
                                            width={barcodeViewMode === "large" ? 1.8 : 1.2}
                                            fontSize={barcodeViewMode === "large" ? 16 : 12}
                                          />
                                        ) : (
                                          <span className="text-sm text-gray-400">없음</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>

                        {/* 바코드 옵션 행 제거 (raw 스타일 간단 테이블) */}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 - 검색 여부와 상관없이 표시 (하단 고정) */}
            {showPagination && (
              <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-t border-gray-200 bg-white">
                <div>
                  <p className="text-sm text-gray-700">
                    {isTotalCountKnown ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          {displayOrders.length > 0
                            ? `${(currentPage - 1) * itemsPerPage + 1}-${(currentPage - 1) * itemsPerPage + displayOrders.length}`
                            : "0"}
                        </span>
                        표시
                        <span className="ml-2 text-xs text-gray-400">
                          (총 개수는 생략됨)
                        </span>
                      </>
                    )}
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
                    이전
                  </button>
                  {typeof totalPages === "number" && Number.isFinite(totalPages) && totalPages > 1 ? (
                    (() => {
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
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${currentPage === page
                              ? "z-10 bg-gray-200 border-gray-500 text-gray-600"
                              : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                              }`}
                            aria-current={
                              currentPage === page ? "page" : undefined
                            }
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
                    })()
                  ) : null}
                  <button
                    onClick={goToNextPage}
                    disabled={
                      isDataLoading ||
                      (typeof totalPages === "number" && Number.isFinite(totalPages)
                        ? currentPage >= totalPages
                        : !hasMore)
                    }
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다음
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* 일괄 처리 버튼 - 하단 고정 */}
        {displayOrders.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg z-30 px-4 lg:px-6 py-4">
            <div className={`mx-auto flex items-center justify-between gap-4 ${isButtonsReversed ? 'flex-row-reverse' : ''}`}>
              {/* 버튼 옮기기 */}
              <div className="flex items-center">
                <button
                  onClick={() => {
                    const newState = !isButtonsReversed;
                    setIsButtonsReversed(newState);
                    // localStorage에 상태 저장
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('orders-buttons-reversed', newState.toString());
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border-2 border-dashed border-gray-400 rounded-lg hover:border-orange-500 hover:text-orange-600 transition-colors"
                >
                  버튼 옮기기
                </button>
              </div>

              {/* 선택 개수 + 일괄 처리 버튼 */}
              <div className={`flex items-center gap-2 ${isButtonsReversed ? 'flex-row-reverse' : ''}`}>
                <span className="text-sm font-medium text-gray-700">
                  선택: <span className="text-orange-600 font-bold">{selectedOrderIds.length}</span>개
                </span>
                <div className={`flex gap-3 ${isButtonsReversed ? 'flex-row-reverse' : ''}`}>
                  <button
                    onClick={() => handleBulkStatusUpdate("주문취소")}
                    disabled={selectedOrderIds.length === 0 || isDataLoading}
                    className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <XCircleIcon className="w-5 h-5 mr-1.5" />
                    주문취소
                  </button>
                  <button
                    onClick={() => handleBulkStatusUpdate("결제완료")}
                    disabled={selectedOrderIds.length === 0 || isDataLoading}
                    className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <CurrencyDollarIcon className="w-5 h-5 mr-1.5" />
                    결제완료
                  </button>
                  <button
                    onClick={() => handleBulkStatusUpdate("주문완료")}
                    disabled={selectedOrderIds.length === 0 || isDataLoading}
                    className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <ArrowLongLeftIcon className="w-5 h-5 mr-1.5" />
                    주문완료로 되돌리기
                  </button>
                  <button
                    onClick={() => handleBulkStatusUpdate("수령완료")}
                    disabled={selectedOrderIds.length === 0 || isDataLoading}
                    className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <CheckCircleIcon className="w-5 h-5 mr-1.5" />
                    수령완료
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- 주문 상세 모달 (주문 정보 탭 복구) --- */}
      {ENABLE_DETAIL_MODAL && isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 ">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">
                {(() => {
                  const productName = getProductNameById(
                    selectedOrder.product_id
                  );
                  const { name, date } = parseProductName(productName);
                  const product = getProductById(selectedOrder.product_id);
                  const primary = product?.pickup_date;
                  const pickupDate = pickEffectivePickupSource(primary, date);
                  const isAvailable =
                    isClient && pickupDate ? isPickupAvailable(pickupDate) : false;

                  return (
                    <div className="flex flex-col">
                      <div
                        className={`${isAvailable ? "text-orange-600 font-bold" : ""
                          }`}
                      >
                        {name}
                      </div>
                      {pickupDate && (
                        <div
                          className={`text-sm mt-1 ${isAvailable
                            ? "text-orange-500 font-medium"
                            : "text-gray-500"
                            }`}
                        >
                          [{formatPickupKSTLabel(pickupDate)}]
                          {isAvailable && (
                            <span className="ml-1 text-orange-600 font-bold">
                              ✓ 수령가능
                            </span>
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
            <div className="flex-grow overflow-y-auto p-4 sm:p-6">
              {/* 탭 네비게이션 */}
              <div className="border-b border-gray-200 mb-6">
                <div className="flex -mb-px space-x-6 sm:space-x-8">
                  {/* 상태 관리 탭 */}
                  <button
                    onClick={() => handleTabChange("status")}
                    className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === "status"
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                  >
                    <QrCodeIcon className="w-5 h-5 mr-1.5" /> 상태 관리
                  </button>
                  {/* 주문 정보 탭 (복구) */}
                  <button
                    onClick={() => handleTabChange("info")}
                    className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === "info"
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                  >
                    <DocumentTextIcon className="w-5 h-5 mr-1.5" /> 주문 정보
                  </button>
                  {/* 주문 처리 탭 */}
                  <button
                    onClick={() => handleTabChange("processing")}
                    className={`inline-flex items-center pb-3 px-1 border-b-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === "processing"
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
                {/* 상태 관리 탭 내용 */}
                {activeTab === "status" && (
                  <div className="space-y-5">
                    <LightCard padding="p-4" className="text-center bg-gray-50">
                      <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                        상품 바코드
                      </label>
                      <div className="max-w-xs mx-auto h-[70px] flex items-center justify-center">
                        {" "}
                        {/* 세로 정렬 및 최소 높이 보장 */}
                        {getProductBarcode(selectedOrder.product_id) ? (
                          <Barcode
                            value={getProductBarcode(selectedOrder.product_id)}
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
                            {processBandTags(selectedOrder.comment) || (
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
                          <StatusBadge
                            status={selectedOrder.status}
                            processingMethod={selectedOrder.processing_method}
                            completedAt={selectedOrder.completed_at}
                            orderedAt={selectedOrder.ordered_at}
                            paidAt={selectedOrder.paid_at}
                            canceledAt={selectedOrder.canceled_at}
                          />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 items-center w-full sm:w-auto">
                          {["주문완료", "주문취소", "확인필요"].map(
                            (status) => {
                              const isCurrent = selectedOrder.status === status;
                              return (
                                <div
                                  key={status}
                                  className="flex items-center gap-1"
                                >
                                  <button
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
                                  {/* AI/패턴 처리 아이콘 - 주문완료 버튼 옆에만 표시 */}
                                  {status === "주문완료" &&
                                    selectedOrder.processing_method && (
                                      <div className="flex items-center">
                                        {selectedOrder.processing_method ===
                                          "ai" && (
                                            <div
                                              className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-medium"
                                              title="AI 처리된 주문"
                                            >
                                              <SparklesIcon className="w-3 h-3" />
                                              <span>AI</span>
                                            </div>
                                          )}
                                        {selectedOrder.processing_method ===
                                          "pattern" && (
                                            <div
                                              className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium"
                                              title="패턴 처리된 주문"
                                            >
                                              <FunnelIcon className="w-3 h-3" />
                                              <span>패턴</span>
                                            </div>
                                          )}
                                        {selectedOrder.processing_method ===
                                          "manual" && (
                                            <div
                                              className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium"
                                              title="수동 처리된 주문"
                                            >
                                              <PencilIcon className="w-3 h-3" />
                                              <span>수동</span>
                                            </div>
                                          )}
                                      </div>
                                    )}
                                </div>
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
                        value: (() => {
                          const productName = getProductNameById(
                            selectedOrder.product_id
                          );
                          const { name, date } = parseProductName(productName);
                          const product = getProductById(selectedOrder.product_id);
                          const primary = product?.pickup_date;
                          const pickupDate = pickEffectivePickupSource(primary, date);
                          const isAvailable =
                            isClient && pickupDate ? isPickupAvailable(pickupDate) : false;

                          return (
                            <div className="flex flex-col">
                              <div
                                className={`${isAvailable ? "text-orange-600 font-bold" : ""
                                  }`}
                              >
                                {name}
                              </div>
                              {pickupDate && (
                                <div
                                  className={`text-sm mt-1 ${isAvailable
                                    ? "text-orange-500 font-medium"
                                    : "text-gray-500"
                                    }`}
                                >
                                  [{formatPickupKSTLabel(pickupDate)}]
                                  {isAvailable && (
                                    <span className="ml-1 text-orange-600 font-bold">
                                      ✓ 수령가능
                                    </span>
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
                        value: (() => {
                          const product = getProductById(selectedOrder.product_id);
                          const d = product?.pickup_date;
                          return d ? formatDate(d) : "-";
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
                            className={`px-3 py-2 rounded-md border ${item.highlight
                              ? "bg-orange-50 border-orange-200 text-orange-700 font-semibold text-lg"
                              : "bg-gray-100 border-gray-200 text-gray-800"
                              } ${item.smallText ? "text-xs break-all" : "text-sm"
                              } ${item.preWrap // Apply preWrap style if needed
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
                              handleTempInputChange(item.field, e.target.value)
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
                        icon={PencilIcon}
                        isLoading={false /* 필요 시 로딩 상태 추가 */}
                      >
                        변경사항 저장
                      </StatusButton>
                    </div>
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
                                숫자나 수량 단위가 감지되어 자동 처리되었습니다.
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
                                  processBandTags(selectedOrder.comment) || "";
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
                                  return `${Math.floor(minutes / 60)}시간 전`;
                                } else {
                                  return `${Math.floor(minutes / 1440)}일 전`;
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
    </div>
  );
}

// Dispatcher: choose raw comment-orders view or legacy orders view
export default function OrdersTestPage() {
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
  return <OrdersTestPageContent mode={mode} />;
}
