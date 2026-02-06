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

// 댓글 수정 추적용 간단 해시 생성기
const hashCommentText = (text = "") => {
  const str = String(text);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
};

const convertBandTags = (text = "") =>
  text.replace(/<band:refer [^>]*>(.*?)<\/band:refer>/gi, (_m, p1) => `@${p1}`);

const normalizeLatestComments = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((c) => {
    const body = (c.body || c.content || "").trim();
    const ts = c.created_at || c.createdAt || "";
    const author = c.author?.name || "";
    return `${ts}|${author}|${body}`;
  });
};

const latestCommentsHash = (list) => {
  const norm = normalizeLatestComments(list);
  return norm.length > 0 ? hashCommentText(norm.join("||")) : null;
};

const safeParseJson = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const buildFormattedCommentForDiff = (comment) => {
  const baseContent = convertBandTags(comment?.content || "").trim();
  const isReply =
    comment?.isReply === true ||
    comment?.content_type === "post_comment_comment" ||
    Boolean(comment?.origin_comment_id) ||
    (comment?.commentKey?.includes("_") && (comment?.parentAuthorName || comment?.parentAuthorUserNo));

  if (!isReply) return baseContent;

  const replierName =
    comment?.author?.name ||
    comment?.authorName ||
    comment?.author_name ||
    "댓글작성자";

  // 작성자 이름이 이미 앞에 붙어 있으면 제거
  const escaped = replierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = baseContent.replace(new RegExp(`^@?${escaped}\\s*`), "").trim();
  const separator = body.length > 0 ? " " : "";
  return `[대댓글] ${replierName}:${separator}${body}`.trim();
};

// 기존 comment_change를 이어받아 새로운 버전을 생성
const buildCommentChangePayload = (previousComment, existingChange, nextComment) => {
  let parsed = null;
  try {
    parsed = typeof existingChange === "string" ? JSON.parse(existingChange) : existingChange;
  } catch (_) {
    parsed = null;
  }

  const history = Array.isArray(parsed?.history) ? [...parsed.history] : [];
  const existingVersion = parsed?.version || history.length || 0;
  const existingCurrent = parsed?.current ?? parsed?.latest ?? previousComment ?? "";

  // 최초 이력 보강: 기존 history가 없으면 현재 저장된 댓글을 version:1로 기록
  if (history.length === 0 && existingCurrent !== undefined) {
    history.push(`version:1 ${existingCurrent || ""}`);
  }

  // 새 버전 추가 (변경된 본문)
  const nextVersion = Math.max(existingVersion, history.length) + 1;
  history.push(`version:${nextVersion} ${nextComment || ""}`);

  const now = new Date().toISOString();
  return {
    hash: hashCommentText(nextComment || ""),
    status: "updated",
    history,
    version: nextVersion,
    deleted_at: null,
    updated_at: now,
    last_seen_at: now,
    current: nextComment || ""
  };
};

const buildDeletionChangePayload = (existingComment, existingChange) => {
  let parsed = null;
  try {
    parsed = typeof existingChange === "string" ? JSON.parse(existingChange) : existingChange;
  } catch (_) {
    parsed = null;
  }

  const history = Array.isArray(parsed?.history) ? [...parsed.history] : [];
  const existingVersion = parsed?.version || history.length || 0;
  const existingCurrent = parsed?.current ?? existingComment ?? "";

  if (history.length === 0 && existingCurrent !== undefined) {
    history.push(`version:1 ${existingCurrent || ""}`);
  }

  const nextVersion = Math.max(existingVersion, history.length) + 1;
  history.push(`version:${nextVersion} [deleted]`);

  const now = new Date().toISOString();
  return {
    hash: hashCommentText(existingCurrent || ""),
    status: "deleted",
    history,
    version: nextVersion,
    deleted_at: now,
    updated_at: now,
    last_seen_at: now,
    current: ""
  };
};

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
 *     - onFailover: 메인 키 할당량 초과 시 백업 키로 전환될 때 실행될 콜백 (선택)
 * 리턴값: {success, message, stats} 처리 결과 객체
 */
