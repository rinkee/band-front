/**
 * Band-Get-Posts 프론트엔드 메인 오케스트레이터
 * 백엔드 Edge Function의 모든 기능을 프론트엔드에서 구현
 */

import { createClient } from '@supabase/supabase-js';

// Core modules
import { BandApiFailover } from './core/bandApiClient.js';
import { 
  processCancellationComments,
  cancelPreviousOrders 
} from './core/cancellationProcessor.js';
import {
  processProduct,
  detectAndMergeQuantityBasedProducts,
  extractNumberedProducts,
  formatProductForDB,
  getDefaultProduct
} from './core/productProcessor.js';
import {
  fetchBandCommentsWithBackupFallback,
  filterAndCleanComments,
  sortCommentsByTime,
  groupCommentsByAuthor,
  generateCommentStats
} from './core/commentProcessor.js';
import {
  extractOrdersFromComments,
  fetchProductMapForPost
} from './core/orderProcessor.js';
import {
  fetchBandPostsWithFailover,
  normalizePostData,
  shouldProcessPost,
  updatePostProcessingStatus,
  getRecentlyProcessedPosts,
  generatePostStats
} from './core/postProcessor.js';

// Shared utilities
import { 
  saveOrdersAndCustomersSafely,
  savePostAndProducts
} from './shared/db/saveHelpers.js';
import { generateKimchiKeywordMappings } from './shared/matching/keywordMatching.js';
import { createLogger } from './shared/utils/logger.js';
import { contentHasPriceIndicator } from './shared/utils/textUtils.js';
import { extractPickupDate } from './shared/utils/dateUtils.js';

// 로거 초기화
const logger = createLogger('band-processor');

/**
 * Band 게시물 처리 메인 함수
 * @param {Object} options - 처리 옵션
 * @returns {Promise<Object>} 처리 결과
 */
export async function processBandPosts({
  supabaseUrl,
  supabaseKey,
  userId,
  bandNumber,
  limit = 20,
  useAI = true,
  processOptions = {},
  sessionId = null
}) {
  const startTime = Date.now();
  const results = {
    success: false,
    message: '',
    stats: {
      totalPosts: 0,
      processedPosts: 0,
      totalProducts: 0,
      totalOrders: 0,
      totalCustomers: 0,
      errors: [],
      processingTime: 0
    },
    data: {
      posts: [],
      products: [],
      orders: [],
      customers: []
    }
  };

  try {
    // Supabase 클라이언트 초기화
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    logger.info('Band 게시물 처리 시작', { userId, bandNumber, limit });

    // 1. Smart Priority: pending/failed 게시물 우선 처리
    const priorityPosts = await getPriorityPostsToProcess(supabase, userId);
    logger.info(`[Smart Priority] ${priorityPosts.size}개의 우선 처리 대상 게시물 발견`);
    
    // 2. 최근 처리된 게시물 조회 (중복 방지)
    const recentlyProcessed = await getRecentlyProcessedPosts(
      supabase, 
      bandNumber, 
      24
    );

    // 3. Band 게시물 가져오기
    const postsResult = await fetchBandPostsWithFailover({
      supabase,
      userId,
      limit,
      sessionId: sessionId || `session_${Date.now()}`
    });

    if (!postsResult.success || !postsResult.posts) {
      throw new Error(postsResult.error || '게시물을 가져올 수 없습니다');
    }

    const posts = postsResult.posts;
    results.stats.totalPosts = posts.length;
    logger.info(`${posts.length}개 게시물 가져옴`);

    // 게시물을 우선순위별로 정렬
    const sortedPosts = posts.sort((a, b) => {
      const aPriority = priorityPosts.has(a.post_key);
      const bPriority = priorityPosts.has(b.post_key);
      
      // 우선 처리 게시물이 먼저 오도록
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      
      // 둘 다 우선순위이거나 둘 다 아닌 경우, 댓글 수로 정렬
      return (b.comment_count || 0) - (a.comment_count || 0);
    });

    // 3. 각 게시물 처리
    for (const post of sortedPosts) {
      try {
        // Smart Priority 게시물인지 표시
        const isPriority = priorityPosts.has(post.post_key);
        if (isPriority) {
          logger.info(`[Smart Priority] 우선 처리 게시물: ${post.post_key}`);
        }
        
        // 이미 처리된 게시물인지 확인 (Smart Priority는 예외)
        if (!isPriority && recentlyProcessed.has(post.post_key)) {
          logger.info(`게시물 ${post.post_key}는 이미 처리됨`);
          continue;
        }

        // 처리 대상인지 확인 (Smart Priority는 항상 처리)
        if (!isPriority && !shouldProcessPost(post, processOptions)) {
          logger.info(`게시물 ${post.post_key}는 처리 대상이 아님`);
          continue;
        }

        // 게시물 처리
        const processResult = await processPost({
          supabase,
          userId,
          bandNumber,
          post,
          useAI,
          sessionId
        });

        if (processResult.success) {
          results.stats.processedPosts++;
          results.data.posts.push(processResult.post);
          results.data.products.push(...(processResult.products || []));
          results.data.orders.push(...(processResult.orders || []));
          
          // 고객 정보 병합
          for (const customer of (processResult.customers || [])) {
            const exists = results.data.customers.find(
              c => c.customer_id === customer.customer_id
            );
            if (!exists) {
              results.data.customers.push(customer);
            }
          }
        }
      } catch (postError) {
        logger.error(`게시물 ${post.post_key} 처리 오류`, postError);
        results.stats.errors.push({
          postKey: post.post_key,
          error: postError.message
        });
      }
    }

    // 4. 결과 집계
    results.stats.totalProducts = results.data.products.length;
    results.stats.totalOrders = results.data.orders.length;
    results.stats.totalCustomers = results.data.customers.length;
    results.stats.processingTime = Date.now() - startTime;

    results.success = true;
    results.message = `${results.stats.processedPosts}개 게시물 처리 완료`;

    logger.info('Band 게시물 처리 완료', results.stats);

  } catch (error) {
    logger.error('Band 게시물 처리 실패', error);
    results.message = error.message;
    results.stats.errors.push({
      general: error.message
    });
  }

  return results;
}

