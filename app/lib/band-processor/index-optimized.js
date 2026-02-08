/**
 * Band 게시물 처리 최적화 버전
 * 병렬 처리를 통한 성능 개선
 */

import { extractOrdersFromComments } from './core/orderProcessor.js';
import { fetchBandCommentsWithBackupFallback } from './core/commentProcessor.js';
import { contentHasPriceIndicator } from './shared/utils/textUtils.js';
import { createLogger } from './shared/utils/logger.js';
import { savePostAndProducts, saveOrdersAndCustomersSafely } from './shared/db/saveHelpers.js';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('[BandProcessor]');

/**
 * Band 게시물 병렬 처리 (최적화 버전)
 */
export async function processBandPostsOptimized({
  supabaseUrl,
  supabaseKey,
  userId,
  bandNumber,
  limit = 20,
  useAI = true,
  sessionId
}) {
  logger.info(`[프론트엔드 처리 시작] userId: ${userId}, limit: ${limit}, useAI: ${useAI}`);
  
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // 통계 초기화
  const stats = {
    totalPosts: 0,
    processedPosts: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalCustomers: 0,
    errors: []
  };

  try {
    // 1. Band 게시물 가져오기
    const postsResponse = await fetch('/api/band-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userId}`,
        'x-user-id': userId,
      },
      body: JSON.stringify({
        endpoint: '/band/posts',
        params: {
          band_key: bandNumber,
          locale: 'ko_KR',
          limit
        }
      })
    });

    if (!postsResponse.ok) {
      throw new Error(`Band API 오류: ${postsResponse.status}`);
    }

    const postsData = await postsResponse.json();
    const posts = postsData?.result_data?.items || [];
    stats.totalPosts = posts.length;

    logger.info(`[게시물 가져오기] ${posts.length}개 게시물 조회됨`);

    // 2. 게시물 병렬 처리를 위한 배치 분할
    const BATCH_SIZE = 5; // 동시에 처리할 게시물 수
    const batches = [];
    
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      batches.push(posts.slice(i, i + BATCH_SIZE));
    }

    logger.info(`[배치 처리] ${batches.length}개 배치로 분할 (배치당 ${BATCH_SIZE}개)`);

    // 3. 각 배치를 순차적으로, 배치 내 게시물은 병렬로 처리
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info(`[배치 ${batchIndex + 1}/${batches.length}] ${batch.length}개 게시물 병렬 처리 시작`);
      
      const batchPromises = batch.map(async (post) => {
        try {
          return await processPostOptimized({
            post,
            supabase,
            userId,
            bandNumber,
            useAI,
            sessionId
          });
        } catch (error) {
          logger.error(`게시물 처리 실패: ${post.post_key}`, error);
          stats.errors.push({
            postKey: post.post_key,
            error: error.message
          });
          return null;
        }
      });

      // 배치 내 모든 게시물이 완료될 때까지 대기
      const batchResults = await Promise.allSettled(batchPromises);
      
      // 결과 집계
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { products, orders, customers } = result.value;
          stats.processedPosts++;
          stats.totalProducts += products || 0;
          stats.totalOrders += orders || 0;
          stats.totalCustomers += customers || 0;
        }
      });

      logger.info(`[배치 ${batchIndex + 1}/${batches.length}] 완료 - 누적 처리: ${stats.processedPosts}/${stats.totalPosts}`);
    }

    const elapsedTime = (Date.now() - startTime) / 1000;
    logger.info(`[처리 완료] ${elapsedTime}초 소요 - 게시물: ${stats.processedPosts}, 주문: ${stats.totalOrders}`);

    return {
      success: true,
      stats,
      message: `${stats.processedPosts}개 게시물 처리 완료`
    };

  } catch (error) {
    logger.error('처리 중 오류 발생', error);
    return {
      success: false,
      stats,
      message: error.message
    };
  }
}

/**
 * 개별 게시물 처리 (최적화 버전)
 */
