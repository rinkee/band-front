// ID 생성 및 기타 유틸리티 함수들
/**
 * 함수명: generateProductUniqueIdForItem
 * 목적: 상품별 고유 ID 생성
 * 사용처: processProduct
 * 의존성: 없음
 * 파라미터:
 *   - userId: 사용자 ID (supabase 고유값)
 *   - bandKey: 밴드 키
 *   - originalPostId: 원본 게시물 ID
 *   - itemNumber: 상품 번호
 * 리턴값: 생성된 상품 ID
 */ export function generateProductUniqueIdForItem(userId, bandKey, originalPostId, itemNumber) {
  return `prod_${userId}_${bandKey}_${originalPostId}_item${itemNumber}`;
}
/**
 * 함수명: generateOrderUniqueId
 * 목적: 주문 고유 ID 생성
 * 사용처: generateOrderData
 * 의존성: 없음
 * 파라미터:
 *   - userId: 사용자 ID (supabase 고유값)
 *   - bandKey: 밴드 키
 *   - postId: 게시물 ID
 *   - commentKey: 댓글 키
 *   - itemIdentifier: 상품 식별자
 * 리턴값: 생성된 주문 ID
 */ export function generateOrderUniqueId(userId, bandKey, postId, commentKey, itemIdentifier) {
  // Band API의 comment_key가 고유하지 않은 문제 해결
  // userId 추가하여 완전한 고유성 확보
  return `order_${userId}_${bandKey}_${postId}_${commentKey}_item${itemIdentifier}`;
}
/**
 * 함수명: generateCustomerUniqueId
 * 목적: 고객 고유 ID 생성
 * 사용처: generateOrderData
 * 의존성: 없음
 * 파라미터:
 *   - bandKey: 밴드 키 (고유성 보장)
 *   - userId: 사용자 ID
 *   - authorUserNo: 작성자 사용자 번호
 * 리턴값: 생성된 고객 ID
 */ export function generateCustomerUniqueId(bandKey, userId, authorUserNo) {
  return `cust_${bandKey}_${userId}_${authorUserNo}`;
}
