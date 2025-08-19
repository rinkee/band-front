// UpdateButtonImprovedWithFunction.js - function_number 분산 + 진행률 표시 버전
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

const UpdateButtonImprovedWithFunction = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
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

  // 초기 로드 시 function_number 확인
  useEffect(() => {
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
      }
    } catch (e) {
      console.error("function_number 확인 실패:", e);
    }
  }, []);

  // 주기적 캐시 갱신 및 진행률 시뮬레이션
  useEffect(() => {
    if (!isBackgroundProcessing) return;

    const userId = getUserIdFromSession();
    if (!userId) return;

    // 즉시 한 번 갱신
    refreshSWRCache(userId);

    // 사용자 설정에서 게시물 제한 가져오기
    let estimatedTotal = 200; // 기본값
    
    // 1. userData에서 직접 post_fetch_limit 확인
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (sessionDataString) {
        const sessionUserData = JSON.parse(sessionDataString);
        if (sessionUserData?.post_fetch_limit) {
          const userLimit = parseInt(sessionUserData.post_fetch_limit, 10);
          if (!isNaN(userLimit) && userLimit > 0) {
            estimatedTotal = userLimit;
          }
        }
      }
    } catch (error) {
      console.error("post_fetch_limit 읽기 실패:", error);
    }
    
    // 2. 그래도 없으면 userPostLimit 세션 값 확인 (하위 호환성)
    if (estimatedTotal === 200) {
      const storedLimit = sessionStorage.getItem("userPostLimit");
      if (storedLimit) {
        const parsedLimit = parseInt(storedLimit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          estimatedTotal = parsedLimit;
        }
      }
    }
    
    setProgress({ current: 0, total: estimatedTotal, message: '시작 중...' });

    let currentCount = 0;
    const increment = Math.ceil(estimatedTotal / 10); // 10단계로 나누어 진행

    // 진행률 업데이트 및 캐시 갱신 (2초마다)
    const intervalId = setInterval(() => {
      currentCount += increment;
      if (currentCount > estimatedTotal) currentCount = estimatedTotal;
      
      const messages = [
        '분석 중...',
        '추출 중...',
        '처리 중...',
        '저장 중...',
        '마무리 중...'
      ];
      const messageIndex = Math.floor((currentCount / estimatedTotal) * messages.length);
      
      setProgress({
        current: currentCount,
        total: estimatedTotal,
        message: messages[Math.min(messageIndex, messages.length - 1)]
      });
      
      refreshSWRCache(userId);
      
      // 완료 처리
      if (currentCount >= estimatedTotal) {
        setIsBackgroundProcessing(false);
        setSuccessMessage("✨ 업데이트 완료!");
        
        // 진행률 바 유지하고 3초 후 제거
        setTimeout(() => {
          setProgress({ current: 0, total: 0, message: '' });
          setSuccessMessage("");
        }, 3000);
        
        clearInterval(intervalId);
      }
    }, 2000);

    // 최대 60초 타임아웃
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setIsBackgroundProcessing(false);
      setProgress({ current: estimatedTotal, total: estimatedTotal, message: '완료!' });
      setSuccessMessage("✨ 업데이트 완료!");
      
      setTimeout(() => {
        setProgress({ current: 0, total: 0, message: '' });
        setSuccessMessage("");
      }, 3000);
    }, 60000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isBackgroundProcessing, refreshSWRCache]);

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
        
      }
    } catch (e) {
      console.error("function_number 읽기 실패, 기본값 사용:", e);
    }

    // 사용자 설정에서 게시물 제한 가져오기
    let currentLimit = 200; // 기본값
    
    // 1. userData에서 직접 post_fetch_limit 확인
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (sessionDataString) {
        const sessionUserData = JSON.parse(sessionDataString);
        if (sessionUserData?.post_fetch_limit) {
          const userLimit = parseInt(sessionUserData.post_fetch_limit, 10);
          if (!isNaN(userLimit) && userLimit > 0) {
            currentLimit = userLimit;
          }
        }
      }
    } catch (error) {
      console.error("post_fetch_limit 읽기 실패:", error);
    }
    
    // 2. 그래도 없으면 userPostLimit 세션 값 확인 (하위 호환성)
    if (currentLimit === 200) {
      const storedLimit = sessionStorage.getItem("userPostLimit");
      if (storedLimit) {
        const parsedLimit = parseInt(storedLimit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          currentLimit = parsedLimit;
        }
      }
    }

    const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    if (!functionsBaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError("Supabase 함수 URL이 설정되지 않았습니다. 환경 변수를 확인해주세요.");
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("limit", currentLimit.toString());
      
      // 세션 ID 생성 및 추가
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      params.append("sessionId", sessionId);
      
      if (bandNumber) {
        params.append("bandNumber", bandNumber.toString());
      }

      // 🎯 동적으로 선택된 Edge Function 사용
      const functionUrl = `${functionsBaseUrl}/${edgeFunctionName}?${params.toString()}`;
      

      // AbortController로 요청 관리
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

      // API 요청 시작
      const requestPromise = api.get(functionUrl, {
        signal: controller.signal,
        timeout: 600000, // 실제 처리는 계속됨
      });

      // Promise.race로 빠른 응답 처리
      const quickResponse = await Promise.race([
        requestPromise,
        new Promise((resolve) => setTimeout(() => resolve({ quickReturn: true }), 3000)) // 3초 후 즉시 반환
      ]);

      clearTimeout(timeoutId);

      if (quickResponse.quickReturn) {
        // 3초 내에 응답이 없으면 백그라운드 처리로 전환
        setIsLoading(false);
        setSuccessMessage("");
        setIsBackgroundProcessing(true);
        
        // 실제 요청은 계속 진행되도록 함
        requestPromise.then((response) => {
          
          // 백그라운드에서 완료되면 즉시 완료 처리
          handleResponse(response, userId, functionNumber, edgeFunctionName);
          setIsBackgroundProcessing(false);
          
          // 진행률을 100%로 즉시 업데이트
          const processedCount = response.data?.data?.length || 0;
          setProgress({
            current: processedCount,
            total: processedCount,
            message: '완료!'
          });
          
          // 3초 후 진행률 초기화
          setTimeout(() => {
            setProgress({ current: 0, total: 0, message: '' });
          }, 3000);
        }).catch((err) => {
          // 백그라운드 에러 처리
          console.error("🔴 백그라운드 처리 에러:", err);
          console.error("🔴 에러 상세:", err.response?.data);
          setIsBackgroundProcessing(false);
          handleError(err);
        });
      } else {
        // 3초 내에 응답이 온 경우 (기존 로직)
        handleResponse(quickResponse, userId, functionNumber, edgeFunctionName);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // 타임아웃으로 인한 취소
        setIsLoading(false);
        setSuccessMessage("");
        setIsBackgroundProcessing(true);
      } else {
        handleError(err);
      }
    }
  }, [bandNumber, refreshSWRCache]);

  // 응답 처리 (기존 로직)
  const handleResponse = (response, userId, functionNumber, edgeFunctionName) => {
    const responseData = response.data;

    if (response.status === 200 || response.status === 207) {
      const processedCount = responseData.data?.length || 0;
      const failoverInfo = responseData.failoverInfo;
      
      // 진행률 업데이트
      setProgress({
        current: processedCount,
        total: processedCount,
        message: '완료!'
      });

      if (responseData.errorSummary) {
        const { totalErrors, errorRate } = responseData.errorSummary;
        setError(`${processedCount}개 중 ${totalErrors}개 실패 (${errorRate}%)`);
      } else {
        setSuccessMessage(`✨ ${processedCount}개 동기화 완료!`);
      }

      refreshSWRCache(userId);
      
      // 3초 후 진행률 초기화
      setTimeout(() => {
        setProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    } else {
      let errorMessage = responseData.message || "게시물 동기화 중 서버에서 오류가 발생했습니다.";
      setError(errorMessage);
      setProgress({ current: 0, total: 0, message: '' });
    }
    
    setIsLoading(false);
  };

  // 에러 처리
  const handleError = (err) => {
    let userFriendlyMessage = "잠시 후 다시 시도해주세요.";
    
    if (err.isAxiosError && err.response) {
      const msg = err.response.data?.message || "잠시 후 다시 시도해주세요.";
      userFriendlyMessage = msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
    } else if (err.message.includes("timeout") || err.code === "ECONNABORTED") {
      userFriendlyMessage = "요청 시간 초과. 네트워크를 확인하세요.";
    }
    
    setError(userFriendlyMessage);
    setIsLoading(false);
  };

  // 성공 메시지 자동 해제
  useEffect(() => {
    let timer;
    if (successMessage && !isBackgroundProcessing) {
      timer = setTimeout(() => {
        setSuccessMessage("");
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [successMessage, isBackgroundProcessing]);

  return (
    <div className="mb-2">
      
      <button
        onClick={handleUpdatePosts}
        disabled={isLoading || isBackgroundProcessing}
        className={`
          px-8 py-2 text-white font-medium rounded-md transition-colors duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed
          flex items-center justify-center group
          ${
            isLoading || isBackgroundProcessing
              ? "bg-gray-500 hover:bg-gray-600 focus:ring-gray-400 cursor-wait"
              : error && !successMessage
              ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400"
              : successMessage
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
              : "bg-green-500 hover:bg-blue-700 focus:ring-blue-500"
          }
        `}
      >
        {(isLoading || isBackgroundProcessing) && (
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
        )}
        {isLoading
          ? "요청 중..."
          : isBackgroundProcessing
          ? "처리 중..."
          : error && !successMessage
          ? "재시도"
          : successMessage
          ? "동기화 완료!"
          : "업데이트"}
      </button>

      {/* 진행률 표시 - 컴팩트 버전 */}
      {(isBackgroundProcessing || progress.total > 0) && (
        <div className="mt-2">
          <div className="flex items-center gap-3">
            {/* 진행률 바 */}
            <div className="flex-1">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* 진행 상태 텍스트 */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>{progress.current}/{progress.total}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{progress.message || '처리 중...'}</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className={`mt-1 text-xs ${
          error.includes("자동으로 재시도") ? "text-amber-600" : "text-red-600"
        }`}>
          {error.length > 80 ? error.substring(0, 80) + '...' : error}
        </p>
      )}

      {successMessage && !error && !isBackgroundProcessing && (
        <p className="mt-1 text-xs text-green-600">
          {successMessage.length > 60 ? successMessage.substring(0, 60) + '...' : successMessage}
        </p>
      )}
    </div>
  );
};

export default UpdateButtonImprovedWithFunction;