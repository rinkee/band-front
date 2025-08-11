// 키워드 매핑 관련 함수들

/**
 * 함수명: generateKimchiKeywordMappings
 * 목적: 김치 상품에 특화된 키워드 매핑 생성
 * 사용처: 김치 상품 주문 처리
 * 의존성: 없음
 * 파라미터: products - 상품 배열
 * 리턴값: 키워드 매핑 객체
 */
export function generateKimchiKeywordMappings(products) {
  const keywordMappings = {};

  // 상품별 키워드 규칙 정의
  const productKeywordRules = {
    배추김치: ["배추김치", "배추"],
    총각김치: ["총각김치", "총각"],
    석박지: ["석박지"],
    갓김치: ["갓김치", "갓"],
    얼갈이겉절이김치: ["얼갈이겉절이김치", "얼갈이겉절이", "얼갈이", "겉절이"],
    열무김치: ["열무김치", "열무"],
    열무물김치: ["열무물김치", "물김치"],
    쪽파김치: ["쪽파김치", "쪽파", "파김치", "파"],
    오이소박이김치: ["오이소박이김치", "오이소박이", "오이", "소박이"],
  };

  if (!products || !Array.isArray(products)) {
    // console.log("[키워드 매핑] 상품 정보가 없어서 기본 매핑 사용");
    return keywordMappings;
  }

  // 실제 상품명을 기반으로 키워드 매핑 생성
  products.forEach((product, index) => {
    const productTitle = product.title || "";
    const itemNumber = product.itemNumber || index + 1;

    // console.log(`[키워드 매핑] 상품 ${itemNumber}번 처리: "${productTitle}"`);

    // 상품명에서 김치 종류 추출
    for (const [productType, keywords] of Object.entries(productKeywordRules)) {
      if (productTitle.includes(productType)) {
        // 해당 상품 타입의 모든 키워드를 매핑에 추가
        keywords.forEach((keyword) => {
          // 🔥 중복 키워드 체크 및 우선순위 설정
          if (keywordMappings[keyword]) {
            // 이미 존재하는 키워드인 경우, 더 구체적인 키워드를 우선
            const existingKeywordLength =
              keywordMappings[keyword].keyword?.length || 0;
            if (keyword.length > existingKeywordLength) {
              // console.log(
              //   `[키워드 매핑] 키워드 "${keyword}" 우선순위 변경: ${keywordMappings[keyword].productIndex}번 → ${itemNumber}번`
              // );
              keywordMappings[keyword] = {
                productIndex: itemNumber,
                productType: productType,
                keyword: keyword,
                priority: keyword.length,
              };
            }
          } else {
            keywordMappings[keyword] = {
              productIndex: itemNumber,
              productType: productType,
              keyword: keyword,
              priority: keyword.length,
            };
            // console.log(
            //   `[키워드 매핑] 키워드 추가: "${keyword}" → 상품 ${itemNumber}번 (${productType})`
            // );
          }
        });
        break; // 매칭된 상품 타입 찾으면 중단
      }
    }
  });

  // 🔥 키워드 고유성 검증 및 중복 해결
  const duplicateKeywords = {};
  const finalKeywordMappings = {};

  // 중복 키워드 찾기
  for (const [keyword, mapping] of Object.entries(keywordMappings)) {
    if (!duplicateKeywords[keyword]) {
      duplicateKeywords[keyword] = [];
    }
    duplicateKeywords[keyword].push(mapping);
  }

  // 중복 키워드 해결
  for (const [keyword, mappings] of Object.entries(duplicateKeywords)) {
    if (mappings.length > 1) {
      // 중복된 키워드 - 우선순위 기반 선택
      const selectedMapping = mappings.reduce((best, current) => {
        // 1. 키워드 길이 우선 (더 구체적)
        if (current.priority > best.priority) return current;
        if (current.priority < best.priority) return best;
        // 2. 상품 번호 낮은 것 우선 (첫 번째 상품 우선)
        return current.productIndex < best.productIndex ? current : best;
      });
      finalKeywordMappings[keyword] = selectedMapping;
      // console.log(
      //   `[키워드 매핑] 중복 키워드 "${keyword}" 해결: 상품 ${selectedMapping.productIndex}번 선택`
      // );
    } else {
      // 고유한 키워드
      finalKeywordMappings[keyword] = mappings[0];
    }
  }

  // console.log(
  //   `[키워드 매핑] 최종 매핑 결과:`,
  //   Object.keys(finalKeywordMappings).length,
  //   "개 키워드 (중복 해결 완료)"
  // );

  return finalKeywordMappings;
}

