import { generateOrderUniqueId, generateCustomerUniqueId } from '../shared/utils/idUtils.js';
import { extractOrderByKeywordMatching } from '../shared/matching/keywordMatching.js';
import { extractOrderByUnitPattern } from '../shared/matching/productMatching.js';
import { extractQuantityFromComment, checkNumberPatternOnly } from '../shared/patterns/orderPatternExtraction.js';
import { extractPhoneNumber, getCommentContent } from './commentProcessor.js';

/**
 * 주문 처리 모듈
 */

/**
 * 댓글에서 주문을 추출합니다 (오케스트레이션)
 * @param {Object} params - 파라미터
 * @returns {Promise<Object>} 주문 추출 결과
 */
export async function extractOrdersFromComments({
  postInfo,
  comments,
  userId,
  bandNumber,
  postId,
  useAI = true,
  apiEndpoint = '/api/ai/comment-analysis',
  forceAI = false  // order_needs_ai=true일 때 강제 AI 처리
}) {
  const results = {
    orders: [],
    customers: new Map(),
    stats: {
      totalComments: comments.length,
      patternOrders: 0,
      aiOrders: 0,
      totalOrders: 0,
    }
  };
  
  if (!comments || comments.length === 0) {
    return results;
  }
  
  // order_needs_ai가 true면 패턴 추출 스킵하고 바로 AI 처리
  if (forceAI || postInfo.order_needs_ai === true) {
    console.log(`[AI 우선 처리] order_needs_ai=true, 모든 댓글 AI 처리`);
    // 패턴 추출 스킵
  } else {
    // 1. 패턴 기반 주문 추출
    const patternOrders = extractOrdersByPatterns(postInfo, comments, userId, bandNumber, postId);
    results.orders.push(...patternOrders.orders);
    results.stats.patternOrders = patternOrders.orders.length;
    
    // 패턴으로 추출된 고객 정보 저장
    for (const [customerId, customer] of patternOrders.customers) {
      results.customers.set(customerId, customer);
    }
  }
  
  // 2. AI 기반 주문 추출
  if (useAI && (forceAI || shouldUseAI(postInfo))) {
    try {
      const aiOrders = await extractOrdersFromCommentsAI(
        postInfo,
        comments,
        userId,
        bandNumber,
        postId,
        apiEndpoint
      );
      
      // 중복 제거하여 병합
      const mergedOrders = mergeOrders(results.orders, aiOrders.orders);
      results.orders = mergedOrders;
      results.stats.aiOrders = aiOrders.orders.length;
      
      // AI로 추출된 고객 정보 병합
      for (const [customerId, customer] of aiOrders.customers) {
        if (!results.customers.has(customerId)) {
          results.customers.set(customerId, customer);
        }
      }
    } catch (error) {
      console.error("[주문 추출] AI 처리 오류:", error);
      // AI 실패해도 패턴 기반 결과는 유지
    }
  }
  
  results.stats.totalOrders = results.orders.length;
  
  console.log(
    `[주문 추출] 완료 - 총 ${results.stats.totalOrders}개 ` +
    `(패턴: ${results.stats.patternOrders}, AI: ${results.stats.aiOrders})`
  );
  
  return results;
}

/**
 * 패턴 기반으로 주문을 추출합니다
 * @param {Object} postInfo - 게시물 정보
 * @param {Array} comments - 댓글 배열
 * @param {string} userId - 사용자 ID
 * @param {string} bandNumber - 밴드 번호
 * @param {string} postId - 게시물 ID
 * @returns {Object} 추출된 주문과 고객 정보
 */
