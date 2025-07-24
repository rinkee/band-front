// PostUpdater.js
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher"; // fetcher가 axios 인스턴스라고 가정
import { useSWRConfig } from "swr"; // <<< SWRConfig 훅 임포트

const PostUpdater = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  // const [postsResponse, setPostsResponse] = useState(null); // 응답 데이터 직접 사용 안 하면 제거 가능

  const { mutate } = useSWRConfig(); // <<< mutate 함수 가져오기

  // 세션에서 userId 가져오는 헬퍼 함수
  const getUserIdFromSession = () => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (!sessionDataString) {
      setError("로그인 정보가 필요합니다. 먼저 로그인해주세요.");
      return null;
    }
    try {
      const sessionUserData = JSON.parse(sessionDataString);
      const userId = sessionUserData?.userId;
      if (!userId) {
        setError("세션에서 사용자 ID를 찾을 수 없습니다.");
        return null;
      }
      return userId;
    } catch (e) {
      setError("세션 정보를 처리하는 중 오류가 발생했습니다.");
      return null;
    }
  };

  useEffect(() => {
    // 초기 로드 시 로그인 상태 확인 (버튼 활성화 여부 등에 사용 가능)
    if (!getUserIdFromSession()) {
      // 필요시 초기 에러 설정 또는 버튼 비활성화 로직
    }
  }, []);

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    const userId = getUserIdFromSession();
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // 사용자 설정에서 게시물 제한 가져오기
    let currentLimit = 200; // 기본값

    // 1. 세션에서 사용자 설정값 확인
    const storedLimit = sessionStorage.getItem("userPostLimit");
    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        currentLimit = parsedLimit;
      }
    } else {
      // 2. 세션에 없으면 세션 데이터에서 확인
      try {
        const sessionData = sessionStorage.getItem("sessionUserData");
        if (sessionData) {
          const userData = JSON.parse(sessionData);
          if (userData?.post_fetch_limit) {
            const userLimit = parseInt(userData.post_fetch_limit, 10);
            if (!isNaN(userLimit) && userLimit > 0) {
              currentLimit = userLimit;
              // 다음 번을 위해 세션에 저장
              sessionStorage.setItem("userPostLimit", userLimit.toString());
            }
          }
        }
      } catch (error) {
        // 세션 데이터 파싱 실패
      }
    }

    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    if (!functionsBaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // 환경 변수 존재 확인
      setError(
        "Supabase 함수 URL이 설정되지 않았습니다. 환경 변수를 확인해주세요."
      );
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("limit", currentLimit.toString());
      if (bandNumber) {
        params.append("bandNumber", bandNumber.toString());
      }
      // AI 처리 여부 파라미터 (기본값 true, 필요시 false로 설정 가능하게)
      // 예: params.append("processAI", "true");

      const functionUrl = `${functionsBaseUrl}/band-get-posts?${params.toString()}`;

      const response = await api.get(functionUrl, {
        timeout: 600000, // 10분 타임아웃
      });

      const responseData = response.data;

      // 🔥 성공 또는 부분 성공 처리 (200 또는 207)
      if (response.status === 200 || response.status === 207) {
        const processedCount = responseData.data?.length || 0;

        // failover 정보 확인
        const failoverInfo = responseData.failoverInfo;
        let baseMessage = `${processedCount}개의 게시물 정보를 동기화했습니다.`;

        // 🔥 에러 요약 정보 확인
        if (responseData.errorSummary) {
          const { totalErrors, errorRate } = responseData.errorSummary;
          baseMessage = `${processedCount}개 게시물 중 ${totalErrors}개 실패 (${errorRate}% 오류율)`;

          // 에러 상세 정보 (개발 시 필요하면 주석 해제)
          // console.warn("처리 실패한 게시물들:", responseData.errors);

          // 사용자에게 재시도 안내
          baseMessage += `\n⚠️ 실패한 게시물은 다음 업데이트 시 자동으로 재시도됩니다.`;

          // 부분 실패이므로 경고 스타일로 표시
          setError(baseMessage);
          setSuccessMessage(""); // 성공 메시지는 비움
        } else {
          // 완전 성공
          let successMessage = baseMessage;

          if (failoverInfo && failoverInfo.keysUsed > 1) {
            successMessage += `\n⚠️ 메인 키 한계량 초과로 백업 키 #${failoverInfo.finalKeyIndex}를 사용했습니다.`;
          } else if (failoverInfo && failoverInfo.finalKeyIndex > 0) {
            successMessage += `\n⚠️ 현재 백업 키 #${failoverInfo.finalKeyIndex}를 사용 중입니다.`;
          }

          setSuccessMessage(successMessage);
          setError(""); // 에러 메시지는 비움
        }

        if (userId) {
          // userId가 있을 때만 mutate 실행
          const functionsBaseUrlForMutate = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`; // 키 패턴에 필요

          // 1. useOrders 훅의 데이터 갱신 (hooks/index.js 코드 기반)
          const ordersKeyPattern = `${functionsBaseUrlForMutate}/orders-get-all?userId=${userId}`;
          mutate(
            (key) =>
              typeof key === "string" && key.startsWith(ordersKeyPattern),
            undefined,
            { revalidate: true }
          );

          // 2. useProducts 훅의 데이터 갱신 (hooks/useProducts.js 코드 기반)
          const productsKeyPattern = `${functionsBaseUrlForMutate}/products-get-all?userId=${userId}`;
          mutate(
            (key) =>
              typeof key === "string" && key.startsWith(productsKeyPattern),
            undefined,
            { revalidate: true }
          );

          // 3. useOrderStats 훅의 데이터 갱신 (hooks/index.js 코드 기반)
          const statsKeyPattern = `/orders/stats?userId=${userId}`; // 또는 `/api/orders/stats?userId=${userId}` 등 실제 API 경로에 맞춤
          mutate(
            (key) => typeof key === "string" && key.startsWith(statsKeyPattern),
            undefined,
            { revalidate: true }
          );

          // SWR 캐시 갱신 완료
        } else {
          // userId가 없어서 SWR 캐시 갱신 건너뜀
        }
        // --- SWR 캐시 갱신 끝 ---
      } else {
        // 🔥 완전 실패 처리 (500 등)
        let errorMessage =
          responseData.message ||
          "게시물 동기화 중 서버에서 오류가 발생했습니다.";

        // 에러 상세 정보가 있으면 추가
        if (responseData.errors && responseData.errors.length > 0) {
          errorMessage += `\n실패한 게시물: ${responseData.errors.length}개`;
          // console.error("상세 에러 정보:", responseData.errors);
        }

        setError(errorMessage);
        setSuccessMessage("");
      }
    } catch (err) {
      // console.error("!!! API Call CATCH block !!!");
      // console.error("Full API Error Object:", err);

      let userFriendlyMessage =
        "게시물 업데이트 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (err.isAxiosError && err.response) {
        userFriendlyMessage += ` (서버: ${
          err.response.data?.message || err.response.statusText || "알 수 없음"
        })`;
      } else if (
        err.message.includes("timeout") ||
        err.code === "ECONNABORTED"
      ) {
        userFriendlyMessage =
          "요청 시간이 초과되었습니다. 네트워크 상태를 확인하거나, 가져올 게시물 수를 줄여보세요.";
      }
      setError(userFriendlyMessage);
    } finally {
      setIsLoading(false);
      // 성공 메시지 자동 해제는 useEffect에서 처리 (228-237번째 줄)
    }
  }, [bandNumber, successMessage, mutate]); // 의존성 배열에 mutate 추가

  // 성공 메시지 자동 해제를 위한 useEffect (선택적 개선)
  useEffect(() => {
    let timer;
    if (successMessage) {
      timer = setTimeout(() => {
        setSuccessMessage("");
      }, 5000); // 5초 후 성공 메시지 자동 해제
    }
    return () => clearTimeout(timer); // 컴포넌트 언마운트 또는 successMessage 변경 시 타이머 클리어
  }, [successMessage]);

  return (
    <div className="mb-2">
      {" "}
      {/* 컴포넌트 주변 여백 추가 */}
      <button
        onClick={handleUpdatePosts}
        disabled={isLoading} // 🔥 로딩 중에만 비활성화 (에러 시에도 재시도 가능하게)
        className={`
          px-8 py-2 text-white font-medium rounded-md transition-colors duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed
          flex items-center justify-center group {/* 아이콘과 텍스트 정렬 */}
          ${
            isLoading
              ? "bg-gray-500 hover:bg-gray-600 focus:ring-gray-400 cursor-wait" // 로딩 중 스타일
              : error && !successMessage
              ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400" // 🔥 부분 실패/에러 스타일 (경고색)
              : successMessage
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500" // 성공 스타일
              : "bg-green-500 hover:bg-blue-700 focus:ring-blue-500" // 기본 활성 스타일
          }
        `}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {isLoading
          ? "동기화 중..."
          : error && !successMessage
          ? "재시도" // 🔥 에러 시 재시도 버튼으로 표시
          : successMessage
          ? "동기화 완료!"
          : "업데이트"}
      </button>
      {error && (
        <p
          className={`mt-2 text-sm text-center ${
            error.includes("자동으로 재시도")
              ? "text-amber-600" // 🔥 부분 실패 시 경고색 (재시도 안내 포함)
              : "text-red-600" // 완전 실패 시 빨간색
          }`}
        >
          {" "}
          {/* 가운데 정렬 추가 */}
          {error}
        </p>
      )}
      {successMessage && !error && (
        <p className="mt-2 text-sm text-green-600 text-center">
          {" "}
          {/* 가운데 정렬 추가 */}
          {successMessage}
        </p>
      )}
    </div>
  );
};

export default PostUpdater;
