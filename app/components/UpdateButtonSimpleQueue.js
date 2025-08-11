// UpdateButtonSimpleQueue.js - 가장 간단한 대기 시스템
// "한 번에 하나씩만" - 10분 만에 문제 해결
"use client";
import React, { useState, useCallback } from "react";
import { useSWRConfig } from "swr";

// ⭐ 핵심: 전역 대기 시스템 (모든 버튼이 공유)
let isAnybodyWorking = false;  // 누군가 작업 중인가?
const waitingLine = [];         // 대기줄

const PostUpdaterSimpleQueue = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [waitingPosition, setWaitingPosition] = useState(0);
  const { mutate } = useSWRConfig();

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      // 🔑 핵심 로직: 대기 시스템
      if (isAnybodyWorking) {
        // 누군가 작업 중이면 줄 서서 대기
        setWaitingPosition(waitingLine.length + 1);
        
        await new Promise((resolve) => {
          waitingLine.push(resolve);
        });
        
        setWaitingPosition(0);
      }
      
      // 내 차례! 작업 시작
      isAnybodyWorking = true;
      
      // === 기존 코드 그대로 시작 ===
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

      // Edge Function 호출
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
        throw new Error(errorData.error || `HTTP 오류! 상태: ${response.status}`);
      }

      const responseData = await response.json();
      // === 기존 코드 끝 ===
      
      if (responseData.success) {
        setSuccessMessage(
          `✅ 업데이트 완료!
          - 게시물: ${responseData.totalPosts || 0}개
          - 댓글: ${responseData.totalComments || 0}개`
        );
        
        await mutate("/api/posts");
        await mutate("/api/orders");
      }
      
    } catch (error) {
      console.error("오류:", error);
      setError(`오류: ${error.message}`);
    } finally {
      // 🔑 작업 끝! 다음 사람 처리
      isAnybodyWorking = false;
      setIsLoading(false);
      
      // 대기줄에 다음 사람 있으면 0.5초 후 시작
      if (waitingLine.length > 0) {
        setTimeout(() => {
          const nextPerson = waitingLine.shift();
          nextPerson();  // 다음 사람 깨우기
        }, 500);
      }
    }
  }, [bandNumber, mutate]);

  return (
    <div className="space-y-4">
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
            {waitingPosition > 0 ? `대기 중... (${waitingPosition}번째)` : "업데이트 중..."}
          </span>
        ) : (
          "게시물 업데이트"
        )}
      </button>

      {waitingPosition > 0 && (
        <div className="text-sm text-blue-600">
          🔄 현재 {waitingPosition}번째 대기 중입니다...
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

export default PostUpdaterSimpleQueue;