"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchParamsHandler from "./SearchParamsHandler"; // 분리된 컴포넌트 임포트
import { api } from "../lib/fetcher"; // api 인스턴스 임포트

import { createClient } from "@supabase/supabase-js";

const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- 👇 상수 정의 위치를 여기로 변경 👇 ---
const REMEMBERED_LOGIN_ID_KEY = "rememberedLoginId";
const REMEMBER_ID_CHECKBOX_KEY = "rememberIdCheckboxState";
const REMEMBER_PASSWORD_CHECKBOX_KEY = "rememberPasswordCheckboxState";
const REMEMBERED_PASSWORD_KEY = "rememberedPassword";
// --- 👆 상수 정의 위치를 여기로 변경 👆 ---

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberId, setRememberId] = useState(false); // '아이디 저장' 체크박스 상태
  const [rememberPassword, setRememberPassword] = useState(false); // '비밀번호 저장' 체크박스 상태

  useEffect(() => {
    // 0. 자동 로그인 확인 (Admin에서 접근한 경우)
    const urlParams = new URLSearchParams(window.location.search);
    const autoLoginParam = urlParams.get('autoLogin');
    
    if (autoLoginParam === 'true') {
      const autoLoginData = sessionStorage.getItem('autoLogin');
      if (autoLoginData) {
        try {
          const { loginId: autoLoginId, password: autoPassword } = JSON.parse(autoLoginData);
          setLoginId(autoLoginId);
          setLoginPassword(autoPassword);
          
          // 자동 로그인 데이터 제거
          sessionStorage.removeItem('autoLogin');
          
          // 약간 지연 후 자동 로그인 실행
          setTimeout(() => {
            const form = document.querySelector('form');
            if (form) {
              form.requestSubmit();
            }
          }, 500);
          
          return; // 자동 로그인 처리 중이므로 다른 로직 실행 안 함
        } catch (e) {
          console.error('자동 로그인 데이터 파싱 오류:', e);
          sessionStorage.removeItem('autoLogin');
        }
      }
    }

    // 1. 이미 로그인된 사용자인지 확인
    const userDataSession = sessionStorage.getItem("userData");
    if (userDataSession) {
      try {
        const parsedData = JSON.parse(userDataSession);
        if (parsedData && parsedData.token) {
          // 토큰 유무로 로그인 상태 판단
          console.log("세션에 로그인 정보 있음:", parsedData.loginId);
          router.replace("/dashboard");
          return; // 대시보드로 이동했으므로 아래 로직 실행 안 함
        }
      } catch (e) {
        console.error("세션 데이터 파싱 오류:", e);
        sessionStorage.removeItem("userData"); // 손상된 데이터 제거
      }
    }

    // 2. 저장된 아이디 및 체크박스 상태 불러오기 (로그인 안 된 경우에만 실행)
    const savedLoginId = localStorage.getItem(REMEMBERED_LOGIN_ID_KEY);
    const savedPassword = localStorage.getItem(REMEMBERED_PASSWORD_KEY);
    const savedCheckboxState =
      localStorage.getItem(REMEMBER_ID_CHECKBOX_KEY) === "true";
    const savedPasswordState =
      localStorage.getItem(REMEMBER_PASSWORD_CHECKBOX_KEY) === "true";

    if (savedLoginId) {
      setLoginId(savedLoginId);
    }
    if (savedPassword) {
      setLoginPassword(savedPassword);
    }
    setRememberId(savedCheckboxState);
    setRememberPassword(savedPasswordState);
  }, [router]);

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setError("");
  //   setSuccess("");
  //   setLoading(true);

  //   if (!loginId || !loginPassword) {
  //     setError("아이디와 비밀번호를 입력해주세요.");
  //     setLoading(false);
  //     return;
  //   }

  //   try {
  //     console.log("로그인 시도:", loginId);
  //     const response = await api.post("/auth/login", {
  //       loginId,
  //       loginPassword,
  //     });

  //     const data = response.data;
  //     console.log("로그인 응답:", data);

  //     // if (!response.ok) {
  //     //   setError(data.message || "로그인에 실패했습니다.");
  //     //   return;
  //     // }

  //     // 로그인 성공 시 사용자 정보 저장
  //     if (data.success && data.token && data.user) {
  //       const userDetails = data.user; // user 객체
  //       const token = data.token; // 최상위 token
  //       // --- !!! 여기가 핵심 수정 !!! ---
  //       // 인터셉터가 읽을 수 있도록 하나의 객체에 필요한 정보와 토큰을 모두 포함
  //       const userDataToStore = {
  //         // 필요한 사용자 정보 추가
  //         userId: userDetails.userId,
  //         loginId: userDetails.loginId,
  //         storeName: userDetails.storeName,
  //         ownerName: userDetails.ownerName, // ownerName 추가 (표시 등 활용)
  //         bandNumber: userDetails.bandNumber,
  //         naverId: userDetails.naverId,
  //         excludedCustomers: userDetails.excludedCustomers || [], // 예시

  //         // !!! 토큰을 이 객체 안에 포함 !!!
  //         token: token,
  //       };
  //       console.log("SessionStorage에 저장할 데이터:", userDataToStore);

  //       // --- !!! 여기가 핵심 수정 !!! ---
  //       // 통합된 객체를 "userData" 키로 저장
  //       sessionStorage.setItem("userData", JSON.stringify(userDataToStore));
  //       // sessionStorage.setItem("token", data.token); // <-- 이 줄은 이제 삭제 (중복 저장 불필요)
  //       // --- 핵심 수정 끝 ---
  //       // 성공 메시지 표시
  //       setSuccess(
  //         `${userDetails.storeName} ${userDetails.ownerName}님, 환영합니다!`
  //       );

  //       // 0.5초 후 대시보드로 이동
  //       setTimeout(() => {
  //         router.replace("/dashboard");
  //       }, 500);
  //     } else {
  //       setError(
  //         "로그인에 실패했습니다. 응답 데이터 형식이 올바르지 않습니다."
  //       );
  //     }
  //   } catch (err) {
  //     console.error("로그인 처리 오류:", err);
  //     setError(err.message || "로그인 중 오류가 발생했습니다.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // --- 표준 fetch API를 사용하는 로그인 함수 ---
  async function loginUserWithFetch(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    // 입력값 확인
    if (!loginId || !loginPassword) {
      setError("아이디와 비밀번호를 입력해주세요.");
      setLoading(false);
      return;
    }

    const credentials = {
      loginId,
      loginPassword,
    };
    console.log("Credentials for fetch:", credentials);

    // Edge Function 호출 전에 is_active 체크
    try {
      // 먼저 사용자 정보와 is_active 상태 확인
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("login_id, is_active, login_password")
        .eq("login_id", loginId)
        .single();

      if (userError || !userData) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // is_active 체크
      if (userData.is_active === false) {
        console.warn(`로그인 차단: 비활성화된 계정 - ${loginId}`);
        setError("비활성화된 계정입니다. 관리자에게 문의해주세요.");
        return;
      }

      // 비밀번호 체크 (선택적 - 보안을 위해 서버에서만 체크하려면 이 부분 제거)
      if (userData.login_password !== loginPassword) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // is_active가 true인 경우에만 Edge Function 호출
      const response = await fetch(`${functionsBaseUrl}/auth-login`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey, // 필수!
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials), // 요청 본문
      });

      const result = await response.json(); // 응답 본문을 JSON으로 파싱
      console.log("Login response:", result); // 전체 응답 로깅

      if (!response.ok) {
        // HTTP 상태 코드가 2xx가 아닌 경우
        console.error(
          "Login fetch error:",
          result.message || `HTTP status ${response.status}`
        );
        // 서버에서 보낸 오류 메시지를 사용하거나 기본 메시지 표시
        setError(result.message || "로그인에 실패했습니다.");
        return; // 함수 종료
      }

      // 성공 응답 처리 (HTTP 200 OK)
      console.log("Login fetch successful:", result);
      if (result.success && result.token && result.user) {
        const userDetails = result.user;
        const token = result.token;
        
        // 🎯 function_number 확인 및 로깅
        const functionNumber = userDetails.function_number ?? userDetails.functionNumber ?? 0;
        console.log(`🎯 User function_number from server: ${functionNumber}`);

        // 아이디/비밀번호 저장 처리
        if (rememberId) {
          localStorage.setItem(REMEMBERED_LOGIN_ID_KEY, loginId);
          localStorage.setItem(REMEMBER_ID_CHECKBOX_KEY, "true");
        } else {
          localStorage.removeItem(REMEMBERED_LOGIN_ID_KEY);
          localStorage.removeItem(REMEMBER_ID_CHECKBOX_KEY);
        }

        if (rememberPassword) {
          localStorage.setItem(REMEMBERED_PASSWORD_KEY, loginPassword);
          localStorage.setItem(REMEMBER_PASSWORD_CHECKBOX_KEY, "true");
        } else {
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
          localStorage.removeItem(REMEMBER_PASSWORD_CHECKBOX_KEY);
        }

        // 서버에서 받은 데이터 구조에 맞게 수정
        const userDataToStore = {
          // 기본 정보
          userId: userDetails.userId,
          loginId: userDetails.loginId,
          function_number: functionNumber, // 🎯 Edge Function 분산용 번호 추가
          post_fetch_limit: userDetails.post_fetch_limit || userDetails.postFetchLimit || 200, // 🎯 게시물 가져오기 제한 추가

          // 상점 정보 (서버에서 받은 필드명 그대로 사용하면서 camelCase도 함께 저장)
          storeName: userDetails.storeName,
          store_name: userDetails.storeName,
          storeAddress: userDetails.storeAddress,
          store_address: userDetails.storeAddress,
          ownerName: userDetails.ownerName,
          owner_name: userDetails.ownerName,
          phoneNumber: userDetails.phoneNumber,
          phone_number: userDetails.phoneNumber,

          // BAND 관련 정보
          bandUrl: userDetails.bandUrl,
          band_url: userDetails.bandUrl,
          bandNumber: userDetails.bandNumber,
          band_number: userDetails.bandNumber,
          band_access_token: userDetails.band_access_token,
          backup_band_keys: userDetails.backup_band_keys,
          band_key: userDetails.band_key,

          // 기타 정보
          naverId: userDetails.naverId,
          naver_id: userDetails.naverId,
          excludedCustomers: userDetails.excludedCustomers || [],
          excluded_customers: userDetails.excludedCustomers || [],
          isActive: userDetails.isActive,
          is_active: userDetails.isActive,
          subscription: userDetails.subscription,
          role: userDetails.role,
          createdAt: userDetails.createdAt,
          created_at: userDetails.createdAt,
          updatedAt: userDetails.updatedAt,
          updated_at: userDetails.updatedAt,

          // JWT 토큰
          token: token,
        };

        console.log("SessionStorage에 저장할 데이터:", userDataToStore);

        // 세션 스토리지에 사용자 데이터 저장
        sessionStorage.setItem("userData", JSON.stringify(userDataToStore));

        // localStorage에도 userId 저장 (다른 페이지와 일관성)
        localStorage.setItem("userId", userDetails.userId);

        setSuccess(
          `${userDetails.storeName || userDetails.store_name || "고객님"} ${
            userDetails.ownerName || userDetails.owner_name || ""
          }님, 환영합니다!`
        );

        // 대시보드로 이동
        setTimeout(() => {
          router.replace("/dashboard");
        }, 500);
      } else {
        // 성공 응답(200)이지만 백엔드 로직상 실패 처리된 경우 (예: success: false)
        console.error("Login response structure invalid:", result);
        setError(result.message || "로그인에 실패했습니다. (응답 형식 오류)");
      }
    } catch (err) {
      // 네트워크 오류 또는 JSON 파싱 오류 등
      console.error("Login fetch exception:", err);
      setError("로그인 요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }
  // --- fetch API 로그인 함수 끝 ---

  async function loginUserWithClient(e) {
    e.preventDefault();
    // === 디버깅 로그 추가 ===
    console.log("Login attempt with ID:", loginId);
    console.log("Login attempt with Password:", loginPassword); // 비밀번호 로깅은 개발 중에만!
    // credentials = { loginId, loginPassword }

    if (!loginId || !loginPassword) {
      console.error(
        "Login ID or Password is empty before creating credentials."
      );
      setError("아이디 또는 비밀번호가 입력되지 않았습니다."); // 사용자에게 피드백
      return; // 함수 종료
    }
    // =======================

    const credentials = {
      loginId,
      loginPassword,
    };

    // === 디버깅 로그 추가 ===
    console.log("Credentials object:", credentials);
    console.log("Credentials as JSON string:", JSON.stringify(credentials));
    // =======================

    try {
      const { data, error } = await supabase.functions.invoke("login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { loginId: "admin", loginPassword: "0000" },

        // 또는 body: credentials
        // body: credentials,
      });

      if (error) {
        console.error("Login error:", error.message);
        const errorMessage = data?.message || error.message;
        alert(`로그인 실패: ${errorMessage}`);
        return null; // 실패 시 null 반환
      }

      // 로그인 성공 시 사용자 정보 저장
      if (data.success && data.token && data.user) {
        const userDetails = data.user; // user 객체
        const token = data.token; // 최상위 token
        // --- !!! 여기가 핵심 수정 !!! ---
        // 인터셉터가 읽을 수 있도록 하나의 객체에 필요한 정보와 토큰을 모두 포함
        const userDataToStore = {
          // 필요한 사용자 정보 추가
          userId: userDetails.userId,
          loginId: userDetails.loginId,
          storeName: userDetails.storeName,
          ownerName: userDetails.ownerName, // ownerName 추가 (표시 등 활용)
          bandNumber: userDetails.bandNumber,
          naverId: userDetails.naverId,
          excludedCustomers: userDetails.excludedCustomers || [], // 예시
          function_number: userDetails.function_number ?? 0, // 🎯 Edge Function 분산용 번호 추가
          post_fetch_limit: userDetails.post_fetch_limit ?? 200, // 🎯 게시물 가져오기 제한 추가

          // !!! 토큰을 이 객체 안에 포함 !!!
          token: token,
        };
        console.log("SessionStorage에 저장할 데이터:", userDataToStore);

        // --- !!! 여기가 핵심 수정 !!! ---
        // 통합된 객체를 "userData" 키로 저장
        sessionStorage.setItem("userData", JSON.stringify(userDataToStore));
        // sessionStorage.setItem("token", data.token); // <-- 이 줄은 이제 삭제 (중복 저장 불필요)
        // --- 핵심 수정 끝 ---
        // 성공 메시지 표시
        setSuccess(
          `${userDetails.storeName} ${userDetails.ownerName}님, 환영합니다!`
        );

        // 0.5초 후 대시보드로 이동
        setTimeout(() => {
          router.replace("/dashboard");
        }, 500);
      } else {
        setError(
          "로그인에 실패했습니다. 응답 데이터 형식이 올바르지 않습니다."
        );
      }
    } catch (e) {
      console.error("네트워크 또는 예외 오류:", e);
      alert("로그인 요청 중 오류가 발생했습니다.");
      return null;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            PODER
          </h2>
          <h3 className="mt-2 text-center text-xl  text-gray-900">
            공동구매 관리 프로그램
          </h3>
          <p className="mt-2 text-center text-sm text-gray-600">
            또는{" "}
            <Link
              href="/register"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              회원가입하기
            </Link>
          </p>
        </div>

        {/* Suspense로 SearchParamsHandler 감싸기 */}
        <Suspense fallback={null}>
          <SearchParamsHandler setSuccess={setSuccess} setError={setError} />
        </Suspense>
        <form className="mt-8 space-y-6" onSubmit={loginUserWithFetch}>
          {success && (
            <div className="rounded-md bg-green-50 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    {success}
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="loginId" className="sr-only">
                아이디
              </label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="아이디"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="loginPassword" className="sr-only">
                비밀번호
              </label>
              <input
                id="loginPassword"
                name="loginPassword"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end">
            <div className="flex items-center justify-between">
              <div className="flex items-center mr-2">
                <input
                  id="remember-id-checkbox"
                  name="remember-id-checkbox"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  checked={rememberId}
                  onChange={(e) => setRememberId(e.target.checked)}
                />
                <label
                  htmlFor="remember-id-checkbox"
                  className="ml-2 block text-sm text-gray-900"
                >
                  아이디 저장
                </label>
              </div>
              {/* <div className="text-sm">
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot your password?
              </a>
            </div> */}
            </div>
            {/* --- 👆 아이디 저장 체크박스 UI 부분 👆 --- */}
            {/* --- 👇 비밀번호 저장 체크박스 UI 부분 👇 --- */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-password-checkbox"
                  name="remember-password-checkbox"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                <label
                  htmlFor="remember-password-checkbox"
                  className="ml-2 block text-sm text-gray-900"
                >
                  비밀번호 저장
                </label>
              </div>
            </div>
            {/* --- 👆 비밀번호 저장 체크박스 UI 부분 👆 --- */}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </div>
        </form>

        {/* <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {success && (
            <div className="rounded-md bg-green-50 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    {success}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="loginId" className="sr-only">
                아이디
              </label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="아이디"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="loginPassword" className="sr-only">
                비밀번호
              </label>
              <input
                id="loginPassword"
                name="loginPassword"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </div>
        </form> */}
      </div>
    </div>
  );
}
