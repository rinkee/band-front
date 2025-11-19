import { createLogger } from '../shared/utils/logger.js';

const logger = createLogger("band-api-failover");

// API 엔드포인트 상수 - Band API는 v2.1 사용 (대댓글 지원)
const BAND_POSTS_API_URL = "https://openapi.band.us/v2/band/posts";
const COMMENTS_API_URL = "https://openapi.band.us/v2.1/band/post/comments";

/**
 * Band API 할당량 초과 에러 확인
 * @param {Error} error - 에러 객체
 * @returns {boolean} 할당량 초과 여부
 */
function isQuotaExceededError(error) {
  if (!error || !error.message) return false;
  const message = error.message.toLowerCase();
  
  // Band API 할당량 초과 관련 메시지 체크
  return (
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429") ||
    (message.includes("403") && message.includes("limit")) ||
    message.includes("logical error: 1001") // Band API 1001 에러도 할당량 초과로 처리
  );
}

/**
 * Band API Failover 클래스
 * API 키 순환 및 장애 복구 기능을 제공합니다
 */
export class BandApiFailover {
  constructor(supabase, userId, sessionId, simulateQuotaError = false) {
    this.supabase = supabase;
    this.userId = userId;
    this.sessionId = sessionId;
    this.simulateQuotaError = simulateQuotaError;
    
    this.currentKeyIndex = 0;
    this.mainApiKey = null;
    this.backupAccessTokens = [];
    this.bandKey = "";
    
    this.usageStats = {
      totalPostsFetched: 0,
      totalCommentsFetched: 0,
      totalApiCalls: 0,
      keysUsed: 1,
    };
  }

  /**
   * 사용자의 API 키 정보를 로드합니다
   */
  async loadApiKeys() {
    console.log('[Band API] API 키 로드 시작:', {
      userId: this.userId,
      supabase_url: this.supabase.supabaseUrl
    });
    
    const { data: userData, error } = await this.supabase
      .from("users")
      .select(
        "band_access_token, band_key, backup_band_keys, current_band_key_index"
      )
      .eq("user_id", this.userId)
      .single();
    
    if (error) {
      console.error('[Band API] 사용자 데이터 로드 실패:', {
        error: error.message,
        code: error.code,
        details: error.details
      });
      throw new Error(`Failed to load user API keys: ${error?.message}`);
    }
    
    if (!userData) {
      console.error('[Band API] 사용자 데이터 없음:', { userId: this.userId });
      throw new Error(`No user data found for userId: ${this.userId}`);
    }
    
    // Band Key 설정 (고정)
    this.bandKey = userData.band_key || "";
    
    // 메인 API 키 설정
    this.mainApiKey = {
      access_token: userData.band_access_token,
      band_key: this.bandKey,
    };
    
    // 백업 Access Token 설정 (문자열 배열)
    this.backupAccessTokens = userData.backup_band_keys || [];
    this.currentKeyIndex = userData.current_band_key_index || 0;
    
    // API 키 로드 성공 로그
    console.log('[Band API] API 키 로드 완료:', {
      has_main_token: !!userData.band_access_token,
      band_key: this.bandKey,
      band_key_length: this.bandKey.length,
      token_first_10: userData.band_access_token ? userData.band_access_token.substring(0, 10) + '...' : 'none',
      backup_tokens_count: this.backupAccessTokens.length,
      current_key_index: this.currentKeyIndex
    });
    
    if (this.simulateQuotaError) {
      logger.info('테스트 모드: 할당량 초과 시뮬레이션 활성화');
    }
  }

  /**
   * 현재 사용할 API 키를 반환합니다
   */
  getCurrentApiKey() {
    if (this.currentKeyIndex === 0) {
      return this.mainApiKey;
    } else {
      const backupIndex = this.currentKeyIndex - 1;
      if (backupIndex < this.backupAccessTokens.length) {
        return {
          access_token: this.backupAccessTokens[backupIndex],
          band_key: this.bandKey,
        };
      }
    }
    return null;
  }

