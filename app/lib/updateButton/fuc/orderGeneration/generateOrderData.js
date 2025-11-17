/**
 * 주문 데이터 생성 함수
 * 댓글에서 주문 정보를 추출하고 구조화하는 핵심 함수
 *
 * @description
 * 이 파일은 backend/supabase/functions/band-get-posts-a/index.ts의
 * generateOrderData 함수를 JavaScript로 이식한 것입니다.
 *
 * 주요 기능:
 * 1. 댓글 분류 시스템 (명확한 패턴 vs 애매한 패턴)
 * 2. AI 모드 전환 로직 (off/smart/aggressive)
 * 3. AI 배치 처리 (10개씩)
 * 4. 제외 고객 필터링
 * 5. 4개 매처 시스템 통합
 * 6. 주문/고객 데이터 생성
 */

import { filterCancellationComments } from '../cancellation/cancellationFilter.js';
import { MatcherOrchestrator } from '../matching/matcherOrchestrator.js';
import { extractOrdersFromCommentsAI } from '../productExtraction.js';
import { processNumberBasedOrder, processProductNameOrder } from '../matching/commentAnalyzer.js';
import { findBestProductMatch } from '../matching/similarityMatching.js';
import { extractOrderByUnitPattern } from '../unitPatternMatching/unitPatternMatching.js';
import { CommentClassifier } from '../matching/commentAnalyzer.js';
import { shouldUsePatternProcessing } from '../orderPatternExtraction/orderPatternExtraction.js';
import { generateOrderUniqueId, generateCustomerUniqueId } from '../utils/idUtils.js';
import { calculateOptimalPrice } from '../utils/priceUtils.js';
import { safeParseDate } from '../utils/dateUtils.js';

/**
 * 댓글에서 주문 데이터를 생성하는 메인 함수
 *
 * @param {Object} supabase - Supabase 클라이언트 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {Array} comments - 댓글 배열
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - Band 키
 * @param {string} bandNumber - Band 번호
 * @param {Map} productMap - 상품 정보 Map (itemNumber -> product)
 * @param {Object|null} post - 게시물 정보
 * @param {Object|null} userSettings - 사용자 설정
 * @returns {Promise<Object>} { orders, customers, cancellationUsers, success }
 */
