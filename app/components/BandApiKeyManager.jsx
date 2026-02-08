"use client";

import { useMemo } from "react";
import { EyeSlashIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

const MASK_PREFIX_LENGTH = 8;

const normalizeToken = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const extractTokenFromEntry = (entry) => {
  if (typeof entry === "string") {
    return normalizeToken(entry);
  }

  if (!entry || typeof entry !== "object") {
    return "";
  }

  if (typeof entry.access_token === "string") {
    return normalizeToken(entry.access_token);
  }

  if (typeof entry.token === "string") {
    return normalizeToken(entry.token);
  }

  return "";
};

const normalizeTokenArray = (value) => {
  if (!Array.isArray(value)) return [];

  const dedupe = new Set();
  const result = [];

  for (const entry of value) {
    const token = extractTokenFromEntry(entry);
    if (!token || dedupe.has(token)) continue;
    dedupe.add(token);
    result.push(token);
  }

  return result;
};

const maskSecret = (value) => {
  const token = normalizeToken(value);
  if (!token) return "미설정";

  const prefix = token.slice(0, MASK_PREFIX_LENGTH);
  const starLength = Math.max(4, token.length - MASK_PREFIX_LENGTH);
  return `${prefix}${"*".repeat(starLength)}`;
};

const toDisplayModel = (rawUserData) => {
  const user = rawUserData?.data || rawUserData || {};

  const mainToken = normalizeToken(user.band_access_token);
  const fromBandAccessTokens = normalizeTokenArray(user.band_access_tokens);
  const fromLegacyBackup = normalizeTokenArray(user.backup_band_keys);

  const allTokens = [];
  const seen = new Set();

  const pushToken = (token) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    allTokens.push(token);
  };

  pushToken(mainToken);
  fromBandAccessTokens.forEach(pushToken);
  fromLegacyBackup.forEach(pushToken);

  const requestedIndex = Number.parseInt(user.current_band_key_index, 10);
  const maxIndex = Math.max(0, allTokens.length - 1);
  const currentIndex = Number.isInteger(requestedIndex)
    ? Math.min(Math.max(requestedIndex, 0), maxIndex)
    : 0;

  return {
    hasData: Object.keys(user).length > 0,
    mainTokenMasked: maskSecret(allTokens[0] || ""),
    bandKeyMasked: maskSecret(user.band_key || ""),
    totalKeys: allTokens.length,
    backupKeyCount: Math.max(0, allTokens.length - 1),
    currentKeyIndex: currentIndex,
  };
};

export default function BandApiKeyManager({ userData }) {
  const display = useMemo(() => toDisplayModel(userData), [userData]);

  if (!display.hasData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Band API 키 상태</h3>
        <p className="mt-3 text-sm text-gray-500">사용자 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Band API 키 상태</h3>
          <p className="mt-1 text-sm text-gray-600">
            보안 정책에 따라 설정 페이지에서는 마스킹된 값만 조회할 수 있습니다.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheckIcon className="h-4 w-4 mr-1" />
          조회 전용
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">메인 Access Token (마스킹)</p>
          <p className="mt-1 font-mono text-sm text-gray-900 break-all">
            {display.mainTokenMasked}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Band Key (마스킹)</p>
          <p className="mt-1 font-mono text-sm text-gray-900 break-all">
            {display.bandKeyMasked}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 space-y-1">
        <p>
          현재 활성 키 인덱스: <span className="font-semibold">{display.currentKeyIndex}</span>
        </p>
        <p>
          총 등록 키 수: <span className="font-semibold">{display.totalKeys}</span>
        </p>
        <p>
          백업 키 수: <span className="font-semibold">{display.backupKeyCount}</span>
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <p className="inline-flex items-center">
          <EyeSlashIcon className="h-4 w-4 mr-1" />
          이 화면에서는 키 상태 확인만 가능합니다.
        </p>
      </div>
    </div>
  );
}
