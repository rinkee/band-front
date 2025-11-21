"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function BandApiKeyManager({ userId }) {
  const [bandKey, setBandKey] = useState(""); // 고정 Band Key
  const [accessTokens, setAccessTokens] = useState(["", "", "", "", ""]); // 최대 5개의 슬롯
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 컴포넌트 마운트 시 기존 키 정보 로드
  useEffect(() => {
    if (userId) {
      loadApiKeys();
    }
  }, [userId]);

  const loadApiKeys = async () => {
    if (!userId) {
      setError("사용자 ID가 없습니다.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("users")
        .select(
          "band_access_token, band_access_tokens, band_key, backup_band_keys, current_band_key_index"
        )
        .eq("user_id", userId)
        .single();

      if (error) throw error;

      setBandKey(data.band_key || "");

      // band_access_tokens 배열을 우선 사용, 없으면 기존 필드 폴백
      let tokens = [];
      if (Array.isArray(data.band_access_tokens) && data.band_access_tokens.length > 0) {
        tokens = data.band_access_tokens;
      } else if (data.backup_band_keys && Array.isArray(data.backup_band_keys)) {
        tokens = data.backup_band_keys;
      } else if (data.band_access_token) {
        // 백업 키가 없으면 기존 메인 토큰을 첫 번째로 사용
        tokens = [data.band_access_token];
      }

      // 최대 5개 슬롯으로 패딩
      const paddedTokens = [...tokens];
      while (paddedTokens.length < 5) {
        paddedTokens.push("");
      }
      setAccessTokens(paddedTokens.slice(0, 5));

      setCurrentKeyIndex(data.current_band_key_index || 0);
    } catch (err) {
      setError("키 정보를 불러오는 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveApiKeys = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // 유효한 토큰만 필터링
      const validTokens = accessTokens.filter((token) => token.trim() !== "");

      if (validTokens.length === 0) {
        throw new Error("최소 1개의 Access Token을 입력해야 합니다.");
      }

      // 현재 키 인덱스가 유효한 범위에 있는지 확인
      const safeCurrentIndex =
        currentKeyIndex >= validTokens.length ? 0 : currentKeyIndex;

      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: validTokens[safeCurrentIndex], // 현재 활성 토큰
          band_key: bandKey,
          band_access_tokens: validTokens, // band_access_tokens만 사용
          backup_band_keys: null, // 구 필드는 비워서 중복 저장 방지
          current_band_key_index: safeCurrentIndex,
        })
        .eq("user_id", userId);

      if (error) throw error;

      setSuccess("API 키가 성공적으로 저장되었습니다!");
      setCurrentKeyIndex(safeCurrentIndex);
    } catch (err) {
      setError("저장 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAccessToken = (index, value) => {
    const newTokens = [...accessTokens];
    newTokens[index] = value;
    setAccessTokens(newTokens);
  };

  const clearAccessToken = (index) => {
    const newTokens = [...accessTokens];
    newTokens[index] = "";
    setAccessTokens(newTokens);
  };

  const resetCurrentKey = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const validTokens = accessTokens.filter((token) => token.trim() !== "");
      if (validTokens.length === 0) {
        throw new Error("유효한 토큰이 없습니다.");
      }

      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: validTokens[0], // 첫 번째 토큰으로 리셋
          current_band_key_index: 0,
          last_key_switch_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;

      setSuccess("현재 키가 첫 번째 토큰으로 리셋되었습니다!");
      setCurrentKeyIndex(0);
    } catch (err) {
      setError("리셋 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getTokenStatus = (index) => {
    const token = accessTokens[index];
    if (!token.trim()) return "empty";
    if (index === currentKeyIndex) return "active";
    return "standby";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "border-green-500 bg-green-50";
      case "standby":
        return "border-blue-500 bg-blue-50";
      default:
        return "border-gray-300 bg-gray-50";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "active":
        return "현재 사용 중";
      case "standby":
        return "대기 중";
      default:
        return "미등록";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Band API 키 관리
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Band API 키 관리
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <XMarkIcon className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckIcon className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Band Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Band Key (공통)
          </label>
          <input
            type="text"
            value={bandKey}
            onChange={(e) => setBandKey(e.target.value)}
            placeholder="Band Key를 입력하세요"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Access Tokens */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Access Token 목록 (최대 5개)
          </label>
          <div className="space-y-3">
            {accessTokens.map((token, index) => {
              const status = getTokenStatus(index);
              return (
                <div key={index} className="relative">
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={token}
                        onChange={(e) =>
                          updateAccessToken(index, e.target.value)
                        }
                        placeholder={`Access Token ${index + 1}`}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${getStatusColor(
                          status
                        )}`}
                      />
                    </div>
                    <div className="flex-shrink-0 w-20 text-xs">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          status === "active"
                            ? "bg-green-100 text-green-800"
                            : status === "standby"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {getStatusText(status)}
                      </span>
                    </div>
                    {token.trim() && (
                      <button
                        onClick={() => clearAccessToken(index)}
                        className="flex-shrink-0 p-1 text-red-500 hover:text-red-700"
                        title="토큰 삭제"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 현재 키 정보 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            현재 키 상태
          </h4>
          <div className="text-sm text-gray-600">
            <div>
              현재 사용 중인 키:{" "}
              <span className="font-mono">{currentKeyIndex + 1}번</span>
            </div>
            <div>
              등록된 키 개수:{" "}
              <span className="font-mono">
                {accessTokens.filter((t) => t.trim()).length}개
              </span>
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex space-x-3">
          <button
            onClick={saveApiKeys}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                저장 중...
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4 mr-2" />
                저장
              </>
            )}
          </button>

          <button
            onClick={resetCurrentKey}
            disabled={saving}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            1번키로 리셋
          </button>
        </div>

        {/* 사용 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">사용 안내</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• 최대 5개의 Access Token을 등록할 수 있습니다</li>
            <li>• 할당량 초과 시 자동으로 다음 토큰으로 전환됩니다</li>
            <li>• 마지막 토큰 실패 시 첫 번째 토큰으로 순환합니다</li>
            <li>• 현재 사용 중인 토큰은 초록색으로 표시됩니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
