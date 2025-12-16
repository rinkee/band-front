// app/lib/ordersTestProductsCache.js
// orders-test 페이지에서 사용하는 상품 캐시(sessionStorage) 유틸

export const ORDERS_TEST_PRODUCTS_BY_POST_KEY = "ordersProductsByPostKey";
export const ORDERS_TEST_PRODUCTS_BY_BAND_POST = "ordersProductsByBandPost";

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const readOrdersTestProductsByPostKeyCache = () => {
  if (typeof window === "undefined") return {};
  try {
    const cached = sessionStorage.getItem(ORDERS_TEST_PRODUCTS_BY_POST_KEY);
    return safeParseJson(cached, {});
  } catch {
    return {};
  }
};

export const readOrdersTestProductsByBandPostCache = () => {
  if (typeof window === "undefined") return {};
  try {
    const cached = sessionStorage.getItem(ORDERS_TEST_PRODUCTS_BY_BAND_POST);
    return safeParseJson(cached, {});
  } catch {
    return {};
  }
};

export const writeOrdersTestProductsCache = ({ byPostKeyMap, byBandPostMap } = {}) => {
  if (typeof window === "undefined") return;
  try {
    if (byPostKeyMap) {
      sessionStorage.setItem(
        ORDERS_TEST_PRODUCTS_BY_POST_KEY,
        JSON.stringify(byPostKeyMap)
      );
    }
    if (byBandPostMap) {
      sessionStorage.setItem(
        ORDERS_TEST_PRODUCTS_BY_BAND_POST,
        JSON.stringify(byBandPostMap)
      );
    }
  } catch {
    // sessionStorage 용량/권한 이슈는 호출부에서 사용자 UX를 막지 않도록 무시
  }
};

export const clearOrdersTestProductsCache = () => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ORDERS_TEST_PRODUCTS_BY_POST_KEY);
    sessionStorage.removeItem(ORDERS_TEST_PRODUCTS_BY_BAND_POST);
  } catch {
    // noop
  }
};

