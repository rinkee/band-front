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

  console.info('댓글 처리 시작 (댓글 전용 모드)', {
    postKey,
    commentCount: comments.length
  });

  try {
    // 1. 취소 댓글 필터링
    const { filteredComments, cancellationUsers: cancelUsers } = filterCancellationComments(comments);

    // 취소 사용자 Set 할당
    cancellationUsers = cancelUsers;

    processingSummary.skippedCancellation = comments.length - filteredComments.length;

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
          createdAt
        } = comment;

        // 필수 필드 검증
        if (!commentKey || !content) {
          console.warn('필수 필드 누락', { commentKey, hasContent: !!content });
          continue;
        }

        // 고객 ID 생성
        const customerId = generateCustomerUniqueId(userId, authorUserNo || author?.user_no);

        // 고객 정보 추가
        if (!customers.has(customerId)) {
          customers.set(customerId, {
            customer_id: customerId,
            user_id: userId,
            band_key: bandKey,
            band_id: authorUserNo || author?.user_no,
            name: authorName || author?.name || '이름 없음',
            profile_image_url: authorProfile || author?.profile_image_url || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          processingSummary.generatedCustomers++;
        }

        // 주문 ID 생성 (item_number는 항상 1)
        const orderId = generateOrderUniqueId(
          postKey,
          commentKey,
          1, // item_number (댓글 전용이므로 항상 1)
          0  // variant_index (사용 안 함)
        );

        // 날짜 파싱
        const orderedAt = safeParseDate(createdAt);

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
          customer_name: authorName || author?.name || '이름 없음',
          customer_band_id: authorUserNo || author?.user_no || null,
          customer_profile: authorProfile || author?.profile_image_url || null,

          // 댓글 내용
          comment: content,
          band_comment_id: commentKey,
          band_comment_url: null,

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

          // 상태
          status: '주문완료',
          sub_status: null,

          // 타임스탬프
          ordered_at: orderedAt,
          commented_at: orderedAt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          confirmed_at: null,
          completed_at: null,
          canceled_at: null,
          paid_at: null,

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
