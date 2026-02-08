"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const numberFormatter = new Intl.NumberFormat("ko-KR");

const PERIODS = [
  { id: "today", label: "오늘", dotClass: "bg-sky-500" },
  { id: "thisWeek", label: "이번 주", dotClass: "bg-emerald-500" },
  { id: "thisMonth", label: "이번 달", dotClass: "bg-amber-500" },
  { id: "total", label: "누적", dotClass: "bg-slate-500" },
];

const QUOTA_GUIDE = [
  {
    code: "1001",
    title: "App Quota Exceeded",
    description: "앱 전체 할당량 초과",
  },
  {
    code: "1002",
    title: "User Quota Exceeded",
    description: "사용자별 할당량 초과",
  },
  {
    code: "1003",
    title: "Cool Down Time",
    description: "연속 호출 제한",
  },
];

const INITIAL_FAILURE_VISIBLE_COUNT = 2;
const INITIAL_SESSION_VISIBLE_COUNT = 3;

const createInitialUsageStats = () => ({
  today: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
  thisWeek: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
  thisMonth: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
  total: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
});

const getErrorDescription = (errorType) => {
  const descriptions = {
    quota_exceeded: "할당량 초과 (1001/1002)",
    invalid_token: "유효하지 않은 토큰 (10401)",
    network_error: "네트워크 오류",
    forbidden: "접근 권한 없음 (10403)",
    unknown_error: "알 수 없는 오류",
    unknown: "알 수 없는 오류",
  };
  return descriptions[errorType] || errorType;
};

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekStartDateKey = (baseDate) => {
  const date = new Date(baseDate);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toLocalDateKey(date);
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value) => numberFormatter.format(toNumber(value));

