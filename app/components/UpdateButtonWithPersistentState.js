// UpdateButtonWithPersistentState.js - 페이지간 상태 유지 버전
"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import { useUpdateProgress } from "../contexts/UpdateProgressContext";
import { backupUserDataToIndexedDb } from "../lib/indexedDbBackup";
import { revalidateUserCaches } from "../lib/swrCache";

const UpdateButtonWithPersistentState = ({ bandNumber = null, pageType = 'posts' }) => {
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isRawMode, setIsRawMode] = useState(false);
  
  const { mutate } = useSWRConfig();
  const {
    startUpdate,
    updateProgress,
    completeUpdate,
    getProgressState,
    hasActiveUpdate,
    forceResetState
  } = useUpdateProgress();

  // raw 모드 판별 (컴포넌트 내부)
  const detectRawMode = () => {
    try {
      const s = sessionStorage.getItem("userData");
      if (!s) return false;
      const u = JSON.parse(s);
      const mode =
        u?.orderProcessingMode ||
        u?.order_processing_mode ||
        u?.user?.orderProcessingMode ||
        u?.user?.order_processing_mode ||
        "legacy";
      return String(mode).toLowerCase() === "raw";
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    setIsRawMode(detectRawMode());
    const onStorage = (e) => {
      if (e.key === "userData") setIsRawMode(detectRawMode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 현재 페이지의 진행 상태 가져오기
  const currentProgress = getProgressState(pageType);
  const isBackgroundProcessing = hasActiveUpdate(pageType);

  // 디버깅을 위한 상태 로깅
  console.log('🔍 UpdateButton 상태:', {
    pageType,
    currentProgress,
    isBackgroundProcessing,
    timestamp: new Date().toISOString()
  });

  // 세션에서 userId 가져오는 헬퍼 함수
  const getUserIdFromSession = () => {
    if (typeof window === 'undefined') return null;
    
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (!sessionDataString) {
        setError("로그인 정보가 필요합니다. 먼저 로그인해주세요.");
        return null;
      }
      
      const sessionUserData = JSON.parse(sessionDataString);
      const userId = sessionUserData?.userId;
      if (!userId) {
        setError("세션에서 사용자 ID를 찾을 수 없습니다.");
        return null;
      }
      return userId;
    } catch (e) {
      console.error('getUserIdFromSession 에러:', e);
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
  const refreshSWRCache = useCallback(async (userId, options = {}) => {
    if (!userId) return;
    const invalidateOrderStats = options?.invalidateOrderStats === true;
    await revalidateUserCaches(mutate, {
      userId,
      bandNumber,
      mutateOptions: { revalidate: true },
      invalidateOrderStats,
    });
  }, [mutate, bandNumber]);

  // execution_locks 테이블에서 실행 중 상태 확인하는 함수
  const checkExecutionLock = async (userId) => {
    try {
      const response = await api.get(`/api/execution-locks/check?userId=${userId}`, {
        timeout: 5000 // 5초 타임아웃
      });
      return response.data?.is_running || false;
    } catch (error) {
      console.error("실행 상태 확인 중 오류:", error);
      
      // 네트워크 에러 등의 경우 사용자에게 알림 (하지만 실행은 허용)
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        console.warn("네트워크 연결 문제로 실행 상태 확인 실패. 실행을 허용합니다.");
        setError("⚠️ 네트워크 연결을 확인해주세요. (실행은 계속됩니다)");
        
        // 5초 후 에러 메시지 자동 제거
        setTimeout(() => {
          setError("");
        }, 5000);
      }
      
      // 오류 시 안전하게 false 반환 (실행 허용)
      return false;
    }
  };

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setSuccessMessage("");

    const userId = getUserIdFromSession();
    if (!userId) {
      return;
    }

    // raw 모드에서는 업데이트 대신 SWR 데이터 새로고침만 수행
    if (detectRawMode()) {
      try {
        await refreshSWRCache(userId);
        await backupUserDataToIndexedDb({ userId, mode: "raw" });
        setSuccessMessage("새로고침 완료!");
      } catch (e) {
        setError("새로고침 중 문제가 발생했습니다.");
      }
      return;
    }

    // Context 상태로 중복 실행 방지 (우선 API 호출은 비활성화)
    if (isBackgroundProcessing) {
      console.log('⚠️ 이미 처리 중이므로 중복 실행 방지');
      setError("⚠️ 이미 처리 중인 작업이 있습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    // TODO: API 안정화 후 활성화 예정
    // const isRunning = await checkExecutionLock(userId);
    // if (isRunning) {
    //   setError("⚠️ 이미 처리 중인 작업이 있습니다. 잠시 후 다시 시도해주세요.");
    //   return;
    // }

    // 🎯 세션에서 function_number 가져오기
    let functionNumber = 0; // 기본값
    let edgeFunctionName = 'band-get-posts'; // 기본 함수
    
    try {
      const sessionDataString = sessionStorage.getItem("userData");
      if (sessionDataString) {
        const sessionUserData = JSON.parse(sessionDataString);
        functionNumber = sessionUserData?.function_number ?? 0;
        edgeFunctionName = getEdgeFunctionName(functionNumber);
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
      return;
    }

    try {
      // Context를 통해 업데이트 시작
      console.log('업데이트 시작 시도:', { pageType, currentLimit, userId });
      const progressId = await startUpdate(pageType, currentLimit);
      console.log('업데이트 시작 성공, progressId:', progressId);
      
      // 즉시 상태 업데이트 (Realtime이 없을 때를 위해)
      await updateProgress(progressId, { status: 'processing' });

      const params = new URLSearchParams();
      params.append("userId", userId);
      params.append("limit", currentLimit.toString());
      
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
        setSuccessMessage("");
        
        // 백그라운드 진행률 시뮬레이션 시작
        simulateProgress(progressId, currentLimit);
        
        // 실제 요청은 계속 진행되도록 함
        requestPromise.then((response) => {
          // 백그라운드에서 완료되면 즉시 완료 처리
          handleResponse(response, userId, progressId, true);
        }).catch((err) => {
          // 백그라운드 에러 처리
          console.error("🔴 백그라운드 처리 에러:", err);
          console.error("🔴 에러 상세:", err.response?.data);
          // Edge Function이 이미 에러 상태로 execution_locks를 업데이트함
          handleError(err);
        });
      } else {
        // 3초 내에 응답이 온 경우
        handleResponse(quickResponse, userId, progressId, false);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // 타임아웃으로 인한 취소 - 백그라운드 처리로 전환
        // startUpdate가 호출되지 않았으므로 여기서 시작
        try {
          const progressId = await startUpdate(pageType, currentLimit);
          simulateProgress(progressId, currentLimit);
        } catch (startErr) {
          console.error("업데이트 시작 실패:", startErr);
          handleError(startErr);
        }
      } else {
        handleError(err);
      }
    }
  }, [bandNumber, pageType, startUpdate, completeUpdate, updateProgress, refreshSWRCache]);

  // interval 참조를 컴포넌트 레벨에 저장
  const intervalRef = useRef(null);
  
  // 백그라운드 처리 - 단순한 진행률 시뮬레이션 (DB 연동 없음)
  const simulateProgress = (progressId, totalItems) => {
    console.log('🔄 백그라운드 처리 시작:', { progressId, totalItems });
    
    // 이전 interval이 있으면 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      console.log('🧹 이전 interval 정리');
    }
    
    // 단순한 진행률 시뮬레이션 (주기적 캐시 갱신만)
    let currentCount = 0;
    const increment = Math.ceil(totalItems / 8);
    
    intervalRef.current = setInterval(() => {
      const userId = getUserIdFromSession();
      if (userId) {
        refreshSWRCache(userId);
        console.log('🔄 SWR 캐시 갱신');
      }
      
      // 진행률 업데이트 (90%까지만)
      currentCount += increment;
      if (currentCount > totalItems * 0.9) {
        currentCount = Math.floor(totalItems * 0.9);
      }
      
      // Context 상태 업데이트 (간단히)
      try {
        updateProgress(progressId, { 
          processed_posts: currentCount,
          status: 'processing'
        });
      } catch (err) {
        console.error('진행률 업데이트 실패:', err);
      }
    }, 3000); // 3초마다 업데이트
    
    // 최대 60초 후 자동 완료
    setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log('⏰ 60초 안전장치 작동 - 자동 완료');
        
        // 자동 완료 처리
        try {
          updateProgress(progressId, {
            processed_posts: totalItems,
            status: 'completed'
          });
          completeUpdate(progressId, true);
          setSuccessMessage("✨ 백그라운드 처리 완료!");
        } catch (err) {
          console.error('자동 완료 처리 실패:', err);
        }
      }
    }, 60000);
    
    return intervalRef.current;
  };

  // 응답 처리
  const handleResponse = async (response, userId, progressId, isBackground = false) => {
    const responseData = response.data;

    if (response.status === 200 || response.status === 207) {
      const processedCount = responseData.data?.length || 0;

      console.log('✅ Edge Function 응답 수신:', { 
        processedCount, 
        status: response.status,
        progressId,
        timestamp: new Date().toISOString()
      });
      
      // 상태 완료 처리 (단순화)
      try {
        console.log('📊 완료 처리 시작:', { progressId, processedCount });
        
        // interval 정리
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          console.log('🧹 업데이트 완료 - interval 정리');
        }
        
        // Context 상태 완료 처리
        await updateProgress(progressId, {
          processed_posts: processedCount,
          status: 'completed'
        });
        
        await completeUpdate(progressId, true);
        console.log('✨ 완료 처리 완료:', { progressId });
        
      } catch (error) {
        console.error("❌ 완료 처리 실패:", error);
      }

      if (responseData.errorSummary) {
        const { totalErrors, errorRate } = responseData.errorSummary;
        setError(`${processedCount}개 중 ${totalErrors}개 실패 (${errorRate}%)`);
      } else {
        setSuccessMessage(`✨ ${processedCount}개 동기화 완료!`);
      }

	      refreshSWRCache(userId, { invalidateOrderStats: true });
	    } else {
      let errorMessage = responseData.message || "게시물 동기화 중 서버에서 오류가 발생했습니다.";
      setError(errorMessage);
      console.log('❌ Edge Function 에러 응답:', { status: response.status, errorMessage });
      // Edge Function이 이미 에러 상태로 execution_locks를 업데이트함
    }
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
  
  // 컴포넌트 언마운트 시 interval 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log('🧹 컴포넌트 언마운트 - interval 정리');
      }
    };
  }, []);

  return (
    <div className="inline-block">
      <button
        onClick={handleUpdatePosts}
        onDoubleClick={async () => {
          if (isBackgroundProcessing) {
            console.log('🔥 더블클릭으로 강제 상태 초기화');
            await forceResetState(pageType);
            setError("");
            setSuccessMessage("");
          }
        }}
        disabled={false} // 더블클릭을 위해 disabled 제거
        className={`
          px-8 py-2 text-white font-medium rounded-md transition-colors duration-300 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          flex items-center justify-center group
          ${
            isBackgroundProcessing
              ? "bg-gray-500 hover:bg-gray-600 focus:ring-gray-400 cursor-pointer"
            : error && !successMessage
              ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400"
            : successMessage
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
              : isRawMode
              ? "bg-gray-700 hover:bg-gray-800 focus:ring-gray-500"
              : "bg-green-500 hover:bg-blue-700 focus:ring-blue-500"
          }
        `}
        title={isBackgroundProcessing ? "더블클릭으로 강제 초기화 가능" : (isRawMode ? "새로고침" : "업데이트")}
      >
        {isBackgroundProcessing && (
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
        {isBackgroundProcessing
          ? "처리 중..."
          : error && !successMessage
          ? "재시도"
          : successMessage
          ? (isRawMode ? "새로고침 완료!" : "동기화 완료!")
          : (isRawMode ? "새로고침" : "업데이트")}
      </button>

      {/* 진행률 표시 - 컴팩트 바 버전 */}
      {(isBackgroundProcessing || currentProgress) && (
        <div className="mt-2 flex items-center gap-2">
          {/* 진행률 바 - 길이 제한 */}
          <div className="w-32">
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ 
                  width: `${currentProgress ? currentProgress.percentage : 0}%` 
                }}
              />
            </div>
          </div>
          {/* 진행 상태 텍스트 - 간결하게 */}
          <span className="text-xs text-gray-500">
            {currentProgress ? 
              `${currentProgress.message || '처리 중'}` :
              '처리 중...'
            }
          </span>
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

export default UpdateButtonWithPersistentState;
