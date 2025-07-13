"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function BandApiKeyManager({ userId }) {
  const [bandKey, setBandKey] = useState(""); // 고정 Band Key
  const [mainAccessToken, setMainAccessToken] = useState("");
  const [backupAccessTokens, setBackupAccessTokens] = useState([]);
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
          "band_access_token, band_key, backup_band_keys, current_band_key_index"
        )
        .eq("user_id", userId)
        .single();

      if (error) throw error;

      setBandKey(data.band_key || "");
      setMainAccessToken(data.band_access_token || "");

      // backup_band_keys에서 access_token만 추출
      const backupKeys = data.backup_band_keys || [];
      const accessTokens = backupKeys.map((key) =>
        typeof key === "string" ? key : key.access_token || ""
      );
      setBackupAccessTokens(accessTokens);
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

      // Access Token 검증
      const validBackupTokens = backupAccessTokens.filter(
        (token) => token.trim() !== ""
      );

      if (validBackupTokens.length > 4) {
        throw new Error(
          "백업 Access Token은 최대 4개까지만 등록할 수 있습니다."
        );
      }

      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: mainAccessToken,
          band_key: bandKey,
          backup_band_keys: validBackupTokens,
          current_band_key_index: 0, // 저장 시 메인키로 리셋
        })
        .eq("user_id", userId);

      if (error) throw error;

      setSuccess("API 키가 성공적으로 저장되었습니다!");
      setCurrentKeyIndex(0);
    } catch (err) {
      setError("저장 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addBackupToken = () => {
    if (backupAccessTokens.length >= 4) {
      setError("백업 Access Token은 최대 4개까지만 추가할 수 있습니다.");
      return;
    }

    setBackupAccessTokens([...backupAccessTokens, ""]);
    setError("");
  };

  const removeBackupToken = (index) => {
    setBackupAccessTokens(backupAccessTokens.filter((_, i) => i !== index));
  };

  const updateBackupToken = (index, value) => {
    const updated = [...backupAccessTokens];
    updated[index] = value;
    setBackupAccessTokens(updated);
  };

  const resetCurrentKey = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const { error } = await supabase
        .from("users")
        .update({
          current_band_key_index: 0,
          last_key_switch_at: null,
        })
        .eq("user_id", userId);

      if (error) throw error;

      setCurrentKeyIndex(0);
      setSuccess("현재 사용 키가 메인키로 리셋되었습니다!");
    } catch (err) {
      setError("리셋 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {/* 현재 사용 중인 키 표시 */}
      <div
        className={`mb-6 p-4 rounded-lg border-2 ${
          currentKeyIndex === 0
            ? "bg-green-50 border-green-200"
            : "bg-yellow-50 border-yellow-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className={`font-semibold mb-2 ${
                currentKeyIndex === 0 ? "text-green-800" : "text-yellow-800"
              }`}
            >
              현재 사용 중인 키
            </h3>
            <p
              className={`text-sm ${
                currentKeyIndex === 0 ? "text-green-600" : "text-yellow-600"
              }`}
            >
              {currentKeyIndex === 0
                ? "✅ 메인 Access Token (정상)"
                : `⚠️ 백업 Access Token #${currentKeyIndex} (한계량 초과로 전환됨)`}
            </p>
          </div>
          {currentKeyIndex > 0 && (
            <button
              onClick={resetCurrentKey}
              disabled={saving}
              className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "처리 중..." : "메인키로 리셋"}
            </button>
          )}
        </div>
      </div>

      {/* Band Key (고정) */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">
          Band Key (공통)
        </h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Band Key (모든 Access Token이 공유)
          </label>
          <input
            type="text"
            value={bandKey}
            onChange={(e) => setBandKey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Band Key를 입력하세요 (예: AADlR1ebdBcadJk0v-It9wZj)"
          />
        </div>
      </div>

      {/* 메인 Access Token */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">
          메인 Access Token
        </h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Access Token
          </label>
          <input
            type="text"
            value={mainAccessToken}
            onChange={(e) => setMainAccessToken(e.target.value)}
            className="text-xs w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="메인 Access Token을 입력하세요"
          />
        </div>
      </div>

      {/* 백업 Access Token들 */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-700">
            백업 Access Token
          </h3>
          <button
            onClick={addBackupToken}
            disabled={backupAccessTokens.length >= 4}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            백업 토큰 추가 ({backupAccessTokens.length}/4)
          </button>
        </div>

        {backupAccessTokens.length === 0 ? (
          <p className="text-gray-500 text-center py-8 bg-gray-50 rounded">
            백업 Access Token이 없습니다. 메인 토큰 사용량 초과 시 자동으로
            전환할 백업 토큰을 추가해보세요.
          </p>
        ) : (
          <div className="space-y-3">
            {backupAccessTokens.map((token, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-700">
                    백업 Access Token {index + 1}
                  </h4>
                  <button
                    onClick={() => removeBackupToken(index)}
                    className="text-red-600 hover:text-red-800 font-medium"
                  >
                    삭제
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Access Token
                  </label>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => updateBackupToken(index, e.target.value)}
                    className="text-xs w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`백업 Access Token ${index + 1}을 입력하세요`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end mb-6">
        <button
          onClick={saveApiKeys}
          disabled={saving || !bandKey.trim() || !mainAccessToken.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "저장 중..." : "API 키 저장"}
        </button>
      </div>

      {/* 도움말 */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-700 mb-2">사용 방법</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Band Key는 모든 Access Token이 공유하는 고정 값입니다</li>
          <li>
            • 메인 Access Token 사용량 초과 시 자동으로 백업 토큰으로 전환됩니다
          </li>
          <li>• 백업 Access Token은 최대 4개까지 등록할 수 있습니다</li>
          <li>• 토큰 전환은 할당량 초과나 인증 오류 시에만 발생합니다</li>
          <li>• 네트워크 오류 등은 토큰을 전환하지 않습니다</li>
        </ul>
      </div>
    </div>
  );
}
