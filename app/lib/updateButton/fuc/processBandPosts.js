/**
 * Band 게시물 처리 메인 오케스트레이터
 * backend/supabase/functions/band-get-posts-a/index.ts의 Deno.serve 로직을 프론트엔드용으로 이식
 */

// Band API
import { BandApiFailover } from './bandApi/BandApiFailover.js';
import { fetchBandPostsWithFailover } from './bandApi/bandApiClient.js';
import { fetchBandCommentsWithFailover } from './bandApi/bandApiClient.js';

// Product Processing
import { getDefaultProduct } from './productProcessing/defaultProduct.js';
import { processProduct } from './productProcessing/productProcessor.js';
import { extractProductInfoAI } from './productExtraction.js';

// Order Generation
import { generateOrderData } from './orderGeneration/generateOrderData.js';

// DB Operations
import { savePostAndProducts } from './db/dbSaveHelpers.js';
import { fetchProductMapForPost } from './db/dbFetchHelpers.js';
import { saveOrdersAndCustomersSafely } from '../../band-processor/shared/db/saveHelpers.js';

// Cancellation
import { processCancellationRequests } from './cancellation/cancellationProcessor.js';

// Utils
import { contentHasPriceIndicator } from './utils/textUtils';
import { enhancePickupDateFromContent } from './utils/pickupDateEnhancer.js';

/**
 * 함수명: processBandPosts
 * 목적: Band 게시물 및 댓글을 가져와 AI로 분석하고 주문 데이터 생성
 * 사용처: 프론트엔드 업데이트 버튼 클릭 시
 * 의존성: 모든 이식된 함수들
 * 파라미터:
 *   - supabase: Supabase 클라이언트 인스턴스
 *   - userId: 사용자 ID
 *   - options: 옵션 객체
 *     - testMode: 테스트 모드 (기본값: false)
 *     - processingLimit: 처리할 게시물 수 (기본값: 사용자 설정값)
 *     - processWithAI: AI 처리 여부 (기본값: true)
 *     - simulateQuotaError: 할당량 에러 시뮬레이션 (기본값: false)
 * 리턴값: {success, message, stats} 처리 결과 객체
 */
