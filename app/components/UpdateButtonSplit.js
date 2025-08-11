// UpdateButtonSplit.js - 분산 Edge Function 사용
"use client";
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";
import { getEdgeFunctionForBand, getBandGroup } from "../../lib/band-router";

const PostUpdaterSplit = ({ bandNumber = null }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [groupInfo, setGroupInfo] = useState("");

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
    // 초기 로드 시 로그인 상태 확인
    getUserIdFromSession();
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

      // 밴드에 따른 Edge Function 선택
      const edgeFunctionName = getEdgeFunctionForBand(selectedBand.band_key);
      const group = getBandGroup(selectedBand.band_key);
      
      setFunctionName(edgeFunctionName);
      setGroupInfo(group);

      // 분산된 Edge Function 호출
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/${edgeFunctionName}`,
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

      const responseData = await response.json();
      
      if (responseData.success) {
        setSuccessMessage(
          `✅ 게시물 업데이트 완료! (${group} - ${edgeFunctionName})
          - 수집된 게시물: ${responseData.totalPosts || 0}개
          - 저장된 댓글: ${responseData.totalComments || 0}개
          - 예약된 댓글: ${responseData.pendingComments || 0}개`
        );
        
        // 캐시 갱신
        await mutate("/api/posts");
        await mutate("/api/orders");
      } else {
        throw new Error(responseData.error || "업데이트 실패");
      }
    } catch (error) {
      console.error("업데이트 중 오류 발생:", error);
      setError(`오류: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [bandNumber, mutate]);

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
              업데이트 중...
            </span>
          ) : (
            "게시물 업데이트 (분산)"
          )}
        </button>
        
        {groupInfo && (
          <span className="text-sm text-gray-600">
            현재 서버: {groupInfo}
          </span>
        )}
      </div>

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

export default PostUpdaterSplit;