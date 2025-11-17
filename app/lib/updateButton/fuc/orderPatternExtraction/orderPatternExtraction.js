// 패턴 기반 주문 추출 함수들
// 백업 파일에서 추출한 검증된 패턴 처리 로직
// 스마트 단위 매핑 (유사 단위 그룹핑) - 축약어 지원 강화
export const smartUnitMapping = {
  "개": [
    "개",
    "대",
    "요",
    "요욧",
    "이요",
    "봉",
    "봉지"
  ],
  "대": [
    "개",
    "대",
    "요",
    "봉",
    "봉지"
  ],
  "봉": [
    "봉",
    "봉지",
    "개",
    "대"
  ],
  "봉지": [
    "봉",
    "봉지",
    "개",
    "대"
  ],
  "팩": [
    "팩",
    "pack"
  ],
  "통": [
    "통",
    "tong"
  ],
  "병": [
    "병",
    "본",
    "봉"
  ],
  "상자": [
    "상자",
    "박스",
    "box",
    "박"
  ],
  "박스": [
    "박스",
    "상자",
    "box",
    "박"
  ],
  "박": [
    "박스",
    "상자",
    "box",
    "박"
  ],
  "포": [
    "포",
    "봉"
  ],
  "묶음": [
    "묶음",
    "세트",
    "set",
    "세",
    "셋"
  ],
  "세트": [
    "세트",
    "묶음",
    "set",
    "세",
    "셋"
  ],
  "세": [
    "세트",
    "묶음",
    "set",
    "세",
    "셋"
  ],
  "셋": [
    "세트",
    "묶음",
    "set",
    "세",
    "셋"
  ],
  "킬로": [
    "킬로",
    "키로",
    "kg",
    "k"
  ],
  "키로": [
    "킬로",
    "키로",
    "kg",
    "k"
  ],
  "kg": [
    "킬로",
    "키로",
    "kg",
    "k"
  ],
  "k": [
    "킬로",
    "키로",
    "kg",
    "k"
  ],
  "g": [
    "그람",
    "그램",
    "g"
  ],
  "그람": [
    "그람",
    "그램",
    "g"
  ],
  "그램": [
    "그람",
    "그램",
    "g"
  ],
  "손": [
    "손"
  ],
  "속": [
    "속"
  ],
  "모": [
    "모"
  ],
  "덩이": [
    "덩이",
    "덩어리"
  ],
  "마리": [
    "마리"
  ],
  "알": [
    "알"
  ],
  "판": [
    "판",
    "구",
    "개"
  ]
};

/**
 * 댓글에서 수량을 추출하는 함수
 * @param {string} commentText - 댓글 텍스트
 * @returns {number} - 추출된 수량 (기본값: 1)
 */
