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
 * 주문 통계 데이터를 가져오는 커스텀 훅
 * @param {string | null | undefined} userId - 사용자 ID
 * @param {object} filterOptions - 필터 옵션 객체
 * @param {string} [filterOptions.dateRange='7days'] - 날짜 범위 (today, 7days, 30days, custom 등)
 * @param {string | undefined} [filterOptions.startDate] - 사용자 지정 시작일 (ISO 문자열)
 * @param {string | undefined} [filterOptions.endDate] - 사용자 지정 종료일 (ISO 문자열)
 * @param {string | undefined} [filterOptions.status] - 주 상태 필터
 * @param {string | undefined} [filterOptions.subStatus] - 부가 상태 필터
 * @param {string | undefined} [filterOptions.search] - 검색어
 * @param {object} swrOptions - SWR 옵션
 * @returns {object} SWR 훅의 반환값 { data, error, isLoading, mutate }
 */
export function useOrderStats(userId, filterOptions = {}, swrOptions = {}) {
  const {
    dateRange = "7days",
    startDate,
    endDate,
    status,
    subStatus,
    search,
  } = filterOptions;

  // 1. SWR 키 생성 로직 (조건부로 null 반환)
  const getKey = () => {
    if (!userId) {
      return null; // userId 없으면 요청 안 함
    }

    const params = new URLSearchParams();
    params.append("userId", userId);
    params.append("dateRange", dateRange);
    if (dateRange === "custom" && startDate && endDate) {
      params.append("startDate", startDate);
      params.append("endDate", endDate);
    }
    if (status) {
      params.append("status", status);
    }
    if (subStatus) {
      params.append("sub_status", subStatus);
    }
    if (search) {
      params.append("search", search);
    }

    return `/orders/stats?${params.toString()}`; // 최종 엔드포인트
  };

  // 2. useSWR 훅은 항상 최상위 레벨에서 호출
  const swrResult = useSWR(
    getKey, // 키 생성 함수 전달 (userId 없으면 null 반환)
    axiosFetcher,
    swrOptions
  );

  // 3. 결과 반환
  return swrResult;
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
