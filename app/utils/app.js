/**
 * API 통신을 위한 유틸리티 함수
 */

// API 기본 URL
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * 크롤링 시작 API 호출
 * @param {string} naverId - 네이버 아이디
 * @param {string} naverPassword - 네이버 비밀번호
 * @param {string} bandId - 밴드 ID
 * @returns {Promise<Object>} - API 응답
 */
export const startCrawling = async (naverId, naverPassword, bandId) => {
  try {
    const response = await fetch(`${API_URL}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        naverId,
        naverPassword,
        bandId,
      }),
    });

    return await response.json();
  } catch (error) {
    console.error("크롤링 시작 API 오류:", error);
    throw error;
  }
};

/**
 * 크롤링 상태 확인 API 호출
 * @param {string} taskId - 작업 ID
 * @returns {Promise<Object>} - API 응답
 */
export const checkCrawlingStatus = async (taskId) => {
  try {
    const response = await fetch(`${API_URL}/status/${taskId}`);
    return await response.json();
  } catch (error) {
    console.error("크롤링 상태 확인 API 오류:", error);
    throw error;
  }
};

/**
 * 밴드 게시물 조회 API 호출
 * @param {string} bandId - 밴드 ID
 * @param {number} page - 페이지 번호 (기본값: 1)
 * @param {number} limit - 페이지당 항목 수 (기본값: 20)
 * @returns {Promise<Object>} - API 응답
 */
export const fetchBandPosts = async (bandId, page = 1, limit = 20) => {
  try {
    // 올바른 경로 사용
    const response = await fetch(
      `${API_URL}/posts/${bandId}?page=${page}&limit=${limit}`
    );
    return await response.json();
  } catch (error) {
    console.error("게시물 조회 API 오류:", error);
    throw error;
  }
};

/**
 * 게시물 댓글 조회 API 호출
 * @param {string} postId - 게시물 ID
 * @returns {Promise<Object>} - API 응답
 */
export const fetchPostComments = async (postId) => {
  try {
    const response = await fetch(`${API_URL}/posts/${postId}/comments`);
    return await response.json();
  } catch (error) {
    console.error("댓글 조회 API 오류:", error);
    throw error;
  }
};

/**
 * 게시물 댓글 크롤링 API 호출
 * @param {string} postId - 게시물 ID
 * @param {string} naverId - 네이버 아이디
 * @param {string} naverPassword - 네이버 비밀번호
 * @param {string} bandId - 밴드 ID
 * @returns {Promise<Object>} - API 응답
 */
export const crawlPostComments = async (
  postId,
  naverId,
  naverPassword,
  bandId
) => {
  try {
    const response = await fetch(`${API_URL}/posts/${postId}/crawl-comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        naverId,
        naverPassword,
        bandId,
      }),
    });

    return await response.json();
  } catch (error) {
    console.error("댓글 크롤링 API 오류:", error);
    throw error;
  }
};