export async function generateOrderData(
  supabase,
  userId,
  comments,
  postKey,
  bandKey,
  bandNumber,
  productMap,
  post = null,
  userSettings = null
) {
  const orders = [];
  const customers = new Map();
  let matcherSystemSuccess = false;
  let cancellationUsers = new Set();

  const processingSummary = {
    totalCommentsProcessed: comments.length,
    generatedOrders: 0,
    generatedCustomers: 0,
    skippedExcluded: 0,
    skippedClosing: 0,
    skippedMissingInfo: 0,
    aiDetectedOrders: 0,
    aiSkippedNonOrders: 0,
    ruleBasedOrders: 0,
    errors: []
  };

  if (!comments || comments.length === 0) {
    return { orders, customers, cancellationUsers, success: true };
  }

  if (!productMap || productMap.size === 0) {
    console.warn('상품 정보 없음, 주문 생성 불가', { postKey });
    return { orders, customers, cancellationUsers, success: true };
  }

  console.info('댓글 처리 시작', { postKey, commentCount: comments.length });

  try {
    // 1. 게시물 관련 상품 정보 및 키워드 매핑 정보 조회
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('post_key', postKey)
      .eq('user_id', userId);

    let keywordMappings = {};
    try {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('keyword_mappings')
        .eq('post_key', postKey)
        .eq('user_id', userId)
        .single();

      if (postError && postError.code !== 'PGRST116') {
        console.warn('키워드 매핑 게시물 조회 실패', { message: postError.message });
      } else if (postData?.keyword_mappings) {
        keywordMappings = postData.keyword_mappings;
      }
    } catch (e) {
      console.warn('키워드 매핑 조회 중 오류', { message: e.message });
    }

    if (productsError) {
      processingSummary.errors.push({ type: 'db_product_fetch', message: productsError.message });
      return { orders, customers };
    }

    if (!productsData || productsData.length === 0) {
      return { orders, customers };
    }

    productsData.forEach((p) => {
      if (p.item_number !== null && typeof p.item_number === 'number') {
        productMap.set(p.item_number, p);
      }
    });

    const isMultipleProductsPost = productMap.size > 1;

    // 2. 제외 고객 목록 조회
    let excludedCustomers = [];
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('excluded_customers')
        .eq('user_id', userId)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        throw userError;
      }

      if (userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
        excludedCustomers = userData.excluded_customers
          .filter((name) => typeof name === 'string')
          .map((name) => name.trim());
      }
    } catch (e) {
      processingSummary.errors.push({ type: 'db_excluded_fetch', message: e.message });
    }

    // 2.5 제외 고객 필터링 (최상위 레벨)
    const originalCommentCount = comments.length;
    let excludedByTopLevelFilter = 0;

    const filteredComments = comments.filter((comment) => {
      const authorName = comment.author?.name?.trim();
      if (!authorName) return true;

      if (excludedCustomers.includes(authorName)) {
        excludedByTopLevelFilter++;
        console.debug('제외 고객 필터링 (최상위)', { customer: authorName, commentKey: comment.commentKey });
        return false;
      }
      return true;
    });

    comments = filteredComments;

    if (excludedByTopLevelFilter > 0) {
      console.info('제외 고객 조기 필터링으로 리소스 절약', {
        original: originalCommentCount,
        excluded: excludedByTopLevelFilter,
        remaining: comments.length,
        postKey: postKey,
        savedAICalls: excludedByTopLevelFilter
      });
    }

    // 3. AI 댓글 분석 시도
    let aiOrderResults = [];
    let useAIResults = false;
    let patternProcessedComments = new Set();

    // 1단계: 명확한 패턴 댓글 사전 분류
    let clearPatternComments = [];
    let ambiguousComments = [];

    let hasOrderNeedsAiProduct = false;
    if (post?.order_needs_ai === true) {
      hasOrderNeedsAiProduct = true;
      console.debug('AI 우선 처리 게시물:', postKey);

      ambiguousComments = comments.map((comment, index) => ({
        ...comment,
        originalIndex: index
      }));
      clearPatternComments = [];
      console.info('AI 우선 처리 활성화', { commentCount: comments.length });
    }

    // 복잡한 옵션 상품 감지
    const weightVolumePattern = /(박스|키로|킬로|키로그람|키로그램|킬로그람|킬로그램|kg|k\b|g\b|그람|그램)/i;
    let hasComplexWeightVolumeProduct = false;

    for (const [itemNumber, productInfo] of productMap) {
      const priceOptionsCount = (productInfo.priceOptions?.length || 0) + (productInfo.price_options?.length || 0);
      const hasManyOptions = priceOptionsCount >= 2;
      const hasWeightVolumeUnit = productInfo.quantity_text && weightVolumePattern.test(productInfo.quantity_text);

      if (hasManyOptions && hasWeightVolumeUnit) {
        hasComplexWeightVolumeProduct = true;
      }

      if (hasOrderNeedsAiProduct && hasComplexWeightVolumeProduct) {
        break;
      }
    }

    // order_needs_ai=true가 아닌 경우에만 패턴 분류 실행
    if (!hasOrderNeedsAiProduct) {
      comments.forEach((comment, index) => {
        const content = (comment.body || comment.content || comment.comment || '').trim();

        let hasMultipleNumbers = false;
        const numberPattern = /\d+/g;
        const allNumbers = [];
        let match;

        while ((match = numberPattern.exec(content)) !== null) {
          const numberStr = match[0];
          if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith('0'))) {
            continue;
          }
          const num = parseInt(numberStr);
          if (num >= 1 && num <= 999) {
            allNumbers.push(num);
          }
        }

        if (allNumbers.length >= 2) {
          hasMultipleNumbers = true;
        }

        const isSimpleNumber = /^\d+$/.test(content);
        const hasWeightVolumeUnit = /\d+\s*(kg|킬로|키로|g|그람|그램|리터|L|ml|밀리)/i.test(content);

        const isClearPattern =
          /\d+\s*번\s*\d+/g.test(content) ||
          (!hasComplexWeightVolumeProduct && isSimpleNumber && !hasWeightVolumeUnit) ||
          /^\d+개$/.test(content) ||
          /취소|마감|완판|품절/.test(content) ||
          (!hasComplexWeightVolumeProduct && !hasMultipleNumbers && !hasWeightVolumeUnit && allNumbers.length === 1);

        if (hasMultipleNumbers || !isClearPattern || hasWeightVolumeUnit) {
          let hasMultipleProducts = false;
          if (isMultipleProductsPost) {
            let matchedProductCount = 0;
            productMap.forEach((product, key) => {
              const productTitle = product.title || '';
              const keywords = product.keywords || [];
              const allKeywords = [productTitle, ...keywords];

              for (const keyword of allKeywords) {
                if (keyword && content.includes(keyword)) {
                  matchedProductCount++;
                  break;
                }
              }
            });

            if (matchedProductCount >= 2) {
              hasMultipleProducts = true;
              console.debug('다중 상품 감지', { products: matchedProductCount });
            }
          }

          ambiguousComments.push({
            ...comment,
            originalIndex: index,
            hasMultipleNumbers,
            hasMultipleProducts,
            orderNumberCount: allNumbers.length
          });
        } else {
          clearPatternComments.push({
            ...comment,
            originalIndex: index
          });
        }
      });
    }

    // 2단계: AI 모드 기반 처리 전략 결정
    let shouldUseAI = false;
    let commentsForAI = [];
    const aiMode = userSettings?.ai_analysis_level || 'smart';

    switch (aiMode) {
      case 'off':
        shouldUseAI = false;
        commentsForAI = [];
        console.info('[AI Mode: OFF] AI 완전 비활성화 - 패턴 매칭만 사용');
        break;

      case 'aggressive':
        if (ambiguousComments.length > 0 || hasOrderNeedsAiProduct) {
          shouldUseAI = true;
          commentsForAI = comments;
          console.info('[AI Mode: AGGRESSIVE] 공격적 모드 - 모든 댓글 AI 처리', { commentCount: comments.length });
        }
        break;

      case 'smart':
      default:
        const ignoreOrderNeedsAi = userSettings?.ignore_order_needs_ai === true;
        const forceAiProcessing = userSettings?.force_ai_processing === true;

        if (hasOrderNeedsAiProduct && !ignoreOrderNeedsAi) {
          shouldUseAI = true;
          commentsForAI = comments;
          console.info('[AI Mode: SMART] order_needs_ai=true - AI 우선 처리', {
            commentCount: comments.length,
            reason: post?.order_needs_ai_reason || '알 수 없음'
          });
        } else {
          const multiNumberComments = ambiguousComments.filter((c) => c.hasMultipleNumbers);
          if (multiNumberComments.length > 0) {
            shouldUseAI = true;
            commentsForAI = ambiguousComments;
            console.info('[AI Mode: SMART] 다중 숫자 감지 - AI 처리', { count: multiNumberComments.length });
          } else if (isMultipleProductsPost && forceAiProcessing) {
            shouldUseAI = true;
            commentsForAI = comments;
            console.info('[AI Mode: SMART] 다중 상품 AI 강제 처리', { commentCount: comments.length });
          } else if (ambiguousComments.length > 0) {
            shouldUseAI = true;
            commentsForAI = ambiguousComments;
            console.info('[AI Mode: SMART] 애매한 패턴 감지 - AI 처리', { count: ambiguousComments.length });
          } else {
            console.debug('[AI Mode: SMART] 명확한 패턴 - AI 불필요');
          }
        }
        break;
    }

    // 3단계: AI 처리 (필요한 경우만) - 10개씩 분할 처리
    if (shouldUseAI && commentsForAI.length > 0) {
      const aiStartTime = Date.now();
      const AI_BATCH_SIZE = 10;
      const allAiResults = [];
      const batchErrors = [];

      const commentBatches = [];
      for (let i = 0; i < commentsForAI.length; i += AI_BATCH_SIZE) {
        commentBatches.push(commentsForAI.slice(i, i + AI_BATCH_SIZE));
      }

      console.info('AI 배치 처리 시작', {
        totalComments: commentsForAI.length,
        batchCount: commentBatches.length,
        batchSize: AI_BATCH_SIZE
      });

      const postInfo = {
        products: Array.from(productMap.values()).map((product) => ({
          title: product.title,
          basePrice: product.base_price,
          priceOptions: product.price_options || []
        })),
        content: post?.content || '',
        postTime: post?.createdAt || new Date().toISOString()
      };

      for (let batchIndex = 0; batchIndex < commentBatches.length; batchIndex++) {
        const batch = commentBatches[batchIndex];
        try {
          console.debug(`AI 배치 ${batchIndex + 1}/${commentBatches.length} 처리 중`, {
            commentCount: batch.length,
            commentKeys: batch.map((c) => c.commentKey)
          });

          const batchResults = await extractOrdersFromCommentsAI(postInfo, batch, bandNumber, postKey);

          console.info(`AI 배치 ${batchIndex + 1} 원시 결과`, {
            batchIndex: batchIndex + 1,
            inputComments: batch.length,
            inputCommentKeys: batch.map((c) => c.commentKey),
            rawResultType: typeof batchResults,
            rawResultLength: Array.isArray(batchResults) ? batchResults.length : 'not array',
            rawResult: batchResults ? JSON.stringify(batchResults).substring(0, 500) + '...' : 'null'
          });

          if (batchResults && Array.isArray(batchResults) && batchResults.length > 0) {
            const validResults = batchResults.filter((result) => {
              if (!result || typeof result !== 'object') {
                console.warn('무효한 AI 결과 개체', { result });
                return false;
              }
              if (!result.commentKey) {
                console.warn('commentKey 누락된 AI 결과', { result });
                return false;
              }
              return true;
            });

            allAiResults.push(...validResults);
            console.info(`AI 배치 ${batchIndex + 1} 처리 성공`, {
              batchIndex: batchIndex + 1,
              totalResults: batchResults.length,
              validResults: validResults.length,
              invalidResults: batchResults.length - validResults.length,
              resultCommentKeys: validResults.map((r) => r.commentKey),
              orderResults: validResults.filter((r) => r.isOrder).length
            });

            const inputKeys = new Set(batch.map((c) => c.commentKey));
            const outputKeys = new Set(validResults.map((r) => r.commentKey));
            const missingKeys = [...inputKeys].filter((key) => !outputKeys.has(key));
            const extraKeys = [...outputKeys].filter((key) => !inputKeys.has(key));

            if (missingKeys.length > 0) {
              console.error(`AI 배치 ${batchIndex + 1} - 누락된 댓글 키`, { missingKeys, missingCount: missingKeys.length });
            }
            if (extraKeys.length > 0) {
              console.warn(`AI 배치 ${batchIndex + 1} - 추가된 댓글 키`, { extraKeys, extraCount: extraKeys.length });
            }
          } else {
            console.error(`AI 배치 ${batchIndex + 1} 결과 없음 또는 비정상`, {
              batchIndex: batchIndex + 1,
              inputComments: batch.length,
              inputCommentKeys: batch.map((c) => c.commentKey),
              resultType: typeof batchResults,
              isArray: Array.isArray(batchResults),
              resultContent: batchResults
            });

            batchErrors.push({
              batchIndex,
              commentCount: batch.length,
              error: 'No results or invalid result format',
              commentKeys: batch.map((c) => c.commentKey),
              resultType: typeof batchResults,
              resultContent: batchResults
            });
          }

          if (batchIndex < commentBatches.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (batchError) {
          console.error(`AI 배치 ${batchIndex + 1}/${commentBatches.length} 처리 실패`, {
            error: batchError.message,
            commentCount: batch.length,
            commentKeys: batch.map((c) => c.commentKey)
          });

          batchErrors.push({
            batchIndex,
            commentCount: batch.length,
            error: batchError.message,
            commentKeys: batch.map((c) => c.commentKey)
          });

          if (hasOrderNeedsAiProduct) {
            console.error(`❌ [AI 배치 실패] order_needs_ai=true 상품에서 배치 ${batchIndex + 1} 실패`, batchError.message);
          }
        }
      }

      // 결과 정리
      if (allAiResults.length > 0) {
        aiOrderResults = allAiResults;
        useAIResults = true;

        const totalInputComments = commentsForAI.length;
        const totalOutputResults = allAiResults.length;
        const orderResults = allAiResults.filter((r) => r.isOrder);

        const inputCommentKeys = new Set(commentsForAI.map((c) => c.commentKey));
        const outputCommentKeys = new Set(allAiResults.map((r) => r.commentKey));
        const finalMissingKeys = [...inputCommentKeys].filter((key) => !outputCommentKeys.has(key));

        console.info('AI 분석 완료', {
          totalResults: allAiResults.length,
          totalTime: Date.now() - aiStartTime,
          batchesProcessed: commentBatches.length,
          batchesSucceeded: commentBatches.length - batchErrors.length,
          batchesFailed: batchErrors.length,
          inputComments: totalInputComments,
          outputResults: totalOutputResults,
          orderResults: orderResults.length,
          missingComments: finalMissingKeys.length,
          missingCommentKeys: finalMissingKeys
        });

        if (finalMissingKeys.length > 0) {
          console.error('❌ AI 처리 후 누락된 댓글 발견', {
            totalMissing: finalMissingKeys.length,
            missingKeys: finalMissingKeys,
            totalInput: totalInputComments,
            totalOutput: totalOutputResults,
            coverageRate: `${((totalOutputResults / totalInputComments) * 100).toFixed(1)}%`
          });

          if (hasOrderNeedsAiProduct) {
            console.error(`❌ [AI 필수 상품] order_needs_ai=true 상품에서 ${finalMissingKeys.length}개 댓글 누락`);
          }
        }

        if (hasOrderNeedsAiProduct) {
          console.info('AI 주문 감지', {
            orders: orderResults.length,
            comments: commentsForAI.length,
            totalResults: allAiResults.length
          });

          orderResults.forEach((result, idx) => {
            console.info(`AI 주문 상세 ${idx + 1}`, {
              commentKey: result.commentKey,
              quantity: result.quantity || 1,
              product: result.productTitle || '확인필요',
              originalText: (result.originalText?.substring(0, 50) + '...') || 'N/A'
            });
          });
        }

        allAiResults.forEach((result) => {
          if (result.commentKey) {
            patternProcessedComments.add(result.commentKey);
          }
        });

        console.debug('AI 처리된 댓글 추적 완료', {
          trackedComments: patternProcessedComments.size,
          aiResults: allAiResults.length
        });
      } else {
        console.error('❌ [AI 처리 전체 실패] 모든 배치에서 결과를 얻지 못했습니다', {
          totalBatches: commentBatches.length,
          failedBatches: batchErrors.length
        });

        if (hasOrderNeedsAiProduct) {
          console.error('❌ [AI 우선 처리 전체 실패] order_needs_ai=true 상품에서 AI 분석 전체 실패');
          console.error('   - 복잡한 상품이므로 패턴 기반 처리는 부정확할 수 있습니다.');
        }
      }

      if (batchErrors.length > 0) {
        console.warn('AI 처리 부분 실패 요약', {
          failedBatches: batchErrors.length,
          totalBatches: commentBatches.length,
          failureRate: `${((batchErrors.length / commentBatches.length) * 100).toFixed(1)}%`,
          errors: batchErrors
        });
      }
    }

    // 4. 취소 댓글 필터링
    const cancellationResult = filterCancellationComments(comments);
    const nonCancellationComments = cancellationResult.filteredComments;
    cancellationUsers = cancellationResult.cancellationUsers;

    // 5. 댓글 순회 및 처리 (취소 댓글 제외)
    for (let i = 0; i < nonCancellationComments.length; i++) {
      const comment = nonCancellationComments[i];
      try {
        // 기본 정보 추출 및 유효성 검사
        const authorName = comment.author?.name?.trim();
        const authorUserNo = comment.author?.user_key || comment.author?.userNo;
        const authorProfileUrl = comment.author?.profileImageUrl;
        const commentContent = comment.body || comment.content || comment.comment || '';
        const createdAt = safeParseDate(comment.createdAt);
        const commentKey = comment.commentKey;

        if (!authorUserNo) {
          console.warn('[DEBUG] authorUserNo 누락 - 원본 댓글 author 구조:', JSON.stringify(comment.author, null, 2));
        }

        if (!authorName || !authorUserNo || !commentContent || !createdAt || !commentKey || !postKey || !bandKey) {
          console.warn(`[주문 생성] Skipping comment due to missing basic info: commentKey=${commentKey}, postKey=${postKey}, bandKey=${bandKey}`);
          console.warn(`[DEBUG] 누락된 필드 상세: authorName="${authorName}", authorUserNo="${authorUserNo}", commentContent="${commentContent}", createdAt="${createdAt}", commentKey="${commentKey}"`);
          console.warn('[DEBUG] 원본 댓글 author 구조:', JSON.stringify(comment.author, null, 2));
          processingSummary.skippedMissingInfo++;
          continue;
        }

        // Private 댓글 필터링
        if (commentContent.includes('This comment is private')) {
          console.debug('Private 댓글 필터링', { commentKey });
          processingSummary.skippedMissingInfo++;
          continue;
        }

        // 제외 고객 필터링 (이중 체크)
        if (excludedCustomers.includes(authorName)) {
          console.warn('제외 고객이 상위 필터링을 통과함', { customer: authorName, commentKey });
          processingSummary.skippedExcluded++;
          continue;
        }

        // 주문 추출 로직
        let orderItems = [];
        let isProcessedAsOrder = false;
        let processingMethod = 'none';
        let matchingMetadata = null;

        const forceAiProcessing = userSettings?.force_ai_processing === true;
        const isAIProcessedComment =
          useAIResults &&
          commentsForAI.some(
            (c) =>
              c.commentKey === commentKey ||
              c.comment === commentContent ||
              c.body === commentContent ||
              c.content === commentContent
          );

        // AI 결과 우선 사용
        if ((hasOrderNeedsAiProduct || isAIProcessedComment) && useAIResults) {
          const aiResults = aiOrderResults.filter((result) => result.commentKey === commentKey);
          if (aiResults.length > 0) {
            const orderResults = aiResults.filter((result) => result.isOrder);
            if (orderResults.length > 0) {
              orderItems = orderResults.map((aiResult) => ({
                itemNumber: aiResult.productItemNumber || 1,
                quantity: aiResult.quantity || 1,
                isAmbiguous: aiResult.isAmbiguous || false,
                aiAnalyzed: true,
                aiReason: aiResult.reason,
                isOrder: aiResult.isOrder,
                reason: aiResult.reason,
                commentContent: aiResult.commentContent,
                author: aiResult.author,
                processingMethod: 'ai',
                selectedOption: aiResult.selectedOption,
                unitPrice: aiResult.unitPrice,
                totalPrice: aiResult.totalPrice
              }));
              isProcessedAsOrder = true;
              processingMethod = 'ai';
              processingSummary.aiDetectedOrders += orderResults.length;

              if (orderResults.length > 0) {
                const firstAiResult = orderResults[0];
                matchingMetadata = {
                  matcherUsed: 'ai-batch',
                  confidence: firstAiResult.confidence || 0.5,
                  timestamp: new Date().toISOString(),
                  aiReason: hasOrderNeedsAiProduct ? 'order_needs_ai=true 상품' : '복잡한 댓글 AI 처리',
                  aiResult: {
                    isOrder: firstAiResult.isOrder,
                    quantity: firstAiResult.quantity,
                    productItemNumber: firstAiResult.productItemNumber,
                    isAmbiguous: firstAiResult.isAmbiguous,
                    selectedOption: firstAiResult.selectedOption
                  }
                };
              }

              if (hasOrderNeedsAiProduct) {
                console.info('AI 주문 감지', { orders: orderItems.length });
              } else {
                console.info('AI 강제 처리 주문 감지', { orders: orderItems.length });
              }
            } else {
              processingSummary.aiSkippedNonOrders++;
              if (hasOrderNeedsAiProduct && shouldUseAI) {
                console.info(
                  `⚠️ [AI 우선 처리] 댓글 "${commentContent.substring(0, 30)}..." → AI가 주문 아님으로 판단 (패턴 처리 차단)`
                );
                continue;
              } else if (!hasOrderNeedsAiProduct) {
                console.info(`[AI 강제 처리] 댓글 "${commentContent.substring(0, 30)}..." → 주문 아님 (AI 판단)`);
                continue;
              }
            }
          } else {
            if (hasOrderNeedsAiProduct && shouldUseAI) {
              console.info(`⚠️ [AI 우선 처리] 댓글 "${commentContent.substring(0, 30)}..." → AI 결과 없음 (패턴 처리 차단)`);
              continue;
            } else if (!hasOrderNeedsAiProduct) {
              console.info(`[AI 강제 처리] 댓글 "${commentContent.substring(0, 30)}..." → AI 결과 없음, 패턴 처리 건너뛰기`);
              continue;
            }
          }
        }

        // 패턴 처리 (AI가 처리하지 않은 경우)
        if (!isProcessedAsOrder) {
          const hasMultipleProducts = comment.hasMultipleProducts || false;
          const hasMultipleNumbers = comment.hasMultipleNumbers || false;

          if (hasMultipleProducts || hasMultipleNumbers) {
            console.info(
              `🔥 [다중 항목 우선 처리] 댓글 "${commentContent.substring(0, 30)}..." → ${
                hasMultipleProducts ? '여러 상품' : ''
              }${hasMultipleNumbers ? '여러 숫자' : ''} 포함으로 AI 처리 강제`
            );

            try {
              const postInfo = {
                products: Array.from(productMap.values()).map((product) => ({
                  title: product.title,
                  basePrice: product.base_price,
                  priceOptions: product.price_options || []
                })),
                content: post?.content || '',
                postTime: post?.createdAt || new Date().toISOString()
              };

              const individualAiResults = await extractOrdersFromCommentsAI(postInfo, [comment], bandNumber, postKey);
              if (individualAiResults && individualAiResults.length > 0) {
                const orderResults = individualAiResults.filter((result) => result.isOrder);
                if (orderResults.length > 0) {
                  orderItems = orderResults.map((aiResult) => ({
                    itemNumber: aiResult.productItemNumber || 1,
                    quantity: aiResult.quantity || 1,
                    isAmbiguous: aiResult.isAmbiguous || false,
                    aiAnalyzed: true,
                    aiReason: aiResult.reason,
                    isOrder: aiResult.isOrder,
                    reason: aiResult.reason,
                    commentContent: aiResult.commentContent,
                    author: aiResult.author,
                    processingMethod: 'ai',
                    selectedOption: aiResult.selectedOption,
                    unitPrice: aiResult.unitPrice,
                    totalPrice: aiResult.totalPrice
                  }));
                  isProcessedAsOrder = true;
                  processingMethod = 'ai';
                  processingSummary.aiDetectedOrders += orderResults.length;
                  console.info(
                    `[다중 상품 AI 처리 성공] 댓글 "${commentContent.substring(0, 30)}..." → ${orderResults.length}개 주문 추출`
                  );
                } else {
                  console.info(`[다중 상품 AI 처리] 댓글 "${commentContent.substring(0, 30)}..." → AI가 주문 아님으로 판단`);
                }
              }
            } catch (aiError) {
              console.error(`[다중 상품 AI 처리 실패] 댓글 "${commentContent.substring(0, 30)}...": ${aiError.message}`);
            }
          } else {
            if (hasOrderNeedsAiProduct && shouldUseAI && aiMode !== 'off') {
              console.info(
                `🔥 [AI 우선 처리] 댓글 "${commentContent.substring(0, 30)}..." → 패턴 처리 차단 (order_needs_ai=true + AI 모드)`
              );
              continue;
            } else if (hasOrderNeedsAiProduct && aiMode === 'off') {
              console.info(`[AI OFF] order_needs_ai=true 상품도 Enhanced Pattern Matcher로 처리: "${commentContent.substring(0, 30)}..."`);
            }

            const processingDecision = shouldUsePatternProcessing(commentContent, productMap);
            const shouldForcePattern = aiMode === 'off' && !hasOrderNeedsAiProduct;

            if (processingDecision.shouldUsePattern || shouldForcePattern) {
              if (shouldForcePattern && !processingDecision.shouldUsePattern) {
                console.info(`[FORCE PATTERN] AI OFF 모드 - 복잡한 옵션 상품도 패턴 처리: "${commentContent.substring(0, 30)}..."`);
              }

              let extractedOrderItems = null;
              let matcherSystemAttempted = false;
              matcherSystemSuccess = false;

              const isMultipleProducts = productMap && productMap.size > 1;

              try {
                matcherSystemAttempted = true;
                console.info(`[3-MATCHER SYSTEM] 처리 시작: "${commentContent.substring(0, 30)}..." (AI모드: ${aiMode})`);

                const matcherResult = MatcherOrchestrator.orchestrate(commentContent, productMap);
                if (matcherResult && matcherResult.isOrder && matcherResult.products) {
                  extractedOrderItems = matcherResult.products.map((product) => ({
                    itemNumber: product.itemNumber,
                    quantity: product.quantity,
                    matchMethod: `matcher-${matcherResult.matchMethod}`,
                    confidence: product.confidence,
                    productName: product.productName
                  }));
                  matcherSystemSuccess = true;

                  orderItems = matcherResult.products.map((product) => ({
                    itemNumber: product.itemNumber,
                    quantity: product.quantity,
                    matchMethod: `3-matcher-${matcherResult.matchMethod}`,
                    confidence: product.confidence,
                    productName: product.productName,
                    price: product.price,
                    aiAnalyzed: false,
                    processingMethod: '3-matcher-system'
                  }));
                  isProcessedAsOrder = true;
                  processingMethod = '3-matcher-system';
                  matchingMetadata = {
                    matcherUsed: `3-matcher-${matcherResult.matchMethod}`,
                    confidence: matcherResult.products[0]?.confidence || 0,
                    pattern: matcherResult.pattern || 'unknown',
                    processingMethod: '3-matcher-system',
                    patternDetails: matcherResult.debugInfo || null
                  };
                  console.info(`[3-MATCHER SUCCESS] 매칭 성공: ${matcherResult.matchMethod} → ${matcherResult.products.length}개 상품 매칭`);
                } else {
                  console.info(`[3-MATCHER] 주문 아님으로 판단: "${commentContent}"`);
                }
              } catch (matcherError) {
                console.error('[3-MATCHER ERROR] 매처 시스템 오류:', matcherError);
                extractedOrderItems = null;
              }

              // Fallback 처리
              if (!matcherSystemSuccess && (!extractedOrderItems || extractedOrderItems.length === 0)) {
                console.info('[Fallback] 기존 3단계 패턴 매칭으로 폴백');

                const classification = CommentClassifier.classify(commentContent, isMultipleProducts, productMap);
                console.info(`[댓글 분류] "${commentContent}" → ${classification.type} (신뢰도: ${classification.confidence})`);

                if (classification.type === 'number-based' && classification.numberReferences.length > 0) {
                  extractedOrderItems = processNumberBasedOrder(commentContent, productMap, classification.numberReferences);
                  if (extractedOrderItems.length > 0) {
                    console.info(`[번호 주문 성공] "${commentContent}" → ${extractedOrderItems.length}개 주문`);
                  }
                } else if (classification.type === 'product-name' && classification.productNameReferences.length > 0) {
                  extractedOrderItems = processProductNameOrder(commentContent, productMap, classification.productNameReferences);
                  if (extractedOrderItems.length > 0) {
                    console.info(`[상품명 주문 성공] "${commentContent}" → ${extractedOrderItems.length}개 주문`);
                  }
                } else if (classification.type === 'quantity-only') {
                  const bestMatch = findBestProductMatch(commentContent, productMap);
                  if (bestMatch) {
                    const quantityPatterns = [/(\d+)\s*개/, /\s+(\d+)$/, /(\d+)$/, /\s+(\d+)\s*[이요욧]?$/];
                    let quantity = 1;
                    for (const pattern of quantityPatterns) {
                      const match = commentContent.match(pattern);
                      if (match && match[1]) {
                        const num = parseInt(match[1]);
                        if (num >= 1 && num <= 99) {
                          quantity = num;
                          break;
                        }
                      }
                    }
                    extractedOrderItems = [{ ...bestMatch, quantity: quantity, matchMethod: 'similarity-fallback' }];
                  }
                } else {
                  const bestMatch = findBestProductMatch(commentContent, productMap);
                  if (bestMatch) {
                    const quantityPatterns = [/(\d+)\s*개/, /\s+(\d+)$/, /(\d+)$/, /\s+(\d+)\s*[이요욧]?$/];
                    let quantity = 1;
                    for (const pattern of quantityPatterns) {
                      const match = commentContent.match(pattern);
                      if (match && match[1]) {
                        const num = parseInt(match[1]);
                        if (num >= 1 && num <= 99) {
                          quantity = num;
                          break;
                        }
                      }
                    }
                    extractedOrderItems = [{ ...bestMatch, quantity: quantity, matchMethod: 'similarity-fallback' }];
                  }
                }

                // 단위 기반 패턴 매칭 fallback
                if (!extractedOrderItems || extractedOrderItems.length === 0) {
                  extractedOrderItems = extractOrderByUnitPattern(commentContent, productMap);
                  if (extractedOrderItems && extractedOrderItems.length > 0) {
                    extractedOrderItems = extractedOrderItems.map((item) => ({
                      ...item,
                      matchMethod: 'unit-pattern-fallback'
                    }));
                  }
                }
              }

              // 패턴 처리 완료
              if (!matcherSystemSuccess && extractedOrderItems && extractedOrderItems.length > 0) {
                const uniqueItems = [];
                const seenProducts = new Set();
                for (const item of extractedOrderItems) {
                  const productKey = `${commentKey}_${item.itemNumber || 1}`;
                  if (!seenProducts.has(productKey)) {
                    uniqueItems.push(item);
                    seenProducts.add(productKey);
                  } else {
                    console.info(`[중복 제거] ${commentKey}에서 itemNumber ${item.itemNumber} 중복 제거`);
                  }
                }

                orderItems = uniqueItems.map((item) => ({
                  ...item,
                  aiAnalyzed: false,
                  processingMethod: matcherSystemAttempted ? 'pattern-after-matcher' : 'pattern',
                  enhancedPattern: item.enhancedPattern || false,
                  price: item.price || null,
                  productName: item.productName || null
                }));
                isProcessedAsOrder = true;
                processingMethod = matcherSystemAttempted ? 'pattern-fallback' : 'pattern';
                processingSummary.ruleBasedOrders += orderItems.length;

                if (matcherSystemAttempted && !matchingMetadata) {
                  matchingMetadata = {
                    matcherUsed: '3-matcher-fallback-to-pattern',
                    confidence: 0.5,
                    originalAttempt: '3-matcher-system',
                    fallbackReason: '3-matcher-system-failed',
                    timestamp: new Date().toISOString()
                  };
                }
              } else if (!matcherSystemSuccess) {
                // 패턴 처리 실패 시 복잡한 댓글 AI 처리 fallback
                const numberPattern = /\d+/g;
                const orderNumbers = [];
                let match;
                while ((match = numberPattern.exec(commentContent)) !== null) {
                  const numberStr = match[0];
                  if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith('0'))) {
                    continue;
                  }
                  const num = parseInt(numberStr);
                  if (num >= 1 && num <= 999) {
                    orderNumbers.push(num);
                  }
                }

                if (orderNumbers.length >= 2) {
                  console.info(
                    `[패턴 처리 실패] 댓글 "${commentContent.substring(0, 30)}..." → 복잡한 댓글(숫자 ${orderNumbers.length}개) AI 처리 시도`
                  );
                  try {
                    const postInfo = {
                      products: Array.from(productMap.values()).map((product) => ({
                        title: product.title,
                        basePrice: product.base_price,
                        priceOptions: product.price_options || []
                      })),
                      content: post?.content || '',
                      postTime: post?.createdAt || new Date().toISOString()
                    };

                    const individualAiResults = await extractOrdersFromCommentsAI(postInfo, [comment], bandNumber, postKey);
                    if (individualAiResults && individualAiResults.length > 0) {
                      const aiResult = individualAiResults[0];
                      if (aiResult.isOrder) {
                        orderItems = [
                          {
                            itemNumber: aiResult.productItemNumber || 1,
                            quantity: aiResult.quantity || 1,
                            isAmbiguous: aiResult.isAmbiguous || false,
                            aiAnalyzed: true,
                            aiReason: aiResult.reason,
                            isOrder: aiResult.isOrder,
                            reason: aiResult.reason,
                            commentContent: aiResult.commentContent,
                            author: aiResult.author,
                            processingMethod: 'ai-fallback',
                            selectedOption: aiResult.selectedOption,
                            unitPrice: aiResult.unitPrice,
                            totalPrice: aiResult.totalPrice
                          }
                        ];
                        isProcessedAsOrder = true;
                        processingMethod = 'ai-fallback';
                        processingSummary.aiDetectedOrders++;

                        matchingMetadata = {
                          matcherUsed: 'ai-fallback',
                          confidence: aiResult.confidence || 0.5,
                          timestamp: new Date().toISOString(),
                          aiReason: aiResult.reason,
                          aiResult: {
                            isOrder: aiResult.isOrder,
                            quantity: aiResult.quantity,
                            productItemNumber: aiResult.productItemNumber,
                            isAmbiguous: aiResult.isAmbiguous,
                            selectedOption: aiResult.selectedOption
                          }
                        };
                        console.info(`[AI 폴백 성공] 댓글 "${commentContent.substring(0, 30)}..." → AI로 주문 인식`);
                      } else {
                        console.info(`[AI 폴백] 댓글 "${commentContent.substring(0, 30)}..." → AI가 주문 아님으로 판단`);
                      }
                    } else {
                      console.info(`[AI 폴백] 댓글 "${commentContent.substring(0, 30)}..." → AI 결과 없음`);
                    }
                  } catch (aiError) {
                    console.error(`[AI 폴백 실패] 댓글 "${commentContent.substring(0, 30)}...": ${aiError.message}`);
                  }
                } else {
                  console.info(
                    `[패턴 처리 실패] 댓글 "${commentContent.substring(0, 30)}..." → 단순 댓글(숫자 ${orderNumbers.length}개) - 주문 아님으로 처리`
                  );
                }
              }
            }
          }
        }

        // AI 처리 (기존 로직)
        if (!isProcessedAsOrder && useAIResults && aiOrderResults.length > 0 && (!forceAiProcessing || !isMultipleProductsPost)) {
          const aiResults = aiOrderResults.filter((result) => result.commentKey === commentKey);
          if (aiResults.length > 0) {
            const orderResults = aiResults.filter((result) => result.isOrder);
            if (orderResults.length > 0) {
              orderItems = orderResults.map((aiResult) => ({
                itemNumber: aiResult.productItemNumber || 1,
                quantity: aiResult.quantity || 1,
                isAmbiguous: aiResult.isAmbiguous || false,
                aiAnalyzed: true,
                aiReason: aiResult.reason,
                isOrder: aiResult.isOrder,
                reason: aiResult.reason,
                commentContent: aiResult.commentContent,
                author: aiResult.author,
                processingMethod: 'ai',
                selectedOption: aiResult.selectedOption,
                unitPrice: aiResult.unitPrice,
                totalPrice: aiResult.totalPrice
              }));
              isProcessedAsOrder = true;
              processingMethod = 'ai';
              processingSummary.aiDetectedOrders += orderResults.length;
            } else {
              processingSummary.aiSkippedNonOrders++;
              continue;
            }
          }
        }

        // ZERO ORDER MISS 정책 - 모든 댓글은 주문으로 저장
        if (!isProcessedAsOrder) {
          console.warn(`[ZERO ORDER MISS] 모든 처리 방법 실패, 강제 주문 생성: "${commentContent}"`);

          if (commentContent.trim() !== '') {
            let extractedQuantity = 1;
            let extractedUnit = '개';

            const unitPatterns = [
              { pattern: /(\d+)\s*박스/i, unit: '박스' },
              { pattern: /(\d+)\s*박(?!스)/i, unit: '박스' },
              { pattern: /(\d+)\s*개/i, unit: '개' },
              { pattern: /(\d+)\s*세트/i, unit: '세트' },
              { pattern: /(\d+)\s*세(?!트)/i, unit: '세트' },
              { pattern: /(\d+)\s*셋/i, unit: '세트' },
              { pattern: /(\d+)\s*통/i, unit: '통' },
              { pattern: /(\d+)\s*팩/i, unit: '팩' },
              { pattern: /(\d+)\s*봉/i, unit: '봉' },
              { pattern: /(\d+)\s*병/i, unit: '병' }
            ];

            for (const { pattern, unit } of unitPatterns) {
              const match = commentContent.match(pattern);
              if (match && match[1]) {
                const num = parseInt(match[1]);
                if (num >= 1 && num <= 99) {
                  extractedQuantity = num;
                  extractedUnit = unit;
                  break;
                }
              }
            }

            if (extractedQuantity === 1) {
              const koreanNumbers = {
                하나: 1,
                한: 1,
                둘: 2,
                두: 2,
                셋: 3,
                세: 3,
                넷: 4,
                네: 4,
                다섯: 5,
                여섯: 6,
                일곱: 7,
                여덟: 8,
                아홉: 9,
                열: 10
              };

              for (const [korean, number] of Object.entries(koreanNumbers)) {
                if (commentContent.includes(korean)) {
                  extractedQuantity = number;
                  break;
                }
              }

              if (extractedQuantity === 1) {
                const simpleNumberMatch = commentContent.match(/(\d+)/);
                if (simpleNumberMatch && simpleNumberMatch[1]) {
                  const num = parseInt(simpleNumberMatch[1]);
                  if (num >= 1 && num <= 99 && simpleNumberMatch[1].length <= 2) {
                    extractedQuantity = num;
                  }
                }
              }

              if (productMap && productMap.size > 0) {
                const firstProduct = Array.from(productMap.values())[0];
                if (firstProduct.quantity_text) {
                  extractedUnit = firstProduct.quantity_text;
                }
              }
            }

            console.info(`[ZERO ORDER MISS 수량 추출] "${commentContent}" → ${extractedQuantity}${extractedUnit}`);
            orderItems = [
              {
                itemNumber: 1,
                quantity: extractedQuantity,
                unit: extractedUnit,
                confidence: 10,
                matchMethod: 'emergency-fallback',
                requiresReview: true,
                note: commentContent,
                emergencyOrder: true,
                processingMethod: 'zero-miss'
              }
            ];
            isProcessedAsOrder = true;
            processingMethod = 'zero-miss';
            processingSummary.emergencyOrders = (processingSummary.emergencyOrders || 0) + 1;
            console.error(`[긴급 주문 생성] 댓글: "${commentContent}" → ${extractedQuantity}${extractedUnit} 주문 (검토 필요)`);
          } else {
            console.info('[빈 댓글] 빈 댓글은 주문으로 처리하지 않음');
            continue;
          }
        }

        // 주문으로 처리 결정 시
        if (isProcessedAsOrder && orderItems.length > 0) {
          // 고객 정보 생성 또는 업데이트
          const customerId = generateCustomerUniqueId(bandKey, userId, authorUserNo);
          if (!customers.has(customerId)) {
            customers.set(customerId, {
              customer_id: customerId,
              user_id: userId,
              band_key: bandKey,
              band_user_id: authorUserNo,
              customer_name: authorName,
              profile_image: authorProfileUrl || '',
              first_order_at: createdAt.toISOString(),
              last_order_at: createdAt.toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            processingSummary.generatedCustomers++;
          } else {
            const existingCustomer = customers.get(customerId);
            if (new Date(existingCustomer.last_order_at) < createdAt) {
              existingCustomer.last_order_at = createdAt.toISOString();
            }
            existingCustomer.updated_at = new Date().toISOString();
            existingCustomer.customer_name = authorName;
            existingCustomer.profile_image = authorProfileUrl || '';
          }

          // 각 주문 아이템에 대해 개별 주문 생성
          for (let orderIndex = 0; orderIndex < orderItems.length; orderIndex++) {
            const orderItem = orderItems[orderIndex];

            let isAmbiguous = orderItem.isAmbiguous || false;
            let productId = null;
            let itemNumber = orderItem.itemNumber || 1;
            let quantity = Math.ceil(orderItem.quantity || 1);

            if (orderItem.quantity !== quantity) {
              console.log(`[수량 변환] 소수점 수량 감지: ${orderItem.quantity} → ${quantity} (올림 처리)`);
            }

            let basePriceForOrder = 0;
            let calculatedTotalAmount = 0;
            let priceOptionDescription = null;
            let matchedExactly = false;
            let productInfo = null;

            if (matcherSystemSuccess && processingMethod === '3-matcher-system') {
              matchedExactly = true;
            } else if (processingMethod === 'pattern' || processingMethod === 'enhanced-pattern') {
              matchedExactly = true;
            } else if (processingMethod === 'pattern-fallback' && matchingMetadata?.confidence >= 0.8) {
              matchedExactly = true;
            }

            const debugInfo =
              processingMethod === '3-matcher-system' || processingMethod === 'pattern-fallback'
                ? null
                : {
                    timestamp: new Date().toISOString(),
                    commentKey: commentKey,
                    commentContent: commentContent.substring(0, 100),
                    aiMatchedItemNumber: itemNumber,
                    productMapAvailable: Array.from(productMap.keys()),
                    productMapDetails: {},
                    matchingProcess: [],
                    finalResult: {}
                  };

            if (debugInfo) {
              for (const [itemNum, product] of productMap) {
                debugInfo.productMapDetails[itemNum] = {
                  title: product.title,
                  basePrice: product.base_price,
                  productId: product.product_id
                };
              }

              debugInfo.matchingProcess.push({
                step: 'AI_MATCHING_ATTEMPT',
                itemNumber: itemNumber,
                productMapHasItem: productMap.has(itemNumber)
              });
            }

            if (itemNumber !== null && productMap.has(itemNumber)) {
              productInfo = productMap.get(itemNumber);
              if (debugInfo) {
                debugInfo.matchingProcess.push({
                  step: 'AI_MATCHING_FOUND',
                  productTitle: productInfo?.title,
                  basePrice: productInfo?.base_price,
                  productId: productInfo?.product_id,
                  isValid: !!(productInfo && productInfo.product_id)
                });
              }

              if (productInfo && productInfo.product_id) {
                productId = productInfo.product_id;
                matchedExactly = !isAmbiguous;
                if (debugInfo) {
                  debugInfo.matchingProcess.push({
                    step: 'AI_MATCHING_SUCCESS',
                    result: '매칭 성공'
                  });
                }
              } else {
                if (debugInfo) {
                  debugInfo.matchingProcess.push({
                    step: 'AI_MATCHING_INVALID',
                    result: '상품 정보가 유효하지 않음'
                  });
                }
                productInfo = null;
              }
            } else {
              if (debugInfo) {
                debugInfo.matchingProcess.push({
                  step: 'AI_MATCHING_NOT_FOUND',
                  reason: 'ProductMap에 해당 itemNumber 없음'
                });
              }
            }

            if (!productId && itemNumber && itemNumber > 0) {
              if (productMap.has(itemNumber)) {
                productInfo = productMap.get(itemNumber);
                if (productInfo && productInfo.product_id) {
                  productId = productInfo.product_id;
                  if (debugInfo) {
                    debugInfo.matchingProcess.push({
                      step: 'ENHANCED_PATTERN_ITEM_MATCH',
                      itemNumber: itemNumber,
                      productTitle: productInfo?.title,
                      result: 'Enhanced Pattern itemNumber로 상품 찾기 성공'
                    });
                  }
                }
              } else {
                if (debugInfo) {
                  debugInfo.matchingProcess.push({
                    step: 'KEEP_ENHANCED_PATTERN_ITEM_NUMBER',
                    itemNumber: itemNumber,
                    reason: 'Enhanced Pattern Matcher가 제공한 itemNumber 유지'
                  });
                }
              }
              isAmbiguous = false;
            } else if (!productId && productMap.has(1)) {
              const defaultProductInfo = productMap.get(1);
              if (debugInfo) {
                debugInfo.matchingProcess.push({
                  step: 'FALLBACK_ATTEMPT',
                  fallbackItemNumber: 1,
                  productTitle: defaultProductInfo?.title,
                  basePrice: defaultProductInfo?.base_price,
                  isValid: !!(defaultProductInfo && defaultProductInfo.product_id)
                });
              }

              if (defaultProductInfo && defaultProductInfo.product_id) {
                productId = defaultProductInfo.product_id;
                productInfo = defaultProductInfo;
                itemNumber = 1;
                isAmbiguous = true;
                if (debugInfo) {
                  debugInfo.matchingProcess.push({
                    step: 'FALLBACK_SUCCESS',
                    result: '1번 상품으로 fallback 완료'
                  });
                }
              } else {
                if (debugInfo) {
                  debugInfo.matchingProcess.push({
                    step: 'FALLBACK_FAILED',
                    result: '1번 상품 정보가 유효하지 않음'
                  });
                }
                productInfo = null;
              }
            }

            if (debugInfo) {
              debugInfo.finalResult = {
                selectedItemNumber: itemNumber,
                selectedProductId: productId,
                selectedProductTitle: productInfo?.title,
                selectedBasePrice: productInfo?.base_price,
                isAmbiguous: isAmbiguous,
                matchedExactly: matchedExactly,
                hasValidProduct: !!productInfo
              };
            }

            if (!productId || !productInfo) {
              console.error(
                `  [PID Match Failed] Comment ${commentKey}: Could not determine valid productId. Order will have null productId and 0 price.`
              );
              isAmbiguous = true;
              productInfo = null;
            }

            let adjustedQuantity = quantity;
            let conversionInfo = '';

            // 가격 계산
            if (productInfo) {
              const productOptions = productInfo.price_options || [];
              const fallbackPrice = typeof productInfo.base_price === 'number' ? productInfo.base_price : 0;

              try {
                if (processingMethod === 'pattern') {
                  if (productOptions && productOptions.length > 0) {
                    const firstOption = productOptions[0];
                    const description = firstOption.description || '';
                    const setPattern = /(\d+)세트\s*\(\s*(\d+)개\s*\)/;
                    const setMatch = description.match(setPattern);

                    const commentLower = commentContent.toLowerCase();
                    const hasGaeUnit = commentLower.includes('개');
                    const matchedUnit = orderItem?.matchedUnit || (hasGaeUnit ? '개' : null);

                    if (setMatch && matchedUnit === '개') {
                      const setsInOption = parseInt(setMatch[1]);
                      const piecesPerSet = parseInt(setMatch[2]) / setsInOption;
                      adjustedQuantity = Math.ceil(quantity / piecesPerSet);
                      conversionInfo = ` (${quantity}개 = ${adjustedQuantity}세트, ${piecesPerSet}개=1세트)`;
                      console.info(
                        `[단위 변환] "${commentContent}" → ${quantity}개 → ${adjustedQuantity}세트로 변환${conversionInfo}`
                      );
                    } else if (setMatch && !matchedUnit && quantity > 1) {
                      const setsInOption = parseInt(setMatch[1]);
                      const piecesPerSet = parseInt(setMatch[2]) / setsInOption;
                      if (quantity >= piecesPerSet && quantity % piecesPerSet === 0) {
                        adjustedQuantity = quantity / piecesPerSet;
                        conversionInfo = ` (${quantity}개로 추정 → ${adjustedQuantity}세트)`;
                        console.info(
                          `[단위 변환 추정] "${commentContent}" → ${quantity} → ${adjustedQuantity}세트로 변환${conversionInfo}`
                        );
                      }
                    }
                  } else {
                    console.info(
                      `[단위 변환 스킵] orderItem.matchedUnit: ${orderItem?.matchedUnit}, description: ${productOptions?.[0]?.description}`
                    );
                  }

                  if (hasOrderNeedsAiProduct && !shouldUseAI) {
                    console.info(`⚠️ [패턴 처리] order_needs_ai=true 상품을 AI OFF 모드에서 처리 (정확도 저하 가능)`);

                    const isSetProduct =
                      commentContent.includes('세트') &&
                      productOptions?.length > 0 &&
                      productOptions[0]?.quantity > 1 &&
                      productOptions[0]?.description?.includes('세트');

                    if (isSetProduct) {
                      calculatedTotalAmount = adjustedQuantity * productOptions[0].price;
                      basePriceForOrder = productOptions[0].price;
                      priceOptionDescription = `세트 상품 특별 처리 (${adjustedQuantity}세트 × ${productOptions[0].price}원)`;
                      console.info(
                        `🎯 [세트 상품 처리] "${commentContent}" → ${adjustedQuantity}세트 × ${productOptions[0].price}원 = ${calculatedTotalAmount}원`
                      );
                    } else {
                      if ((processingMethod === 'integrated-matcher' || processingMethod === 'pattern-fallback') && orderItem.price) {
                        const unitPrice = orderItem.price;
                        const effectiveQuantity = adjustedQuantity > 0 ? adjustedQuantity : quantity > 0 ? quantity : 1;
                        calculatedTotalAmount = unitPrice * effectiveQuantity;
                        basePriceForOrder = unitPrice;
                        console.info(
                          `[order_needs_ai 상품] Matcher 단가 사용: ${unitPrice}원 × ${effectiveQuantity} = ${calculatedTotalAmount}원`
                        );
                      } else {
                        calculatedTotalAmount = calculateOptimalPrice(adjustedQuantity, productOptions, fallbackPrice, commentContent, productMap);
                      }
                      basePriceForOrder = adjustedQuantity > 0 ? calculatedTotalAmount / adjustedQuantity : fallbackPrice;
                      priceOptionDescription = '패턴 처리 - order_needs_ai 상품 (OFF 모드)';
                    }
                  } else if (!hasOrderNeedsAiProduct) {
                    console.info(
                      `[가격 체크] processingMethod=${processingMethod}, orderItem.price=${orderItem.price}, orderItem.productName=${orderItem.productName}`
                    );
                    if (
                      (processingMethod === 'integrated-matcher' ||
                        processingMethod === 'pattern-fallback' ||
                        orderItem.enhancedPattern) &&
                      orderItem.price
                    ) {
                      const unitPrice = orderItem.price;
                      const effectiveQuantity = adjustedQuantity > 0 ? adjustedQuantity : quantity > 0 ? quantity : 1;
                      calculatedTotalAmount = unitPrice * effectiveQuantity;
                      basePriceForOrder = unitPrice;
                      priceOptionDescription = 'Enhanced Pattern - 계산된 가격 사용';
                      console.info(
                        `[Enhanced Pattern 가격] "${commentContent}" → ${adjustedQuantity}개 = ${calculatedTotalAmount}원 (단가: ${basePriceForOrder}원, productName: ${orderItem.productName})`
                      );
                    } else {
                      if ((processingMethod === 'integrated-matcher' || processingMethod === 'pattern-fallback') && orderItem.price) {
                        const unitPrice = orderItem.price;
                        const effectiveQuantity = adjustedQuantity > 0 ? adjustedQuantity : quantity > 0 ? quantity : 1;
                        calculatedTotalAmount = unitPrice * effectiveQuantity;
                        basePriceForOrder = unitPrice;
                        console.info(`[일반 상품] Matcher 단가 사용: ${unitPrice}원 × ${effectiveQuantity} = ${calculatedTotalAmount}원`);
                      } else {
                        calculatedTotalAmount = calculateOptimalPrice(adjustedQuantity, productOptions, fallbackPrice, commentContent, productMap);
                      }
                    }

                    if (adjustedQuantity > 0) {
                      basePriceForOrder = Math.round(calculatedTotalAmount / adjustedQuantity);
                    } else {
                      basePriceForOrder = fallbackPrice;
                    }
                    priceOptionDescription = `패턴 처리 - 기본 계산${conversionInfo}`;
                    console.info(
                      `[패턴 처리 가격 계산] "${commentContent}" → ${adjustedQuantity}${
                        conversionInfo ? '세트' : '개'
                      } = ${calculatedTotalAmount}원 (단가: ${basePriceForOrder}원)`
                    );
                  }
                } else if (processingMethod === 'ai') {
                  if (productOptions && productOptions.length > 0) {
                    const firstOption = productOptions[0];
                    const description = firstOption.description || '';
                    const setPattern = /(\d+)세트\s*\(\s*(\d+)개\s*\)/;
                    const setMatch = description.match(setPattern);

                    const commentLower = commentContent.toLowerCase();
                    const hasGaeUnit = commentLower.includes('개') && !commentLower.includes('세트');

                    if (setMatch && hasGaeUnit && quantity > 1) {
                      const setsInOption = parseInt(setMatch[1]);
                      const piecesPerSet = parseInt(setMatch[2]) / setsInOption;
                      if (quantity >= piecesPerSet) {
                        adjustedQuantity = Math.ceil(quantity / piecesPerSet);
                        conversionInfo = ` (${quantity}개 = ${adjustedQuantity}세트, ${piecesPerSet}개=1세트)`;
                        console.info(`[AI 단위 변환] "${commentContent}" → ${quantity}개 → ${adjustedQuantity}세트로 변환${conversionInfo}`);
                      }
                    }
                  }

                  const aiTotalPrice = orderItem.totalPrice || orderItem.price || orderItem.total_price;
                  const aiUnitPrice = orderItem.unitPrice || orderItem.unit_price;

                  if ((aiTotalPrice && aiTotalPrice > 0) || (aiUnitPrice && aiUnitPrice > 0)) {
                    let finalUnitPrice, finalTotalPrice;
                    if (aiUnitPrice && aiUnitPrice > 0) {
                      finalUnitPrice = aiUnitPrice;
                      finalTotalPrice = aiTotalPrice && aiTotalPrice > 0 ? aiTotalPrice : finalUnitPrice * adjustedQuantity;
                    } else {
                      finalTotalPrice = aiTotalPrice;
                      finalUnitPrice = Math.round(finalTotalPrice / adjustedQuantity);
                    }

                    if (conversionInfo && adjustedQuantity !== quantity) {
                      calculatedTotalAmount = finalUnitPrice * adjustedQuantity;
                      basePriceForOrder = finalUnitPrice;
                    } else {
                      calculatedTotalAmount = finalTotalPrice;
                      basePriceForOrder = finalUnitPrice;
                    }

                    const optionKeyword = orderItem.selectedOption || '';
                    if (optionKeyword) {
                      priceOptionDescription = `AI 분석: ${optionKeyword}`;
                    } else {
                      priceOptionDescription = 'AI 직접 계산';
                    }
                  } else if (orderItem.selectedOption && productOptions.length > 0) {
                    const selectedPackage = productOptions.find((opt) => opt.description && opt.description.includes(orderItem.selectedOption));
                    if (selectedPackage) {
                      calculatedTotalAmount = selectedPackage.price;
                      basePriceForOrder = Math.round(selectedPackage.price / quantity);
                      priceOptionDescription = selectedPackage.description;
                    } else {
                      if ((processingMethod === 'integrated-matcher' || processingMethod === 'pattern-fallback') && orderItem.price) {
                        const unitPrice = orderItem.price;
                        const effectiveQuantity = adjustedQuantity > 0 ? adjustedQuantity : quantity > 0 ? quantity : 1;
                        calculatedTotalAmount = unitPrice * effectiveQuantity;
                        basePriceForOrder = unitPrice;
                        console.info(`[복합 단위] Matcher 단가 사용: ${unitPrice}원 × ${effectiveQuantity} = ${calculatedTotalAmount}원`);
                      } else {
                        calculatedTotalAmount = calculateOptimalPrice(adjustedQuantity, productOptions, fallbackPrice, commentContent, productMap);
                      }

                      if (adjustedQuantity > 0) {
                        basePriceForOrder = Math.round(calculatedTotalAmount / adjustedQuantity);
                      } else {
                        basePriceForOrder = fallbackPrice;
                      }
                      priceOptionDescription = 'AI 옵션 매칭 실패 - 기본 계산';
                    }
                  } else {
                    if ((processingMethod === 'integrated-matcher' || processingMethod === 'pattern-fallback') && orderItem.price) {
                      const unitPrice = orderItem.price;
                      const effectiveQuantity = adjustedQuantity > 0 ? adjustedQuantity : quantity > 0 ? quantity : 1;
                      calculatedTotalAmount = unitPrice * effectiveQuantity;
                      basePriceForOrder = unitPrice;
                      console.info(`[AI 처리 else] Matcher 단가 사용: ${unitPrice}원 × ${effectiveQuantity} = ${calculatedTotalAmount}원`);
                    } else {
                      calculatedTotalAmount = calculateOptimalPrice(adjustedQuantity, productOptions, fallbackPrice, commentContent, productMap);
                    }

                    if (adjustedQuantity > 0) {
                      basePriceForOrder = Math.round(calculatedTotalAmount / adjustedQuantity);
                    } else {
                      basePriceForOrder = fallbackPrice;
                    }
                    priceOptionDescription = 'AI 가격 없음 - 기본 계산';
                  }
                } else if (processingMethod === '3-matcher-system') {
                  adjustedQuantity = quantity;
                  console.info(`[3-matcher 가격 체크] orderItem.price: ${orderItem.price} (타입: ${typeof orderItem.price})`);
                  if (orderItem.price !== undefined && orderItem.price !== null) {
                    basePriceForOrder = orderItem.price;
                    calculatedTotalAmount = orderItem.price * adjustedQuantity;
                    console.info(`[3-matcher 가격 사용] 단가: ${basePriceForOrder}원 × ${adjustedQuantity}개 = 총액: ${calculatedTotalAmount}원`);
                  } else {
                    calculatedTotalAmount = calculateOptimalPrice(quantity, productOptions, fallbackPrice, commentContent, productMap);
                    if (adjustedQuantity > 0) {
                      basePriceForOrder = Math.round(calculatedTotalAmount / adjustedQuantity);
                    } else {
                      basePriceForOrder = fallbackPrice;
                    }
                  }
                  priceOptionDescription =
                    '3-matcher-system - ' + (orderItem.price !== undefined && orderItem.price !== null ? 'matcher 계산' : '기본 계산');
                  console.info(`[3-matcher 가격 계산] "${commentContent}" → ${adjustedQuantity}개 = ${calculatedTotalAmount}원 (단가: ${basePriceForOrder}원)`);
                } else {
                  adjustedQuantity = quantity;
                  if ((processingMethod === 'integrated-matcher' || processingMethod === 'pattern-fallback') && orderItem.price) {
                    const unitPrice = orderItem.price;
                    const effectiveQuantity = quantity > 0 ? quantity : 1;
                    calculatedTotalAmount = unitPrice * effectiveQuantity;
                    basePriceForOrder = unitPrice;
                    console.info(`[가격 사용] Matcher 단가 사용: ${unitPrice}원 × ${effectiveQuantity} = ${calculatedTotalAmount}원`);
                  } else {
                    calculatedTotalAmount = calculateOptimalPrice(quantity, productOptions, fallbackPrice, commentContent, productMap);
                  }

                  if (quantity > 0) {
                    basePriceForOrder = Math.round(calculatedTotalAmount / quantity);
                  } else {
                    basePriceForOrder = fallbackPrice;
                  }
                  priceOptionDescription = processingMethod + ' - 기본 계산';
                }
              } catch (calcError) {
                console.error(`  [Price Calc Error] Comment ${commentKey}: Error during calculateOptimalPrice: ${calcError.message}`);
                calculatedTotalAmount = 0;
                basePriceForOrder = 0;
                isAmbiguous = true;
              }
            } else {
              console.warn(`  [Price Calc Skip] Comment ${commentKey}: Skipping calculation due to missing productInfo.`);
              basePriceForOrder = 0;
              calculatedTotalAmount = 0;
            }

            // 최종 주문 상태 결정
            let finalSubStatus = null;
            const hasValidPatternMatch = processingMethod === 'enhanced-pattern' && orderItem && orderItem.confidence >= 85;

            if ((!/\d/.test(commentContent) && !hasValidPatternMatch) || isAmbiguous) {
              finalSubStatus = '확인필요';
            } else if (isMultipleProductsPost && productId && !matchedExactly) {
              finalSubStatus = '확인필요';
            } else if (
              processingMethod === 'ai' &&
              orderItem &&
              orderItem.reason &&
              (orderItem.reason.includes('가격 효율성') ||
                orderItem.reason.includes('적절하게 선택') ||
                orderItem.reason.includes('합리적') ||
                orderItem.reason.includes('가장 많이 구매할 법한'))
            ) {
              finalSubStatus = '확인필요';
              console.info(`⚠️ [모호한 주문 감지] 댓글 "${commentContent}" - AI가 추론으로 처리: ${orderItem.reason}`);
            } else {
              if (productInfo && productInfo.pickup_date) {
                try {
                  const pickupDate = new Date(productInfo.pickup_date);
                  const currentDate = new Date();
                  pickupDate.setHours(23, 59, 59, 999);
                  currentDate.setHours(0, 0, 0, 0);

                  if (currentDate > pickupDate) {
                    finalSubStatus = '미수령';
                  } else {
                    finalSubStatus = null;
                  }
                } catch (dateError) {
                  console.warn(`  [Date Parse Error] Comment ${commentKey}: Invalid pickup_date format: ${productInfo.pickup_date}`);
                  finalSubStatus = null;
                }
              } else {
                finalSubStatus = null;
              }
            }

            // 주문 데이터 객체 생성
            const orderId = generateOrderUniqueId(userId, bandKey, postKey, commentKey, `${itemNumber}_${orderIndex}`);

            let extractionResultForDb = null;
            if (orderItem) {
              if (processingMethod === 'ai') {
                extractionResultForDb = {
                  processingMethod: 'ai',
                  isOrder: orderItem.isOrder,
                  reason: orderItem.reason,
                  isAmbiguous: orderItem.isAmbiguous,
                  productItemNumber: orderItem.itemNumber,
                  quantity: orderItem.quantity,
                  commentContent: orderItem.commentContent,
                  author: orderItem.author,
                  expectedUnitPrice: orderItem.unitPrice || null,
                  expectedTotalPrice: orderItem.totalPrice || null,
                  actualUnitPrice: basePriceForOrder,
                  actualTotalPrice: calculatedTotalAmount,
                  selectedOption: orderItem.selectedOption || null,
                  priceMatchAccuracy: orderItem.totalPrice ? 1.0 : null
                };
              } else {
                extractionResultForDb = {
                  processingMethod: processingMethod,
                  isAmbiguous: orderItem.isAmbiguous,
                  productItemNumber: orderItem.itemNumber,
                  quantity: orderItem.quantity,
                  matchedKeyword: orderItem.matchedKeyword || null,
                  matchType: orderItem.matchType || null,
                  actualUnitPrice: basePriceForOrder,
                  actualTotalPrice: calculatedTotalAmount,
                  selectedOption: orderItem.selectedOption || null,
                  matchedNumber: orderItem.matchedNumber || null,
                  matchedUnit: orderItem.matchedUnit || null
                };
              }
            }

            const enhancedExtractionResult =
              processingMethod === '3-matcher-system' || processingMethod === 'pattern-fallback'
                ? null
                : {
                    ...(extractionResultForDb || {}),
                    debugInfo: debugInfo,
                    priceCalculation: {
                      basePriceForOrder: basePriceForOrder,
                      calculatedTotalAmount: calculatedTotalAmount,
                      priceOptionDescription: priceOptionDescription,
                      quantity: quantity
                    },
                    aiResponseDebug:
                      processingMethod === 'ai'
                        ? {
                            originalOrderItem: {
                              totalPrice: orderItem.totalPrice,
                              unitPrice: orderItem.unitPrice,
                              price: orderItem.price,
                              total_price: orderItem.total_price,
                              unit_price: orderItem.unit_price,
                              selectedOption: orderItem.selectedOption,
                              isOrder: orderItem.isOrder,
                              reason: orderItem.reason,
                              quantity: orderItem.quantity,
                              itemNumber: orderItem.itemNumber,
                              commentContent: orderItem.commentContent,
                              author: orderItem.author
                            },
                            priceProcessingFlow: {
                              step1_extractedPrices: {
                                aiTotalPrice: orderItem.totalPrice || orderItem.price || orderItem.total_price,
                                aiUnitPrice: orderItem.unitPrice || orderItem.unit_price
                              },
                              step2_priceDetectionResult: {
                                hasTotalPrice: !!(orderItem.totalPrice || orderItem.price || orderItem.total_price),
                                hasUnitPrice: !!(orderItem.unitPrice || orderItem.unit_price),
                                hasSelectedOption: !!orderItem.selectedOption,
                                priceDetectionPath:
                                  orderItem.totalPrice || orderItem.price || orderItem.total_price || orderItem.unitPrice || orderItem.unit_price
                                    ? '가격정보있음'
                                    : orderItem.selectedOption
                                    ? '옵션만있음'
                                    : '가격정보없음'
                              },
                              step3_finalCalculation: {
                                finalTotalAmount: calculatedTotalAmount,
                                finalUnitPrice: basePriceForOrder,
                                priceOptionDescription: priceOptionDescription,
                                calculationMethod: priceOptionDescription
                              }
                            }
                          }
                        : null
                  };

            const rawFinalQuantity = (processingMethod === 'pattern' || processingMethod === 'ai') && adjustedQuantity ? adjustedQuantity : quantity;
            const finalQuantity = Math.ceil(rawFinalQuantity);

            if (rawFinalQuantity !== finalQuantity) {
              console.log(`[최종 수량 변환] 소수점 수량 감지: ${rawFinalQuantity} → ${finalQuantity} (올림 처리)`);
            }

            const orderData = {
              order_id: orderId,
              customer_id: customerId,
              user_id: userId,
              band_key: bandKey,
              band_number: bandNumber,
              post_key: postKey,
              post_number: null,
              comment_key: commentKey,
              customer_band_id: authorUserNo,
              customer_name: authorName,
              product_id: productId,
              product_name: orderItem.productName || productInfo?.title || null,
              item_number: itemNumber,
              quantity: finalQuantity,
              price: basePriceForOrder,
              total_amount: calculatedTotalAmount,
              status: '주문완료',
              sub_status: finalSubStatus,
              comment: commentContent,
              ordered_at: createdAt.toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              processing_method: processingMethod || 'unknown',
              price_option_used: priceOptionDescription || '기본가',
              ai_extraction_result: enhancedExtractionResult,
              ai_process_reason:
                (processingMethod === 'ai-fallback' || processingMethod === 'ai') && orderItem?.aiReason
                  ? orderItem.aiReason
                  : processingMethod === 'ai' && matchingMetadata?.aiReason
                  ? matchingMetadata.aiReason
                  : null,
              matching_metadata: matchingMetadata
                ? {
                    ...matchingMetadata,
                    comment: commentContent,
                    itemNumber: itemNumber,
                    quantity: finalQuantity,
                    productName: orderItem?.productName || productInfo?.title || null,
                    matchMethod: orderItem?.matchMethod || null,
                    commentAnalysis: {
                      type: processingMethod === 'integrated-matcher' ? 'integrated-matcher' : processingMethod,
                      originalComment: commentContent,
                      hasNumbers: /\d/.test(commentContent) || /[한두세네다섯여섯일곱여덟아홉열]/.test(commentContent),
                      extractedQuantity: finalQuantity
                    }
                  }
                : {
                    matcherUsed: processingMethod || 'legacy',
                    confidence: orderItem?.confidence || 0,
                    timestamp: new Date().toISOString(),
                    comment: commentContent,
                    itemNumber: itemNumber,
                    quantity: finalQuantity,
                    productName: orderItem?.productName || productInfo?.title || null,
                    matchMethod: orderItem?.matchMethod || null,
                    commentAnalysis: {
                      type: processingMethod,
                      originalComment: commentContent,
                      hasNumbers: /\d/.test(commentContent) || /[한두세네다섯여섯일곱여덟아홉열]/.test(commentContent),
                      extractedQuantity: finalQuantity
                    }
                  },
              pattern_details: matchingMetadata?.patternDetails || null
            };

            console.log('[주문생성] pattern_details 저장:', {
              orderId: orderId,
              processingMethod,
              hasMatchingMetadata: !!matchingMetadata,
              hasPatternDetails: !!matchingMetadata?.patternDetails,
              patternDetails: matchingMetadata?.patternDetails ? JSON.stringify(matchingMetadata.patternDetails, null, 2).substring(0, 300) : 'null'
            });

            orders.push(orderData);
            processingSummary.generatedOrders++;
          }
        }
      } catch (error) {
        console.error(`[주문 생성] Error processing comment ${comment?.commentKey} on post ${postKey}: ${error.message}`, error.stack);
        processingSummary.errors.push({
          commentKey: comment?.commentKey,
          postKey: postKey,
          error: error.message
        });
      }
    }

    // 요약 로그
    const aiOrderCount = processingSummary.aiDetectedOrders;
    const ruleOrderCount = processingSummary.ruleBasedOrders;
    const skippedCount =
      processingSummary.aiSkippedNonOrders + processingSummary.skippedExcluded + processingSummary.skippedMissingInfo;

    const totalAICallsOptimized = comments.length - (commentsForAI?.length || 0);
    const optimizationRate = comments.length > 0 ? Math.round((totalAICallsOptimized / comments.length) * 100) : 0;

    console.info(`[최적화 완료] 게시물 ${postKey}: 패턴 ${ruleOrderCount}개, AI ${aiOrderCount}개, 총 ${processingSummary.generatedOrders}개 주문`);

    if (processingSummary.errors.length > 0) {
      console.error(`[주문 생성] 게시물 ${postKey}: ${processingSummary.errors.length}개 댓글 처리 실패`);
      return {
        orders,
        customers,
        success: false,
        error: `${processingSummary.errors.length}개 댓글 처리 중 오류 발생`,
        errors: processingSummary.errors
      };
    }

    return {
      orders,
      customers,
      cancellationUsers,
      success: true
    };
  } catch (error) {
    console.error(`게시물 ${postKey} 처리 중 오류`, error);
    processingSummary.errors.push({
      type: 'function_error',
      message: error.message
    });

    return {
      orders: [],
      customers: new Map(),
      success: false,
      error: error.message
    };
  }
}