function extractOrdersByPatterns(postInfo, comments, userId, bandNumber, postId) {
  const orders = [];
  const customers = new Map();
  
  console.log(`[패턴 추출] ${comments.length}개 댓글에서 주문 추출 시작`);
  
  for (const comment of comments) {
    // 정규화된 댓글은 content 필드를 가지고 있음
    const content = comment.content || getCommentContent(comment);
    if (!content) {
      console.log(`[패턴 추출] 빈 댓글 스킵`);
      continue;
    }
    
    console.log(`[패턴 추출] 댓글 처리: "${content.substring(0, 50)}..."`);
    
    // 1. 키워드 매칭
    const keywordOrderResult = extractOrderByKeywordMatching(
      content,
      postInfo.keywordMappings || postInfo.keyword_mappings
    );
    
    if (keywordOrderResult && keywordOrderResult.length > 0) {
      const keywordOrder = keywordOrderResult[0]; // 배열의 첫 번째 요소 사용
      const order = createOrderFromExtraction(
        keywordOrder,
        comment,
        postInfo,
        userId,
        bandNumber,
        postId,
        'keyword'
      );
      orders.push(order);
      
      // 고객 정보 추가
      const customer = createCustomerFromComment(comment, bandNumber);
      customers.set(customer.customer_id, customer);
      continue;
    }
    
    // 2. 단위 패턴 매칭
    // products 배열을 Map으로 변환
    const productMap = new Map();
    if (postInfo.products && Array.isArray(postInfo.products)) {
      postInfo.products.forEach((product, index) => {
        productMap.set(product.itemNumber || index + 1, product);
      });
    }
    
    const unitOrderResult = extractOrderByUnitPattern(
      content,
      productMap
    );
    
    if (unitOrderResult && unitOrderResult.length > 0) {
      const unitOrder = unitOrderResult[0]; // 배열의 첫 번째 요소 사용
      const order = createOrderFromExtraction(
        unitOrder,
        comment,
        postInfo,
        userId,
        bandNumber,
        postId,
        'unit'
      );
      orders.push(order);
      
      // 고객 정보 추가
      const customer = createCustomerFromComment(comment, bandNumber);
      customers.set(customer.customer_id, customer);
      continue;
    }
    
    // 3. 숫자 패턴만으로 추출 (단순 상품인 경우)
    if (!shouldUseAI(postInfo)) {
      const numberCheck = checkNumberPatternOnly(content);
      
      if (numberCheck && numberCheck.only_numbers && postInfo.products.length === 1) {
        const quantity = extractQuantityFromComment(content) || 1;
        const order = createOrderFromExtraction(
          {
            quantity,
            productItemNumber: 1,
            productTitle: postInfo.products[0].title,
          },
          comment,
          postInfo,
          userId,
          bandNumber,
          postId,
          'pattern'
        );
        orders.push(order);
        
        // 고객 정보 추가
        const customer = createCustomerFromComment(comment, bandNumber);
        customers.set(customer.customer_id, customer);
      }
    }
  }
  
  return { orders, customers };
}

/**
 * AI를 사용하여 주문을 추출합니다
 * @param {Object} postInfo - 게시물 정보
 * @param {Array} comments - 댓글 배열
 * @param {string} userId - 사용자 ID
 * @param {string} bandNumber - 밴드 번호
 * @param {string} postId - 게시물 ID
 * @param {string} apiEndpoint - AI API 엔드포인트
 * @returns {Promise<Object>} AI로 추출된 주문과 고객 정보
 */
async function extractOrdersFromCommentsAI(
  postInfo,
  comments,
  userId,
  bandNumber,
  postId,
  apiEndpoint
) {
  const orders = [];
  const customers = new Map();
  
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postInfo,
        comments,
        bandNumber,
        postId,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.orders && Array.isArray(result.orders)) {
      for (const aiOrder of result.orders) {
        const order = createOrderFromAI(
          aiOrder,
          postInfo,
          userId,
          bandNumber,
          postId
        );
        orders.push(order);
        
        // 고객 정보 생성
        const customer = createCustomerFromAI(aiOrder, bandNumber);
        customers.set(customer.customer_id, customer);
      }
    }
    
    return { orders, customers };
    
  } catch (error) {
    console.error("[AI 주문 추출] 오류:", error);
    return { orders: [], customers: new Map() };
  }
}

/**
 * AI 사용 여부를 결정합니다
 * @param {Object} postInfo - 게시물 정보
 * @returns {boolean} AI 사용 여부
 */
function shouldUseAI(postInfo) {
  // 게시물 레벨에서 order_needs_ai가 true면 AI 사용
  if (postInfo.order_needs_ai === true) {
    return true;
  }
  
  // 상품 레벨에서 order_needs_ai가 true인 상품이 하나라도 있으면 AI 사용
  if (postInfo.products && Array.isArray(postInfo.products)) {
    return postInfo.products.some(product => product.order_needs_ai === true);
  }
  
  // 다중 상품 게시물인 경우 AI 사용 권장
  if (postInfo.products && postInfo.products.length > 1) {
    return true;
  }
  
  return false;
}

/**
 * 패턴 추출 결과로부터 주문을 생성합니다
 * @param {Object} extraction - 추출 결과
 * @param {Object} comment - 댓글 객체
 * @param {Object} postInfo - 게시물 정보
 * @param {string} userId - 사용자 ID
 * @param {string} bandNumber - 밴드 번호
 * @param {string} postId - 게시물 ID
 * @param {string} extractionType - 추출 타입
 * @returns {Object} 주문 객체
 */
