/**
 * Band API 통신 클라이언트
 * Band API를 호출하고 게시물 및 댓글 데이터를 가져오는 함수들
 *
 * @module bandApiClient
 *
 * 원본: backend/supabase/functions/band-get-posts-a/index.ts
 * 이식: Deno → Next.js 환경 변경
 */

// API 엔드포인트
const BAND_POSTS_API_URL = "https://openapi.band.us/v2/band/posts";
const COMMENTS_API_URL = "https://openapi.band.us/v2.1/band/post/comments";

/**
 * 에러가 할당량 초과 에러인지 확인
 * @param {Error} error - 확인할 에러 객체
 * @returns {boolean} 할당량 초과 에러 여부
 */
function isQuotaExceededError(error) {
  if (!error) return false;
  const errorMsg = error.message || '';
  // Band API의 할당량 초과 응답 메시지 패턴 확인
  return errorMsg.includes('quota') ||
         errorMsg.includes('rate limit') ||
         errorMsg.includes('429');
}

/**
 * 백업 토큰을 지원하는 Band Comments 가져오기 함수
 * 메인 토큰이 할당량 초과 시 자동으로 백업 토큰으로 재시도
 *
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<{comments: Array, latestTimestamp: number|null}>} 댓글 목록 및 최신 타임스탬프
 */