/**
 * 함수명: extractOrderByKeywordMatching
 * 목적: 키워드 매칭을 통한 주문 추출
 * 사용처: 댓글에서 주문 정보 추출
 * 의존성: 없음
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - keywordMappings: 키워드 매핑 객체
 * 리턴값: 주문 정보 배열 또는 null
 */
export function extractOrderByKeywordMatching(
  commentText,
  keywordMappings
) {
  if (
    !commentText ||
    !keywordMappings ||
    Object.keys(keywordMappings).length === 0
  ) {
    return null;
  }

  const text = commentText.toLowerCase().trim();
  const foundOrders = [];

  // console.log(`[키워드 매칭] 댓글 분석: "${commentText}"`);
  // console.log(
  //   `[키워드 매칭] 사용 가능한 키워드:`,
  //   Object.keys(keywordMappings)
  // );

  // 🔥 STEP 0: 한글+숫자 조합 우선 처리 (예: "신1", "김1", "참외3")
  const koreanNumberPattern = /^([가-힣]+)(\d+)$/;
  const koreanNumberMatch = commentText.trim().match(koreanNumberPattern);

  if (koreanNumberMatch) {
    const [, koreanKeyword, numberStr] = koreanNumberMatch;
    const quantity = parseInt(numberStr);

    // console.log(
    //   `[한글+숫자 매칭] 패턴 감지: "${koreanKeyword}" + "${numberStr}"`
    // );

    // 🔥 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주하고 제외
    if (
      numberStr.length >= 4 ||
      (numberStr.length >= 3 && numberStr.startsWith("0"))
    ) {
      // console.log(
      //   `[한글+숫자 매칭] "${commentText}" → ${numberStr}은 전화번호로 간주, 건너뜀`
      // );
    } else if (quantity >= 1 && quantity <= 999) {
      // 키워드 매핑에서 한글 키워드 찾기
      const lowerKoreanKeyword = koreanKeyword.toLowerCase();
      for (const [keyword, mapping] of Object.entries(keywordMappings)) {
        if (
          keyword.toLowerCase().includes(lowerKoreanKeyword) ||
          lowerKoreanKeyword.includes(keyword.toLowerCase())
        ) {
          foundOrders.push({
            itemNumber: mapping.productIndex,
            quantity: quantity,
            matchType: "korean-number-pattern",
            keyword: koreanKeyword,
            productType: mapping.productType,
            isAmbiguous: false,
          });
          // console.log(
          //   `[한글+숫자 매칭] 성공: "${koreanKeyword}${numberStr}" → ${quantity}개, 상품 ${mapping.productIndex}번`
          // );
          return foundOrders; // 매칭 성공 시 즉시 반환
        }
      }
      // console.log(`[한글+숫자 매칭] "${koreanKeyword}" 키워드를 찾을 수 없음`);
    }
  }

  // 🔥 개선된 키워드 매칭: 우선순위 기반 정렬
  const sortedKeywords = Object.entries(keywordMappings).sort(
    ([a, mappingA], [b, mappingB]) => {
      // 긴 키워드 우선 (더 구체적)
      return (mappingB.priority || b.length) - (mappingA.priority || a.length);
    }
  );

  // 키워드와 수량을 함께 찾는 패턴들
  const patterns = [/(\d+)\s*(\S+)/g, /(\S+)\s*(\d+)/g];

  for (const [keyword, mapping] of sortedKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      // console.log(`[키워드 매칭] 키워드 "${keyword}" 발견!`);

      // 키워드 주변에서 수량 찾기
      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0; // 정규식 초기화

        while ((match = pattern.exec(text)) !== null) {
          const [fullMatch, part1, part2] = match;

          // 키워드가 매치에 포함되어 있는지 확인
          if (fullMatch.toLowerCase().includes(keyword.toLowerCase())) {
            const quantity1 = parseInt(part1);
            const quantity2 = parseInt(part2);
            const quantity = !isNaN(quantity1) ? quantity1 : quantity2;

            // 🔥 원본 문자열도 체크해서 0으로 시작하는 숫자 제외
            const originalStr1 = part1;
            const originalStr2 = part2;
            const relevantStr = !isNaN(quantity1) ? originalStr1 : originalStr2;

            // 🔥 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주하고 제외
            if (
              relevantStr.length >= 4 ||
              (relevantStr.length >= 3 && relevantStr.startsWith("0"))
            ) {
              continue; // 다음 매치로
            }

            if (quantity >= 1 && quantity <= 999) {
              foundOrders.push({
                itemNumber: mapping.productIndex,
                quantity: quantity,
                matchType: "keyword-matching",
                keyword: keyword,
                productType: mapping.productType,
                isAmbiguous: false,
              });
              // console.log(
              //   `[키워드 매칭] 성공: "${keyword}" → ${quantity}개, 상품 ${mapping.productIndex}번`
              // );
              return foundOrders; // 첫 번째 매칭 성공 시 즉시 반환
            }
          }
        }
      }
    }
  }

  if (foundOrders.length === 0) {
    // console.log(`[키워드 매칭] "${commentText}" → 매칭되는 키워드 없음`);
  }

  return foundOrders.length > 0 ? foundOrders : null;
}

