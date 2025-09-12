"use client";

import { useState, useEffect, useRef, forwardRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../hooks"; // 훅 경로 확인 필요
import {
  useProductsClient,
  useProductClient,
  useProductClientMutations,
} from "../hooks/useProductsClient";
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import supabase from "../lib/supabaseClient";

import JsBarcode from "jsbarcode";
import { useSWRConfig } from "swr";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction"; // execution_locks 확인 기능 활성화된 버튼

// --- 아이콘 (Heroicons) ---
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  QrCodeIcon,
  InformationCircleIcon,
  XMarkIcon,
  PrinterIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  ExclamationCircleIcon,
  TagIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  FunnelIcon,
  CalendarDaysIcon,
  ArrowUturnLeftIcon,
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

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

// --- 상태 배지 (판매 상태용) ---
function StatusBadge({ status }) {
  let bgColor, textColor;
  switch (status) {
    case "판매중":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      break;
    case "마감":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      break;
    // case "판매중지":
    //   bgColor = "bg-yellow-100";
    //   textColor = "text-yellow-600";
    //   break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-500";
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      {status}
    </span>
  );
}

// --- 카드 래퍼 ---
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
const Barcode = ({ value, width = 1.5, height = 40, displayValue = true, fontSize = 12, margin = 5, textMargin = 2 }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width: width,
          height: height,
          displayValue: displayValue,
          fontSize: fontSize,
          margin: margin,
          textMargin: textMargin,
          background: "#FFFFFF",
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
        if (barcodeRef.current) {
          barcodeRef.current.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="red" font-size="12">Error</text>`;
        }
      }
    } else if (barcodeRef.current) {
      barcodeRef.current.innerHTML = "";
    }
  }, [value, width, height]);
  if (!value) return <div className="text-gray-500 text-xs italic">-</div>;
  return (
    <svg ref={barcodeRef} className="w-full max-w-[120px] h-auto block"></svg>
  );
};

// --- Custom Date Input Button ---
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

// 바코드 옵션 관리 컴포넌트
function BarcodeOptionsManager({
  selectedProduct,
  editedProduct,
  setEditedProduct,
  userData,
}) {
  const [barcodeOptions, setBarcodeOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { patchProduct } = useProductClientMutations();

  // 초기값 설정
  useEffect(() => {
    if (
      selectedProduct?.barcode_options?.options &&
      selectedProduct.barcode_options.options.length > 0
    ) {
      // 데이터베이스에서 불러온 옵션들에 고유 ID 보장
      const optionsWithId = selectedProduct.barcode_options.options.map(
        (option, index) => ({
          ...option,
          id: option.id || `option_${Date.now()}_${index}`, // 고유 ID 보장
        })
      );

      // 중복 바코드 검사 및 자동 수정
      const fixedOptions = [];
      const usedBarcodes = new Set();

      optionsWithId.forEach((option, index) => {
        let barcode = option.barcode;

        // 바코드가 비어있거나 중복된 경우 새로 생성
        if (!barcode || usedBarcodes.has(barcode)) {
          const baseBarcode =
            selectedProduct?.barcode || `BC${Date.now().toString().slice(-8)}`;
          barcode = generateUniqueBarcode(
            baseBarcode,
            Array.from(usedBarcodes),
            index === 0 ? "" : `OPT${index}`
          );

          console.warn(
            `중복된 바코드 발견: "${option.barcode}" → "${barcode}"로 수정됨`
          );
        }

        usedBarcodes.add(barcode);
        fixedOptions.push({
          ...option,
          barcode: barcode,
        });
      });

      setBarcodeOptions(fixedOptions);
    } else {
      // 항상 기본 옵션 생성 (기존 상품 바코드 기반)
      const mainOption = {
        id: `main_${Date.now()}`,
        name: "기본상품",
        price: selectedProduct?.base_price || 0,
        barcode: selectedProduct?.barcode || "",
        is_main: true,
      };
      setBarcodeOptions([mainOption]);
    }
  }, [selectedProduct]);

  // 고유한 바코드 생성 함수
  const generateUniqueBarcode = (
    baseBarcode,
    existingBarcodes,
    suffix = ""
  ) => {
    if (!baseBarcode) {
      // 기본 바코드가 없으면 랜덤 생성
      baseBarcode = `BC${Date.now().toString().slice(-8)}`;
    }

    let newBarcode = suffix
      ? `${baseBarcode}${suffix}`
      : `${baseBarcode}OPT${Date.now().toString().slice(-4)}`;
    let counter = 1;

    // 중복 검사 및 고유 바코드 생성
    while (existingBarcodes.includes(newBarcode)) {
      newBarcode = `${baseBarcode}OPT${Date.now()
        .toString()
        .slice(-4)}${counter}`;
      counter++;
    }

    return newBarcode;
  };

  // 바코드 추가 (최대 4개 제한)
  const addOption = () => {
    if (barcodeOptions.length >= 4) {
      alert("바코드 옵션은 최대 4개까지 추가할 수 있습니다.");
      return;
    }

    const barcodeNumber =
      barcodeOptions.filter((opt) => !opt.is_main).length + 1;

    const newOption = {
      id: `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `바코드${barcodeNumber}`,
      price: selectedProduct?.base_price || 0,
      barcode: "", // 빈칸으로 시작
      is_main: false,
    };
    setBarcodeOptions([...barcodeOptions, newOption]);
  };

  // 옵션 삭제
  const removeOption = (optionId) => {
    const optionToRemove = barcodeOptions.find((opt) => opt.id === optionId);
    if (optionToRemove?.is_main) {
      alert("기본 옵션은 삭제할 수 없습니다.");
      return;
    }
    setBarcodeOptions(barcodeOptions.filter((opt) => opt.id !== optionId));
  };

  // 옵션 수정
  const updateOption = (optionId, field, value) => {
    console.log(`Updating option ${optionId}, field: ${field}, value:`, value); // 디버깅

    setBarcodeOptions((prev) => {
      const updated = prev.map((opt) => {
        if (opt.id === optionId) {
          // 바코드 필드 수정 시 중복 검사 (alert 제거, UI에서만 표시)
          // 중복된 경우에도 값은 업데이트하되, UI에서 경고 표시하여 사용자 경험 개선
          const updatedOption = { ...opt, [field]: value };
          console.log(`Updated option:`, updatedOption); // 디버깅
          return updatedOption;
        }
        return opt;
      });
      console.log(`All options after update:`, updated); // 디버깅
      return updated;
    });
  };

  // 저장 함수
  // 바코드 옵션 유효성 검사 함수 (외부에서 호출 가능)
  const validateBarcodeOptions = () => {
    // 유효성 검사
    const hasEmptyFields = barcodeOptions.some(
      (opt) => !opt.name.trim() || !opt.barcode.trim() || opt.price <= 0
    );
    if (hasEmptyFields) {
      return "모든 바코드의 이름, 바코드, 가격을 입력해주세요.";
    }

    // 중복 바코드 검사 (더 정확한 검사)
    const barcodeMap = new Map();
    const duplicates = [];

    barcodeOptions.forEach((opt, index) => {
      const barcode = opt.barcode.trim();
      if (barcodeMap.has(barcode)) {
        if (!duplicates.includes(barcode)) {
          duplicates.push(barcode);
        }
      } else {
        barcodeMap.set(barcode, index);
      }
    });

    if (duplicates.length > 0) {
      return `중복된 바코드가 있습니다: ${duplicates.join(
        ", "
      )}. 각 바코드는 고유해야 합니다.`;
    }

    // 바코드 형식 검사 (영문, 숫자만 허용)
    const invalidBarcodes = barcodeOptions.filter(
      (opt) => !/^[a-zA-Z0-9]+$/.test(opt.barcode.trim())
    );
    if (invalidBarcodes.length > 0) {
      return "바코드는 영문과 숫자만 포함할 수 있습니다.";
    }

    return null; // 오류 없음
  };

  // editedProduct 상태에 바코드 옵션 업데이트
  useEffect(() => {
    setEditedProduct((prev) => ({
      ...prev,
      barcode: barcodeOptions.find((opt) => opt.is_main)?.barcode || "",
      barcode_options: {
        options: barcodeOptions,
        updated_at: new Date().toISOString(),
      },
    }));
  }, [barcodeOptions, setEditedProduct]);

  // 중복 바코드 체크
  const duplicateBarcodes = [];
  const barcodeMap = new Map();
  barcodeOptions.forEach((opt) => {
    if (opt.barcode && barcodeMap.has(opt.barcode)) {
      if (!duplicateBarcodes.includes(opt.barcode)) {
        duplicateBarcodes.push(opt.barcode);
      }
    } else if (opt.barcode) {
      barcodeMap.set(opt.barcode, true);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            바코드 상태 관리
          </h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              총 {barcodeOptions.length}개 바코드
            </span>
            {duplicateBarcodes.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                <ExclamationCircleIcon className="w-3 h-3" />
                중복 {duplicateBarcodes.length}개
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                <CheckCircleIcon className="w-3 h-3" />
                모두 고유함
              </span>
            )}
          </div>
        </div>
        <button
          onClick={addOption}
          disabled={barcodeOptions.length >= 4}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            barcodeOptions.length >= 4
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          + 추가 바코드 ({barcodeOptions.length}/4)
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {barcodeOptions.map((option, index) => (
          <div
            key={option.id}
            className="p-4 border border-gray-200 rounded-lg bg-gray-50"
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-gray-700">
                {option.is_main ? "기본" : `바코드 ${index}`} - ID: {option.id}
              </span>
              {!option.is_main && (
                <button
                  onClick={() => removeOption(option.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 옵션명 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  바코드명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={option.name}
                  onChange={(e) =>
                    updateOption(option.id, "name", e.target.value)
                  }
                  placeholder="예: 대용량, 프리미엄, 미니팩"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                  disabled={option.is_main} // 기본 옵션명은 수정 불가
                />
              </div>

              {/* 가격 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  가격 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={option.price === 0 ? "" : option.price}
                  onChange={(e) => {
                    const value = e.target.value;
                    // 빈 문자열이거나 숫자만 허용
                    if (value === "" || /^\d+$/.test(value)) {
                      updateOption(
                        option.id,
                        "price",
                        value === "" ? 0 : parseInt(value)
                      );
                    }
                  }}
                  onWheel={(e) => e.target.blur()} // 스크롤 방지
                  placeholder="가격을 입력하세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* 바코드 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  바코드 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={option.barcode}
                    onChange={(e) => {
                      // 영문, 숫자만 허용 (한글 및 특수문자 제외)
                      const value = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                      updateOption(option.id, "barcode", value);
                    }}
                    onKeyDown={(e) => {
                      // 한글 입력 방지
                      if (e.key === "Process" || e.keyCode === 229) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="바코드 번호 (영문, 숫자만)"
                    className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 ${
                      option.barcode &&
                      barcodeOptions.filter(
                        (opt) =>
                          opt.id !== option.id && opt.barcode === option.barcode
                      ).length > 0
                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                        : "border-gray-300 focus:ring-orange-500 focus:border-orange-500"
                    }`}
                  />
                  {/* 중복 경고 아이콘 */}
                  {option.barcode &&
                    barcodeOptions.filter(
                      (opt) =>
                        opt.id !== option.id && opt.barcode === option.barcode
                    ).length > 0 && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                </div>

                {/* 중복 경고 메시지 */}
                {option.barcode &&
                  barcodeOptions.filter(
                    (opt) =>
                      opt.id !== option.id && opt.barcode === option.barcode
                  ).length > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      ⚠️ 이 바코드는 이미 사용 중입니다
                    </p>
                  )}
              </div>
            </div>

            {/* 바코드 미리보기 */}
            {option.barcode && (
              <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
                <div className="text-xs text-gray-500 mb-2">
                  바코드 미리보기:
                </div>
                <div className="flex justify-center">
                  <Barcode value={option.barcode} height={20} width={1} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const topRef = useRef(null);
  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [postsImages, setPostsImages] = useState({}); // band_key_post_key를 키로 하는 이미지 맵
  const [editingBarcodes, setEditingBarcodes] = useState({}); // 편집 중인 바코드 상태
  const [savingBarcodes, setSavingBarcodes] = useState({}); // 저장 중인 바코드 상태
  const barcodeInputRefs = useRef({}); // 바코드 입력칸 ref
  const [inputValue, setInputValue] = useState("");
  const [barcodeSuggestions, setBarcodeSuggestions] = useState({}); // 각 상품별 바코드 추천
  const [loadingSuggestions, setLoadingSuggestions] = useState({}); // 추천 로딩 상태
  const [focusedProductId, setFocusedProductId] = useState(null); // 현재 포커스된 상품 ID
  const [barcodeIndex, setBarcodeIndex] = useState(null); // 전체 바코드 인덱스 (빠른 검색용)
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("posted_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20); // 페이지당 20개로 설정
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState("barcode");
  const [editedProduct, setEditedProduct] = useState({
    title: "",
    base_price: 0,
    quantity: 0,
    status: "판매중",
    barcode: "",
    option_barcode_1: "",
    option_barcode_2: "",
    option_barcode_3: "",
    memo: "",
    pickup_info: "",
    pickup_date: "",
  });
  const [debouncedBarcodeValue, setDebouncedBarcodeValue] = useState("");
  const [debouncedOptionBarcodes, setDebouncedOptionBarcodes] = useState({
    option_barcode_1: "",
    option_barcode_2: "",
    option_barcode_3: "",
  });
  const { mutate } = useSWRConfig();
  const checkbox = useRef(); // 사용되지 않는다면 제거 가능

  // 토스트 알림 훅
  const { toasts, showSuccess, showError, hideToast } = useToast();

  // 판매 상태 필터 옵션 정의
  const statusFilterOptions = [
    { value: "all", label: "전체" },
    { value: "판매중", label: "판매중" },
    { value: "마감", label: "마감" },
    // { value: "판매중지", label: "판매중지" },
  ];

  // SWR 옵션
  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err) => {
      setError(err.message || "데이터 로딩 실패");
      console.error("SWR Error:", err);
    },
    keepPreviousData: true,
  };

  // 사용자 정보 훅
  const {
    data: userDataFromHook,
    error: userError,
    isLoading: isUserLoading,
  } = useUser(userData?.userId, swrOptions);

  // 상품 목록 데이터 훅 (클라이언트 사이드)
  const {
    data: productsData,
    error: productsError,
    isLoading: isProductsLoading,
    mutate: mutateProducts,
  } = useProductsClient(
    userData?.userId,
    currentPage,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
      limit: itemsPerPage,
    },
    swrOptions
  );

  // 상품 상세 데이터 훅 (클라이언트 사이드)
  const {
    data: productDetailData,
    error: productDetailError,
    isValidating: isLoadingProductDetail,
  } = useProductClient(
    selectedProductId && userData?.userId ? `${selectedProductId}` : null,
    {
      onSuccess: (data) => {
        if (data?.data) {
          setSelectedProduct(data.data);
          setEditedProduct({
            title: data.data.title || "",
            base_price: data.data.base_price || 0,
            quantity: data.data.quantity || 0,
            status: data.data.status || "판매중",
            barcode: data.data.barcode || "",
            option_barcode_1: data.data.option_barcode_1 || "",
            option_barcode_2: data.data.option_barcode_2 || "",
            option_barcode_3: data.data.option_barcode_3 || "",
            memo: data.data.memo || "",
            pickup_info: data.data.pickup_info || "",
            pickup_date: data.data.pickup_date || "",
          });
          setActiveTab("barcode");
          setIsModalOpen(true);
        } else {
          console.error("상품 상세 데이터 구조 이상:", data);
          showError("상품 상세 정보를 가져오는 데 실패했습니다.");
          handleCloseModal();
        }
      },
      onError: (error) => {
        console.error("상품 상세 조회 오류:", error);
        showError("상품 정보를 불러오는데 실패했습니다.");
        handleCloseModal();
      },
      revalidateOnFocus: false,
    }
  );

  // 통합 로딩 상태
  const isDataLoading = initialLoading || isUserLoading || isProductsLoading;

  // 사용자 인증 확인 useEffect
  const handleLogout = useCallback(() => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        setUserData(JSON.parse(sessionData));
      } catch (e) {
        console.error("Auth Error:", e);
        setError("인증 처리 중 오류가 발생했습니다.");
        handleLogout();
      } finally {
        setInitialLoading(false);
      }
    };
    checkAuth();
  }, [router, handleLogout]);

  // 바코드 인덱스 구축 useEffect
  useEffect(() => {
    if (products && products.length > 0) {
      const index = buildBarcodeIndex(products);
      setBarcodeIndex(index);
      console.log('바코드 인덱스 구축 완료:', index.size, '개 바코드');
    }
  }, [products]);

  // 상품 목록 상태 업데이트 useEffect
  useEffect(() => {
    if (productsData?.data) {
      // 주문 수량 데이터 확인
      
      // 상품 ID 추출
      const productIds = productsData.data.map(p => p.product_id).filter(Boolean);
      
      // 주문 통계 가져오기
      if (productIds.length > 0) {
        fetchProductOrderStats(productIds)
          .then(statsMap => {
            
            // 주문 통계를 상품 데이터에 추가
            const productsWithStats = productsData.data.map(p => ({
              ...p,
              barcode: p.barcode || "",
              total_order_quantity: statsMap[p.product_id]?.total_order_quantity || 0,
              total_order_amount: statsMap[p.product_id]?.total_order_amount || 0,
              order_count: statsMap[p.product_id]?.order_count || 0,
              unpicked_quantity: statsMap[p.product_id]?.unpicked_quantity || 0
            }));
            
            setProducts(productsWithStats);
          })
          .catch(error => {
            console.error('fetchProductOrderStats 오류:', error);
            // 오류 발생 시에도 products는 설정
            setProducts(productsData.data.map(p => ({ ...p, barcode: p.barcode || "" })));
          });
      } else {
        setProducts(
          productsData.data
            .slice()
            .map((p) => ({ ...p, barcode: p.barcode || "" }))
        );
      }
      
      // 고유한 band_key와 post_key 조합 추출
      const postKeyPairs = productsData.data
        .filter(p => p.band_key && p.post_key)
        .map(p => ({ band_key: p.band_key, post_key: p.post_key }));
      
      // 중복 제거를 위한 고유 키 생성
      const uniquePairs = Array.from(
        new Map(postKeyPairs.map(item => [`${item.band_key}_${item.post_key}`, item])).values()
      );
      
      // posts 테이블에서 이미지 데이터 가져오기
      if (uniquePairs.length > 0) {
        fetchPostsImages(uniquePairs).then(() => {
          // 이미지 데이터 로드 완료
        }).catch(error => {
          console.error('❌ 이미지 로드 실패:', error);
        });
      }
    } else if (productsError) {
      setProducts([]);
    }
    // 페이지네이션 오류 방지: 데이터 로드 후 현재 페이지가 총 페이지 수보다 크면 1페이지로
    if (
      productsData?.pagination &&
      currentPage > productsData.pagination.totalPages &&
      productsData.pagination.totalPages > 0
    ) {
      setCurrentPage(1);
    }
  }, [productsData, productsError, currentPage, searchTerm]); // currentPage 의존성 추가

  // 상품별 주문 통계 가져오기
  const fetchProductOrderStats = async (productIds) => {
    try {
      // sessionStorage에서 band_key와 user_id 가져오기
      const sessionData = sessionStorage.getItem("userData");
      let userBandKey = null;
      let userId = null;
      
      if (sessionData) {
        const userData = JSON.parse(sessionData);
        userBandKey = userData.band_key;
        userId = userData.userId;
      }
      
      // 1. 먼저 제외 고객 이름 목록 가져오기 (users 테이블에서)
      let excludedCustomerNames = [];
      if (userId) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('excluded_customers')
          .eq('user_id', userId)
          .single();
        
        if (userError) {
          console.log('사용자 데이터 가져오기 실패:', userError);
        } else if (userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
          excludedCustomerNames = userData.excluded_customers;
        }
      }
      
      // 2. 주문 데이터 가져오기 (orders 테이블 직접 사용)
      let ordersQuery = supabase
        .from('orders')
        .select('product_id, quantity, total_amount, status, sub_status, customer_id, customer_name, band_key')
        .in('product_id', productIds)
        .neq('status', '주문취소'); // 취소된 주문 제외
      
      // band_key가 있으면 해당 band의 주문만 가져오기
      if (userBandKey) {
        ordersQuery = ordersQuery.eq('band_key', userBandKey);
      }
      
      const { data: allOrders, error: ordersError } = await ordersQuery;
      
      if (ordersError) {
        console.error('주문 데이터 가져오기 오류:', ordersError);
        return {};
      }
      
      // 3. 클라이언트 측에서 제외 고객 필터링 (이름으로 필터링)
      const filteredOrders = allOrders?.filter(order => {
        // 제외 고객 이름 목록에 포함되어 있으면 필터링
        const isExcluded = excludedCustomerNames.includes(order.customer_name);
        return !isExcluded;
      }) || [];
      
      // 4. 상품별로 통계 집계 (필터링된 데이터 사용)
      const statsMap = {};
      productIds.forEach(productId => {
        const productOrders = filteredOrders.filter(order => order.product_id === productId) || [];
        const totalQuantity = productOrders.reduce((sum, order) => sum + (order.quantity || 0), 0);
        const totalAmount = productOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
        
        // 미수령 수량 계산 (sub_status가 '미수령'이고 status가 '수령완료'가 아닌 주문들의 수량 합계)
        const unpickedOrders = productOrders.filter(order => 
          order.sub_status === '미수령' && order.status !== '수령완료'
        );
        const unpickedQuantity = unpickedOrders.reduce((sum, order) => sum + (order.quantity || 0), 0);
        
        statsMap[productId] = {
          total_order_quantity: totalQuantity,
          total_order_amount: totalAmount,
          order_count: productOrders.length,
          unpicked_quantity: unpickedQuantity
        };
      });
      
      return statsMap;
    } catch (error) {
      console.error('주문 통계 가져오기 예외:', error);
      return {};
    }
  };

  // posts 테이블에서 이미지 데이터 가져오기
  const fetchPostsImages = async (postKeyPairs) => {
    try {
      
      // 30일 이내 게시물로 제한 (필요시 조정 가능)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // OR 조건으로 각 band_key와 post_key 조합 매칭
      let query = supabase
        .from('posts')
        .select('band_key, post_key, image_urls, posted_at')
        .gte('posted_at', thirtyDaysAgo.toISOString())
        .order('posted_at', { ascending: false })
        .limit(1000); // 최대 1000개로 제한
      
      // OR 조건 생성
      const orConditions = postKeyPairs.map(pair => 
        `band_key.eq.${pair.band_key},post_key.eq.${pair.post_key}`
      ).join(',');
      
      query = query.or(orConditions);
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Posts 이미지 가져오기 오류:', error);
        return;
      }
      
      // band_key_post_key를 키로 하는 이미지 맵 생성
      const imageMap = {};
      
      data?.forEach(post => {
        const key = `${post.band_key}_${post.post_key}`;
        
        // image_urls 전체 배열 저장 (다중 상품 지원)
        if (post.image_urls && Array.isArray(post.image_urls) && post.image_urls.length > 0) {
          imageMap[key] = post.image_urls; // 전체 배열 저장
        }
      });
      
      setPostsImages(imageMap);
    } catch (error) {
      console.error('Posts 이미지 가져오기 예외:', error);
    }
  };

  // 검색 디바운스 useEffect
  // useEffect(() => {
  //   const handler = setTimeout(() => {
  //     if (inputValue !== searchTerm) {
  //       setSearchTerm(inputValue);
  //       setCurrentPage(1);
  //     }
  //   }, 500);
  //   return () => clearTimeout(handler);
  // }, [inputValue, searchTerm]);
  // 바코드 디바운스 useEffect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBarcodeValue(editedProduct.barcode);
    }, 1000);
    return () => clearTimeout(handler);
  }, [editedProduct.barcode]);

  // 옵션 바코드 디바운스 useEffect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOptionBarcodes({
        option_barcode_1: editedProduct.option_barcode_1,
        option_barcode_2: editedProduct.option_barcode_2,
        option_barcode_3: editedProduct.option_barcode_3,
      });
    }, 1000);
    return () => clearTimeout(handler);
  }, [
    editedProduct.option_barcode_1,
    editedProduct.option_barcode_2,
    editedProduct.option_barcode_3,
  ]);

  // 상품명을 파싱하여 날짜와 상품명을 분리하는 함수
  const parseProductName = (productName) => {
    if (!productName) {
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

  // 상품 주문보기 핸들러 (상품명으로 검색)
  const handleViewProductOrders = (productTitle) => {
    if (!productTitle) return;

    // 날짜를 포함한 전체 상품명으로 검색 (예: "[8월22일] 백천황도 복숭아 1박스")
    // 이렇게 하면 해당 날짜의 상품 주문만 정확히 검색됨
    router.push(`/orders?search=${encodeURIComponent(productTitle)}`);
  };

  // 게시물 주문보기 핸들러 (post_key로 검색)
  const handleViewPostOrders = (postKey) => {
    if (!postKey) return;

    // 주문 관리 페이지로 이동하면서 post_key로 검색
    router.push(`/orders?search=${encodeURIComponent(postKey)}`);
  };

  // --- 핸들러 함수들 ---
  const handleSearchChange = (e) => {
    setInputValue(e.target.value);
  };

  // 전체 필터 및 검색 초기화 함수 (OrdersPage와 유사하게 수정)
  const handleClearSearchAndFilters = () => {
    setInputValue("");
    setSearchTerm("");
    setFilterStatus("all"); // 상태 필터도 초기화
    setCurrentPage(1);
    // 다른 필터가 있다면 함께 초기화
  };

  const handleSearch = () => {
    setSearchTerm(inputValue.trim());
    setCurrentPage(1);
  };

  // 검색창 내용 지우기 함수 (OrdersPage와 동일)
  const clearInputValue = () => {
    setInputValue("");
    // setSearchTerm(""); // 필요시 주석 해제하여 검색 결과도 바로 초기화
    // setCurrentPage(1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // 검색 초기화 함수
  const handleClearSearch = () => {
    setInputValue("");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
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
  const formatCurrency = (amount) => {
    if (typeof amount !== "number") return "₩0";
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };
  const formatDate = (ds) => {
    if (!ds) return "-";
    const d = new Date(ds);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const formatDateTime = (ds) => {
    if (!ds) return "-";
    const d = new Date(ds);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };
  const formatDatePickup = (ds) => {
    if (!ds) return "-";
    // UTC 날짜를 로컬 날짜로 변환하지 않고 그대로 사용
    // DB에 저장된 날짜 문자열에서 날짜 부분만 추출
    const dateStr = ds.split('T')[0]; // "2025-08-22" 형식
    const [year, month, day] = dateStr.split('-');
    
    // Date 객체를 UTC가 아닌 로컬 시간으로 생성
    const d = new Date(year, month - 1, day);
    
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(d);
  };
  const handleProductClick = (productId) => {
    if (userData) setSelectedProductId(productId);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProductId(null);
    setSelectedProduct(null);
    setEditedProduct({
      title: "",
      base_price: 0,
      quantity: 0,
      status: "판매중",
      barcode: "",
      option_barcode_1: "",
      option_barcode_2: "",
      option_barcode_3: "",
      memo: "",
      pickup_info: "",
      pickup_date: "",
    });
    setActiveTab("barcode");
    setDebouncedBarcodeValue("");
    setDebouncedOptionBarcodes({
      option_barcode_1: "",
      option_barcode_2: "",
      option_barcode_3: "",
    });
  };
  const handleTabChange = (tab) => setActiveTab(tab);
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "base_price" || name === "quantity") {
      setEditedProduct((prev) => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else if (name === "pickup_date" || name === "expire_date") {
      // Explicitly handle empty string for date fields to prevent timestamp errors
      setEditedProduct((prev) => ({
        ...prev,
        [name]: value === "" ? null : value,
      }));
    } else {
      setEditedProduct((prev) => ({ ...prev, [name]: value }));
    }
  };

  // 클라이언트 사이드 mutation 함수들
  const { patchProduct, deleteProduct: deleteProductMutation } =
    useProductClientMutations();

  // 문자열 유사도 계산 함수 (클라이언트 사이드)
  const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    // 소문자로 변환하고 공백으로 분리
    const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // 중요한 단위 차이 체크 (반박스 vs 1박스)
    const hasHalfBox1 = str1.includes('반박스');
    const hasHalfBox2 = str2.includes('반박스');
    const hasFullBox1 = str1.includes('1박스') || (str1.includes('박스') && !str1.includes('반박스'));
    const hasFullBox2 = str2.includes('1박스') || (str2.includes('박스') && !str2.includes('반박스'));
    
    // 반박스와 1박스가 다른 경우 유사도 크게 감소
    if ((hasHalfBox1 && hasFullBox2) || (hasFullBox1 && hasHalfBox2)) {
      return 0.2; // 매우 낮은 유사도
    }
    
    // 공통 단어 찾기
    let matchCount = 0;
    const used = new Set();
    
    for (const word1 of words1) {
      for (let i = 0; i < words2.length; i++) {
        if (!used.has(i)) {
          const word2 = words2[i];
          
          // 완전 일치 또는 부분 일치 체크
          if (word1 === word2) {
            matchCount += 1.0;
            used.add(i);
            break;
          } else if (word1.includes(word2) || word2.includes(word1)) {
            // 부분 일치는 낮은 점수
            matchCount += 0.5;
            used.add(i);
            break;
          }
        }
      }
    }
    
    // 유사도 점수 계산 (0~1 범위)
    const maxWords = Math.max(words1.length, words2.length);
    let similarity = matchCount / maxWords;
    
    // 시작 부분이 같으면 보너스 점수
    if (words1[0] === words2[0]) {
      similarity = Math.min(1.0, similarity + 0.1);
    }
    
    // 핵심 키워드 가중치 (숫자나 단위는 낮은 가중치)
    const isNumberOrUnit = (word) => /^\d+$|^[\d.]+kg$|^[\d.]+g$|박스$|개$|통$|수$/i.test(word);
    
    // 핵심 단어(숫자/단위가 아닌 것)의 일치율 계산
    const coreWords1 = words1.filter(w => !isNumberOrUnit(w));
    const coreWords2 = words2.filter(w => !isNumberOrUnit(w));
    
    if (coreWords1.length > 0 && coreWords2.length > 0) {
      let coreMatchCount = 0;
      for (const word1 of coreWords1) {
        if (coreWords2.some(word2 => word1 === word2)) {
          coreMatchCount++;
        }
      }
      const coreSimilarity = coreMatchCount / Math.max(coreWords1.length, coreWords2.length);
      
      // 핵심 단어 유사도를 더 높은 가중치로 반영
      similarity = similarity * 0.4 + coreSimilarity * 0.6;
    }
    
    return Math.min(1.0, similarity);
  };

  // 바코드 인덱스 구축 함수
  const buildBarcodeIndex = (productsList) => {
    const index = new Map();
    
    productsList.forEach(product => {
      // 기본 바코드 처리
      if (product.barcode && product.barcode.trim() !== '') {
        const key = product.barcode;
        if (!index.has(key)) {
          index.set(key, {
            barcode: product.barcode,
            products: []
          });
        }
        index.get(key).products.push({
          product_id: product.product_id,
          title: product.title,
          clean_title: product.title.replace(/^\[.*?\]\s*/, '').trim(),
          price: product.base_price || 0,
          date: product.created_at
        });
      }
      
      // barcode_options 처리
      if (product.barcode_options?.options?.length > 0) {
        product.barcode_options.options.forEach(option => {
          if (option.barcode && option.barcode.trim() !== '') {
            const key = option.barcode;
            if (!index.has(key)) {
              index.set(key, {
                barcode: option.barcode,
                products: []
              });
            }
            index.get(key).products.push({
              product_id: product.product_id,
              title: product.title,
              clean_title: product.title.replace(/^\[.*?\]\s*/, '').trim(),
              price: option.price || product.base_price || 0,
              option_name: option.name,
              date: product.created_at
            });
          }
        });
      }
    });
    
    return index;
  };

  // 즉시 바코드 추천 가져오기 (메모리에서)
  const getInstantSuggestions = (productTitle, currentProductId, index) => {
    if (!productTitle || !index) return [];
    
    // 날짜 패턴 제거
    const cleanTitle = productTitle.replace(/^\[.*?\]\s*/, '').trim();
    if (!cleanTitle) return [];
    
    const suggestions = [];
    const now = new Date();
    
    // 인덱스에서 검색
    index.forEach((item, barcodeKey) => {
      // 현재 상품은 제외
      const filteredProducts = item.products.filter(p => p.product_id !== currentProductId);
      if (filteredProducts.length === 0) return;
      
      // 모든 상품에 대해 유사도 계산하고 가장 높은 것 선택
      let bestSimilarity = 0;
      let bestProduct = null;
      
      for (const product of filteredProducts) {
        const similarity = calculateSimilarity(cleanTitle, product.clean_title);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestProduct = product;
        }
      }
      
      // 유사도가 너무 낮으면 제외 (0.3 이상만)
      if (bestSimilarity < 0.3 || !bestProduct) return;
      
      const lastUsedDate = new Date(bestProduct.date);
      const daysAgo = Math.floor((now - lastUsedDate) / (1000 * 60 * 60 * 24));
      
      suggestions.push({
        barcode: item.barcode,
        product_title: bestProduct.title,
        clean_title: bestProduct.clean_title,
        option_name: bestProduct.option_name,
        price: bestProduct.price,
        last_used: lastUsedDate.toISOString().split('T')[0],
        days_ago: daysAgo,
        used_count: filteredProducts.length,
        similarity_score: bestSimilarity,
        // 가격 범위 (여러 번 사용된 경우)
        price_range: filteredProducts.length > 1 ? {
          min: Math.min(...filteredProducts.map(p => p.price)),
          max: Math.max(...filteredProducts.map(p => p.price))
        } : null,
        // 최근 3개 사용 이력
        recent_uses: filteredProducts.slice(0, 3).map(p => ({
          title: p.title,
          price: p.price,
          date: new Date(p.date).toISOString().split('T')[0]
        }))
      });
    });
    
    // 정렬: 1) 유사도 (0.6 이상) 2) 최근 사용 3) 사용 빈도
    suggestions.sort((a, b) => {
      // 유사도 기반 정렬 (0.6 이상이면 유사한 것으로 간주)
      const aSimilar = a.similarity_score >= 0.6 ? a.similarity_score : 0;
      const bSimilar = b.similarity_score >= 0.6 ? b.similarity_score : 0;
      
      // 유사도가 둘 다 0.6 이상이면 유사도 순으로
      if (aSimilar > 0 && bSimilar > 0) {
        if (Math.abs(aSimilar - bSimilar) > 0.1) {
          return bSimilar - aSimilar;
        }
      } else if (aSimilar !== bSimilar) {
        return bSimilar - aSimilar;
      }
      
      // 최근 사용 우선 (7일 이내)
      const aRecent = a.days_ago <= 7 ? 1 : 0;
      const bRecent = b.days_ago <= 7 ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      
      // 사용 빈도
      if (a.used_count !== b.used_count) {
        return b.used_count - a.used_count;
      }
      
      // 날짜순
      return a.days_ago - b.days_ago;
    });
    
    // 상위 5개만 반환
    return suggestions.slice(0, 5);
  };

  // 바코드 추천 가져오기
  const fetchBarcodeSuggestions = async (productId, title) => {
    if (!title) return;
    
    // sessionStorage에서 userId 가져오기
    const sessionData = sessionStorage.getItem("userData");
    const userData = sessionData ? JSON.parse(sessionData) : null;
    const userId = userData?.userId;
    
    if (!userId) return;

    setLoadingSuggestions(prev => ({ ...prev, [productId]: true }));
    try {
      const response = await fetch(
        `/api/products/barcode-suggestions?title=${encodeURIComponent(title)}&userId=${userId}&excludeProductId=${productId}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setBarcodeSuggestions(prev => ({
          ...prev,
          [productId]: data.suggestions || []
        }));
      }
    } catch (error) {
      console.error('바코드 추천 가져오기 실패:', error);
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [productId]: false }));
    }
  };

  // 바코드 추천 적용
  const applyBarcodeSuggestion = (productId, suggestion) => {
    setEditingBarcodes(prev => ({
      ...prev,
      [productId]: suggestion.barcode
    }));
    // 추천 목록은 숨기지만 포커스는 유지하지 않음 (자동 저장 방지)
    setTimeout(() => {
      setFocusedProductId(null);
    }, 100);
  };

  // 바코드 변경 핸들러
  const handleBarcodeChange = (productId, value) => {
    // 영문, 숫자만 허용
    const sanitizedValue = value.replace(/[^a-zA-Z0-9]/g, "");
    setEditingBarcodes(prev => ({
      ...prev,
      [productId]: sanitizedValue
    }));
  };

  // 바코드 저장 핸들러
  const handleBarcodeSave = async (product) => {
    const newBarcode = editingBarcodes[product.product_id];
    
    // 변경되지 않았으면 무시
    if (newBarcode === undefined || newBarcode === product.barcode) {
      return;
    }

    // 저장 중 상태 설정
    setSavingBarcodes(prev => ({ ...prev, [product.product_id]: true }));

    try {
      // Supabase를 통한 직접 업데이트
      const { error } = await supabase
        .from('products')
        .update({ barcode: newBarcode })
        .eq('product_id', product.product_id);

      if (error) throw error;

      // 성공 시 상품 목록 업데이트
      setProducts(prev => prev.map(p => 
        p.product_id === product.product_id 
          ? { ...p, barcode: newBarcode }
          : p
      ));
      
      // 편집 상태 초기화
      setEditingBarcodes(prev => {
        const newState = { ...prev };
        delete newState[product.product_id];
        return newState;
      });
      
      showSuccess('바코드가 저장되었습니다.');
      
      // 데이터 새로고침
      mutateProducts();
    } catch (error) {
      console.error('바코드 저장 오류:', error);
      showError('바코드 저장에 실패했습니다.');
    } finally {
      // 저장 중 상태 해제
      setSavingBarcodes(prev => {
        const newState = { ...prev };
        delete newState[product.product_id];
        return newState;
      });
    }
  };

  // 바코드 자동생성 함수
  const generateAutoBarcode = () => {
    // 55로 시작하는 13자리 바코드 생성 (55 + 타임스탬프 8자리 + 랜덤 3자리)
    const timestamp = Date.now().toString().slice(-8); // 타임스탬프 마지막 8자리
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // 랜덤 3자리
    return `55${timestamp}${random}`;
  };

  // 바코드 자동생성 및 저장 핸들러
  const handleAutoGenerateBarcode = async (product) => {
    try {
      // 기존 바코드 확인
      const currentBarcode = editingBarcodes[product.product_id] || product.barcode;
      if (currentBarcode && currentBarcode.trim()) {
        const confirmMessage = `이미 바코드(${currentBarcode})가 있습니다.\n새로운 바코드로 교체하시겠습니까?`;
        if (!confirm(confirmMessage)) {
          return; // 사용자가 취소하면 함수 종료
        }
      }
      
      setSavingBarcodes(prev => ({ ...prev, [product.product_id]: true }));
      
      const autoBarcode = generateAutoBarcode();
      
      // DB에 직접 저장
      const { error } = await supabase
        .from('products')
        .update({ barcode: autoBarcode })
        .eq('product_id', product.product_id);

      if (error) throw error;

      // 성공 시 상품 목록 업데이트
      setProducts(prev => prev.map(p => 
        p.product_id === product.product_id 
          ? { ...p, barcode: autoBarcode }
          : p
      ));
      
      // 편집 상태도 업데이트
      setEditingBarcodes(prev => {
        const newState = { ...prev };
        delete newState[product.product_id];
        return newState;
      });
      
      // 데이터 새로고침
      mutateProducts();
    } catch (error) {
      console.error('바코드 자동생성 오류:', error);
    } finally {
      setSavingBarcodes(prev => {
        const newState = { ...prev };
        delete newState[product.product_id];
        return newState;
      });
    }
  };

  // Enter 키로 다음 바코드 입력칸으로 이동
  const handleBarcodeKeyDown = (e, product, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // 현재 바코드 저장
      handleBarcodeSave(product);
      
      // 다음 바코드 입력칸으로 포커스 이동
      const nextIndex = index + 1;
      if (nextIndex < products.length) {
        const nextProductId = products[nextIndex].product_id;
        setTimeout(() => {
          barcodeInputRefs.current[nextProductId]?.focus();
        }, 100);
      }
    }
  };

  const updateProduct = async () => {
    if (
      !selectedProduct ||
      !userData ||
      !editedProduct.title ||
      editedProduct.base_price < 0
    ) {
      console.log("Invalid data:", editedProduct);
      showError("상품명과 가격을 올바르게 입력해주세요.");
      return;
    }

    // 바코드 옵션 유효성 검사 (중복이 있으면 저장 중단)
    if (editedProduct.barcode_options?.options) {
      const barcodeOptions = editedProduct.barcode_options.options;

      // 중복 바코드 검사
      const barcodeMap = new Map();
      const duplicates = [];

      barcodeOptions.forEach((opt, index) => {
        const barcode = opt.barcode?.trim();
        if (barcode) {
          if (barcodeMap.has(barcode)) {
            if (!duplicates.includes(barcode)) {
              duplicates.push(barcode);
            }
          } else {
            barcodeMap.set(barcode, index);
          }
        }
      });

      if (duplicates.length > 0) {
        showError(
          `중복된 바코드가 있어 저장할 수 없습니다: ${duplicates.join(
            ", "
          )}. 각 바코드는 고유해야 합니다.`
        );
        return;
      }

      // 빈 바코드 검사
      const hasEmptyBarcodes = barcodeOptions.some(
        (opt) => !opt.barcode?.trim()
      );
      if (hasEmptyBarcodes) {
        showError(
          "모든 바코드를 입력해주세요. 빈 바코드가 있으면 저장할 수 없습니다."
        );
        return;
      }
    }

    try {
      console.log("Updating product via client-side:", editedProduct);

      await patchProduct(
        selectedProduct.product_id,
        editedProduct,
        userData.userId
      );

      console.log("Update successful via client-side");

      // 바코드 옵션 업데이트 플래그 설정 (다른 페이지에서 감지할 수 있도록)
      if (editedProduct.barcode_options) {
        localStorage.setItem("barcodeOptionsUpdated", Date.now().toString());
        console.log("Barcode options updated flag set");
      }

      handleCloseModal();
      showSuccess("상품 정보가 저장되었습니다.");
    } catch (error) {
      console.error("상품 정보 업데이트 오류 (client-side):", error);
      showError(error.message || "상품 정보 업데이트에 실패했습니다.");
    }
  };

  // deleteProduct 함수 (클라이언트 사이드)
  const deleteProduct = async () => {
    if (!selectedProduct || !userData) return;
    if (
      !confirm(
        `'${selectedProduct.title}' 상품을 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`
      )
    )
      return;

    try {
      console.log(
        "Deleting product via client-side:",
        selectedProduct.product_id
      );

      await deleteProductMutation(selectedProduct.product_id, userData.userId);

      console.log("Delete successful via client-side");
      handleCloseModal();
      showSuccess("상품이 삭제되었습니다.");
    } catch (error) {
      console.error("상품 삭제 오류 (client-side):", error);
      showError(error.message || "상품 삭제에 실패했습니다.");
    }
  };

  const scrollToTop = () =>
    topRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const paginate = (pageNumber) => {
    // --- 페이지네이션 데이터 구조 확인 필요 ---
    // API 응답이 productsData.pagination.totalPages 형태가 아니면 수정해야 함
    const totalPages = productsData?.pagination?.totalPages || 1;
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      scrollToTop();
    }
  };
  const goToPreviousPage = () => paginate(currentPage - 1);
  const goToNextPage = () => paginate(currentPage + 1);
  const getSortIcon = (field) => {
    if (sortBy !== field)
      return (
        <ChevronUpDownIcon className="w-4 h-4 ml-1 text-gray-400 opacity-60" />
      );
    return sortOrder === "asc" ? (
      <ChevronUpIcon className="w-4 h-4 ml-1 text-gray-600" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 ml-1 text-gray-600" />
    );
  };

  // --- 로딩/에러 UI ---
  if (initialLoading || !userData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner className="h-10 w-10" color="text-gray-500" />
        <p className="ml-3 text-gray-600">데이터 로딩 중...</p>
      </div>
    );
  const combinedError =
    error || productsError || productDetailError || userError;
  if (combinedError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4 ">
        <div className=" w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {combinedError.message || "데이터 처리 중 오류가 발생했습니다."}
          </p>
          <p className="text-xs text-red-500 bg-red-100 p-3 rounded-lg mb-6">
            {combinedError.message || String(combinedError)}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );

  // --- 페이지네이션 데이터 준비 ---
  // !!! 중요: 실제 API 응답 구조에 맞게 수정 필요 !!!
  // 예: productsData.meta?.totalItems 또는 productsData.totalCount 등
  const totalItems = productsData?.pagination?.totalItems || 0;
  const totalPages =
    productsData?.pagination?.totalPages ||
    Math.ceil(totalItems / itemsPerPage) ||
    1; // totalItems 기반 계산 추가

  // --- 메인 UI ---
  return (
    <div
      ref={topRef}
      className="min-h-screen bg-gray-100 text-gray-900  overflow-y-auto px-4 py-2 sm:px-6 sm:py-4"
    >
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-4 md:mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">상품 관리</h1>
          <p className="text-sm text-gray-500 mb-1">
            등록된 상품을 관리하고 바코드를 생성/수정할 수 있습니다.
          </p>
          <UpdateButton pageType="products" />
        </div>

        {/* 필터 섹션 */}
        <LightCard padding="p-0" className="mb-4 md:mb-4 overflow-hidden">
          <div className="divide-y divide-gray-200">
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <FunnelIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                상태
              </div>
              <div className="bg-white px-4 py-3">
                <CustomRadioGroup
                  name="productStatus"
                  options={statusFilterOptions}
                  selectedValue={filterStatus}
                  onChange={handleFilterChange}
                  disabled={isDataLoading}
                />
              </div>
            </div>
            <div className="grid grid-cols-[max-content_1fr] items-center">
              <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-32 self-stretch">
                <TagIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                검색
              </div>
              {/* --- 👇 OrdersPage와 유사하게 검색창 및 버튼 레이아웃 수정 👇 --- */}
              <div className="bg-white flex-grow w-full px-4 py-2 flex flex-wrap md:flex-nowrap md:items-center gap-2">
                {/* 검색 입력 */}
                <div className="relative w-full md:flex-grow md:max-w-lg order-1 ">
                  {" "}
                  {/* 너비 정책 OrdersPage와 동일하게 */}
                  <input
                    type="text" // type="text" 또는 "search"
                    placeholder="상품명 검색..."
                    value={inputValue}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" // X 버튼 공간 확보
                    disabled={isDataLoading}
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  {/* X 버튼 추가 */}
                  {inputValue && (
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
                <div className="flex flex-row gap-2 w-full sm:w-auto order-2 md:flex-shrink-0">
                  {" "}
                  {/* 버튼 그룹 스타일 */}
                  <button
                    onClick={handleSearch}
                    className="flex-1 sm:flex-none px-8 py-2 font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed" // OrdersPage와 동일한 스타일
                    disabled={isDataLoading}
                  >
                    검색
                  </button>
                  <button
                    onClick={handleClearSearchAndFilters} // 전체 초기화 함수로 변경
                    disabled={isDataLoading}
                    className="flex-1 sm:flex-none flex items-center justify-center px-5 py-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" // OrdersPage와 동일한 스타일
                    aria-label="검색 및 필터 초기화"
                    title="검색 및 필터 초기화"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4 mr-1" />{" "}
                    {/* 아이콘 추가 */}
                    초기화
                  </button>
                </div>
              </div>
              {/* --- 👆 검색창 및 버튼 레이아웃 수정 끝 👆 --- */}
            </div>
          </div>
        </LightCard>

        {/* 상품 목록 테이블 */}
        <LightCard className="overflow-hidden" padding="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {/* Index 컬럼 추가 */}
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 uppercase tracking-wider w-16">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider sm:pl-6">
                    <button
                      onClick={() => handleSortChange("title")}
                      className="flex items-center focus:outline-none group text-gray-700 hover:text-gray-900"
                      disabled={isDataLoading}
                    >
                      상품명
                      <span className="inline-block">
                        {getSortIcon("title")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("base_price")}
                      className="flex items-center focus:outline-none group text-gray-700 hover:text-gray-900"
                      disabled={isDataLoading}
                    >
                      가격
                      <span className="inline-block">
                        {getSortIcon("base_price")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    주문수량
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    미수령
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider w-48">
                    바코드
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("created_at")}
                      className="flex items-center focus:outline-none group text-gray-700 hover:text-gray-900"
                      disabled={isDataLoading}
                    >
                      등록일
                      <span className="inline-block">
                        {getSortIcon("created_at")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("pickup_date")}
                      className="flex items-center focus:outline-none group text-gray-700 hover:text-gray-900"
                      disabled={isDataLoading}
                    >
                      수령일
                      <span className="inline-block">
                        {getSortIcon("pickup_date")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("status")}
                      className="flex items-center focus:outline-none group text-gray-700 hover:text-gray-900"
                      disabled={isDataLoading}
                    >
                      상태
                      <span className="inline-block">
                        {getSortIcon("status")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {isProductsLoading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan="11"
                      className="px-4 py-16 text-center text-gray-500"
                    >
                      <LoadingSpinner className="h-6 w-6 mx-auto" />
                    </td>
                  </tr>
                )}
                {/* colspan 수정 */}
                {!isProductsLoading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan="11"
                      className="px-4 py-16 text-center text-gray-500"
                    >
                      조건에 맞는 상품이 없습니다.
                    </td>
                  </tr>
                )}
                {/* colspan 수정 */}
                {products.map((product, index) => {
                  // Index 계산
                  // --- 역순 Index 계산 ---
                  // 페이지네이션 데이터에서 총 아이템 수를 가져옵니다.
                  const totalItems = productsData?.pagination?.totalItems || 0;
                  // 현재 아이템의 0부터 시작하는 절대 인덱스를 계산합니다.
                  const currentItemAbsoluteIndex =
                    (currentPage - 1) * itemsPerPage + index;
                  // 총 아이템 수에서 현재 아이템의 절대 인덱스를 빼서 역순 번호를 계산합니다.
                  const rowNum = totalItems - currentItemAbsoluteIndex;
                  return (
                    <tr
                      key={product.product_id}
                      className={`hover:bg-gray-50 transition-colors duration-150 cursor-pointer group ${
                        isProductsLoading ? "opacity-70" : ""
                      }`}
                      onClick={() => handleProductClick(product.product_id)}
                    >
                      {/* Index 표시 셀 추가 */}
                      <td className="px-4 py-5 text-center text-base font-medium text-gray-600">
                        {rowNum}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap sm:pl-6">
                        <div className="flex items-center space-x-4">
                          {/* 상품 이미지 - 크기 증가 */}
                          <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 shadow-sm">
                            {(() => {
                              const imageKey = `${product.band_key}_${product.post_key}`;
                              const imageUrls = postsImages[imageKey]; // 배열로 받음
                              
                              // 모든 상품에 첫 번째 이미지(0번) 사용
                              const imageUrl = Array.isArray(imageUrls) ? imageUrls[0] : imageUrls;
                                
                              
                              if (product.band_key && product.post_key && imageUrl) {
                                return (
                                  <img
                                    src={imageUrl}
                                    alt={product.title}
                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                                    style={{ 
                                      imageRendering: 'auto',
                                      backfaceVisibility: 'hidden'
                                    }}
                                    onError={(e) => {
                                      console.error(`❌ 이미지 로드 실패: ${imageUrl}`);
                                      e.target.onerror = null;
                                      e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'/%3E%3C/svg%3E";
                                    }}
                                  />
                                );
                              } else {
                                return (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                                    <svg
                                      className="w-10 h-10 text-gray-300"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                          {/* 상품명 */}
                          <div className="flex-1">
                            <div className="text-base font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                              {(() => {
                                const parsed = parseProductName(product.title);
                                // 날짜 부분을 제거하고 순수 상품명만 표시
                                return parsed.name || product.title || "-";
                              })()}
                            </div>
                            {product.post_key && (
                              <div className="text-xs text-gray-500 mt-1">
                                게시물 #{product.item_number || '-'}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 whitespace-nowrap text-sm text-gray-800">
                        {formatCurrency(product.base_price)}
                      </td>
                      <td className="px-4 py-5 whitespace-nowrap text-center">
                        {product.total_order_quantity > 0 ? (
                          <span className="text-xl font-bold text-gray-900">
                            {product.total_order_quantity}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">
                            0
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-5 whitespace-nowrap text-center">
                        {product.unpicked_quantity > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // 미수령 주문 페이지로 이동 (상품명과 미수령 필터 파라미터 전달)
                              router.push(`/orders?search=${encodeURIComponent(product.title)}&filter=unpicked`);
                            }}
                            className="inline-flex items-center justify-center px-3 py-1 rounded-md text-xl font-bold text-red-600 group-hover:bg-red-100 hover:bg-red-200 hover:text-red-700 transition-all duration-200 cursor-pointer"
                            title="미수령 주문 보기"
                          >
                            {product.unpicked_quantity}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">
                            0
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-2" style={{ width: "180px" }}>
                          {/* 바코드 미리보기 - 위로 이동 */}
                          {(editingBarcodes[product.product_id] || product.barcode) && (
                            <div className="bg-white p-1 rounded border border-gray-200 overflow-hidden">
                              <Barcode
                                value={editingBarcodes[product.product_id] ?? product.barcode}
                                height={40}
                                width={1.2}
                                displayValue={false}
                                margin={0}
                                textMargin={0}
                              />
                            </div>
                          )}
                          {/* 바코드 입력칸 - 아래로 이동 */}
                          <div className="relative">
                            <input
                              ref={el => barcodeInputRefs.current[product.product_id] = el}
                              type="text"
                              value={editingBarcodes[product.product_id] ?? product.barcode ?? ''}
                              onChange={(e) => handleBarcodeChange(product.product_id, e.target.value)}
                              onFocus={() => {
                                // 즉시 포커스 설정 (지연 제거)
                                setFocusedProductId(product.product_id);
                                
                                // 현재 상품에 이미 바코드가 있으면 추천하지 않음
                                const currentBarcode = editingBarcodes[product.product_id] ?? product.barcode;
                                if (currentBarcode && currentBarcode.trim() !== '') {
                                  // 이미 바코드가 있으면 추천 목록 비우기
                                  setBarcodeSuggestions(prev => ({
                                    ...prev,
                                    [product.product_id]: []
                                  }));
                                  return;
                                }
                                
                                // 바코드 인덱스가 있으면 메모리에서 즉시 추천 가져오기
                                if (barcodeIndex && !barcodeSuggestions[product.product_id]) {
                                  const suggestions = getInstantSuggestions(
                                    product.title,
                                    product.product_id,
                                    barcodeIndex
                                  );
                                  setBarcodeSuggestions(prev => ({
                                    ...prev,
                                    [product.product_id]: suggestions
                                  }));
                                } else if (!barcodeIndex && !barcodeSuggestions[product.product_id]) {
                                  // 인덱스가 없는 경우만 API 호출 (폴백)
                                  fetchBarcodeSuggestions(product.product_id, product.title);
                                }
                              }}
                              onBlur={(e) => {
                                // 추천 바코드 영역으로 포커스가 이동하는 경우는 무시
                                const relatedTarget = e.relatedTarget;
                                const isClickingSuggestion = relatedTarget && 
                                  relatedTarget.closest('.barcode-suggestions-dropdown');
                                
                                // 다른 바코드 입력창으로 이동하는 경우 체크
                                const isAnotherBarcodeInput = relatedTarget && 
                                  relatedTarget.placeholder === '바코드 입력';
                                
                                if (!isClickingSuggestion && !isAnotherBarcodeInput) {
                                  setTimeout(() => {
                                    handleBarcodeSave(product);
                                    setFocusedProductId(null);
                                  }, 200);
                                } else if (isAnotherBarcodeInput) {
                                  // 다른 바코드 입력창으로 이동 시 저장만 하고 포커스는 유지
                                  handleBarcodeSave(product);
                                }
                              }}
                              onKeyDown={(e) => handleBarcodeKeyDown(e, product, index)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="바코드 입력"
                              disabled={savingBarcodes[product.product_id]}
                              className={`w-full px-3 py-1.5 text-sm font-mono border rounded-md transition-all ${
                                savingBarcodes[product.product_id]
                                  ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                                  : editingBarcodes[product.product_id] !== undefined
                                  ? 'border-orange-400 bg-orange-50 focus:border-orange-500 focus:ring-2 focus:ring-orange-200'
                                  : 'border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
                              } focus:outline-none`}
                            />
                            {/* 저장 중 표시 */}
                            {savingBarcodes[product.product_id] && (
                              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                                <LoadingSpinner className="h-4 w-4" color="text-orange-500" />
                              </div>
                            )}
                            
                            {/* 바코드 추천 드롭다운 - 우측에 표시 */}
                            {focusedProductId === product.product_id && 
                             barcodeSuggestions[product.product_id]?.length > 0 && (
                              <div className="barcode-suggestions-dropdown absolute z-50 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                                   style={{ 
                                     minWidth: '320px', 
                                     width: 'max-content', 
                                     maxWidth: '400px',
                                     left: '100%',
                                     marginLeft: '8px',
                                     top: '0'
                                   }}>
                                {loadingSuggestions[product.product_id] ? (
                                  <div className="p-2 text-center">
                                    <LoadingSpinner className="h-4 w-4 mx-auto" />
                                  </div>
                                ) : (
                                  <div>
                                    {/* 추천 바코드 레이블 */}
                                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                                      <span className="text-xs font-medium text-gray-600">추천 바코드</span>
                                    </div>
                                    <div className="py-0.5">
                                      {barcodeSuggestions[product.product_id].map((suggestion, idx) => {
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            tabIndex={0}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              applyBarcodeSuggestion(product.product_id, suggestion);
                                              // 적용 후 입력란으로 포커스 복귀
                                              setTimeout(() => {
                                                barcodeInputRefs.current[product.product_id]?.focus();
                                              }, 10);
                                            }}
                                            className="w-full px-3 py-2.5 text-left hover:bg-orange-50 border-b border-gray-100 last:border-b-0 focus:bg-orange-100 focus:outline-none"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 whitespace-nowrap">
                                                {idx + 1}
                                              </span>
                                              <div className="flex-1 min-w-0">
                                                {/* 상품명을 크고 진하게 상단에 배치 */}
                                                <div className="text-sm font-semibold text-gray-900 mb-0.5">
                                                  {suggestion.clean_title}
                                                </div>
                                                {/* 바코드와 가격 정보를 아래에 작게 */}
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                  <span className="font-mono">
                                                    {suggestion.barcode}
                                                  </span>
                                                  <span className="text-gray-400">•</span>
                                                  <span>₩{(suggestion.price || 0).toLocaleString()}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {/* 바코드 자동생성 버튼 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoGenerateBarcode(product);
                            }}
                            disabled={savingBarcodes[product.product_id]}
                            className={`mt-1.5 w-full px-2 py-1 text-xs rounded transition-colors ${
                              savingBarcodes[product.product_id]
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-700 border border-gray-300'
                            }`}
                            title="바코드 자동 생성"
                          >
                            {savingBarcodes[product.product_id] ? '생성중...' : '바코드 자동 생성'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{formatDate(product.posted_at)}</span>
                          <span className="text-xs">
                            {formatDateTime(product.posted_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.pickup_date ? (
                          <span className="font-medium">
                            {formatDatePickup(product.pickup_date)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <StatusBadge status={product.status} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {/* 상품 주문보기 버튼 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewProductOrders(product.title);
                            }}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-500 group-hover:text-blue-600 group-hover:bg-blue-100 hover:bg-blue-200 hover:text-blue-700 transition-colors"
                            title="상품명으로 주문 검색"
                          >
                            상품주문
                          </button>

                          {/* 게시물 주문보기 버튼 */}
                          {product.post_key && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewPostOrders(product.post_key);
                              }}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-500 group-hover:text-green-600 group-hover:bg-green-100 hover:bg-green-200 hover:text-green-700 transition-colors"
                              title="게시물로 주문 검색"
                            >
                              게시물주문
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* 페이지네이션 UI */}
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
                  disabled={currentPage === totalPages || isDataLoading}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLongRightIcon className="h-5 w-5" />
                </button>
              </nav>
            </div>
          )}
        </LightCard>

        {/* 상품 수정 모달 */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col border border-gray-300">
              <div className="flex justify-between items-center p-5 border-b border-gray-200 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedProduct.title}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              {isLoadingProductDetail ? (
                <div className="flex justify-center items-center h-64">
                  <LoadingSpinner className="h-8 w-8" />
                </div>
              ) : (
                <div className="p-6 overflow-y-auto flex-grow">
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                      <button
                        onClick={() => handleTabChange("barcode")}
                        className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                          activeTab === "barcode"
                            ? "border-orange-500 text-orange-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <QrCodeIcon className="w-5 h-5" /> 바코드 관리
                      </button>
                      <button
                        onClick={() => handleTabChange("info")}
                        className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                          activeTab === "info"
                            ? "border-orange-500 text-orange-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <InformationCircleIcon className="w-5 h-5" /> 상품 정보
                      </button>
                      {selectedProduct?.band_post_url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              selectedProduct.band_post_url,
                              "_blank"
                            );
                          }}
                          className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 font-medium text-sm transition-colors text-gray-500 hover:text-gray-700`}
                        >
                          <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                          게시물 이동
                        </button>
                      )}
                    </nav>
                  </div>
                  {activeTab === "info" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            상품명 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="title"
                            value={editedProduct.title}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            상품 ID
                          </label>
                          <input
                            type="text"
                            value={selectedProduct?.product_id || ""}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            가격 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="base_price"
                            value={
                              editedProduct.base_price === 0
                                ? ""
                                : editedProduct.base_price
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              // 빈 문자열이거나 숫자만 허용
                              if (value === "" || /^\d+$/.test(value)) {
                                setEditedProduct((prev) => ({
                                  ...prev,
                                  base_price:
                                    value === "" ? 0 : parseInt(value),
                                }));
                              }
                            }}
                            onWheel={(e) => e.target.blur()} // 스크롤 방지
                            required
                            placeholder="가격을 입력하세요"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            수량
                          </label>
                          <input
                            type="text"
                            name="quantity"
                            value={
                              editedProduct.quantity === 0
                                ? ""
                                : editedProduct.quantity
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              // 빈 문자열이거나 숫자만 허용
                              if (value === "" || /^\d+$/.test(value)) {
                                setEditedProduct((prev) => ({
                                  ...prev,
                                  quantity: value === "" ? 0 : parseInt(value),
                                }));
                              }
                            }}
                            onWheel={(e) => e.target.blur()} // 스크롤 방지
                            placeholder="수량을 입력하세요"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            상태 <span className="text-red-500">*</span>
                          </label>
                          <select
                            name="status"
                            value={editedProduct.status}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white appearance-none"
                          >
                            <option value="판매중">판매중</option>
                            <option value="품절">품절</option>
                            <option value="판매중지">판매중지</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            수령일
                          </label>
                          <input
                            type="date"
                            name="pickup_date"
                            value={
                              editedProduct.pickup_date
                                ? new Date(editedProduct.pickup_date)
                                    .toISOString()
                                    .split("T")[0]
                                : ""
                            }
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          메모
                        </label>
                        <textarea
                          name="memo"
                          value={editedProduct.memo || ""}
                          onChange={handleInputChange}
                          rows="3"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        ></textarea>
                      </div>
                    </div>
                  )}
                  {activeTab === "barcode" && (
                    <div className="space-y-6">
                      <BarcodeOptionsManager
                        selectedProduct={selectedProduct}
                        editedProduct={editedProduct}
                        setEditedProduct={setEditedProduct}
                        userData={userData}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
                <button
                  onClick={deleteProduct}
                  className="flex items-center gap-1 px-4 py-2 bg-red-100 text-red-600 text-sm font-medium rounded-lg hover:bg-red-200 hover:text-red-700 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <TrashIcon className="w-4 h-4" /> 삭제
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    취소
                  </button>
                  <button
                    onClick={updateProduct}
                    disabled={isLoadingProductDetail}
                    className={`px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-70 disabled:cursor-not-allowed`}
                  >
                    {isLoadingProductDetail ? (
                      <LoadingSpinner
                        className="h-4 w-4 inline-block"
                        color="text-white"
                      />
                    ) : (
                      "저장"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 토스트 알림 컨테이너 */}
      <ToastContainer toasts={toasts} hideToast={hideToast} />
    </div>
  );
}
