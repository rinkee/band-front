// 상품 매칭 핵심 함수들
/**
 * 스마트 단위 매핑 테이블
 * 사용처: extractOrderByUnitPattern
 * 목적: 다양한 단위 표현을 정규화하고 호환성 검사
 */ export const smartUnitMapping = {
  // 기본 단위 + 오타 처리 + 신규 단위 추가
  세트: [
    "세트",
    "셋",
    "섯",
    "셰트",
    "쎗",
    "셌트",
    "팩",
    "묶음",
    "포",
    "꾸러미",
    "개",
    "캔",
    "병",
    "봉지",
    "봉",
    "곽"
  ],
  팩: [
    "팩",
    "팍",
    "퍽",
    "세트",
    "묶음",
    "포",
    "꾸러미",
    "개",
    "봉",
    "캔",
    "곽",
    "봉지"
  ],
  통: [
    "통",
    "개",
    "박스",
    "상자",
    "세트",
    "팩",
    "병",
    "용기"
  ],
  개: [
    "개",
    "갸",
    "깨",
    "통",
    "박스",
    "상자",
    "병",
    "튜브",
    "용기",
    "대",
    "세트",
    "팩",
    "봉지",
    "봉",
    "캔",
    "컵"
  ],
  // 포장 단위들 (상호 호환성 확대)
  봉지: [
    "봉지",
    "봉",
    "팩",
    "포",
    "키로",
    "킬로",
    "kg",
    "Kg",
    "개",
    "박스",
    "상자",
    "세트",
    "그람",
    "g"
  ],
  봉: [
    "봉",
    "봉지",
    "팩",
    "포",
    "개",
    "박스",
    "그람",
    "g",
    "세트"
  ],
  박스: [
    "박스",
    "상자",
    "통",
    "개",
    "봉지",
    "키로",
    "킬로",
    "kg",
    "Kg",
    "세트",
    "곽",
    "망"
  ],
  상자: [
    "상자",
    "박스",
    "통",
    "개",
    "봉지",
    "세트"
  ],
  곽: [
    "곽",
    "박스",
    "상자",
    "팩",
    "세트",
    "개",
    "봉"
  ],
  // 농산물 특수 단위 (새로 추가)
  망: [
    "망",
    "키로",
    "킬로",
    "kg",
    "Kg",
    "개",
    "박스",
    "봉지"
  ],
  // 용기/병 단위
  병: [
    "병",
    "개",
    "용기",
    "세트",
    "팩",
    "캔"
  ],
  캔: [
    "캔",
    "개",
    "세트",
    "팩",
    "병",
    "곽"
  ],
  컵: [
    "컵",
    "개",
    "세트",
    "팩"
  ],
  튜브: [
    "튜브",
    "개",
    "병"
  ],
  용기: [
    "용기",
    "개",
    "병",
    "튜브"
  ],
  // 무게 단위 (대소문자 구분 대응)
  // 🔥 중요: 무게 단위는 수량 단위와 호환되지 않도록 제한
  키로: [
    "키로",
    "킬로",
    "kg",
    "Kg",
    "k"
  ],
  킬로: [
    "킬로",
    "키로",
    "kg",
    "Kg",
    "k"
  ],
  kg: [
    "kg",
    "Kg",
    "키로",
    "킬로",
    "k"
  ],
  Kg: [
    "Kg",
    "kg",
    "키로",
    "킬로",
    "k"
  ],
  k: [
    "k",
    "키로",
    "킬로",
    "kg",
    "Kg"
  ],
  그람: [
    "그람",
    "g"
  ],
  g: [
    "g",
    "그람"
  ],
  // 기타 단위
  묶음: [
    "묶음",
    "세트",
    "팩",
    "포",
    "개",
    "봉"
  ],
  포: [
    "포",
    "팩",
    "봉지",
    "개",
    "봉"
  ],
  꾸러미: [
    "꾸러미",
    "세트",
    "팩",
    "묶음",
    "개"
  ],
  손: [
    "손",
    "속",
    "개"
  ],
  속: [
    "속",
    "손",
    "개"
  ],
  모: [
    "모",
    "개",
    "덩어리"
  ],
  덩어리: [
    "덩어리",
    "모",
    "개"
  ],
  마리: [
    "마리",
    "개"
  ],
  알: [
    "알",
    "개"
  ],
  대: [
    "대",
    "개"
  ],
  구: [
    "구",
    "판",
    "개"
  ],
  판: [
    "판",
    "구",
    "개"
  ]
};
/**
 * 복합 단위 변환 맵
 * "3알(1세트)" 같은 복합 단위 상품을 위한 변환 규칙
 */ const compositeUnitConversion = {
  알: {
    ratio: 3,
    baseUnit: "세트"
  },
  개: {
    ratio: 1,
    baseUnit: "세트"
  }
};
/**
 * 함수명: extractOrderByUnitPattern
 * 목적: 댓글에서 단위 패턴을 기반으로 주문 정보 추출
 * 사용처: processProduct, 주문 처리 로직
 * 의존성: smartUnitMapping
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - productMap: 상품 정보 맵 (itemNumber -> product)
 * 리턴값: 주문 정보 배열 또는 null
 */ export function extractOrderByUnitPattern(commentText, productMap) {
  if (!commentText || !productMap || productMap.size === 0) {
    return null;
  }
  // 텍스트 정규화 (개선 버전)
  const text = commentText.replace(/,/g, "") // 🔥 쉼표 제거
  // 🔥 세트 오타 패턴 먼저 처리
  .replace(/셋트/g, "1세트") // "셋트" → "1세트" (단독 셋트는 1세트로)
  .replace(/세트트/g, "세트") // "세트트" → "세트"
  .replace(/쎄트/g, "세트") // "쎄트" → "세트"
  .replace(/셋뜨/g, "세트") // "셋뜨" → "세트"
  .replace(/세뜨/g, "세트") // "세뜨" → "세트"
  // 🔥 중요: "셋"을 "세트"로 먼저 정규화 (한글 숫자 변환 전에 처리)
  .replace(/(\d+)\s*셋/g, "$1세트") // "2셋" → "2세트"
  .replace(/(\d+)셋/g, "$1세트") // "2셋" → "2세트" (공백 없는 경우)
  // 🔥 한글 숫자+단위 조합 처리 강화
  .replace(/한셋/g, "1세트") // "한셋" → "1세트"
  .replace(/두셋/g, "2세트") // "두셋" → "2세트"
  .replace(/세셋/g, "3세트") // "세셋" → "3세트"
  .replace(/네셋/g, "4세트") // "네셋" → "4세트"
  // 🔥 단독 "셋" 처리 - 컨텍스트 기반 판단
  .replace(/^셋(요|이요)?$/g, (match)=>{
    // 단일 상품이면 "3개"로 해석
    if (productMap && productMap.size === 1) {
      return match.replace(/셋/, "3");
    }
    // 다중 상품이면 "1세트"로 해석
    return match.replace(/셋/, "1세트");
  }).replace(/한통/g, "1통").replace(/한세트/g, "1세트").replace(/한팩/g, "1팩").replace(/한박스/g, "1박스").replace(/한봉지/g, "1봉지").replace(/한개/g, "1개")// 🔥 "한팩요", "한셋트요" 같은 오타/변형 처리
  .replace(/한팩요/g, "1팩") // "한팩요" → "1팩"
  .replace(/한셋트/g, "1세트") // "한셋트" → "1세트"
  .replace(/한셋이/g, "1세트") // "한셋이" → "1세트"
  .replace(/두통/g, "2통").replace(/두세트/g, "2세트").replace(/두팩/g, "2팩").replace(/두박스/g, "2박스").replace(/두봉지/g, "2봉지").replace(/두개/g, "2개").replace(/세통/g, "3통").replace(/세박스/g, "3박스").replace(/세세트/g, "3세트") // "세세트" → "3세트" 추가
  .replace(/네통/g, "4통").replace(/네박스/g, "4박스").replace(/네세트/g, "4세트") // "네세트" → "4세트" 추가
  // 🔥 한글 숫자 변환 (정확한 변환 - "세트"와 "셋" 모두 보호)
  .replace(/한(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "1") // "한봉지" → "1봉지"
  .replace(/두(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "2") // "두봉지" → "2봉지"
  .replace(/세(?!트)(?!셋)(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "3") // "세봉지" → "3봉지" (세트, 셋 제외)
  .replace(/네(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "4") // "네봉지" → "4봉지"
  .replace(/다섯(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "5") // "다섯봉지" → "5봉지"
  // 🔥 특수문자 변환
  .replace(/ㅣ/g, "1") // "ㅣ봉지" → "1봉지"
  .replace(/ㄱ/g, "1") // 혹시 모를 경우
  .replace(/¹/g, "1") // "¹통이요" → "1통이요"
  .replace(/²/g, "2") // 특수문자 2
  .replace(/³/g, "3") // 특수문자 3
  // 🔥 영문자를 숫자로 변환 (사용자가 실수로 입력하는 경우)
  .replace(/[lL]/g, "1") // l, L → 1
  .replace(/[iI]/g, "1") // i, I → 1
  .replace(/[oO]/g, "0") // o, O → 0 (혹시 모를 경우)
  // 🔥 오타 보정
  .replace(/보요/g, "봉") // "1보요" → "1봉"
  .replace(/보지/g, "봉지") // "보지" → "봉지"
  .replace(/박스스/g, "박스") // "박스스" → "박스"
  .replace(/개개/g, "개") // "개개" → "개"
  // 🔥 "박" 줄임말 처리 - "1박", "한박" → "박스"
  .replace(/^(\d+)\s*박$/g, "$1박스") // "1박" → "1박스"
  .replace(/^한\s*박$/g, "1박스") // "한박" → "1박스"
  .replace(/^두\s*박$/g, "2박스") // "두박" → "2박스"
  .replace(/^세\s*박$/g, "3박스") // "세박" → "3박스"
  .replace(/([가-힣])(\d)/g, "$1 $2") // "2세트" -> "2 세트"
  .replace(/(\d)([가-힣])/g, "$1 $2") // "세트2" -> "세트 2"
  .trim().toLowerCase();
  const foundOrders = [];
  // 취소/마감 댓글 체크
  if (text.includes("마감") || text.includes("취소") || text.includes("완판")) {
    return null;
  }
  // 🔥 복합 단위 처리 ("3알(1세트)", "1세트(5개)" 같은 경우)
  // 먼저 모든 상품의 복합 단위 정보를 수집
  for (const [itemNumber, productInfo] of productMap){
    // 🔥 상품명에서 "N알" 패턴 감지 (예: "황도 복숭아 5알")
    const productNameMatch = productInfo.title?.match(/(\d+)\s*알/);
    if (productNameMatch) {
      const alPerSet = parseInt(productNameMatch[1]);
      // "N알이요" 패턴 처리
      const alPattern = /(\d+)\s*알(?:이요|요|입니다|$)/;
      const alMatch = text.match(alPattern);
      if (alMatch) {
        const requestedAl = parseInt(alMatch[1]);
        const setQuantity = Math.ceil(requestedAl / alPerSet);
        console.log(`[상품명 알 단위 변환] "${productInfo.title}" 상품의 "${commentText}" 주문 → ${requestedAl}알 ÷ ${alPerSet}알 = ${setQuantity}세트`);
        foundOrders.push({
          itemNumber: itemNumber,
          quantity: setQuantity,
          matchedUnit: "세트",
          actualUnit: productInfo.quantity_text || "세트",
          matchType: "product-name-al-conversion",
          isAmbiguous: false,
          processingMethod: "product-name-al-pattern",
          originalRequest: `${requestedAl}알`,
          conversionInfo: `${alPerSet}알=1세트`
        });
        return foundOrders.length > 0 ? foundOrders : null;
      }
    }
    // 기존 priceOptions에서 복합 단위 처리
    if (productInfo.priceOptions && productInfo.priceOptions.length > 0) {
      const firstOption = productInfo.priceOptions[0];
      const description = firstOption.description || "";
      // "3알(1세트)" 패턴 감지
      const compositeMatch = description.match(/(\d+)알\s*\(\s*1세트\s*\)/);
      if (compositeMatch) {
        const alPerSet = parseInt(compositeMatch[1]);
        // "N알이요" 패턴 처리
        const alPattern = /(\d+)\s*알(?:이요|요|입니다|$)/;
        const alMatch = text.match(alPattern);
        if (alMatch) {
          const requestedAl = parseInt(alMatch[1]);
          const setQuantity = Math.ceil(requestedAl / alPerSet);
          console.log(`[복합 단위 변환] "${commentText}" → ${requestedAl}알 = ${setQuantity}세트 (${alPerSet}알=1세트)`);
          foundOrders.push({
            itemNumber: itemNumber,
            quantity: setQuantity,
            matchedUnit: "세트",
            actualUnit: productInfo.quantity_text || "세트",
            matchType: "composite-unit-conversion",
            isAmbiguous: false,
            processingMethod: "composite-unit-pattern",
            originalRequest: `${requestedAl}알`,
            conversionInfo: `${alPerSet}알=1세트`
          });
          return foundOrders.length > 0 ? foundOrders : null;
        }
      }
      // 🔥 "1세트(5개)" 패턴 감지 - 세트 안의 개별 단위 처리
      const setWithPiecesMatch = description.match(/(\d+)세트\s*\(\s*(\d+)개\s*\)/);
      if (setWithPiecesMatch) {
        const setsInOption = parseInt(setWithPiecesMatch[1]);
        const piecesPerSet = parseInt(setWithPiecesMatch[2]) / setsInOption; // 1세트당 개수
        // "N개" 또는 "N개요" 패턴 처리
        const piecePattern = /(\d+)\s*개(?:이요|요|입니다|$)?/;
        const pieceMatch = text.match(piecePattern);
        if (pieceMatch) {
          const requestedPieces = parseInt(pieceMatch[1]);
          const setQuantity = Math.ceil(requestedPieces / piecesPerSet);
          console.log(`[세트 개별 단위 변환] "${commentText}" → ${requestedPieces}개 = ${setQuantity}세트 (${piecesPerSet}개=1세트)`);
          foundOrders.push({
            itemNumber: itemNumber,
            quantity: setQuantity,
            matchedUnit: "세트",
            actualUnit: productInfo.quantity_text || "세트",
            matchType: "set-pieces-conversion",
            isAmbiguous: false,
            processingMethod: "set-pieces-pattern",
            originalRequest: `${requestedPieces}개`,
            conversionInfo: `${piecesPerSet}개=1세트`
          });
          return foundOrders.length > 0 ? foundOrders : null;
        }
      }
    }
  }
  // 🔥 스마트 단위 호환성 체크 함수
  function isUnitCompatible(commentUnit, productUnit) {
    if (!commentUnit || !productUnit) return false;
    const commentLower = commentUnit.toLowerCase();
    const productLower = productUnit.toLowerCase();
    // 완전 일치
    if (commentLower === productLower) return true;
    // 댓글 단위가 상품 단위와 호환되는지 체크
    const compatibleUnits = smartUnitMapping[productLower] || [];
    return compatibleUnits.includes(commentLower);
  }
  // 🔥 레거시 호환성을 위한 unitSynonyms 별칭
  const unitSynonyms = smartUnitMapping;
  // 🔥 폴백 패턴 매칭 함수 (관대한 조건으로 재시도)
  function tryFallbackPatternMatching(commentText, productMap) {
    // console.log(`[폴백 매칭] "${commentText}" → 관대한 조건으로 재시도`);
    // 1. 숫자 추출 (더 관대한 범위)
    const numbers = commentText.match(/\d+/g);
    if (!numbers) return null;
    const validNumbers = numbers.map((n)=>parseInt(n)).filter((n)=>n >= 1 && n <= 99); // 더 관대한 범위 (999 → 99)
    if (validNumbers.length === 0) return null;
    // 2. 단위 추출 (더 포괄적, 오타 패턴 포함)
    let foundUnit = null;
    // 모든 단위와 그 유사 단위들을 검사 (오타 처리 포함)
    for (const [baseUnit, variants] of Object.entries(smartUnitMapping)){
      for (const variant of variants){
        if (commentText.toLowerCase().includes(variant)) {
          foundUnit = baseUnit; // 기본 단위로 정규화
          break;
        }
      }
      if (foundUnit) break;
    }
    // 3. 상품과 매칭 (스마트 단위 호환성 사용)
    for (const [itemNumber, productInfo] of productMap){
      const productUnit = productInfo.quantity_text;
      if (foundUnit && isUnitCompatible(foundUnit, productUnit)) {
        // console.log(
        //   `[폴백 매칭 성공] "${commentText}" → ${validNumbers[0]}${foundUnit} (호환: ${productUnit})`
        // );
        return [
          {
            itemNumber: itemNumber,
            quantity: validNumbers[0],
            matchedUnit: foundUnit,
            actualUnit: productUnit,
            matchType: "fallback-unit-compatible",
            isAmbiguous: true,
            processingMethod: "fallback-pattern"
          }
        ];
      }
    }
    // 4. 단위 없이도 매칭 시도 (단일 상품인 경우)
    if (productMap.size === 1 && validNumbers.length === 1) {
      const [itemNumber, productInfo] = Array.from(productMap)[0];
      // console.log(
      //   `[폴백 매칭 성공] "${commentText}" → ${validNumbers[0]}개 (단일상품)`
      // );
      return [
        {
          itemNumber: itemNumber,
          quantity: validNumbers[0],
          matchedUnit: "개",
          actualUnit: productInfo.quantity_text,
          matchType: "fallback-single-product",
          isAmbiguous: true,
          processingMethod: "fallback-pattern"
        }
      ];
    }
    // console.log(`[폴백 매칭 실패] "${commentText}" → 호환 단위 없음`);
    return null;
  }
  // 🔥 0단계: "k" 단위 처리 ("5k주문이요" → "5키로주문이요")
  const kMatch = text.match(/(\d+)\s*k(?:\s*주문)?(?:\s*[이요욧])?/i);
  if (kMatch && kMatch[1]) {
    const numberStr = kMatch[1];
    if (!(numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0"))) {
      const quantity = parseInt(numberStr);
      if (quantity >= 1 && quantity <= 999) {
        // "k" → "키로" 변환하여 다시 처리
        const convertedText = text.replace(/(\d+)\s*k/, `${quantity}키로`);
        console.log(`[k 단위 변환] "${commentText}" → "${convertedText}"`);
        // 키로 단위를 허용하는 상품 찾기
        for (const [itemNumber, productInfo] of productMap){
          const quantityText = productInfo.quantity_text;
          const similarUnits = unitSynonyms[quantityText] || [
            quantityText,
            "개"
          ];
          if (similarUnits.includes("키로") || similarUnits.includes("k")) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: "키로",
              actualUnit: quantityText,
              matchType: "k-unit-conversion",
              isAmbiguous: false,
              processingMethod: "k-unit-pattern"
            });
            console.log(`[k 단위 매칭] "${commentText}" → ${quantity}키로 (실제: ${quantity}${quantityText}, 상품 ${itemNumber}번)`);
            return foundOrders;
          }
        }
      }
    }
  }
  // 🔥 1단계: 보편적 "개", "대", "요" 단위 우선 매칭 (가장 먼저 시도)
  const universalMatch = text.match(/(\d+)\s*(?:개|대|요)(?:\s*[요욧])?/i);
  if (universalMatch && universalMatch[1]) {
    const numberStr = universalMatch[1];
    // 전화번호 필터링
    if (!(numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0"))) {
      const quantity = parseInt(numberStr);
      if (quantity >= 1 && quantity <= 999) {
        console.log(`[우선 개 매칭] "${commentText}" → ${quantity}개 찾음`);
        // 🔥 단일 상품인 경우: 해당 상품에 바로 매칭
        if (productMap.size === 1) {
          const [itemNumber, productInfo] = Array.from(productMap)[0];
          const quantityText = productInfo.quantity_text;
          foundOrders.push({
            itemNumber: itemNumber,
            quantity: quantity,
            matchedUnit: "개",
            actualUnit: quantityText,
            matchType: "universal-unit-priority",
            isAmbiguous: false,
            processingMethod: "universal-unit-pattern"
          });
          console.log(`[우선 개 매칭-단일상품] "${commentText}" → ${quantity}개 (실제: ${quantity}${quantityText}, 상품 ${itemNumber}번)`);
          return foundOrders;
        }
        // 🔥 다중 상품인 경우: "개"를 허용하는 첫 번째 상품에만 매칭
        for (const [itemNumber, productInfo] of productMap){
          const quantityText = productInfo.quantity_text;
          const similarUnits = unitSynonyms[quantityText] || [
            quantityText,
            "개"
          ];
          if (similarUnits.includes("개")) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: "개",
              actualUnit: quantityText,
              matchType: "universal-unit-priority",
              isAmbiguous: productMap.size > 1,
              processingMethod: "universal-unit-pattern"
            });
            console.log(`[우선 개 매칭-다중상품] "${commentText}" → ${quantity}개 (실제: ${quantity}${quantityText}, 상품 ${itemNumber}번)`);
            // 🔥 첫 번째 매칭 성공 시 즉시 반환 (중복 방지)
            return foundOrders;
          }
        }
      }
    }
  }
  // 🔥 2단계: 각 상품의 quantity_text 기반 매칭
  for (const [itemNumber, productInfo] of productMap){
    const quantityText = productInfo.quantity_text;
    if (quantityText) {
      // 현재 상품의 quantityText와 유사한 단위들 가져오기 (위에서 정의된 unitSynonyms 사용)
      const similarUnits = unitSynonyms[quantityText] || [
        quantityText,
        "개"
      ];
      // 2-1: 명시적 단위 매칭 ("2세트", "3팩", "호박 2통이요" 등)
      const unitPatterns = [];
      similarUnits.forEach((unit)=>{
        unitPatterns.push(new RegExp(`(\\d+)\\s*${unit}(?:[가-힣]*)?`, "i"), new RegExp(`${unit}\\s*(\\d+)`, "i") // "팩2", "세트3"
        );
      });
      for(let i = 0; i < unitPatterns.length; i++){
        const pattern = unitPatterns[i];
        const unit = similarUnits[Math.floor(i / 2)];
        const match = text.match(pattern);
        if (match && match[1]) {
          const numberStr = match[1];
          // 전화번호 필터링
          if (numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0")) {
            console.log(`[quantity_text 명시적 매칭] "${commentText}" → ${numberStr}은 전화번호로 간주, 건너뜀`);
            continue;
          }
          const quantity = parseInt(numberStr);
          if (quantity >= 1 && quantity <= 999) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: unit,
              actualUnit: quantityText,
              matchType: "quantity-text-explicit",
              isAmbiguous: false,
              processingMethod: "quantity-text-pattern"
            });
            console.log(`[quantity_text 명시적 매칭] "${commentText}" → ${quantity}${unit} (실제: ${quantity}${quantityText}, 상품 ${itemNumber}번)`);
            return foundOrders;
          }
        }
      }
      // 2-2: 단순 숫자 매칭 ("1", "2", "1요", "2요" 등)
      const simplePatterns = [
        /^\s*(\d+)\s*$/,
        /^\s*(\d+)\s*요\s*$/
      ];
      for (const pattern of simplePatterns){
        const simpleMatch = text.match(pattern);
        if (simpleMatch && simpleMatch[1]) {
          const numberStr = simpleMatch[1];
          // 전화번호 필터링
          if (numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0")) {
            continue;
          }
          const quantity = parseInt(numberStr);
          if (quantity >= 1 && quantity <= 999) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: quantityText,
              matchType: pattern === simplePatterns[0] ? "quantity-text-number-only" : "quantity-text-number-with-yo",
              isAmbiguous: false,
              processingMethod: "quantity-text-pattern"
            });
            // console.log(
            //   `[quantity_text 숫자 매칭] "${commentText}" → ${quantity}${quantityText} (상품 ${itemNumber}번)`
            // );
            return foundOrders;
          }
        }
      }
    }
  }
  // 🔥 2.5단계: 키워드 기반 매칭 강화 ("콩2요", "콩2봉지요" 등)
  for (const [itemNumber, productInfo] of productMap){
    const keywords = productInfo.keywords || [];
    // 키워드 + 숫자 패턴 매칭
    for (const keyword of keywords){
      const keywordPatterns = [
        new RegExp(`${keyword}\\s*(\\d+)(?:\\s*[요욧])?`, "i"),
        new RegExp(`${keyword}\\s*(\\d+)\\s*봉지(?:\\s*[요욧])?`, "i"),
        new RegExp(`${keyword}\\s*(\\d+)\\s*개(?:\\s*[요욧])?`, "i"),
        new RegExp(`${keyword}\\s*(\\d+)\\s*팩(?:\\s*[요욧])?`, "i"),
        new RegExp(`(\\d+)\\s*${keyword}(?:\\s*[요욧])?`, "i")
      ];
      for (const pattern of keywordPatterns){
        const keywordMatch = text.match(pattern);
        if (keywordMatch && keywordMatch[1]) {
          const numberStr = keywordMatch[1];
          if (!(numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0"))) {
            const quantity = parseInt(numberStr);
            if (quantity >= 1 && quantity <= 999) {
              foundOrders.push({
                itemNumber: itemNumber,
                quantity: quantity,
                matchedKeyword: keyword,
                matchedUnit: productInfo.quantity_text || "개",
                matchType: "keyword-with-quantity",
                isAmbiguous: false,
                processingMethod: "keyword-pattern"
              });
              console.log(`[키워드 수량 매칭] "${commentText}" → ${keyword} ${quantity}${productInfo.quantity_text || "개"} (상품 ${itemNumber}번)`);
              return foundOrders;
            }
          }
        }
      }
    }
  }
  // 🔥 3단계: 패키지 옵션 매칭 (모든 상품에 대해)
  for (const [itemNumber, productInfo] of productMap){
    const priceOptions = productInfo.priceOptions || [];
    // 🔥 2단계: 추가 패키지 옵션 매칭 (순수 숫자나 다른 패턴)
    if (priceOptions.length > 0) {
      // "10", "20" 등 순수 숫자나 "10요" 등에서 숫자 추출
      const numberMatch = text.match(/^\s*(\d+)(?:요|개요)?\s*$/);
      if (numberMatch && numberMatch[1]) {
        const numberStr = numberMatch[1];
        // 🔥 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주하고 제외
        if (numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0")) {
          console.log(`[패키지 옵션 매칭] "${commentText}" → ${numberStr}은 전화번호로 간주, 건너뜀 (길이: ${numberStr.length}, 0시작: ${numberStr.startsWith("0")})`);
          continue; // 다음 상품으로
        }
        const mentionedNumber = parseInt(numberStr);
        // 패키지 옵션에서 해당 개수와 일치하는 옵션 찾기
        for (const option of priceOptions){
          // 옵션 설명에서 개수 추출 ("2세트(10개)" → 10)
          const optionMatch = option.description?.match(/(\d+)개/);
          if (optionMatch && parseInt(optionMatch[1]) === mentionedNumber) {
            // 🔥 패키지 옵션에서 실제 세트 수 추출 ("2세트(10개)" → 2)
            const setMatch = option.description?.match(/(\d+)세트/);
            const actualQuantity = setMatch ? parseInt(setMatch[1]) : option.quantity || 1;
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: actualQuantity,
              matchedNumber: mentionedNumber,
              selectedOption: option.description,
              matchType: "package-option",
              isAmbiguous: false,
              processingMethod: "package-option-numeric"
            });
            console.log(`[숫자 패키지 매칭] "${commentText}" → ${option.description} ${actualQuantity}개 주문 (상품 ${itemNumber}번)`);
            return foundOrders; // 성공하면 즉시 반환
          }
        }
      }
    }
  }
  // 🔥 2단계: quantity_text가 없는 상품들에 대한 단순 숫자 매칭
  // "2" 댓글 등을 처리하기 위해 추가
  const simpleNumberMatch = text.match(/^\s*(\d+)\s*$/); // 순수 숫자만
  if (simpleNumberMatch && simpleNumberMatch[1]) {
    const numberStr = simpleNumberMatch[1];
    // 🔥 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주하고 제외
    if (numberStr.length >= 4 || numberStr.length >= 3 && numberStr.startsWith("0")) {
      // console.log(
      //   `[단순 숫자 매칭] "${commentText}" → ${numberStr}은 전화번호로 간주, 패턴 처리 불가 (길이: ${
      //     numberStr.length
      //   }, 0시작: ${numberStr.startsWith("0")})`
      // );
      return null;
    }
    const quantity = parseInt(numberStr);
    if (quantity >= 1 && quantity <= 999) {
      // 첫 번째 상품에 매칭
      const firstItem = productMap.keys().next().value;
      if (firstItem) {
        foundOrders.push({
          itemNumber: firstItem,
          quantity: quantity,
          matchedUnit: "개",
          matchType: "simple-number",
          isAmbiguous: false,
          processingMethod: "simple-number-pattern"
        });
        // console.log(
        //   `[단순 숫자 매칭] "${commentText}" → ${quantity}개 (상품 ${firstItem}번)`
        // );
        return foundOrders;
      }
    }
  }
  // 🔥 기본 패턴 매칭 실패 시 폴백 패턴 매칭 시도
  if (foundOrders.length === 0) {
    const fallbackResult = tryFallbackPatternMatching(commentText, productMap);
    if (fallbackResult) {
      // console.log(`[폴백 패턴 성공] "${commentText}" → 관대한 조건으로 매칭됨`);
      return fallbackResult;
    }
  }
  return foundOrders.length > 0 ? foundOrders : null;
}