export function extractQuantityFromComment(commentText) {
  if (!commentText) return 1;
  console.log(`[extractQuantityFromComment] 입력: "${commentText}"`);

  // 🔥 한글 숫자 정규화 (Enhanced Pattern Matcher와 동일한 로직)
  let normalizedComment = commentText.toLowerCase().trim();

  // 한글 수량 표현 (Enhanced Pattern Matcher와 동일하게 확장)
  const koreanNumbers = {
    // 기본 숫자
    "하나": 1,
    "둘": 2,
    "셋": 3,
    "넷": 4,
    "다섯": 5,
    "여섯": 6,
    "일곱": 7,
    "여덟": 8,
    "아홉": 9,
    "열": 10,
    // 개수 표현
    "한개": 1,
    "두개": 2,
    "세개": 3,
    "네개": 4,
    "다섯개": 5,
    "여섯개": 6,
    "일곱개": 7,
    "여덟개": 8,
    "아홉개": 9,
    "열개": 10,
    // 단위와 결합된 형태 (팩, 박스, 세트 등) - Enhanced Pattern Matcher와 동일
    "한팩": 1,
    "두팩": 2,
    "세팩": 3,
    "네팩": 4,
    "다섯팩": 5,
    "한박스": 1,
    "두박스": 2,
    "세박스": 3,
    "네박스": 4,
    "한세트": 1,
    "두세트": 2,
    "세세트": 3,
    "네세트": 4,
    "한봉": 1,
    "두봉": 2,
    "세봉": 3,
    "네봉": 4,
    "한봉지": 1,
    "두봉지": 2,
    "세봉지": 3,
    "네봉지": 4,
    "다섯봉지": 5,
    "한병": 1,
    "두병": 2,
    "세병": 3,
    "네병": 4,
    "한통": 1,
    "두통": 2,
    "세통": 3,
    "네통": 4,
    // 축약형 (🔥 "세"는 세트 축약어와 혼동되므로 제외)
    "한": 1,
    "두": 2,
    "네": 4,
    // 한자어
    "일": 1,
    "이": 2,
    "삼": 3,
    "사": 4,
    "오": 5,
    "육": 6,
    "칠": 7,
    "팔": 8,
    "구": 9,
    "십": 10
  };

  // 한글 숫자를 아라비아 숫자로 변환 (긴 패턴부터 처리)
  const sortedKoreanNumbers = Object.entries(koreanNumbers).sort((a, b) => b[0].length - a[0].length);
  console.log(`[extractQuantityFromComment] 한글 변환 전: "${normalizedComment}"`);

  sortedKoreanNumbers.forEach(([korean, number]) => {
    // 단위가 포함된 경우 (예: "한팩" → "1팩", "두봉지" → "2봉지")
    if (korean.match(/(팩|박스|세트|봉지|봉|병|통)$/)) {
      const unit = korean.match(/(팩|박스|세트|봉지|봉|병|통)$/)?.[1];
      const regex = new RegExp(korean, 'g');
      const beforeReplace = normalizedComment;
      normalizedComment = normalizedComment.replace(regex, `${number}${unit}`);
      if (beforeReplace !== normalizedComment) {
        console.log(`[extractQuantityFromComment] 한글 변환: "${korean}" → "${number}${unit}" (결과: ${beforeReplace} → ${normalizedComment})`);
      }
    } else {
      const regex = new RegExp(korean, 'g');
      const beforeReplace = normalizedComment;
      normalizedComment = normalizedComment.replace(regex, number.toString());
      if (beforeReplace !== normalizedComment) {
        console.log(`[extractQuantityFromComment] 한글 변환: "${korean}" → "${number}" (결과: ${beforeReplace} → ${normalizedComment})`);
      }
    }
  });

  console.log(`[extractQuantityFromComment] 한글 변환 후: "${normalizedComment}"`);

  // 🔥 수량 패턴들 (상품 사양 단위 제외) - "5키로 한박스요"에서 "5키로"를 수량으로 오인하는 문제 해결
  const quantityPatterns = [
    /(\d+)\s*개\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*봉\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*봉지\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*팩\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*통\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*병\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*상자\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*포\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*묶음\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*세트\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*박스\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    // ❌ 제거: 킬로/키로/kg/k는 상품 무게 사양이므로 주문 수량이 아님
    // "5키로 한박스요"에서 "5키로"를 수량 5로 오인하는 문제 해결
    /(\d+)\s*판\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*구\s*[가-힣]*\s*[.,!?~]*\s*$/gi,
    /(\d+)\s*번\s*[가-힣]*\s*[.,!?~]*\s*$/gi
  ];

  const quantities = [];
  quantityPatterns.forEach((pattern) => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(normalizedComment)) !== null) {
      const quantity = parseInt(match[1]);
      const numberStr = match[1];

      // 전화번호 필터링
      const isPhoneNumber =
        numberStr.length >= 4 || // 4자리 이상
        (numberStr.length >= 3 && numberStr.startsWith("0")) || // 0으로 시작하는 3자리 이상
        (numberStr.length === 3 && /^0[1-9][0-9]$/.test(numberStr)); // 010~099 패턴

      if (quantity >= 1 && quantity <= 999 && !isPhoneNumber) {
        quantities.push(quantity);
      }
    }
  });

  // 단순 숫자 패턴 (다른 패턴에서 찾지 못한 경우)
  if (quantities.length === 0) {
    const simpleNumberPattern = /\b(\d+)\b/g;
    let match;
    while ((match = simpleNumberPattern.exec(normalizedComment)) !== null) {
      const number = parseInt(match[1]);
      const numberStr = match[1];

      const isPhoneNumber =
        numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"));

      if (number >= 1 && number <= 999 && !isPhoneNumber) {
        quantities.push(number);
      }
    }
  }

  // 한글 수량 표현은 이미 위에서 정규화 과정에서 처리됨
  // 정규화된 댓글에서 한글 숫자가 아라비아 숫자로 변환되어 위의 패턴들에서 잡힘

  // 가장 첫 번째 수량 반환 (기본값: 1)
  const finalQuantity = quantities.length > 0 ? quantities[0] : 1;
  console.log(`[extractQuantityFromComment] 최종 추출된 수량: ${finalQuantity} (후보들: [${quantities.join(', ')}])`);
  return finalQuantity;
}

