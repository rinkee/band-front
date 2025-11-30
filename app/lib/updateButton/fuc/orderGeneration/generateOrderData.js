/**
 * 주문 데이터 생성 함수 (댓글 전용 버전)
 * 댓글 정보를 단순히 orders 테이블에 저장
 *
 * @description
 * Orders 테이블을 "댓글 전용" 테이블로 변경
 * - 상품 매칭 로직 제거
 * - AI/패턴 분석 로직 제거
 * - 댓글 데이터만 저장
 * - 상품 연결은 products 테이블의 band_key + post_key로 조회
 *
 * 주요 기능:
 * 1. 댓글 배열을 order 객체로 변환
 * 2. 고객 정보 추출 및 customer 생성
 * 3. DB 저장 가능한 형식으로 반환
 */

import { generateOrderUniqueId, generateCustomerUniqueId } from '../../../band-processor/shared/utils/idUtils.js';
import { safeParseDate } from '../../../band-processor/shared/utils/dateUtils.js';
import { filterCancellationComments } from '../cancellation/cancellationFilter.js';

/**
 * 댓글에서 주문 데이터를 생성하는 메인 함수
 *
 * @param {Object} supabase - Supabase 클라이언트 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {Array} comments - 댓글 배열
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - Band 키
 * @param {string} bandNumber - Band 번호
 * @param {Map} productMap - 상품 정보 Map (사용하지 않음, 호환성 유지)
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
  productMap = null,
  post = null,
  userSettings = null
) {
  const orders = [];
  const customers = new Map();
  // 취소 요청으로 자동 취소를 트리거하지 않도록 빈 Set 유지
  let cancellationUsers = new Set();

  const processingSummary = {
    totalCommentsProcessed: comments.length,
    generatedOrders: 0,
    generatedCustomers: 0,
    skippedCancellation: 0,
    errors: []
  };

  // 댓글이 없으면 빈 결과 반환
  if (!comments || comments.length === 0) {
    console.info('댓글 없음, 주문 생성 스킵', { postKey });
    return { orders, customers, cancellationUsers, success: true };
  }

  // 날짜가 실제로 주어졌을 때만 파싱하고, 없거나 잘못된 값이면 null 유지
  const parseIfPresent = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = safeParseDate(value);
    return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
  };

  console.log('[대댓글 디버그 - generateOrderData] 입력 댓글:', {
    total: comments.length,
    has_underscore_keys: comments.filter(c => c.commentKey?.includes('_')).length,
    sample: comments.slice(0, 3).map(c => ({
      commentKey: c.commentKey,
      content: c.content?.substring(0, 40)
    }))
  });

  console.info('댓글 처리 시작 (댓글 전용 모드)', {
    postKey,
    commentCount: comments.length
  });

  try {
    // 1. 취소 댓글 필터링
    const { filteredComments } = filterCancellationComments(comments);

    processingSummary.skippedCancellation = comments.length - filteredComments.length;

    console.log('[대댓글 디버그 - generateOrderData] 필터링 후:', {
      total: filteredComments.length,
      has_underscore_keys: filteredComments.filter(c => c.commentKey?.includes('_')).length,
      sample: filteredComments.slice(0, 3).map(c => ({
        commentKey: c.commentKey,
        content: c.content?.substring(0, 40)
      }))
    });

    console.info('취소 댓글 필터링 완료', {
      total: comments.length,
      valid: filteredComments.length,
      cancellation: comments.length - filteredComments.length
    });

    // 2. 각 댓글을 order로 변환
    for (const comment of filteredComments) {
      try {
        const {
          commentKey,
          content,
          author,
          authorName,
          authorUserNo,
          authorProfile,
          createdAt,
          isCancellation,
          parentAuthorName,
          parentAuthorUserNo,
          content_type,
          origin_comment_id,
          existing_comment,
          isDeletion,
          existing_order_id,
          existing_comment_change
        } = comment;

        const isReply =
          comment.isReply === true ||
          content_type === "post_comment_comment" ||
          Boolean(origin_comment_id) ||
          (commentKey?.includes("_") && (parentAuthorName || parentAuthorUserNo));
        const replierName = authorName || author?.name || "댓글작성자";

        // band:refer 태그를 @닉네임으로 변환
        const convertBandTags = (text = "") =>
          text.replace(/<band:refer [^>]*>(.*?)<\/band:refer>/gi, (_m, p1) => `@${p1}`);

        const sanitizedContent = convertBandTags(content || "");
        const parentName =
          comment.parentAuthorName ||
          comment.parentAuthor ||
          (comment.content && /<band:refer [^>]*>(.*?)<\/band:refer>/i.exec(comment.content)?.[1]) ||
          null;

        let bodyWithMention = sanitizedContent;
        const parentMention = parentName ? `@${parentName}` : "";
        if (parentMention && !sanitizedContent.includes(parentMention)) {
          bodyWithMention = `${parentMention} ${sanitizedContent}`.trim();
        }

        // replier/parent 중복 방지용 유틸
        const escapeRegExp = (str = "") =>
          str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const startsWithReplier = (text = "") => {
          const trimmed = text.trim();
          return (
            trimmed.startsWith(replierName) ||
            trimmed.startsWith(`@${replierName}`)
          );
        };

        let commentContent;
        if (isReply) {
          const isSelfReply = parentName && parentName === replierName;
          const contentBody = isSelfReply ? sanitizedContent : bodyWithMention;

          // 본문이 이미 작성자 이름/@이름으로 시작하면 한 번 더 붙이지 않음
          const dedupedBodyRaw = startsWithReplier(contentBody)
            ? contentBody
                .trim()
                .replace(new RegExp(`^@?${escapeRegExp(replierName)}\\s*`), "")
            : contentBody.trim();

          let dedupedBody = dedupedBodyRaw.trim();

          // 부모 이름이 앞에 한번 더 붙은 패턴 제거 (ex. "nh @nh ..." → "@nh ...")
          if (parentName) {
            const parentNameEsc = escapeRegExp(parentName);
            dedupedBody = dedupedBody.replace(
              new RegExp(`^${parentNameEsc}\\s*(?=@${parentNameEsc}\\b)`),
              ""
            ).trim();
          }

          const separator = dedupedBody.length > 0 ? " " : "";
          commentContent = `[대댓글] ${replierName}:${separator}${dedupedBody}`.trim();
        } else {
          commentContent = sanitizedContent;
        }

        // 내용이 비어있을 때만 기존 본문으로 대체 (새 내용이 있으면 그대로 사용)
        if ((!commentContent || commentContent.trim().length === 0) && existing_comment !== undefined && existing_comment !== null) {
          commentContent = existing_comment;
        }

        // 필수 필드 검증
        if (!commentKey || (!content && !existing_comment)) {
          console.warn('필수 필드 누락', { commentKey, hasContent: !!content, hasExisting: !!existing_comment });
          continue;
        }

        // 기존 comment_change 파싱 (삭제 여부 확인)
        let parsedExistingChange = null;
        try {
          parsedExistingChange = typeof existing_comment_change === "string"
            ? JSON.parse(existing_comment_change)
            : existing_comment_change;
        } catch (_) {
          parsedExistingChange = null;
        }

        // 기존 고객명 (삭제 감지 시 유지)
        const existingCustomerName = comment.existing_customer_name || null;

        // 주문 ID 생성 (item_number는 항상 1)
        let orderId = existing_order_id || generateOrderUniqueId(
          userId,
          bandKey,
          postKey,
          commentKey,
          1, // item_number (댓글 전용이므로 항상 1)
          0  // variant_index (사용 안 함)
        );

        // 날짜 파싱 (기존 ordered_at이 있으면 최우선 유지)
        const existingOrderedAt =
          parseIfPresent(comment.existing_ordered_at) ||
          parseIfPresent(comment.existing_created_at) ||
          parseIfPresent(comment.existing_commented_at) ||
          null;
        const orderedAt =
          existingOrderedAt ||
          parseIfPresent(createdAt);
        const existingCommentedAt =
          parseIfPresent(comment.existing_commented_at) ||
          parseIfPresent(comment.existing_created_at) ||
          parseIfPresent(comment.existing_ordered_at) ||
          null;
        const commentedAt =
          existingCommentedAt ||
          orderedAt ||
          parseIfPresent(createdAt);
        let commentChange = comment.comment_change || null;
        let isDeletionFlag = isDeletion === true || commentChange?.status === "deleted";

        // 고객 ID/이름 결정 (삭제 시 기존 이름 우선)
        const customerId = generateCustomerUniqueId(userId, authorUserNo || author?.user_no);
        const nameCandidate = isReply
          ? parentName || authorName || author?.name
          : authorName || author?.name;
        const resolvedCustomerName =
          existingCustomerName && (isDeletionFlag || !nameCandidate)
            ? existingCustomerName
            : nameCandidate || existingCustomerName || '이름 없음';

        // 삭제 감지인데 comment_change 정보가 없으면 즉석에서 삭제 payload 생성
        if (isDeletionFlag && (!commentChange || commentChange.status !== "deleted")) {
          commentChange = buildDeletionChangePayload(existing_comment || content || "", existing_comment_change);
          isDeletionFlag = true;
        }

        // 삭제 감지지만 기존 주문이 없으면 스킵 (DB에 새로 만들지 않음)
        if (isDeletionFlag && !existing_order_id) {
          continue;
        }

        // 삭제 시 DB comment를 덮어쓰지 않고 기존 본문 유지
        if (isDeletionFlag) {
          commentContent = existing_comment || commentContent || "";
        }

        // 고객 정보 추가
        if (!customers.has(customerId)) {
          customers.set(customerId, {
            customer_id: customerId,
            user_id: userId,
            band_key: bandKey,
            band_id: authorUserNo || author?.user_no,
            name: resolvedCustomerName,
            profile_image_url: authorProfile || author?.profile_image_url || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          processingSummary.generatedCustomers++;
        }

        // 이전에 삭제 처리된 댓글이 새로 달린 경우: 동일 comment_key라도 새로운 order_id 부여
        const wasDeletedBefore =
          comment.existing_status === "삭제됨" ||
          parsedExistingChange?.status === "deleted";
        if (!isDeletionFlag && existing_order_id && wasDeletedBefore) {
          const version = commentChange?.version || parsedExistingChange?.version || Date.now();
          orderId = `${generateOrderUniqueId(
            userId,
            bandKey,
            postKey,
            commentKey,
            1,
            0
          )}_rev${version}`;
        }

        const isAlreadyDeleted = parsedExistingChange?.status === "deleted";
        const isStillDeleted = isDeletionFlag && (commentChange?.status === "deleted" || !commentChange);

        // 업데이트 타임스탬프: 실제 변경시에만 now로 갱신 (기존 삭제 재처리 시에는 유지)
        const existingUpdatedAt =
          comment.existing_updated_at ||
          comment.existing_updatedAt ||
          parsedExistingChange?.updated_at ||
          parsedExistingChange?.last_seen_at ||
          parsedExistingChange?.deleted_at ||
          comment.existing_commented_at ||
          comment.existing_created_at ||
          comment.existing_ordered_at ||
          null;
        const hasMeaningfulChange =
          !existing_order_id || // 신규 댓글
          (!isAlreadyDeleted && isDeletionFlag) || // 처음 삭제로 전환
          (!isStillDeleted && isDeletionFlag) || // 삭제 상태가 바뀜
          (!!commentChange && commentChange.status !== "deleted") || // 내용 변경 기록
          (existing_comment !== undefined && commentContent !== existing_comment); // 본문 차이

        // 이미 삭제된 댓글이고 추가 변화가 없으면 DB 업서트를 건너뛰어 타임스탬프 변조 방지
        if (isAlreadyDeleted && isStillDeleted && !hasMeaningfulChange) {
          continue;
        }

        const resolvedUpdatedAt = hasMeaningfulChange
          ? new Date().toISOString()
          : existingUpdatedAt || new Date().toISOString();

        // 주문 객체 생성 (댓글 정보만)
        const orderData = {
          // 식별자
          order_id: orderId,
          user_id: userId,

          // Band 연결 정보
          band_key: bandKey,
          post_key: postKey,
          comment_key: commentKey,
          band_number: bandNumber || null,
          post_number: null,

          // 고객 정보
          customer_id: customerId,
          customer_name: resolvedCustomerName,
          customer_band_id: isReply
            ? (parentAuthorUserNo ||
              comment.parentAuthorUserNo ||
              comment.authorUserNo ||
              comment.author_user_no ||
              null)
            : authorUserNo || author?.user_no || null,
          customer_profile: authorProfile || author?.profile_image_url || null,

          // 댓글 내용
          comment: commentContent,
          band_comment_id: commentKey,
          band_comment_url: null,
          comment_change: commentChange,

          // 상품 정보 (모두 NULL)
          product_id: null,
          product_name: null,
          item_number: null,
          quantity: null,
          price: null,
          total_amount: null,
          price_option_used: null,
          price_option_description: null,
          price_per_unit: null,

          // 상태 (기존 값이 있으면 보존)
          status: comment.existing_status || '주문완료',
          sub_status: comment.existing_sub_status || (isCancellation ? '확인필요' : null),

          // 타임스탬프
          ordered_at: orderedAt || null,
          commented_at: commentedAt || null,
          created_at: comment.existing_created_at || new Date().toISOString(),
          updated_at: resolvedUpdatedAt,
          confirmed_at: comment.existing_confirmed_at || null,
          completed_at: comment.existing_completed_at || null,
          canceled_at: comment.existing_canceled_at || null,
          paid_at: comment.existing_paid_at || null,

          // 메타데이터 (제거)
          processing_method: null,
          ai_extraction_result: null,
          ai_process_reason: null,
          pattern_details: null,
          matching_metadata: null,
          selected_barcode_option: null,

          // 기타
          admin_note: null,
          content: null,
          history: null
        };

        orders.push(orderData);
        processingSummary.generatedOrders++;

        // 대댓글인지 확인 (commentKey에 '_' 포함)
        if (commentKey?.includes('_')) {
          console.log('[대댓글 디버그 - generateOrderData] 대댓글 주문 생성:', {
            commentKey,
            content: content?.substring(0, 50),
            order_id: orderId,
            customer_name: authorName || author?.name
          });
        }

      } catch (commentError) {
        console.error('댓글 처리 중 오류', {
          commentKey: comment.commentKey,
          error: commentError.message
        });
        processingSummary.errors.push({
          type: 'comment_processing',
          commentKey: comment.commentKey,
          message: commentError.message
        });
        // 개별 댓글 실패해도 계속 진행
      }
    }

    console.log('[대댓글 디버그 - generateOrderData] 최종 주문 생성 결과:', {
      total_orders: orders.length,
      has_underscore_keys: orders.filter(o => o.comment_key?.includes('_')).length,
      sample_order_keys: orders.slice(0, 5).map(o => o.comment_key)
    });

    console.info('댓글 처리 완료', processingSummary);

    return {
      orders,
      customers,
      cancellationUsers,
      success: true,
      processingSummary
    };

  } catch (error) {
    console.error('generateOrderData 전체 오류', {
      postKey,
      error: error.message,
      stack: error.stack
    });

    // 에러가 발생해도 지금까지 처리된 것은 반환
    return {
      orders,
      customers,
      cancellationUsers,
      success: false,
      error: error.message,
      processingSummary
    };
  }
}