/**
 * 개별 게시물 처리 함수
 * @param {Object} params - 처리 파라미터
 * @returns {Promise<Object>} 처리 결과
 */
async function processPost({
  supabase,
  userId,
  bandNumber,
  post,
  useAI,
  sessionId
}) {
  const result = {
    success: false,
    post: null,
    products: [],
    orders: [],
    customers: []
  };

  try {
    const postKey = post.post_key;
    const bandKey = post.band_key;
    const content = post.content || "";

    logger.info(`게시물 처리 시작: ${postKey}`);

    // 1. 게시물 데이터 정규화
    const normalizedPost = normalizePostData(post, bandNumber, userId);
    
    // 2. 상품 정보 추출
    let productInfo = null;
    let orderNeedsAi = false;
    let orderNeedsAiReason = null;
    
    // 가격 정보 체크
    const hasPriceInfo = contentHasPriceIndicator(content);
    
    // 가격 정보가 없으면 상품 게시물이 아님
    if (!hasPriceInfo) {
      logger.info(`[상품 분류] 가격 정보 없음 - 비상품 게시물로 분류: ${postKey}`);
      normalizedPost.ai_extraction_status = 'not_product';
      normalizedPost.ai_classification_result = '공지사항';
      normalizedPost.is_product = false;  // is_product로 수정 (실제 DB 스키마와 일치)
      
      // 비상품 게시물은 상품 없이 처리
      productInfo = {
        multipleProducts: false,
        products: [],
        keywordMappings: {},
        order_needs_ai: false,
        order_needs_ai_reason: null
      };
    }
    // 가격 정보가 있는 경우에만 AI 추출 시도
    else if (useAI) {
      try {
        const aiResponse = await fetch('/api/ai/product-extraction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content,
            postTime: post.posted_at || post.written_at || new Date().toISOString(),
            postKey: postKey
          })
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          
          // AI API는 products와 keywordMappings를 반환
          if (aiResult.products && aiResult.products.length > 0) {
            const firstProduct = aiResult.products[0];
            
            // productInfo 구조 생성
            productInfo = {
              multipleProducts: aiResult.products.length > 1,
              products: aiResult.products,
              keywordMappings: aiResult.keywordMappings || {},
              order_needs_ai: firstProduct.order_needs_ai || false,
              order_needs_ai_reason: firstProduct.order_needs_ai_reason || null
            };
            
            orderNeedsAi = productInfo.order_needs_ai;
            orderNeedsAiReason = productInfo.order_needs_ai_reason;
            
            // AI 추출 상태 업데이트
            normalizedPost.ai_extraction_status = 'success';
            normalizedPost.ai_classification_result = '상품게시물';
            normalizedPost.is_product = true;  // is_product_post → is_product로 수정 (실제 DB 스키마와 일치)
            normalizedPost.keyword_mappings = productInfo.keywordMappings;
            normalizedPost.multiple_products = productInfo.multipleProducts;
            
            // products_data 구성
            normalizedPost.products_data = JSON.stringify({
              multipleProducts: productInfo.multipleProducts,
              products: productInfo.products,
              keywordMappings: productInfo.keywordMappings,
              order_needs_ai: orderNeedsAi,
              order_needs_ai_reason: orderNeedsAiReason,
              postTime: normalizedPost.posted_at || new Date().toISOString()
            });
            
            logger.info(`[AI 추출] 성공 - ${productInfo.products.length}개 상품 추출, order_needs_ai: ${orderNeedsAi}`);
          } else {
            logger.warn('[AI 추출] 상품 추출 실패 - 빈 응답');
            normalizedPost.ai_extraction_status = 'failed';
            normalizedPost.ai_classification_result = null;
          }
        } else {
          logger.error(`[AI 추출] API 응답 오류 - Status: ${aiResponse.status}`);
          normalizedPost.ai_extraction_status = 'failed';
          normalizedPost.ai_classification_result = null;
        }
      } catch (aiError) {
        logger.error('AI 상품 추출 실패', aiError);
        normalizedPost.ai_extraction_status = 'failed';
        normalizedPost.ai_classification_result = null;
      }
    }

    // AI 추출 실패 시 기본 상품 사용 (가격 정보가 있는 경우만)
    if (!productInfo && hasPriceInfo) {
      productInfo = getDefaultProduct("AI 추출 실패");
      normalizedPost.ai_extraction_status = normalizedPost.ai_extraction_status || 'failed';
    }
    
    // normalizedPost에 order_needs_ai 정보 업데이트
    normalizedPost.order_needs_ai = orderNeedsAi;
    normalizedPost.order_needs_ai_reason = orderNeedsAiReason;

    // 3. 상품 처리 (상품 게시물인 경우만)
    const products = [];
    let finalProducts = [];
    
    if (productInfo && productInfo.products && productInfo.products.length > 0) {
      if (productInfo.multipleProducts) {
        for (const prod of productInfo.products) {
          const processed = processProduct(
            prod, 
            normalizedPost.posted_at,
            null
          );
          products.push(processed);
        }
      } else {
        const processed = processProduct(
          productInfo.products[0],
          normalizedPost.posted_at,
          null
        );
        products.push(processed);
      }
      
      // 수량 기반 상품 병합
      const mergedProducts = detectAndMergeQuantityBasedProducts(products);
      
      // 번호 상품 추출
      finalProducts = extractNumberedProducts(content, mergedProducts);
    } else {
      // 비상품 게시물이거나 상품 추출 실패
      logger.info(`[상품 처리] 상품 없음 - 게시물 ${postKey}`);
    }

    // 4. 게시물과 상품 저장
    const saveResult = await savePostAndProducts(
      supabase,
      normalizedPost,
      finalProducts.map(p => formatProductForDB(p, postKey, bandNumber, userId))
    );

    if (!saveResult.success) {
      throw new Error(saveResult.error || '게시물 저장 실패');
    }

    result.post = normalizedPost;
    result.products = finalProducts;

    // 5. 댓글 처리 (상품 게시물인 경우만)
    if (finalProducts.length > 0 && normalizedPost.ai_classification_result !== '공지사항') {
      logger.info(`[댓글 처리] 게시물 ${postKey}의 댓글 가져오기 시작`);
      const comments = await fetchBandCommentsWithBackupFallback({
        supabase,
        userId,
        postKey,
        bandKey,
        post,
        sessionId
      });
      
      logger.info(`[댓글 처리] ${comments ? comments.length : 0}개 댓글 가져옴`);

      if (comments && comments.length > 0) {
        // 댓글 필터링 및 정리
        const filteredComments = filterAndCleanComments(comments);
        const sortedComments = sortCommentsByTime(filteredComments);
        
        logger.info(`[댓글 처리] 필터링 후 ${sortedComments.length}개 댓글 남음`);

        // 6. 취소 댓글 처리
        await processCancellationComments(
          supabase,
          userId,
          sortedComments,
          postKey,
          bandKey,
          bandNumber
        );

        // 7. 주문 추출
        // AI에서 추출한 keywordMappings가 있으면 사용, 없으면 기본 생성
        const keywordMappings = normalizedPost.keyword_mappings || generateKimchiKeywordMappings(finalProducts);
      
      // postInfo에 post_key와 band_key 추가
      const postInfo = {
        post_key: postKey,  // post_key 추가
        band_key: bandKey,  // band_key 추가
        products: finalProducts,
        keywordMappings,
        pickupDate: normalizedPost.pickup_date,
        pickupType: normalizedPost.pickup_type || "수령",
        order_needs_ai: orderNeedsAi,  // order_needs_ai 플래그 전달
        order_needs_ai_reason: orderNeedsAiReason
      };

      // order_needs_ai가 true인 경우 로그
      if (orderNeedsAi) {
        logger.info(`[AI 우선 처리] 게시물 ${postKey}는 order_needs_ai=true`, {
          reason: orderNeedsAiReason,
          productCount: finalProducts.length,
          commentCount: sortedComments.length
        });
      }

      const orderResult = await extractOrdersFromComments({
        postInfo,
        comments: sortedComments,
        userId,
        bandNumber,
        postId: postKey,
        useAI,
        apiEndpoint: '/api/ai/comment-analysis',
        forceAI: orderNeedsAi  // order_needs_ai가 true면 강제 AI 처리
      });
      
      logger.info(`[주문 추출] 결과:`, {
        totalOrders: orderResult.orders.length,
        patternOrders: orderResult.stats?.patternOrders || 0,
        aiOrders: orderResult.stats?.aiOrders || 0,
        customers: orderResult.customers.size
      });

      // 8. 주문과 고객 저장
      if (orderResult.orders.length > 0) {
        logger.info(`[주문 저장] ${orderResult.orders.length}개 주문, ${orderResult.customers.size}개 고객 저장 시작`);
        
        const saveOrderResult = await saveOrdersAndCustomersSafely(
          supabase,
          orderResult.orders,
          Array.from(orderResult.customers.values()),
          { userId, bandNumber, postKey }
        );

        if (saveOrderResult.success) {
          result.orders = orderResult.orders;
          result.customers = Array.from(orderResult.customers.values());
          logger.info(`[주문 저장] 성공`);
        } else {
          logger.error(`[주문 저장] 실패:`, saveOrderResult.error);
        }
      } else {
        logger.info(`[주문 저장] 추출된 주문이 없음`);
      }

      // 댓글 통계 생성
      const commentStats = generateCommentStats(sortedComments);
      logger.info(`댓글 통계`, commentStats);
    } else {
      logger.info(`[댓글 처리] 댓글이 없거나 모두 필터링됨 - 주문 추출 스킵`);
    }

    // 9. 처리 상태 업데이트 - 댓글 처리 완료 및 실제 댓글 수 업데이트
    await updatePostProcessingStatus(
      supabase,
      postKey,
      'completed',
      {
        comment_sync_status: 'completed',
        comment_count_actual: comments ? comments.length : 0,
        updated_at: new Date().toISOString()
      }
    );

    result.success = true;
    logger.info(`게시물 ${postKey} 처리 완료`);
  } 

 
}catch (error) {
  logger.error('게시물 처리 오류', error);
  result.error = error.message;
}
return result;
}

