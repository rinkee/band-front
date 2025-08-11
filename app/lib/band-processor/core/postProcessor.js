import { BandApiFailover } from './bandApiClient.js';
import { extractPickupDate } from '../shared/utils/dateUtils.js';
import { savePostAndProducts } from '../shared/db/saveHelpers.js';

/**
 * 게시물 처리 모듈
 */

/**
 * Band 게시물을 가져옵니다
 * @param {Object} params - 파라미터
 * @returns {Promise<Object>} 게시물 데이터
 */
export async function fetchBandPostsWithFailover({
  supabase,
  userId,
  limit = 20,
  sessionId
}) {
  console.log(`[게시물 가져오기] 사용자 ${userId}의 게시물 ${limit}개 가져오기`);
  
  try {
    const failover = new BandApiFailover(supabase, userId, sessionId);
    await failover.loadApiKeys();
    await failover.startSession();
    
    const result = await failover.fetchBandPosts(limit);
    
    await failover.endSession(true);
    
    console.log(`[게시물 가져오기] ${result.posts?.length || 0}개 게시물 가져옴`);
    
    // success 필드 추가
    return {
      success: true,
      posts: result.posts || [],
      error: null
    };
    
  } catch (error) {
    console.error('[게시물 가져오기] 오류:', error);
    return {
      success: false,
      posts: [],
      error: error.message
    };
  }
}

/**
 * 게시물과 상품 정보를 저장합니다
 * @param {Object} params - 파라미터
 * @returns {Promise<Object>} 저장 결과
 */
