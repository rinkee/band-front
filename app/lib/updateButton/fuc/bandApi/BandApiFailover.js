/**
 * Band API Failover 클래스
 * 다중 API 키를 관리하고 할당량 초과 시 자동으로 페일오버를 수행합니다.
 *
 * @module BandApiFailover
 *
 * 원본: backend/supabase/functions/band-get-posts-a/bandApiFailover.ts
 * 이식: TypeScript → JavaScript, Deno → Next.js 환경 변경
 */

/**
 * Band API Failover 클래스
 * 메인 API 키와 여러 백업 키를 관리하며, 할당량 초과 시 자동으로 다음 키로 전환
 */
export class BandApiFailover {
  /**
   * @param {Object} supabase - Supabase 클라이언트 인스턴스
   * @param {string} userId - 사용자 ID
   * @param {string} sessionId - 세션 ID
   * @param {boolean} [simulateQuotaError=false] - 테스트용 할당량 초과 시뮬레이션 여부
   */
  constructor(supabase, userId, sessionId, simulateQuotaError = false) {
    this.supabase = supabase;
    this.userId = userId;
    this.sessionId = sessionId;
    this.simulateQuotaError = simulateQuotaError;
    this.failoverCallback = null;

    this.currentKeyIndex = 0;
    this.mainApiKey = null;
    this.backupAccessTokens = [];
    this.bandKey = "";

    this.usageStats = {
      totalPostsFetched: 0,
      totalCommentsFetched: 0,
      totalApiCalls: 0,
      keysUsed: 1
    };
  }

  /**
   * 사용자의 API 키 정보를 DB에서 로드합니다
   * @returns {Promise<void>}
   */
  async loadApiKeys() {
    const { data: userData, error } = await this.supabase
      .from("users")
      .select("band_access_token, band_access_tokens, band_key, backup_band_keys, current_band_key_index")
      .eq("user_id", this.userId)
      .single();

    if (error || !userData) {
      throw new Error(`Failed to load user API keys: ${error?.message}`);
    }

    // band_access_tokens 배열이 있으면 그것을 1순위로 사용 (문자열 or {access_token})
    const tokensArray = Array.isArray(userData.band_access_tokens)
      ? userData.band_access_tokens
      : null;

    if (tokensArray && tokensArray.length > 0) {
      const normalizedTokens = tokensArray
        .map((t) => {
          if (!t) return null;
          if (typeof t === "string") {
            return { access_token: t, band_key: userData.band_key || "" };
          }
          if (t.access_token) {
            return { access_token: t.access_token, band_key: t.band_key || userData.band_key || "" };
          }
          return null;
        })
        .filter(Boolean);

      if (normalizedTokens.length === 0) {
        throw new Error("band_access_tokens에 유효한 access_token이 없습니다.");
      }

      const safeIndex = Math.min(
        userData.current_band_key_index || 0,
        normalizedTokens.length - 1
      );

      // Band Key 설정 (배열에 band_key가 있으면 우선 사용)
      this.bandKey = normalizedTokens[safeIndex].band_key || userData.band_key || "";

      // 메인/백업 토큰 설정
      this.mainApiKey = {
        access_token: normalizedTokens[0].access_token,
        band_key: normalizedTokens[0].band_key || this.bandKey
      };
      this.backupAccessTokens = normalizedTokens.slice(1).map((t) => t.access_token);
      this.currentKeyIndex = safeIndex;
    } else {
      // 기존 필드 폴백 (구 데이터 대응)
      this.bandKey = userData.band_key || "";
      this.mainApiKey = {
        access_token: userData.band_access_token,
        band_key: this.bandKey
      };
      this.backupAccessTokens = userData.backup_band_keys || [];
      this.currentKeyIndex = userData.current_band_key_index || 0;
    }

    if (this.simulateQuotaError) {
      console.info('테스트 모드: 할당량 초과 시뮬레이션 활성화');
    }
  }

  /**
   * 현재 사용할 API 키를 반환합니다
   * @returns {Object|null} API 키 객체 {access_token, band_key} 또는 null
   */
  getCurrentApiKey() {
    if (this.currentKeyIndex === 0) {
      return this.mainApiKey;
    } else {
      const backupIndex = this.currentKeyIndex - 1;
      if (backupIndex < this.backupAccessTokens.length) {
        return {
          access_token: this.backupAccessTokens[backupIndex],
          band_key: this.bandKey
        };
      }
    }
    return null;
  }

  /**
   * 페일오버 발생 시 호출될 콜백을 등록합니다.
   * @param {Function|null} callback - 콜백 함수 (fromIndex, toIndex, errorType 전달)
   */
  setFailoverCallback(callback) {
    this.failoverCallback = typeof callback === "function" ? callback : null;
  }