export async function fetchBandCommentsWithBackupFallback(userId, postKey, bandKey, supabase) {
  let mainAccessToken = null;
  let backupAccessToken = null;

  try {
    // 메인 토큰과 백업 토큰 모두 조회
    const { data, error } = await supabase
      .from("users")
      .select("band_access_token, band_backup_access_token")
      .eq("user_id", userId)
      .single();

    if (error || !data?.band_access_token) {
      throw new Error(`Band access token not found for user ${userId}: ${error?.message}`);
    }

    mainAccessToken = data.band_access_token;
    backupAccessToken = data.band_backup_access_token;
  } catch (e) {
    console.error('토큰 조회 오류', e);
    throw e;
  }

  // API 호출 함수 (토큰을 파라미터로 받음)
  const callBandAPI = async (accessToken, attemptName) => {
    let allComments = [];
    let nextParams = {};
    let hasMore = true;
    let latestTs = null;
    const apiPageLimit = 50;

    while (hasMore) {
      const params = {
        access_token: accessToken,
        band_key: bandKey,
        post_key: postKey,
        limit: apiPageLimit.toString(),
        ...nextParams
      };

      let result;

      // 브라우저 환경에서는 프록시 사용
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            endpoint: '/band/post/comments',
            params,
            method: 'GET'
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Band API comments error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        result = await response.json();
      } else {
        // 서버 환경에서는 직접 호출
        const apiUrl = new URL(COMMENTS_API_URL);
        Object.entries(params).forEach(([key, value]) =>
          apiUrl.searchParams.set(key, value)
        );

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Band API comments error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        result = await response.json();
      }

      if (result.result_code !== 1 || !result.result_data) {
        throw new Error(`Band API comments logical error: ${result.result_code}`);
      }

      const data = result.result_data;
      const items = data.items || [];

      console.log('[대댓글 디버그 1-BackupFallback] Band API 응답 받음:', {
        items_count: items.length,
        has_latest_comments: items.some(c => c.latest_comments && c.latest_comments.length > 0)
      });

      const processed = items.flatMap((c, index) => {
        const ts = c.created_at;
        if (ts && (latestTs === null || ts > latestTs)) latestTs = ts;

        // 대댓글 정보 로깅
        const hasReplies = c.latest_comments && Array.isArray(c.latest_comments) && c.latest_comments.length > 0;
        if (hasReplies) {
          console.log(`[대댓글 디버그 2-BackupFallback] 댓글 #${index} (${c.comment_key})에 대댓글 발견:`, {
            parent_content: c.content?.substring(0, 30),
            parent_author: c.author?.name,
            replies_count: c.latest_comments.length,
            replies: c.latest_comments.map(r => ({
              author: r.author?.name,
              body: r.body?.substring(0, 30),
              created_at: r.created_at
            }))
          });
        }

        // 메인 댓글
        const mainComment = {
          commentKey: c.comment_key,
          postKey: postKey,
          bandKey: bandKey,
          author: c.author ? {
            name: c.author.name,
            userNo: c.author.user_key,
            user_key: c.author.user_key,
            profileImageUrl: c.author.profile_image_url
          } : null,
          content: c.content,
          createdAt: ts
        };

        // 대댓글 처리 (v2.1 API)
        const replies = [];
        if (c.latest_comments && Array.isArray(c.latest_comments)) {
          const parentAuthorName = c.author?.name || '';
          const parentAuthorUserNo = c.author?.user_key || c.author?.userNo || null;

          c.latest_comments.forEach((reply, replyIndex) => {
            const replyTs = reply.created_at;
            if (replyTs && (latestTs === null || replyTs > latestTs)) latestTs = replyTs;

            const processedReply = {
              commentKey: `${c.comment_key}_${replyTs}`, // 타임스탬프 기반 고유 ID
              postKey: postKey,
              bandKey: bandKey,
              author: reply.author ? {
                name: reply.author.name,
                userNo: reply.author.user_key,
                user_key: reply.author.user_key,
                profileImageUrl: reply.author.profile_image_url
              } : null,
              content: `${parentAuthorName} ${reply.body}`, // 부모 작성자 + 대댓글 내용
              parentAuthorName,
              parentAuthorUserNo,
              createdAt: replyTs
            };

            console.log(`[대댓글 디버그 3-BackupFallback] 대댓글 #${replyIndex} 변환 완료:`, {
              original_body: reply.body,
              processed_content: processedReply.content,
              comment_key: processedReply.commentKey
            });

            replies.push(processedReply);
          });
        }

        const result = [mainComment, ...replies];
        if (replies.length > 0) {
          console.log(`[대댓글 디버그 4-BackupFallback] 댓글 처리 결과:`, {
            main_comment: mainComment.commentKey,
            replies_count: replies.length,
            total_returned: result.length
          });
        }

        return result;
      });

      console.log('[대댓글 디버그 5-BackupFallback] flatMap 처리 완료:', {
        original_items: items.length,
        processed_comments: processed.length,
        difference: processed.length - items.length
      });

      allComments = allComments.concat(processed);

      console.log('[대댓글 디버그 6-BackupFallback] 현재까지 누적 댓글:', {
        total_comments: allComments.length
      });

      if (data.paging && data.paging.next_params) {
        nextParams = data.paging.next_params;
        hasMore = true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        hasMore = false;
      }
    }

    console.log('[대댓글 디버그 7-BackupFallback] 최종 결과:', {
      total_comments: allComments.length,
      latestTimestamp: latestTs
    });

    return {
      comments: allComments,
      latestTimestamp: latestTs
    };
  };

  // 메인 토큰으로 먼저 시도
  try {
    const result = await callBandAPI(mainAccessToken, "메인 토큰");
    return result;
  } catch (error) {
    // 할당량 초과 에러인지 확인
    if (isQuotaExceededError(error)) {
      console.debug('메인 토큰 할당량 초과, 백업 토큰 사용');

      // 백업 토큰이 있으면 재시도
      if (backupAccessToken) {
        try {
          const result = await callBandAPI(backupAccessToken, "백업 토큰");
          return result;
        } catch (backupError) {
          console.error('백업 토큰도 실패', backupError);
          throw backupError;
        }
      } else {
        console.error('백업 토큰이 없어서 재시도 불가');
        throw error;
      }
    } else {
      // 할당량 초과가 아닌 다른 에러는 그대로 throw
      throw error;
    }
  }
}

/**
 * Failover를 사용한 Band 게시물 가져오기
 * bandApiFailover 객체를 사용하여 다중 토큰/키 failover 지원
 *
 * @param {Object} bandApiFailover - Band API Failover 객체
 * @param {string} userId - 사용자 ID
 * @param {number} limit - 가져올 게시물 수
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<{posts: Array, bandKey: string, bandNumber: string}>} 게시물 목록 및 메타데이터
 */
