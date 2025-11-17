/**
 * 함수명: normalizeAndTokenize
 * 목적: 텍스트를 정규화하고 토큰으로 분리 (복합 단위 분리 개선)
 * 사용처: 상품명 매칭, 유사도 계산
 * 의존성: 없음
 * 파라미터: text - 토큰화할 텍스트
 * 리턴값: 정규화된 단어 배열
 */
export function normalizeAndTokenize(text: any) {
  if (!text || typeof text !== "string") return [];
  // 한글, 영문, 숫자만 남기고 나머지는 공백으로 변환
  const normalized = text.toLowerCase().replace(/[^\w가-힣]/g, " ").replace(/\s+/g, " ").trim();
  // 🔥 개선: 복합 단어를 분리하여 토큰화
  const tokens: string[] = [];
  normalized.split(" ").forEach((word)=>{
    if (word.length === 0) return;
    // 패턴 1: 숫자+단위 (예: "1상자", "2박스", "3키로")
    const numberUnitMatch = word.match(/^(\d+)(상자|박스|통|팩|봉지|봉|개|알|키로|kg|g|판|세트)$/);
    if (numberUnitMatch) {
      tokens.push(numberUnitMatch[1]); // 숫자 ("1", "2")
      tokens.push(numberUnitMatch[2]); // 단위 ("상자", "박스")
      return;
    }
    // 패턴 2: 한글수량+단위 (예: "반상자", "한박스", "두통")
    const koreanUnitMatch = word.match(/^(반|한|두|세|네|다섯)(상자|박스|통|팩|봉지|봉|개|세트)$/);
    if (koreanUnitMatch) {
      tokens.push(koreanUnitMatch[1]); // 한글 수량 ("반", "한")
      tokens.push(koreanUnitMatch[2]); // 단위 ("상자", "박스")
      return;
    }
    // 🔥 패턴 3: 상품명+용도+숫자 분리 (우선순위 높음, 예: "돼지고기찌개용1" → ["돼지고기", "찌개용", "1"])
    const usageKeywords = [
      '찌개용',
      '제육용',
      '불고기용',
      '국거리',
      '구이용',
      '스테이크용',
      '샤브용'
    ];
    for (const usage of usageKeywords){
      const pattern = new RegExp(`^(.+?)(${usage})(\\d+)?$`);
      const usageMatch = word.match(pattern);
      if (usageMatch) {
        const baseName = usageMatch[1]; // "돼지고기"
        const usageTerm = usageMatch[2]; // "찌개용"
        const number = usageMatch[3]; // "1" 또는 undefined
        if (baseName) tokens.push(baseName);
        tokens.push(usageTerm);
        if (number) tokens.push(number);
        return;
      }
    }
    // 패턴 4: 일반 상품명+숫자 (예: "복숭아1", "사과2") - 끝에 숫자가 있는 경우
    const productNumberMatch = word.match(/^([가-힣]+)(\d+)$/);
    if (productNumberMatch) {
      tokens.push(productNumberMatch[1]); // 상품명 ("복숭아", "사과")
      tokens.push(productNumberMatch[2]); // 숫자 ("1", "2")
      return;
    }
    // 🔥 패턴 5: 상품명+용도 분리 (숫자 없는 경우, 예: "돼지고기찌개용" → ["돼지고기", "찌개용"])
    for (const usage of usageKeywords){
      if (word.endsWith(usage) && word.length > usage.length) {
        const baseName = word.slice(0, -usage.length);
        if (baseName.length >= 2) {
          tokens.push(baseName);
          tokens.push(usage);
          return;
        }
      }
    }
    // 기본: 그대로 추가
    tokens.push(word);
  });
  return tokens.filter((token)=>token.length > 0);
}
/**
 * 함수명: extractMeaningfulSegments
 * 목적: 단어에서 의미 있는 세그먼트(부분 문자열) 추출
 * 사용처: 복잡한 단어 매칭, 유사도 계산
 * 의존성: 없음
 * 파라미터: word - 세그먼트를 추출할 단어
 * 리턴값: 추출된 세그먼트 배열
 */
