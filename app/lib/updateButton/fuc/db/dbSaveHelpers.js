/**
 * DB 저장 헬퍼 함수들
 * backend/supabase/functions/band-get-posts-a/index.ts에서 이식
 */

import { enhancePickupDateFromContent } from '../utils/pickupDateEnhancer';
import { generateProductUniqueIdForItem } from '../utils/idUtils';
import { CLOSED_POST_STATUS } from '../commentDeadline/commentDeadline.js';

/**
 * 함수명: savePostAndProducts
 * 목적: 게시물과 상품 정보를 DB에 저장
 * 사용처: AI 분석 완료 후 결과 저장
 * 의존성: Supabase 클라이언트, enhancePickupDateFromContent, generateProductUniqueIdForItem
 * 파라미터:
 *   - supabase: Supabase 클라이언트 인스턴스
 *   - userId: 사용자 ID
 *   - post: 게시물 객체 (postKey, content, createdAt 등)
 *   - aiAnalysisResult: AI 분석 결과
 *   - bandKey: 밴드 키
 *   - aiExtractionStatus: AI 추출 상태 (기본값: "not_attempted")
 *   - userSettings: 사용자 설정 (선택사항)
 * 리턴값: 저장된 게시물 ID (성공 시) 또는 null (실패 시)
 */
