// AI 상품 추출 함수
/**
 * 함수명: extractProductInfoAI
 * 목적: AI를 사용하여 게시물 내용에서 상품 정보 추출 (API 라우트 사용)
 * 사용처: processProduct
 * 의존성: /api/ai/product-extraction
 * 파라미터:
 *   - content: 게시물 내용
 *   - postTime: 게시물 작성 시간
 *   - postKey: 게시물 키
 * 리턴값: 추출된 상품 정보 배열
 */
export async function extractProductInfoAI(content, postTime = null, postKey) {
  // 기본 상품 생성 함수 - 빈 배열 반환으로 잘못된 데이터 생성 방지
  function getDefaultProduct(errorMessage = "") {
    console.warn(`[AI 분석] getDefaultProduct 호출됨 - 이유: ${errorMessage}`);
    console.warn(`[AI 분석] 잘못된 "주문 양식 확인 필요" 데이터 생성을 방지하기 위해 빈 배열을 반환합니다.`);
    return [];
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    console.warn("[AI 분석] 유효하지 않은 콘텐츠입니다. 기본 상품을 반환합니다.");
    return getDefaultProduct("콘텐츠 없음");
  }

  try {
    console.log(`[AI 분석] API 호출 시작, postKey: ${postKey || "unknown"}`);

    // API 엔드포인트 호출
    const response = await fetch('/api/ai/product-extraction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        postTime,
        postKey
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const httpError = new Error(`AI API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
      httpError.name = "AIHttpError";
      throw httpError;
    }

    const result = await response.json();

    // API 응답 형식에 맞게 조정
    if (result && Array.isArray(result.products)) {
      console.log(`[AI 분석] ${result.products.length}개 상품 추출 완료`);
      return result.products;
    } else if (Array.isArray(result)) {
      console.log(`[AI 분석] ${result.length}개 상품 추출 완료`);
      return result;
    }

    console.warn('[AI 분석] 예상치 못한 응답 형식:', result);
    return getDefaultProduct("예상치 못한 응답 형식");

  } catch (error) {
    console.error('[AI 분석] 오류:', error);
    if (error?.name === "AIHttpError") {
      throw error;
    }
    return getDefaultProduct(error.message);
  }
}
