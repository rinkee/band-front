import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_AI_PRODUCTS_NON_PRODUCT_REASON,
  isEmptyAiProductExtraction,
  markEmptyAiProductExtraction,
  shouldPersistProductsData,
  resolveCommentSyncStatusForAiOutcome
} from "../app/lib/updateButton/fuc/productProcessing/aiExtractionOutcome.js";

test("empty AI product extraction is treated as a non-product signal", () => {
  const products = markEmptyAiProductExtraction([]);
  assert.equal(isEmptyAiProductExtraction(products), true);
  assert.equal(EMPTY_AI_PRODUCTS_NON_PRODUCT_REASON, "AI가 상품 없음으로 응답");
});

test("plain empty arrays from non-AI fallback paths are not treated as non-product", () => {
  assert.equal(isEmptyAiProductExtraction([]), false);
});

test("non-product AI outcome does not persist product data or leave comments pending", () => {
  assert.equal(shouldPersistProductsData("not_product"), false);
  assert.equal(
    resolveCommentSyncStatusForAiOutcome({
      aiExtractionStatus: "not_product",
      commentCount: 3
    }),
    "completed"
  );
});

test("failed AI outcome still blocks comment processing", () => {
  assert.equal(
    resolveCommentSyncStatusForAiOutcome({
      aiExtractionStatus: "failed",
      commentCount: 3
    }),
    "failed"
  );
});
