// login/page_with_function_number.js
// function_number 필드를 세션에 포함하는 버전

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchParamsHandler from "./SearchParamsHandler";
import { api } from "../lib/fetcher";

import { createClient } from "@supabase/supabase-js";

const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const REMEMBERED_LOGIN_ID_KEY = "rememberedLoginId";
const REMEMBER_ID_CHECKBOX_KEY = "rememberIdCheckboxState";
const REMEMBER_PASSWORD_CHECKBOX_KEY = "rememberPasswordCheckboxState";
const REMEMBERED_PASSWORD_KEY = "rememberedPassword";

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberId, setRememberId] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    // 1. 이미 로그인된 사용자인지 확인
    const userDataSession = sessionStorage.getItem("userData");
    if (userDataSession) {
      try {
        const parsedData = JSON.parse(userDataSession);
        if (parsedData && parsedData.token) {
          console.log("세션에 로그인 정보 있음:", parsedData.loginId);
          router.replace("/dashboard");
          return;
        }
      } catch (e) {
        console.error("세션 데이터 파싱 오류:", e);
        sessionStorage.removeItem("userData");
      }
    }

    // 2. 저장된 아이디 및 체크박스 상태 불러오기
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

  async function loginUserWithFetch(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

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

    try {
      const response = await fetch(`${functionsBaseUrl}/auth-login`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const result = await response.json();
      console.log("Login response:", result);

      if (!response.ok) {
        console.error(
          "Login fetch error:",
          result.message || `HTTP status ${response.status}`
        );
        setError(result.message || "로그인에 실패했습니다.");
        return;
      }

      console.log("Login fetch successful:", result);
      if (result.success && result.token && result.user) {
        const userDetails = result.user;
        const token = result.token;

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

        // 🎯 function_number 추가 (없으면 기본값 0)
        const functionNumber = userDetails.function_number ?? userDetails.functionNumber ?? 0;
        console.log(`🎯 User function_number: ${functionNumber}`);

        // 서버에서 받은 데이터 구조에 맞게 저장
        const userDataToStore = {
          // 기본 정보
          userId: userDetails.userId,
          loginId: userDetails.loginId,

          // 🎯 function_number 추가
          function_number: functionNumber,

          // 상점 정보
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
        console.log(`🎯 function_number 저장됨: ${functionNumber}`);

        // 세션 스토리지에 사용자 데이터 저장
        sessionStorage.setItem("userData", JSON.stringify(userDataToStore));

        // localStorage에도 userId 저장
        localStorage.setItem("userId", userDetails.userId);

        setSuccess(
          `${userDetails.storeName || userDetails.store_name || "고객님"} ${
            userDetails.ownerName || userDetails.owner_name || ""
          }님, 환영합니다!`
        );

        // function_number에 따른 Edge Function 안내 (선택사항)
        const functionName = functionNumber === 1 ? 'band-get-posts-a' : 
                           functionNumber === 2 ? 'band-get-posts-b' : 
                           'band-get-posts';
        console.log(`📡 할당된 Edge Function: ${functionName}`);

        // 대시보드로 이동
        setTimeout(() => {
          router.replace("/dashboard");
        }, 500);
      } else {
        console.error("Login response structure invalid:", result);
        setError(result.message || "로그인에 실패했습니다. (응답 형식 오류)");
      }
    } catch (err) {
      console.error("Login fetch exception:", err);
      setError("로그인 요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 나머지 컴포넌트 코드는 동일...
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            로그인
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={loginUserWithFetch}>
          <input type="hidden" name="remember" value="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="login-id" className="sr-only">
                아이디
              </label>
              <input
                id="login-id"
                name="loginId"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="아이디"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="sr-only">
                비밀번호
              </label>
              <input
                id="login-password"
                name="loginPassword"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-id"
                name="remember-id"
                type="checkbox"
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                checked={rememberId}
                onChange={(e) => setRememberId(e.target.checked)}
              />
              <label htmlFor="remember-id" className="ml-2 block text-sm text-gray-900">
                아이디 저장
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="remember-password"
                name="remember-password"
                type="checkbox"
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
              />
              <label htmlFor="remember-password" className="ml-2 block text-sm text-gray-900">
                비밀번호 저장
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-800">{success}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </div>

          <div className="text-center">
            <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
              회원가입
            </Link>
          </div>
        </form>

        <Suspense fallback={<div>Loading...</div>}>
          <SearchParamsHandler setError={setError} />
        </Suspense>
      </div>
    </div>
  );
}