  /**
   * 다음 백업 키로 전환합니다
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
        last_key_switch_at: switchTime,
      })
      .eq("user_id", this.userId);
    
    if (error) {
      console.error(`[API Failover] 키 인덱스 업데이트 실패:`, error);
    }
    
    return true;
  }

  /**
   * 에러 타입을 분석합니다
   */
  analyzeErrorType(error) {
    const message = error.message.toLowerCase();
    
    if (
      message.includes("quota") ||
      message.includes("limit") ||
      message.includes("rate") ||
      message.includes("logical error: 1001")
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
   * API 호출을 시도하고 실패 시 다음 키로 전환합니다
   * @param {Function} apiCall - API 호출 함수
   * @param {string} actionType - 작업 타입 (get_posts, get_comments)
   * @param {number} expectedDataCount - 예상 데이터 수
   * @returns {Promise<any>} API 호출 결과
   */
  async executeWithFailover(apiCall, actionType, expectedDataCount = 0) {
    let lastError = null;
    const totalKeys = 1 + this.backupAccessTokens.length;
    
    for (let i = 0; i < totalKeys; i++) {
      this.currentKeyIndex = i;
      const currentKey = this.getCurrentApiKey();
      
      if (!currentKey) continue;
      
      try {
        // 테스트 모드: 할당량 초과 시뮬레이션
        if (this.simulateQuotaError && i === 0) {
          logger.debug('테스트 모드: 첫 번째 토큰에서 할당량 초과 시뮬레이션');
          throw new Error("API quota exceeded (simulated)");
        }
        
        const result = await apiCall(
          currentKey.access_token,
          currentKey.band_key
        );
        
        // 실제 데이터 수 계산
        let actualDataCount = 0;
        if (result && typeof result === "object" && "items" in result) {
          actualDataCount = result.items?.length || 0;
        } else if (result && typeof result === "object" && "posts" in result) {
          actualDataCount = result.posts?.length || 0;
        } else if (result && typeof result === "object" && "comments" in result) {
          actualDataCount = result.comments?.length || 0;
        } else {
          actualDataCount = expectedDataCount;
        }
        
        // 성공 로그 기록
        await this.logApiUsage({
          user_id: this.userId,
          session_id: this.sessionId,
          api_key_index: this.currentKeyIndex,
          action_type: actionType,
          posts_fetched: actionType === "get_posts" ? actualDataCount : 0,
          comments_fetched: actionType === "get_comments" ? actualDataCount : 0,
          api_calls_made: 1,
          success: true,
        });
        
        // 통계 업데이트
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
            .update({
              current_band_key_index: 0,
            })
            .eq("user_id", this.userId);
        } else {
          // 백업키 성공시 해당 인덱스로 기록
          await this.supabase
            .from("users")
            .update({
              current_band_key_index: i,
            })
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
          error_type: errorType,
        });
        
        this.usageStats.totalApiCalls++;
        
        // 할당량 초과나 인증 오류인 경우에만 다음 키로 시도
        if (!(errorType === "quota_exceeded" || errorType === "invalid_token")) {
          break;
        }
      }
    }
    
    throw lastError || new Error("API 호출 실패");
  }

