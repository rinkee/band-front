// hooks/usePosts.js (또는 유사한 파일)
import useSWR, { useSWRConfig } from "swr";
// import { axiosFetcher, api } from "../lib/fetcher"; // 제거
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트
import { supabaseFunctionFetcher } from "../lib/fetcher";

// 환경 변수
const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 게시물 목록을 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} bandNumber - 밴드 ID (필수)
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션 (status, search, startDate, endDate 등)
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Post[], pagination: {...} }, error, isLoading, mutate }
 */
export function usePosts(bandNumber, page = 1, filters = {}, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!bandNumber) {
      console.warn("usePosts: bandNumber is required.");
      return null; // bandNumber 없으면 요청 안 함
    }

    const params = new URLSearchParams();
    params.append("bandNumber", bandNumber); // <<<--- bandNumber 쿼리 파라미터 추가
    params.append("page", page.toString());

    // filters 객체의 키-값을 파라미터로 추가
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        // 배열 값 처리 (필요 시)
        if (Array.isArray(value)) {
          if (value.length > 0) params.append(key, value.join(","));
        } else {
          params.append(key, value.toString());
        }
      }
    });

    // 최종 함수 URL 생성
    return `${functionsBaseUrl}/posts-get-all?${params.toString()}`;
  };

  // useSWR 훅 호출
  return useSWR(getKey, supabaseFunctionFetcher, options);
}

/**
 * 특정 게시물 정보를 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} postId - 게시물 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Post }, error, isLoading, mutate }
 */
export function usePost(postId, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!postId) return null; // postId 없으면 요청 안 함
    return `${functionsBaseUrl}/posts-get-by-id?postId=${postId}`;
  };

  // useSWR 훅 호출
  return useSWR(getKey, supabaseFunctionFetcher, options);
}

/**
 * 게시물 데이터 변경 함수들을 제공하는 훅 (Supabase Function 용)
 * @returns {Object} 게시물 데이터 변경 함수들
 */
