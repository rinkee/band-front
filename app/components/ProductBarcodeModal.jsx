"use client";

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import {
  X,
  Package,
  Tag,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  QrCode,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { useProductClientMutations } from "../hooks/useProductsClient.js";

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

  return <svg ref={barcodeRef}></svg>;
};

// 로딩 스피너
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

// 바코드 추천 카드 컴포넌트
const BarcodeSuggestionCard = ({ suggestion, onApply, isActive }) => {
  const formatPrice = (price) => {
    if (typeof price !== "number") return "0원";
    return `${price.toLocaleString()}원`;
  };

  const getDaysAgoText = (days) => {
    if (days === 0) return "오늘";
    if (days === 1) return "어제";
    if (days <= 7) return `${days}일 전`;
    if (days <= 30) return `${Math.floor(days / 7)}주 전`;
    return `${Math.floor(days / 30)}개월 전`;
  };

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
        isActive ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-orange-300"
      }`}
      onClick={() => onApply(suggestion)}
    >
      <div className="flex items-start gap-3">
        {/* 바코드 미리보기 */}
        <div className="flex-shrink-0 bg-white p-2 rounded border border-gray-100">
          <Barcode value={suggestion.barcode} height={30} width={0.8} />
        </div>

        {/* 상품 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 text-sm">
                {suggestion.clean_title}
                {suggestion.option_name && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({suggestion.option_name})
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-medium text-orange-600">
                  {formatPrice(suggestion.price)}
                </span>
                <span className="text-xs text-gray-500">
                  {getDaysAgoText(suggestion.days_ago)}
                </span>
                {suggestion.used_count > 1 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {suggestion.used_count}회 사용
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">
                📋 {suggestion.product_title}
              </p>
            </div>
            {suggestion.days_ago <= 7 && (
              <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                최근
              </span>
            )}
          </div>

          {/* 최근 사용 이력 (여러 번 사용한 경우) */}
          {suggestion.recent_uses && suggestion.recent_uses.length > 1 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-600 mb-1">최근 사용 이력:</p>
              <div className="space-y-0.5">
                {suggestion.recent_uses.slice(1, 3).map((use, idx) => (
                  <div key={idx} className="text-xs text-gray-500">
                    • {use.date} - {formatPrice(use.price)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 적용 아이콘 */}
        <div className="flex-shrink-0">
          {isActive ? (
            <CheckCircle2 className="w-5 h-5 text-orange-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
    </div>
  );
};

// 바코드 옵션 관리자
const BarcodeOptionsManager = forwardRef(
  ({ product, onUpdate, userId, onStateChange }, ref) => {
    const [options, setOptions] = useState([]);
    const [status, setStatus] = useState({ message: "", type: "" });
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [appliedBarcodes, setAppliedBarcodes] = useState(new Set());
    const { patchProduct } = useProductClientMutations();

    // 초기값 설정
    useEffect(() => {
      if (
        product?.barcode_options?.options &&
        product.barcode_options.options.length > 0
      ) {
        const optionsWithId = product.barcode_options.options.map(
          (option, index) => ({
            ...option,
            id: option.id || `option_${Date.now()}_${index}`,
          })
        );
        setOptions(optionsWithId);
      } else {
        // priceOptions를 기반으로 자동 바코드 옵션 생성
        const autoGeneratedOptions =
          generateBarcodeOptionsFromPriceOptions(product);

        // 기존 barcode 필드에 값이 있으면 메인 옵션에 설정
        if (product?.barcode && autoGeneratedOptions.length > 0) {
          const mainOption = autoGeneratedOptions.find((opt) => opt.is_main);
          if (mainOption) {
            mainOption.barcode = product.barcode;
            console.log(
              `[바코드 로드] 기존 barcode 필드에서 메인 바코드 로드: ${product.barcode}`
            );
          }
        }

        setOptions(autoGeneratedOptions);
      }

      // 바코드 추천 가져오기
      if (product?.title) {
        fetchBarcodeSuggestions(product.title);
      }
    }, [product]);

    // 바코드 추천 가져오기 함수
    const fetchBarcodeSuggestions = async (title) => {
      if (!title || !userId) return;

      setLoadingSuggestions(true);
      try {
        const response = await fetch(
          `/api/products/barcode-suggestions?title=${encodeURIComponent(title)}&userId=${userId}`
        );
        
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        } else {
          console.error('바코드 추천 가져오기 실패');
          setSuggestions([]);
        }
      } catch (error) {
        console.error('바코드 추천 API 오류:', error);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    // 추천 바코드 적용 함수
    const applyBarcodeSuggestion = (suggestion) => {
      // 현재 활성화된 옵션 찾기 (비어있는 바코드 필드 우선)
      const emptyOption = options.find(opt => !opt.barcode || opt.barcode.trim() === '');
      const targetOption = emptyOption || options.find(opt => opt.is_main) || options[0];
      
      if (targetOption) {
        updateOption(targetOption.id, 'barcode', suggestion.barcode);
        
        // 가격도 업데이트 (옵션이 비어있었다면)
        if (!targetOption.price || targetOption.price === 0) {
          updateOption(targetOption.id, 'price', suggestion.price);
        }
        
        // 적용된 바코드 표시
        setAppliedBarcodes(prev => new Set([...prev, suggestion.barcode]));
        
        // 성공 메시지
        setStatus({
          message: `${suggestion.clean_title}의 바코드를 적용했습니다.`,
          type: 'success'
        });
        
        // 3초 후 메시지 제거
        setTimeout(() => {
          setStatus({ message: '', type: '' });
        }, 3000);
      }
    };

    // priceOptions를 기반으로 바코드 옵션 자동 생성 (바코드는 빈 상태로)
    const generateBarcodeOptionsFromPriceOptions = (product) => {
      const priceOptions = product?.price_options || [];

      if (priceOptions.length === 0) {
        // priceOptions가 없으면 기본 옵션만 생성 (바코드 빈칸)
        return [
          {
            id: `main_${Date.now()}`,
            name: "기본상품",
            price: product?.base_price || 0,
            barcode: "", // 빈 바코드로 설정
            is_main: true,
          },
        ];
      }

      // priceOptions를 기반으로 바코드 옵션 생성 (바코드는 빈칸)
      const generatedOptions = priceOptions.map((option, index) => {
        const isMain = index === 0; // 첫 번째 옵션을 기본으로 설정

        return {
          id: isMain ? `main_${Date.now()}` : `option_${Date.now()}_${index}`,
          name: option.description || `옵션 ${index + 1}`,
          price: option.price,
          barcode: "", // 빈 바코드로 설정
          is_main: isMain,
        };
      });

      console.log(
        `[바코드 옵션 생성] ${product.title}에 대해 ${generatedOptions.length}개 옵션 생성 (바코드 빈칸):`,
        generatedOptions
      );
      return generatedOptions;
    };

    // 바코드 추가
    const addOption = () => {
      if (options.length >= 4) {
        alert("바코드 옵션은 최대 4개까지 추가할 수 있습니다.");
        return;
      }

      const barcodeNumber = options.filter((opt) => !opt.is_main).length + 1;
      const newOption = {
        id: `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `바코드${barcodeNumber}`,
        price: product?.base_price || 0,
        barcode: "",
        is_main: false,
      };
      setOptions([...options, newOption]);
    };

    // 옵션 삭제
    const removeOption = (optionId) => {
      const optionToRemove = options.find((opt) => opt.id === optionId);
      if (optionToRemove?.is_main) {
        alert("기본 옵션은 삭제할 수 없습니다.");
        return;
      }
      setOptions(options.filter((opt) => opt.id !== optionId));
    };

    // 옵션 수정
    const updateOption = (optionId, field, value) => {
      setOptions((prev) =>
        prev.map((opt) =>
          opt.id === optionId ? { ...opt, [field]: value } : opt
        )
      );
    };

    // 외부에서 호출할 수 있는 함수 노출
    useImperativeHandle(ref, () => ({
      saveOptions,
      options,
      hasValidData: () => {
        const hasEmptyFields = options.some(
          (opt) => !opt.name.trim() || !opt.barcode.trim() || opt.price <= 0
        );
        return !hasEmptyFields;
      },
      hasNoDuplicates: () => {
        const barcodeMap = new Map();
        const duplicates = [];
        options.forEach((opt) => {
          const barcode = opt.barcode.trim();
          if (barcodeMap.has(barcode)) {
            if (!duplicates.includes(barcode)) {
              duplicates.push(barcode);
            }
          } else {
            barcodeMap.set(barcode, true);
          }
        });
        return duplicates.length === 0;
      },
    }));

    // 저장 함수 - products 페이지와 동일한 방식으로 변경
    const saveOptions = async () => {
      if (!userId) {
        setStatus({ message: "사용자 정보가 없습니다.", type: "error" });
        return;
      }

      // 유효성 검사
      const hasEmptyFields = options.some(
        (opt) => !opt.name.trim() || !opt.barcode.trim() || opt.price <= 0
      );
      if (hasEmptyFields) {
        setStatus({
          message: "모든 바코드의 이름, 바코드, 가격을 입력해주세요.",
          type: "error",
        });
        return;
      }

      // 중복 바코드 검사
      const barcodeMap = new Map();
      const duplicates = [];
      options.forEach((opt) => {
        const barcode = opt.barcode.trim();
        if (barcodeMap.has(barcode)) {
          if (!duplicates.includes(barcode)) {
            duplicates.push(barcode);
          }
        } else {
          barcodeMap.set(barcode, true);
        }
      });

      if (duplicates.length > 0) {
        setStatus({
          message: `중복된 바코드가 있습니다: ${duplicates.join(", ")}`,
          type: "error",
        });
        return;
      }

      setStatus({ message: "저장 중...", type: "loading" });

      try {
        // 메인 바코드 찾기
        const mainBarcode = options.find((opt) => opt.is_main)?.barcode || "";

        // 바코드 옵션 데이터 준비
        const barcodeOptionsData = {
          options: options.map((option) => ({
            id: option.id,
            name: option.name,
            price: option.price,
            barcode: option.barcode,
            is_main: option.is_main || false,
          })),
          updated_at: new Date().toISOString(),
        };

        console.log(
          `[바코드 저장] 상품 ${product.product_id}에 바코드 옵션 저장:`,
          barcodeOptionsData
        );

        // products 페이지와 같은 방식으로 저장 - Supabase 클라이언트 직접 사용
        const updateData = {
          barcode: mainBarcode,
          barcode_options: barcodeOptionsData,
        };

        const updatedProduct = await patchProduct(
          product.product_id,
          updateData,
          userId
        );

        console.log("바코드 저장 성공:", updatedProduct);
        if (onUpdate) {
          onUpdate(updatedProduct);
        }
        return true;
      } catch (error) {
        console.error("바코드 저장 오류:", error);
        setStatus({
          message:
            error.message || "바코드 저장에 실패했습니다. 다시 시도해주세요.",
          type: "error",
        });
        throw error; // 에러를 상위로 전파
      }
    };

    // 중복 바코드 체크
    const duplicateBarcodes = [];
    const barcodeMap = new Map();
    options.forEach((opt) => {
      if (opt.barcode && barcodeMap.has(opt.barcode)) {
        if (!duplicateBarcodes.includes(opt.barcode)) {
          duplicateBarcodes.push(opt.barcode);
        }
      } else if (opt.barcode) {
        barcodeMap.set(opt.barcode, true);
      }
    });

    useEffect(() => {
      if (onStateChange) {
        const allValid = options.every(
          (opt) =>
            opt.name?.trim() &&
            opt.price &&
            opt.barcode?.trim() &&
            /^[a-zA-Z0-9]+$/.test(opt.barcode) &&
            isBarcodeUnique(opt.barcode, opt.id)
        );
        const hasNoOptions = options.length === 0;

        let summary = "";
        const barcodeOptions = options.filter((opt) => opt.barcode);
        if (barcodeOptions.length === 1) {
          summary = barcodeOptions[0].barcode;
        } else if (barcodeOptions.length > 1) {
          summary = `${barcodeOptions.length}개 바코드`;
        }

        onStateChange({
          isValid: hasNoOptions || allValid,
          summary: summary,
        });
      }
    }, [options, onStateChange]);

    const isBarcodeUnique = (barcode, currentOptionId) => {
      const count = options.filter(
        (opt) => opt.barcode === barcode && opt.id !== currentOptionId
      ).length;
      return count === 0;
    };

    return (
      <div className="">
        <div className="flex justify-between items-start"></div>

        {status.type === "error" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">
            {status.message}
          </div>
        )}
        
        {status.type === "success" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-3">
            {status.message}
          </div>
        )}

        {/* 바코드 추천 섹션 */}
        {suggestions.length > 0 && showSuggestions && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                💡 이전에 사용한 바코드
                {loadingSuggestions && (
                  <LoadingSpinner className="h-4 w-4" />
                )}
              </h4>
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showSuggestions ? '접기' : '펼치기'}
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <BarcodeSuggestionCard
                  key={`${suggestion.barcode}-${index}`}
                  suggestion={suggestion}
                  onApply={applyBarcodeSuggestion}
                  isActive={appliedBarcodes.has(suggestion.barcode)}
                />
              ))}
            </div>
            
            {suggestions.length === 0 && !loadingSuggestions && (
              <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                이전에 사용한 바코드가 없습니다. 새로 입력해주세요.
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {options.map((option, index) => (
            <div key={option.id} className=" rounded-lg">
              {/* <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-gray-700 px-2 py-1 bg-white rounded-md">
                  {option.is_main ? "기본" : `바코드 ${index}`}
                </span>
                {!option.is_main && (
                  <button
                    onClick={() => removeOption(option.id)}
                    className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div> */}

              {/* 가로 배치된 입력 필드들 */}
              <div className="grid grid-cols-5 gap-x-4 gap-y-3 items-center">
                {/* 바코드명 */}
                <div className="col-span-1">
                  <label
                    htmlFor={`name_${option.id}`}
                    className="text-xs font-medium text-gray-600 mb-1.5 flex items-center"
                  >
                    옵션명 *
                    {option.is_main && (
                      <span className="ml-2 text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                        기본
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    id={`name_${option.id}`}
                    value={option.name}
                    onChange={(e) =>
                      updateOption(option.id, "name", e.target.value)
                    }
                    placeholder="예: 대용량, 프리미엄"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    disabled={option.is_main}
                  />
                </div>

                {/* 기본가 */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    기본가 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={option.price === 0 ? "" : option.price}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || /^\d+$/.test(value)) {
                        updateOption(
                          option.id,
                          "price",
                          value === "" ? 0 : parseInt(value)
                        );
                      }
                    }}
                    placeholder="가격"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>

                {/* 바코드 입력 */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    바코드 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={option.barcode}
                      onChange={(e) => {
                        const value = e.target.value.replace(
                          /[^a-zA-Z0-9]/g,
                          ""
                        );
                        updateOption(option.id, "barcode", value);
                      }}
                      placeholder="바코드 번호 (영문, 숫자만)"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 bg-white ${
                        option.barcode &&
                        options.filter(
                          (opt) =>
                            opt.id !== option.id &&
                            opt.barcode === option.barcode
                        ).length > 0
                          ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      }`}
                    />
                    {option.barcode &&
                      options.filter(
                        (opt) =>
                          opt.id !== option.id && opt.barcode === option.barcode
                      ).length > 0 && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                  </div>
                  {option.barcode &&
                    options.filter(
                      (opt) =>
                        opt.id !== option.id && opt.barcode === option.barcode
                    ).length > 0 && (
                      <p className="mt-1 text-xs text-red-600">
                        ⚠️ 이 바코드는 이미 사용 중입니다
                      </p>
                    )}
                </div>

                {/* 바코드 미리보기 */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    미리보기
                  </label>
                  <div className="h-10 flex items-center  rounded-lg">
                    {option.barcode ? (
                      <Barcode value={option.barcode} height={24} width={1} />
                    ) : (
                      <span className="text-xs text-gray-400">
                        바코드 입력 시 표시
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-1 flex items-end">
                  <button
                    onClick={() => removeOption(option.id)}
                    disabled={option.is_main}
                    className="p-2 rounded-md transition-colors text-gray-500 hover:text-red-600 hover:bg-red-100 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          {/* <button
              onClick={() => {
                const autoOptions =
                  generateBarcodeOptionsFromPriceOptions(product);
                setOptions(autoOptions);
              }}
              className="px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200"
            >
              <QrCode className="w-4 h-4" />
              자동 생성
            </button> */}
          <button
            onClick={addOption}
            disabled={options.length >= 4}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
              options.length >= 4
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-sky-200 "
            }`}
          >
            <Plus className="w-4 h-4" />
            옵션 추가 ({options.length}/4)
          </button>
        </div>
      </div>
    );
  }
);

export default function ProductBarcodeModal({
  isOpen,
  onClose,
  postId,
  userId,
  onProductUpdate,
  onOpenProductManagement, // optional: open product management when no products
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const barcodeManagers = useRef(new Map());
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [productState, setProductState] = useState(new Map());
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0, productName: '' });

  useEffect(() => {
    if (isOpen) {
      fetchPostDetails();
    }
  }, [isOpen, postId]);

  useEffect(() => {
    if (isOpen && data?.products) {
      if (data.products.length > 0 && data.products.length <= 5) {
        setExpandedProducts(new Set(data.products.map((p) => p.product_id)));
      } else {
        setExpandedProducts(new Set());
      }
      setProductState(new Map());
    }
  }, [isOpen, data]);

  const fetchPostDetails = async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/posts/${postId}?userId=${userId}`);
      const result = await response.json();

      if (response.ok) {
        setData(result);
      } else {
        setError(result.error || "데이터를 불러오는데 실패했습니다.");
      }
    } catch (error) {
      console.error("Error fetching post details:", error);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (typeof price !== "number") return "0원";
    return `${price.toLocaleString()}원`;
  };

  const handleProductUpdate = (updatedProduct) => {
    // 낙관적 업데이트 - 즉시 UI 업데이트
    if (data && data.products) {
      const updatedProducts = data.products.map(p => 
        p.product_id === updatedProduct.product_id ? updatedProduct : p
      );
      setData({ ...data, products: updatedProducts });
    }
    
    // 상품 업데이트 후 데이터 새로고침
    fetchPostDetails();
    // 상위 컴포넌트도 갱신
    if (onProductUpdate) {
      onProductUpdate(updatedProduct);
    }
  };

  // ref callback 함수를 컴포넌트 최상위에서 정의
  const createRefCallback = useCallback((productId) => {
    return (ref) => {
      if (ref) {
        barcodeManagers.current.set(productId, ref);
      } else {
        barcodeManagers.current.delete(productId);
      }
    };
  }, []);

  const toggleExpand = useCallback((productId) => {
    setExpandedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  }, []);

  const handleProductStateChange = useCallback((productId, newState) => {
    setProductState((prev) => {
      const current = prev.get(productId);
      if (
        current &&
        current.isValid === newState.isValid &&
        current.summary === newState.summary
      ) {
        return prev;
      }
      const newMap = new Map(prev);
      newMap.set(productId, newState);
      return newMap;
    });
  }, []);

  // 전체 저장 함수 - 병렬 처리 및 진행률 표시
  const handleSaveAll = async () => {
    if (!data?.products || data.products.length === 0) {
      alert("저장할 상품이 없습니다.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const managers = Array.from(barcodeManagers.current.values());
      const productsToSave = [];

      // 모든 상품의 바코드 옵션 검증
      for (let i = 0; i < managers.length; i++) {
        const manager = managers[i];
        const product = data.products[i];
        
        if (!manager.hasValidData()) {
          throw new Error("모든 바코드의 이름, 바코드, 가격을 입력해주세요.");
        }
        if (!manager.hasNoDuplicates()) {
          throw new Error("중복된 바코드가 있습니다. 중복을 제거해주세요.");
        }
        
        productsToSave.push({ manager, product });
      }

      // 진행률 초기화
      setSaveProgress({ current: 0, total: productsToSave.length, productName: '' });

      // 병렬 처리를 위한 배치 사이즈 (2-3개씩 동시 처리)
      const batchSize = 3;
      const batches = [];
      
      for (let i = 0; i < productsToSave.length; i += batchSize) {
        batches.push(productsToSave.slice(i, i + batchSize));
      }

      let completedCount = 0;
      
      // 배치별로 병렬 처리 with 에러 핸들링
      const failedProducts = [];
      
      for (const batch of batches) {
        const promises = batch.map(async ({ manager, product }) => {
          try {
            setSaveProgress(prev => ({ 
              ...prev, 
              productName: `${product.title || '상품'} 처리중...`
            }));
            
            const result = await manager.saveOptions();
            
            completedCount++;
            setSaveProgress(prev => ({ 
              ...prev, 
              current: completedCount,
              productName: completedCount === productsToSave.length ? '✨ 모든 상품 저장 완료!' : `${product.title || '상품'} 완료`
            }));
            
            // 낙관적 업데이트를 위해 개별 상품 업데이트 즉시 반영
            handleProductUpdate(result);
            
            return { success: true, product, result };
          } catch (error) {
            console.error(`상품 ${product.title} 저장 실패:`, error);
            failedProducts.push({ product, error: error.message });
            completedCount++;
            setSaveProgress(prev => ({ 
              ...prev, 
              current: completedCount
            }));
            return { success: false, product, error };
          }
        });
        
        await Promise.all(promises);
      }
      
      // 실패한 항목이 있으면 알림
      if (failedProducts.length > 0) {
        const failedTitles = failedProducts.map(f => f.product.title).join(', ');
        throw new Error(`일부 상품 저장 실패: ${failedTitles}`);
      }

      // 성공 시 조용히 처리 (alert 제거)
      
      // 데이터 새로고침 및 상위 컴포넌트 업데이트
      await fetchPostDetails();
      
      // 상위 컴포넌트에 업데이트 알림 (posts 페이지 새로고침)
      if (onProductUpdate) {
        onProductUpdate();
      }
      
      // 모달 닫기 전 잠시 대기 (사용자가 완료 상태를 볼 수 있도록)
      setTimeout(() => {
        setSaveProgress({ current: 0, total: 0, productName: '' });
      }, 1000);
      
    } catch (error) {
      console.error("전체 저장 오류:", error);
      setSaveError(error.message || "저장에 실패했습니다. 다시 시도해주세요.");
      setSaveProgress({ current: 0, total: 0, productName: '' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 고정 헤더 */}
        <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              상품 바코드 관리
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 스크롤 가능한 내용 */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <LoadingSpinner className="w-8 h-8 mx-auto mb-4" />
                <div className="text-gray-600">데이터를 불러오는 중...</div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64">
              <div className="text-red-600 p-4 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            </div>
          )}

          {data && !loading && !error && (
            <div className="space-y-6">
              {/* 상품 목록 */}
              {data.products && data.products.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-base font-medium text-gray-800 flex items-center gap-2 px-1 mb-2">
                    <Package className="w-5 h-5" />
                    상품 목록 ({data.products.length}개)
                  </h3>

                  {data.products
                    .sort((a, b) => a.product_id.localeCompare(b.product_id))
                    .map((product) => {
                      const isExpanded = expandedProducts.has(
                        product.product_id
                      );
                      const state = productState.get(product.product_id) || {
                        isValid: false,
                        summary: "",
                      };

                      return (
                        <div
                          key={product.product_id}
                          className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                        >
                          <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => toggleExpand(product.product_id)}
                          >
                            <div className="flex items-center gap-3">
                              {state.isValid ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                              )}
                              <h4 className="font-medium text-gray-800 text-md">
                                {product.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              {!isExpanded && state.summary && (
                                <div className="flex items-center gap-1.5 text-gray-700 bg-gray-100 px-2 py-1 rounded-md">
                                  <QrCode className="w-4 h-4" />
                                  <span className="font-mono text-xs font-medium">
                                    {state.summary}
                                  </span>
                                </div>
                              )}
                              <span className="font-medium">
                                {isExpanded ? "접기" : "수정"}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </div>
                          </div>

                          <div
                            className={`${
                              isExpanded ? "block" : "hidden"
                            } p-3 border-t border-gray-200 bg-gray-50/50`}
                          >
                            <BarcodeOptionsManager
                              ref={createRefCallback(product.product_id)}
                              product={product}
                              onUpdate={handleProductUpdate}
                              userId={userId}
                              onStateChange={(newState) =>
                                handleProductStateChange(
                                  product.product_id,
                                  newState
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-600">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="mb-3">이 게시물에는 상품이 없습니다.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        // Close this modal and open legacy product management to add first product
                        if (typeof onOpenProductManagement === 'function') {
                          try {
                            onClose && onClose();
                          } finally {
                            onOpenProductManagement();
                          }
                        }
                      }}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                    >
                      상품 추가하기
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 고정 버튼 */}
        {data?.products && data.products.length > 0 && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
            {/* 진행률 표시 바 */}
            {saving && saveProgress.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">
                    진행 상황: {saveProgress.productName}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {saveProgress.current}/{saveProgress.total} 완료
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-orange-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {saveError}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-8 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-md min-w-[200px]"
              >
                {saving ? (
                  <>
                    <LoadingSpinner className="w-5 h-5" color="text-white" />
                    <div className="flex flex-col items-start">
                      <span>
                        저장 중... ({saveProgress.current}/{saveProgress.total})
                      </span>
                      {saveProgress.productName && (
                        <span className="text-xs opacity-80">
                          {saveProgress.productName}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    모든 상품 저장하기
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