export async function fetchBandPostsWithFailover(bandApiFailover, userId, limit, supabase) {
  console.info(`사용자 ${userId}의 밴드 게시물 가져오기`, { userId, limit });

  // 사용자 기본 정보 조회 (band_number 등)
  let bandNumber = null;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("band_number")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("사용자 정보 조회 실패", error, { userId });
    } else {
      bandNumber = data.band_number;
    }
  } catch (e) {
    console.error("사용자 정보 조회 중 오류", e, { userId });
  }

  let allPosts = [];
  let nextParams = {};
  let hasMore = true;
  const apiPageLimit = 20;

  while (hasMore && allPosts.length < limit) {
    const currentLimit = Math.min(apiPageLimit, limit - allPosts.length);

    // Failover를 사용한 API 호출
    const apiCall = async (accessToken, bandKey) => {
      const params = {
        access_token: accessToken,
        limit: currentLimit.toString(),
        ...nextParams
      };

      if (bandKey) {
        params.band_key = bandKey;
      }

      let result;

      // 브라우저 환경에서는 프록시 사용
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            endpoint: '/band/posts',
            params,
            method: 'GET'
          })
        });

        if (!response.ok) {
          throw new Error(
            `Band API error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      } else {
        // 서버 환경에서는 직접 호출
        const apiUrl = new URL(BAND_POSTS_API_URL);
        Object.entries(params).forEach(([key, value]) =>
          apiUrl.searchParams.set(key, value)
        );

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(
            `Band API error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      }

      if (result.result_code !== 1 || !result.result_data) {
        throw new Error(
          `Band API logical error: ${result.result_code} - ${JSON.stringify(result.result_data)}`
        );
      }

      return result.result_data;
    };

    try {
      const data = await bandApiFailover.executeWithFailover(apiCall, "get_posts", currentLimit);
      const items = data.items || [];

      const processedPosts = items.map((post) => ({
        postKey: post.post_key,
        bandKey: post.band_key || bandApiFailover.getCurrentApiKey()?.band_key,
        author: post.author ? {
          name: post.author.name,
          description: post.author.description || "",
          role: post.author.role || "",
          user_key: post.author.user_key || "",
          profile_image_url: post.author.profile_image_url || ""
        } : null,
        content: post.content || "",
        createdAt: post.created_at,
        commentCount: post.comment_count ?? 0,
        emotion_count: post.emotion_count ?? 0,
        status: "활성",
        postedAt: post.created_at,
        photos: post.photos || [],
        photoUrls: post.photos?.map((p) => p.url) || [],
        latest_comments: post.latest_comments ? post.latest_comments.map((comment) => ({
          body: comment.body || "",
          author: comment.author ? {
            name: comment.author.name || "",
            description: comment.author.description || "",
            role: comment.author.role || "",
            user_key: comment.author.user_key || "",
            profile_image_url: comment.author.profile_image_url || ""
          } : null,
          created_at: comment.created_at || 0
        })) : []
      }));

      allPosts = allPosts.concat(processedPosts);

      // 다음 페이지 처리
      if (data.paging && data.paging.next_params && allPosts.length < limit) {
        nextParams = data.paging.next_params;
        hasMore = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error("Band posts fetch 실패", error, { userId });
      hasMore = false;
    }
  }

  console.info(`게시물 가져오기 완료`, { count: allPosts.length, userId });

  return {
    posts: allPosts.slice(0, limit),
    bandKey: bandApiFailover.getCurrentApiKey()?.band_key || "",
    bandNumber: bandNumber || ""
  };
}

/**
 * Failover를 사용한 Band 댓글 가져오기
 * bandApiFailover 객체를 사용하여 다중 토큰/키 failover 지원
 *
 * @param {Object} bandApiFailover - Band API Failover 객체
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<{comments: Array, latestTimestamp: number|null}>} 댓글 목록 및 최신 타임스탬프
 */