  /**
   * 다음 백업 키로 전환합니다
   * @returns {Promise<boolean>} 전환 성공 여부
   */
  async switchToNextKey() {
    const totalKeys = 1 + this.backupAccessTokens.length; // 메인키 + 백업 토큰들

    if (this.currentKeyIndex >= totalKeys - 1) {
      return false;
    }

    this.currentKeyIndex++;
    this.usageStats.keysUsed++;

    // 데이터베이스에 현재 키 인덱스 업데이트
    const switchTime = new Date().toISOString();
    const { error } = await this.supabase
      .from("users")
      .update({
        current_band_key_index: this.currentKeyIndex,
        last_key_switch_at: switchTime
      })
      .eq("user_id", this.userId);

    if (error) {
      console.error(`[API Failover] 키 인덱스 업데이트 실패:`, error);
    }

    const currentKey = this.getCurrentApiKey();
    console.log(
      `[API Failover] 키 전환 성공: 인덱스 ${this.currentKeyIndex} (${currentKey?.access_token?.substring(0, 10)}...)`
    );

    return true;
  }

  /**
   * API 호출을 시도하고 실패 시 다음 키로 전환합니다 (항상 메인키부터 시도, 성공시 인덱스 0 복구)
   * @param {Function} apiCall - API 호출 함수 (accessToken, bandKey) => Promise
   * @param {string} actionType - 액션 타입 ('get_posts' 또는 'get_comments')
   * @param {number} [expectedDataCount=0] - 예상 데이터 수
   * @returns {Promise<any>} API 호출 결과
   */
  async executeWithFailover(apiCall, actionType, expectedDataCount = 0) {
    let lastError = null;
    const totalKeys = 1 + this.backupAccessTokens.length; // 메인키 + 백업 토큰들

    for (let i = 0; i < totalKeys; i++) {
      // i=0: 메인키, i=1~: 백업키
      this.currentKeyIndex = i;
      const currentKey = this.getCurrentApiKey();

      if (!currentKey) continue;

      try {
        console.log(
          `[API Failover] ${actionType} 시도 ${i + 1}/${totalKeys}, 키 인덱스: ${this.currentKeyIndex}`
        );

        // 🧪 테스트 모드: 할당량 초과 시뮬레이션
        if (this.simulateQuotaError && i === 0) {
          console.debug('테스트 모드: 첫 번째 토큰에서 할당량 초과 시뮬레이션');
          throw new Error("API quota exceeded (simulated)");
        }

        const result = await apiCall(currentKey.access_token, currentKey.band_key);

        // 실제 데이터 수 계산
        let actualDataCount = 0;
        if (result && typeof result === "object" && "items" in result) {
          actualDataCount = result.items?.length || 0;
        } else if (result && typeof result === "object" && "posts" in result) {
          actualDataCount = result.posts?.length || 0;
        } else if (result && typeof result === "object" && "comments" in result) {
          actualDataCount = result.comments?.length || 0;
        } else {
          // expectedDataCount를 폴백으로 사용
          actualDataCount = expectedDataCount;
        }

        // 성공 로그 기록 - 실제 데이터 수 사용
        await this.logApiUsage({
          user_id: this.userId,
          session_id: this.sessionId,
          api_key_index: this.currentKeyIndex,
          action_type: actionType,
          posts_fetched: actionType === "get_posts" ? actualDataCount : 0,
          comments_fetched: actionType === "get_comments" ? actualDataCount : 0,
          api_calls_made: 1,
          success: true
        });

        // 통계 업데이트 - 실제 데이터 수 사용
        this.usageStats.totalApiCalls++;
        if (actionType === "get_posts") {
          this.usageStats.totalPostsFetched += actualDataCount;
        } else {
          this.usageStats.totalCommentsFetched += actualDataCount;
        }

        // 메인키 성공시 current_band_key_index를 0으로 복구
        if (i === 0) {
          await this.supabase
            .from("users")
            .update({ current_band_key_index: 0 })
            .eq("user_id", this.userId);
        } else {
          // 백업키 성공시 해당 인덱스로 기록
          await this.supabase
            .from("users")
            .update({ current_band_key_index: i })
            .eq("user_id", this.userId);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorType = this.analyzeErrorType(lastError);

        // 실패 로그 기록
        await this.logApiUsage({
          user_id: this.userId,
          session_id: this.sessionId,
          api_key_index: this.currentKeyIndex,
          action_type: actionType,
          posts_fetched: 0,
          comments_fetched: 0,
          api_calls_made: 1,
          success: false,
          error_message: lastError.message,
          error_type: errorType
        });

        this.usageStats.totalApiCalls++;

        console.error(
          `[API Failover] ${actionType} 실패 (키 인덱스: ${this.currentKeyIndex}):`,
          lastError.message
        );

        // 할당량 초과나 인증 오류인 경우에만 다음 키로 시도, 아니면 break
        const canFailover = errorType === "quota_exceeded" || errorType === "invalid_token";
        if (canFailover && i < totalKeys - 1 && this.failoverCallback) {
          try {
            this.failoverCallback({
              fromIndex: this.currentKeyIndex,
              toIndex: this.currentKeyIndex + 1,
              errorType
            });
          } catch (callbackError) {
            console.error("[API Failover] failoverCallback 실행 오류:", callbackError);
          }
        }

        if (!canFailover) {
          break;
        }
      }
    }

    throw lastError || new Error("API 호출 실패");
  }

  /**
   * 에러 타입을 분석합니다
   * @param {Error} error - 에러 객체
   * @returns {string} 에러 타입 ('quota_exceeded', 'invalid_token', 'network_error', 'unknown_error')
   */
  analyzeErrorType(error) {
    const message = (error.message || "").toLowerCase();
    const has429Status =
      message.includes("429") || message.includes("too many requests");

    if (
      message.includes("quota") ||
      message.includes("limit") ||
      message.includes("rate") ||
      message.includes("logical error: 1001") || // Band API 1001 에러도 할당량 초과로 처리
      has429Status
    ) {
      return "quota_exceeded";
    } else if (
      message.includes("unauthorized") ||
      message.includes("invalid") ||
      message.includes("token")
    ) {
      return "invalid_token";
    } else if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection")
    ) {
      return "network_error";
    } else {
      return "unknown_error";
    }
  }

