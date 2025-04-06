import useSWR, { useSWRConfig } from "swr";
import { axiosFetcher, api } from "../lib/fetcher";

/**
 * 주문 목록을 가져오는 훅
 * @param {string} userId - 사용자 ID
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function useOrders(userId, page = 1, filters = {}, options = {}) {
  const params = new URLSearchParams({ userId, page, ...filters });
  return useSWR(userId ? `/orders?${params}` : null, axiosFetcher, options);
}

/**
 * 특정 주문 상세 정보를 가져오는 훅
 * @param {string} orderId - 주문 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function useOrder(orderId, options = {}) {
  return useSWR(orderId ? `/orders/${orderId}` : null, axiosFetcher, options);
}

/**
 * 주문 통계를 가져오는 훅
 * @param {string} userId - 사용자 ID
 * @param {string} dateRange - 기간 (7days, 30days, 90days, custom)
 * @param {string} startDate - 커스텀 기간 시작일 (dateRange가 custom일 때만 사용)
 * @param {string} endDate - 커스텀 기간 종료일 (dateRange가 custom일 때만 사용)
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function useOrderStats(
  userId,
  dateRange = "7days",
  startDate = null,
  endDate = null,
  options = {}
) {
  const params = new URLSearchParams({ userId, dateRange });

  if (dateRange === "custom" && startDate && endDate) {
    params.append("startDate", startDate);
    params.append("endDate", endDate);
  }

  return useSWR(
    userId ? `/orders/stats?${params}` : null,
    axiosFetcher,
    options
  );
}

/**
 * 주문 데이터 변경 함수들을 제공하는 훅
 * @returns {Object} 주문 데이터 변경 함수들
 */
export function useOrderMutations() {
  const { mutate } = useSWRConfig();

  /**
   * 주문 상태 업데이트 함수
   * @param {string} orderId - 주문 ID
   * @param {string} status - 변경할 상태
   * @param {Object} shippingInfo - 배송 정보
   * @param {string} userId - 사용자 ID
   * @returns {Promise} API 응답
   */
  const updateOrderStatus = async (orderId, status, shippingInfo, userId) => {
    const response = await api.put(`/orders/${orderId}/status`, {
      status,
      shippingInfo,
    });

    // 캐시 갱신
    mutate(`/orders/${orderId}`);
    if (userId) {
      mutate(`/orders?userId=${userId}`);
      mutate(`/orders/stats?userId=${userId}`);
    }

    return response.data;
  };

  /**
   * 주문 취소 함수
   * @param {string} orderId - 주문 ID
   * @param {string} reason - 취소 사유
   * @param {string} userId - 사용자 ID
   * @returns {Promise} API 응답
   */
  const cancelOrder = async (orderId, reason, userId) => {
    const response = await api.post(`/orders/${orderId}/cancel`, { reason });

    // 캐시 갱신
    mutate(`/orders/${orderId}`);
    if (userId) {
      mutate(`/orders?userId=${userId}`);
      mutate(`/orders/stats?userId=${userId}`);
    }

    return response.data;
  };

  return { updateOrderStatus, cancelOrder };
}

export default useOrders;
