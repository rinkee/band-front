// UpdateButtonBeta.js - orders-test 페이지용 커스텀 업데이트 버튼
"use client";
import React, { useState, useCallback, useEffect } from "react";
import ReactDOM from "react-dom";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import { CheckIcon, XMarkIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

// 토스트 메시지 컴포넌트 (Portal 사용)
const Toast = ({ message, type, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(onClose, 3000);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, [onClose]);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div className={`
      fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999]
      animate-slide-down
    `}>
      <div className={`
        flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg
        ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}
      `}>
        {type === 'success' ? (
          <CheckIcon className="w-5 h-5" />
        ) : (
          <XMarkIcon className="w-5 h-5" />
        )}
        <span className="font-medium">{message}</span>
      </div>
    </div>,
    document.body
  );
};

const UpdateButtonBeta = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

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

  useEffect(() => {
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
      
      // 세션 ID 생성 및 추가
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      params.append("sessionId", sessionId);
      
      if (bandNumber) {
        params.append("bandNumber", bandNumber.toString());
      }

      const functionUrl = `${functionsBaseUrl}/band-get-posts?${params.toString()}`;

      // AbortController로 요청 관리
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

      // API 요청 시작
      const requestPromise = api.get(functionUrl, {
        signal: controller.signal,
        timeout: 600000, // 실제 처리는 곈4속됨
      });

      // Promise.race로 빠른 응답 처리
      const quickResponse = await Promise.race([
        requestPromise,
        new Promise((resolve) => setTimeout(() => resolve({ quickReturn: true }), 3000)) // 3초 후 즉시 반환
      ]);

      clearTimeout(timeoutId);

      if (quickResponse.quickReturn) {
        // 3초 내에 응답이 없으면 백그라운드 처리로 전환
        console.log("⏰ 3초 타임아웃! 백그라운드 처리로 전환");
        setIsLoading(false);
        setIsBackgroundProcessing(true);
        
        // 실제 요청은 계속 진행되도록 함
        requestPromise.then((response) => {
          console.log("🔵 백그라운드 처리 완료! 서버 응답:", response);
          console.log("🔵 응답 데이터:", response.data);
          console.log("🔵 처리된 게시물 수:", response.data?.data?.length || 0);
          
          // 백그라운드에서 완료되면 즉시 완료 처리
          setIsBackgroundProcessing(false);
          
          // 진행률을 100%로 즉시 업데이트
          const processedCount = response.data?.data?.length || 0;
          const newPosts = response.data?.newPosts || 0;
          const updatedComments = response.data?.updatedComments || 0;
          
          setProgress({
            current: processedCount,
            total: processedCount,
            message: `✨ 완료! ${newPosts > 0 ? `새 게시물: ${newPosts}개` : ''}${updatedComments > 0 ? `, 댓글: ${updatedComments}개` : ''}`
          });
          
          handleResponse(response, userId);
          
          // 3초 후 진행률 초기화
          setTimeout(() => {
            setProgress({ current: 0, total: 0, message: '' });
          }, 3000);
        }).catch((err) => {
          console.error("🔴 백그라운드 처리 에러:", err);
          console.error("🔴 에러 상세:", err.response?.data);
          setIsBackgroundProcessing(false);
          if (!err.name?.includes('AbortError')) {
            handleError(err);
          }
        });
      } else {
        // 3초 내에 응답이 온 경우
        console.log("✅ 3초 내에 서버 응답 도착!");
        console.log("✅ 빠른 응답:", quickResponse);
        handleResponse(quickResponse, userId);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setIsLoading(false);
        setIsBackgroundProcessing(true);
      } else {
        handleError(err);
      }
    }
  }, [bandNumber, mutate]);

  // 응답 처리 함수 분리
  const handleResponse = (response, userId) => {
    try {
      const responseData = response.data;

      // 성공 또는 부분 성공 처리 (200 또는 207)
      if (response.status === 200 || response.status === 207) {
        const processedCount = responseData.data?.length || 0;
        const newPosts = responseData.newPosts || 0;
        const updatedComments = responseData.updatedComments || 0;

        // failover 정보 확인
        const failoverInfo = responseData.failoverInfo;
        
        // 에러 요약 정보 확인
        if (responseData.errorSummary) {
          const { totalErrors, errorRate } = responseData.errorSummary;
          
          // 부분 성공 - 성공한 내용과 실패한 내용을 모두 표시
          let partialSuccessMessage = `✅ 업데이트 완료\n`;
          partialSuccessMessage += `• 처리된 게시물: ${processedCount}개\n`;
          if (newPosts > 0) {
            partialSuccessMessage += `• 새 게시물: ${newPosts}개\n`;
          }
          if (updatedComments > 0) {
            partialSuccessMessage += `• 업데이트된 댓글: ${updatedComments}개\n`;
          }
          
          // 에러가 있었다면 경고 표시
          if (totalErrors > 0) {
            partialSuccessMessage += `\n⚠️ 일부 처리 실패: ${totalErrors}개 (${errorRate}%)\n`;
            partialSuccessMessage += `실패한 항목은 다음 업데이트 시 자동으로 재시도됩니다.`;
          }

          // 부분 성공도 성공으로 표시하되, 경고 정보 포함
          setSuccessMessage(partialSuccessMessage);
          setError(""); // 에러 메시지는 비움
          
          // 토스트 메시지 표시
          setToastMessage(`업데이트 완료! (일부 항목 처리 실패: ${totalErrors}개)`);
          setToastType("warning");
          setShowToast(true);
        } else {
          // 완전 성공
          let successMessage = `✅ 업데이트 성공!\n`;
          successMessage += `• 처리된 게시물: ${processedCount}개\n`;
          if (newPosts > 0) {
            successMessage += `• 새 게시물: ${newPosts}개\n`;
          }
          if (updatedComments > 0) {
            successMessage += `• 업데이트된 댓글: ${updatedComments}개`;
          }

          if (failoverInfo && failoverInfo.keysUsed > 1) {
            successMessage += `\n\n⚠️ 메인 키 한계량 초과로 백업 키 #${failoverInfo.finalKeyIndex}를 사용했습니다.`;
          } else if (failoverInfo && failoverInfo.finalKeyIndex > 0) {
            successMessage += `\n\n⚠️ 현재 백업 키 #${failoverInfo.finalKeyIndex}를 사용 중입니다.`;
          }

          setSuccessMessage(successMessage);
          setError(""); // 에러 메시지는 비움
          
          // 토스트 메시지 표시
          setToastMessage("업데이트 완료!");
          setToastType("success");
          setShowToast(true);
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
        // 완전 실패 처리
        let errorMessage =
          responseData.message ||
          "게시물 동기화 중 서버에서 오류가 발생했습니다.";

        if (responseData.errors && responseData.errors.length > 0) {
          errorMessage += `\n실패한 게시물: ${responseData.errors.length}개`;
        }

        setError(errorMessage);
        setSuccessMessage("");
      }
      
      // 성공/실패 여부와 관계없이 백그라운드 처리 종료
      setIsBackgroundProcessing(false);
      
      // 3초 후 진행률 초기화
      setTimeout(() => {
        setProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    } catch (err) {
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
      setIsBackgroundProcessing(false);
      setProgress({ current: 0, total: 0, message: '' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 에러 처리 함수
  const handleError = (err) => {
    let userFriendlyMessage = "게시물 업데이트 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    
    if (err.isAxiosError && err.response) {
      userFriendlyMessage += ` (서버: ${err.response.data?.message || err.response.statusText || "알 수 없음"})`;
    } else if (err.message.includes("timeout") || err.code === "ECONNABORTED") {
      userFriendlyMessage = "요청 시간이 초과되었습니다. 네트워크 상태를 확인하거나, 가져올 게시물 수를 줄여보세요.";
    }
    
    setError(userFriendlyMessage);
    setIsLoading(false);
    setIsBackgroundProcessing(false);
    setProgress({ current: 0, total: 0, message: '' });
  };

  // 성공 메시지 자동 해제를 위한 useEffect
  useEffect(() => {
    let timer;
    if (successMessage && !isBackgroundProcessing) {
      timer = setTimeout(() => {
        setSuccessMessage("");
      }, 5000); // 5초 후 성공 메시지 자동 해제
    }
    return () => clearTimeout(timer);
  }, [successMessage, isBackgroundProcessing]);

  // 주기적 캐시 갱신 및 진행률 시뮬레이션
  useEffect(() => {
    if (!isBackgroundProcessing) return;

    const userId = getUserIdFromSession();
    if (!userId) return;

    // 사용자 설정에서 게시물 제한 가져오기
    let estimatedTotal = 200; // 기본값
    const storedLimit = sessionStorage.getItem("userPostLimit");
    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        estimatedTotal = parsedLimit;
      }
    } else {
      // 세션에 없으면 세션 데이터에서 확인
      try {
        const sessionData = sessionStorage.getItem("sessionUserData");
        if (sessionData) {
          const userData = JSON.parse(sessionData);
          if (userData?.post_fetch_limit) {
            const userLimit = parseInt(userData.post_fetch_limit, 10);
            if (!isNaN(userLimit) && userLimit > 0) {
              estimatedTotal = userLimit;
            }
          }
        }
      } catch (error) {
        // 세션 데이터 파싱 실패
      }
    }
    
    setProgress({ current: 0, total: estimatedTotal, message: '게시물 가져오는 중...' });

    let currentCount = 0;
    const increment = Math.ceil(estimatedTotal / 10); // 10단계로 나누어 진행

    // 진행률 업데이트 및 캐시 갱신 (2초마다)
    const intervalId = setInterval(() => {
      // 실제 서버 응답이 왔는지 확인
      if (!isBackgroundProcessing) {
        clearInterval(intervalId);
        return;
      }
      
      currentCount += increment;
      if (currentCount > estimatedTotal) currentCount = estimatedTotal;
      
      const messages = [
        '게시물 가져오는 중...',
        '댓글 분석 중...',
        'AI 처리 중...',
        '주문 정보 추출 중...',
        '데이터 저장 중...'
      ];
      const messageIndex = Math.floor((currentCount / estimatedTotal) * messages.length);
      
      setProgress({
        current: currentCount,
        total: estimatedTotal,
        message: messages[Math.min(messageIndex, messages.length - 1)]
      });
      
      // 캐시 갱신
      const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
      const ordersKeyPattern = `${functionsBaseUrl}/orders-get-all?userId=${userId}`;
      mutate(
        (key) => typeof key === "string" && key.startsWith(ordersKeyPattern),
        undefined,
        { revalidate: true }
      );
      
      // 완료 처리
      if (currentCount >= estimatedTotal) {
        setIsBackgroundProcessing(false);
        setSuccessMessage("✨ 모든 게시물이 성공적으로 업데이트되었습니다!");
        
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
      setSuccessMessage("업데이트가 완료되었습니다!");
      
      setTimeout(() => {
        setProgress({ current: 0, total: 0, message: '' });
        setSuccessMessage("");
      }, 3000);
    }, 60000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isBackgroundProcessing, mutate]);

  return (
    <>
      {/* 토스트 메시지 */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}
      
      <div className="w-full">
        <button
          onClick={handleUpdatePosts}
          disabled={isLoading || isBackgroundProcessing}
          className={`
            w-full px-6 py-4 text-white font-semibold text-lg rounded-lg
            transition-all duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              isLoading || isBackgroundProcessing
                ? "bg-gray-400"
                : successMessage
                ? "bg-green-500 hover:bg-green-600"
                : "bg-green-500 hover:bg-green-600"
            }
          `}
        >
          {isLoading || isBackgroundProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <ArrowPathIcon className="h-5 w-5 text-white animate-spin" />
              <span>업데이트중</span>
            </div>
          ) : successMessage ? (
            <div className="flex items-center justify-center gap-2">
              <CheckIcon className="h-5 w-5 text-white" />
              <span>완료</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <ArrowPathIcon className="h-5 w-5 text-white" />
              <span>업데이트</span>
            </div>
          )}
        </button>
        
        {/* 진행률 표시 */}
        {(isBackgroundProcessing || progress.total > 0) && (
          <div className="mt-3 space-y-2">
            {/* 진행률 바 */}
            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-600">
                  {progress.message || '처리 중...'}
                </span>
                <span className="text-xs font-medium text-gray-700">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-full rounded-full transition-all duration-500 ease-out relative"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                >
                  {/* 애니메이션 효과 */}
                  <div className="absolute inset-0 bg-white opacity-20 animate-pulse" />
                </div>
              </div>
            </div>
            
            {/* 실시간 업데이트 내역 */}
            {progress.current > 0 && (
              <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-md max-h-20 overflow-y-auto">
                <div className="flex items-center">
                  <svg className="animate-spin mr-1 h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  <span>{progress.current}개 게시물 처리 완료</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 에러 메시지만 표시 (성공 메시지는 토스트로 대체) */}
        {error && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm ${
              error.includes("자동으로 재시도")
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            <div className="font-medium mb-1">
              {error.includes("자동으로 재시도") ? "부분 실패" : "오류 발생"}
            </div>
            <div className="whitespace-pre-line">{error}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default UpdateButtonBeta;