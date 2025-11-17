/**
 * 취소 감지 및 처리 모듈
 *
 * 주문 취소 요청 댓글을 감지하고 기존 주문 상태를 업데이트합니다.
 *
 * 주요 기능:
 * - 취소 키워드 감지 ("취소", "주문 취소", etc.)
 * - 작성자별 취소 요청 그룹화
 * - DB의 기존 주문 취소 상태 업데이트
 * - order_logs 테이블에 취소 기록
 */

/**
 * 취소 댓글 감지 패턴
 */
const CANCELLATION_PATTERNS = [
  /취소/i,
  /주문\s*취소/i,
  /취소해\s*주세요/i,
  /취소\s*요청/i,
  /취소할게요/i,
  /취소\s*해주세요/i,
  /주문\s*취소\s*합니다/i,
  /cancel/i,
  /취소요청/i,
];

/**
 * 댓글이 취소 요청인지 확인합니다
 * @param {string} content - 댓글 내용
 * @returns {boolean} 취소 요청 여부
 */
export function isCancellationComment(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  return CANCELLATION_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * 취소 댓글을 감지하고 작성자별로 그룹화합니다
 *
 * @param {Array} comments - 댓글 배열
 * @returns {Object} { cancellations: Array, cancellationUsers: Set, validComments: Array }
 */
export function detectCancellations(comments) {
  if (!comments || !Array.isArray(comments)) {
    return {
      cancellations: [],
      cancellationUsers: new Set(),
      validComments: []
    };
  }

  const cancellations = [];
  const cancellationUsers = new Set();
  const validComments = [];

  for (const comment of comments) {
    const content = comment.content || '';
    const authorUserNo = comment.author?.userNo;

    if (isCancellationComment(content)) {
      // 취소 댓글 기록
      cancellations.push({
        commentKey: comment.commentKey,
        content: content,
        authorUserNo: authorUserNo,
        authorName: comment.author?.name || '알수없음',
        createdAt: comment.createdAt,
        createdAtKST: comment.createdAtKST,
      });

      // 취소 요청한 사용자 추가
      if (authorUserNo) {
        cancellationUsers.add(authorUserNo);
      }

      console.log(`[취소 감지] 사용자 ${authorUserNo} (${comment.author?.name}): "${content}"`);
    } else {
      // 일반 댓글 (주문 처리용)
      validComments.push(comment);
    }
  }

  console.log(`[취소 감지] 총 ${cancellations.length}개 취소 요청 발견 (${cancellationUsers.size}명의 사용자)`);

  return {
    cancellations,
    cancellationUsers,
    validComments
  };
}

/**
 * 기존 주문을 취소 상태로 업데이트합니다
 *
 * @param {Object} params - 파라미터
 * @param {Object} params.supabase - Supabase 클라이언트
 * @param {string} params.postKey - 게시물 키
 * @param {Set} params.cancellationUsers - 취소 요청한 사용자 Set
 * @param {Array} params.cancellations - 취소 댓글 배열
 * @param {string} params.userId - 현재 사용자 ID
 * @returns {Promise<Object>} { processedCount: number, errors: Array }
 */
export async function processCancellations({
  supabase,
  postKey,
  cancellationUsers,
  cancellations,
  userId
}) {
  if (!cancellationUsers || cancellationUsers.size === 0) {
    console.log('[취소 처리] 취소 요청 없음');
    return {
      processedCount: 0,
      errors: []
    };
  }

  console.log(`[취소 처리] ${cancellationUsers.size}명의 취소 요청 처리 시작`);

  let totalCancelledOrders = 0;
  const errors = [];

  try {
    for (const authorUserNo of cancellationUsers) {
      try {
        // 1. 해당 사용자의 활성 주문 조회
        const { data: existingOrders, error: fetchError } = await supabase
          .from('orders')
          .select('order_id, customer_name, product_name, quantity, status')
          .eq('post_key', postKey)
          .eq('customer_band_id', authorUserNo)
          .in('status', ['주문대기', '주문확인', '배송중']); // 활성 주문만

        if (fetchError) {
          console.error(`[취소 처리] 주문 조회 실패 (사용자: ${authorUserNo}):`, fetchError);
          errors.push({
            authorUserNo,
            message: `주문 조회 실패: ${fetchError.message}`
          });
          continue;
        }

        if (!existingOrders || existingOrders.length === 0) {
          console.log(`[취소 처리] 취소할 주문 없음 (사용자: ${authorUserNo})`);
          continue;
        }

        console.log(`[취소 처리] ${existingOrders.length}개 주문 발견 (사용자: ${authorUserNo})`);

        // 2. 주문 상태를 "주문취소"로 업데이트
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: '주문취소',
            sub_status: '취소요청',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('post_key', postKey)
          .eq('customer_band_id', authorUserNo)
          .in('status', ['주문대기', '주문확인', '배송중']);

        if (updateError) {
          console.error(`[취소 처리] 주문 업데이트 실패 (사용자: ${authorUserNo}):`, updateError);
          errors.push({
            authorUserNo,
            message: `주문 업데이트 실패: ${updateError.message}`
          });
          continue;
        }

        totalCancelledOrders += existingOrders.length;

        console.log(`[취소 처리] ✅ ${existingOrders.length}개 주문 취소 완료 (사용자: ${authorUserNo})`);

        // 3. order_logs에 취소 기록 (선택적)
        try {
          const cancellationComment = cancellations.find(c => c.authorUserNo === authorUserNo);

          await supabase.from('order_logs').insert({
            user_id: userId,
            post_key: postKey,
            action: '취소요청',
            details: {
              cancelled_orders: existingOrders.length,
              cancellation_comment: cancellationComment?.content || '',
              customer_band_id: authorUserNo,
              timestamp: new Date().toISOString()
            },
            created_at: new Date().toISOString()
          });
        } catch (logError) {
          // 로그 저장 실패는 무시 (주요 작업은 성공)
          console.warn(`[취소 처리] 취소 로그 저장 실패 (사용자: ${authorUserNo}):`, logError);
        }

      } catch (userError) {
        console.error(`[취소 처리] 사용자 ${authorUserNo} 처리 중 오류:`, userError);
        errors.push({
          authorUserNo,
          message: userError.message
        });
      }
    }

    console.log(`[취소 처리] 완료: 총 ${totalCancelledOrders}개 주문 취소됨`);

    return {
      processedCount: totalCancelledOrders,
      errors
    };

  } catch (error) {
    console.error('[취소 처리] 전체 처리 중 오류:', error);
    return {
      processedCount: totalCancelledOrders,
      errors: [{
        message: `전체 처리 오류: ${error.message}`
      }]
    };
  }
}

/**
 * 취소 댓글을 제외한 일반 댓글만 반환합니다
 *
 * @param {Array} comments - 전체 댓글 배열
 * @returns {Array} 일반 댓글 배열 (취소 제외)
 */
export function filterCancellationComments(comments) {
  const { validComments } = detectCancellations(comments);
  return validComments;
}

/**
 * 통합 취소 처리 함수
 *
 * 댓글 배열을 받아서:
 * 1. 취소 댓글 감지
 * 2. 기존 주문 취소 처리
 * 3. 일반 댓글만 반환
 *
 * @param {Object} params - 파라미터
 * @param {Array} params.comments - 댓글 배열
 * @param {Object} params.supabase - Supabase 클라이언트
 * @param {string} params.postKey - 게시물 키
 * @param {string} params.userId - 사용자 ID
 * @returns {Promise<Object>} { validComments: Array, cancellationStats: Object }
 */
export async function handleCancellations({
  comments,
  supabase,
  postKey,
  userId
}) {
  console.log('[취소 핸들러] 취소 처리 시작');

  // 1. 취소 댓글 감지
  const { cancellations, cancellationUsers, validComments } = detectCancellations(comments);

  // 2. 취소 요청 처리
  const { processedCount, errors } = await processCancellations({
    supabase,
    postKey,
    cancellationUsers,
    cancellations,
    userId
  });

  // 3. 통계 반환
  const cancellationStats = {
    totalCancellationComments: cancellations.length,
    uniqueCancellationUsers: cancellationUsers.size,
    cancelledOrders: processedCount,
    validCommentsCount: validComments.length,
    errors: errors,
    timestamp: new Date().toISOString()
  };

  console.log('[취소 핸들러] 완료:', {
    취소댓글: cancellationStats.totalCancellationComments,
    취소된주문: cancellationStats.cancelledOrders,
    일반댓글: cancellationStats.validCommentsCount
  });

  return {
    validComments,
    cancellationStats
  };
}
