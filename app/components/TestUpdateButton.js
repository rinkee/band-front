"use client";

import React, { useState } from "react";
import supabase from "../lib/supabaseClient";
import { processBandPosts } from "../lib/updateButton/fuc/processBandPosts";

export default function TestUpdateButton({ onProcessingChange, onComplete }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTestUpdate = async () => {
    try {
      setIsProcessing(true);
      if (onProcessingChange) onProcessingChange(true, null);
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
        // 부모에게 완료 결과 전달
        if (onProcessingChange) onProcessingChange(false, response);
        if (onComplete) onComplete(response);
      } else {
        setError(response.message || "처리 중 오류가 발생했습니다.");
        if (onProcessingChange) onProcessingChange(false, null);
      }
    } catch (err) {
      console.error("TestUpdateButton 오류:", err);
      setError(err.message || "알 수 없는 오류가 발생했습니다.");
      if (onProcessingChange) onProcessingChange(false, null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
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
        "업데이트"
      )}
    </button>
  );
}
