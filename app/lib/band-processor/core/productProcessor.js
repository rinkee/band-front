import { extractPickupDate } from '../shared/utils/dateUtils.js';
import { generateProductUniqueIdForItem } from '../shared/utils/idUtils.js';

/**
 * 기본 상품 정보를 생성합니다
 * @param {string} reason - 기본 상품 생성 이유
 * @returns {Object} 기본 상품 정보
 */
export function getDefaultProduct(reason = "정보 없음") {
  const defaultProdData = {
    title: `[AI 분석 필요] ${reason}`,
    basePrice: 0,
    priceOptions: [
      {
        quantity: 1,
        price: 0,
        description: "정보 없음",
      },
    ],
    quantity: 1,
    quantityText: "1개",
    category: "미분류",
    status: "정보 필요",
    tags: [],
    features: [],
    pickupInfo: "",
    pickupDate: null,
    pickupType: "",
    stockQuantity: null,
    itemNumber: 1,
  };
  
  return {
    multipleProducts: false,
    products: [defaultProdData],
  };
}

/**
 * 상품 정보를 처리하고 정리합니다
 * @param {Object} productInfo - AI가 추출한 상품 정보
 * @param {string} postTime - 게시물 작성 시간
 * @param {Object} userSettings - 사용자 설정
 * @returns {Object} 처리된 상품 정보
 */
export function processProduct(productInfo, postTime, userSettings = null, content = "") {
  if (!productInfo) return getDefaultProduct("정보 없음").products[0];
  
  try {
    // 날짜 처리: 무조건 원본 컨텐츠 기반으로 추출
    let pickupDate = extractPickupDate(content || "", postTime);
    
    // 기본값 설정
    const processed = {
      ...productInfo,
      title: productInfo.title || "제목 없음",
      basePrice: productInfo.basePrice || 0,
      priceOptions: productInfo.priceOptions || [],
      quantity: productInfo.quantity || 1,
      quantityText: productInfo.quantityText || "1개",
      category: productInfo.category || "미분류",
      status: productInfo.status || "판매중",
      tags: productInfo.tags || [],
      features: productInfo.features || [],
      pickupInfo: productInfo.pickupInfo || "",
      pickupDate: pickupDate,
      pickupType: productInfo.pickupType || (pickupDate && pickupDate.type) || "수령",
      stockQuantity: productInfo.stockQuantity || null,
      itemNumber: productInfo.itemNumber || 1,
    };
    
    // 가격 옵션 검증 및 정리
    if (processed.priceOptions.length === 0) {
      processed.priceOptions = [
        {
          quantity: 1,
          price: processed.basePrice || 0,
          description: processed.quantityText || "1개",
        },
      ];
    }
    
    return processed;
  } catch (error) {
    console.error("[상품 처리] 오류:", error);
    return getDefaultProduct("처리 오류").products[0];
  }
}

/**
 * 수량 기반 상품 병합을 감지하고 처리합니다
 * @param {Array} products - 상품 배열
 * @returns {Array} 병합된 상품 배열
 */
export function detectAndMergeQuantityBasedProducts(products) {
  if (!products || products.length === 0) return products;
  
  const mergedProducts = [];
  const processed = new Set();
  
  for (let i = 0; i < products.length; i++) {
    if (processed.has(i)) continue;
    
    const product = products[i];
    let isMerged = false;
    
    // 다른 상품과 병합 가능한지 확인
    for (let j = i + 1; j < products.length; j++) {
      if (processed.has(j)) continue;
      
      const otherProduct = products[j];
      
      // 동일한 상품명의 다른 수량 옵션인지 확인
      if (shouldMergeProducts(product, otherProduct)) {
        // 병합
        const merged = mergeProducts(product, otherProduct);
        mergedProducts.push(merged);
        processed.add(i);
        processed.add(j);
        isMerged = true;
        break;
      }
    }
    
    if (!isMerged) {
      mergedProducts.push(product);
      processed.add(i);
    }
  }
  
  return mergedProducts;
}

/**
 * 두 상품이 병합 가능한지 확인합니다
 * @param {Object} product1 - 첫 번째 상품
 * @param {Object} product2 - 두 번째 상품
 * @returns {boolean} 병합 가능 여부
 */