  /**
   * 세션을 시작합니다
   */
  async startSession() {
    try {
      const startTime = new Date().toISOString();
      const { error } = await this.supabase.from("band_api_sessions").insert({
        user_id: this.userId,
        session_id: this.sessionId,
        started_at: startTime,
        total_posts_fetched: 0,
        total_comments_fetched: 0,
        total_api_calls: 0,
        keys_used: 1,
        final_key_index: this.currentKeyIndex,
        success: true,
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
   */
  async endSession(success, errorSummary) {
    try {
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
          error_summary: errorSummary,
        })
        .eq("session_id", this.sessionId);
      
      if (error) {
        console.error("[API Failover] 세션 종료 기록 실패:", error);
      }
      
      logger.info('API Failover 세션 종료', {
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
   */
  getUsageStats() {
    return {
      ...this.usageStats,
      currentKeyIndex: this.currentKeyIndex,
      finalKeyIndex: this.currentKeyIndex,
      hasFailover: this.currentKeyIndex > 0,
    };
  }

  /**
   * Band Posts를 가져옵니다
   * @param {number} limit - 가져올 게시물 수
   * @returns {Promise<Object>} 게시물 데이터
   */
  async fetchBandPosts(limit = 20) {
    const apiCall = async (accessToken, bandKey) => {
      let allPosts = [];
      let nextParams = {};
      let hasMore = true;
      const apiPageLimit = 20;
      
      while (hasMore && allPosts.length < limit) {
        const currentLimit = Math.min(apiPageLimit, limit - allPosts.length);
        // 브라우저 환경에서는 프록시 API 사용 (CORS 회피)
        let response;
        if (typeof window !== 'undefined') {
          // 사용할 토큰 디버깅
          console.log('[Band API] 게시물 요청 파라미터:', {
            has_access_token: !!accessToken,
            token_length: accessToken?.length || 0,
            token_first_10: accessToken ? accessToken.substring(0, 10) + '...' : 'none',
            band_key: bandKey,
            limit: currentLimit
          });
          
          // 토큰이 없으면 에러
          if (!accessToken) {
            throw new Error('Band API access token이 없습니다. 설정을 확인해주세요.');
          }
          
          const params = {
            access_token: accessToken,
            band_key: bandKey,
            locale: 'ko_KR',  // 필수 파라미터 추가
            limit: currentLimit.toString(),
            ...nextParams
          };
          
          response = await fetch('/api/band-api', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: '/band/posts',
              params,
              method: 'GET'
            }),
          });
        } else {
          // 서버 사이드에서는 직접 호출
          const apiUrl = new URL(BAND_POSTS_API_URL);
          apiUrl.searchParams.set("access_token", accessToken);
          apiUrl.searchParams.set("band_key", bandKey);
          apiUrl.searchParams.set("locale", "ko_KR");  // 필수 파라미터 추가
          apiUrl.searchParams.set("limit", currentLimit.toString());
          
          Object.entries(nextParams).forEach(([key, value]) =>
            apiUrl.searchParams.set(key, value)
          );
          
          response = await fetch(apiUrl.toString(), {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          });
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Band API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }
        
        const data = await response.json();
        
        // Band API 응답 디버깅
        console.log('[Band API] 응답 데이터:', {
          result_code: data.result_code,
          has_result_data: !!data.result_data,
          has_items: !!(data.result_data?.items),
          items_count: data.result_data?.items?.length || 0,
          message: data.result_data?.message || 'No message'
        });
        
        if (data.result_code !== 1) {
          // result_code가 1이 아닌 경우 상세 정보 로깅
          console.error('[Band API] 오류 응답:', {
            result_code: data.result_code,
            message: data.result_data?.message || data.message || 'Unknown error',
            endpoint: '/band/posts',
            band_key: bandKey,
            token_length: accessToken?.length || 0
          });
          
          // 에러 코드별 처리
          if (data.result_code === 2300) {
            // Invalid response - 토큰이나 권한 문제일 수 있음
            const errorMessage = data.result_data?.message || 'Invalid token or band permissions';
            throw new Error(
              `Band API 인증 오류: ${errorMessage} (코드: ${data.result_code})`
            );
          }
          
          throw new Error(
            `Band API logical error: ${data.result_code} - ${data.result_data?.message || "Unknown error"}`
          );
        }
        
        const posts = data.result_data?.items || [];
        allPosts = allPosts.concat(posts);
        
        // 다음 페이지 파라미터 설정
        if (data.result_data?.paging?.next_params) {
          nextParams = data.result_data.paging.next_params;
          hasMore = true;
        } else {
          hasMore = false;
        }
      }
      
      return { posts: allPosts };
    };
    
    return this.executeWithFailover(apiCall, "get_posts", limit);
  }

  /**
   * Band 댓글을 가져옵니다 (페이지네이션 지원)
   * @param {string} postKey - 게시물 키
   * @returns {Promise<Object>} 댓글 데이터
   */
  async fetchBandComments(postKey) {
    const apiCall = async (accessToken, bandKey) => {
      let allComments = [];
      let nextParams = null;
      let hasMore = true;
      let pageCount = 0;
      
      while (hasMore) {
        pageCount++;
        console.log(`[Band API Comments] ${pageCount}번째 페이지 요청 중...`);
        
        // 브라우저 환경에서는 프록시 API 사용 (CORS 회피)
        let response;
        if (typeof window !== 'undefined') {
          // 첫 페이지 또는 다음 페이지에 따라 파라미터 구성
          let params;
          if (nextParams) {
            // 다음 페이지: next_params를 그대로 사용 (이미 모든 필수 파라미터 포함)
            params = nextParams;
          } else {
            // 첫 페이지: 필수 파라미터만 전달
            params = {
              access_token: accessToken,
              band_key: bandKey,
              post_key: postKey
            };
          }
          
          response = await fetch('/api/band-api', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: '/band/post/comments',
              params,
              method: 'GET'
            }),
          });
        } else {
          // 서버 사이드에서는 직접 호출
          const apiUrl = new URL(COMMENTS_API_URL);
          
          if (nextParams) {
            // 다음 페이지: next_params의 모든 파라미터 사용
            Object.entries(nextParams).forEach(([key, value]) => {
              apiUrl.searchParams.set(key, value);
            });
          } else {
            // 첫 페이지: 필수 파라미터만 설정
            apiUrl.searchParams.set("access_token", accessToken);
            apiUrl.searchParams.set("band_key", bandKey);
            apiUrl.searchParams.set("post_key", postKey);
          }
          
          response = await fetch(apiUrl.toString(), {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          });
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Band API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }
        
        const data = await response.json();
        
        // Band API 응답 디버깅
        console.log(`[Band API Comments] ${pageCount}번째 페이지 응답:`, {
          result_code: data.result_code,
          has_result_data: !!data.result_data,
          has_items: !!(data.result_data?.items),
          items_count: data.result_data?.items?.length || 0,
          has_next_page: !!data.result_data?.paging?.next_params,
          message: data.result_data?.message
        });
        
        // 페이지네이션 정보 상세 로그
        if (data.result_data?.paging) {
          console.log('[Band API Comments] Paging 정보:', data.result_data.paging);
        }
        
        if (data.result_code !== 1) {
          // result_code가 1이 아닌 경우 상세 정보 로깅
          console.error('[Band API Comments] 오류 응답:', data);
          
          // 에러 코드별 처리
          if (data.result_code === 2300) {
            throw new Error(
              `Band API 인증 오류: 토큰을 확인하거나 밴드 권한을 확인하세요. (코드: ${data.result_code})`
            );
          }
          
          throw new Error(
            `Band API logical error: ${data.result_code} - ${data.result_data?.message || "Unknown error"}`
          );
        }
        
        // 현재 페이지의 댓글 처리 (메인 댓글 + 대댓글)
        const items = data.result_data?.items || [];
        const processedComments = items.flatMap((c) => {
          // 메인 댓글
          const mainComment = c;

          // 대댓글 처리 (v2.1 API)
          const replies = [];
          if (c.latest_comments && Array.isArray(c.latest_comments)) {
            const parentAuthorName = c.author?.name || '';

            c.latest_comments.forEach((reply) => {
              replies.push({
                ...reply,
                comment_key: `${c.comment_key}_${reply.created_at}`, // 타임스탬프 기반 고유 ID
                content: `${parentAuthorName} ${reply.body}`, // 부모 작성자 + 대댓글 내용
                post_key: postKey,
                band_key: bandKey
              });
            });
          }

          return [mainComment, ...replies];
        });

        allComments = allComments.concat(processedComments);

        // 다음 페이지 확인
        if (data.result_data?.paging?.next_params) {
          nextParams = data.result_data.paging.next_params;
          console.log('[Band API Comments] 다음 페이지 존재, after:', nextParams.after);
        } else {
          hasMore = false;
          console.log('[Band API Comments] 더 이상 페이지 없음');
        }
        
        // 안전장치: 너무 많은 페이지 요청 방지 (최대 10페이지)
        if (pageCount >= 10) {
          console.warn('[Band API Comments] 최대 페이지 수(10) 도달, 중단');
          hasMore = false;
        }
      }
      
      console.log(`[Band API Comments] 총 ${allComments.length}개 댓글 가져옴 (${pageCount}페이지)`);
      
      return { comments: allComments };
    };
    
    return this.executeWithFailover(apiCall, "get_comments");
  }
}

