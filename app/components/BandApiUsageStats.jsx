"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function BandApiUsageStats({ userId }) {
  const [usageStats, setUsageStats] = useState({
    today: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
    thisWeek: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
    thisMonth: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
    total: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
  });
  const [recentSessions, setRecentSessions] = useState([]);
  const [errorStats, setErrorStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentKeyStatus, setCurrentKeyStatus] = useState({
    currentIndex: 0,
    lastSwitchAt: null,
    totalKeys: 1,
    hasFailover: false,
  });

  useEffect(() => {
    if (userId) {
      loadUsageStats();
    }
  }, [userId]);

  const loadUsageStats = async () => {
    try {
      setLoading(true);
      console.log(`[BandApiUsageStats] 사용자 ID로 데이터 조회: ${userId}`);

      // 오늘 날짜 계산
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      // 이번 주 시작일 (월요일)
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - today.getDay() + 1);
      const thisWeekStr = thisWeekStart.toISOString().split("T")[0];

      // 이번 달 시작일
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const thisMonthStr = thisMonthStart.toISOString().split("T")[0];

      // 세션별 통계 조회
      const { data: sessionData, error: sessionError } = await supabase
        .from("band_api_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false });

      console.log(`[BandApiUsageStats] 세션 데이터 조회 결과:`, sessionData);
      console.log(`[BandApiUsageStats] 세션 조회 에러:`, sessionError);

      if (sessionError) throw sessionError;

      // 현재 키 상태 조회
      const { data: userKeyData, error: keyError } = await supabase
        .from("users")
        .select("current_band_key_index, last_key_switch_at, backup_band_keys")
        .eq("user_id", userId)
        .single();

      if (!keyError && userKeyData) {
        const backupKeysCount = userKeyData.backup_band_keys
          ? userKeyData.backup_band_keys.length
          : 0;
        setCurrentKeyStatus({
          currentIndex: userKeyData.current_band_key_index || 0,
          lastSwitchAt: userKeyData.last_key_switch_at,
          totalKeys: 1 + backupKeysCount, // 메인 키 + 백업 키들
          hasFailover: (userKeyData.current_band_key_index || 0) > 0,
        });
      }

      // 통계 계산
      const stats = {
        today: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
        thisWeek: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
        thisMonth: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
        total: { posts: 0, comments: 0, apiCalls: 0, sessions: 0 },
      };

      sessionData?.forEach((session) => {
        const sessionDate = session.started_at.split("T")[0];

        // 총계
        stats.total.posts += session.total_posts_fetched || 0;
        stats.total.comments += session.total_comments_fetched || 0;
        stats.total.apiCalls += session.total_api_calls || 0;
        stats.total.sessions += 1;

        // 이번 달
        if (sessionDate >= thisMonthStr) {
          stats.thisMonth.posts += session.total_posts_fetched || 0;
          stats.thisMonth.comments += session.total_comments_fetched || 0;
          stats.thisMonth.apiCalls += session.total_api_calls || 0;
          stats.thisMonth.sessions += 1;
        }

        // 이번 주
        if (sessionDate >= thisWeekStr) {
          stats.thisWeek.posts += session.total_posts_fetched || 0;
          stats.thisWeek.comments += session.total_comments_fetched || 0;
          stats.thisWeek.apiCalls += session.total_api_calls || 0;
          stats.thisWeek.sessions += 1;
        }

        // 오늘
        if (sessionDate === todayStr) {
          stats.today.posts += session.total_posts_fetched || 0;
          stats.today.comments += session.total_comments_fetched || 0;
          stats.today.apiCalls += session.total_api_calls || 0;
          stats.today.sessions += 1;
        }
      });

      setUsageStats(stats);
      setRecentSessions(sessionData?.slice(0, 30) || []);

      // 에러 통계 조회
      const { data: errorData, error: errorError } = await supabase
        .from("band_api_usage_logs")
        .select("error_type, created_at")
        .eq("user_id", userId)
        .eq("success", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!errorError && errorData) {
        // 에러 타입별 집계
        const errorCounts = {};
        errorData.forEach((error) => {
          const type = error.error_type || "unknown";
          errorCounts[type] = (errorCounts[type] || 0) + 1;
        });

        const errorStatsArray = Object.entries(errorCounts).map(
          ([type, count]) => ({
            type,
            count,
            description: getErrorDescription(type),
          })
        );

        setErrorStats(errorStatsArray);
      }
    } catch (error) {
      console.error("사용량 통계 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const getErrorDescription = (errorType) => {
    const descriptions = {
      quota_exceeded: "할당량 초과 (1001/1002)",
      invalid_token: "유효하지 않은 토큰 (10401)",
      network_error: "네트워크 오류",
      forbidden: "접근 권한 없음 (10403)",
      unknown: "알 수 없는 오류",
    };
    return descriptions[errorType] || errorType;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 현재 키 상태 알림 */}
      {currentKeyStatus.hasFailover && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                백업 키 사용 중
              </h3>
              <div className="mt-1 text-sm text-yellow-700">
                <p>
                  메인 키 한계량 초과로 백업 키 #{currentKeyStatus.currentIndex}
                  를 사용하고 있습니다.
                  {currentKeyStatus.lastSwitchAt && (
                    <span className="block mt-1">
                      전환 시간: {formatDate(currentKeyStatus.lastSwitchAt)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 키 상태 정보 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-800">
              현재 API 키 상태
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {currentKeyStatus.currentIndex === 0
                ? "메인 키"
                : `백업 키 #${currentKeyStatus.currentIndex}`}{" "}
              사용 중<span className="mx-2">•</span>총{" "}
              {currentKeyStatus.totalKeys}개 키 보유
            </p>
          </div>
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full ${
                currentKeyStatus.hasFailover ? "bg-yellow-400" : "bg-green-400"
              }`}
            ></div>
            <span className="ml-2 text-sm text-gray-600">
              {currentKeyStatus.hasFailover ? "백업 키 사용" : "정상"}
            </span>
          </div>
        </div>
      </div>

      {/* 통계 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "오늘", data: usageStats.today, color: "bg-blue-500" },
          {
            label: "이번 주",
            data: usageStats.thisWeek,
            color: "bg-green-500",
          },
          {
            label: "이번 달",
            data: usageStats.thisMonth,
            color: "bg-purple-500",
          },
          { label: "전체", data: usageStats.total, color: "bg-gray-500" },
        ].map((period, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className={`w-4 h-4 ${period.color} rounded-full mb-3`}></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {period.label}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">게시물</span>
                <span className="font-medium">
                  {period.data.posts.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">댓글</span>
                <span className="font-medium">
                  {period.data.comments.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">API 호출</span>
                <span className="font-medium">
                  {period.data.apiCalls.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">세션</span>
                <span className="font-medium">
                  {period.data.sessions.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 최근 세션 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            최근 세션
          </h3>
          <div className="space-y-3">
            {recentSessions.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                세션 기록이 없습니다.
              </p>
            ) : (
              recentSessions.map((session, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {formatDate(session.started_at)}
                      {session.success ? (
                        <span className="ml-2 text-green-600">✓</span>
                      ) : (
                        <span className="ml-2 text-red-600">✗</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      키 {session.keys_used}개 사용
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>게시물 {session.total_posts_fetched}</div>
                    <div>댓글 {session.total_comments_fetched}</div>
                    <div className="text-xs text-gray-600">
                      API {session.total_api_calls}회
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 에러 통계 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            에러 통계
          </h3>
          <div className="space-y-3">
            {errorStats.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                에러가 없습니다! 🎉
              </p>
            ) : (
              errorStats.map((error, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 bg-red-50 rounded"
                >
                  <div>
                    <div className="text-sm font-medium text-red-800">
                      {error.type}
                    </div>
                    <div className="text-xs text-red-600">
                      {error.description}
                    </div>
                  </div>
                  <div className="text-red-800 font-medium">
                    {error.count}회
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Band API 할당량 정보 */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-800 mb-4">
          📋 Band API 할당량 정보
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white p-3 rounded">
            <div className="font-medium text-red-600">
              1001 - App Quota Exceeded
            </div>
            <div className="text-gray-600">앱 전체 할당량 초과</div>
          </div>
          <div className="bg-white p-3 rounded">
            <div className="font-medium text-red-600">
              1002 - User Quota Exceeded
            </div>
            <div className="text-gray-600">사용자별 할당량 초과</div>
          </div>
          <div className="bg-white p-3 rounded">
            <div className="font-medium text-red-600">
              1003 - Cool Down Time
            </div>
            <div className="text-gray-600">연속 호출 제한</div>
          </div>
        </div>
        <div className="mt-4 text-sm text-yellow-700">
          💡 <strong>팁:</strong> 할당량 초과 시 자동으로 백업 Access Token으로
          전환됩니다.
        </div>
      </div>
    </div>
  );
}
