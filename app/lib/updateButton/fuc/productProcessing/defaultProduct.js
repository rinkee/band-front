/**
 * 기본 상품 정보 생성 모듈
 * AI 분석이 필요하거나 정보가 없는 경우 기본 상품 정보를 반환합니다.
 */

/**
 * 기본 상품 정보를 반환하는 함수
 *
 * @param {string} reason - 기본 상품을 반환하는 이유 (예: "정보 없음", "AI 분석 필요")
 * @returns {Object} 기본 상품 정보를 포함한 객체
 * @returns {boolean} multipleProducts - 다중 상품 여부 (항상 false)
 * @returns {Array} products - 기본 상품 배열 (1개 요소)
 */
export function getDefaultProduct(reason = "정보 없음") {
  const defaultDate = new Date().toISOString();
  const defaultProdData = {
    title: `[AI 분석 필요] ${reason}`,
    basePrice: 0,
    priceOptions: [
      {
        quantity: 1,
        price: 0,
        description: "정보 없음"
      }
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
    itemNumber: 1
  };

  return {
    multipleProducts: false,
    products: [defaultProdData]
  };
}