/**
 * 백업 토큰을 지원하는 Band Posts 가져오기 (하위 호환성)
 * @param {string} userId - 사용자 ID
 * @param {number} limit - 가져올 게시물 수
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<Object>} 게시물 정보
 */
export async function fetchBandPostsWithBackupFallback(userId, limit, supabase) {
  console.log(
    `[API 백업] 사용자 ${userId}의 밴드 게시물 가져오기 (백업 토큰 지원), 제한 ${limit}`
  );
  
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const failover = new BandApiFailover(supabase, userId, sessionId);
  
  try {
    await failover.loadApiKeys();
    await failover.startSession();
    const result = await failover.fetchBandPosts(limit);
    await failover.endSession(true);
    return result;
  } catch (error) {
    await failover.endSession(false, error.message);
    throw error;
  }
}

/**
 * 백업 토큰을 지원하는 Band 댓글 가져오기
 * @param {string} postKey - 게시물 키
 * @param {string} userId - 사용자 ID
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<Object>} 댓글 정보
 */
export async function fetchBandCommentsWithBackupFallback(postKey, userId, supabase) {
  console.log(
    `[API 백업] 게시물 ${postKey}의 댓글 가져오기 (백업 토큰 지원)`
  );
  
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const failover = new BandApiFailover(supabase, userId, sessionId);
  
  try {
    await failover.loadApiKeys();
    const result = await failover.fetchBandComments(postKey);
    return result;
  } catch (error) {
    console.error(`[API 백업] 댓글 가져오기 실패:`, error.message);
    throw error;
  }
}