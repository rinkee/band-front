import axios from "axios";

// API 기본 URL 설정
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";

// 환경 변수 가져오기 (여기서 직접 가져오거나, 함수 인자로 받을 수 있음)
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseAnonKey) {
  console.error("Fetcher: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!");
}

// Supabase Function 용 Fetcher 함수
export const supabaseFunctionFetcher = async (url) => {
  const headers = {
    apikey: supabaseAnonKey || "", // 키가 없으면 빈 문자열 전달 (오류 발생 가능성 있음)
    "Content-Type": "application/json",
    // 필요 시 다른 기본 헤더 추가
  };

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: `HTTP error! status: ${response.status}` };
      }
      const error = new Error(
        errorData?.message || `HTTP error ${response.status}`
      );
      error.info = errorData;
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    if (data && data.success !== undefined) {
      // success 필드 존재 여부 확인
      return data; // 성공/실패 여부 포함한 전체 객체 반환
    } else {
      // 응답 형식이 예상과 다를 경우
      console.warn("API response format might be incorrect:", data);
      // success 필드가 없어도 일단 데이터 반환 (호출부에서 처리) 또는 에러 throw
      return data;
      // 또는 throw new Error("API 응답 형식 오류");
    }
  } catch (error) {
    // 네트워크 오류 등 fetch 자체의 오류 또는 위에서 throw된 오류
    console.error("Fetcher error:", error);
    throw error; // SWR이 받을 수 있도록 다시 throw
  }
};

// 개발 모드에서만 로깅하는 함수
const devLog = (...args) => {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEBUG_API === "true"
  ) {
    console.log(...args);
  }
};

/**
 * SWR에서 사용할 기본 fetcher 함수 (axios 사용)
 * @param {string} url - 요청 URL
 * @returns {Promise} 응답 데이터
 */
export const fetcher = async (url) => {
  try {
    const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
    console.log("API 기본 URL 설정:", process.env.NEXT_PUBLIC_API_URL);
    devLog("Fetcher 요청 URL:", fullUrl);

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
  // --- 수정된 부분 ---
  let token = null;
  const sessionData = sessionStorage.getItem("userData"); // sessionStorage에서 userData 읽기

  if (sessionData) {
    try {
      const userDataObj = JSON.parse(sessionData);
      token = userDataObj.token; // userData 객체 안의 token 사용
      console.log("authFetcher에서 읽은 토큰:", token); // 디버깅 로그 추가
    } catch (e) {
      console.error("authFetcher: sessionStorage에서 userData 파싱 오류:", e);
      token = null; // 파싱 실패 시 토큰 없음 처리
    }
  } else {
    console.log("authFetcher: sessionStorage에 userData 없음"); // 디버깅 로그 추가
  }
  // --- 수정 끝 ---

  try {
    const response = await axios({
      url: url.startsWith("http") ? url : `${API_BASE_URL}${url}`,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }), // 읽어온 토큰 사용
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
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 인터셉터 설정
api.interceptors.request.use(
  (config) => {
    console.log("Axios 요청 인터셉터 실행됨"); // 실행 여부 확인
    let token = null;
    const sessionData = sessionStorage.getItem("userData");
    if (sessionData) {
      const userDataObj = JSON.parse(sessionData);
      token = userDataObj.token; // <--- 읽어온 객체 안에서 token을 찾음!
      console.log("인터셉터에서 읽은 토큰:", token); // 토큰 값 확인
    }

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
      console.log("Authorization 헤더 설정됨"); // 헤더 설정 확인
    } else {
      console.log("토큰 없음, Authorization 헤더 설정 안 함");
    }
    return config;
  },
  (error) => {
    console.error("Axios 요청 인터셉터 오류:", error); // 인터셉터 자체 오류 확인
    return Promise.reject(error);
  }
);

// 응답 인터셉터 수정
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      console.error("응답 인터셉터: 401 Unauthorized 감지. 로그아웃 처리.");
      sessionStorage.removeItem("userData"); // userData 제거
      // sessionStorage.removeItem("token"); // 이 줄 제거 (불필요)
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

/**
 * SWR에서 사용할 axios 기반 fetcher
 * @param {string} url - 요청 URL (예: /auth/users/123/profile)
 * @returns {Promise} 응답 데이터
 */
export const axiosFetcher = async (url) => {
  try {
    devLog("axiosFetcher 요청 URL (api 인스턴스 사용):", url);
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    console.error(
      `API 요청 오류 (${url}):`,
      error.message,
      error.response?.status,
      error.response?.data
    );
    const customError = new Error(`API 요청 실패: ${url}`);
    customError.info = error.response?.data;
    customError.status = error.response?.status;
    throw customError;
  }
};
