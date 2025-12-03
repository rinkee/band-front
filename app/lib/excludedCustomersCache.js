// lib/excludedCustomersCache.js - 제외고객 목록 공유 캐시
import supabase from "./supabaseClient";

// Promise를 캐시하여 동시 요청 시 중복 API 호출 방지
const excludedCustomersCache = new Map();
const pendingRequests = new Map();

/**
 * 제외고객 목록 조회 (전역 캐시 + 중복 요청 방지)
 */
export const fetchExcludedCustomers = async (userId) => {
  if (!userId) return [];

  // 이미 캐시된 결과가 있으면 반환
  if (excludedCustomersCache.has(userId)) {
    return excludedCustomersCache.get(userId);
  }

  // 진행 중인 요청이 있으면 그 Promise를 반환 (중복 API 호출 방지)
  if (pendingRequests.has(userId)) {
    return pendingRequests.get(userId);
  }

  // 새 요청 시작 - Promise를 먼저 저장
  const requestPromise = (async () => {
    try {
      const { data: userData, error } = await supabase
        .from("users")
        .select("excluded_customers")
        .eq("user_id", userId)
        .single();

      let names = [];
      if (!error && userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
        names = userData.excluded_customers.filter(
          (n) => typeof n === "string" && n.trim().length > 0
        );
      }

      excludedCustomersCache.set(userId, names);
      return names;
    } catch (_) {
      excludedCustomersCache.set(userId, []);
      return [];
    } finally {
      // 요청 완료 후 pending에서 제거
      pendingRequests.delete(userId);
    }
  })();

  pendingRequests.set(userId, requestPromise);
  return requestPromise;
};

/**
 * 캐시 무효화 (설정 변경 시 사용)
 */
export const invalidateExcludedCustomersCache = (userId) => {
  if (userId) {
    excludedCustomersCache.delete(userId);
  } else {
    excludedCustomersCache.clear();
  }
};

export default fetchExcludedCustomers;
