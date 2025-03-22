import axios from "axios";

// API 기본 URL 설정
const API_BASE_URL = "http://localhost:8000/api";

console.log("API 기본 URL 설정:", API_BASE_URL);

/**
 * SWR에서 사용할 기본 fetcher 함수 (axios 사용)
 * @param {string} url - 요청 URL
 * @returns {Promise} 응답 데이터
 */
export const fetcher = async (url) => {
  try {
    const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
    console.log("Fetcher 요청 URL:", fullUrl);

    const response = await axios.get(fullUrl);
    return response.data;
  } catch (error) {
    console.error("API 요청 오류:", error.message, error.response?.status);
    const customError = new Error("API 요청 실패");
    customError.info = error.response?.data;
    customError.status = error.response?.status;
    throw customError;
  }
};

/**
 * 인증이 필요한 API 요청에 사용할 fetcher (axios 사용)
 * @param {string} url - 요청 URL
 * @param {Object} options - axios 옵션
 * @returns {Promise} 응답 데이터
 */
export const authFetcher = async (url, options = {}) => {
  // 로컬 스토리지에서 토큰 가져오기
  const token = localStorage.getItem("token");

  try {
    const response = await axios({
      url: url.startsWith("http") ? url : `${API_BASE_URL}${url}`,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers || {}),
      },
      data: options.data,
      ...options,
    });

    return response.data;
  } catch (error) {
    // 인증 관련 에러 처리
    if (error.response?.status === 401) {
      // 토큰 만료 등의 이유로 인증이 실패한 경우
      localStorage.removeItem("token");
      // 로그인 페이지로 리다이렉트
      window.location.href = "/login";
    }

    const customError = new Error("API 요청 실패");
    customError.info = error.response?.data;
    customError.status = error.response?.status;
    throw customError;
  }
};

/**
 * axios 인스턴스 생성 (추가 설정 가능)
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 인터셉터 설정
api.interceptors.request.use(
  (config) => {
    // 요청 전 처리 (토큰 설정 등)
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터 설정
api.interceptors.response.use(
  (response) => {
    // 응답 데이터 가공
    return response;
  },
  (error) => {
    // 오류 응답 처리
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

/**
 * SWR에서 사용할 axios 기반 fetcher
 * @param {string} url - 요청 URL
 * @returns {Promise} 응답 데이터
 */
export const axiosFetcher = async (url) => {
  try {
    // URL 경로 처리 개선
    // 1. '/api/' 접두사 제거 (이미 API_BASE_URL에 포함되어 있음)
    const apiPattern = /^\/api\//;
    let cleanUrl = url.replace(apiPattern, "/");

    // 2. 단수형 대신 복수형 유지 - 백엔드가 복수형 API 경로를 사용함
    // 이전 단수형 변환 코드 제거하고 복수형 유지

    // URL이 슬래시로 시작하지 않으면 추가
    const fullUrl = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`;
    console.log("axios Fetcher 요청:", API_BASE_URL + fullUrl);

    const response = await api.get(fullUrl);
    return response.data;
  } catch (error) {
    console.error("API 요청 오류:", error.message, error.response?.status, url);
    const customError = new Error("API 요청 실패");
    customError.info = error.response?.data;
    customError.status = error.response?.status;
    throw customError;
  }
};