export async function processBandPosts(supabase, userId, options = {}) {
  const {
    testMode = false,
    processingLimit: requestedLimit = null,
    processWithAI = true,
    simulateQuotaError = false,
    onFailover = null
  } = options;

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
    if (typeof onFailover === "function") {
      bandApiFailover.setFailoverCallback(onFailover);
    }

    try {
      await bandApiFailover.loadApiKeys();
      await bandApiFailover.startSession();
    } catch (error) {
      throw new Error(`API 키 설정 오류: ${error.message}`);
    }

    // === 메인 로직 ===
    // 🔥 SMART PRIORITY SYSTEM START 🔥

    // 0-1. DB에서 pending 또는 failed 상태인 posts 먼저 조회 (최근 14일)
    console.log(`DB에서 pending/failed 상태 게시물 조회`);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingPosts, error: pendingError } = await supabase
      .from("posts")
      .select("post_key, band_key, title, content, comment_count, posted_at, band_post_url")
      .eq("user_id", userId)
      .in("comment_sync_status", ["pending", "failed"])
      .gte("posted_at", twoWeeksAgo)
      .order("comment_count", { ascending: false })
      .limit(100);

    if (pendingError) {
      console.error(`Pending posts 조회 실패: ${pendingError.message}`);
    } else {
      console.log(`[0-1단계] ${pendingPosts?.length || 0}개의 pending/failed 게시물 발견`);
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
    if (pendingPosts && pendingPosts.length > 0) {
      const existingKeys = new Set(posts.map((p) => p.postKey));
      for (const dbPost of pendingPosts) {
        if (existingKeys.has(dbPost.post_key)) continue;
        posts.push({
          postKey: dbPost.post_key,
          bandKey: dbPost.band_key || bandKey,
          title: dbPost.title,
          content: dbPost.content || "",
          commentCount: dbPost.comment_count,
          createdAt: dbPost.posted_at,
          author: { role: "admin" },
          url: dbPost.band_post_url || "",
          fromDB: true
        });
      }
      console.log(`[1-3단계] ${pendingPosts.length}개의 DB posts 추가됨. 총 ${posts.length}개 처리 예정`);
    }

    let postsWithAnalysis = [];
    let postsToUpdateCommentInfo = [];

    // 2. DB 기존 게시물 조회
    console.log(`DB에서 기존 게시물 정보 가져오기`);
    const dbPostsMap = new Map();
    let productPresenceSet = null;

    if (posts.length > 0) {
      try {
        const postKeys = posts.map((p) => p.postKey).filter(Boolean);
        if (postKeys.length > 0) {
          const { data: dbPosts, error: dbError } = await supabase
            .from("posts")
            .select(
              "post_id, post_key, comment_count, last_checked_comment_at, is_product, ai_extraction_status, order_needs_ai, comment_sync_status, latest_comments"
            )
            .eq("user_id", userId)
            .in("post_key", postKeys);

          if (dbError) throw dbError;

          dbPosts.forEach((dbPost) => {
            const latestParsed = safeParseJson(dbPost.latest_comments) || [];
            dbPostsMap.set(dbPost.post_key, {
              post_id: dbPost.post_id,
              comment_count: dbPost.comment_count,
              last_checked_comment_at: dbPost.last_checked_comment_at
                ? new Date(dbPost.last_checked_comment_at).getTime()
                : 0,
              ai_extraction_status: dbPost.ai_extraction_status,
              is_product: dbPost.is_product,
              order_needs_ai: dbPost.order_needs_ai === true,
              comment_sync_status: dbPost.comment_sync_status,
              latest_comments: latestParsed,
              latest_comments_hash: latestCommentsHash(latestParsed)
            });
          });
          console.log(`[2단계] ${dbPostsMap.size}개의 기존 게시물을 찾았습니다.`);
        } else {
          console.warn(`API에서 유효한 게시물 키가 없습니다.`);
        }
      } catch (error) {
        console.error(`[2단계] DB post fetch error: ${error.message}`);
      }

      // 상품 존재 여부를 사전 로드해 per-post 조회를 줄임
      try {
        const productProbeKeys = Array.from(dbPostsMap.entries())
          .filter(([, info]) => info?.is_product === true)
          .map(([postKey]) => postKey);

        if (productProbeKeys.length > 0) {
          const PRODUCT_PROBE_BATCH = 50; // in() 쿼리 길이 제한을 피하기 위한 배치 크기
          productPresenceSet = new Set();

          for (let i = 0; i < productProbeKeys.length; i += PRODUCT_PROBE_BATCH) {
            const batchKeys = productProbeKeys.slice(i, i + PRODUCT_PROBE_BATCH);
            const { data: productRows, error: productProbeError } = await supabase
              .from("products")
              .select("post_key")
              .eq("user_id", userId)
              .in("post_key", batchKeys);

            if (productProbeError) {
              console.error(`[products 사전조회 실패] ${productProbeError.message}`);
              productPresenceSet = null;
              break;
            }

            if (Array.isArray(productRows)) {
              productRows.forEach((row) => {
                if (row?.post_key) productPresenceSet.add(row.post_key);
              });
            }
          }

          if (productPresenceSet) {
            console.log(
              `[products 사전조회] ${productPresenceSet.size}/${productProbeKeys.length}개 게시물에 상품 존재`
            );
          }
        }
      } catch (probeError) {
        console.error(`[products 사전조회 예외] ${probeError.message}`);
        productPresenceSet = null;
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
          let syncErrorLog = null; // comment_sync_log용 에러 정보
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
                const shouldRetryOnNextUpdate =
                  !!mightBeProduct &&
                  (aiExtractionStatus === "failed" || aiExtractionStatus === "error");
                const saveOptions = shouldRetryOnNextUpdate
                  ? {
                      isProductCandidate: true,
                      classificationResult: "상품게시물",
                      classificationReason:
                        aiExtractionStatus === "error"
                          ? "AI 추출 오류 (재시도 대기)"
                          : "AI 추출 실패 (재시도 대기)"
                    }
                  : {};
                savedPostId = await savePostAndProducts(
                  supabase,
                  userId,
                  apiPost,
                  aiAnalysisResult,
                  bandKey,
                  aiExtractionStatus,
                  userSettings,
                  saveOptions
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
                    isReply: c.isReply === true,
                    parentAuthorName: c.parentAuthorName || c.parentAuthor || null,
                    parentAuthorUserNo: c.parentAuthorUserNo ||
                      c.parentAuthor?.user_no ||
                      c.parentAuthor?.userNo ||
                      null,
                    content_type: c.content_type || null,
                    origin_comment_id: c.origin_comment_id || null,
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
                  syncErrorLog = {
                    error: commentError.message,
                    stage: "comment_fetch",
                    failed_at: new Date().toISOString(),
                    post_key: postKey,
                    comment_count: apiPost.commentCount || 0
                  };
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
                          // 저장 실패 시 완료 처리하지 않도록 플래그 내림
                          successfullyProcessedNewComments = false;
                          console.error(`❌ 트랜잭션 실패: ${saveResult.error}`);
                          syncErrorLog = {
                            error: saveResult.error || "주문/고객 저장 실패",
                            stage: "order_save",
                            failed_at: new Date().toISOString(),
                            post_key: postKey,
                            comment_count: newComments?.length || 0,
                            orders_count: orders?.length || 0,
                            customers_count: customers?.size || 0
                          };
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
                    syncErrorLog = {
                      error: genError.message,
                      stage: "order_generate",
                      failed_at: new Date().toISOString(),
                      post_key: postKey,
                      comment_count: newComments?.length || 0
                    };
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
                    updateInfo.comment_sync_log = syncErrorLog || {
                      error: "알 수 없는 실패",
                      stage: "unknown",
                      failed_at: new Date().toISOString(),
                      post_key: postKey
                    };
                    console.log(`[신규] comment_sync_status를 'failed'로 설정`);
                  } else {
                    updateInfo.comment_sync_status = "completed";
                    updateInfo.comment_sync_log = null; // 성공 시 로그 초기화
                    console.log(`[신규] comment_sync_status를 'completed'로 설정`);
                  }
                }

                postsToUpdateCommentInfo.push(updateInfo);
              }
            } else {
              // === 기존 게시물 처리 ===
              savedPostId = dbPostData?.post_id || `${userId}_post_${postKey}`;

              // 기존 게시물이지만 가격 정보가 없으면 공지사항으로 확정 처리
              const mightBeProduct = contentHasPriceIndicator(apiPost.content);
              if (!mightBeProduct) {
                if (!testMode && (dbPostData?.is_product !== false || dbPostData?.ai_extraction_status !== "not_product")) {
                  const nowIso = new Date().toISOString();
                  const { error: nonProductUpdateError } = await supabase
                    .from("posts")
                    .update({
                      is_product: false,
                      ai_extraction_status: "not_product",
                      ai_classification_result: "공지사항",
                      ai_classification_reason: "가격 정보 없음",
                      ai_classification_at: nowIso,
                      products_data: null,
                      multiple_products: false,
                      keyword_mappings: null,
                      order_needs_ai: false,
                      order_needs_ai_reason: null,
                      comment_sync_status: "completed",
                      comment_sync_log: null,
                      updated_at: nowIso
                    })
                    .eq("post_id", savedPostId);

                  if (nonProductUpdateError) {
                    console.error(`공지사항 전환 업데이트 실패 (post ${postKey}):`, nonProductUpdateError);
                  } else {
                    console.log(`공지사항 전환 완료 (post ${postKey})`);
                  }
                }

                return {
                  ...apiPost,
                  aiAnalysisResult: null,
                  dbPostId: savedPostId,
                  aiExtractionStatus: "not_product",
                  comment_sync_status: "completed",
                  isNewPost: false,
                  hasNewComments: false,
                  processedComments: []
                };
              }

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
                  if (productPresenceSet) {
                    hasProductsInDb = productPresenceSet.has(postKey);
                  } else {
                    try {
                      const productMapProbe = await fetchProductMapForPost(supabase, userId, postKey);
                      hasProductsInDb = productMapProbe && productMapProbe.size > 0;
                    } catch (_) {
                      // probe 실패 시 강제 시도는 계속함
                    }
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
              const apiCount = apiPost.commentCount || 0;
              const dbCount = dbPostData?.comment_count || 0;
              const countDiffers = apiCount !== dbCount; // 감소도 감지
              const needsCommentUpdate = apiCount > dbCount || countDiffers;
              const isPendingOrFailedPost =
                pendingPosts?.some((p) => p.post_key === postKey);
              const apiLatestHash = latestCommentsHash(apiPost.latest_comments || []);
              const latestChanged =
                !!apiLatestHash &&
                !!dbPostData?.latest_comments_hash &&
                apiLatestHash !== dbPostData.latest_comments_hash;

              // 댓글이 같고 pending도 아니면 completed로 처리
              if (
                !needsCommentUpdate &&
                apiCount === dbCount &&
                !testMode &&
                !isPendingOrFailedPost &&
                !latestChanged
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
                    comment_sync_status: newSyncStatus,
                    latest_comments: apiPost.latest_comments || null
                  });
                }
              } else if (
                needsCommentUpdate ||
                testMode ||
                isPendingOrFailedPost ||
                forceProcessAllComments ||
                isOrderNeedsAi ||
                latestChanged
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
                    const normalizeTimestamp = (value) => {
                      if (!value) return 0;
                      if (typeof value === "number") return value;
                      const ts = new Date(value).getTime();
                      return Number.isFinite(ts) ? ts : 0;
                    };
                    const lastCheckedTs = normalizeTimestamp(dbPostData.last_checked_comment_at);

                    // 댓글 가져오기
                    const fetchResult = await fetchBandCommentsWithFailover(
                      bandApiFailover,
                      userId,
                      postKey,
                      bandKey,
                      supabase
                    );
                    const fullComments = (fetchResult.comments || []).map((c) => ({
                      ...c,
                      createdAt: normalizeTimestamp(c.createdAt),
                      _isDeletedFlag:
                        c.isDeleted === true ||
                        c.status === "deleted" ||
                        c.status === "삭제됨" ||
                        (typeof c.content === "string" && c.content.trim().length === 0)
                    }));
                    comments = fullComments;

                    // 이번에 가져온 댓글 + 기존 전체를 조회하여 수정/삭제 여부 판단
                    const commentKeys = fullComments.map((c) => c.commentKey).filter(Boolean);
                    let existingOrdersByKey = new Map();
                    let allOrdersByKey = new Map();

                    const { data: existingOrdersAll, error: existingOrdersError } = await supabase
                      .from("orders")
                      .select(
                        "order_id, comment_key, comment, comment_change, status, sub_status, confirmed_at, completed_at, canceled_at, paid_at, ordered_at, created_at, updated_at, customer_name, customer_id"
                      )
                      .eq("user_id", userId)
                      .eq("post_key", postKey);

                    if (existingOrdersError) {
                      console.warn("기존 댓글 조회 실패:", existingOrdersError.message);
                    } else if (Array.isArray(existingOrdersAll)) {
                      allOrdersByKey = new Map(existingOrdersAll.map((o) => [o.comment_key, o]));
                      if (commentKeys.length > 0) {
                        existingOrdersByKey = new Map(
                          existingOrdersAll
                            .filter((o) => commentKeys.includes(o.comment_key))
                            .map((o) => [o.comment_key, o])
                        );
                      }
                    }

                    const changedCommentKeys = new Set();
                    fullComments.forEach((c) => {
                      const existing = existingOrdersByKey.get(c.commentKey);
                      if (!existing) return;

                      // API가 삭제 플래그를 주는 경우 강제로 변경 대상에 포함
                      if (c._isDeletedFlag) {
                        changedCommentKeys.add(c.commentKey);
                        c._formattedForDiff = buildFormattedCommentForDiff(c);
                        return;
                      }

                      const formattedIncoming = buildFormattedCommentForDiff(c);
                      const existingComment = (existing.comment || "").trim();
                      const incomingHash = hashCommentText(formattedIncoming);

                      // 기존 hash와 동일하면 변경 없음
                      let existingHash = null;
                      try {
                        const parsed = typeof existing.comment_change === "string"
                          ? JSON.parse(existing.comment_change)
                          : existing.comment_change;
                        existingHash = parsed?.hash || null;
                      } catch (_) {
                        existingHash = null;
                      }

                      if (existingHash && existingHash === incomingHash) {
                        return;
                      }

                      // 본문 동일하면 변경 아님
                      if (existingComment === formattedIncoming) {
                        return;
                      }

                      changedCommentKeys.add(c.commentKey);
                      c._formattedForDiff = formattedIncoming;
                    });

                    // 삭제된 댓글 감지 (최근 댓글 범위 내에서, API 응답에 없으면 삭제로 간주)
                    const deletedEntries = [];
                    if (allOrdersByKey.size > 0) {
                      const fetchedSet = new Set(fullComments.map((c) => c.commentKey));
                      const recentCandidates = Array.from(allOrdersByKey.values()).sort((a, b) => {
                        const ta = new Date(a.ordered_at || a.created_at || a.updated_at || 0).getTime();
                        const tb = new Date(b.ordered_at || b.created_at || b.updated_at || 0).getTime();
                        return tb - ta;
                      });
                      const deletionCheckLimit = fullComments.length > 0 ? fullComments.length : 50; // 여유 버퍼

                      // 1) API 응답에서 사라진 키
                      recentCandidates.slice(0, deletionCheckLimit).forEach((orderRow) => {
                        const key = orderRow.comment_key;
                        if (!key) return;
                        if (!fetchedSet.has(key)) {
                          const deletionChange = buildDeletionChangePayload(
                            orderRow.comment,
                            orderRow.comment_change
                          );
                          deletedEntries.push({
                            commentKey: key,
                            content: orderRow.comment || "",
                            post_key: postKey,
                            band_key: bandKey,
                            comment_change: deletionChange,
                            existing_order_id: orderRow.order_id || null,
                            isDeletion: true,
                            existing_comment: orderRow.comment || null,
                            existing_status: orderRow.status || null,
                            existing_sub_status: orderRow.sub_status || null,
                            existing_confirmed_at: orderRow.confirmed_at || null,
                            existing_completed_at: orderRow.completed_at || null,
                            existing_canceled_at: orderRow.canceled_at || null,
                            existing_paid_at: orderRow.paid_at || null,
                            existing_ordered_at: orderRow.ordered_at || null,
                            existing_created_at: orderRow.created_at || null,
                            existing_commented_at: orderRow.commented_at || null,
                            existing_customer_name: orderRow.customer_name || null,
                            existing_comment_change: orderRow.comment_change || null
                          });
                        }
                      });

                      // 2) API 응답에 있지만 삭제 플래그/빈 본문인 경우 강제 삭제 처리
                      fullComments
                        .filter((c) => c._isDeletedFlag === true)
                        .forEach((c) => {
                          const existing = allOrdersByKey.get(c.commentKey);
                          if (!existing) return;
                          const deletionChange = buildDeletionChangePayload(
                            existing.comment,
                            existing.comment_change
                          );
                          deletedEntries.push({
                            commentKey: c.commentKey,
                            content: existing.comment || "",
                            post_key: postKey,
                            band_key: bandKey,
                            comment_change: deletionChange,
                            existing_order_id: existing.order_id || null,
                            isDeletion: true,
                            existing_comment: existing.comment || null,
                            existing_status: existing.status || null,
                            existing_sub_status: existing.sub_status || null,
                            existing_confirmed_at: existing.confirmed_at || null,
                            existing_completed_at: existing.completed_at || null,
                            existing_canceled_at: existing.canceled_at || null,
                            existing_paid_at: existing.paid_at || null,
                            existing_ordered_at: existing.ordered_at || null,
                            existing_created_at: existing.created_at || null,
                            existing_commented_at: existing.commented_at || null,
                            existing_customer_name: existing.customer_name || null,
                            existing_comment_change: existing.comment_change || null
                          });
                        });
                    }

                    // 마지막 체크 이후 댓글만 필터
                    const newComments = fullComments
                      .filter((c) => c.createdAt > lastCheckedTs || changedCommentKeys.has(c.commentKey))
                      .map((c) => {
                        const existing = existingOrdersByKey.get(c.commentKey);
                        const nextContentForDiff = c._formattedForDiff || buildFormattedCommentForDiff(c);
                        const comment_change = changedCommentKeys.has(c.commentKey)
                          ? buildCommentChangePayload(existing?.comment, existing?.comment_change, nextContentForDiff)
                          : null;
                        return {
                          ...c,
                          post_key: postKey,
                          band_key: bandKey,
                          comment_change,
                          existing_order_id: existing?.order_id || null,
                          existing_comment: existing?.comment || null,
                          existing_status: existing?.status || null,
                          existing_sub_status: existing?.sub_status || null,
                          existing_confirmed_at: existing?.confirmed_at || null,
                          existing_completed_at: existing?.completed_at || null,
                          existing_canceled_at: existing?.canceled_at || null,
                          existing_paid_at: existing?.paid_at || null,
                          existing_ordered_at: existing?.ordered_at || null,
                          existing_created_at: existing?.created_at || null,
                          existing_commented_at: existing?.commented_at || null,
                          existing_updated_at: existing?.updated_at || null,
                          existing_customer_name: existing?.customer_name || null,
                          existing_comment_change: existing?.comment_change || null
                        };
                      });

                    const commentsToProcess = [...newComments, ...deletedEntries];
                    const hasDeletedOnly = newComments.length === 0 && deletedEntries.length > 0;

                    // 새 댓글이 있으면 주문/고객 생성 (댓글 전용 모드)
                    if (newComments.length > 0 || hasDeletedOnly || isPendingOrFailedPost) {
                      {
                        const processAll =
                          isPendingOrFailedPost || forceProcessAllComments || isOrderNeedsAi;
                        const finalCommentsToProcess = (() => {
                          if (!processAll) return commentsToProcess; // 이미 newComments + deletedEntries 포함

                          // processAll 시에도 변경/삭제 정보를 보존하기 위해 extra 필드 맵 생성
                          const extrasByKey = new Map();
                          commentsToProcess.forEach((c) => {
                            if (c?.commentKey) extrasByKey.set(c.commentKey, c);
                          });

                          const mappedFull = fullComments.map((c) => {
                            const extra = extrasByKey.get(c.commentKey) || {};
                            const existingOrder = allOrdersByKey.get(c.commentKey) || {};
                            return {
                              ...c,
                              post_key: postKey,
                              band_key: bandKey,
                              isReply: c.isReply === true,
                              parentAuthorName: c.parentAuthorName || c.parentAuthor || null,
                              parentAuthorUserNo: c.parentAuthorUserNo ||
                                c.parentAuthor?.user_no ||
                                c.parentAuthor?.userNo ||
                                null,
                              content_type: c.content_type || null,
                              origin_comment_id: c.origin_comment_id || null,
                              comment_change: extra.comment_change ?? c.comment_change ?? existingOrder.comment_change ?? null,
                              existing_customer_name:
                                extra.existing_customer_name ??
                                c.existing_customer_name ??
                                existingOrder.customer_name ??
                                null,
                              existing_order_id: extra.existing_order_id ?? c.existing_order_id ?? existingOrder.order_id ?? null,
                              existing_comment: extra.existing_comment ?? c.existing_comment ?? existingOrder.comment ?? null,
                              existing_status: extra.existing_status ?? c.existing_status ?? existingOrder.status ?? null,
                              existing_sub_status: extra.existing_sub_status ?? c.existing_sub_status ?? existingOrder.sub_status ?? null,
                              existing_confirmed_at:
                                extra.existing_confirmed_at ??
                                c.existing_confirmed_at ??
                                existingOrder.confirmed_at ??
                                null,
                              existing_completed_at:
                                extra.existing_completed_at ??
                                c.existing_completed_at ??
                                existingOrder.completed_at ??
                                null,
                              existing_canceled_at:
                                extra.existing_canceled_at ??
                                c.existing_canceled_at ??
                                existingOrder.canceled_at ??
                                null,
                              existing_paid_at:
                                extra.existing_paid_at ??
                                c.existing_paid_at ??
                                existingOrder.paid_at ??
                                null,
                              existing_comment_change:
                                extra.existing_comment_change ??
                                c.existing_comment_change ??
                                existingOrder.comment_change ??
                                null,
                              existing_updated_at:
                                extra.existing_updated_at ??
                                c.existing_updated_at ??
                                existingOrder.updated_at ??
                                null,
                              existing_ordered_at:
                                extra.existing_ordered_at ??
                                c.existing_ordered_at ??
                                existingOrder.ordered_at ??
                                null,
                              existing_created_at:
                                extra.existing_created_at ??
                                c.existing_created_at ??
                                existingOrder.created_at ??
                                null,
                              existing_commented_at:
                                extra.existing_commented_at ??
                                c.existing_commented_at ??
                                existingOrder.commented_at ??
                                null
                            };
                          });

                          // 삭제 항목은 fullComments에 없을 수 있으므로 추가
                          const deletedOnly = deletedEntries.filter(
                            (d) => !fullComments.some((c) => c.commentKey === d.commentKey)
                          );

                          return [...mappedFull, ...deletedOnly];
                        })();

                          if (finalCommentsToProcess.length === 0) {
                            console.log(`게시물 ${postKey}: 처리할 댓글 없음`);
                            shouldUpdateCommentInfo = true;
                            newCount = apiPost.commentCount || 0;
                            newChecked = new Date().toISOString();
                          } else {
                          console.log(
                            `게시물 ${postKey}: ${finalCommentsToProcess.length}개 댓글 처리`
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
                          finalCommentsToProcess,
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
                          let ordersSaved = testMode; // 테스트 모드는 저장 스킵이므로 true 취급

                          if (!testMode) {
                            const saveResult = await saveOrdersAndCustomersSafely(
                              supabase,
                              orders,
                              customers,
                              postKey,
                              savedPostId
                            );

                            if (saveResult.success) {
                              ordersSaved = true;
                              if (cancellationUsers && cancellationUsers.size > 0) {
                                await processCancellationRequests(
                                  supabase,
                                  postKey,
                                  cancellationUsers
                                );
                              }
                            } else {
                              console.error(`❌ 트랜잭션 실패: ${saveResult.error}`);
                              syncErrorLog = {
                                error: saveResult.error || "주문/고객 저장 실패",
                                stage: "order_save",
                                failed_at: new Date().toISOString(),
                                post_key: postKey,
                                comment_count: finalCommentsToProcess?.length || commentsToProcess?.length || comments?.length || 0,
                                orders_count: orders?.length || 0,
                                customers_count: customers?.size || 0
                              };
                            }
                          } else {
                            console.log(
                              `🧪 테스트 모드: ${orders.length}개 주문, ${Array.from(customers.values()).length}개 고객 저장 건너뛰기`
                            );
                          }

                          if (!ordersSaved) {
                            // 주문 저장 실패 시 완료 처리하지 않고 실패로 마크
                            shouldUpdateCommentInfo = false;
                            console.log(`주문 저장 실패로 comment_sync_status 업데이트를 건너뜀 (post ${postKey})`);
                          } else {
                            console.log(`${commentsToProcess.length}개의 댓글 처리 완료`);
                            // 통계를 위해 실제 처리한 댓글만 저장
                        comments = commentsToProcess;
                            shouldUpdateCommentInfo = true;
                            newCount = apiPost.commentCount || 0;
                            newChecked = new Date().toISOString();
                          }
                        }
                      }
                    } else {
                      console.log(`게시물 ${postKey}: 마지막 체크 이후 신규 댓글 없음`);
                      comments = []; // 처리한 댓글 없음
                      shouldUpdateCommentInfo = true;
                      newCount = apiPost.commentCount || 0;
                      newChecked = new Date().toISOString();
                    }
                  } catch (err) {
                    console.error(`댓글 처리 오류 (post ${postKey}): ${err.message}`);
                    shouldUpdateCommentInfo = false;
                    syncErrorLog = {
                      error: err.message,
                      stage: "comment_process",
                      failed_at: new Date().toISOString(),
                      post_key: postKey,
                      comment_count: comments?.length || dbPostData?.comment_count || 0
                    };
                  }

                  // 실패/성공에 따라 업데이트 정보 추가
                  if (!shouldUpdateCommentInfo) {
                    postsToUpdateCommentInfo.push({
                      post_id: savedPostId,
                      comment_count: dbPostData?.comment_count || 0,
                      comment_sync_status: "failed",
                      comment_sync_log: syncErrorLog || {
                        error: "알 수 없는 실패",
                        stage: "unknown",
                        failed_at: new Date().toISOString(),
                        post_key: postKey
                      }
                    });
                    console.log(`post_id=${savedPostId} 댓글 처리 실패`);
                  } else {
                    postsToUpdateCommentInfo.push({
                            post_id: savedPostId,
                            comment_count: newCount,
                            last_checked_comment_at: newChecked,
                            comment_sync_status: "completed",
                            comment_sync_log: null, // 성공 시 로그 초기화
                            latest_comments: apiPost.latest_comments || null
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

            if (updateInfo.latest_comments !== undefined) {
              fieldsToUpdate.latest_comments = updateInfo.latest_comments;
            }

            // comment_sync_log 추가 (실패 로그 또는 성공 시 null)
            if (updateInfo.comment_sync_log !== undefined) {
              fieldsToUpdate.comment_sync_log = updateInfo.comment_sync_log;
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

    return responseData;
  } catch (error) {
    // 함수 전체의 최상위 오류 처리
    console.error("Unhandled error in processBandPosts:", error);

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
