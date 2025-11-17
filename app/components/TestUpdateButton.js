"use client";

import React, { useState } from "react";
import supabase from "../lib/supabaseClient";
import { processBandPosts } from "../lib/updateButton/fuc/processBandPosts";

export default function TestUpdateButton() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTestUpdate = async () => {
    try {
      setIsProcessing(true);
      setResult(null);
      setError(null);

      // 사용자 정보 가져오기
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) {
        throw new Error("사용자 정보를 찾을 수 없습니다. 로그인이 필요합니다.");
      }

      const userData = JSON.parse(sessionData);
      const userId = userData.userId;

      if (!userId) {
        throw new Error("유효한 사용자 ID를 찾을 수 없습니다.");
      }

      console.log(`TestUpdateButton: processBandPosts 호출 시작 (userId: ${userId})`);

      // processBandPosts 함수 호출
      const response = await processBandPosts(supabase, userId, {
        testMode: false, // 실제 DB에 저장
        processingLimit: 10, // 최대 10개 게시물만 처리
        processWithAI: true,
        simulateQuotaError: false
      });

      console.log("TestUpdateButton: processBandPosts 결과:", response);

      if (response.success) {
        setResult(response);
      } else {
        setError(response.message || "처리 중 오류가 발생했습니다.");
      }
    } catch (err) {
      console.error("TestUpdateButton 오류:", err);
      setError(err.message || "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleTestUpdate}
        disabled={isProcessing}
        className={`
          px-4 py-2 rounded-lg font-medium text-white transition-colors
          ${
            isProcessing
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }
        `}
      >
        {isProcessing ? (
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>처리 중...</span>
          </div>
        ) : (
          "테스트 업데이트"
        )}
      </button>

      {/* 결과 표시 */}
      {result && (
        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <div className="font-medium text-green-800 mb-1">✅ 처리 완료</div>
          <div className="text-green-700">
            <div>전체: {result.stats?.total || 0}개</div>
            <div>성공: {result.stats?.success || 0}개</div>
            <div>실패: {result.stats?.errors || 0}개</div>
          </div>
        </div>
      )}

      {/* 오류 표시 */}
      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <div className="font-medium text-red-800 mb-1">❌ 오류 발생</div>
          <div className="text-red-700">{error}</div>
        </div>
      )}
    </div>
  );
}
