/**
 * 취소 댓글 처리 모듈
 */

/**
 * 취소 관련 키워드 패턴
 */
const CANCELLATION_PATTERNS = [
  /취소/i,
  /주문\s*취소/i,
  /취소해\s*주세요/i,
  /취소\s*요청/i,
  /취소할게요/i,
  /취소\s*해주세요/i,
  /주문\s*취소\s*합니다/i,
];

/**
 * 취소 댓글을 처리합니다
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} userId - 사용자 ID
 * @param {Array} comments - 댓글 배열
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {string} bandNumber - 밴드 번호
 * @returns {Promise<Object>} 처리 결과 (filteredComments: 취소 댓글 제외 배열, cancellationCount: 처리된 취소 댓글 수)
 */
export async function processCancellationComments(
  supabase,
  userId,
  comments,
  postKey,
  bandKey,
  bandNumber
) {
  try {
    // 댓글들을 시간순으로 정렬 (작성 시간 기준)
    const sortedComments = [...comments].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
    
    let cancellationCount = 0;
    const filteredComments = [];
    
    for (let i = 0; i < sortedComments.length; i++) {
      const comment = sortedComments[i];
      const commentContent = comment.content?.trim() || "";
      
      // 취소 댓글인지 확인
      const isCancellation = CANCELLATION_PATTERNS.some((pattern) =>
        pattern.test(commentContent)
      );
      
      if (isCancellation) {
        // 이 사용자의 이전 주문들을 찾아서 취소 처리
        const authorUserNo = comment.authorUserNo || comment.author_user_no;
        
        if (authorUserNo) {
          await cancelPreviousOrders(
            supabase,
            userId,
            postKey,
            bandKey,
            bandNumber,
            authorUserNo,
            comment.createdAt,
            commentContent
          );
          cancellationCount++;
        } else {
          console.warn(
            `[취소 처리] 취소 댓글 발견했지만 작성자 정보 없음:`,
            commentContent
          );
        }
        // 취소 댓글은 필터링 (주문 처리에서 제외)
      } else {
        // 취소 댓글이 아닌 경우만 배열에 추가
        filteredComments.push(comment);
      }
    }
    
    if (cancellationCount > 0) {
      console.log(
        `[취소 처리] ${cancellationCount}개의 취소 댓글 처리 완료`
      );
    }
    
    return {
      filteredComments,
      cancellationCount
    };
  } catch (error) {
    console.error("[취소 처리] 오류 발생:", error);
    // 에러가 발생해도 프로세스는 계속 진행 (원본 댓글 반환)
    return {
      filteredComments: comments,
      cancellationCount: 0
    };
  }
}

/**
 * 특정 사용자의 이전 주문들을 취소 처리합니다
 * @param {Object} supabase - Supabase 클라이언트
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {string} bandNumber - 밴드 번호
 * @param {string} authorUserNo - 작성자 번호
 * @param {string} cancellationTime - 취소 시간
 * @param {string} cancellationComment - 취소 댓글 내용
 */
async function cancelPreviousOrders(
  supabase,
  userId,
  postKey,
  bandKey,
  bandNumber,
  authorUserNo,
  cancellationTime,
  cancellationComment
) {
  try {
    console.log(
      `[취소 처리] 사용자 ${authorUserNo}의 주문 취소 처리 시작`
    );
    
    // 이 사용자의 이 게시물에 대한 모든 주문 조회
    const { data: orders, error: selectError } = await supabase
      .from("orders")
      .select("order_id, status")
      .eq("post_key", postKey)
      .eq("customer_band_id", authorUserNo)
      .eq("status", "주문완료");
    
    if (selectError) {
      console.error("[취소 처리] 주문 조회 실패:", selectError);
      return;
    }
    
    if (!orders || orders.length === 0) {
      console.log(
        `[취소 처리] 사용자 ${authorUserNo}의 대기 중인 주문이 없음`
      );
      return;
    }
    
    // 주문들을 취소 상태로 업데이트
    const orderIds = orders.map((o) => o.order_id);
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "주문취소",
        canceled_at: cancellationTime,
        updated_at: new Date().toISOString(),
      })
      .in("order_id", orderIds);
    
    if (updateError) {
      console.error("[취소 처리] 주문 취소 업데이트 실패:", updateError);
      return;
    }
    
    console.log(
      `[취소 처리] ${orders.length}개 주문 취소 처리 완료 (사용자: ${authorUserNo})`
    );
    
    // 취소 로그 기록 (선택적)
    try {
      const cancellationLog = {
        user_id: userId,
        post_key: postKey,
        band_number: bandNumber,
        customer_band_id: authorUserNo,
        cancelled_orders: orderIds,
        canceled_at: cancellationTime,
        cancellation_comment: cancellationComment,
        created_at: new Date().toISOString(),
      };
      
      await supabase
        .from("order_cancellation_logs")
        .insert(cancellationLog);
    } catch (err) {
      console.warn("[취소 처리] 취소 로그 기록 실패:", err);
      // 로그 실패는 무시하고 계속 진행
    }
    
  } catch (error) {
    console.error(
      `[취소 처리] 사용자 ${authorUserNo}의 주문 취소 처리 중 오류:`,
      error
    );
  }
}

/**
 * 댓글에서 취소 요청을 감지합니다
 * @param {string} commentContent - 댓글 내용
 * @returns {boolean} 취소 요청 여부
 */
export function isCancellationComment(commentContent) {
  if (!commentContent || typeof commentContent !== 'string') {
    return false;
  }
  
  return CANCELLATION_PATTERNS.some((pattern) =>
    pattern.test(commentContent.trim())
  );
}

/**
 * 취소 댓글 정보를 추출합니다
 * @param {Object} comment - 댓글 객체
 * @returns {Object|null} 취소 정보 또는 null
 */
export function extractCancellationInfo(comment) {
  const content = comment.content?.trim() || "";
  
  if (!isCancellationComment(content)) {
    return null;
  }
  
  return {
    commentKey: comment.comment_key || comment.commentKey,
    authorUserNo: comment.authorUserNo || comment.author_user_no,
    authorName: comment.author?.name || comment.author_name || "알수없음",
    content: content,
    createdAt: comment.createdAt || comment.created_at,
    isCancellation: true,
  };
}