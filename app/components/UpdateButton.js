"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";

const PostUpdater = ({ bandNumber = null }) => {
  const [isLoadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");
  const [postsResponse, setPostsResponse] = useState(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (!sessionDataString) {
      setError(
        "로그인 정보(세션)를 찾을 수 없습니다. 버튼을 누르기 전에 로그인해주세요."
      );
    } else {
      try {
        const sessionUserData = JSON.parse(sessionDataString);
        const userId = sessionUserData?.userId;
        if (!userId) {
          setError("세션 데이터에 사용자 ID가 없습니다.");
        }
      } catch (e) {
        setError("세션 데이터 처리 오류.");
      }
    }
  }, []);

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setPostsResponse(null);
    setLoadingPosts(true);
    setUpdateSuccess(false);

    let userId = null;
    const sessionDataString = sessionStorage.getItem("userData");
    if (sessionDataString) {
      try {
        const sessionUserData = JSON.parse(sessionDataString);
        userId = sessionUserData?.userId;
      } catch (e) {
        setError("세션 데이터 처리 오류.");
        setLoadingPosts(false);
        return;
      }
    }

    if (!userId) {
      setError("로그인 정보(세션)를 찾을 수 없거나 ID가 없습니다.");
      setLoadingPosts(false);
      return;
    }

    let currentLimit = 200;
    const storedLimit = sessionStorage.getItem("userPostLimit");
    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        currentLimit = parsedLimit;
      }
    }
    console.log(`Using limit: ${currentLimit}`);

    // Supabase 함수 URL 가져오기 (환경 변수 사용 권장)
    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    if (!functionsBaseUrl) {
      setError("Supabase 함수 URL이 설정되지 않았습니다.");
      setLoadingPosts(false);
      return;
    }

    try {
      // URL 파라미터 구성
      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("limit", currentLimit.toString());
      if (bandNumber) {
        params.append("bandNumber", bandNumber.toString());
      }

      const functionUrl = `${functionsBaseUrl}/band-get-posts?${params.toString()}`;
      console.log("Calling Supabase function via URL:", functionUrl);

      // api.get을 사용하여 URL 호출 (기존 방식 복구)
      const response = await api.get(functionUrl, {
        // 필요시 추가 axios 옵션 설정 (예: timeout)
        timeout: 600000, // 10분 타임아웃 설정 (단위: ms)
      });

      console.log("API Response Data:", response.data); // 응답 데이터 콘솔 출력
      setPostsResponse(response.data);
      setUpdateSuccess(true);
    } catch (err) {
      console.error("!!! Entering CATCH block !!!");
      console.error("Full API Error Object:", err); // 전체 에러 객체 출력

      let errorMessage = "게시물 업데이트 중 오류가 발생했습니다.";
      if (err.response) {
        // 서버 응답이 있는 에러 (4xx, 5xx)
        errorMessage += ` 서버 메시지: ${
          err.response.data?.message || err.response.statusText || "알 수 없음"
        } (상태 코드: ${err.response.status})`;
      } else if (err.request) {
        // 요청은 보냈으나 응답을 받지 못한 경우 (네트워크 오류, 타임아웃 등)
        errorMessage +=
          " 서버에서 응답이 없습니다. 네트워크 또는 백엔드 상태를 확인하세요.";
        if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
          errorMessage += " (타임아웃)";
        }
      } else {
        // 요청 설정 중 발생한 에러
        errorMessage += ` 오류 메시지: ${err.message}`;
      }
      setError(errorMessage);
      setUpdateSuccess(false);
    } finally {
      setLoadingPosts(false);
    }
  }, [bandNumber]);

  return (
    <div>
      <button
        onClick={handleUpdatePosts}
        disabled={isLoadingPosts}
        className={`
          px-5 py-2 /* Padding: Approx 16px horizontal, 8px vertical */
          text-white /* Text Color */
          font-medium /* Font Weight */
          rounded-md /* Border Radius: Approx 6px */
          transition-colors duration-300 ease-in-out /* Transitions */
          focus:outline-none focus:ring-2 focus:ring-offset-2 /* Focus Outline */
          disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed /* Disabled State */
          ${
            /* Conditional classes for active (non-disabled) states */
            updateSuccess && !isLoadingPosts
              ? "bg-green-700 hover:bg-green-800 focus:ring-green-600" // Success State Colors
              : !isLoadingPosts
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500" // Default Active State Colors
              : "" // No specific classes needed when loading (disabled handles it)
          }
        `}
      >
        {isLoadingPosts
          ? "업데이트 중..."
          : updateSuccess
          ? "업데이트 성공" // You might want an icon here too
          : "업데이트"}
      </button>

      {/* Error Message Area */}
      {error && (
        <p className="mt-1.5 text-sm text-red-600">
          {" "}
          {/* Margin top, small text, red color */}
          {error}
        </p>
      )}
    </div>
  );
};

export default PostUpdater;
