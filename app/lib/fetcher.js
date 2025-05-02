import axios from "axios";

// API 기본 URL 설정
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";

// 개발 모드에서만 로깅하는 함수
const devLog = (...args) => {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEBUG_API === "true"
  ) {
    console.log(...args);
  }
};

// Axios 인스턴스 생성 및 설정
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 타임아웃 추가 (기존 코드 참고)
  headers: {
    'Content-Type': 'application/json', // 기본 헤더 추가 (기존 코드 참고)
  },
});

// --- 요청 인터셉터 (기존 로직 통합) ---
api.interceptors.request.use(
  (config) => {
    devLog("Axios 요청 인터셉터 실행됨 (fetcher.js)");
    let token = null;
    const sessionData = sessionStorage.getItem("userData");
    if (sessionData) {
      try {
        const userDataObj = JSON.parse(sessionData);
        token = userDataObj?.token;
        devLog("인터셉터에서 읽은 토큰:", token);
      } catch (e) {
        console.error("세션 데이터 파싱 오류 in interceptor:", e);
      }
    }

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
      devLog("Authorization 헤더 설정됨");
    } else {
      devLog("토큰 없음, Authorization 헤더 설정 안 함");
    }
    return config;
  },
  (error) => {
    console.error("Axios 요청 인터셉터 오류:", error);
    return Promise.reject(error);
  }
);

// --- 응답 인터셉터 (기존 로직 통합) ---
api.interceptors.response.use(
  (response) => {
    return response; // 성공 응답은 그대로 반환
  },
  (error) => {
    if (error.response?.status === 401) {
      console.error("응답 인터셉터: 401 Unauthorized 감지. 로그아웃 처리.");
      sessionStorage.removeItem("userData");
      window.location.href = "/login";
    }
    return Promise.reject(error); // 다른 오류는 계속 reject
  }
);
// ------------------------------------

/**
 * SWR에서 사용할 기본 fetcher 함수 (생성된 api 인스턴스 사용)
 * @param {string} url - 요청 URL (baseURL 제외 상대 경로)
 * @returns {Promise} 응답 데이터
 */
export const fetcher = async (url) => {
  try {
    // api 인스턴스를 사용하여 요청
    devLog("SWR Fetcher 요청 URL:", url); // 상대 경로 확인
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    devLog("SWR Fetcher 에러:", error);
    // 에러 객체 구조에 따라 메시지 추출 방식 조정 필요
    const message =
      error.response?.data?.message || error.message || "SWR Fetcher 오류";
    const errorToThrow = new Error(message);
    errorToThrow.status = error.response?.status; // 상태 코드 추가
    errorToThrow.info = error.response?.data; // 추가 정보 포함
    // Note: 인터셉터에서 401은 처리되지만, 다른 컴포넌트에서 fetcher 직접 사용 시 대비
    if (error.response?.status === 401 && typeof window !== 'undefined') {
       sessionStorage.removeItem("userData");
       window.location.href = "/login";
    }
    throw errorToThrow;
  }
};


/**
 * SWR에서 사용할 axios 기반 fetcher (이제 fetcher 함수와 동일 역할, 제거 가능성 있음)
 * @param {string} url - 요청 URL (예: /auth/users/123/profile)
 * @returns {Promise} 응답 데이터
 */
export const axiosFetcher = async (url) => {
  try {
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    const customError = new Error("API 요청 실패 (axiosFetcher)");
    customError.info = error.response?.data;
    customError.status = error.response?.status;
    // Note: 인터셉터에서 401은 처리되지만, 다른 컴포넌트에서 fetcher 직접 사용 시 대비
    if (error.response?.status === 401 && typeof window !== 'undefined') {
       sessionStorage.removeItem("userData");
       window.location.href = "/login";
    }
    throw customError;
  }
};

// 설정된 Axios 인스턴스를 export
export { api };