function shouldMergeProducts(product1, product2) {
  // 제목에서 날짜 부분 제거 후 비교
  const title1 = product1.title.replace(/^\[[^\]]+\]\s*/, "").trim();
  const title2 = product2.title.replace(/^\[[^\]]+\]\s*/, "").trim();
  
  // 동일한 상품명인지 확인
  if (title1 !== title2) return false;
  
  // 수량만 다른 옵션인지 확인
  const qty1 = product1.quantity || 1;
  const qty2 = product2.quantity || 1;
  
  return qty1 !== qty2;
}

/**
 * 두 상품을 병합합니다
 * @param {Object} product1 - 첫 번째 상품
 * @param {Object} product2 - 두 번째 상품
 * @returns {Object} 병합된 상품
 */
function mergeProducts(product1, product2) {
  const merged = {
    ...product1,
    priceOptions: [...product1.priceOptions],
  };
  
  // product2의 가격 옵션 추가
  if (product2.priceOptions && product2.priceOptions.length > 0) {
    for (const option of product2.priceOptions) {
      // 중복 옵션이 아닌 경우만 추가
      const exists = merged.priceOptions.some(
        (opt) =>
          opt.quantity === option.quantity &&
          opt.price === option.price
      );
      
      if (!exists) {
        merged.priceOptions.push(option);
      }
    }
  }
  
  // 가격 옵션을 수량 기준으로 정렬
  merged.priceOptions.sort((a, b) => (a.quantity || 1) - (b.quantity || 1));
  
  return merged;
}

/**
 * 번호가 매겨진 상품들을 추출합니다
 * @param {string} content - 게시물 내용
 * @param {Array} products - 기존 상품 배열
 * @returns {Array} 번호가 매겨진 상품 배열
 */
export function extractNumberedProducts(content, products) {
  if (!content || !products || products.length === 0) return products;
  
  const numberedProducts = [];
  const lines = content.split('\n');
  
  // 번호 패턴 찾기 (1., 1), ①, ❶ 등)
  const numberPatterns = [
    /^(\d+)[.)\s]/,
    /^[①-⑳]/,
    /^[❶-❿]/,
    /^[(]\d+[)]/,
  ];
  
  let currentNumber = 0;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    for (const pattern of numberPatterns) {
      if (pattern.test(trimmedLine)) {
        currentNumber++;
        
        // 해당 번호에 맞는 상품 찾기
        const product = products.find(
          (p) => p.itemNumber === currentNumber
        );
        
        if (product) {
          numberedProducts.push({
            ...product,
            itemNumber: currentNumber,
          });
        }
        
        break;
      }
    }
  }
  
  return numberedProducts.length > 0 ? numberedProducts : products;
}

/**
 * 상품 정보를 DB 저장용 포맷으로 변환합니다
 * @param {Object} product - 상품 정보
 * @param {string} postId - 게시물 ID
 * @param {string} bandNumber - 밴드 번호
 * @param {string} userId - 사용자 ID
 * @returns {Object} DB 저장용 상품 데이터
 */
export function formatProductForDB(product, postId, bandNumber, userId) {
  // product_id 형식: prod_bandNumber_postKey_item숫자
  const productId = `prod_${bandNumber}_${postId}_item${product.itemNumber || 1}`;
  
  // pickup_date가 객체인 경우 date 필드 추출
  let pickupDateValue = product.pickupDate;
  if (pickupDateValue && typeof pickupDateValue === 'object' && pickupDateValue.date) {
    pickupDateValue = pickupDateValue.date;
  }
  
  return {
    product_id: productId,
    user_id: userId,  // user_id 추가
    post_id: postId,
    band_number: bandNumber,
    item_number: product.itemNumber || 1,
    title: product.title,
    base_price: product.basePrice || 0,
    price_options: product.priceOptions || [],
    quantity: product.quantity || 1,
    quantity_text: product.quantityText || "1개",
    category: product.category || "미분류",
    status: product.status || "판매중",
    tags: product.tags || [],
    features: product.features || [],
    pickup_info: product.pickupInfo || "",
    pickup_date: pickupDateValue,
    pickup_type: product.pickupType || "수령",
    stock_quantity: product.stockQuantity,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
