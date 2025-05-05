// hooks/useOrders.js (또는 유사한 파일)
import useSWR, { useSWRConfig } from "swr";
// import { axiosFetcher, api } from "../lib/fetcher"; // 기존 fetcher 제거 또는 수정 필요
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트 (URL, Key 가져오기 위해 필요)
import { supabaseFunctionFetcher } from "../lib/fetcher";

// 환경 변수에서 Supabase 정보 가져오기
const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 주문 목록을 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} userId - 사용자 ID (JWT 제거 시 필수)
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션 (status, subStatus, search, startDate, endDate 등)
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Order[], pagination: {...} }, error, isLoading, mutate }
 */
export function useOrders(userId, page = 1, filters = {}, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    // === JWT 제거 시 userId 필수 ===
    if (!userId) {
      console.warn("useOrders: userId is required when not using JWT auth.");
      return null; // userId 없으면 요청 안 함
    }
    // ============================

    // URLSearchParams를 사용하여 쿼리 파라미터 생성
    const params = new URLSearchParams();
    params.append("userId", userId); // <<<--- userId 쿼리 파라미터 추가
    params.append("page", page.toString());

    // filters 객체의 키-값을 파라미터로 추가 (값이 있는 경우만)
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        // status, subStatus 처럼 배열로 올 수 있는 경우 쉼표로 join
        if (Array.isArray(value)) {
          if (value.length > 0) params.append(key, value.join(","));
        } else {
          params.append(key, value.toString());
        }
      }
    });

    // 최종 함수 URL 생성
    return `${functionsBaseUrl}/orders-get-all?${params.toString()}`;
  };

  // useSWR 훅 호출 (수정된 fetcher 사용)
  return useSWR(getKey, supabaseFunctionFetcher, options);
}

/**
 * 특정 주문 상세 정보를 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} orderId - 주문 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Order }, error, isLoading, mutate }
 */
export function useOrder(orderId, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!orderId) return null; // orderId 없으면 요청 안 함
    return `${functionsBaseUrl}/orders-get-by-id?orderId=${orderId}`;
  };

  // useSWR 훅 호출 (수정된 fetcher 사용)
  return useSWR(getKey, supabaseFunctionFetcher, options);
}

/**
 * 주문 통계 데이터를 가져오는 커스텀 훅 (Supabase Function 용)
 * !!! 중요: '/orders/stats' Edge Function이 별도로 구현되어 있어야 함 !!!
 * (이 예제에서는 stats 함수 구현은 제외되었으므로, 필요시 추가 구현 필요)
 * @param {string | null | undefined} userId - 사용자 ID (JWT 제거 시 필수)
 * @param {object} filterOptions - 필터 옵션 객체
 * @param {object} swrOptions - SWR 옵션
 * @returns {object} SWR 훅의 반환값 { data: { data: StatsData }, error, isLoading, mutate }
 */
export function useOrderStats(userId, filterOptions = {}, swrOptions = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!userId) {
      console.warn(
        "useOrderStats: userId is required when not using JWT auth."
      );
      return null;
    }

    const params = new URLSearchParams();
    params.append("userId", userId);

    // filterOptions 객체의 키-값을 파라미터로 추가
    Object.entries(filterOptions).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });

    // 실제 stats 함수 경로로 변경 필요 (예: 'orders-stats')
    return `${functionsBaseUrl}/orders-stats?${params.toString()}`;
  };

  // useSWR 훅 호출
  return useSWR(getKey, supabaseFunctionFetcher, swrOptions);
}

/**
 * 주문 데이터 변경 함수들을 제공하는 훅 (Supabase Function 용)
 * @returns {Object} 주문 데이터 변경 함수들
 */
