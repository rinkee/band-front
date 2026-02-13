/**
 * 상품 정보 처리 및 검증 모듈
 * AI가 추출한 상품 정보를 검증하고 정규화합니다.
 */

import { getDefaultProduct } from './defaultProduct.js';

const DEFAULT_MAX_PRODUCT_TITLE_CHARS = 56;

const resolveMaxTitleChars = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_PRODUCT_TITLE_CHARS;
  return Math.min(120, Math.max(20, parsed));
};

const normalizeProductTitle = (rawTitle, maxChars) => {
  if (typeof rawTitle !== "string") return "";

  const normalized = rawTitle
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "상품";
  if (normalized.length <= maxChars) return normalized;

  const clipped = normalized
    .slice(0, maxChars)
    .replace(/[+,\-\/\s]+$/g, "")
    .trim();

  return `${clipped || normalized.slice(0, maxChars).trim()}...`;
};

/**
 * 상품 정보를 처리하고 검증하는 함수
 *
 * @param {Object} productInfo - AI가 추출한 상품 정보
 * @param {string} postTime - 게시물 작성 시간
 * @param {Object|null} userSettings - 사용자 설정 (바코드 자동 생성 등)
 * @param {Object} options - 추가 옵션
 * @returns {Object} 처리된 상품 정보
 */