export async function savePostAndProducts(
  supabase,
  userId,
  post,
  aiAnalysisResult,
  bandKey,
  aiExtractionStatus = "not_attempted",
  userSettings = null,
  options = {}
) {
  if (!userId || !post || !post.postKey) {
    console.error("savePostAndProducts에 잘못된 입력");
    return null;
  }

  // AI 분석 결과가 없으면 상품 없는 일반 게시물로 처리
  const isProductPost = !!(
    aiAnalysisResult &&
    Array.isArray(aiAnalysisResult.products) &&
    aiAnalysisResult.products.length > 0 &&
    aiAnalysisResult.products[0] &&
    (aiAnalysisResult.products[0].title || aiAnalysisResult.products[0].basePrice !== undefined)
  );
  const isProductCandidate = options?.isProductCandidate === true;
  const effectiveIsProduct = isProductPost || isProductCandidate;

  const postId = userId + "_post_" + post.postKey;

  // Band API의 타임스탬프를 그대로 사용 (이미 올바른 시간)
  const dateObject = new Date(post.createdAt);

  // Band API timestamp 직접 사용
  try {
    // AI 분류 결과 저장
    const classificationResult =
      options?.classificationResult ||
      (effectiveIsProduct ? "상품게시물" : "일반게시물");
    const classificationReason =
      options?.classificationReason ||
      aiAnalysisResult?.reason ||
      (effectiveIsProduct ? "AI가 상품 정보를 감지함" : "상품 정보 없음");

    // 🔥 [수정] keyword_mappings 추출 로직 개선
    let finalKeywordMappings = null;
    if (aiAnalysisResult) {
      let sourceMappings = null;
      if (aiAnalysisResult.keywordMappings) {
        sourceMappings = aiAnalysisResult.keywordMappings;
      } else if (
        !aiAnalysisResult.multipleProducts &&
        aiAnalysisResult.products &&
        aiAnalysisResult.products[0]?.keywordMappings
      ) {
        sourceMappings = aiAnalysisResult.products[0].keywordMappings;
      }

      // 순환 참조를 막기 위해 깊은 복사(deep copy) 수행
      if (sourceMappings) {
        finalKeywordMappings = JSON.parse(JSON.stringify(sourceMappings));
      }
    }

    // 🔥 [추가] keywordMappings를 productIndex 기준으로 정렬
    if (finalKeywordMappings) {
      const sortedEntries = Object.entries(finalKeywordMappings).sort(
        ([, aValue], [, bValue]) => {
          return (aValue.productIndex || 0) - (bValue.productIndex || 0);
        }
      );
      finalKeywordMappings = Object.fromEntries(sortedEntries);
    }

    // 이미지 URL들 추출 (route.js와 동일한 방식)
    const imageUrls = post.photos ? post.photos.map((photo) => photo.url) : [];

    // 1. posts 테이블에 게시물 정보 Upsert
    // JSON 데이터 사전 검증 - 모든 게시물에 대해 pickup_date 후처리 수행
    let productsDataJson = null;
    try {
      // 🔧 [수정] AI 결과 유무와 관계없이 항상 pickup_date 후처리 수행
      // Band API 타임스탬프를 원본 그대로 전달하여 한 번만 KST 변환하도록 유지
      const enhancedResult = enhancePickupDateFromContent(aiAnalysisResult, post.content, post);

      // 후처리 결과를 저장 (JSONB 컬럼이므로 객체 그대로 저장 가능)
      productsDataJson = enhancedResult;

      // 검증을 위해 JSON 문자열로 변환 테스트만 수행
      const testJson = JSON.stringify(enhancedResult);
      if (testJson && testJson !== "null") {
        JSON.parse(testJson); // 파싱 테스트
        // console.log(
        //   `[JSON 검증] products_data 검증 성공 (길이: ${testJson.length})`
        // );
      }
    } catch (jsonError) {
      console.error(`[JSON 검증] products_data 생성 실패:`, jsonError.message);
      productsDataJson = aiAnalysisResult || {
        error: "Pickup date processing failed",
        message: jsonError.message,
        timestamp: new Date().toISOString()
      };
    }

    // 후처리된 결과에서 첫 번째 상품의 title 사용 (날짜 정보 포함)
    let postTitle = "무제";
    if (productsDataJson?.products?.[0]?.title) {
      postTitle = productsDataJson.products[0].title;
    } else if (isProductPost && aiAnalysisResult?.products[0]?.title) {
      postTitle = aiAnalysisResult.products[0].title;
    } else {
      postTitle = post.content?.substring(0, 50) || "무제";
    }

    const shouldPreserveClosedPost = options?.existingStatus === CLOSED_POST_STATUS;
    const postDataToUpsert = {
      post_id: postId,
      user_id: userId,
      band_key: bandKey,
      content: post.content || "",
      title: postTitle,
      author_name: post.author?.name || "",
      author_id: post.author?.user_id || "",
      author_description: post.author?.description || "",
      author_profile: post.author?.profile_image_url || "",
      author_user_key: post.author?.user_key || "",
      comment_count: post.commentCount || 0,
      emotion_count: post.emotion_count || 0,
      status: shouldPreserveClosedPost ? CLOSED_POST_STATUS : "활성",
      posted_at: dateObject.toISOString(),
      // 🔥 [수정] AI가 "일반게시물"로 분류하면 is_product를 false로 설정
      // aiExtractionStatus === "failed"이어도 AI 분류를 신뢰
      is_product: effectiveIsProduct && classificationResult !== "일반게시물",
      updated_at: new Date().toISOString(),
      post_key: post.postKey,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      photos_data: post.photos || null,
      latest_comments:
        post.latest_comments && Array.isArray(post.latest_comments) && post.latest_comments.length > 0
          ? post.latest_comments
          : null,
      ai_extraction_status: aiExtractionStatus,
      products_data: productsDataJson,
      multiple_products: aiAnalysisResult?.multipleProducts || false,
      keyword_mappings: finalKeywordMappings,
      ai_classification_result: classificationResult,
      ai_classification_reason: classificationReason,
      ai_classification_at: new Date().toISOString(),
      // 🔥 [최적화] AI 추출 상태에 따라 comment_sync_status 자동 설정
      // AI 추출이 실패한 경우 댓글 처리도 불가능
      comment_sync_status:
        aiExtractionStatus === "error"
          ? "failed"
          : aiExtractionStatus === "failed"
          ? "failed"
          : !post.commentCount || post.commentCount === 0
          ? "completed"
          : "pending",
      order_needs_ai: false,
      order_needs_ai_reason: null
    };

    if (shouldPreserveClosedPost) {
      postDataToUpsert.closed_at = options?.closedAt || null;
      postDataToUpsert.closed_comment_key = options?.closedCommentKey || null;
    }

    // 🔥 [디버깅 로그] DB에 저장하기 직전의 'posts' 테이블 데이터를 확인합니다.
    console.log(`게시물 저장`, {
      postKey: post.postKey,
      isProduct: isProductPost,
      commentCount: post.commentCount,
      orderNeedsAi: postDataToUpsert.order_needs_ai
    });

    const { data: upsertedPostData, error: postUpsertError } = await supabase
      .from("posts")
      .upsert(postDataToUpsert, {
        onConflict: "post_id",
        ignoreDuplicates: false
      })
      .select("post_id")
      .single();

    if (postUpsertError) {
      console.error(`Post ${post.postKey} Supabase 저장 오류:`, {
        error: postUpsertError,
        message: postUpsertError.message,
        code: postUpsertError.code,
        details: postUpsertError.details,
        hint: postUpsertError.hint,
        dataAttempted: {
          postId: postDataToUpsert.post_id,
          title: postDataToUpsert.title,
          content_length: postDataToUpsert.content?.length || 0,
          products_data_length: postDataToUpsert.products_data?.length || 0
        }
      });
      throw new Error("Post save failed");
    }

    if (!upsertedPostData || !upsertedPostData.post_id) {
      console.error(`Failed to get post ID after upsert for ${post.postKey}`);
      return null;
    }

    console.log(`게시물 업서트 완료`, {
      postKey: post.postKey,
      postId: upsertedPostData.post_id,
      aiStatus: aiExtractionStatus
    });

    // 2. products 테이블에 상품 정보 Upsert (후처리된 결과 우선 사용)
    const productsToSave = productsDataJson?.products || aiAnalysisResult?.products;

    if (upsertedPostData.post_id && isProductPost && productsToSave) {
      for (let index = 0; index < productsToSave.length; index++) {
        const product = productsToSave[index];
        try {
          // Generate productId if not exists
          if (!product.productId) {
            product.productId = generateProductUniqueIdForItem(
              userId,
              bandKey,
              post.postKey,
              product.itemNumber || index + 1
            );
          }

          const productId = product.productId;

          // --- tags, features 값을 text[] 형식으로 변환 ---
          let tagsForDb;
          if (Array.isArray(product.tags)) {
            // 이미 배열이면, 각 요소가 문자열인지 확인하고 문자열 배열로 만듦
            tagsForDb = product.tags.map((tag) => String(tag));
          } else if (typeof product.tags === "string" && product.tags.trim() !== "") {
            // 쉼표 등으로 구분된 문자열이면 배열로 분리 (구분자 확인 필요)
            tagsForDb = product.tags
              .split(/[,，\s]+/)
              .map((tag) => tag.trim())
              .filter(Boolean);
          } else {
            // 그 외의 경우 빈 배열
            tagsForDb = [];
          }

          let featuresForDb; // features도 동일하게 처리
          if (Array.isArray(product.features)) {
            featuresForDb = product.features.map((f) => String(f));
          } else if (typeof product.features === "string" && product.features.trim() !== "") {
            featuresForDb = product.features
              .split(/[,，\s]+/)
              .map((f) => f.trim())
              .filter(Boolean);
          } else {
            featuresForDb = [];
          }
          // --------------------------------------------

          const productDataToUpsert = {
            product_id: productId,
            post_id: upsertedPostData.post_id,
            user_id: userId,
            band_key: bandKey,
            post_key: post.postKey,
            item_number: product.itemNumber || 1,
            title: product.title || "",
            content: post.content || "",
            base_price: product.basePrice || 0,
            price_options: product.priceOptions || [],
            quantity: product.quantity || 1,
            quantity_text: product.quantityText || "1개",
            category: product.category || "기타",
            tags: tagsForDb,
            features: featuresForDb,
            status: product.status || "판매중",
            pickup_info: product.pickupInfo || "",
            pickup_date: product.pickupDate || null,
            pickup_type: product.pickupType || "",
            stock_quantity: product.stockQuantity || null,
            barcode: "",
            updated_at: new Date().toISOString(),
            posted_at: dateObject.toISOString(),
            products_data: (() => {
              // DB 저장 직전 postTime 요일 정보 보장
              if (product.postTime && !product.postTime.includes('요일')) {
                const postDate = new Date(product.postTime);
                const dayNames = [
                  '일요일',
                  '월요일',
                  '화요일',
                  '수요일',
                  '목요일',
                  '금요일',
                  '토요일'
                ];
                const dayOfWeek = dayNames[postDate.getUTCDay()];
                console.log(
                  `[DB 저장 전 수정] postTime 요일 정보 추가: ${product.postTime} → ${product.postTime} (${dayOfWeek})`
                );
                return {
                  ...product,
                  postTime: `${product.postTime} (${dayOfWeek})`
                };
              }
              return product;
            })()
          };

          // console.log(
          //   `Upserting product (productId=${productDataToUpsert.product_id}): `,
          //   JSON.stringify(productDataToUpsert)
          // );

          const { error } = await supabase.from("products").upsert(productDataToUpsert, {
            onConflict: "product_id",
            ignoreDuplicates: false
          });

          if (error) {
            console.error(`Product ${productId} (Post ${post.postKey}) Supabase 저장 오류:`, error);
            continue;
          }

          // console.log(
          //   `Product ${productId} (Post ${post.postKey}) upserted in Supabase.`
          // );
        } catch (dbError) {
          console.error(
            `Product (Post ${post.postKey}, Item ${product.itemNumber}) Supabase 저장 오류:`,
            dbError
          );
          // 개별 상품 저장 실패는 로깅만 하고 계속 진행
        }
      }
    }

    return upsertedPostData.post_id; // 성공 시 게시물 ID 반환
  } catch (error) {
    console.error(`savePostAndProducts 함수 오류 (Post ${post.postKey}):`, error);
    return null;
  }
}