export async function fetchBandCommentsWithFailover(bandApiFailover, userId, postKey, bandKey, supabase) {
  const fetchWithFailoverKeys = async () => {
    let allComments = [];
    let nextParams = {};
    let hasMore = true;
    let latestTs = null;
    const apiPageLimit = 50;

    while (hasMore) {
      // Failover를 사용한 API 호출
      const apiCall = async (accessToken, bandKey) => {
        const params = {
          access_token: accessToken,
          band_key: bandKey,
          post_key: postKey,
          limit: apiPageLimit.toString(),
          ...nextParams
        };

        console.log('[Band API 댓글 요청] 실제 전송 파라미터:', {
          endpoint: 'https://openapi.band.us/v2.1/band/post/comments',
          params: {
            ...params,
            access_token: params.access_token ? '(있음)' : '(없음)'
          }
        });

        let result;

        // 브라우저 환경에서는 프록시 사용
        if (typeof window !== 'undefined') {
          const response = await fetch('/api/band-api', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              endpoint: '/band/post/comments',
              params,
              method: 'GET'
            })
          });

          if (!response.ok) {
            throw new Error(
              `Band API comments error: ${response.statusText} - ${await response.text()}`
            );
          }

          result = await response.json();
        } else {
          // 서버 환경에서는 직접 호출
          const apiUrl = new URL(COMMENTS_API_URL);
          Object.entries(params).forEach(([key, value]) =>
            apiUrl.searchParams.set(key, value)
          );

          const response = await fetch(apiUrl.toString(), {
            method: "GET",
            headers: {
              Accept: "application/json"
            }
          });

          if (!response.ok) {
            throw new Error(
              `Band API comments error: ${response.statusText} - ${await response.text()}`
            );
          }

          result = await response.json();
        }

        if (result.result_code !== 1 || !result.result_data) {
          throw new Error(`Band API comments logical error: ${result.result_code}`);
        }

        console.log('[Band API 댓글 응답] 전체 응답 구조:', {
          result_code: result.result_code,
          result_data_keys: Object.keys(result.result_data),
          items_count: result.result_data.items?.length || 0,
          paging: result.result_data.paging,
          first_item_raw: result.result_data.items?.[0]
        });

        return result.result_data;
      };

      const data = await bandApiFailover.executeWithFailover(apiCall, "get_comments", apiPageLimit);
      const items = data.items || [];

      console.log('[대댓글 디버그 1-Failover] Band API 응답 받음:', {
        items_count: items.length,
        has_latest_comments: items.some(c => c.latest_comments && c.latest_comments.length > 0),
        first_item_structure: items[0] ? {
          comment_key: items[0].comment_key,
          has_latest_comments_field: 'latest_comments' in items[0],
          latest_comments_value: items[0].latest_comments,
          all_keys: Object.keys(items[0])
        } : null
      });

      const processed = items.flatMap((c, index) => {
        const ts = c.created_at;
        if (ts && (latestTs === null || ts > latestTs)) latestTs = ts;

        // 대댓글 정보 로깅
        const hasReplies = c.latest_comments && Array.isArray(c.latest_comments) && c.latest_comments.length > 0;
        if (hasReplies) {
          console.log(`[대댓글 디버그 2-Failover] 댓글 #${index} (${c.comment_key})에 대댓글 발견:`, {
            parent_content: c.content?.substring(0, 30),
            parent_author: c.author?.name,
            replies_count: c.latest_comments.length,
            replies: c.latest_comments.map(r => ({
              author: r.author?.name,
              body: r.body?.substring(0, 30),
              created_at: r.created_at
            }))
          });
        }

        // 메인 댓글
        const mainComment = {
          commentKey: c.comment_key,
          postKey: postKey,
          bandKey: bandKey,
          author: c.author ? {
            name: c.author.name,
            userNo: c.author.user_key,
            user_key: c.author.user_key,
            profileImageUrl: c.author.profile_image_url
          } : null,
          content: c.content,
          createdAt: ts
        };

        // 대댓글 처리 (v2.1 API)
        const replies = [];
        if (c.latest_comments && Array.isArray(c.latest_comments)) {
          const parentAuthorName = c.author?.name || '';

          c.latest_comments.forEach((reply, replyIndex) => {
            const replyTs = reply.created_at;
            if (replyTs && (latestTs === null || replyTs > latestTs)) latestTs = replyTs;

            const processedReply = {
              commentKey: `${c.comment_key}_${replyTs}`, // 타임스탬프 기반 고유 ID
              postKey: postKey,
              bandKey: bandKey,
              author: reply.author ? {
                name: reply.author.name,
                userNo: reply.author.user_key,
                user_key: reply.author.user_key,
                profileImageUrl: reply.author.profile_image_url
              } : null,
              content: `${parentAuthorName} ${reply.body}`, // 부모 작성자 + 대댓글 내용
              createdAt: replyTs
            };

            console.log(`[대댓글 디버그 3-Failover] 대댓글 #${replyIndex} 변환 완료:`, {
              original_body: reply.body,
              processed_content: processedReply.content,
              comment_key: processedReply.commentKey
            });

            replies.push(processedReply);
          });
        }

        const result = [mainComment, ...replies];
        if (replies.length > 0) {
          console.log(`[대댓글 디버그 4-Failover] 댓글 처리 결과:`, {
            main_comment: mainComment.commentKey,
            replies_count: replies.length,
            total_returned: result.length
          });
        }

        return result;
      });

      console.log('[대댓글 디버그 5-Failover] flatMap 처리 완료:', {
        original_items: items.length,
        processed_comments: processed.length,
        difference: processed.length - items.length
      });

      allComments = allComments.concat(processed);

      console.log('[대댓글 디버그 6-Failover] 현재까지 누적 댓글:', {
        total_comments: allComments.length
      });

      if (data.paging && data.paging.next_params) {
        nextParams = data.paging.next_params;
        hasMore = true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        hasMore = false;
      }
    }

    console.log('[대댓글 디버그 7-Failover] 최종 결과:', {
      total_comments: allComments.length,
      latestTimestamp: latestTs
    });

    return {
      comments: allComments,
      latestTimestamp: latestTs
    };
  };

  // 1차: failover 키 사용, 실패 시 backup access token으로 재시도
  try {
    return await fetchWithFailoverKeys();
  } catch (primaryError) {
    console.warn(
      `[Band API 댓글] Failover 경로 실패, band_backup_access_token으로 재시도: ${primaryError.message}`
    );

    const fallbackResult = await fetchBandCommentsWithBackupFallback(
      userId,
      postKey,
      bandKey,
      supabase
    );

    return {
      ...fallbackResult,
      usedBackupFallback: true
    };
  }
}

