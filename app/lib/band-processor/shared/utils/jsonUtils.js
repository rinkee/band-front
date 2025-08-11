/**
 * 함수명: safeJsonStringify
 * 목적: 안전하게 객체를 JSON 문자열로 변환하며, 순환 참조 및 특수 값들을 처리
 * 사용처: 전체 애플리케이션에서 DB 저장 전 데이터 직렬화 시 사용
 * 의존성: 없음
 * 파라미터:
 *   - obj: JSON으로 변환할 객체
 *   - space: JSON 포맷팅 스페이스 (기본값: null)
 * 리턴값: JSON 문자열 또는 null
 */
export function safeJsonStringify(obj, space = null) {
  try {
    if (obj === null || obj === undefined) {
      return null;
    }
    // 1단계: 기본 타입 체크
    if (typeof obj === "string") {
      // 이미 문자열이면 JSON인지 확인
      try {
        JSON.parse(obj);
        return obj; // 이미 유효한 JSON 문자열
      } catch {
        // JSON이 아닌 일반 문자열이면 JSON으로 변환
        return JSON.stringify(obj);
      }
    }
    if (typeof obj === "number" || typeof obj === "boolean") {
      return JSON.stringify(obj);
    }
    // 2단계: 객체/배열 정리
    const cache = new Set();
    const cleanObj = JSON.parse(
      JSON.stringify(obj, (key, value) => {
        // 순환 참조 방지
        if (typeof value === "object" && value !== null) {
          if (cache.has(value)) {
            return "[Circular Reference]";
          }
          cache.add(value);
        }
        // 문제가 될 수 있는 값들 정리
        if (value === undefined) return null;
        if (typeof value === "function") return "[Function]";
        if (typeof value === "symbol") return "[Symbol]";
        if (typeof value === "bigint") return value.toString();
        // NaN, Infinity 처리
        if (typeof value === "number") {
          if (isNaN(value)) return null;
          if (!isFinite(value)) return null;
        }
        // 빈 객체나 배열 처리
        if (typeof value === "object" && value !== null) {
          if (Array.isArray(value) && value.length === 0) return [];
          if (Object.keys(value).length === 0) return {};
        }
        return value;
      })
    );
    // 3단계: JSON 문자열 생성
    const result = JSON.stringify(cleanObj, null, space);
    // 4단계: 결과 검증 - 다시 파싱해서 유효한 JSON인지 확인
    JSON.parse(result);
    // 5단계: 크기 검증 (PostgreSQL JSON 필드 제한 고려)
    if (result.length > 1000000) {
      // 1MB 제한
      console.warn("JSON 데이터가 너무 큽니다. 요약된 버전을 반환합니다.");
      return JSON.stringify({
        summary: "Data too large",
        originalSize: result.length,
        timestamp: new Date().toISOString(),
        sample: result.substring(0, 1000) + "...",
      });
    }
    return result;
  } catch (error) {
    console.error(
      "JSON stringify error:",
      error.message,
      "Original object type:",
      typeof obj
    );
    // 매우 안전한 fallback JSON 반환
    try {
      return JSON.stringify({
        error: "JSON serialization failed",
        message: error.message,
        originalType: typeof obj,
        timestamp: new Date().toISOString(),
      });
    } catch (fallbackError) {
      // 최후의 수단
      return (
        '{"error":"Critical JSON serialization failure","timestamp":"' +
        new Date().toISOString() +
        '"}'
      );
    }
  }
}