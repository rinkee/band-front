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

import JsBarcode from "jsbarcode";
import { useSWRConfig } from "swr";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import UpdateButton from "../components/UpdateButton"; // UpdateButton 컴포넌트 import

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
  let bgColor, textColor, Icon;
  switch (status) {
    case "판매중":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "마감":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIconOutline;
      break;
    // case "판매중지":
    //   bgColor = "bg-yellow-100";
    //   textColor = "text-yellow-600";
    //   Icon = SparklesIcon;
    //   break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-500";
      Icon = ExclamationCircleIcon;
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-3.5 w-3.5" />
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
  const [inputValue, setInputValue] = useState("");
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
          alert("상품 상세 정보를 가져오는 데 실패했습니다.");
          handleCloseModal();
        }
      },
      onError: (error) => {
        console.error("상품 상세 조회 오류:", error);
        alert("상품 정보를 불러오는데 실패했습니다.");
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

  // 상품 목록 상태 업데이트 useEffect
  useEffect(() => {
    if (productsData?.data) {
      setProducts(
        productsData.data
          .slice() // Create a shallow copy before reversing
          // .reverse() // Reverse the array
          .map((p) => ({ ...p, barcode: p.barcode || "" }))
      );
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
    const d = new Date(ds);
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
    } else if (name === "pickup_date") {
      // Explicitly handle empty string for pickup_date
      setEditedProduct((prev) => ({
        ...prev,
        [name]: value === "" ? null : new Date(value),
      }));
    } else {
      setEditedProduct((prev) => ({ ...prev, [name]: value }));
    }
  };

  // 클라이언트 사이드 mutation 함수들
  const { patchProduct, deleteProduct: deleteProductMutation } =
    useProductClientMutations();

  const updateProduct = async () => {
    if (
      !selectedProduct ||
      !userData ||
      !editedProduct.title ||
      editedProduct.base_price < 0
    ) {
      console.log("Invalid data:", editedProduct);
      alert("상품명과 가격을 올바르게 입력해주세요.");
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
        alert(
          `중복된 바코드가 있어 저장할 수 없습니다: ${duplicates.join(
            ", "
          )}\n각 바코드는 고유해야 합니다.`
        );
        return;
      }

      // 빈 바코드 검사
      const hasEmptyBarcodes = barcodeOptions.some(
        (opt) => !opt.barcode?.trim()
      );
      if (hasEmptyBarcodes) {
        alert(
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
      alert("상품 정보가 저장되었습니다.");
    } catch (error) {
      console.error("상품 정보 업데이트 오류 (client-side):", error);
      alert(error.message || "상품 정보 업데이트에 실패했습니다.");
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
      alert("상품이 삭제되었습니다.");
    } catch (error) {
      console.error("상품 삭제 오류 (client-side):", error);
      alert(error.message || "상품 삭제에 실패했습니다.");
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
          <UpdateButton
            onClick={() => mutateProducts()} // mutateProducts만 호출 (필요시 다른 mutate도 추가)
            loading={isDataLoading}
            disabled={isDataLoading}
            className="w-full md:w-auto" // OrdersPage와 동일한 스타일
          >
            업데이트
          </UpdateButton>
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
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-16">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sm:pl-6">
                    <button
                      onClick={() => handleSortChange("title")}
                      className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                      disabled={isDataLoading}
                    >
                      상품명
                      <span className="inline-block">
                        {getSortIcon("title")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("base_price")}
                      className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                      disabled={isDataLoading}
                    >
                      가격
                      <span className="inline-block">
                        {getSortIcon("base_price")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">
                    바코드
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("created_at")}
                      className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                      disabled={isDataLoading}
                    >
                      등록일
                      <span className="inline-block">
                        {getSortIcon("created_at")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("pickup_date")}
                      className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                      disabled={isDataLoading}
                    >
                      수령일
                      <span className="inline-block">
                        {getSortIcon("pickup_date")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("status")}
                      className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                      disabled={isDataLoading}
                    >
                      상태
                      <span className="inline-block">
                        {getSortIcon("status")}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {isProductsLoading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan="7"
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
                      colSpan="7"
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
                      <td className="px-4 py-3 text-center text-sm text-gray-500">
                        {rowNum}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap sm:pl-6">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                          {product.title || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">
                        {formatCurrency(product.base_price)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div
                          style={{ width: "150px" }}
                          className="mx-auto sm:mx-0"
                        >
                          <Barcode
                            value={product.barcode}
                            height={30}
                            width={1.2}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{formatDate(product.posted_at)}</span>
                          <span className="text-xs">
                            {formatDateTime(product.posted_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {product.pickup_date ? (
                          <span className="font-medium">
                            {formatDatePickup(product.pickup_date)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={product.status} />
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
    </div>
  );
}