function createOrderFromExtraction(extraction, comment, postInfo, userId, bandNumber, postId, extractionType) {
  // 정규화된 댓글에서 author 정보 가져오기
  const authorUserNo = comment.author?.userNo || comment._original?.author?.user_key || 'unknown';
  const customerId = generateCustomerUniqueId(bandNumber, authorUserNo);
  
  // post_key와 band_key를 postInfo에서 가져오기
  const postKey = postInfo.post_key || postInfo.postKey || postId;
  const bandKey = postInfo.band_key || postInfo.bandKey || bandNumber;
  
  // 상품 정보 찾기 - itemNumber 사용 (productItemNumber가 아님)
  const itemNumber = extraction.itemNumber || extraction.productItemNumber || 1;
  
  // order_id 생성 시 post_key, comment_key, 그리고 상품 식별자 사용
  // 정규화된 댓글 객체는 commentKey 필드를 가지고 있음
  const commentKey = comment.commentKey || comment.comment_key || comment.key || 
                     comment._original?.comment_key || 
                     `${comment.author?.userNo || 'unknown'}_${comment.createdAt || Date.now()}`;
  
  const orderId = generateOrderUniqueId(
    userId,
    bandKey,
    postKey,
    commentKey,
    itemNumber,
    0
  );
  const product = postInfo.products?.find(
    p => (p.itemNumber || p.item_number) === itemNumber
  ) || postInfo.products?.[itemNumber - 1]; // itemNumber로 못 찾으면 인덱스로 시도
  
  const unitPrice = extraction.unitPrice || product?.basePrice || product?.base_price || product?.price || 0;
  const totalPrice = extraction.totalPrice || (unitPrice * (extraction.quantity || 1));
  
  return {
    order_id: orderId,
    user_id: userId,  // user_id 추가
    post_key: postKey,  // postInfo에서 가져온 post_key 사용
    band_key: bandKey,  // band_key 필드 추가
    band_number: bandNumber,
    customer_id: customerId,
    product_id: (product && product.product_id) ? product.product_id : (itemNumber ? (() => {
      // 표준 규칙: prod_userId_bandNumber_postNumber_itemN (postKey에서 postNumber 추출)
      const postNumber = (typeof postKey === 'string' && postKey.includes(':')) ? postKey.split(':')[1] : postKey;
      return `prod_${userId}_${bandNumber}_${postNumber}_item${itemNumber}`;
    })() : null),
    product_name: extraction.productTitle || extraction.productName || product?.title || product?.product_name || "상품명 없음",
    quantity: extraction.quantity || 1,
    price: unitPrice,  // price 필드 추가
    price_per_unit: unitPrice.toString(),
    total_amount: totalPrice,
    comment_key: comment.commentKey || comment.comment_key || comment.key || comment._original?.comment_key || 'unknown',  // comment_key 정확히 설정
    comment: comment.content || getCommentContent(comment),
    customer_name: comment.author?.name || comment._original?.author?.name || "이름없음",
    customer_band_id: comment.author?.userId || comment._original?.author?.member_key || null,
    customer_profile: comment.author?.profileImageUrl || comment._original?.author?.profile_image_url || null,
    processing_method: extractionType,
    status: '주문완료',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ordered_at: comment.createdAt ? new Date(comment.createdAt).toISOString() : new Date().toISOString(),
    band_comment_id: comment.commentKey || comment.comment_key || comment.key || comment._original?.comment_key || 'unknown',
  };
}

/**
 * AI 추출 결과로부터 주문을 생성합니다
 * @param {Object} aiOrder - AI 추출 결과
 * @param {Object} postInfo - 게시물 정보
 * @param {string} userId - 사용자 ID
 * @param {string} bandNumber - 밴드 번호
 * @param {string} postId - 게시물 ID
 * @returns {Object} 주문 객체
 */
function createOrderFromAI(aiOrder, postInfo, userId, bandNumber, postId) {
  const authorUserNo = aiOrder.authorUserNo || 'unknown';
  const customerId = generateCustomerUniqueId(bandNumber, authorUserNo);
  
  // post_key와 band_key를 postInfo에서 가져오기
  const postKey = postInfo.post_key || postInfo.postKey || postId;
  const bandKey = postInfo.band_key || postInfo.bandKey || bandNumber;
  
  // order_id 생성 시 post_key, comment_key, 그리고 상품 식별자 사용
  const itemIdentifier = aiOrder.productItemNumber || aiOrder.itemNumber || 1;
  const commentKey = aiOrder.commentKey || aiOrder.comment_key || 'unknown';
  const orderId = generateOrderUniqueId(
    userId,
    bandKey,
    postKey,
    commentKey,
    itemIdentifier,
    0
  );
  
  const unitPrice = aiOrder.unitPrice || 0;
  
  return {
    order_id: orderId,
    user_id: userId,  // user_id 추가
    post_key: postKey,  // postInfo에서 가져온 post_key 사용
    band_key: bandKey,  // band_key 필드 추가
    band_number: bandNumber,
    customer_id: customerId,
    product_id: (() => {
      const itemNumber = aiOrder.productItemNumber || aiOrder.itemNumber || null;
      if (!itemNumber) return null;
      const product = postInfo.products?.find(p => (p.itemNumber || p.item_number) === itemNumber) || postInfo.products?.[itemNumber - 1];
      if (product && product.product_id) return product.product_id;
      const postNumber = (typeof postKey === 'string' && postKey.includes(':')) ? postKey.split(':')[1] : postKey;
      return `prod_${userId}_${bandNumber}_${postNumber}_item${itemNumber}`;
    })(),
    product_name: aiOrder.productTitle || "상품명 없음",
    quantity: aiOrder.quantity || 1,
    price: unitPrice,  // price 필드 추가
    price_per_unit: unitPrice.toString(),
    total_amount: aiOrder.totalPrice || 0,
    comment_key: aiOrder.commentKey || aiOrder.comment_key,  // comment_key 정확히 설정
    comment: aiOrder.originalText,
    customer_name: aiOrder.customerName || "이름없음",
    customer_band_id: aiOrder.authorUserId || null,
    customer_profile: aiOrder.profileImageUrl || null,
    processing_method: 'ai',
    ai_process_reason: aiOrder.reason || null,
    band_comment_id: aiOrder.commentKey || aiOrder.comment_key,
    ai_extraction_result: {
      confidence: aiOrder.confidence || 0.9,
      isAmbiguous: aiOrder.isAmbiguous || false,
      selectedOption: aiOrder.selectedOption || null
    },
    status: '주문완료',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ordered_at: aiOrder.orderTime || new Date().toISOString(),
  };
}