/**
 * Band 게시물 가져오기 (단일 토큰)
 * Failover 없이 사용자의 단일 토큰으로만 동작
 *
 * @param {string} userId - 사용자 ID
 * @param {number} limit - 가져올 게시물 수
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<{posts: Array, bandKey: string, bandNumber: string}>} 게시물 목록 및 메타데이터
 */
export async function fetchBandPosts(userId, limit, supabase) {
  console.info(`사용자 ${userId}의 밴드 게시물 가져오기`, { userId, limit });

  let bandAccessToken = null;
  let bandKey = null;
  let bandNumber = null;

  try {
    // 사용자 토큰 및 키 조회
    const { data, error } = await supabase
      .from("users")
      .select("band_access_token, band_key, band_number")
      .eq("user_id", userId)
      .single();

    if (error || !data?.band_access_token) {
      throw new Error(
        `Band access token not found or DB error for user ${userId}: ${error?.message}`
      );
    }

    bandAccessToken = data.band_access_token;
    bandKey = data.band_key;
    bandNumber = data.band_number;
  } catch (e) {
    console.error("Band 자격 증명 조회 실패", e, { userId });
    throw e;
  }

  let allPosts = [];
  let nextParams = {};
  let hasMore = true;
  const apiPageLimit = 20;

  while (hasMore && allPosts.length < limit) {
    const currentLimit = Math.min(apiPageLimit, limit - allPosts.length);

    const params = {
      access_token: bandAccessToken,
      limit: currentLimit.toString(),
      ...nextParams
    };

    if (bandKey) {
      params.band_key = bandKey;
    }

    try {
      let result;

      // 브라우저 환경에서는 프록시 사용
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            endpoint: '/band/posts',
            params,
            method: 'GET'
          })
        });

        if (!response.ok) {
          throw new Error(
            `Band API error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      } else {
        // 서버 환경에서는 직접 호출
        const apiUrl = new URL(BAND_POSTS_API_URL);
        Object.entries(params).forEach(([key, value]) =>
          apiUrl.searchParams.set(key, value)
        );

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(
            `Band API error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      }

      if (result.result_code !== 1 || !result.result_data) {
        throw new Error(
          `Band API logical error: ${result.result_code} - ${JSON.stringify(result.result_data)}`
        );
      }

      const data = result.result_data;
      const items = data.items || [];

      const processedPosts = items.map((post) => ({
        postKey: post.post_key,
        bandKey: post.band_key || bandKey,
        author: post.author ? {
          name: post.author.name,
          description: post.author.description || "",
          role: post.author.role || "",
          user_key: post.author.user_key || "",
          profile_image_url: post.author.profile_image_url || ""
        } : null,
        content: post.content || "",
        createdAt: post.created_at,
        commentCount: post.comment_count ?? 0,
        emotion_count: post.emotion_count ?? 0,
        status: "활성",
        postedAt: post.created_at,
        photos: post.photos || [],
        photoUrls: post.photos?.map((p) => p.url) || [],
        latest_comments: post.latest_comments ? post.latest_comments.map((comment) => ({
          body: comment.body || "",
          author: comment.author ? {
            name: comment.author.name || "",
            description: comment.author.description || "",
            role: comment.author.role || "",
            user_key: comment.author.user_key || "",
            profile_image_url: comment.author.profile_image_url || ""
          } : null,
          created_at: comment.created_at || 0
        })) : []
      }));

      allPosts = allPosts.concat(processedPosts);

      // 다음 페이지 처리
      if (data.paging && data.paging.next_params && allPosts.length < limit) {
        nextParams = data.paging.next_params;
        hasMore = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error("Band posts fetch 실패", error, { userId });
      hasMore = false;
    }
  }

  console.info(`게시물 가져오기 완료`, { count: allPosts.length, userId });

  return {
    posts: allPosts.slice(0, limit),
    bandKey: bandKey || "",
    bandNumber: bandNumber || ""
  };
}

