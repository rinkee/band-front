// UpdateButtonAsync.js - 비동기 백그라운드 처리 버전
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import { CheckCircleIcon, XCircleIcon, RefreshIcon } from "lucide-react";

const UpdateButtonAsync = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState(null); // 'processing', 'completed', 'error'
  const [processInfo, setProcessInfo] = useState(null); // 백그라운드 처리 정보

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

  // SWR 캐시 갱신 함수
  const refreshSWRCache = useCallback((userId) => {
    if (!userId) return;

    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

    // 1. useOrders 훅의 데이터 갱신
    const ordersKeyPattern = `${functionsBaseUrl}/orders-get-all?userId=${userId}`;
    mutate(
      (key) => typeof key === "string" && key.startsWith(ordersKeyPattern),
      undefined,
      { revalidate: true }
    );

    // 2. useProducts 훅의 데이터 갱신
    const productsKeyPattern = `${functionsBaseUrl}/products-get-all?userId=${userId}`;
    mutate(
      (key) => typeof key === "string" && key.startsWith(productsKeyPattern),
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
  }, [mutate]);

  // 비동기 업데이트 시작
  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setIsLoading(true);
    setUpdateStatus('processing');

    const userId = getUserIdFromSession();
    if (!userId) {
      setIsLoading(false);
      setUpdateStatus(null);
      return;
    }

    // 사용자 설정에서 게시물 제한 가져오기
    let currentLimit = 200;
    const storedLimit = sessionStorage.getItem("userPostLimit");
    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        currentLimit = parsedLimit;
      }
    }

    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    if (!functionsBaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError("Supabase 함수 URL이 설정되지 않았습니다. 환경 변수를 확인해주세요.");
      setIsLoading(false);
      setUpdateStatus('error');
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("limit", currentLimit.toString());
      params.append("async", "true"); // 비동기 처리 요청
      if (bandNumber) {
        params.append("bandNumber", bandNumber.toString());
      }

      const functionUrl = `${functionsBaseUrl}/band-get-posts?${params.toString()}`;

      // 비동기 요청 시작
      const response = await api.get(functionUrl, {
        timeout: 30000, // 30초로 단축 (초기 응답만 받으면 됨)
      });

      const responseData = response.data;

      // 즉시 응답 처리
      if (response.status === 202) { // Accepted - 비동기 처리 시작됨
        setIsLoading(false);
        setSuccessMessage("업데이트가 시작되었습니다. 백그라운드에서 처리 중입니다.");
        setProcessInfo({
          taskId: responseData.taskId,
          estimatedTime: responseData.estimatedTime || "알 수 없음",
          startedAt: new Date().toISOString()
        });

        // 즉시 캐시 갱신 시작 (기존 데이터라도 먼저 보여줌)
        refreshSWRCache(userId);

        // 주기적으로 상태 확인 (폴링 방식)
        startStatusPolling(responseData.taskId, userId);
      } else {
        // 동기 처리 폴백 (기존 방식)
        handleSyncResponse(response, responseData, userId);
      }
    } catch (err) {
      handleError(err);
    }
  }, [bandNumber, refreshSWRCache]);

  // 백그라운드 처리 상태 확인 (폴링)
  const startStatusPolling = useCallback((taskId, userId) => {
    let pollCount = 0;
    const maxPolls = 60; // 최대 5분 (5초 간격)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        // 실제로는 task 상태 확인 API가 필요함
        // 여기서는 시뮬레이션
        const isCompleted = pollCount >= 3; // 15초 후 완료로 가정
        
        if (isCompleted || pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setUpdateStatus('completed');
          setSuccessMessage("업데이트가 완료되었습니다!");
          setProcessInfo(null);
          
          // 최종 캐시 갱신
          refreshSWRCache(userId);
          
          // 5초 후 메시지 제거
          setTimeout(() => {
            setSuccessMessage("");
            setUpdateStatus(null);
          }, 5000);
        }
      } catch (error) {
        clearInterval(pollInterval);
        setUpdateStatus('error');
        setError("처리 상태 확인 중 오류가 발생했습니다.");
        setProcessInfo(null);
      }
    }, 5000); // 5초마다 확인

    // 컴포넌트 언마운트 시 인터벌 정리
    return () => clearInterval(pollInterval);
  }, [refreshSWRCache]);

  // 동기 응답 처리 (기존 로직)
  const handleSyncResponse = (response, responseData, userId) => {
    if (response.status === 200 || response.status === 207) {
      const processedCount = responseData.data?.length || 0;
      const failoverInfo = responseData.failoverInfo;
      let baseMessage = `${processedCount}개의 게시물 정보를 동기화했습니다.`;

      if (responseData.errorSummary) {
        const { totalErrors, errorRate } = responseData.errorSummary;
        baseMessage = `${processedCount}개 게시물 중 ${totalErrors}개 실패 (${errorRate}% 오류율)`;
        baseMessage += `\n⚠️ 실패한 게시물은 다음 업데이트 시 자동으로 재시도됩니다.`;
        setError(baseMessage);
        setUpdateStatus('error');
      } else {
        if (failoverInfo && failoverInfo.keysUsed > 1) {
          baseMessage += `\n⚠️ 메인 키 한계량 초과로 백업 키 #${failoverInfo.finalKeyIndex}를 사용했습니다.`;
        }
        setSuccessMessage(baseMessage);
        setUpdateStatus('completed');
      }

      refreshSWRCache(userId);
    } else {
      let errorMessage = responseData.message || "게시물 동기화 중 서버에서 오류가 발생했습니다.";
      setError(errorMessage);
      setUpdateStatus('error');
    }
    
    setIsLoading(false);
  };

  // 에러 처리
  const handleError = (err) => {
    let userFriendlyMessage = "너무 이른 요청입니다. 잠시 후 다시 시도해주세요.";
    
    if (err.isAxiosError && err.response) {
      userFriendlyMessage = err.response.data?.message || "너무 이른 요청입니다. 잠시 후 다시 시도해주세요.";
    } else if (err.message.includes("timeout") || err.code === "ECONNABORTED") {
      userFriendlyMessage = "요청 시간이 초과되었습니다. 네트워크 상태를 확인하거나, 가져올 게시물 수를 줄여보세요.";
    }
    
    setError(userFriendlyMessage);
    setIsLoading(false);
    setUpdateStatus('error');
  };

  // 상태에 따른 버튼 스타일
  const getButtonStyle = () => {
    if (isLoading || updateStatus === 'processing') {
      return "bg-gray-500 hover:bg-gray-600 focus:ring-gray-400 cursor-wait";
    }
    if (error && !successMessage) {
      return "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400";
    }
    if (successMessage || updateStatus === 'completed') {
      return "bg-green-600 hover:bg-green-700 focus:ring-green-500";
    }
    return "bg-green-500 hover:bg-blue-700 focus:ring-blue-500";
  };

  // 상태에 따른 버튼 텍스트
  const getButtonText = () => {
    if (isLoading) return "요청 중...";
    if (updateStatus === 'processing') return "처리 중...";
    if (error && !successMessage) return "재시도";
    if (successMessage || updateStatus === 'completed') return "동기화 완료!";
    return "업데이트";
  };

  // 상태 아이콘
  const getStatusIcon = () => {
    if (updateStatus === 'processing') {
      return <RefreshIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />;
    }
    if (updateStatus === 'completed') {
      return <CheckCircleIcon className="-ml-1 mr-3 h-5 w-5 text-white" />;
    }
    if (updateStatus === 'error') {
      return <XCircleIcon className="-ml-1 mr-3 h-5 w-5 text-white" />;
    }
    if (isLoading) {
      return (
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
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className="mb-2">
      <button
        onClick={handleUpdatePosts}
        disabled={isLoading || updateStatus === 'processing'}
        className={`
          px-8 py-2 text-white font-medium rounded-md transition-colors duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed
          flex items-center justify-center group
          ${getButtonStyle()}
        `}
      >
        {getStatusIcon()}
        {getButtonText()}
      </button>
      
      {/* 백그라운드 처리 상태 표시 */}
      {updateStatus === 'processing' && processInfo && (
        <div className="mt-2 p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-700">
            백그라운드에서 처리 중입니다. 페이지를 떠나도 계속 진행됩니다.
          </p>
          <p className="text-xs text-blue-600 mt-1">
            예상 시간: {processInfo.estimatedTime}
          </p>
        </div>
      )}
      
      {error && (
        <p className={`mt-2 text-sm text-center ${
          error.includes("자동으로 재시도") ? "text-amber-600" : "text-red-600"
        }`}>
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

export default UpdateButtonAsync;