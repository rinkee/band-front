// UpdateButtonAuto.js - 자동으로 한가한 함수 찾아서 실행
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";
import { 
  getOptimalFunction, 
  markFunctionBusy, 
  markFunctionFree,
  getFunctionStatus 
} from "../../lib/band-router-auto";

const PostUpdaterAuto = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedFunction, setSelectedFunction] = useState("");
  const [functionStatus, setFunctionStatus] = useState({});
  const { mutate } = useSWRConfig();

  // 1초마다 함수 상태 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      setFunctionStatus(getFunctionStatus());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    // 🎯 자동으로 가장 한가한 함수 선택
    const functionName = getOptimalFunction();
    setSelectedFunction(functionName);
    
    // 함수를 사용 중으로 표시
    markFunctionBusy(functionName);
    
    const startTime = Date.now();

    try {
      // 세션 데이터 가져오기
      const sessionDataString = sessionStorage.getItem("userData");
      if (!sessionDataString) {
        throw new Error("로그인 정보가 필요합니다.");
      }
      
      const sessionUserData = JSON.parse(sessionDataString);
      const userId = sessionUserData?.userId;
      
      const bandsData = sessionStorage.getItem("bands");
      if (!bandsData) {
        throw new Error("밴드 정보를 찾을 수 없습니다.");
      }

      const bands = JSON.parse(bandsData);
      const selectedBand = bandNumber
        ? bands.find((b) => b.band_number === bandNumber)
        : bands[0];

      if (!selectedBand) {
        throw new Error("선택된 밴드를 찾을 수 없습니다.");
      }

      // 선택된 Edge Function 호출
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      console.log(`🚀 ${functionName} 호출 중...`);
      
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/${functionName}`,
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

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP 오류! 상태: ${response.status}`);
      }

      const responseData = await response.json();
      
      if (responseData.success) {
        setSuccessMessage(
          `✅ 업데이트 완료!
          🎯 사용된 함수: ${functionName}
          ⏱️ 처리 시간: ${(responseTime / 1000).toFixed(1)}초
          📊 수집된 게시물: ${responseData.totalPosts || 0}개
          💬 저장된 댓글: ${responseData.totalComments || 0}개`
        );
        
        await mutate("/api/posts");
        await mutate("/api/orders");
      }
      
    } catch (error) {
      console.error("오류:", error);
      setError(`오류: ${error.message}`);
    } finally {
      // 함수를 사용 가능으로 표시
      const responseTime = Date.now() - startTime;
      markFunctionFree(selectedFunction, responseTime);
      
      setIsLoading(false);
      setSelectedFunction("");
    }
  }, [bandNumber, mutate, selectedFunction]);

  return (
    <div className="space-y-4">
      {/* 함수 상태 모니터 */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        {Object.entries(functionStatus).map(([fn, status]) => (
          <div key={fn} className="p-2 bg-gray-100 rounded">
            <div className="font-semibold">{fn.replace('band-get-posts-', 'Function ')}</div>
            <div>{status.status}</div>
            <div className="text-xs text-gray-600">
              활성: {status.active} | 평균: {status.avgResponseTime}ms
            </div>
          </div>
        ))}
      </div>

      {/* 업데이트 버튼 */}
      <button
        onClick={handleUpdatePosts}
        disabled={isLoading}
        className={`px-6 py-3 rounded-lg font-medium transition-all ${
          isLoading
            ? "bg-gray-300 cursor-not-allowed opacity-50"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            처리 중... ({selectedFunction?.replace('band-get-posts-', '')})
          </span>
        ) : (
          "게시물 업데이트 (자동 선택)"
        )}
      </button>

      {/* 현재 선택된 함수 표시 */}
      {selectedFunction && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm">
          🎯 자동 선택: {selectedFunction}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <pre className="text-green-700 whitespace-pre-wrap">{successMessage}</pre>
        </div>
      )}
    </div>
  );
};

export default PostUpdaterAuto;