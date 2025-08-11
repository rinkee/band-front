// UpdateButtonWithFunction.js
// User 테이블의 function_number 필드를 사용한 Edge Function 분산 버전
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

const PostUpdater = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedFunction, setSelectedFunction] = useState(""); // 선택된 함수 표시용

  const { mutate } = useSWRConfig();

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

  // function_number에 따른 Edge Function 이름 결정
  const getEdgeFunctionName = (functionNumber) => {
    console.log(`🎯 function_number: ${functionNumber}`);
    
    switch(functionNumber) {
      case 1:
        return 'band-get-posts-a';
      case 2:
        return 'band-get-posts-b';
      case 0:
      default:
        return 'band-get-posts';
    }
  };

  useEffect(() => {
    // 초기 로드 시 로그인 상태 확인
    if (!getUserIdFromSession()) {
      // 필요시 초기 에러 설정 또는 버튼 비활성화 로직
    }
    
    // function_number 확인 및 표시
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (sessionDataString) {
        const sessionUserData = JSON.parse(sessionDataString);
        const functionNumber = sessionUserData?.function_number ?? 0;
        const functionName = getEdgeFunctionName(functionNumber);
        setSelectedFunction(functionName);
        console.log(`📡 User function_number: ${functionNumber} → ${functionName}`);
      }
    } catch (e) {
      console.error("function_number 확인 실패:", e);
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

    // 🎯 세션에서 function_number 가져오기
    let functionNumber = 0; // 기본값
    let edgeFunctionName = 'band-get-posts'; // 기본 함수
    
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (sessionDataString) {
        const sessionUserData = JSON.parse(sessionDataString);
        functionNumber = sessionUserData?.function_number ?? 0;
        edgeFunctionName = getEdgeFunctionName(functionNumber);
        setSelectedFunction(edgeFunctionName);
        
        console.log(`🚀 선택된 Edge Function: ${edgeFunctionName} (function_number: ${functionNumber})`);
      }
    } catch (e) {
      console.error("function_number 읽기 실패, 기본값 사용:", e);
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

      // 🎯 동적으로 선택된 Edge Function 사용
      const functionUrl = `${functionsBaseUrl}/${edgeFunctionName}?${params.toString()}`;
      
      console.log(`📡 API 호출: ${functionUrl}`);

      const response = await api.get(functionUrl, {
        timeout: 600000, // 10분 타임아웃
      });

      const responseData = response.data;

      // 성공 또는 부분 성공 처리 (200 또는 207)
      if (response.status === 200 || response.status === 207) {
        const processedCount = responseData.data?.length || 0;

        // failover 정보 확인
        const failoverInfo = responseData.failoverInfo;
        let baseMessage = `${processedCount}개의 게시물 정보를 동기화했습니다.`;
        
        // function_number 정보 추가
        baseMessage += `\n🎯 사용된 함수: ${edgeFunctionName} (function_number: ${functionNumber})`;

        // 에러 요약 정보 확인
        if (responseData.errorSummary) {
          const { totalErrors, errorRate } = responseData.errorSummary;
          baseMessage = `${processedCount}개 게시물 중 ${totalErrors}개 실패 (${errorRate}% 오류율)`;
          baseMessage += `\n🎯 사용된 함수: ${edgeFunctionName}`;
          baseMessage += `\n⚠️ 실패한 게시물은 다음 업데이트 시 자동으로 재시도됩니다.`;

          setError(baseMessage);
          setSuccessMessage("");
        } else {
          // 완전 성공
          let successMessage = baseMessage;

          if (failoverInfo && failoverInfo.keysUsed > 1) {
            successMessage += `\n⚠️ 메인 키 한계량 초과로 백업 키 #${failoverInfo.finalKeyIndex}를 사용했습니다.`;
          } else if (failoverInfo && failoverInfo.finalKeyIndex > 0) {
            successMessage += `\n⚠️ 현재 백업 키 #${failoverInfo.finalKeyIndex}를 사용 중입니다.`;
          }

          setSuccessMessage(successMessage);
          setError("");
        }

        if (userId) {
          // SWR 캐시 갱신
          const functionsBaseUrlForMutate = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

          // 1. useOrders 훅의 데이터 갱신
          const ordersKeyPattern = `${functionsBaseUrlForMutate}/orders-get-all?userId=${userId}`;
          mutate(
            (key) =>
              typeof key === "string" && key.startsWith(ordersKeyPattern),
            undefined,
            { revalidate: true }
          );

          // 2. useProducts 훅의 데이터 갱신
          const productsKeyPattern = `${functionsBaseUrlForMutate}/products-get-all?userId=${userId}`;
          mutate(
            (key) =>
              typeof key === "string" && key.startsWith(productsKeyPattern),
            undefined,
            { revalidate: true }
          );

          // 3. useOrderStats 훅의 데이터 갱신
          const statsKeyPattern = `/orders/stats?userId=${userId}`;
          mutate(
            (key) => typeof key === "string" && key.startsWith(statsKeyPattern),
            undefined,
            { revalidate: true }
          );
        }
      } else {
        // 완전 실패 처리 (500 등)
        let errorMessage =
          responseData.message ||
          "게시물 동기화 중 서버에서 오류가 발생했습니다.";

        if (responseData.errors && responseData.errors.length > 0) {
          errorMessage += `\n실패한 게시물: ${responseData.errors.length}개`;
        }

        setError(errorMessage);
        setSuccessMessage("");
      }
    } catch (err) {
      let userFriendlyMessage = "너무 이른 요청입니다. 잠시 후 다시 시도해주세요.";
      if (err.isAxiosError && err.response) {
        userFriendlyMessage = err.response.data?.message || "너무 이른 요청입니다. 잠시 후 다시 시도해주세요.";
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
    }
  }, [bandNumber, successMessage, mutate]);

  // 성공 메시지 자동 해제를 위한 useEffect
  useEffect(() => {
    let timer;
    if (successMessage) {
      timer = setTimeout(() => {
        setSuccessMessage("");
      }, 5000); // 5초 후 성공 메시지 자동 해제
    }
    return () => clearTimeout(timer);
  }, [successMessage]);

  return (
    <div className="mb-2">
      {/* function_number 정보 표시 (개발/디버그용) */}
      {selectedFunction && process.env.NODE_ENV === 'development' && (
        <div className="mb-2 text-xs text-gray-500 text-center">
          Edge Function: {selectedFunction}
        </div>
      )}
      
      <button
        onClick={handleUpdatePosts}
        disabled={isLoading}
        className={`
          px-8 py-2 text-white font-medium rounded-md transition-colors duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed
          flex items-center justify-center group
          ${
            isLoading
              ? "bg-gray-500 hover:bg-gray-600 focus:ring-gray-400 cursor-wait"
              : error && !successMessage
              ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400"
              : successMessage
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
              : "bg-green-500 hover:bg-blue-700 focus:ring-blue-500"
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
          ? "재시도"
          : successMessage
          ? "동기화 완료!"
          : "업데이트"}
      </button>
      {error && (
        <p
          className={`mt-2 text-sm text-center ${
            error.includes("자동으로 재시도")
              ? "text-amber-600"
              : "text-red-600"
          }`}
        >
          {error}
        </p>
      )}
      {successMessage && !error && (
        <p className="mt-2 text-sm text-green-600 text-center">
          {successMessage}
        </p>
      )}
    </div>
  );
};

export default PostUpdater;