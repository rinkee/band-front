import useSWR, { useSWRConfig } from "swr";
import { axiosFetcher, api } from "../lib/fetcher";

/**
 * 게시물 목록을 가져오는 훅
 * @param {string} bandId - 밴드 ID
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function usePosts(bandId, page = 1, filters = {}, options = {}) {
  const params = new URLSearchParams({ bandId, page, ...filters });
  return useSWR(bandId ? `/posts?${params}` : null, axiosFetcher, options);
}

/**
 * 특정 게시물 정보를 가져오는 훅
 * @param {string} postId - 게시물 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답
 */
export function usePost(postId, options = {}) {
  return useSWR(postId ? `/posts/${postId}` : null, axiosFetcher, options);
}

/**
 * 게시물 데이터 변경 함수들을 제공하는 훅
 * @returns {Object} 게시물 데이터 변경 함수들
 */
export function usePostMutations() {
  const { mutate } = useSWRConfig();

  /**
   * 게시물 추가 함수
   * @param {Object} postData - 게시물 데이터
   * @returns {Promise} API 응답
   */
  const addPost = async (postData) => {
    const response = await api.post("/posts", postData);

    // 캐시 갱신
    const userId = postData.user_id;
    if (userId) {
      mutate(`/posts?userId=${userId}`);
    }

    return response.data;
  };

  /**
   * 게시물 업데이트 함수
   * @param {string} postId - 게시물 ID
   * @param {Object} postData - 변경할 게시물 데이터
   * @returns {Promise} API 응답
   */
  const updatePost = async (postId, postData) => {
    const response = await api.put(`/posts/${postId}`, postData);

    // 캐시 갱신
    mutate(`/posts/${postId}`);
    const userId = postData.user_id;
    if (userId) {
      mutate(`/posts?userId=${userId}`);
    }

    return response.data;
  };

  /**
   * 게시물 삭제 함수
   * @param {string} postId - 게시물 ID
   * @param {string} userId - 사용자 ID
   * @returns {Promise} API 응답
   */
  const deletePost = async (postId, userId) => {
    const response = await api.delete(`/posts/${postId}`);

    // 캐시 갱신
    if (userId) {
      mutate(`/posts?userId=${userId}`);
    }

    return response.data;
  };

  return { addPost, updatePost, deletePost };
}

export default usePosts;
