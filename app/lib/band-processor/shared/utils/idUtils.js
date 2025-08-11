// ID 생성 및 기타 유틸리티 함수들
/**
 * 함수명: generateProductUniqueIdForItem
 * 목적: 상품별 고유 ID 생성
 * 사용처: processProduct
 * 의존성: 없음
 * 파라미터:
 *   - userId: 사용자 ID
 *   - originalPostId: 원본 게시물 ID
 *   - itemNumber: 상품 번호
 * 리턴값: 생성된 상품 ID
 */
export function generateProductUniqueIdForItem(
  userId,
  originalPostId,
  itemNumber
) {
  return `prod_${originalPostId}_item${itemNumber}`;
}

/**
 * 함수명: generateOrderUniqueId
 * 목적: 주문 고유 ID 생성
 * 사용처: generateOrderData
 * 의존성: 없음
 * 파라미터:
 *   - postId: 게시물 ID
 *   - commentKey: 댓글 키
 *   - itemIdentifier: 상품 식별자
 * 리턴값: 생성된 주문 ID
 */
export function generateOrderUniqueId(postId, commentKey, itemIdentifier) {
  return `order_${postId}_${commentKey}_item${itemIdentifier}`;
}

/**
 * 함수명: generateCustomerUniqueId
 * 목적: 고객 고유 ID 생성
 * 사용처: generateOrderData
 * 의존성: 없음
 * 파라미터:
 *   - userId: 사용자 ID
 *   - authorUserNo: 작성자 사용자 번호
 * 리턴값: 생성된 고객 ID
 */
export function generateCustomerUniqueId(userId, authorUserNo) {
  return `cust_${userId}_${authorUserNo}`;
}