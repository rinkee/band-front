// UpdateButtonQueue.js - 동시 실행 방지로 성능 문제 해결
// 10분 만에 적용 가능한 가장 빠른 솔루션
"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

// 전역 큐 관리 (모든 UpdateButton 인스턴스가 공유)
let globalProcessingQueue = [];
let isGlobalProcessing = false;

const PostUpdaterQueue = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [queuePosition, setQueuePosition] = useState(0);
  const processingRef = useRef(false);

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

  // 큐 처리 함수
  const processQueue = async () => {
    if (isGlobalProcessing || globalProcessingQueue.length === 0) {
      return;
    }

    isGlobalProcessing = true;
    const { process, bandInfo } = globalProcessingQueue.shift();
    
    console.log(`🔄 처리 중: ${bandInfo.band_name} (대기 중: ${globalProcessingQueue.length}개)`);
    
    try {
      await process();
    } catch (error) {
      console.error("큐 처리 중 오류:", error);
    } finally {
      isGlobalProcessing = false;
      
      // 다음 항목 처리 (0.5초 간격으로)
      if (globalProcessingQueue.length > 0) {
        setTimeout(() => processQueue(), 500);
      }
    }
  };

  // 큐에 추가
  const addToQueue = (processFunc, bandInfo) => {
    return new Promise((resolve, reject) => {
      const wrappedProcess = async () => {
        try {
          const result = await processFunc();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      globalProcessingQueue.push({ 
        process: wrappedProcess, 
        bandInfo 
      });

      // 큐 위치 업데이트
      setQueuePosition(globalProcessingQueue.length);

      // 큐 처리 시작
      processQueue();
    });
  };

  const handleUpdatePosts = useCallback(async () => {
    if (processingRef.current) {
      setError("이미 처리 중입니다. 잠시만 기다려주세요.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setIsLoading(true);
    processingRef.current = true;

    const userId = getUserIdFromSession();
    if (!userId) {
      setIsLoading(false);
      processingRef.current = false;
      return;
    }

    try {
      const bandsData = sessionStorage.getItem("bands");
      if (!bandsData) {
        throw new Error("세션에서 밴드 정보를 찾을 수 없습니다.");
      }

      const bands = JSON.parse(bandsData);
      const selectedBand = bandNumber
        ? bands.find((b) => b.band_number === bandNumber)
        : bands[0];

      if (!selectedBand) {
        throw new Error("선택된 밴드를 찾을 수 없습니다.");
      }

      // 큐에 추가하고 처리 대기
      const result = await addToQueue(async () => {
        setQueuePosition(0); // 처리 시작
        
        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/band-get-posts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              band_key: selectedBand.band_key,
              nextOpenToken: selectedBand.nextOpenToken || "",
              userId: userId,
              bandInfo: {
                band_name: selectedBand.band_name,
                band_number: selectedBand.band_number,
                band_key: selectedBand.band_key,
              },
              timestamp: new Date().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP 오류! 상태: ${response.status}`
          );
        }

        return await response.json();
      }, selectedBand);

      if (result.success) {
        setSuccessMessage(
          `✅ 게시물 업데이트 완료!
          - 수집된 게시물: ${result.totalPosts || 0}개
          - 저장된 댓글: ${result.totalComments || 0}개
          - 예약된 댓글: ${result.pendingComments || 0}개`
        );
        
        // 캐시 갱신
        await mutate("/api/posts");
        await mutate("/api/orders");
      } else {
        throw new Error(result.error || "업데이트 실패");
      }
    } catch (error) {
      console.error("업데이트 중 오류 발생:", error);
      setError(`오류: ${error.message}`);
    } finally {
      setIsLoading(false);
      processingRef.current = false;
      setQueuePosition(0);
    }
  }, [bandNumber, mutate]);

  // 큐 상태 모니터링
  useEffect(() => {
    const interval = setInterval(() => {
      if (queuePosition > 0 && !processingRef.current) {
        // 현재 큐 위치 업데이트
        const currentPos = globalProcessingQueue.findIndex(
          item => item.bandInfo?.band_number === bandNumber
        );
        if (currentPos >= 0) {
          setQueuePosition(currentPos + 1);
        } else {
          setQueuePosition(0);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [queuePosition, bandNumber]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={handleUpdatePosts}
          disabled={isLoading}
          className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 
            ${
              isLoading
                ? "bg-gray-300 cursor-not-allowed opacity-50"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
            }`}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {queuePosition > 0 
                ? `대기 중... (${queuePosition}번째)`
                : "업데이트 중..."
              }
            </span>
          ) : (
            "게시물 업데이트"
          )}
        </button>
        
        {queuePosition > 0 && (
          <span className="text-sm text-gray-600 animate-pulse">
            🔄 대기열: {queuePosition}번째
          </span>
        )}
        
        {isGlobalProcessing && queuePosition === 0 && isLoading && (
          <span className="text-sm text-green-600">
            ⚡ 처리 중...
          </span>
        )}
      </div>

      {globalProcessingQueue.length > 0 && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          📋 전체 대기열: {globalProcessingQueue.length}개 밴드 대기 중
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <pre className="text-green-700 whitespace-pre-wrap">
            {successMessage}
          </pre>
        </div>
      )}
    </div>
  );
};

export default PostUpdaterQueue;