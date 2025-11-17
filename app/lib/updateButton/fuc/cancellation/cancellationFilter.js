/**
 * 취소 댓글 필터링 모듈
 * 댓글 중에서 취소 요청을 감지하고 필터링합니다.
 */

/**
 * 댓글 목록에서 취소 요청 댓글을 필터링합니다.
 *
 * @param {Array} comments - 댓글 배열
 * @returns {Object} 필터링된 댓글과 취소 요청 사용자 정보
 * @returns {Array} filteredComments - 취소 요청이 아닌 일반 댓글들
 * @returns {Set} cancellationUsers - 취소 요청한 사용자의 user_key Set
 */
export function filterCancellationComments(comments) {
  const cancellationPatterns = [
    /취소/i,
    /주문\s*취소/i,
    /취소해\s*주세요/i,
    /취소\s*요청/i,
    /취소할게요/i,
    /취소\s*해주세요/i,
    /주문\s*취소\s*합니다/i
  ];

  const filteredComments = [];
  const cancellationUsers = new Set(); // 취소 요청한 사용자들

  for (const comment of comments) {
    const commentContent = comment.content?.trim() || comment.body?.trim() || "";
    const isCancellation = cancellationPatterns.some((pattern) => pattern.test(commentContent));

    if (isCancellation) {
      const authorUserNo = comment.author?.user_key ||
                          comment.author?.userNo ||
                          comment.authorUserNo ||
                          comment.author_user_no ||
                          comment.customer_band_id ||
                          comment.userKey ||
                          comment.user_key;

      if (authorUserNo) {
        cancellationUsers.add(authorUserNo);
      }
    } else {
      filteredComments.push(comment);
    }
  }

  return {
    filteredComments,
    cancellationUsers
  };
}
