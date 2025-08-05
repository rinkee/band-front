// hooks/useUser.js (또는 유사한 파일)
import useSWR, { useSWRConfig } from "swr";
// import { axiosFetcher, api } from "../lib/fetcher"; // 제거
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트
import { supabaseFunctionFetcher } from "../lib/fetcher";

// 환경 변수
const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 사용자 정보를 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} userId - 사용자 ID (JWT 제거 시 필수)
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: UserData }, error, isLoading, mutate }
 */
export function useUser(userId, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!userId) {
      // userId가 없으면 조용히 null 반환 (경고 제거)
      return null;
    }
    // Edge Function 경로 및 쿼리 파라미터 사용
    return `${functionsBaseUrl}/users-get-data?userId=${userId}`;
  };

  // useSWR 훅 호출
  const { data, error, isLoading, mutate } = useSWR(
    getKey,
    supabaseFunctionFetcher, // 공통 fetcher 사용
    options
  );

  // 반환 형식 유지 (data는 이제 { success, data } 형태)
  return {
    data: data, // 전체 응답 객체 반환 (컴포넌트에서 data.data 접근 필요)
    isLoading,
    isError: error, // SWR에서는 error 객체 자체가 isError 상태를 나타냄
    mutate,
  };
}

/**
 * 사용자 정보 업데이트 함수를 제공하는 훅 (Supabase Function 용)
 * @returns {Object} 사용자 정보 변경 함수들
 */
export function useUserMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 사용자 프로필 업데이트 함수 (Supabase Function 호출)
   * @param {string} userId - 업데이트할 사용자 ID (경로/쿼리 파라미터용)
   * @param {Object} profileData - 변경할 프로필 데이터
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updateUserProfile = async (userId, profileData) => {
    if (!userId || !profileData || Object.keys(profileData).length === 0) {
      throw new Error("User ID와 업데이트할 프로필 데이터가 필요합니다.");
    }

    // Edge Function 경로 및 쿼리 파라미터 사용
    const url = `${functionsBaseUrl}/users-update-profile?userId=${userId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      // JWT 인증 제거
    };

    try {
      const response = await fetch(url, {
        method: "PATCH", // 부분 업데이트이므로 PATCH 권장
        headers: headers,
        body: JSON.stringify(profileData),
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
        console.log(`User ${userId} profile updated via function.`);
        // --- SWR 캐시 갱신 ---
        // 업데이트된 사용자 정보 캐시 갱신
        const userSWRKey = `${functionsBaseUrl}/users-get-data?userId=${userId}`;
        globalMutate(userSWRKey); // 해당 키 재검증
        // --------------------
        return result.data; // 업데이트된 사용자 데이터 반환
      } else {
        throw new Error(result?.message || "프로필 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating user ${userId} profile:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 비밀번호 변경 함수 (Supabase Function 호출 - 보안 위험 높음!) ⚠️
   * @param {string} userId - 변경할 사용자 ID
   * @param {string} currentPassword - 현재 비밀번호
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise<object>} API 응답 객체 (성공 여부 등 포함)
   * @throws {Error} API 호출 실패 시
   */
  const changePassword = async (userId, currentPassword, newPassword) => {
    console.warn(
      "비밀번호 변경 API는 보안상 매우 민감합니다. JWT 인증 없이 사용하는 것은 극히 위험합니다."
    );
    if (!userId || !currentPassword || !newPassword) {
      throw new Error(
        "사용자 ID, 현재 비밀번호, 새 비밀번호가 모두 필요합니다."
      );
    }

    // Edge Function 경로 및 쿼리 파라미터 사용 (함수 이름 확인 필요: 예: auth-update-password)
    const url = `${functionsBaseUrl}/auth-update-password?userId=${userId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PUT", // 또는 POST
        headers: headers,
        body: JSON.stringify({ currentPassword, newPassword }),
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
        console.log(`Password changed successfully for user ${userId}.`);
        // 비밀번호 변경 성공 시 특별한 캐시 갱신은 필요 없을 수 있음 (데이터 변경 없음)
        return result; // 성공 응답 객체 반환
      } else {
        throw new Error(result?.message || "비밀번호 변경 실패");
      }
    } catch (error) {
      console.error(`Error changing password for user ${userId}:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 네이버 계정 설정 함수 (Supabase Function 호출 - 보안 위험 높음!) ⚠️
   * @param {string} userId - 설정할 사용자 ID
   * @param {string} naverId - 네이버 아이디
   * @param {string} naverPassword - 네이버 비밀번호
   * @returns {Promise<object>} API 응답 객체
   * @throws {Error} API 호출 실패 시
   */
  const setNaverAccount = async (userId, naverId, naverPassword) => {
    console.warn(
      "네이버 계정 설정 API는 보안상 매우 민감합니다. JWT 인증 없이 사용하는 것은 극히 위험합니다."
    );
    if (!userId || !naverId || !naverPassword) {
      throw new Error(
        "사용자 ID, 네이버 ID, 네이버 비밀번호가 모두 필요합니다."
      );
    }

    // Edge Function 경로 및 쿼리 파라미터 사용 (함수 이름 확인 필요: 예: users-update-naver)
    const url = `${functionsBaseUrl}/users-update-naver?userId=${userId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PUT", // 또는 POST
        headers: headers,
        body: JSON.stringify({ naverId, naverPassword }),
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
        console.log(`Naver account set successfully for user ${userId}.`);
        // 관련 사용자 정보 캐시 갱신
        const userSWRKey = `${functionsBaseUrl}/users-get-data?userId=${userId}`;
        globalMutate(userSWRKey);
        return result; // 성공 응답 객체 반환
      } else {
        throw new Error(result?.message || "네이버 계정 설정 실패");
      }
    } catch (error) {
      console.error(`Error setting Naver account for user ${userId}:`, error);
      throw error;
    }
  };

  // 반환하는 함수 목록
  return {
    updateUserProfile,
    changePassword, // ⚠️ 사용 시 보안 극히 주의 ⚠️
    setNaverAccount, // ⚠️ 사용 시 보안 극히 주의 ⚠️
  };
}

// 기본 export
export default useUser;