  /**
   * API 사용 로그를 기록합니다
   * @param {Object} log - 로그 객체
   * @returns {Promise<void>}
   */
  async logApiUsage(log) {
    try {
      const { error } = await this.supabase
        .from("band_api_usage_logs")
        .insert(log);

      if (error) {
        console.error("[API Failover] 사용 로그 기록 실패:", error);
      }
    } catch (error) {
      console.error("[API Failover] 사용 로그 기록 중 오류:", error);
    }
  }

  /**
   * 세션을 시작합니다
   * @returns {Promise<void>}
   */
  async startSession() {
    try {
      // UTC 타임스탬프 사용 (DB는 UTC로 저장)
      const startTime = new Date().toISOString();

      const { error } = await this.supabase
        .from("band_api_sessions")
        .insert({
          user_id: this.userId,
          session_id: this.sessionId,
          started_at: startTime,
          total_posts_fetched: 0,
          total_comments_fetched: 0,
          total_api_calls: 0,
          keys_used: 1,
          final_key_index: this.currentKeyIndex,
          success: true
        });

      if (error) {
        console.error("[API Failover] 세션 시작 기록 실패:", error);
      }
    } catch (error) {
      console.error("[API Failover] 세션 시작 중 오류:", error);
    }
  }

  /**
   * 세션을 종료합니다
   * @param {boolean} success - 세션 성공 여부
   * @param {string} [errorSummary] - 에러 요약 (실패 시)
   * @returns {Promise<void>}
   */
  async endSession(success, errorSummary) {
    try {
      // UTC 타임스탬프 사용 (DB는 UTC로 저장)
      const endTime = new Date().toISOString();

      const { error } = await this.supabase
        .from("band_api_sessions")
        .update({
          ended_at: endTime,
          total_posts_fetched: this.usageStats.totalPostsFetched,
          total_comments_fetched: this.usageStats.totalCommentsFetched,
          total_api_calls: this.usageStats.totalApiCalls,
          keys_used: this.usageStats.keysUsed,
          final_key_index: this.currentKeyIndex,
          success: success,
          error_summary: errorSummary
        })
        .eq("session_id", this.sessionId);

      if (error) {
        console.error("[API Failover] 세션 종료 기록 실패:", error);
      }

      console.info('API Failover 세션 종료', {
        totalPosts: this.usageStats.totalPostsFetched,
        totalComments: this.usageStats.totalCommentsFetched,
        apiCalls: this.usageStats.totalApiCalls,
        keysUsed: this.usageStats.keysUsed
      });
    } catch (error) {
      console.error("[API Failover] 세션 종료 중 오류:", error);
    }
  }

  /**
   * 현재 사용 통계를 반환합니다
   * @returns {Object} 사용 통계 객체
   */
  getUsageStats() {
    return {
      ...this.usageStats,
      currentKeyIndex: this.currentKeyIndex,
      finalKeyIndex: this.currentKeyIndex,
      hasFailover: this.currentKeyIndex > 0
    };
  }
}
