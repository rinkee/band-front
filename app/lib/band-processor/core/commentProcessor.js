import { BandApiFailover } from './bandApiClient.js';

/**
 * 댓글 처리 모듈
 */

/**
 * Band 댓글을 가져옵니다 (백업 토큰 지원)
 * @param {Object} params - 파라미터
 * @param {Object} params.supabase - Supabase 클라이언트
 * @param {string} params.userId - 사용자 ID
 * @param {string} params.postKey - 게시물 키
 * @param {string} params.bandKey - 밴드 키
 * @param {Object} params.post - 게시물 정보
 * @param {string} params.sessionId - 세션 ID
 * @returns {Promise<Array>} 댓글 배열
 */
export async function fetchBandCommentsWithBackupFallback({
  supabase,
  userId,
  postKey,
  bandKey,
  post,
  sessionId
}) {
  console.log(`[댓글 가져오기] 게시물 ${postKey}의 댓글 처리 시작`);
  
  try {
    // latest_comments는 comment_key가 없는 축약된 정보이므로 사용하지 않음
    // 항상 전체 댓글 API를 호출하여 comment_key를 포함한 완전한 댓글 정보를 가져옴
    
    // BandApiFailover를 사용하여 댓글 가져오기
    const failover = new BandApiFailover(supabase, userId, sessionId);
    await failover.loadApiKeys();
    
    const result = await failover.fetchBandComments(postKey);
    const comments = result.comments || [];
    
    console.log(
      `[댓글 가져오기] API로 ${comments.length}개 댓글 가져옴 (comment_key 포함)`
    );
    
    return comments;
    
  } catch (error) {
    console.error(`[댓글 가져오기] 오류:`, error);
    
    // 에러 발생 시 빈 배열 반환
    return [];
  }
}

/**
 * 댓글을 필터링하고 정리합니다
 * @param {Array} comments - 원본 댓글 배열
 * @param {Object} options - 필터링 옵션
 * @returns {Array} 필터링된 댓글 배열
 */
export function filterAndCleanComments(comments, options = {}) {
  if (!comments || !Array.isArray(comments)) {
    return [];
  }
  
  const {
    excludeBotComments = true,
    excludeEmptyComments = true,
    minLength = 0,
  } = options;
  
  return comments
    .filter((comment) => {
      // 봇 댓글 제외
      if (excludeBotComments && isBotComment(comment)) {
        return false;
      }
      
      // 빈 댓글 제외
      const content = getCommentContent(comment);
      if (excludeEmptyComments && !content) {
        return false;
      }
      
      // 최소 길이 체크
      if (minLength > 0 && content.length < minLength) {
        return false;
      }
      
      return true;
    })
    .map(normalizeComment);
}

/**
 * 댓글이 봇 댓글인지 확인합니다
 * @param {Object} comment - 댓글 객체
 * @returns {boolean} 봇 댓글 여부
 */
function isBotComment(comment) {
  const authorName = comment.author?.name || comment.author_name || "";
  const content = getCommentContent(comment);
  
  // 봇 패턴
  const botPatterns = [
    /자동\s*응답/i,
    /bot/i,
    /알림\s*메시지/i,
    /시스템\s*메시지/i,
  ];
  
  return botPatterns.some((pattern) => 
    pattern.test(authorName) || pattern.test(content)
  );
}

/**
 * 댓글 내용을 추출합니다
 * @param {Object} comment - 댓글 객체
 * @returns {string} 댓글 내용
 */
export function getCommentContent(comment) {
  // Band API는 'content' 필드를 사용 (백엔드 확인)
  return comment.content || 
         comment.body || 
         comment.comment || 
         "";  
}

/**
 * 댓글 객체를 정규화합니다
 * @param {Object} comment - 원본 댓글 객체
 * @returns {Object} 정규화된 댓글 객체
 */
