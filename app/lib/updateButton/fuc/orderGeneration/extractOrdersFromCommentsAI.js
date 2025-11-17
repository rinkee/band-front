/**
 * AI를 사용하여 댓글에서 주문 정보를 추출하는 함수
 *
 * @param {Object} postInfo - 게시물 정보 (products 배열 포함)
 * @param {Array} comments - 분석할 댓글 배열
 * @param {string} bandNumber - Band 번호
 * @param {string} postKey - 게시물 키
 * @returns {Promise<Array>} AI가 분석한 주문 결과 배열
 */
export async function extractOrdersFromCommentsAI(postInfo, comments, bandNumber, postKey) {
  try {
    // AI 엔드포인트 호출
    const response = await fetch('/api/ai/comment-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postInfo,
        comments,
        bandNumber,
        postKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API 호출 실패: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // API 응답 형식에 맞게 조정
    if (result && Array.isArray(result.orders)) {
      return result.orders;
    } else if (Array.isArray(result)) {
      return result;
    }

    console.warn('[AI 주문 추출] 예상치 못한 응답 형식:', result);
    return [];
  } catch (error) {
    console.error('[AI 주문 추출] 오류:', error);
    // AI 실패 시 빈 배열 반환 (패턴 기반 처리로 폴백)
    return [];
  }
}