export function useOrderMutations() {
  const { mutate } = useSWRConfig(); // SWR 캐시 관리를 위한 mutate 함수

  /**
   * 주문 상태 업데이트 함수 (Supabase Function 호출)
   * @param {string} orderId - 주문 ID
   * @param {object} updateData - 업데이트할 데이터 { status, subStatus?, shippingInfo?, cancelReason? }
   * @param {string} userId - 현재 사용자 ID (캐시 무효화 위해 필요)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updateOrderStatus = async (orderId, updateData = {}, userId) => {
    if (!orderId || !updateData.status) {
      throw new Error("Order ID와 status는 필수입니다.");
    }

    const url = `${functionsBaseUrl}/orders-update-status?orderId=${orderId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      // JWT 인증 불필요
    };

    try {
      const response = await fetch(url, {
        method: "PATCH", // 부분 업데이트이므로 PATCH가 더 적절할 수 있음
        headers: headers,
        body: JSON.stringify(updateData), // 업데이트할 데이터만 포함
      });

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(
          result?.message || `HTTP error ${response.status}`
        );
        error.info = result;
        throw error;
      }

      if (result.success) {
        console.log(`Order ${orderId} status updated via function.`);
        // --- SWR 캐시 갱신 (Mutate) ---
        // 1. 업데이트된 단일 주문 캐시 갱신
        mutate(`${functionsBaseUrl}/orders-get-by-id?orderId=${orderId}`); // 단일 주문 키

        // 2. 관련된 주문 목록 캐시 갱신 (어떤 필터가 적용되었는지 모르므로, userId 기반 키를 무효화)
        // useSWR 키 생성 로직과 일치해야 함
        // 예: 페이지 1, 기본 필터에 대한 목록 캐시를 갱신하거나, 모든 관련 목록 키를 찾아 무효화
        // 가장 간단한 방법은 userId를 포함하는 모든 목록 키를 재검증하게 하는 것
        // 주의: mutate 범위가 너무 넓으면 불필요한 요청이 발생할 수 있음
        if (userId) {
          mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/orders-get-all?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          );
          // 주문 통계 캐시도 갱신
          mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/orders-stats?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          );
        }
        // -----------------------------
        return result.data; // 업데이트된 주문 데이터 반환
      } else {
        throw new Error(result?.message || "주문 상태 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating order ${orderId} status:`, error);
      throw error; // 에러를 다시 던져 호출한 곳에서 처리하도록 함
    }
  };

  /**
   * 주문 상세 정보 업데이트 함수 (Supabase Function 호출)
   * @param {string} orderId - 주문 ID
   * @param {object} updateDetails - 업데이트할 상세 정보 { order_quantity?, order_price?, total_amount?, ... }
   * @param {string} userId - 현재 사용자 ID (캐시 무효화 위해 필요)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updateOrderDetails = async (orderId, updateDetails = {}, userId) => {
    if (!orderId || Object.keys(updateDetails).length === 0) {
      throw new Error("Order ID와 업데이트할 정보가 필요합니다.");
    }

    const url = `${functionsBaseUrl}/orders-update-details?orderId=${orderId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PATCH", // 부분 업데이트이므로 PATCH 사용
        headers: headers,
        body: JSON.stringify(updateDetails),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(
          result?.message || `HTTP error ${response.status}`
        );
        error.info = result;
        throw error;
      }

      if (result.success) {
        console.log(`Order ${orderId} details updated via function.`);
        // --- SWR 캐시 갱신 ---
        mutate(`${functionsBaseUrl}/orders-get-by-id?orderId=${orderId}`); // 단일 주문
        if (userId) {
          mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/orders-get-all?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          ); // 목록
          mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/orders-stats?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          ); // 통계
        }
        // --------------------
        return result.data;
      } else {
        throw new Error(result?.message || "주문 상세 정보 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating order ${orderId} details:`, error);
      throw error;
    }
  };

  // cancelOrder 함수는 별도 Edge Function 필요 (예: orders-cancel)
  // 아래는 예시 (실제 함수 구현 필요)
  /**
   * 주문 취소 함수 (Supabase Function 호출 - 별도 구현 필요)
   * @param {string} orderId - 주문 ID
   * @param {string} reason - 취소 사유
   * @param {string} userId - 사용자 ID
   * @returns {Promise} API 응답
   */
  const cancelOrder = async (orderId, reason = "", userId) => {
    console.warn("cancelOrder Edge Function is not implemented yet.");
    // 실제 구현 시:
    // const url = `${functionsBaseUrl}/orders-cancel?orderId=${orderId}`;
    // const response = await fetch(url, { method: 'POST', headers: {...}, body: JSON.stringify({ reason }) });
    // ... 처리 ...
    // mutate(...)
    return Promise.reject("Cancel order function not implemented."); // 임시
  };

  // 필요한 뮤테이션 함수들을 반환
  return { updateOrderStatus, updateOrderDetails, cancelOrder };
}

// 기본 export는 useOrders 유지 (필요에 따라 변경)
export default useOrders;