export function normalizeComment(comment) {
  const content = getCommentContent(comment);
  
  // Band API는 comment_key 필드를 제공함
  // Band API 응답 구조: comment_key, content, author.user_key 등
  const commentKey = comment.comment_key || comment.commentKey || comment.key;
  
  if (!commentKey || commentKey === 'undefined' || commentKey === 'null') {
    // 댓글 고유 키가 없으면 대체 키 생성 (비정상 상황)
    const authorKey = comment.author?.user_key || comment.author_user_no || 'unknown';
    const createdAt = comment.created_at || comment.written_at || Date.now();
    const generatedKey = `${authorKey}_${createdAt}`;
    console.warn('[WARNING] comment_key 누락! 대체 키 생성:', generatedKey);
    return {
      commentKey: generatedKey,
      content: content.trim(),
      author: {
        userNo: comment.author?.user_key || comment.author_user_no || comment.authorUserNo,
        name: comment.author?.name || comment.author_name || "알수없음",
      },
      createdAt: comment.created_at || comment.createdAt || comment.written_at,
      _original: comment,
    };
  }
  
  // 정상적으로 comment_key가 있는 경우
  return {
    commentKey: commentKey,
    content: content.trim(),
    author: {
      userNo: comment.author?.user_key || 
              comment.author_user_no || 
              comment.authorUserNo,
      name: comment.author?.name || 
            comment.author_name || 
            "알수없음",
      userId: comment.author?.member_key || null,
      profileImageUrl: comment.author?.profile_image_url || null,
    },
    createdAt: comment.created_at || 
               comment.createdAt || 
               comment.written_at,
    // 원본 데이터 보존
    _original: comment,
  };
}

/**
 * 댓글을 시간순으로 정렬합니다
 * @param {Array} comments - 댓글 배열
 * @param {string} order - 정렬 순서 ('asc' 또는 'desc')
 * @returns {Array} 정렬된 댓글 배열
 */
export function sortCommentsByTime(comments, order = 'asc') {
  if (!comments || !Array.isArray(comments)) {
    return [];
  }
  
  const sorted = [...comments].sort((a, b) => {
    // 정규화된 댓글의 createdAt 필드 또는 원본 필드 사용
    const timeA = new Date(a.createdAt || a.created_at || a.written_at || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || b.written_at || 0).getTime();
    
    return order === 'asc' ? timeA - timeB : timeB - timeA;
  });
  
  return sorted;
}

/**
 * 작성자별로 댓글을 그룹화합니다
 * @param {Array} comments - 댓글 배열
 * @returns {Map} 작성자별 댓글 맵
 */
export function groupCommentsByAuthor(comments) {
  const authorMap = new Map();
  
  if (!comments || !Array.isArray(comments)) {
    return authorMap;
  }
  
  for (const comment of comments) {
    const authorKey = comment.author?.userNo || 'unknown';
    
    if (!authorMap.has(authorKey)) {
      authorMap.set(authorKey, []);
    }
    
    authorMap.get(authorKey).push(comment);
  }
  
  return authorMap;
}

/**
 * 댓글에서 전화번호를 추출합니다
 * @param {string} content - 댓글 내용
 * @returns {string|null} 추출된 전화번호
 */
export function extractPhoneNumber(content) {
  if (!content) return null;
  
  // 전화번호 패턴
  const phonePatterns = [
    /010[-\s]?\d{4}[-\s]?\d{4}/,
    /011[-\s]?\d{3,4}[-\s]?\d{4}/,
    /\d{3}[-\s]?\d{3,4}[-\s]?\d{4}/,
  ];
  
  for (const pattern of phonePatterns) {
    const match = content.match(pattern);
    if (match) {
      // 하이픈과 공백 제거
      return match[0].replace(/[-\s]/g, '');
    }
  }
  
  return null;
}

/**
 * 댓글 통계를 생성합니다
 * @param {Array} comments - 댓글 배열
 * @returns {Object} 댓글 통계
 */
export function generateCommentStats(comments) {
  if (!comments || !Array.isArray(comments)) {
    return {
      totalComments: 0,
      uniqueAuthors: 0,
      averageLength: 0,
      withPhoneNumbers: 0,
    };
  }
  
  const authorSet = new Set();
  let totalLength = 0;
  let phoneNumberCount = 0;
  
  for (const comment of comments) {
    const content = getCommentContent(comment);
    
    // 작성자 추가
    if (comment.author?.userNo) {
      authorSet.add(comment.author.userNo);
    }
    
    // 길이 누적
    totalLength += content.length;
    
    // 전화번호 체크
    if (extractPhoneNumber(content)) {
      phoneNumberCount++;
    }
  }
  
  return {
    totalComments: comments.length,
    uniqueAuthors: authorSet.size,
    averageLength: comments.length > 0 
      ? Math.round(totalLength / comments.length) 
      : 0,
    withPhoneNumbers: phoneNumberCount,
  };
}