export function usePostMutations() {
  const { mutate: globalMutate } = useSWRConfig(); // globalMutate로 이름 변경하여 혼동 방지

  /**
   * ⚠️ 게시물 추가 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * Edge Function 'posts-create' 구현 필요
   * @param {Object} postData - 추가할 게시물 데이터 (userId, bandNumber 포함해야 함)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const addPost = async (postData) => {
    console.warn(
      "addPost: JWT 인증 없이 게시물을 추가하는 것은 보안 위험이 있습니다."
    );
    if (!postData || !postData.userId || !postData.bandNumber) {
      throw new Error("userId와 bandNumber는 필수 게시물 데이터입니다.");
    }

    // Edge Function 경로 확인 필요
    const url = `${functionsBaseUrl}/posts-create`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(postData),
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
        console.log("Post added successfully via function.");
        // --- SWR 캐시 갱신 ---
        // 관련된 게시물 목록 캐시 갱신
        globalMutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(
              `${functionsBaseUrl}/posts-get-all?bandNumber=${postData.bandNumber}`
            ),
          undefined,
          { revalidate: true }
        );
        // --------------------
        return result.data; // 생성된 게시물 데이터 반환
      } else {
        throw new Error(result?.message || "게시물 추가 실패");
      }
    } catch (error) {
      console.error("Error adding post:", error);
      throw error;
    }
  };

  /**
   * ⚠️ 게시물 업데이트 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * Edge Function 'posts-update' 구현 필요 (전체 업데이트용)
   * @param {string} postId - 업데이트할 게시물 ID
   * @param {Object} postData - 변경할 전체 게시물 데이터 (userId 포함 필요 - 권한 확인용)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updatePost = async (postId, postData) => {
    console.warn(
      "updatePost: JWT 인증 없이 게시물을 수정하는 것은 보안 위험이 있습니다."
    );
    if (!postId || !postData || !postData.userId) {
      throw new Error(
        "Post ID와 userId를 포함한 전체 게시물 데이터가 필요합니다."
      );
    }

    // Edge Function 경로 확인 필요
    const url = `${functionsBaseUrl}/posts-update?postId=${postId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PUT", // 전체 업데이트이므로 PUT 사용
        headers: headers,
        body: JSON.stringify(postData),
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
        console.log(`Post ${postId} updated successfully via function.`);
        // --- SWR 캐시 갱신 ---
        const postSWRKey = `${functionsBaseUrl}/posts-get-by-id?postId=${postId}`;
        globalMutate(postSWRKey); // 단일 게시물 갱신
        if (postData.bandNumber) {
          globalMutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/posts-get-all?bandNumber=${postData.bandNumber}`
              ),
            undefined,
            { revalidate: true }
          ); // 목록 갱신
        }
        // --------------------
        return result.data; // 업데이트된 게시물 데이터 반환
      } else {
        throw new Error(result?.message || "게시물 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating post ${postId}:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 게시물 상태 업데이트 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * @param {string} postId - 업데이트할 게시물 ID
   * @param {string} status - 변경할 상태
   * @param {string} bandNumber - 캐시 갱신용 밴드 번호 (선택적)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updatePostStatus = async (postId, status, bandNumber) => {
    console.warn(
      "updatePostStatus: JWT 인증 없이 상태를 수정하는 것은 보안 위험이 있습니다."
    );
    if (!postId || !status) {
      throw new Error("Post ID와 status가 필요합니다.");
    }

    const url = `${functionsBaseUrl}/posts-update-status?postId=${postId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PATCH", // 상태만 변경하므로 PATCH 사용
        headers: headers,
        body: JSON.stringify({ status }), // status만 포함
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
        console.log(`Post ${postId} status updated to ${status} via function.`);
        // --- SWR 캐시 갱신 ---
        const postSWRKey = `${functionsBaseUrl}/posts-get-by-id?postId=${postId}`;
        globalMutate(postSWRKey); // 단일 게시물
        if (bandNumber) {
          globalMutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/posts-get-all?bandNumber=${bandNumber}`
              ),
            undefined,
            { revalidate: true }
          ); // 목록
        }
        // --------------------
        return result.data; // 업데이트된 게시물 데이터 반환
      } else {
        throw new Error(result?.message || "게시물 상태 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating status for post ${postId}:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 게시물 삭제 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * @param {string} postId - 삭제할 게시물 ID
   * @param {string} bandNumber - 캐시 갱신용 밴드 번호 (선택적)
   * @returns {Promise<object>} API 응답 객체
   * @throws {Error} API 호출 실패 시
   */
  const deletePost = async (postId, bandNumber) => {
    console.warn(
      "deletePost: JWT 인증 없이 게시물을 삭제하는 것은 보안 위험이 있습니다."
    );
    if (!postId) {
      throw new Error("Post ID가 필요합니다.");
    }

    // Edge Function 경로 및 쿼리 파라미터 사용
    const url = `${functionsBaseUrl}/posts-delete?postId=${postId}`;
    const headers = {
      apikey: supabaseAnonKey,
      // DELETE 요청은 보통 본문(body)이 없음
    };

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: headers,
      });

      // 200 OK 또는 204 No Content 응답 확인
      if (response.status === 200 || response.status === 204) {
        console.log(`Post ${postId} deleted successfully via function.`);
        // --- SWR 캐시 갱신 ---
        // 삭제된 게시물 캐시 제거 또는 무효화
        const postSWRKey = `${functionsBaseUrl}/posts-get-by-id?postId=${postId}`;
        globalMutate(postSWRKey, undefined, { revalidate: false }); // undefined로 설정하여 캐시 제거
        // 관련된 게시물 목록 캐시 갱신
        if (bandNumber) {
          globalMutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/posts-get-all?bandNumber=${bandNumber}`
              ),
            undefined,
            { revalidate: true }
          );
        }
        // --------------------
        // 성공 시 응답 본문이 없을 수 있으므로(204), 기본 성공 객체 반환
        try {
          return await response.json(); // 본문이 있다면 파싱
        } catch (e) {
          return { success: true, message: "게시글이 삭제되었습니다." }; // 본문 없으면 기본 객체
        }
      } else {
        // 2xx 외의 상태 코드는 오류로 처리
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: `HTTP error ${response.status}` };
        }
        const error = new Error(
          errorData?.message || `HTTP error ${response.status}`
        );
        error.info = errorData;
        throw error;
      }
    } catch (error) {
      console.error(`Error deleting post ${postId}:`, error);
      throw error;
    }
  };

  // 반환하는 함수 목록
  return { addPost, updatePost, updatePostStatus, deletePost };
}

// 기본 export
export default usePosts;