/**
 * DB에서 특정 게시물의 상품 정보 가져오기
 *
 * @param {Object} supabase - Supabase 클라이언트 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @returns {Promise<Map>} 상품 정보 Map (itemNumber -> product)
 */
export async function fetchProductMapForPost(supabase, userId, postKey) {
  const productMap = new Map();
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('product_id, base_price, price_options, item_number, title, quantity_text')
      .eq('user_id', userId)
      .eq('post_key', postKey);

    if (error) {
      console.error(`[fetchProductMap] DB Error for post ${postKey}: ${error.message}`);
      throw error;
    }

    if (products && products.length > 0) {
      products.forEach((p) => {
        const itemNumKey = typeof p.item_number === 'number' && p.item_number > 0 ? p.item_number : 1;
        if (p.product_id) {
          productMap.set(itemNumKey, {
            product_id: p.product_id,
            base_price: p.base_price,
            price_options: p.price_options || [],
            title: p.title,
            quantity_text: p.quantity_text,
            item_number: itemNumKey,
            itemNumber: itemNumKey
          });
        } else {
          console.warn(`[fetchProductMap] Product missing product_id for post ${postKey}, item_number ${itemNumKey}`);
        }
      });
    }
  } catch (e) {
    console.error(`[fetchProductMap] Exception for post ${postKey}: ${e.message}`, e.stack);
    throw e;
  }

  return productMap;
}