/**
 * Band 댓글 가져오기 (단일 토큰)
 * Failover 없이 사용자의 단일 토큰으로만 동작
 *
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {Object} supabase - Supabase 클라이언트
 * @returns {Promise<{comments: Array, latestTimestamp: number|null}>} 댓글 목록 및 최신 타임스탬프
 */
export async function fetchBandComments(userId, postKey, bandKey, supabase) {
  let bandAccessToken = null;

  try {
    // 토큰 조회
    const { data, error } = await supabase
      .from("users")
      .select("band_access_token")
      .eq("user_id", userId)
      .single();

    if (error || !data?.band_access_token) {
      throw new Error(`Band token not found for user ${userId}: ${error?.message}`);
    }

    bandAccessToken = data.band_access_token;
  } catch (e) {
    console.error("댓글용 토큰 조회 실패", e, { userId });
    throw e;
  }

  let allComments = [];
  let nextParams = {};
  let hasMore = true;
  let latestTs = null;
  const apiPageLimit = 50;

  while (hasMore) {
    const params = {
      access_token: bandAccessToken,
      band_key: bandKey,
      post_key: postKey,
      limit: apiPageLimit.toString(),
      ...nextParams
    };

    try {
      let result;

      // 브라우저 환경에서는 프록시 사용
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            endpoint: '/band/post/comments',
            params,
            method: 'GET'
          })
        });

        if (!response.ok) {
          throw new Error(
            `Band API comments error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      } else {
        // 서버 환경에서는 직접 호출
        const apiUrl = new URL(COMMENTS_API_URL);
        Object.entries(params).forEach(([key, value]) =>
          apiUrl.searchParams.set(key, value)
        );

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(
            `Band API comments error: ${response.statusText} - ${await response.text()}`
          );
        }

        result = await response.json();
      }

      if (result.result_code !== 1 || !result.result_data) {
        throw new Error(`Band API comments logical error: ${result.result_code}`);
      }

      const data = result.result_data;
      const items = data.items || [];

      console.log('[대댓글 디버그 1-Single] Band API 응답 받음:', {
        items_count: items.length,
        has_latest_comments: items.some(c => c.latest_comments && c.latest_comments.length > 0)
      });

      const processed = items.flatMap((c, index) => {
        const ts = c.created_at;
        if (ts && (latestTs === null || ts > latestTs)) latestTs = ts;

        // 대댓글 정보 로깅
        const hasReplies = c.latest_comments && Array.isArray(c.latest_comments) && c.latest_comments.length > 0;
        if (hasReplies) {
          console.log(`[대댓글 디버그 2-Single] 댓글 #${index} (${c.comment_key})에 대댓글 발견:`, {
            parent_content: c.content?.substring(0, 30),
            parent_author: c.author?.name,
            replies_count: c.latest_comments.length,
            replies: c.latest_comments.map(r => ({
              author: r.author?.name,
              body: r.body?.substring(0, 30),
              created_at: r.created_at
            }))
          });
        }

        // 메인 댓글
        const mainComment = {
          commentKey: c.comment_key,
          postKey: postKey,
          bandKey: bandKey,
          author: c.author ? {
            name: c.author.name,
            userNo: c.author.user_key,
            user_key: c.author.user_key,
            profileImageUrl: c.author.profile_image_url
          } : null,
          content: c.content,
          createdAt: ts
        };

        // 대댓글 처리 (v2.1 API)
        const replies = [];
        if (c.latest_comments && Array.isArray(c.latest_comments)) {
          const parentAuthorName = c.author?.name || '';

          c.latest_comments.forEach((reply, replyIndex) => {
            const replyTs = reply.created_at;
            if (replyTs && (latestTs === null || replyTs > latestTs)) latestTs = replyTs;

            const processedReply = {
              commentKey: `${c.comment_key}_${replyTs}`, // 타임스탬프 기반 고유 ID
              postKey: postKey,
              bandKey: bandKey,
              author: reply.author ? {
                name: reply.author.name,
                userNo: reply.author.user_key,
                user_key: reply.author.user_key,
                profileImageUrl: reply.author.profile_image_url
              } : null,
              content: `${parentAuthorName} ${reply.body}`, // 부모 작성자 + 대댓글 내용
              createdAt: replyTs
            };

            console.log(`[대댓글 디버그 3-Single] 대댓글 #${replyIndex} 변환 완료:`, {
              original_body: reply.body,
              processed_content: processedReply.content,
              comment_key: processedReply.commentKey
            });

            replies.push(processedReply);
          });
        }

        const result = [mainComment, ...replies];
        if (replies.length > 0) {
          console.log(`[대댓글 디버그 4-Single] 댓글 처리 결과:`, {
            main_comment: mainComment.commentKey,
            replies_count: replies.length,
            total_returned: result.length
          });
        }

        return result;
      });

      console.log('[대댓글 디버그 5-Single] flatMap 처리 완료:', {
        original_items: items.length,
        processed_comments: processed.length,
        difference: processed.length - items.length
      });

      allComments = allComments.concat(processed);

      console.log('[대댓글 디버그 6-Single] 현재까지 누적 댓글:', {
        total_comments: allComments.length
      });

      if (data.paging && data.paging.next_params) {
        nextParams = data.paging.next_params;
        hasMore = true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`댓글 가져오기 실패`, error, { postKey, bandKey });
      hasMore = false;
    }
  }

  console.log('[대댓글 디버그 7-Single] 최종 결과:', {
    total_comments: allComments.length,
    latestTimestamp: latestTs
  });

  return {
    comments: allComments,
    latestTimestamp: latestTs
  };
}