/**
 * 테스트용 함수 - 단일 게시물 처리
 */
async function testSinglePost({
  supabaseUrl,
  supabaseKey,
  userId,
  bandNumber,
  postKey
}) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 게시물 조회
    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('post_id', postKey)
      .eq('band_number', bandNumber)
      .single();

    if (error || !post) {
      throw new Error('게시물을 찾을 수 없습니다');
    }

    // 게시물 처리
    const result = await processPost({
      supabase,
      userId,
      bandNumber,
      post,
      useAI: true,
      sessionId: `test_${Date.now()}`
    });

    return result;

  } catch (error) {
    logger.error('테스트 실패', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Smart Priority 시스템: pending/failed 상태의 게시물을 우선 처리
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Set>} 우선 처리할 게시물 키 Set
 */
async function getPriorityPostsToProcess(supabase, userId) {
  const priorityPostKeys = new Set();
  
  try {
    // pending 또는 failed 상태의 게시물 조회
    const { data: pendingPosts, error } = await supabase
      .from('posts')
      .select('post_key, comment_count, comment_sync_status, order_needs_ai')
      .eq('user_id', userId)
      .in('comment_sync_status', ['pending', 'failed'])
      .order('comment_count', { ascending: false })
      .limit(100);
    
    if (error) {
      logger.error('[Smart Priority] 우선 처리 게시물 조회 실패', error);
      return priorityPostKeys;
    }
    
    if (pendingPosts && pendingPosts.length > 0) {
      // order_needs_ai=true인 게시물을 최우선으로
      const orderNeedsAiPosts = pendingPosts.filter(p => p.order_needs_ai === true);
      const otherPosts = pendingPosts.filter(p => p.order_needs_ai !== true);
      
      // order_needs_ai 게시물 먼저 추가
      for (const post of orderNeedsAiPosts) {
        priorityPostKeys.add(post.post_key);
      }
      
      // 나머지 게시물 추가
      for (const post of otherPosts) {
        priorityPostKeys.add(post.post_key);
      }
      
      logger.info(`[Smart Priority] order_needs_ai: ${orderNeedsAiPosts.length}개, 기타: ${otherPosts.length}개`);
    }
    
  } catch (error) {
    logger.error('[Smart Priority] 예외 발생', error);
  }
  
  return priorityPostKeys;
}

// Export all modules for direct access if needed
export {
  BandApiFailover,
  processCancellationComments,
  processProduct,
  extractOrdersFromComments,
  fetchBandCommentsWithBackupFallback,
  fetchBandPostsWithFailover,
  saveOrdersAndCustomersSafely,
  savePostAndProducts,
  getPriorityPostsToProcess,
  testSinglePost
};