export async function processBandPosts(supabase, userId, options = {}) {
  const {
    testMode = false,
    processingLimit: requestedLimit = null,
    processWithAI = true,
    simulateQuotaError = false
  } = options;

  let executionKey = null;
  let bandApiFailover = null;

  try {
    console.log(`[processBandPosts] 시작: userId=${userId}, testMode=${testMode}`);

    // 유효성 검사
    if (!userId) {
      throw new Error("파라미터 'userId'가 필요합니다.");
    }

    // 🧪 테스트 모드 로깅
    if (testMode) {
      console.log(`🧪 테스트 모드 실행: userId=${userId} - 데이터베이스에 저장하지 않음`);
    }

    // 실행 시작 기록
    executionKey = `band_update_${userId}`;
    const { error: lockError } = await supabase
      .from("execution_locks")
      .upsert(
        {
          key: executionKey,
          user_id: userId,
          is_running: true,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "key" }
      );

    if (lockError) {
      console.error(`[실행 잠금 실패] ${lockError.message}`);
    }

    // 사용자 설정 조회
    const { data: userSettings, error: userSettingsError } = await supabase
      .from("users")
      .select("post_fetch_limit, auto_barcode_generation, ignore_order_needs_ai, ai_analysis_level, ai_mode_migrated")
      .eq("user_id", userId)
      .single();

    const defaultLimit = userSettings?.post_fetch_limit || 200;

    // 처리 제한 설정
    let processingLimit;
    if (userSettings?.post_fetch_limit) {
      processingLimit = userSettings.post_fetch_limit;
    } else {
      processingLimit = requestedLimit && requestedLimit > 0 ? requestedLimit : defaultLimit;
    }

    // 🧪 테스트 모드에서는 처리량 제한 (최대 5개)
    const maxLimit = testMode ? 5 : 1000;
    processingLimit = Math.min(processingLimit, maxLimit);

    if (userSettingsError) {
      console.warn(`사용자 설정 조회 실패: ${userSettingsError.message}, 기본값 200 사용`);
    } else {
      console.log(
        `사용자 ${userId}의 게시물 제한 설정: ${userSettings?.post_fetch_limit || "미설정(기본값 200)"} → 실제 가져올 개수: ${processingLimit}개`
      );
    }

    console.log(
      `processBandPosts 호출됨: userId=${userId}, limit=${processingLimit}, processAI=${processWithAI}, testMode=${testMode}, simulateQuotaError=${simulateQuotaError}`
    );

    // === Band API Failover 초기화 ===
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    bandApiFailover = new BandApiFailover(supabase, userId, sessionId, simulateQuotaError);

    try {
      await bandApiFailover.loadApiKeys();
      await bandApiFailover.startSession();
    } catch (error) {
      throw new Error(`API 키 설정 오류: ${error.message}`);
    }

    // === 메인 로직 ===
    // 🔥 SMART PRIORITY SYSTEM START 🔥

    // 0-1. DB에서 pending 또는 failed 상태인 posts 먼저 조회
    console.log(`DB에서 pending/failed 상태 게시물 조회`);
    const { data: pendingPosts, error: pendingError } = await supabase
      .from("posts")
      .select("post_key, title, comment_count, last_checked_comment_at, posted_at")
      .eq("user_id", userId)
      .in("comment_sync_status", ["pending", "failed"])
      .order("comment_count", { ascending: false })
      .limit(100);

    if (pendingError) {
      console.error(`Pending posts 조회 실패: ${pendingError.message}`);
    } else {
      console.log(`[0-1단계] ${pendingPosts?.length || 0}개의 pending/failed 게시물 발견`);
    }

    // 0-2. 7일 이상 체크 안 한 posts 조회
    console.log(`7일 이상 체크 안 한 게시물 조회`);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldUncheckedPosts, error: oldError } = await supabase
      .from("posts")
      .select("post_key, title, comment_count, last_checked_comment_at, posted_at")
      .eq("user_id", userId)
      .gt("comment_count", 0)
      .or(`last_checked_comment_at.is.null,last_checked_comment_at.lt.${sevenDaysAgo}`)
      .order("comment_count", { ascending: false })
      .limit(100);

    if (oldError) {
      console.error(`Old unchecked posts 조회 실패: ${oldError.message}`);
    } else {
      console.log(`${oldUncheckedPosts?.length || 0}개의 오래된 미체크 게시물 발견`);
    }

    // 1. Band API 게시물 가져오기
    console.log(`밴드 API에서 게시물 가져오기 시작`);
    const { posts, bandKey, bandNumber } = await fetchBandPostsWithFailover(
      bandApiFailover,
      userId,
      processingLimit,
      supabase
    );
    console.log(`게시물 가져오기 완료`, { count: posts.length });

    if (!Array.isArray(posts)) {
      throw new Error("Failed to fetch posts or invalid format.");
    }

    // 🔥 SMART PRIORITY: pending/old posts를 Band API format으로 변환하여 추가
    console.log(`DB posts를 Band API 형식으로 변환`);
    const dbPostsToAdd = new Set();

    // Pending posts 추가
    if (pendingPosts && pendingPosts.length > 0) {
      for (const dbPost of pendingPosts) {
        if (!posts.some((p) => p.postKey === dbPost.post_key)) {
          dbPostsToAdd.add(dbPost.post_key);
        }
      }
    }

    // Old unchecked posts 추가
    if (oldUncheckedPosts && oldUncheckedPosts.length > 0) {
      for (const dbPost of oldUncheckedPosts) {
        if (!posts.some((p) => p.postKey === dbPost.post_key) && !dbPostsToAdd.has(dbPost.post_key)) {
          dbPostsToAdd.add(dbPost.post_key);
        }
      }
    }

    // DB에서 추가할 posts의 상세 정보 조회
    if (dbPostsToAdd.size > 0) {
      console.log(`[1-3단계] ${dbPostsToAdd.size}개의 추가 posts 정보 조회 중...`);
      const { data: additionalPosts, error: additionalError } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", userId)
        .in("post_key", Array.from(dbPostsToAdd));

      if (!additionalError && additionalPosts) {
        for (const dbPost of additionalPosts) {
          posts.push({
            postKey: dbPost.post_key,
            bandKey: dbPost.band_key || bandKey,
            title: dbPost.title,
            content: dbPost.content || "",
            commentCount: dbPost.comment_count,
            createdAt: dbPost.posted_at,
            author: { role: "admin" },
            url: dbPost.url || "",
            fromDB: true
          });
        }
        console.log(`[1-3단계] ${additionalPosts.length}개의 DB posts 추가됨. 총 ${posts.length}개 처리 예정`);
      }
    }

    let postsWithAnalysis = [];
    let postsToUpdateCommentInfo = [];

    // 2. DB 기존 게시물 조회
    console.log(`DB에서 기존 게시물 정보 가져오기`);
    const dbPostsMap = new Map();

    if (posts.length > 0) {
      try {
        const postKeys = posts.map((p) => p.postKey).filter(Boolean);
        if (postKeys.length > 0) {
          const { data: dbPosts, error: dbError } = await supabase
            .from("posts")
            .select(
              "post_id, post_key, comment_count, last_checked_comment_at, is_product, ai_extraction_status, order_needs_ai, comment_sync_status"
            )
            .eq("user_id", userId)
            .in("post_key", postKeys);

          if (dbError) throw dbError;

          dbPosts.forEach((dbPost) => {
            dbPostsMap.set(dbPost.post_key, {
              post_id: dbPost.post_id,
              comment_count: dbPost.comment_count,
              last_checked_comment_at: dbPost.last_checked_comment_at
                ? new Date(dbPost.last_checked_comment_at).getTime()
                : 0,
              ai_extraction_status: dbPost.ai_extraction_status,
              is_product: dbPost.is_product,
              order_needs_ai: dbPost.order_needs_ai === true,
              comment_sync_status: dbPost.comment_sync_status
            });
          });
          console.log(`[2단계] ${dbPostsMap.size}개의 기존 게시물을 찾았습니다.`);
        } else {
          console.warn(`API에서 유효한 게시물 키가 없습니다.`);
        }
      } catch (error) {
        console.error(`[2단계] DB post fetch error: ${error.message}`);
      }

      // 4. 게시물 순회 및 처리
      console.log(`API 게시물 처리 시작`, { count: posts.length });

      // 🎯 배치 처리를 위한 설정
      const POST_BATCH_SIZE = 10; // 게시물 10개씩 배치 처리
      const MAX_CONCURRENT_AI_REQUESTS = 8; // 동시 AI 요청 최대 8개

      // AI 동시 요청 제한을 위한 세마포어
      let currentAIRequests = 0;
      const aiRequestQueue = [];

      const acquireAISlot = async () => {
        while (currentAIRequests >= MAX_CONCURRENT_AI_REQUESTS) {
          await new Promise((resolve) => {
            aiRequestQueue.push(resolve);
          });
        }
        currentAIRequests++;
      };

      const releaseAISlot = () => {
        currentAIRequests--;
        const nextRequest = aiRequestQueue.shift();
        if (nextRequest) {
          nextRequest();
        }
      };

      // AI 요청을 세마포어로 제한하는 래퍼 함수
      const limitedAIRequest = async (aiFunction, ...args) => {
        await acquireAISlot();
        try {
          return await aiFunction(...args);
        } finally {
          releaseAISlot();
        }
      };

      // 게시물을 배치로 나누기
      const postBatches = [];
      for (let i = 0; i < posts.length; i += POST_BATCH_SIZE) {
        postBatches.push(posts.slice(i, i + POST_BATCH_SIZE));
      }

      console.log(`📊 게시물 배치 처리 시작`, {
        totalPosts: posts.length,
        batchCount: postBatches.length,
        batchSize: POST_BATCH_SIZE,
        maxConcurrentAI: MAX_CONCURRENT_AI_REQUESTS
      });

      const allProcessedResults = [];

      // 각 배치를 순차적으로 처리
      for (let batchIndex = 0; batchIndex < postBatches.length; batchIndex++) {
        const batch = postBatches[batchIndex];
        const batchStartTime = Date.now();
        console.log(`🔄 배치 ${batchIndex + 1}/${postBatches.length} 처리 시작 (${batch.length}개 게시물)`);

        // 현재 배치의 게시물들을 병렬로 처리 (AI 요청은 제한됨)
        const batchPromises = batch.map(async (apiPost) => {
          if (!apiPost || !apiPost.postKey || !apiPost.bandKey || !apiPost.author) {
            console.warn("Skipping invalid post data:", apiPost);
            return null;
          }

          const postKey = apiPost.postKey;
          const dbPostData = dbPostsMap.get(postKey);
          const isNewPost = !dbPostData;
          let aiAnalysisResult = null;
          let savedPostId = null;
          let processCommentsAndOrders = false;
          let forceProcessAllComments = false;
          const isOrderNeedsAi = dbPostData?.order_needs_ai === true;
          let postProcessingError = null;
          let aiExtractionStatus = "not_attempted";

          // 변수 초기화
          let finalCommentCountForUpdate = apiPost.commentCount ?? (dbPostData?.comment_count || 0);
          let latestCommentTimestampForUpdate = null;
          let successfullyProcessedNewComments = false;
          let comments = [];

          try {
            // === 신규 게시물 처리 ===
            if (isNewPost) {
              const mightBeProduct = contentHasPriceIndicator(apiPost.content);

              // 가격 정보가 없으면 상품 게시물이 아님
              if (!mightBeProduct) {
                console.log(`[상품 분류] 가격 정보 없음 - 비상품 게시물로 분류: ${postKey}`);

                const processedPostData = {
                  post_id: `${userId}_post_${postKey}`,
                  user_id: userId,
                  post_key: postKey,
                  band_key: bandKey,
                  title: "공지사항",
                  content: apiPost.content,
                  author_name: apiPost.author?.name || "",
                  author_id: apiPost.author?.user_id || "",
                  author_description: apiPost.author?.description || "",
                  author_profile: apiPost.author?.profile_image_url || "",
                  author_user_key: apiPost.author?.user_key || "",
                  posted_at: apiPost.createdAt
                    ? new Date(apiPost.createdAt).toISOString()
                    : new Date().toISOString(),
                  comment_count: apiPost.commentCount || 0,
                  emotion_count: apiPost.emotion_count || 0,
                  image_urls: apiPost.photos ? apiPost.photos.map((p) => p.url) : null,
                  photos_data: apiPost.photos || null,
                  latest_comments: apiPost.latest_comments || null,
                  updated_at: new Date().toISOString(),
                  crawled_at: new Date().toISOString(),
                  ai_extraction_status: "not_product",
                  ai_classification_result: "공지사항",
                  ai_classification_reason: "가격 정보 없음",
                  ai_classification_at: new Date().toISOString(),
                  is_product: false,
                  status: "활성",
                  comment_sync_status: "completed",
                  products_data: null,
                  multiple_products: false,
                  keyword_mappings: null,
                  order_needs_ai: false,
                  order_needs_ai_reason: null
                };

                // 🧪 테스트 모드에서는 DB 저장 건너뛰기
                if (!testMode) {
                  const { error: postError } = await supabase
                    .from("posts")
                    .upsert(processedPostData, { onConflict: "post_id" });

                  if (postError) {
                    throw new Error(`게시물 저장 실패: ${postError.message}`);
                  }
                  console.log(`비상품 게시물 저장 완료: ${postKey}`);
                } else {
                  console.log(`🧪 테스트 모드: 게시물 ${postKey} 저장 건너뛰기`);
                }

                return null; // 다음 게시물로 진행
              }

              // AI 처리 (상품 게시물)
              if (mightBeProduct && processWithAI) {
                try {
                  const hasApiCreatedAt =
                    apiPost.createdAt !== undefined && apiPost.createdAt !== null;
                  const postTime = apiPost.createdAt
                    ? new Date(apiPost.createdAt).toISOString()
                    : new Date().toISOString();

                  // AI 요청 제한 적용
                  const extractedProducts = await limitedAIRequest(
                    extractProductInfoAI,
                    apiPost.content,
                    postTime,
                    postKey
                  );

                  if (
                    extractedProducts &&
                    Array.isArray(extractedProducts) &&
                    extractedProducts.length > 0
                  ) {
                    // ✅ 1단계: processProduct() 먼저 호출 (검증 전)
                    const processedProducts = extractedProducts.map((p) =>
                      processProduct({ ...p }, postTime, userSettings)
                    );

                    aiAnalysisResult = {
                      multipleProducts: processedProducts.length > 1,
                      products: processedProducts,
                      keywordMappings: {},
                      order_needs_ai: processedProducts[0]?.order_needs_ai || false,
                      order_needs_ai_reason:
                        processedProducts[0]?.order_needs_ai_reason || null
                    };

                    // keywordMappings 추출
                    if (processedProducts.length === 1 && processedProducts[0].keywordMappings) {
                      aiAnalysisResult.keywordMappings = processedProducts[0].keywordMappings;
                    } else if (processedProducts.length > 1) {
                      aiAnalysisResult.keywordMappings = {};
                      processedProducts.forEach((product, index) => {
                        if (product.keywords && Array.isArray(product.keywords)) {
                          product.keywords.forEach((keyword) => {
                            if (!/^\d+$/.test(keyword)) {
                              aiAnalysisResult.keywordMappings[keyword] = {
                                productIndex: index + 1
                              };
                            }
                          });
                        }
                      });
                    }
                  }

                  // ✅ 2단계: AI 분석 결과 검증 (processProduct 이후)
                  const hasValidProducts = !!(
                    aiAnalysisResult &&
                    aiAnalysisResult.products &&
                    aiAnalysisResult.products.length > 0 &&
                    aiAnalysisResult.products.some((p) => {
                      const hasValidTitle =
                        p.title &&
                        !p.title.includes("AI 분석 필요") &&
                        !p.title.includes("정보 없음") &&
                        !p.title.includes("주문 양식 확인 필요");

                      // ✅ basePrice 타입 변환 및 검증 개선
                      const basePriceNum = typeof p.basePrice === 'string'
                        ? parseFloat(p.basePrice)
                        : p.basePrice;

                      const hasValidPrice =
                        (basePriceNum !== undefined && basePriceNum !== null && basePriceNum >= 0) ||
                        (p.priceOptions && Array.isArray(p.priceOptions) && p.priceOptions.length > 0);

                      const isValid = hasValidTitle && hasValidPrice;

                      // ✅ 검증 실패 시 상세 로그
                      if (!isValid) {
                        console.warn(`[상품 검증 실패] ${postKey}:`, {
                          title: p.title,
                          hasValidTitle,
                          basePrice: p.basePrice,
                          basePriceNum,
                          priceOptions: p.priceOptions?.length || 0,
                          hasValidPrice
                        });
                      }

                      return isValid;
                    })
                  );

                  if (hasValidProducts) {
                    aiExtractionStatus = "success";
                    processCommentsAndOrders = true;
                    console.log(`✅ 게시물 ${postKey}: AI 상품 추출 성공 (${aiAnalysisResult.products.length}개)`);
                  } else {
                    console.error(`❌ 게시물 ${postKey}: AI로 상품 정보 추출 실패 (검증 미통과)`);
                    aiExtractionStatus = "failed";
                    // ✅ 이중 저장 제거: 실패 시에도 나중에 한 번만 저장
                  }
                } catch (aiError) {
                  console.error(`게시물 ${postKey}: AI 분석 중 오류 발생`, aiError);
                  aiExtractionStatus = "error";
                  // ✅ 이중 저장 제거: 에러 시에도 나중에 한 번만 저장
                }
              } else {
                aiExtractionStatus = mightBeProduct ? "not_attempted" : "not_product";
                aiAnalysisResult = getDefaultProduct(
                  mightBeProduct ? "AI 비활성화" : "상품 아님"
                );
              }

              // 게시물 및 상품 저장
              if (!testMode) {
                savedPostId = await savePostAndProducts(
                  supabase,
                  userId,
                  apiPost,
                  aiAnalysisResult,
                  bandKey,
                  aiExtractionStatus,
                  userSettings
                );
              } else {
                savedPostId = `test_${postKey}`;
                console.log(`🧪 테스트 모드: 게시물 ${postKey} 임시 ID 사용`);
              }

              if (!savedPostId) throw new Error("Post save failed");

              // 댓글이 없는 경우 처리 완료로 표시
              if ((apiPost.commentCount ?? 0) === 0) {
                successfullyProcessedNewComments = true;
              }

              // 댓글 처리 및 주문 생성
              if (
                processCommentsAndOrders &&
                (apiPost.commentCount ?? 0) > 0 &&
                aiExtractionStatus === "success"
              ) {
                let newComments = [];
                try {
                  const fetchResult = await fetchBandCommentsWithFailover(
                    bandApiFailover,
                    userId,
                    postKey,
                    bandKey,
                    supabase
                  );
                  comments = fetchResult.comments;

                  console.log('[대댓글 디버그 - processBandPosts] fetchResult 결과:', {
                    total_comments: comments?.length || 0,
                    has_underscore_keys: comments?.filter(c => c.commentKey?.includes('_')).length || 0,
                    sample_keys: comments?.slice(0, 5).map(c => c.commentKey)
                  });

                  if (comments && comments.length > 0) {
                    const maxTimestamp = Math.max(...comments.map((c) => c.createdAt));
                    latestCommentTimestampForUpdate = new Date(maxTimestamp).toISOString();
                    console.log(
                      `[신규 게시물 ${postKey}] 가장 최근 댓글 시간: ${latestCommentTimestampForUpdate}`
                    );
                  }

                  newComments = comments.map((c) => ({
                    ...c,
                    post_key: postKey,
                    band_key: bandKey,
                    commentKey: c.commentKey,
                    createdAt: c.createdAt,
                    author: c.author
                      ? {
                          name: c.author.name,
                          userNo: c.author.user_key,
                          profileImageUrl: c.author.profile_image_url
                        }
                      : null,
                    content: c.content
                  }));

                  console.log('[대댓글 디버그 - processBandPosts] map 후 newComments:', {
                    total: newComments.length,
                    has_underscore_keys: newComments.filter(c => c.commentKey?.includes('_')).length,
                    sample: newComments.slice(0, 3).map(c => ({
                      commentKey: c.commentKey,
                      content: c.content?.substring(0, 30)
                    }))
                  });
                } catch (commentError) {
                  console.error(
                    `Comment fetch error for new post ${postKey}: ${commentError.message}`
                  );
                }

                if (newComments.length > 0) {
                  // 통계를 위해 실제 처리할 댓글만 저장
                  comments = newComments;
                  try {
                    // 댓글 전용 모드: productMap 사용 안 함

                    const result = await generateOrderData(
                      supabase,
                      userId,
                      newComments,
                      postKey,
                      bandKey,
                      bandNumber,
                      null, // productMap (댓글 전용 모드에서는 사용 안 함)
                      {
                        ...apiPost,
                        order_needs_ai: aiAnalysisResult?.order_needs_ai || false,
                        order_needs_ai_reason: aiAnalysisResult?.order_needs_ai_reason || null
                      },
                      userSettings
                    );

                    if (!result.success) {
                      throw new Error(result.error || "Unknown error in generateOrderData");
                    }

                    const { orders, customers, cancellationUsers } = result;
                    successfullyProcessedNewComments = true;

                    if (!testMode) {
                      if (orders.length > 0 || customers.size > 0) {
                        const saveResult = await saveOrdersAndCustomersSafely(
                          supabase,
                          orders,
                          customers,
                          postKey,
                          savedPostId
                        );

                        if (saveResult.success) {
                          console.log(
                            `✅ 트랜잭션 성공: ${saveResult.savedOrders}개 주문, ${saveResult.savedCustomers}명 고객 저장`
                          );

                          if (cancellationUsers && cancellationUsers.size > 0) {
                            await processCancellationRequests(
                              supabase,
                              postKey,
                              cancellationUsers
                            );
                          }
                        } else {
                          console.error(`❌ 트랜잭션 실패: ${saveResult.error}`);
                        }
                      }
                    } else {
                      console.log(
                        `🧪 테스트 모드: ${orders.length}개 주문, ${Array.from(customers.values()).length}개 고객 저장 건너뛰기`
                      );
                    }
                  } catch (genError) {
                    console.error(
                      `Order generation error for new post ${postKey}: ${genError.message}`
                    );
                    successfullyProcessedNewComments = false;
                  }
                } else {
                  // 댓글이 없는 경우
                  comments = [];
                }
              }

              // 신규 게시물 업데이트 정보 생성
              if (savedPostId) {
                const updateInfo = {
                  post_id: savedPostId,
                  comment_count: finalCommentCountForUpdate
                };

                if (successfullyProcessedNewComments && latestCommentTimestampForUpdate) {
                  updateInfo.last_checked_comment_at = latestCommentTimestampForUpdate;
                }

                if (isNewPost && savedPostId) {
                  if (!successfullyProcessedNewComments && processCommentsAndOrders) {
                    updateInfo.comment_sync_status = "failed";
                    console.log(`[신규] comment_sync_status를 'failed'로 설정`);
                  } else {
                    updateInfo.comment_sync_status = "completed";
                    console.log(`[신규] comment_sync_status를 'completed'로 설정`);
                  }
                }

                postsToUpdateCommentInfo.push(updateInfo);
              }
            } else {
              // === 기존 게시물 처리 ===
              savedPostId = dbPostData?.post_id || `${userId}_post_${postKey}`;

              // 이미 처리된 일반 게시물은 스킵 (is_product: false면 failed 상태여도 재시도 안 함)
              if (dbPostData?.is_product === false) {
                return {
                  ...apiPost,
                  aiAnalysisResult: null,
                  dbPostId: savedPostId
                };
              }

              // AI 추출 실패한 게시물 재시도
              const needsAiRetry =
                dbPostData?.is_product === true &&
                (dbPostData?.ai_extraction_status === "failed" ||
                  dbPostData?.ai_extraction_status === "error");

              if (needsAiRetry && processWithAI) {
                console.log(
                  `재시도: 게시물 ${postKey}의 상품 정보 추출 (이전 상태: ${dbPostData.ai_extraction_status})`
                );

                try {
                  const postTime = dbPostData?.posted_at || new Date().toISOString();
                  const extractedProducts = await limitedAIRequest(
                    extractProductInfoAI,
                    apiPost.content,
                    postTime,
                    postKey
                  );

                  if (
                    extractedProducts &&
                    Array.isArray(extractedProducts) &&
                    extractedProducts.length > 0
                  ) {
                    // ✅ 재시도: processProduct() 먼저 호출
                    const processedProducts = extractedProducts.map((p) =>
                      processProduct({ ...p }, postTime, userSettings)
                    );

                    aiAnalysisResult = {
                      multipleProducts: processedProducts.length > 1,
                      products: processedProducts,
                      keywordMappings: {},
                      order_needs_ai: processedProducts[0]?.order_needs_ai || false,
                      order_needs_ai_reason: processedProducts[0]?.order_needs_ai_reason || null
                    };

                    if (processedProducts.length === 1 && processedProducts[0].keywordMappings) {
                      aiAnalysisResult.keywordMappings = processedProducts[0].keywordMappings;
                    } else if (processedProducts.length > 1) {
                      aiAnalysisResult.keywordMappings = {};
                      processedProducts.forEach((product, index) => {
                        if (product.keywords && Array.isArray(product.keywords)) {
                          product.keywords.forEach((keyword) => {
                            if (!/^\d+$/.test(keyword)) {
                              aiAnalysisResult.keywordMappings[keyword] = {
                                productIndex: index + 1
                              };
                            }
                          });
                        }
                      });
                    }
                  }

                  // ✅ 재시도: 검증 로직 개선
                  const hasValidProducts = !!(
                    aiAnalysisResult &&
                    aiAnalysisResult.products &&
                    aiAnalysisResult.products.length > 0 &&
                    aiAnalysisResult.products.some((p) => {
                      const hasValidTitle =
                        p.title &&
                        !p.title.includes("AI 분석 필요") &&
                        !p.title.includes("정보 없음") &&
                        !p.title.includes("주문 양식 확인 필요");

                      const basePriceNum = typeof p.basePrice === 'string'
                        ? parseFloat(p.basePrice)
                        : p.basePrice;

                      const hasValidPrice =
                        (basePriceNum !== undefined && basePriceNum !== null && basePriceNum >= 0) ||
                        (p.priceOptions && Array.isArray(p.priceOptions) && p.priceOptions.length > 0);

                      return hasValidTitle && hasValidPrice;
                    })
                  );

                  if (hasValidProducts) {
                    aiExtractionStatus = "success";

                    if (!testMode) {
                      savedPostId = await savePostAndProducts(
                        supabase,
                        userId,
                        apiPost,
                        aiAnalysisResult,
                        bandKey,
                        aiExtractionStatus,
                        userSettings
                      );
                    }

                    if (!savedPostId && !testMode) throw new Error("Post retry save failed");
                  } else {
                    console.log(`재시도 실패: 게시물 ${postKey}의 상품 정보 추출 (검증 미통과)`);
                    aiExtractionStatus = "failed";
                    // ✅ 재시도 실패 시에도 나중에 한 번만 저장
                  }
                } catch (retryError) {
                  console.error(`재시도 오류: 게시물 ${postKey}의 상품 정보 추출`, retryError);
                  aiExtractionStatus = "error";
                  // ✅ 재시도 에러 시에도 나중에 한 번만 저장
                }
              } else if (processWithAI && dbPostData?.is_product === true) {
                // 강제 추출 경로
                try {
                  let hasProductsInDb = false;
                  try {
                    const productMapProbe = await fetchProductMapForPost(supabase, userId, postKey);
                    hasProductsInDb = productMapProbe && productMapProbe.size > 0;
                  } catch (_) {
                    // probe 실패 시 강제 시도는 계속함
                  }

                  if (!hasProductsInDb) {
                    console.log(
                      `강제 추출: posts.is_product=true 이고 DB 상품 없음 → AI 추출 시도 (post ${postKey})`
                    );

                    const postTime = dbPostData?.posted_at || new Date().toISOString();
                    const extractedProducts = await limitedAIRequest(
                      extractProductInfoAI,
                      apiPost.content,
                      postTime,
                      postKey
                    );

                    if (
                      extractedProducts &&
                      Array.isArray(extractedProducts) &&
                      extractedProducts.length > 0
                    ) {
                      // ✅ 강제 추출: processProduct() 먼저 호출
                      const processedProducts = extractedProducts.map((p) =>
                        processProduct({ ...p }, postTime, userSettings)
                      );

                      aiAnalysisResult = {
                        multipleProducts: processedProducts.length > 1,
                        products: processedProducts,
                        keywordMappings: {},
                        order_needs_ai: processedProducts[0]?.order_needs_ai || false,
                        order_needs_ai_reason: processedProducts[0]?.order_needs_ai_reason || null
                      };

                      if (processedProducts.length === 1 && processedProducts[0].keywordMappings) {
                        aiAnalysisResult.keywordMappings = processedProducts[0].keywordMappings;
                      } else if (processedProducts.length > 1) {
                        processedProducts.forEach((product, index) => {
                          if (product.keywords && Array.isArray(product.keywords)) {
                            product.keywords.forEach((keyword) => {
                              if (!/^\d+$/.test(keyword)) {
                                aiAnalysisResult.keywordMappings[keyword] = {
                                  productIndex: index + 1
                                };
                              }
                            });
                          }
                        });
                      }
                    } else {
                      aiAnalysisResult = null;
                    }

                    // ✅ 강제 추출: 검증 로직 개선
                    const hasValidProducts = !!(
                      aiAnalysisResult &&
                      aiAnalysisResult.products &&
                      aiAnalysisResult.products.length > 0 &&
                      aiAnalysisResult.products.some((p) => {
                        const hasValidTitle =
                          p.title &&
                          !p.title.includes("AI 분석 필요") &&
                          !p.title.includes("정보 없음") &&
                          !p.title.includes("주문 양식 확인 필요");

                        const basePriceNum = typeof p.basePrice === 'string'
                          ? parseFloat(p.basePrice)
                          : p.basePrice;

                        const hasValidPrice =
                          (basePriceNum !== undefined && basePriceNum !== null && basePriceNum >= 0) ||
                          (p.priceOptions && Array.isArray(p.priceOptions) && p.priceOptions.length > 0);

                        return hasValidTitle && hasValidPrice;
                      })
                    );

                    if (hasValidProducts) {
                      aiExtractionStatus = "success";

                      if (!testMode) {
                        savedPostId = await savePostAndProducts(
                          supabase,
                          userId,
                          apiPost,
                          aiAnalysisResult,
                          bandKey,
                          aiExtractionStatus,
                          userSettings
                        );
                      }

                      if (!savedPostId && !testMode)
                        throw new Error("Post force-extract save failed");

                      if ((apiPost.commentCount ?? 0) > 0) {
                        forceProcessAllComments = true;
                      }
                    } else {
                      aiExtractionStatus = "failed";
                      console.log(`강제 추출 실패: 게시물 ${postKey}의 상품 정보 추출 결과 없음 (검증 미통과)`);
                      // ✅ 강제 추출 실패 시에도 나중에 한 번만 저장
                    }
                  }
                } catch (forceError) {
                  console.error(`강제 추출 오류: 게시물 ${postKey} 처리 중 오류`, forceError);
                  aiExtractionStatus = "error";
                  // ✅ 강제 추출 에러 시에도 나중에 한 번만 저장
                }
              }

              // 댓글 업데이트 체크
              const needsCommentUpdate =
                (apiPost.commentCount || 0) > (dbPostData?.comment_count || 0);
              const isPendingOrFailedPost =
                pendingPosts?.some((p) => p.post_key === postKey);

              // 댓글이 같고 pending도 아니면 completed로 처리
              if (
                !needsCommentUpdate &&
                (apiPost.commentCount || 0) === (dbPostData?.comment_count || 0) &&
                !testMode &&
                !isPendingOrFailedPost
              ) {
                const canMarkCompleted =
                  dbPostData?.ai_extraction_status === "success" ||
                  dbPostData?.ai_extraction_status === "not_product" ||
                  dbPostData?.is_product === false;
                const newSyncStatus = canMarkCompleted ? "completed" : "pending";

                // DB 값과 다른 경우에만 업데이트
                if (dbPostData?.comment_sync_status !== newSyncStatus) {
                  postsToUpdateCommentInfo.push({
                    post_id: dbPostData.post_id,
                    comment_count: apiPost.commentCount || 0,
                    comment_sync_status: newSyncStatus
                  });
                }
              } else if (
                needsCommentUpdate ||
                testMode ||
                isPendingOrFailedPost ||
                forceProcessAllComments ||
                isOrderNeedsAi
              ) {
                if (
                  dbPostData?.is_product === false &&
                  !forceProcessAllComments &&
                  !isOrderNeedsAi
                ) {
                  console.log(`게시물 ${postKey}: '상품 아님' 표시, 댓글 처리 스킵`);
                } else {
                  console.log(`게시물 ${postKey} 댓글 처리 시작`);

                  let shouldUpdateCommentInfo = false;
                  let newCount = apiPost.commentCount || 0;
                  let newChecked = null;

                  try {
                    // 댓글 가져오기
                    const fetchResult = await fetchBandCommentsWithFailover(
                      bandApiFailover,
                      userId,
                      postKey,
                      bandKey,
                      supabase
                    );
                    const fullComments = fetchResult.comments;
                    comments = fullComments;

                    // 마지막 체크 이후 댓글만 필터
                    const lastCheckedTs = dbPostData.last_checked_comment_at || 0;
                    const newComments = fullComments
                      .filter((c) => c.createdAt > lastCheckedTs)
                      .map((c) => ({
                        ...c,
                        post_key: postKey,
                        band_key: bandKey
                      }));

                    // 새 댓글이 있으면 주문/고객 생성 (댓글 전용 모드)
                    if (newComments.length > 0 || isPendingOrFailedPost) {
                      if (newComments.length === 0 && !isPendingOrFailedPost) {
                        console.log(`게시물 ${postKey}: 새 댓글 없음 및 pending/failed 아님`);
                        shouldUpdateCommentInfo = true;
                        newCount = apiPost.commentCount || 0;
                        newChecked = new Date().toISOString();
                      } else {
                        const processAll =
                          isPendingOrFailedPost || forceProcessAllComments || isOrderNeedsAi;
                        const commentsToProcess = processAll
                          ? fullComments.map((c) => ({
                              ...c,
                              post_key: postKey,
                              band_key: bandKey
                            }))
                          : newComments;

                        if (commentsToProcess.length === 0) {
                          console.log(`게시물 ${postKey}: 처리할 댓글 없음`);
                        } else {
                          console.log(
                            `게시물 ${postKey}: ${commentsToProcess.length}개 댓글 처리`
                          );

                          // DB에서 order_needs_ai 플래그 가져오기
                          const { data: postData } = await supabase
                            .from("posts")
                            .select("order_needs_ai, order_needs_ai_reason")
                            .eq("post_id", dbPostData.post_id)
                            .single();

                          const orderNeedsAi = postData?.order_needs_ai || false;
                          const orderNeedsAiReason = postData?.order_needs_ai_reason || null;

                          const result = await generateOrderData(
                            supabase,
                            userId,
                            commentsToProcess,
                            postKey,
                            bandKey,
                            bandNumber,
                            null, // productMap (댓글 전용 모드에서는 사용 안 함)
                            {
                              ...apiPost,
                              order_needs_ai: orderNeedsAi,
                              order_needs_ai_reason: orderNeedsAiReason
                            },
                            userSettings
                          );

                          if (!result.success) {
                            throw new Error(result.error || "Unknown error in generateOrderData");
                          }

                          const { orders, customers, cancellationUsers } = result;

                          if (!testMode) {
                            const saveResult = await saveOrdersAndCustomersSafely(
                              supabase,
                              orders,
                              customers,
                              postKey,
                              savedPostId
                            );

                            if (saveResult.success && cancellationUsers && cancellationUsers.size > 0) {
                              await processCancellationRequests(
                                supabase,
                                postKey,
                                cancellationUsers
                              );
                            }
                          } else {
                            console.log(
                              `🧪 테스트 모드: ${orders.length}개 주문, ${Array.from(customers.values()).length}개 고객 저장 건너뛰기`
                            );
                          }

                          console.log(`${commentsToProcess.length}개의 댓글 처리 완료`);
                          // 통계를 위해 실제 처리한 댓글만 저장
                          comments = commentsToProcess;
                        }
                      }
                    } else {
                      console.log(`게시물 ${postKey}: 마지막 체크 이후 신규 댓글 없음`);
                      comments = []; // 처리한 댓글 없음
                    }

                    shouldUpdateCommentInfo = true;
                    newCount = apiPost.commentCount || 0;
                    newChecked = new Date().toISOString();
                  } catch (err) {
                    console.error(`댓글 처리 오류 (post ${postKey}): ${err.message}`);
                    shouldUpdateCommentInfo = false;
                  }

                  // 실패/성공에 따라 업데이트 정보 추가
                  if (!shouldUpdateCommentInfo) {
                    postsToUpdateCommentInfo.push({
                      post_id: savedPostId,
                      comment_count: dbPostData?.comment_count || 0,
                      comment_sync_status: "failed"
                    });
                    console.log(`post_id=${savedPostId} 댓글 처리 실패`);
                  } else {
                    postsToUpdateCommentInfo.push({
                      post_id: savedPostId,
                      comment_count: newCount,
                      last_checked_comment_at: newChecked,
                      comment_sync_status: "completed"
                    });
                    console.log(`post_id=${savedPostId} 댓글 처리 성공`);
                  }
                }
              }
            }

            // 성공적으로 처리된 게시물 정보 반환
            const postUpdateInfo = postsToUpdateCommentInfo.find((p) => p.post_id === savedPostId);
            const commentSyncStatus = postUpdateInfo?.comment_sync_status || "completed";

            return {
              ...apiPost,
              aiAnalysisResult,
              dbPostId: savedPostId,
              aiExtractionStatus,
              comment_sync_status: commentSyncStatus,
              isNewPost,
              hasNewComments: successfullyProcessedNewComments || false,
              processedComments: comments || []
            };
          } catch (error) {
            console.error(`Error processing post ${postKey}: ${error.message}`, error.stack);

            return {
              postKey: apiPost.postKey,
              bandKey: apiPost.bandKey,
              title: apiPost.title,
              processingError: error.message,
              aiExtractionStatus: aiExtractionStatus || "error",
              comment_sync_status: "failed",
              isNewPost: false,
              hasNewComments: false,
              processedComments: []
            };
          }
        }); // End map

        // 현재 배치의 모든 게시물 처리 완료 대기
        const batchResults = await Promise.all(batchPromises);

        // 배치 처리 시간 로깅
        const batchEndTime = Date.now();
        const batchDuration = batchEndTime - batchStartTime;
        console.log(`✅ 배치 ${batchIndex + 1}/${postBatches.length} 완료 (${batchDuration}ms 소요)`);

        // 배치 결과를 전체 결과에 추가
        allProcessedResults.push(...batchResults);
      } // End for loop (배치 처리)

      // null (유효하지 않은 데이터) 및 성공/실패 결과 분리
      postsWithAnalysis = allProcessedResults.filter((result) => result !== null);
      console.log(`[4단계] ${postsWithAnalysis.length}개의 게시물을 처리했습니다.`);

      // 5. 댓글 정보 일괄 업데이트
      if (postsToUpdateCommentInfo.length > 0) {
        console.log(`[5단계] ${postsToUpdateCommentInfo.length}개의 게시물에 대한 댓글 정보를 일괄 업데이트하는 중...`);
        try {
          const updatePromises = postsToUpdateCommentInfo.map(async (updateInfo) => {
            const fieldsToUpdate = {
              comment_count: updateInfo.comment_count
            };

            if (updateInfo.last_checked_comment_at) {
              fieldsToUpdate.last_checked_comment_at = updateInfo.last_checked_comment_at;
            }

            if (updateInfo.comment_sync_status) {
              fieldsToUpdate.comment_sync_status = updateInfo.comment_sync_status;
            }

            console.log(`  - [업데이트 시도] Post ${updateInfo.post_id}:`, JSON.stringify(fieldsToUpdate, null, 2));

            const { error } = await supabase
              .from("posts")
              .update(fieldsToUpdate)
              .eq("post_id", updateInfo.post_id);

            if (error) {
              console.error(`❌ Post ${updateInfo.post_id} 댓글 정보 업데이트 오류:`, error);
            } else {
              console.log(`✅ Post ${updateInfo.post_id} 업데이트 성공:`, JSON.stringify(fieldsToUpdate, null, 2));
            }
          });

          await Promise.all(updatePromises);
          console.log(`댓글 정보 일괄 업데이트 완료`);
        } catch (updateError) {
          console.error(`[5단계] 댓글 정보 일괄 업데이트 중 예외 발생: ${updateError.message}`);
        }
      } else {
        console.log(`댓글 정보 업데이트가 필요한 게시물 없음`);
      }
    } else {
      console.log(`댓글 업데이트 대상 없음`);
    }

    // 🧪 테스트 모드에서는 사용자 last_crawl_at 업데이트 건너뛰기
    if (!testMode) {
      try {
        const currentTimestamp = new Date().toISOString();
        const { error: userUpdateError } = await supabase
          .from("users")
          .update({ last_crawl_at: currentTimestamp })
          .eq("user_id", userId);

        if (userUpdateError) {
          console.error(`[6단계] 사용자 last_crawl_at 업데이트 오류: ${userUpdateError.message}`);
        } else {
          console.log(`[6단계] 사용자 ${userId}의 last_crawl_at을 ${currentTimestamp}로 업데이트했습니다.`);
        }
      } catch (error) {
        console.error(`[6단계] 사용자 last_crawl_at 업데이트 중 예외 발생: ${error.message}`);
      }
    } else {
      console.log('테스트 모드: 사용자 last_crawl_at 업데이트 건너뛰기');
    }

    // 7. 최종 결과 반환 전 에러 상태 확인
    const failedPosts = postsWithAnalysis.filter((p) => p.comment_sync_status === "failed");
    const hasErrors = failedPosts.length > 0;

    console.log(
      `[7단계] 처리 완료. ${postsWithAnalysis.length}개의 게시물 결과를 반환합니다. ${hasErrors ? `(실패: ${failedPosts.length}개)` : ""}`
    );

    // 🚀 초경량 응답 - 핵심 정보만 전송
    // 상세 통계 계산
    const newPostsCount = postsWithAnalysis.filter(p => p.isNewPost).length;
    const existingPostsCount = postsWithAnalysis.length - newPostsCount;
    const productsExtractedCount = postsWithAnalysis.reduce((sum, p) =>
      sum + (p.aiAnalysisResult?.products?.length || 0), 0);
    const commentsProcessedCount = postsWithAnalysis.reduce((sum, p) =>
      sum + (p.processedComments?.length || 0), 0);

    const responseData = {
      success: !hasErrors,
      message: hasErrors ? `${failedPosts.length}개 오류` : testMode ? `테스트 완료` : `처리 완료`,
      stats: {
        total: postsWithAnalysis.length,
        success: postsWithAnalysis.filter((p) => !p.processingError).length,
        errors: failedPosts.length,
        newPosts: newPostsCount,
        existingPosts: existingPostsCount,
        productsExtracted: productsExtractedCount,
        commentsProcessed: commentsProcessedCount
      }
    };

    if (testMode) {
      responseData.test = true;
    }

    // 세션 종료 (성공)
    await bandApiFailover.endSession(true);

    // 🔓 실행 잠금 해제
    const { error: unlockError } = await supabase
      .from("execution_locks")
      .update({
        is_running: false,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("key", executionKey);

    if (unlockError) {
      console.error(`[실행 잠금 해제 실패] ${unlockError.message}`);
    }

    return responseData;
  } catch (error) {
    // 함수 전체의 최상위 오류 처리
    console.error("Unhandled error in processBandPosts:", error);

    // 🔓 에러 시에도 실행 잠금 해제
    if (executionKey) {
      const { error: unlockError } = await supabase
        .from("execution_locks")
        .update({
          is_running: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq("key", executionKey);

      if (unlockError) {
        console.error(`[실행 잠금 해제 실패] ${unlockError.message}`);
      }
    }

    // 세션 종료 (실패)
    try {
      if (bandApiFailover) {
        await bandApiFailover.endSession(false, error.message);
      }
    } catch (sessionError) {
      console.error("세션 종료 중 오류:", sessionError);
    }

    return {
      success: false,
      message: "밴드 게시물 처리 중 심각한 오류 발생",
      error: error.message
    };
  }
}
