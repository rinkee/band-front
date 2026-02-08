"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../lib/supabaseClient";
import {
  ArrowLeftIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const MAX_BACKUP_TOKENS = 4;

const parseSessionAuth = () => {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("userData");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const userId =
      parsed?.userId || parsed?.user_id || parsed?.id || parsed?.user?.userId;
    const token = typeof parsed?.token === "string" ? parsed.token.trim() : "";

    if (!userId || typeof userId !== "string") {
      return null;
    }

    return {
      userId: userId.trim(),
      token,
    };
  } catch {
    return null;
  }
};

const buildApiAuthHeaders = ({ includeContentType = true } = {}) => {
  const auth = parseSessionAuth();
  if (!auth?.userId) {
    throw new Error("인증 세션 정보가 없습니다.");
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${auth.token || auth.userId}`);
  headers.set("x-user-id", auth.userId);
  if (includeContentType) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
};

const createRowId = () =>
  `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toBackupRows = (backupTokens = []) =>
  backupTokens.map((item) => ({
    id: createRowId(),
    type: "existing",
    tokenId: item.token_id,
    label: item.masked_token,
    value: "",
  }));

export default function AdminBandKeysPage() {
  const router = useRouter();

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedUserId, setSelectedUserId] = useState("");
  const [keyData, setKeyData] = useState(null);
  const [backupRows, setBackupRows] = useState([]);
  const [currentBandKeyIndex, setCurrentBandKeyIndex] = useState(0);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase
        .from("users")
        .select("user_id, login_id, store_name, owner_name, is_active")
        .order("created_at", { ascending: false });

      if (loadError) {
        throw loadError;
      }

      setUsers(data || []);
    } catch (err) {
      setError(err.message || "사용자 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const checkAdminAuth = useCallback(async () => {
    setCheckingAuth(true);

    try {
      const auth = parseSessionAuth();
      if (!auth?.userId) {
        router.replace("/login");
        return;
      }

      const { data, error: roleError } = await supabase
        .from("users")
        .select("role")
        .eq("user_id", auth.userId)
        .single();

      if (roleError || !data) {
        router.replace("/dashboard");
        return;
      }

      if (data.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setIsAuthorized(true);
      await loadUsers();
    } catch (err) {
      setError(err.message || "관리자 권한 확인에 실패했습니다.");
      router.replace("/dashboard");
    } finally {
      setCheckingAuth(false);
    }
  }, [loadUsers, router]);

  useEffect(() => {
    checkAdminAuth();
  }, [checkAdminAuth]);

  const selectedUser = useMemo(
    () => users.find((user) => user.user_id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;

    const keyword = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const targets = [
        user.login_id,
        user.store_name,
        user.owner_name,
        user.user_id,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return targets.some((value) => value.includes(keyword));
    });
  }, [searchQuery, users]);

  const loadBandKeys = useCallback(async (targetUserId) => {
    if (!targetUserId) return;

    setLoadingKeys(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/band-keys?target_user_id=${encodeURIComponent(targetUserId)}`,
        {
          method: "GET",
          headers: buildApiAuthHeaders({ includeContentType: false }),
        }
      );

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.message || `키 정보를 불러오지 못했습니다. (HTTP ${response.status})`
        );
      }

      const payload = result?.data;
      setKeyData(payload);
      setBackupRows(toBackupRows(payload?.backup_tokens || []));
      setCurrentBandKeyIndex(payload?.key_status?.current_band_key_index ?? 0);
    } catch (err) {
      setError(err.message || "키 정보를 불러오지 못했습니다.");
      setKeyData(null);
      setBackupRows([]);
      setCurrentBandKeyIndex(0);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setKeyData(null);
      setBackupRows([]);
      setCurrentBandKeyIndex(0);
      return;
    }

    loadBandKeys(selectedUserId);
  }, [loadBandKeys, selectedUserId]);

  const handleAddBackupToken = () => {
    setError("");
    setNotice("");

    if (backupRows.length >= MAX_BACKUP_TOKENS) {
      setError(`백업 키는 최대 ${MAX_BACKUP_TOKENS}개까지 추가할 수 있습니다.`);
      return;
    }

    setBackupRows((prev) => [
      ...prev,
      {
        id: createRowId(),
        type: "new",
        tokenId: "",
        label: "",
        value: "",
      },
    ]);
  };

  const handleRemoveRow = (index) => {
    setError("");
    setNotice("");

    setBackupRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));

    setCurrentBandKeyIndex((prev) => {
      const nextMax = Math.max(0, backupRows.length - 1);
      if (prev > nextMax) return nextMax;
      return prev;
    });
  };

  const moveRow = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= backupRows.length) return;

    setBackupRows((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });

    setCurrentBandKeyIndex((prev) => {
      if (prev === index + 1) return targetIndex + 1;
      if (prev === targetIndex + 1) return index + 1;
      return prev;
    });
  };

  const updateNewTokenValue = (index, value) => {
    setBackupRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current || current.type !== "new") return prev;

      next[index] = {
        ...current,
        value,
      };

      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) {
      setError("대상 사용자를 선택해주세요.");
      return;
    }

    if (!keyData?.key_status?.has_main_token) {
      setError("메인 토큰이 없는 사용자는 백업키를 저장할 수 없습니다.");
      return;
    }

    if (backupRows.length > MAX_BACKUP_TOKENS) {
      setError(`백업 키는 최대 ${MAX_BACKUP_TOKENS}개까지 허용됩니다.`);
      return;
    }

    const payloadBackupTokens = [];

    for (const row of backupRows) {
      if (row.type === "existing") {
        payloadBackupTokens.push({ token_id: row.tokenId });
        continue;
      }

      const normalized = String(row.value || "").trim();
      if (!normalized) {
        setError("새로 추가한 백업 토큰은 비워둘 수 없습니다.");
        return;
      }

      payloadBackupTokens.push(normalized);
    }

    const maxAllowedIndex = backupRows.length;
    if (currentBandKeyIndex < 0 || currentBandKeyIndex > maxAllowedIndex) {
      setError(`현재 키 인덱스는 0~${maxAllowedIndex} 범위여야 합니다.`);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/band-keys", {
        method: "PATCH",
        headers: buildApiAuthHeaders({ includeContentType: true }),
        body: JSON.stringify({
          target_user_id: selectedUserId,
          backup_tokens: payloadBackupTokens,
          current_band_key_index: currentBandKeyIndex,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.message || `백업 키 저장에 실패했습니다. (HTTP ${response.status})`
        );
      }

      const payload = result?.data;
      setKeyData(payload);
      setBackupRows(toBackupRows(payload?.backup_tokens || []));
      setCurrentBandKeyIndex(payload?.key_status?.current_band_key_index ?? 0);
      setNotice("백업 키 구성이 저장되었습니다.");
    } catch (err) {
      setError(err.message || "백업 키 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-b-2 border-blue-600 animate-spin mx-auto" />
          <p className="mt-4 text-sm text-gray-600">권한 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              관리자 메뉴
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Band 백업키 관리</h1>
              <p className="text-sm text-gray-600">
                일반 설정 화면은 조회 전용이며, 백업키 주입은 이 페이지에서만 처리됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loadingUsers}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {loadingUsers ? "불러오는 중..." : "사용자 새로고침"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-1">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">대상 사용자 선택</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ID/상점명/사장명 검색"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <div className="mt-3 max-h-[520px] overflow-y-auto space-y-2 pr-1">
              {filteredUsers.map((user) => {
                const isSelected = selectedUserId === user.user_id;

                return (
                  <button
                    key={user.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(user.user_id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{user.login_id || "(ID 없음)"}</p>
                    <p className="text-xs text-gray-600">{user.store_name || "상점명 없음"}</p>
                    <p className="text-xs text-gray-500">{user.owner_name || "대표자명 없음"}</p>
                    <p className="text-[11px] mt-1 text-gray-500">
                      {user.is_active ? "활성 사용자" : "비활성 사용자"}
                    </p>
                  </button>
                );
              })}

              {!loadingUsers && filteredUsers.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">표시할 사용자가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
            {!selectedUserId && (
              <div className="h-full flex items-center justify-center text-center text-gray-500 py-12">
                <div>
                  <KeyIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">왼쪽에서 사용자 한 명을 선택해주세요.</p>
                </div>
              </div>
            )}

            {selectedUserId && loadingKeys && (
              <div className="py-12 text-center text-gray-600">
                <div className="h-8 w-8 rounded-full border-b-2 border-blue-600 animate-spin mx-auto" />
                <p className="mt-2 text-sm">키 정보를 불러오는 중...</p>
              </div>
            )}

            {selectedUserId && !loadingKeys && keyData && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h2 className="text-sm font-semibold text-gray-900">선택 사용자</h2>
                  <div className="mt-2 text-sm text-gray-700 space-y-1">
                    <p>ID: {keyData.login_id || selectedUser?.login_id || "-"}</p>
                    <p>상점: {keyData.store_name || selectedUser?.store_name || "-"}</p>
                    <p>대표자: {keyData.owner_name || selectedUser?.owner_name || "-"}</p>
                    <p className="font-mono text-xs text-gray-500">user_id: {keyData.target_user_id}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">메인 토큰 (마스킹)</p>
                    <p className="mt-1 font-mono text-sm text-gray-900 break-all">
                      {keyData.main_token_masked}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Band Key (마스킹)</p>
                    <p className="mt-1 font-mono text-sm text-gray-900 break-all">
                      {keyData.band_key_masked}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  <p>
                    총 키 수: <span className="font-semibold">{keyData.key_status.total_keys}</span>
                  </p>
                  <p>
                    백업 키 수: <span className="font-semibold">{keyData.key_status.backup_count}</span>
                  </p>
                  <p>
                    메인 토큰 상태: {keyData.key_status.has_main_token ? "설정됨" : "미설정"}
                  </p>
                </div>

                {!keyData.key_status.has_main_token && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    메인 토큰이 없어 백업키 저장이 비활성화됩니다. 메인 토큰은 별도 관리자 절차로 먼저 설정해야 합니다.
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">백업 키 순서</h3>
                    <button
                      type="button"
                      onClick={handleAddBackupToken}
                      disabled={backupRows.length >= MAX_BACKUP_TOKENS}
                      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      백업 키 추가
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {backupRows.map((row, index) => (
                      <div
                        key={row.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 text-xs font-semibold flex items-center justify-center">
                            {index + 1}
                          </div>

                          <div className="flex-1">
                            {row.type === "existing" ? (
                              <div>
                                <p className="font-mono text-sm text-gray-900 break-all">{row.label}</p>
                                <p className="text-[11px] text-gray-500">기존 등록 키</p>
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={row.value}
                                onChange={(event) =>
                                  updateNewTokenValue(index, event.target.value)
                                }
                                placeholder="새 백업 토큰 입력"
                                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveRow(index, -1)}
                              disabled={index === 0}
                              className="rounded-md border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="위로 이동"
                            >
                              <ArrowUpIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRow(index, 1)}
                              disabled={index === backupRows.length - 1}
                              className="rounded-md border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="아래로 이동"
                            >
                              <ArrowDownIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="rounded-md border border-rose-300 bg-white p-1 text-rose-600 hover:bg-rose-50"
                              aria-label="삭제"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {backupRows.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        등록된 백업 키가 없습니다.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-800 mb-2">
                    현재 활성 키 인덱스
                  </label>
                  <select
                    value={currentBandKeyIndex}
                    onChange={(event) =>
                      setCurrentBandKeyIndex(Number.parseInt(event.target.value, 10) || 0)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={0}>0 - 메인 키</option>
                    {backupRows.map((row, index) => (
                      <option key={row.id} value={index + 1}>
                        {index + 1} - 백업 키 #{index + 1}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !keyData.key_status.has_main_token}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? (
                      "저장 중..."
                    ) : (
                      <>
                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                        백업 키 저장
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadBandKeys(selectedUserId)}
                    disabled={loadingKeys}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    다시 불러오기
                  </button>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <p>
                    기존 키는 마스킹으로만 표시됩니다. 순서 변경/삭제는 가능하며, 새 키는 입력 후 저장하면 반영됩니다.
                  </p>
                  <p className="mt-1">
                    저장 시 `band_access_tokens`와 `backup_band_keys`를 동시에 갱신해 기존 처리 경로와 호환됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
