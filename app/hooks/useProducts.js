import useSWR, { useSWRConfig } from "swr";
import { axiosFetcher, api } from "../lib/fetcher";

/**
 * 상품 목록을 가져오는 훅
 * @param {string} userId - 사용자 ID
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function useProducts(userId, page = 1, filters = {}, options = {}) {
  const params = new URLSearchParams({ userId, page, ...filters });

  // 기본 옵션 설정 (캐시 사용 및 중복 요청 방지)
  const defaultOptions = {
    revalidateIfStale: false, // 캐시가 오래되었더라도 자동으로 재검증하지 않음
    revalidateOnFocus: false, // 포커스를 받았을 때 재검증하지 않음
    revalidateOnReconnect: true, // 네트워크 연결 재개시에만 재검증
    dedupingInterval: 5000, // 5초 내에 같은 요청은 중복 실행하지 않음
    ...options, // 사용자 정의 옵션으로 기본 옵션 덮어쓰기 가능
  };

  return useSWR(
    userId ? `/products?${params}` : null,
    axiosFetcher,
    defaultOptions
  );
}

/**
 * 특정 상품 정보를 가져오는 훅
 * @param {string} productId - 상품 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function useProduct(productId, options = {}) {
  return useSWR(
    productId ? `/products/${productId}` : null,
    axiosFetcher,
    options
  );
}

/**
 * 상품 데이터 변경 함수들을 제공하는 훅
 * @returns {Object} 상품 데이터 변경 함수들
 */
export function useProductMutations() {
  const { mutate } = useSWRConfig();

  /**
   * 상품 추가 함수
   * @param {Object} productData - 상품 데이터
   * @returns {Promise} API 응답
   */
  const addProduct = async (productData) => {
    const response = await api.post("/products", productData);

    // 캐시 갱신
    const userId = productData.userId;
    if (userId) {
      mutate(`/products?userId=${userId}`);
    }

    return response.data;
  };

  /**
   * 상품 업데이트 함수
   * @param {string} productId - 상품 ID
   * @param {Object} productData - 변경할 상품 데이터
   * @returns {Promise} API 응답
   */
  const updateProduct = async (productId, productData) => {
    const response = await api.put(`/products/${productId}`, productData);

    // 캐시 갱신
    mutate(`/products/${productId}`);
    const userId = productData.userId;
    if (userId) {
      mutate(`/products?userId=${userId}`);
    }

    return response.data;
  };

  /**
   * 상품 삭제 함수
   * @param {string} productId - 상품 ID
   * @param {string} userId - 사용자 ID
   * @returns {Promise} API 응답
   */
  const deleteProduct = async (productId, userId) => {
    const response = await api.delete(`/products/${productId}`);

    // 캐시 갱신
    if (userId) {
      mutate(`/products?userId=${userId}`);
    }

    return response.data;
  };

  return { addProduct, updateProduct, deleteProduct };
}

export default useProducts;
