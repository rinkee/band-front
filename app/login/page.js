"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 회원가입 성공 후 리다이렉트된 경우 메시지 표시
    const registered = searchParams.get("registered");
    if (registered === "true") {
      setSuccess("회원가입이 완료되었습니다. 초기 비밀번호는 0000입니다.");
    }
  }, [searchParams]);

  useEffect(() => {
    // 이미 로그인된 경우 대시보드로 이동
    const userData = sessionStorage.getItem("userData");
    if (userData) {
      try {
        const parsedData = JSON.parse(userData);
        if (parsedData && parsedData.id) {
          console.log("이미 로그인되어 있음:", parsedData.loginId);
          router.replace("/dashboard");
        }
      } catch (error) {
        console.error("로그인 상태 확인 중 오류:", error);
        sessionStorage.removeItem("userData");
      }
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!loginId || !loginPassword) {
      setError("아이디와 비밀번호를 입력해주세요.");
      setLoading(false);
      return;
    }

    try {
      console.log("로그인 시도:", loginId);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, loginPassword }),
      });

      const data = await response.json();
      console.log("로그인 응답:", data);

      if (!response.ok) {
        setError(data.message || "로그인에 실패했습니다.");
        return;
      }

      // 로그인 성공 시 사용자 정보 저장
      if (data.success && data.user) {
        const userData = data.user;
        console.log("로그인 성공 - 사용자 정보:", {
          id: userData.userId,
          loginId: userData.loginId,
          storeName: userData.storeName,
          bandId: userData.bandId,
          naverId: userData.naverId,
        });

        // 세션 스토리지에 사용자 데이터와 토큰 저장
        sessionStorage.setItem("userData", JSON.stringify(userData));
        sessionStorage.setItem("token", data.token);

        // 성공 메시지 표시
        setSuccess(
          `${userData.storeName} ${userData.ownerName}님, 환영합니다!`
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
    } catch (err) {
      console.error("로그인 처리 오류:", err);
      setError(err.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

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
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

          {error && (
            <div className="rounded-md bg-red-50 p-4">
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
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

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
      </div>
    </div>
  );
}
