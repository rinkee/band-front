// 키워드 기반 매칭 함수

/**
 * 키워드 매칭을 통한 주문 추출
 */
export function extractOrderByKeywordMatching(
  commentText,
  keywordMappings
) {
  if (!commentText || !keywordMappings || Object.keys(keywordMappings).length === 0) {
    return null;
  }

  const text = commentText.toLowerCase().trim();
  const foundOrders = [];

  // 한글+숫자 조합 우선 처리 (예: "신1", "김1", "참외3")
  const koreanNumberPattern = /^([가-힣]+)(\d+)$/;
  const koreanNumberMatch = commentText.trim().match(koreanNumberPattern);
  
  if (koreanNumberMatch) {
    const [, koreanKeyword, numberStr] = koreanNumberMatch;
    const quantity = parseInt(numberStr);
    
    // 전화번호 필터링
    if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"))) {
      // 전화번호로 간주하고 건너뜀
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
            isAmbiguous: false
          });
          return foundOrders;
        }
      }
    }
  }

  // 개선된 키워드 매칭: 우선순위 기반 정렬
  const sortedKeywords = Object.entries(keywordMappings).sort(([a, mappingA], [b, mappingB]) => {
    // 긴 키워드 우선 (더 구체적)
    return (mappingB.priority || b.length) - (mappingA.priority || a.length);
  });

  // 키워드와 수량을 함께 찾는 패턴들
  const patterns = [
    /(\d+)\s*(\S+)/g,
    /(\S+)\s*(\d+)/g
  ];

  for (const [keyword, mapping] of sortedKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      // 키워드 주변에서 수량 찾기
      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(text)) !== null) {
          const [, part1, part2] = match;
          let quantity = 0;
          let foundKeyword = "";
          
          // 숫자가 앞에 있는 경우
          if (!isNaN(parseInt(part1))) {
            quantity = parseInt(part1);
            foundKeyword = part2;
          }
          // 숫자가 뒤에 있는 경우
          else if (!isNaN(parseInt(part2))) {
            quantity = parseInt(part2);
            foundKeyword = part1;
          }
          
          // 키워드 매칭 확인
          if (foundKeyword.toLowerCase().includes(keyword.toLowerCase()) && quantity >= 1 && quantity <= 999) {
            foundOrders.push({
              itemNumber: mapping.productIndex,
              quantity: quantity,
              matchType: "keyword-with-quantity",
              keyword: keyword,
              productType: mapping.productType,
              isAmbiguous: false
            });
            return foundOrders;
          }
        }
      }
      
      // 수량이 없이 키워드만 있는 경우
      if (foundOrders.length === 0) {
        foundOrders.push({
          itemNumber: mapping.productIndex,
          quantity: 1,
          matchType: "keyword-only",
          keyword: keyword,
          productType: mapping.productType,
          isAmbiguous: true
        });
        return foundOrders;
      }
    }
  }

  return foundOrders.length > 0 ? foundOrders : null;
}

/**
 * 김치 상품에 특화된 키워드 매핑 생성
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
    오이소박이김치: ["오이소박이김치", "오이소박이", "소박이", "오이"],
    쪽파김치: ["쪽파김치", "쪽파", "파김치"],
    열무물김치: ["열무물김치", "물김치"],
    동치미: ["동치미"]
  };

  // 각 상품에 대해 키워드 생성
  products.forEach((product, index) => {
    const productIndex = index + 1;
    const productTitle = product.title || "";
    const cleanTitle = productTitle
      .replace(/\[.*?\]/g, "")
      .replace(/\d+kg/gi, "")
      .replace(/\d+키로/gi, "")
      .trim();

    // 특별 규칙에 따른 키워드 추가
    let addedByRule = false;
    for (const [productName, keywords] of Object.entries(productKeywordRules)) {
      if (cleanTitle.includes(productName)) {
        keywords.forEach((keyword) => {
          if (!keywordMappings[keyword]) {
            keywordMappings[keyword] = {
              productIndex,
              productType: productName,
              priority: keyword === productName ? 100 : 50
            };
          }
        });
        addedByRule = true;
        break;
      }
    }

    // 규칙에 없는 경우 기본 키워드 추가
    if (!addedByRule) {
      if (!keywordMappings[cleanTitle]) {
        keywordMappings[cleanTitle] = {
          productIndex,
          productType: cleanTitle,
          priority: 100
        };
      }
    }
  });

  // 충돌 해결: 동일한 키워드가 여러 상품에 매핑된 경우
  const keywordCount = {};
  Object.keys(keywordMappings).forEach((keyword) => {
    keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
  });

  // 중복된 키워드 제거
  const finalKeywordMappings = {};
  for (const [keyword, mapping] of Object.entries(keywordMappings)) {
    if (keywordCount[keyword] === 1) {
      finalKeywordMappings[keyword] = mapping;
    }
  }

  return finalKeywordMappings;
}