export async function savePostAndProductsData({
  supabase,
  postData,
  products
}) {
  try {
    const result = await savePostAndProducts(supabase, postData, products);
    
    if (result.success) {
      console.log(`[게시물 저장] 게시물과 ${products.length}개 상품 저장 완료`);
    } else {
      console.error('[게시물 저장] 저장 실패:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('[게시물 저장] 예외 발생:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 게시물 데이터를 정규화합니다
 * @param {Object} post - Band API 게시물 데이터
 * @param {string} bandNumber - 밴드 번호
 * @param {string} userId - 사용자 ID
 * @returns {Object} 정규화된 게시물 데이터
 */
export function normalizePostData(post, bandNumber, userId) {
  if (!post) return null;
  
  const postKey = post.post_key || post.key;
  const content = post.content || "";
  
  // Band API에서 오는 타임스탬프를 ISO 문자열로 변환
  let createdAt = post.created_at || post.written_at;
  if (createdAt) {
    // 숫자형 타임스탬프인 경우 Date 객체로 변환 후 ISO 문자열로
    if (typeof createdAt === 'number' || typeof createdAt === 'string' && /^\d+$/.test(createdAt)) {
      createdAt = new Date(parseInt(createdAt)).toISOString();
    } else if (typeof createdAt === 'string') {
      // 이미 문자열인 경우 그대로 사용 (ISO 형식이어야 함)
      createdAt = createdAt;
    }
  } else {
    createdAt = new Date().toISOString();
  }
  
  // 픽업 날짜 추출
  const pickupDate = extractPickupDate(content, createdAt);
  
  // 제목 추출 (content의 첫 줄 또는 처음 50자)
  const title = content ? content.split('\n')[0].substring(0, 100) : null;
  
  return {
    post_id: postKey,
    post_key: postKey,
    band_key: post.band_key || bandNumber, // band_key가 없으면 bandNumber 사용
    band_number: bandNumber,
    user_id: userId,
    title: title, // title 필드 추가
    content: content,
    author_name: post.author?.name || "알수없음",
    author_user_key: post.author?.user_key || null,
    author_id: post.author?.user_key || null,
    band_post_url: post.url || null,
    photos_data: extractPhotoUrls(post),
    comment_count: post.comment_count || 0,
    comment_count_actual: 0, // 실제 댓글 수는 나중에 업데이트
    view_count: post.view_count || 0,
    emotion_count: post.emotion_count || 0,
    latest_comments: post.latest_comments || [],
    keyword_mappings: null, // 키워드 매핑은 상품 추출 후 설정
    posted_at: createdAt,
    updated_at: new Date().toISOString(),
    comment_sync_status: 'pending',
    ai_extraction_status: 'pending',
    order_needs_ai: false, // 기본값 false, AI 추출 후 업데이트됨
    order_needs_ai_reason: null
  };
}

/**
 * 게시물에서 사진 URL을 추출합니다
 * @param {Object} post - 게시물 객체
 * @returns {Array} 사진 URL 배열
 */
function extractPhotoUrls(post) {
  const urls = [];
  
  // photos 배열 체크
  if (post.photos && Array.isArray(post.photos)) {
    for (const photo of post.photos) {
      if (photo.url) {
        urls.push(photo.url);
      }
    }
  }
  
  // photo 객체 체크
  if (post.photo && post.photo.url) {
    urls.push(post.photo.url);
  }
  
  // content에서 이미지 URL 추출
  if (post.content) {
    const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi;
    const matches = post.content.match(imageUrlPattern);
    if (matches) {
      urls.push(...matches);
    }
  }
  
  // 중복 제거하고 JSONB 형식으로 반환
  const uniqueUrls = [...new Set(urls)];
  return uniqueUrls.length > 0 ? uniqueUrls : null;
}

/**
 * 게시물이 처리 대상인지 확인합니다
 * @param {Object} post - 게시물 객체
 * @param {Object} options - 필터링 옵션
 * @returns {boolean} 처리 대상 여부
 */
export function shouldProcessPost(post, options = {}) {
  const {
    minCommentCount = 0,
    maxAgeHours = 72,
    excludeKeywords = [],
    includeKeywords = [],
  } = options;
  
  // 댓글 수 체크
  if (post.comment_count < minCommentCount) {
    return false;
  }
  
  // 게시물 나이 체크
  // Band API는 written_at을 사용하고, DB는 created_at을 사용
  // Band API의 written_at은 밀리초 타임스탬프
  let postTimestamp;
  if (post.written_at) {
    // Band API: written_at이 숫자형 타임스탬프
    postTimestamp = typeof post.written_at === 'number' ? post.written_at : parseInt(post.written_at);
  } else if (post.created_at) {
    // DB: created_at이 ISO 문자열
    postTimestamp = new Date(post.created_at).getTime();
  } else {
    postTimestamp = 0;
  }
  
  // 디버깅: 첫 번째 게시물의 날짜 필드 확인
  if (!post._debugged) {
    console.log('[shouldProcessPost] 게시물 날짜 필드 확인:', {
      post_key: post.post_key,
      written_at: post.written_at,
      created_at: post.created_at,
      postTimestamp: postTimestamp,
      postDate: new Date(postTimestamp).toISOString(),
      maxAgeHours: maxAgeHours
    });
    post._debugged = true;
  }
  
  const postAge = Date.now() - postTimestamp;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (postAge > maxAgeMs) {
    return false;
  }
  
  const content = post.content || "";
  
  // 제외 키워드 체크
  for (const keyword of excludeKeywords) {
    if (content.includes(keyword)) {
      return false;
    }
  }
  
  // 포함 키워드 체크 (있는 경우)
  if (includeKeywords.length > 0) {
    let hasKeyword = false;
    for (const keyword of includeKeywords) {
      if (content.includes(keyword)) {
        hasKeyword = true;
        break;
      }
    }
    if (!hasKeyword) {
      return false;
    }
  }
  
  return true;
}

/**
 * 게시물 처리 상태를 업데이트합니다
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} postId - 게시물 ID
 * @param {string} status - 처리 상태
 * @param {Object} additionalData - 추가 데이터
 * @returns {Promise<Object>} 업데이트 결과
 */
export async function updatePostProcessingStatus(
  supabase,
  postId,
  status,
  additionalData = {}
) {
  try {
    // processing_status 컬럼이 없을 수 있으므로 제거
    const updateData = {
      updated_at: new Date().toISOString(),
      ...additionalData
    };
    
    const { error } = await supabase
      .from('posts')
      .update(updateData)
      .eq('post_id', postId);
    
    if (error) {
      console.error('[게시물 상태 업데이트] 오류:', error);
      return { success: false, error };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[게시물 상태 업데이트] 예외:', error);
    return { success: false, error };
  }
}

/**
 * 최근 처리된 게시물을 조회합니다
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} bandNumber - 밴드 번호
 * @param {number} hours - 시간 범위
 * @returns {Promise<Set>} 처리된 게시물 ID 세트
 */
export async function getRecentlyProcessedPosts(supabase, bandNumber, hours = 24) {
  const processedPostIds = new Set();
  
  try {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('posts')
      .select('post_id')
      .eq('band_number', bandNumber)
      .gte('updated_at', cutoffTime);
    
    if (error) {
      console.error('[최근 처리 게시물] 조회 오류:', error);
      return processedPostIds;
    }
    
    if (data && data.length > 0) {
      for (const post of data) {
        processedPostIds.add(post.post_id);
      }
    }
    
    console.log(`[최근 처리 게시물] ${processedPostIds.size}개 게시물이 최근 ${hours}시간 내 처리됨`);
    
    return processedPostIds;
    
  } catch (error) {
    console.error('[최근 처리 게시물] 예외:', error);
    return processedPostIds;
  }
}

/**
 * 게시물 통계를 생성합니다
 * @param {Array} posts - 게시물 배열
 * @returns {Object} 게시물 통계
 */
export function generatePostStats(posts) {
  if (!posts || !Array.isArray(posts)) {
    return {
      totalPosts: 0,
      totalComments: 0,
      averageComments: 0,
      postsWithPhotos: 0,
      postsWithPickupDate: 0,
    };
  }
  
  let totalComments = 0;
  let postsWithPhotos = 0;
  let postsWithPickupDate = 0;
  
  for (const post of posts) {
    totalComments += post.comment_count || 0;
    
    if (post.photos && post.photos.length > 0) {
      postsWithPhotos++;
    }
    
    if (post.pickup_date) {
      postsWithPickupDate++;
    }
  }
  
  return {
    totalPosts: posts.length,
    totalComments,
    averageComments: posts.length > 0 
      ? Math.round(totalComments / posts.length) 
      : 0,
    postsWithPhotos,
    postsWithPickupDate,
  };
}