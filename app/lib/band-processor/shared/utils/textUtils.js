/**
 * 함수명: normalizeAndTokenize
 * 목적: 텍스트를 정규화하고 토큰으로 분리
 * 사용처: 상품명 매칭, 유사도 계산
 * 의존성: 없음
 * 파라미터: text - 토큰화할 텍스트
 * 리턴값: 정규화된 단어 배열
 */
export function normalizeAndTokenize(text) {
  if (!text || typeof text !== "string") return [];
  // 한글, 영문, 숫자만 남기고 나머지는 공백으로 변환
  const normalized = text
    .toLowerCase()
    .replace(/[^\w가-힣]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 공백으로 분리하여 단어 배열 생성
  return normalized.split(" ").filter((word) => word.length > 0);
}

/**
 * 함수명: extractMeaningfulSegments
 * 목적: 단어에서 의미 있는 세그먼트(부분 문자열) 추출
 * 사용처: 복잡한 단어 매칭, 유사도 계산
 * 의존성: 없음
 * 파라미터: word - 세그먼트를 추출할 단어
 * 리턴값: 추출된 세그먼트 배열
 */
export function extractMeaningfulSegments(word) {
  const segments = [];
  // 일반적인 한국어 식품 관련 키워드 패턴
  const foodKeywords = [
    "비건",
    "유기농",
    "무농약",
    "친환경",
    "국산",
    "수입",
    "냉동",
    "냉장",
    "생",
    "말린",
    "김치",
    "식빵",
    "빵",
    "떡",
    "과자",
    "쿠키",
    "케이크",
    "음료",
    "주스",
    "우유",
    "요거트",
    "고기",
    "소고기",
    "돼지고기",
    "닭고기",
    "생선",
    "연어",
    "참치",
    "새우",
    "오징어",
    "채소",
    "과일",
    "사과",
    "배",
    "포도",
    "딸기",
    "바나나",
    "오렌지",
    "토마토",
    "양파",
    "당근",
    "배추",
    "무",
    "감자",
    "고구마",
    "브로콜리",
    "시금치",
    "상추",
    "오이",
    "쌀",
    "현미",
    "귀리",
    "퀴노아",
    "콩",
    "두부",
    "된장",
    "고추장",
    "간장",
    "식초",
    "라면",
    "우동",
    "국수",
    "파스타",
    "피자",
    "햄버거",
    "치킨",
    "족발",
    "보쌈",
    "모싯잎",
    "통밀",
    "모닝",
    "영양",
    "우리밀",
    "쌀",
    "호밀",
    "귀리",
    "견과",
  ];
  // 키워드 기반 세그먼트 추출 (주석처리 - 유사도 매칭 테스트)
  // foodKeywords.forEach((keyword) => {
  //   if (word.includes(keyword)) {
  //     segments.push(keyword);
  //   }
  // });
  // 키워드 없이 무조건 2글자씩 분할
  // if (segments.length === 0) {
  for (let i = 0; i < word.length - 1; i++) {
    segments.push(word.substring(i, i + 2));
  }
  // }
  return segments;
}

/**
 * 함수명: contentHasPriceIndicator
 * 목적: 콘텐츠에 가격 관련 지표가 있는지 확인
 * 사용처: 상품 게시물 판별
 * 의존성: 없음
 * 파라미터: content - 확인할 콘텐츠
 * 리턴값: 가격 지표 포함 여부
 */
export function contentHasPriceIndicator(content) {
  if (!content) return false;
  // URL이 포함된 게시물은 상품 게시물이 아닌 것으로 판단
  if (content.includes("http://") || content.includes("https://")) {
    // console.log("[Debug] URL 포함 게시물, 상품 아님으로 판단");
    return false;
  }
  const lowerContent = content.toLowerCase();
  // 1. 판매 관련 핵심 키워드 확인 (기존과 동일하게 유지 또는 필요시 확장)
  const salesKeywords = [
    "주문",
    "예약",
    "판매",
    "가격",
    "공구",
    "특가",
    "할인",
    "만원",
    "천원",
    "원",
    "냥",
    "₩",
  ];
  let hasSalesKeyword = false;
  for (const keyword of salesKeywords) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      hasSalesKeyword = true;
      break;
    }
  }
  // 판매 키워드가 전혀 없으면 false 반환
  if (!hasSalesKeyword) {
    // console.log("[Debug] 판매 키워드가 없음, 상품 아님으로 판단");
    return false;
  }
  // 2. 가격이 의미하는 숫자가 있는지 추가 확인
  const priceRegex = /\d[\d,]*\s*(원|냥|만원|천원|₩)/; // 가격 형태의 숫자 찾기
  const priceNumberRegex = /\b([1-9]\d{2,})\b/; // 100 이상의 숫자 찾기 (통상 가격은 100원 이상)
  if (!priceRegex.test(content) && !priceNumberRegex.test(content)) {
    // console.log("[Debug] 유효한 가격 숫자가 없음, 상품 아님으로 판단");
    return false;
  }
  // 3. 비상품 게시물 패턴 체크 (도착 안내 등)
  const arrivalPatterns = [
    /\d+월\s*\d+일.*도착\s*(예정|완료|했|함)/,
    /도착\s*(예정|완료|했|함).*\d+월\s*\d+일/,
    /배송\s*(도착|완료)/,
    /픽업\s*(완료|했|함)/,
  ];
  for (const pattern of arrivalPatterns) {
    if (pattern.test(content)) {
      // console.log("[Debug] 도착 안내 패턴 감지, 상품 아님으로 판단");
      return false;
    }
  }
  // console.log("[Debug] 최종 판단: 상품 게시물");
  return true; // 판매 키워드 O, 100 이상의 가격 숫자 O, (선택적으로) 도착 안내 패턴 아님
}