export function processProduct(productInfo, postTime, userSettings = null, options = {}) {
  if (!productInfo) return getDefaultProduct("정보 없음").products[0];
  const maxTitleChars = resolveMaxTitleChars(options?.maxTitleChars);

  if (productInfo.title !== undefined) {
    productInfo.title = normalizeProductTitle(productInfo.title, maxTitleChars);
  }

  // pickupInfo 기반 날짜는 사용하지 않고, 타입만 기본값 보정
  if (!productInfo.pickupType) {
    productInfo.pickupType = "수령";
  }

  // 필요하지 않은 속성 제거
  if (productInfo.multipleProducts !== undefined) {
    delete productInfo.multipleProducts;
  }

  // 🔥 NEW: 개별 상품 구조 처리 (AI가 개별 상품으로 추출한 경우)
  // basePrice가 있고 priceOptions가 없거나 비어있으면 개별 상품으로 처리
  if (productInfo.basePrice > 0 && (!productInfo.priceOptions || productInfo.priceOptions.length === 0)) {
    console.debug('개별 상품 처리', {
      title: productInfo.title,
      basePrice: productInfo.basePrice,
      message: '이 상품은 개별 상품으로 처리됩니다 (priceOptions 구조로 변환하지 않음)'
    });
    // 개별 상품의 경우 basePrice를 그대로 유지하고 priceOptions는 빈 배열로 설정
    productInfo.priceOptions = [];
    return productInfo;
  }

  // 🔥 OLD: 기존 priceOptions 구조 처리 (하위 호환성을 위해 유지)
  // 가격 옵션 검증 및 정리
  if (!productInfo.priceOptions || !Array.isArray(productInfo.priceOptions)) {
    productInfo.priceOptions = [];
  }

  // 🔥 중복된 description을 가진 옵션 제거 - 가장 낮은 가격만 유지
  if (productInfo.priceOptions.length > 1) {
    const uniqueOptions = new Map();
    productInfo.priceOptions.forEach((option) => {
      if (option && option.description && typeof option.price === "number") {
        const existing = uniqueOptions.get(option.description);
        // 같은 description이 없거나, 있어도 현재 가격이 더 낮으면 업데이트
        if (!existing || option.price < existing.price) {
          uniqueOptions.set(option.description, option);
        }
      }
    });
    // Map을 배열로 변환하고 quantity 기준으로 정렬
    productInfo.priceOptions = Array.from(uniqueOptions.values()).sort((a, b) => (a.quantity || 1) - (b.quantity || 1));
  }

  // 🔥 개별 상품이 아닌 경우에만 priceOptions 생성
  // 개별 상품은 basePrice만으로 처리하고 priceOptions는 빈 배열 유지
  if (productInfo.priceOptions.length === 0 && typeof productInfo.basePrice === "number" && productInfo.basePrice > 0) {
    // 개별 상품인지 확인: 제목에 구체적인 단위가 포함되어 있으면 개별 상품으로 간주
    const isIndividualProduct = productInfo.title && /(반박스|한박스|소박스|대박스|반세트|한세트|반팩|한팩|미니박스|점보박스)/.test(productInfo.title);

    if (!isIndividualProduct) {
      // 개별 상품이 아닌 경우에만 priceOptions 생성
      productInfo.priceOptions = [
        {
          quantity: 1,
          price: productInfo.basePrice,
          description: productInfo.quantityText || "기본옵션"
        }
      ];
    } else {
      console.debug('개별 상품 감지', {
        title: productInfo.title,
        basePrice: productInfo.basePrice,
        message: 'priceOptions 생성 대신 basePrice만 사용'
      });
    }
  }

  // 🔥 개별 상품이 아닌 경우에만 basePrice 자동 설정
  // 개별 상품은 이미 올바른 basePrice를 가지고 있으므로 재계산하지 않음
  if (productInfo.priceOptions && productInfo.priceOptions.length > 0) {
    // 개별 상품인지 확인
    const isIndividualProduct = productInfo.title && /(반박스|한박스|소박스|대박스|반세트|한세트|반팩|한팩|미니박스|점보박스)/.test(productInfo.title);

    if (!isIndividualProduct) {
      const getMinQuantity = (opt) => {
        const raw = opt?.minQuantity ?? opt?.min_quantity;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
          return raw;
        }
        if (typeof raw === 'string') {
          const normalized = raw.replace(/[^\d.]/g, '');
          if (normalized.length === 0) return 1;
          const parsed = Number(normalized);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }
        return 1;
      };

      const quantityOneOptions = productInfo.priceOptions.filter((opt) => (opt.quantity ?? 1) === 1);
      let baseOption = quantityOneOptions.filter((opt) => getMinQuantity(opt) === 1).sort((a, b) => a.price - b.price)[0];

      if (!baseOption) {
        baseOption = quantityOneOptions.sort((a, b) => {
          const aMin = getMinQuantity(a);
          const bMin = getMinQuantity(b);
          if (aMin !== bMin) return aMin - bMin;
          return a.price - b.price;
        })[0];
      }

      if (!baseOption && productInfo.priceOptions.length > 0) {
        baseOption = productInfo.priceOptions.sort((a, b) => a.price - b.price)[0];
      }

      if (baseOption) {
        productInfo.basePrice = baseOption.price;
      }
    } else {
      console.debug('개별 상품 basePrice 유지', {
        title: productInfo.title,
        basePrice: productInfo.basePrice,
        message: 'basePrice 재계산 건너뛰기'
      });
    }
  }

  // 기본 상품 상태 검사 및 설정
  if (!productInfo.status) {
    productInfo.status = "판매중";
  }

  // stockQuantity가 0인 경우 '품절'로 상태 변경
  if (productInfo.stockQuantity === 0) {
    productInfo.status = "품절";
  }

  // 기본 필드 보장
  if (!productInfo.tags) productInfo.tags = [];
  if (!productInfo.features) productInfo.features = [];
  if (!productInfo.category) productInfo.category = "기타";
  if (!productInfo.quantity) productInfo.quantity = 1;
  if (!productInfo.quantityText) productInfo.quantityText = "1개";

  // 🔥 바코드 옵션 자동 생성 (priceOptions 기반) - auto_barcode_generation 설정에 따라
  if (userSettings?.auto_barcode_generation === true && productInfo.priceOptions && productInfo.priceOptions.length > 0) {
    const barcodeOptions = productInfo.priceOptions.map((option, index) => ({
      id: `option_${index + 1}`,
      name: productInfo.title || option.description || `옵션 ${index + 1}`,
      barcode: productInfo.barcode || "",
      price: option.price
    }));
    // barcode_options 필드에 저장
    productInfo.barcode_options = barcodeOptions;
  } else if (userSettings?.auto_barcode_generation !== true) {
    // 바코드 자동 생성이 비활성화된 경우 아무 작업도 하지 않음
  }

  return productInfo;
}