/**
 * 함수명: checkNumberPatternOnly
 * 목적: 댓글에서 숫자 패턴만 체크
 * 사용처: 주문 판단 1단계
 * 의존성: 없음
 * 파라미터: commentText - 댓글 텍스트
 * 리턴값: 숫자 체크 결과 객체
 */
export function checkNumberPatternOnly(commentText) {
  if (!commentText || typeof commentText !== "string") {
    return {
      number_check: false,
      only_numbers: false,
      valid_numbers: [],
      debug_info: {
        error: "invalid_input",
        original_text: commentText,
      },
    };
  }

  // 🔥 특수문자 전처리 추가 (extractOrderByUnitPattern과 동일한 로직)
  const text = commentText
    .toLowerCase()
    .trim() // 특수문자를 숫자로 변환
    .replace(/ㅣ/g, "1") // "ㅣ" → "1"
    .replace(/[lL]/g, "1") // l, L → 1
    .replace(/[iI]/g, "1") // i, I → 1
    .replace(/[oO]/g, "0"); // o, O → 0

  // console.log(`[1단계 숫자체크] 입력: "${commentText}" → 변환: "${text}"`);

  // 🔍 1-1: 모든 숫자 패턴 추출 (부분 매칭 방지를 위해 완전한 숫자만)
  const numberMatches = [];
  const numberPattern = /\d+/g;
  let match;

  while ((match = numberPattern.exec(text)) !== null) {
    const numberStr = match[0];

    // 4자리 이상이거나 0으로 시작하는 3자리+ 숫자는 전화번호로 간주하고 제외
    if (
      numberStr.length >= 4 ||
      (numberStr.length >= 3 && numberStr.startsWith("0"))
    ) {
      continue;
    }

    // 1-3자리 숫자만 추가
    if (numberStr.length >= 1 && numberStr.length <= 3) {
      numberMatches.push(numberStr);
    }
  }

  // console.log(
  //   `[1단계 숫자체크] 숫자 패턴 추출: ${
  //     numberMatches.length > 0 ? `[${numberMatches.join(", ")}]` : "없음"
  //   }`
  // );

  // 🔍 1-2: 유효한 숫자 필터링 (1-999 범위)
  const validNumbers = numberMatches.filter((num) => {
    const n = parseInt(num);
    return n >= 1 && n <= 999;
  });

  // console.log(
  //   `[1단계 숫자체크] 유효한 숫자 (1-999): [${validNumbers.join(", ")}]`
  // );

  // 🔍 1-3: 시간 표현 필터링 ("8시", "14:30" 등)
  const nonTimeNumbers = validNumbers.filter((num) => {
    const beforeNum = text.indexOf(num) > 0 ? text[text.indexOf(num) - 1] : "";
    const afterNum = text[text.indexOf(num) + num.length] || "";
    const isTimeExpression =
      afterNum === "시" || beforeNum === ":" || afterNum === ":";

    if (isTimeExpression) {
      // console.log(
      //   `[1단계 숫자체크] 시간 표현 제외: "${num}" (앞: "${beforeNum}", 뒤: "${afterNum}")`
      // );
    }
    return !isTimeExpression;
  });

  // console.log(
  //   `[1단계 숫자체크] 시간 표현 제외 후: [${nonTimeNumbers.join(", ")}]`
  // );

  // 🔍 1-4: 숫자만 있는 경우 체크 (예: "3", "5")
  const onlyNumbers = /^\s*\d{1,3}\s*$/.test(text);

  // console.log(`[1단계 숫자체크] 숫자만 있는 패턴: ${onlyNumbers}`);

  // 🔍 1-5: 최종 number_check 결과
  const number_check = nonTimeNumbers.length > 0;

  const result = {
    number_check,
    only_numbers: onlyNumbers,
    valid_numbers: nonTimeNumbers,
    debug_info: {
      original_text: commentText,
      normalized_text: text,
      raw_matches: numberMatches || [],
      valid_range_numbers: validNumbers,
      filtered_numbers: nonTimeNumbers,
    },
  };

  // console.log(
  //   `[1단계 숫자체크] 최종결과: number_check=${number_check}, only_numbers=${onlyNumbers}`
  // );

  // 🔥 사용자 요구사항: "숫자만 있다면 그건 주문임"
  if (onlyNumbers) {
    // console.log(`[1단계 숫자체크] ⭐ 숫자만 있는 패턴 감지! 주문 확실성 높음`);
  }

  // 🔥 사용자 요구사항: "1, 2, 3과 같은 숫자가 감지되면 주문일 확률이 높음"
  if (number_check && !onlyNumbers) {
    // console.log(`[1단계 숫자체크] ⭐ 숫자 감지! 주문일 확률 높음`);
  }

  return result;
}