const formatDateTime = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (startedAt, endedAt) => {
  if (!startedAt || !endedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "-";
  const diffMs = Math.max(0, end - start);
  if (diffMs < 60000) return "1분 미만";
  return `${Math.round(diffMs / 60000)}분`;
};

const getSessionStatusLabel = (session) => {
  if (session?.success) return "성공";
  return "실패";
};

const getSessionStatusClass = (session) => {
  if (session?.success) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  return "bg-rose-50 text-rose-700 border border-rose-200";
};

export default function BandApiUsageStats({ userId }) {
  const [usageStats, setUsageStats] = useState(createInitialUsageStats());
  const [recentSessions, setRecentSessions] = useState([]);
  const [recentFailures, setRecentFailures] = useState([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllFailures, setShowAllFailures] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [currentKeyStatus, setCurrentKeyStatus] = useState({
    currentIndex: 0,
    lastSwitchAt: null,
    totalKeys: 1,
    hasFailover: false,
  });

  const loadUsageStats = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError("");

      try {
        const today = new Date();
        const todayKey = toLocalDateKey(today);
        const weekStartKey = getWeekStartDateKey(today);
        const monthStartKey = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-01`;

        const [sessionResult, keyStatusResult, errorResult] = await Promise.all([
          supabase
            .from("band_api_sessions")
            .select(
              "session_id, started_at, ended_at, total_posts_fetched, total_comments_fetched, total_api_calls, keys_used, final_key_index, success, error_summary"
            )
            .eq("user_id", userId)
            .order("started_at", { ascending: false })
            .limit(100),
          supabase
            .from("users")
            .select(
              "current_band_key_index, last_key_switch_at, backup_band_keys"
            )
            .eq("user_id", userId)
            .single(),
          supabase
            .from("band_api_usage_logs")
            .select(
              "error_type, error_message, action_type, created_at, api_calls_made, session_id, api_key_index"
            )
            .eq("user_id", userId)
            .eq("success", false)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        if (sessionResult.error) {
          throw sessionResult.error;
        }

        const sessions = sessionResult.data || [];
        const stats = createInitialUsageStats();

        sessions.forEach((session) => {
          if (!session?.started_at) return;

          const started = new Date(session.started_at);
          if (Number.isNaN(started.getTime())) return;

          const sessionDateKey = toLocalDateKey(started);
          const posts = toNumber(session.total_posts_fetched);
          const comments = toNumber(session.total_comments_fetched);
          const apiCalls = toNumber(session.total_api_calls);

          stats.total.posts += posts;
          stats.total.comments += comments;
          stats.total.apiCalls += apiCalls;
          stats.total.sessions += 1;

          if (sessionDateKey >= monthStartKey) {
            stats.thisMonth.posts += posts;
            stats.thisMonth.comments += comments;
            stats.thisMonth.apiCalls += apiCalls;
            stats.thisMonth.sessions += 1;
          }

          if (sessionDateKey >= weekStartKey) {
            stats.thisWeek.posts += posts;
            stats.thisWeek.comments += comments;
            stats.thisWeek.apiCalls += apiCalls;
            stats.thisWeek.sessions += 1;
          }

          if (sessionDateKey === todayKey) {
            stats.today.posts += posts;
            stats.today.comments += comments;
            stats.today.apiCalls += apiCalls;
            stats.today.sessions += 1;
          }
        });

        setUsageStats(stats);
        setRecentSessions(sessions.slice(0, 20));

        if (!keyStatusResult.error && keyStatusResult.data) {
          const backupKeysCount = Array.isArray(
            keyStatusResult.data.backup_band_keys
          )
            ? keyStatusResult.data.backup_band_keys.length
            : 0;
          const currentIndex = toNumber(keyStatusResult.data.current_band_key_index);

          setCurrentKeyStatus({
            currentIndex,
            lastSwitchAt: keyStatusResult.data.last_key_switch_at,
            totalKeys: 1 + backupKeysCount,
            hasFailover: currentIndex > 0,
          });
        }

        if (!errorResult.error && errorResult.data) {
          const failures = errorResult.data.map((row, index) => ({
            id: `${row.session_id || "session"}-${row.created_at || index}-${index}`,
            created_at: row.created_at,
            error_type: row.error_type || "unknown_error",
            error_message: row.error_message || "",
            action_type: row.action_type || "unknown",
            api_calls_made: Math.max(1, toNumber(row.api_calls_made)),
            session_id: row.session_id || "",
            api_key_index: toNumber(row.api_key_index),
          }));
          setRecentFailures(failures);
        } else {
          setRecentFailures([]);
        }

        setLastUpdatedAt(new Date());
      } catch (error) {
        console.error("Band API 사용량 통계 로딩 실패:", error);
        setLoadError("통계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    loadUsageStats();
  }, [userId, loadUsageStats]);

  useEffect(() => {
    setShowAllFailures(false);
  }, [recentFailures.length]);

  useEffect(() => {
    setShowAllSessions(false);
  }, [recentSessions.length]);

  const totalErrorCalls = useMemo(
    () =>
      recentFailures.reduce(
        (sum, item) => sum + Math.max(1, toNumber(item.api_calls_made)),
        0
      ),
    [recentFailures]
  );

  const keyStatusText =
    currentKeyStatus.currentIndex === 0
      ? "메인 키 사용 중"
      : `백업 키 #${currentKeyStatus.currentIndex} 사용 중`;

  const visibleFailures = showAllFailures
    ? recentFailures
    : recentFailures.slice(0, INITIAL_FAILURE_VISIBLE_COUNT);

  const visibleSessions = showAllSessions
    ? recentSessions
    : recentSessions.slice(0, INITIAL_SESSION_VISIBLE_COUNT);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 rounded-xl border border-gray-200 bg-gray-50 animate-pulse"
            />
          ))}
        </div>
        <div className="h-56 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Band API 사용량 통계
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              총 시도 수(세션 집계), 키 상태, 실패 유형을 한 화면에서 확인할 수
              있습니다.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              성공 상세 로그는 저장하지 않으며, 시도 수는 세션 기준으로 계산됩니다.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              마지막 갱신: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadUsageStats({ silent: true })}
            disabled={refreshing}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "새로고침 중..." : "새로고침"}
          </button>
        </div>
        {loadError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {loadError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500">
                키 상태
              </p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {keyStatusText}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                총 {formatNumber(currentKeyStatus.totalKeys)}개 키 구성
              </p>
              <p className="mt-1 text-sm text-gray-600">
                최근 전환: {formatDateTime(currentKeyStatus.lastSwitchAt)}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                currentKeyStatus.hasFailover
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
            >
              {currentKeyStatus.hasFailover ? "백업 키 사용" : "정상"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium tracking-wide text-gray-500">
            실행 요약
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">누적 총 시도 수 (세션)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatNumber(usageStats.total.apiCalls)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">최근 실패 시도</p>
              <p className="mt-1 text-lg font-semibold text-rose-700">
                {formatNumber(totalErrorCalls)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">누적 처리 게시물</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatNumber(usageStats.total.posts)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">누적 세션</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatNumber(usageStats.total.sessions)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {PERIODS.map((period) => {
          const data = usageStats[period.id];
          return (
            <div
              key={period.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${period.dotClass}`} />
                <p className="text-sm font-semibold text-gray-900">{period.label}</p>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">총 시도 수</span>
                  <span className="font-semibold text-gray-900">
                    {formatNumber(data.apiCalls)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">게시물</span>
                  <span className="font-medium text-gray-800">
                    {formatNumber(data.posts)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">댓글</span>
                  <span className="font-medium text-gray-800">
                    {formatNumber(data.comments)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">세션</span>
                  <span className="font-medium text-gray-800">
                    {formatNumber(data.sessions)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">최근 세션</h4>
            <p className="text-xs text-gray-500">
              기본 {INITIAL_SESSION_VISIBLE_COUNT}개
            </p>
          </div>

          {recentSessions.length === 0 ? (
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              세션 기록이 없습니다.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {visibleSessions.map((session, index) => {
                const rawErrorSummary = session.error_summary || "";
                const shortErrorSummary =
                  rawErrorSummary.length > 90
                    ? `${rawErrorSummary.slice(0, 90)}...`
                    : rawErrorSummary;

                return (
                  <div
                    key={session.session_id || `${session.started_at}-${index}`}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatDateTime(session.started_at)}
                        </p>
                        <p className="text-xs text-gray-500">
                          소요 {formatDuration(session.started_at, session.ended_at)}
                          <span className="mx-1">·</span>
                          키 {formatNumber(session.keys_used)}개
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getSessionStatusClass(
                          session
                        )}`}
                      >
                        {getSessionStatusLabel(session)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-700">
                      시도 {formatNumber(session.total_api_calls)}
                      <span className="mx-1">·</span>
                      게시물 {formatNumber(session.total_posts_fetched)}
                      <span className="mx-1">·</span>
                      댓글 {formatNumber(session.total_comments_fetched)}
                    </p>
                    {!session.success && shortErrorSummary && (
                      <p
                        className="mt-1 text-xs text-rose-700"
                        title={rawErrorSummary}
                      >
                        오류: {shortErrorSummary}
                      </p>
                    )}
                  </div>
                );
              })}
              {recentSessions.length > INITIAL_SESSION_VISIBLE_COUNT && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllSessions((prev) => !prev)}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {showAllSessions
                      ? "접기"
                      : `더보기 (${recentSessions.length - INITIAL_SESSION_VISIBLE_COUNT}개 더)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h4 className="text-base font-semibold text-gray-900">최근 실패 이벤트</h4>
          {recentFailures.length === 0 ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              최근 실패 로그가 없습니다.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleFailures.map((item) => {
                const shortSessionId = item.session_id
                  ? item.session_id.slice(0, 16)
                  : "-";
                const displayMessage =
                  item.error_message && item.error_message.length > 110
                    ? `${item.error_message.slice(0, 110)}...`
                    : item.error_message || "오류 메시지 없음";

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-rose-700">
                          {formatDateTime(item.created_at)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {item.error_type}
                        </p>
                        <p className="text-xs text-gray-600">
                          {getErrorDescription(item.error_type)}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-700">
                        {formatNumber(item.api_calls_made)}회
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-700">
                      <p>액션: {item.action_type}</p>
                      <p>세션: {shortSessionId}</p>
                      <p>키 인덱스: {formatNumber(item.api_key_index)}</p>
                      <p title={item.error_message || ""}>메시지: {displayMessage}</p>
                    </div>
                  </div>
                );
              })}
              {recentFailures.length > INITIAL_FAILURE_VISIBLE_COUNT && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllFailures((prev) => !prev)}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {showAllFailures
                      ? "접기"
                      : `더보기 (${recentFailures.length - INITIAL_FAILURE_VISIBLE_COUNT}개 더)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h4 className="text-base font-semibold text-amber-900">Band API 할당량 안내</h4>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {QUOTA_GUIDE.map((item) => (
            <div
              key={item.code}
              className="rounded-lg border border-amber-200 bg-white px-3 py-3"
            >
              <p className="text-sm font-semibold text-amber-900">
                {item.code} {item.title}
              </p>
              <p className="mt-1 text-xs text-amber-800">{item.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-amber-800">
          실패 로그는 성공 로그와 분리되어 기록됩니다. 할당량 이슈가 반복되면
          메인/백업 키 상태를 먼저 확인하세요.
        </p>
      </div>
    </div>
  );
}