/**
 * 댓글로부터 고객 정보를 생성합니다
 * @param {Object} comment - 댓글 객체
 * @param {string} bandNumber - 밴드 번호
 * @returns {Object} 고객 객체
 */
function createCustomerFromComment(comment, bandNumber) {
  // 정규화된 댓글에서 author 정보 가져오기
  const authorUserNo = comment.author?.userNo || comment._original?.author?.user_key || 'unknown';
  const customerId = generateCustomerUniqueId(bandNumber, authorUserNo);
  
  return {
    customer_id: customerId,
    band_number: bandNumber,
    customer_name: comment.author?.name || comment._original?.author?.name || "알수없음",  // customer_name 필드
    contact: extractPhoneNumber(comment.content || getCommentContent(comment)),  // contact 필드 (DB 컬럼명에 맞춤)
    profile_image: comment.author?.profileImageUrl || comment._original?.author?.profile_image_url || null,
    band_user_id: comment.author?.userId || comment._original?.author?.member_key || null,
    total_orders: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_order_at: new Date().toISOString(),
    last_order_at: new Date().toISOString(),
  };
}

/**
 * AI 결과로부터 고객 정보를 생성합니다
 * @param {Object} aiOrder - AI 추출 결과
 * @param {string} bandNumber - 밴드 번호
 * @returns {Object} 고객 객체
 */
function createCustomerFromAI(aiOrder, bandNumber) {
  const authorUserNo = aiOrder.authorUserNo || 'unknown';
  const customerId = generateCustomerUniqueId(bandNumber, authorUserNo);
  
  return {
    customer_id: customerId,
    band_number: bandNumber,
    customer_name: aiOrder.customerName || aiOrder.authorName || "알수없음",  // customer_name 필드
    contact: aiOrder.phoneNumber,  // contact 필드 (DB 컬럼명에 맞춤)
    profile_image: aiOrder.profileImageUrl || null,
    band_user_id: aiOrder.authorUserId || null,
    total_orders: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_order_at: new Date().toISOString(),
    last_order_at: new Date().toISOString(),
  };
}

/**
 * 주문들을 병합합니다 (중복 제거)
 * @param {Array} orders1 - 첫 번째 주문 배열
 * @param {Array} orders2 - 두 번째 주문 배열
 * @returns {Array} 병합된 주문 배열
 */
function mergeOrders(orders1, orders2) {
  const orderMap = new Map();
  
  // 첫 번째 배열 추가
  for (const order of orders1) {
    orderMap.set(order.order_id, order);
  }
  
  // 두 번째 배열 추가 (중복 제거)
  for (const order of orders2) {
    if (!orderMap.has(order.order_id)) {
      orderMap.set(order.order_id, order);
    }
  }
  
  return Array.from(orderMap.values());
}

/**
 * 게시물에 대한 상품 맵을 가져옵니다
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} postId - 게시물 ID
 * @returns {Promise<Map>} 상품 맵
 */
export async function fetchProductMapForPost(supabase, postId) {
  const productMap = new Map();
  
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('post_id', postId);
    
    if (error) {
      console.error('[상품 맵] 조회 오류:', error);
      return productMap;
    }
    
    if (products && products.length > 0) {
      for (const product of products) {
        productMap.set(product.item_number, product);
      }
    }
    
    return productMap;
    
  } catch (error) {
    console.error('[상품 맵] 예외 발생:', error);
    return productMap;
  }
}