/**
 * 패턴 처리 여부를 결정하는 함수
 */
export function shouldUsePatternProcessing(commentText, productMap) {
  if (!commentText || !productMap || productMap.size === 0) {
    return {
      shouldUsePattern: false,
      reason: "invalid_input"
    };
  }

  // 복잡한 옵션 상품의 무게/용량 단위 체크
  const weightVolumePattern = /(박스|키로|킬로|키로그람|키로그램|킬로그람|킬로그램|kg|k\b|g\b|그람|그램)/i;
  let hasComplexWeightVolumeProduct = false;

  for (const [itemNumber, productInfo] of productMap) {
    const priceOptionsCount = (productInfo.priceOptions?.length || 0) + (productInfo.price_options?.length || 0);
    const hasManyOptions = priceOptionsCount >= 2;
    const hasWeightVolumeUnit = productInfo.quantity_text && weightVolumePattern.test(productInfo.quantity_text);

    if (hasManyOptions && hasWeightVolumeUnit) {
      hasComplexWeightVolumeProduct = true;
      break;
    }
  }

  // 복잡한 옵션 상품이 있으면 AI 처리 우선
  if (hasComplexWeightVolumeProduct) {
    return {
      shouldUsePattern: false,
      reason: "complex_options_product_detected"
    };
  }

  // 전화번호 등 무관한 숫자 제외 후 주문 관련 숫자만 카운트
  const allNumberMatches = [];
  const numberPattern = /\d+/g;
  let match;
  while ((match = numberPattern.exec(commentText)) !== null) {
    const numberStr = match[0];
    // 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주
    if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"))) {
      continue;
    }
    allNumberMatches.push(numberStr);
  }

  // 유효한 주문 관련 숫자 필터링
  const orderRelevantNumbers = allNumberMatches.filter((num) => {
    const n = parseInt(num);
    return n >= 1 && n <= 999;
  });

  // 주문 관련 숫자가 2개 이상이면 AI 처리
  if (orderRelevantNumbers.length >= 2) {
    return {
      shouldUsePattern: false,
      reason: "multiple_order_numbers_detected"
    };
  }

  // 명백한 숫자 체크
  const numberCheckResult = checkNumberPatternOnly(commentText);
  const { number_check, only_numbers } = numberCheckResult;

  // 텍스트 전처리
  const text = commentText
    .toLowerCase()
    .trim()
    .replace(/한통/g, "1통")
    .replace(/한세트/g, "1세트")
    .replace(/한팩/g, "1팩")
    .replace(/한박스/g, "1박스")
    .replace(/한봉지/g, "1봉지")
    .replace(/한개/g, "1개")
    .replace(/두통/g, "2통")
    .replace(/두세트/g, "2세트")
    .replace(/두팩/g, "2팩")
    .replace(/두박스/g, "2박스")
    .replace(/두봉지/g, "2봉지")
    .replace(/두개/g, "2개")
    .replace(/세통/g, "3통")
    .replace(/세박스/g, "3박스")
    .replace(/네통/g, "4통")
    .replace(/네박스/g, "4박스")
    .replace(/ㅣ/g, "1")
    .replace(/[lL]/g, "1")
    .replace(/[iI]/g, "1");

  // quantity_text 체크
  let hasQuantityText = false;
  for (const [itemNumber, productInfo] of productMap) {
    if (productInfo.quantity_text && productInfo.quantity_text.trim()) {
      const quantityText = productInfo.quantity_text.toLowerCase();
      if (text.includes(quantityText)) {
        hasQuantityText = true;
        break;
      }

      // 스마트 단위 호환성 체크
      const compatibleUnits = smartUnitMapping[quantityText] || [];
      for (const unit of compatibleUnits) {
        if (text.includes(unit)) {
          hasQuantityText = true;
          break;
        }
      }
    }
  }

  // "개" 단위 체크
  const hasGaeUnit = /\d+\s*개/.test(text);

  // 상품명+숫자 패턴 체크
  const productNameNumberPattern = /([가-힣]+)(\d+)/;
  const hasProductNameNumberPattern = productNameNumberPattern.test(text);

  if (hasProductNameNumberPattern) {
    return {
      shouldUsePattern: true,
      reason: "product_name_number_pattern_detected"
    };
  }

  // 결정 로직
  if (number_check && hasQuantityText) {
    return {
      shouldUsePattern: true,
      reason: "clear_number_with_quantity_text"
    };
  } else if (!number_check && hasQuantityText) {
    return {
      shouldUsePattern: false,
      reason: "no_clear_number_but_has_quantity_text"
    };
  } else if (number_check && !hasQuantityText) {
    if (hasGaeUnit) {
      return {
        shouldUsePattern: true,
        reason: "number_with_gae_unit_pattern_capable"
      };
    } else {
      return {
        shouldUsePattern: true,
        reason: "clear_number_only"
      };
    }
  } else {
    return {
      shouldUsePattern: false,
      reason: "no_clear_pattern"
    };
  }
}

