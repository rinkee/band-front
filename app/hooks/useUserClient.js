import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";

/**
 * 사용자 정보 조회 함수
 */
const fetchUser = async (key) => {
  const [, userId] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const { data, error } = await supabase
    .from("users")
    .select(
      `
      user_id, login_id, naver_id, store_name, store_address, owner_name,
      phone_number, band_url, band_number, is_active, created_at,
      last_login_at, last_crawl_at, product_count, crawl_interval,
      naver_login_status, excluded_customers, job_id, auto_barcode_generation,
      role, settings, subscription, auto_crawl, updated_at, cookies_updated_at,
      last_crawled_post_id, band_access_token, band_key, post_fetch_limit
    `
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("해당 ID의 유저를 찾을 수 없습니다.");
    }
    console.error("Supabase user query error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("해당 ID의 유저를 찾을 수 없습니다.");
  }

  return {
    success: true,
    data,
  };
};

/**
 * 클라이언트 사이드 사용자 정보 훅
 */
export function useUserClient(userId, options = {}) {
  const getKey = () => {
    if (!userId) return null;
    return ["user", userId];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30000, // 사용자 정보는 자주 변경되지 않으므로 긴 간격
    ...options,
  };

  return useSWR(getKey, fetchUser, swrOptions);
}

/**
 * 클라이언트 사이드 사용자 정보 변경 함수들
 */
export function useUserClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 사용자 프로필 업데이트
   */
  const updateUserProfile = async (userId, updateData) => {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const updateFields = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("users")
      .update(updateFields)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("User not found or access denied");
      }
      console.error("Error updating user profile:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["user", userId],
      { success: true, data },
      { revalidate: false }
    );

    return data;
  };

  /**
   * 마지막 로그인 시간 업데이트
   */
  const updateLastLogin = async (userId) => {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating last login:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["user", userId],
      { success: true, data },
      { revalidate: false }
    );

    return data;
  };

  /**
   * 제외 고객 목록 업데이트
   */
  const updateExcludedCustomers = async (userId, excludedCustomers) => {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        excluded_customers: excludedCustomers,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating excluded customers:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["user", userId],
      { success: true, data },
      { revalidate: false }
    );

    return data;
  };

  /**
   * 자동 크롤링 설정 업데이트
   */
  const updateCrawlSettings = async (userId, crawlSettings) => {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const updateFields = {
      ...crawlSettings,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("users")
      .update(updateFields)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating crawl settings:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["user", userId],
      { success: true, data },
      { revalidate: false }
    );

    return data;
  };

  return {
    updateUserProfile,
    updateLastLogin,
    updateExcludedCustomers,
    updateCrawlSettings,
  };
}

export default useUserClient;