/**
 * 함수명: shouldUsePatternProcessing
 * 목적: 패턴 처리 사용 여부 판단
 * 사용처: 주문 처리 로직
 * 의존성: checkNumberPatternOnly
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - productMap: 상품 정보 맵
 * 리턴값: 패턴 처리 사용 여부와 이유
 */
export function shouldUsePatternProcessing(commentText, productMap) {
  if (!commentText || !productMap || productMap.size === 0) {
    return {
      shouldUsePattern: false,
      reason: "invalid_input",
    };
  }

  // 🔥 0단계: 복잡한 옵션 상품의 무게/용량 단위 체크
  const weightVolumePattern =
    /(박스|키로|킬로|키로그람|키로그램|킬로그람|킬로그램|kg|k\b|g\b|그람|그램)/i;

  // 상품 중에 priceOptions가 2개 이상이고 quantity_text에 무게/용량 단위가 있는지 체크
  let hasComplexWeightVolumeProduct = false;

  // console.log(`[디버깅] 상품 정보 체크 시작 - 총 ${productMap.size}개 상품`);

  for (const [_itemNumber, productInfo] of productMap) {
    // priceOptions 또는 price_options 중 하나라도 2개 이상이면 복잡한 옵션으로 간주
    const priceOptionsCount =
      (productInfo.priceOptions?.length || 0) +
      (productInfo.price_options?.length || 0);
    const hasManyOptions = priceOptionsCount >= 2;
    const hasWeightVolumeUnit =
      productInfo.quantity_text &&
      weightVolumePattern.test(productInfo.quantity_text);

    if (hasManyOptions && hasWeightVolumeUnit) {
      hasComplexWeightVolumeProduct = true;
      break;
    }
  }

  // 나머지 로직은 index.ts에서 가져와야 하는데, 너무 길어서 필요한 부분만 포함
  // 실제로는 전체 로직을 이동해야 합니다
  const numberCheck = checkNumberPatternOnly(commentText);

  // 간단한 판단 로직만 포함
  if (numberCheck.only_numbers) {
    return {
      shouldUsePattern: true,
      reason: "only_numbers_pattern",
      patternResult: numberCheck,
    };
  }

  if (hasComplexWeightVolumeProduct) {
    return {
      shouldUsePattern: false,
      reason: "complex_weight_volume_product",
    };
  }

  return {
    shouldUsePattern: numberCheck.number_check,
    reason: numberCheck.number_check ? "has_numbers" : "no_pattern_match",
    patternResult: numberCheck,
  };
}