async function processPostOptimized({
  post,
  supabase,
  userId,
  bandNumber,
  useAI,
  sessionId
}) {
  const postKey = post.post_key;
  const content = post.content || '';
  
  logger.info(`[게시물 처리] ${postKey} 시작`);

  // 1. 게시물 데이터 정규화 및 저장 (즉시 시작)
  const normalizedPost = {
    post_id: `${userId}_${bandNumber}_${postKey}`,
    post_key: postKey,
    user_id: userId,
    band_number: bandNumber,
    content: content,
    title: post.title || content.split('\n')[0].substring(0, 100),
    author: post.author?.name || 'Unknown',
    comment_count: post.comment_count || 0,
    posted_at: post.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_product: false,
    ai_extraction_status: 'pending',
    order_needs_ai: false,
    order_needs_ai_reason: null // 명시적으로 초기화
  };

  // 2. 가격 정보 체크
  const hasPriceInfo = contentHasPriceIndicator(content);
  
  let productInfoPromise = null;
  let productsToSave = [];

  // 3. 상품 추출 (가격 정보가 있는 경우만)
  if (hasPriceInfo) {
    if (useAI) {
      // AI 추출을 Promise로 시작 (await 없이)
      productInfoPromise = fetch('/api/ai/product-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content, 
          postKey,
          postTime: normalizedPost.posted_at
        })
      })
        .then(res => res.json())
        .then(productInfo => {
          if (productInfo && productInfo.products) {
            normalizedPost.is_product = true;
            normalizedPost.ai_extraction_status = 'success';
            normalizedPost.multiple_products = productInfo.multipleProducts;
            normalizedPost.order_needs_ai = productInfo.order_needs_ai || false;
            normalizedPost.order_needs_ai_reason = productInfo.order_needs_ai_reason || null;
            
            // 상품 데이터 준비
            productsToSave = productInfo.products.map((product, index) => ({
              product_id: `${normalizedPost.post_id}_${index + 1}`,
              post_id: normalizedPost.post_id,
              product_name: product.title,
              description: product.description || '',
              price: product.basePrice || 0,
              options: product.priceOptions || [],
              created_at: new Date().toISOString()
            }));
          }
          return productInfo;
        })
        .catch(error => {
          logger.error(`AI 추출 실패: ${postKey}`, error);
          normalizedPost.ai_extraction_status = 'failed';
          return null;
        });
    } else {
      // AI를 사용하지 않는 경우 기본 상품 생성
      normalizedPost.is_product = true;
      productsToSave = [{
        product_id: `${normalizedPost.post_id}_1`,
        post_id: normalizedPost.post_id,
        product_name: normalizedPost.title,
        description: content,
        price: 0,
        options: [],
        created_at: new Date().toISOString()
      }];
    }
  }

  // 4. 댓글 가져오기 (병렬로 시작)
  const commentsPromise = fetchBandCommentsWithBackupFallback({
    supabase,
    userId,
    postKey,
    bandKey: bandNumber,
    post,
    sessionId
  }).catch(error => {
    logger.error(`댓글 가져오기 실패: ${postKey}`, error);
    return [];
  });

  // 5. 게시물 즉시 저장 (상품 정보 없이)
  await savePostAndProducts(supabase, normalizedPost, []);

  // 6. 모든 비동기 작업 완료 대기
  const [comments, productInfo] = await Promise.all([
    commentsPromise,
    productInfoPromise
  ]);

  // 7. 상품 정보가 준비되면 업데이트
  if (productsToSave.length > 0) {
    await savePostAndProducts(supabase, normalizedPost, productsToSave);
  }

  // 8. 댓글에서 주문 처리 (상품이 있는 경우만)
  let orderCount = 0;
  let customerCount = 0;

  if (normalizedPost.is_product && comments.length > 0) {
    try {
      const ordersResult = await extractOrdersFromComments({
        comments,
        productInfo: productInfo || { products: productsToSave },
        postId: normalizedPost.post_id,
        postKey,
        supabase,
        userId,
        bandNumber,
        orderNeedsAi: normalizedPost.order_needs_ai
      });

      if (ordersResult.orders && ordersResult.orders.length > 0) {
        const saveResult = await saveOrdersAndCustomersSafely(
          supabase,
          ordersResult.orders,
          ordersResult.customers,
          { userId, bandNumber, postKey }
        );
        
        orderCount = saveResult.savedOrders || 0;
        customerCount = saveResult.savedCustomers || 0;
      }
    } catch (error) {
      logger.error(`주문 처리 실패: ${postKey}`, error);
    }
  }

  logger.info(`[게시물 처리 완료] ${postKey} - 상품: ${productsToSave.length}, 주문: ${orderCount}`);

  return {
    products: productsToSave.length,
    orders: orderCount,
    customers: customerCount
  };
}

// 기존 함수와의 호환성을 위해 export
export const processBandPosts = processBandPostsOptimized;