/**
 * 숫자 패턴만 체크하는 함수
 */
function checkNumberPatternOnly(commentText) {
  if (!commentText) {
    return {
      number_check: false,
      only_numbers: false,
      valid_numbers: []
    };
  }

  // 특수문자 전처리
  const text = commentText
    .toLowerCase()
    .trim()
    .replace(/ㅣ/g, "1")
    .replace(/[lL]/g, "1")
    .replace(/[iI]/g, "1")
    .replace(/[oO]/g, "0");

  // 모든 숫자 패턴 추출
  const numberMatches = [];
  const numberPattern = /\d+/g;
  let match;
  while ((match = numberPattern.exec(text)) !== null) {
    const numberStr = match[0];

    // 전화번호 필터링
    if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"))) {
      continue;
    }

    if (numberStr.length >= 1 && numberStr.length <= 3) {
      numberMatches.push(numberStr);
    }
  }

  // 유효한 숫자 필터링 (1-999 범위)
  const validNumbers = numberMatches.filter((num) => {
    const n = parseInt(num);
    return n >= 1 && n <= 999;
  });

  // 시간 표현 필터링
  const nonTimeNumbers = validNumbers.filter((num) => {
    const beforeNum = text.indexOf(num) > 0 ? text[text.indexOf(num) - 1] : "";
    const afterNum = text[text.indexOf(num) + num.length] || "";
    const isTimeExpression = afterNum === "시" || beforeNum === ":" || afterNum === ":";
    return !isTimeExpression;
  });

  // 숫자만 있는지 체크
  const onlyNumbersRegex = /^\s*\d+\s*$/;
  const onlyNumbers = onlyNumbersRegex.test(text.trim());

  // 최종 체크
  const numberCheck = nonTimeNumbers.length >= 1;

  return {
    number_check: numberCheck,
    only_numbers: onlyNumbers,
    valid_numbers: nonTimeNumbers
  };
}

// 스마트 단위 호환성 체크 함수
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
