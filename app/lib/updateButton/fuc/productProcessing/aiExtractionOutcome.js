export const EMPTY_AI_PRODUCTS_NON_PRODUCT_REASON = "AI가 상품 없음으로 응답";
export const AI_EMPTY_PRODUCTS_REASON_CODE = "ai_empty_products";

const EMPTY_PRODUCTS_REASON_PROPERTY = "__emptyProductsReason";

export function markEmptyAiProductExtraction(extractedProducts) {
  if (!Array.isArray(extractedProducts) || extractedProducts.length !== 0) {
    return extractedProducts;
  }

  Object.defineProperty(extractedProducts, EMPTY_PRODUCTS_REASON_PROPERTY, {
    value: AI_EMPTY_PRODUCTS_REASON_CODE,
    enumerable: false,
    configurable: false
  });

  return extractedProducts;
}

export function isEmptyAiProductExtraction(extractedProducts) {
  return (
    Array.isArray(extractedProducts) &&
    extractedProducts.length === 0 &&
    extractedProducts[EMPTY_PRODUCTS_REASON_PROPERTY] === AI_EMPTY_PRODUCTS_REASON_CODE
  );
}

export function shouldPersistProductsData(aiExtractionStatus) {
  return aiExtractionStatus !== "not_product";
}

export function resolveCommentSyncStatusForAiOutcome({
  aiExtractionStatus,
  commentCount
}) {
  if (aiExtractionStatus === "error" || aiExtractionStatus === "failed") {
    return "failed";
  }

  if (aiExtractionStatus === "not_product") {
    return "completed";
  }

  return !commentCount || commentCount === 0 ? "completed" : "pending";
}