export function extractMeaningfulSegments(word: string) {
  const segments: string[] = [];
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
    "견과"
  ];
  // 키워드 기반 세그먼트 추출 (주석처리 - 유사도 매칭 테스트)
  // foodKeywords.forEach((keyword) => {
  //   if (word.includes(keyword)) {
  //     segments.push(keyword);
  //   }
  // });
  // 키워드 없이 무조건 2글자씩 분할
  // if (segments.length === 0) {
  for(let i = 0; i < word.length - 1; i++){
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
export function contentHasPriceIndicator(content: any) {
  if (!content) return false;
  // 🔥 [수정] 전화번호와 URL 패턴 제거 후 검증
  const phonePattern = /0\d{1,2}-\d{3,4}-\d{4}/g;
  const urlPattern = /https?:\/\/[^\s]+/g;  // ✅ URL 제거
  let cleanedContent = content.replace(phonePattern, '');
  cleanedContent = cleanedContent.replace(urlPattern, '');  // ✅ URL 제거
  const lowerContent = cleanedContent.toLowerCase();
  // 0. 가격 패턴 미리 확인 (공구 키워드 처리용)
  // 🔥 [개선] 다양한 가격 패턴 인식

  // 패턴 1: 단위가 명시된 가격 (기존)
  const priceWithUnitRegex = /\d[\d,]*\s*(원|냥|만원|천원|₩)[!?]*\s*/;

  // 패턴 2: 쉼표 구분자가 있는 숫자 (100 이상, 예: 15,000, 1,500, 500)
  const commaNumberRegex = /\b\d{1,3}(,\d{3})+\b/;

  // 패턴 3: 마침표 오타 구분자 (예: 15.000)
  const dotNumberRegex = /\b\d{1,3}(\.\d{3})+\b/;

  // 패턴 4: 가격 키워드 근처의 숫자 (100 이상)
  const priceKeywordPatterns = [
    /(판매|할인|특가|가격)\s*[:\s]*\d{3,}/,  // "판매 15900", "특가: 5000"
    /\d{3,}\s*(판매|할인|특가|가격|가)/,      // "15900판매", "5000가"
  ];

  // 패턴 5: 큰 숫자만 있는 경우 (1000~99999, 날짜/개수와 구분)
  const largeNumberRegex = /\b[1-9]\d{3,4}\b/;  // ✅ 3-4자리 → 4-5자리 (최대 99999)

  // 가격 패턴 종합 체크
  let hasClearPrice = false;

  // 단위가 있는 가격 (최우선)
  if (priceWithUnitRegex.test(cleanedContent)) {
    hasClearPrice = true;
  }
  // 쉼표 구분자 (100 이상)
  else if (commaNumberRegex.test(cleanedContent)) {
    const matches = cleanedContent.match(commaNumberRegex);
    if (matches) {
      // 쉼표 제거 후 숫자 변환
      const num = parseInt(matches[0].replace(/,/g, ''));
      if (num >= 100) {
        hasClearPrice = true;
      }
    }
  }
  // 마침표 오타 (100 이상)
  else if (dotNumberRegex.test(cleanedContent)) {
    const matches = cleanedContent.match(dotNumberRegex);
    if (matches) {
      // 마침표 제거 후 숫자 변환
      const num = parseInt(matches[0].replace(/\./g, ''));
      if (num >= 100) {
        hasClearPrice = true;
      }
    }
  }
  // 가격 키워드 근처 숫자
  else if (priceKeywordPatterns.some(pattern => pattern.test(cleanedContent))) {
    hasClearPrice = true;
  }
  // 큰 숫자 (1000~99999)
  else if (largeNumberRegex.test(cleanedContent)) {
    const matches = cleanedContent.match(largeNumberRegex);
    if (matches) {
      const num = parseInt(matches[0]);
      // 1000~99999 범위 (일반적인 상품 가격 범위)
      if (num >= 1000 && num <= 99999) {
        // 날짜 패턴 제외 (예: 1117, 1214 등 4자리 숫자는 날짜일 가능성)
        const isLikelyDate = num >= 101 && num <= 1231 && num.toString().length === 4;
        if (!isLikelyDate) {
          hasClearPrice = true;
        }
      }
    }
  }
  // 1. 판매 관련 핵심 키워드 확인 (공구는 별도 처리)
  const salesKeywords = [
    "주문",
    "예약",
    "판매",
    "가격",
    "특가",
    "할인",
    "만원",
    "천원",
    "원",
    "냥",
    "₩"
  ];
  let hasSalesKeyword = false;
  for (const keyword of salesKeywords){
    if (lowerContent.includes(keyword.toLowerCase())) {
      hasSalesKeyword = true;
      break;
    }
  }
  // 🔥 수정: 공구 키워드는 가격과 함께 있을 때만 유효
  if (lowerContent.includes("공구")) {
    // 공구 키워드가 있어도 가격이 없으면 무시
    if (hasClearPrice) {
      hasSalesKeyword = true;
    }
  }
  // 판매 키워드가 전혀 없으면 false 반환
  if (!hasSalesKeyword) {
    // console.log("[Debug] 판매 키워드가 없음, 상품 아님으로 판단");
    return false;
  }
  // 2. 가격 단위(원)가 명시되지 않았으면 false
  if (!hasClearPrice) {
    // console.log("[Debug] 가격 단위(원) 명시 없음, 상품 아님으로 판단");
    return false;
  }
  // 3. 공지사항 패턴 체크 (매우 명확한 경우만)
  const noticePatterns = [
    // 🔥 매장 운영 공지
    /평일.*오후\d+시.*마감/,
    /영업시간.*마감/,
    /일요일\s*휴무/,
    /휴무일/,
    // 🔥 다중 상품 도착 목록 (번호 + 상품명 + 도착)
    /\d+\.\s*[가-힣\w\s]+👉.*도착/,
    /^\d+[\.\)]\s*[가-힣\w\s]+.*👉.*도착/m,
    // 🔥 예상수령시간/당일수령 원칙
    /예상수령시간.*\d+시/,
    /당일수령.*원칙/,
    /꼭.*꼭.*도착공지.*보시고/,
    // 🔥 안내 메시지
    /준비시간이.*길어지고/,
    /수령.*부탁드려요/,
    /깜빡하고.*잊으신.*물건/,
    /아래.*사진.*클릭.*주문/,
    /예약.*마감.*수령/,
    // 🔥 예약 공구상품 목록 (체크박스 + 다중 링크)
    /✅️.*공구상품/,
    /\[.*월.*일.*\].*도착.*공구상품/,
    /월요일.*예약.*마감.*요일.*수령/,
    // 🔥 URL 링크가 3개 이상 있는 공지
    /https?:\/\/[^\s]+.*https?:\/\/[^\s]+.*https?:\/\/[^\s]+/s,
    // 🔥 추가: 상품 리스트만 나열된 패턴
    /🔸️.*\n🔸️.*\n🔸️/,
    /✡️.*도착했습니다.*\n🔸️/,
    /모두 매장에.*도착했습니다/,
    /당일수령.*부탁/,
    /공구상품.*도착했습니다/,
    /오늘 공구상품.*매장에.*도착/ // 오늘 공구상품 도착
  ];
  // 패턴 매치 개수 확인 (여러 패턴이 매치되면 공지사항 가능성 높음)
  let matchedPatterns = 0;
  for (const pattern of noticePatterns){
    if (pattern.test(content)) {
      matchedPatterns++;
    }
  }
  // 🔥 [수정] 구체적인 상품 판매 요소가 있으면 공지사항 패턴 무시
  const orderPatterns = [
    "주문은 댓글로",
    "주문은댓글로",
    "주문댓글로",
    "예약은 댓글로",
    "예약은댓글로",
    "예약댓글로",
    "주문은 댓글",
    "예약은 댓글",
    "댓글로 주문",
    "댓글로 예약",
    "댓글주문",
    "댓글예약"
  ];
  const hasOrderInstruction = orderPatterns.some((pattern)=>content.includes(pattern));

  // 🔥 [개선] 확장된 가격 패턴으로 구체적인 상품 판별
  const hasConcreteProduct =
    priceWithUnitRegex.test(cleanedContent) || // 단위 있는 가격
    commaNumberRegex.test(cleanedContent) || // 쉼표 구분자
    dotNumberRegex.test(cleanedContent) || // 마침표 오타
    priceKeywordPatterns.some(pattern => pattern.test(cleanedContent)) || // 가격 키워드 근처 숫자
    hasOrderInstruction ||
    /\[.*\]\s*✔.*\d/.test(content); // "[1팩 300g] ✔6,500" 형태 (단위 선택적)
  // 구체적인 상품 정보가 있으면 공지사항 패턴을 무시하고 상품으로 분류
  if (hasConcreteProduct) {
    return true;
  }
  // 🔥 수정: 가격 정보가 명확히 없거나 공지사항 패턴이 있으면 false
  if (!hasClearPrice && matchedPatterns >= 1) {
    // console.log("[Debug] 가격 정보 없고 공지사항 패턴 감지, 상품 아님으로 판단");
    return false;
  }
  // 구체적인 상품 정보가 없고 2개 이상 공지사항 패턴이 매치되면 공지사항으로 판단
  if (matchedPatterns >= 2) {
    // console.log("[Debug] 공지사항 패턴 다수 감지, 상품 아님으로 판단");
    return false;
  }
  // 4. 🔥 [추가] 상품명만 나열된 경우 감지 (🔸 기호로 시작하는 목록만 있고 가격 없는 경우)
  const listPatternMatch = content.match(/🔸[^\n]*\n/g);
  if (listPatternMatch && listPatternMatch.length >= 3) {
    // 🔸 기호가 3개 이상 있는 리스트 형태
    if (!hasClearPrice) {
      // 가격 정보는 없고 리스트만 있는 경우
      // console.log("[Debug] 상품 리스트만 있고 가격 없음, 공지성 게시물로 판단");
      return false;
    }
  }
  // console.log("[Debug] 최종 판단: 상품 게시물");
  return true; // 판매 키워드 O, 100 이상의 가격 숫자 O, (선택적으로) 도착 안내 패턴 아님
}
