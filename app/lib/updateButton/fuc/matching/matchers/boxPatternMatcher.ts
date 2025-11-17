/**
 * 박스 패턴 매처
 * SIZE_VARIANT 패턴 전용 - "반박스", "1박스", "세트" 상품 처리
 */ export class BoxPatternMatcher {
  /**
   * 박스/단위 패턴 키워드 (SIZE_VARIANT 전체 처리)
   */ static BOX_KEYWORDS = {
    HALF: [
      '반박스',
      '반상자',
      '반개',
      '하프박스',
      '하프상자'
    ],
    FULL: [
      '박스',
      '상자',
      '통',
      'box'
    ],
    SET: [
      '세트',
      '셋',
      'set'
    ],
    UNIT: [
      '송이',
      '마리',
      '근',
      '병',
      '캔',
      '봉지',
      '포',
      '장',
      '묶음',
      '단',
      '줄',
      '알',
      '입',
      '잔',
      '토막',
      '쪽',
      '망'
    ] // SIZE_VARIANT 단위 확장
  };
  /**
   * 메인 매칭 함수
   */ static match(comment, productMap) {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    // 박스 상품이 있는지 먼저 확인
    if (!this.hasBoxProducts(productMap)) {
      return null;
    }
    // 주문 패턴을 먼저 추출 (예: "1박스요" 부분만)
    // "1박스요 25000맞나요" → "1박스요" 추출
    const orderPattern = this.extractOrderPattern(comment);
    const normalized = this.normalizeComment(orderPattern || comment);
    // 1. "반" 키워드 처리 (최우선)
    const halfResult = this.handleHalfBox(normalized, productMap);
    if (halfResult) {
      return halfResult;
    }
    // 2. 상품 번호 패턴 처리 ("1번", "2번" - 명시적)
    const identifierResult = this.handleProductIdentifier(normalized, productMap);
    if (identifierResult) {
      return identifierResult;
    }
    // 3. 사양 패턴 처리 ("3수", "4수" - 직접 지정)
    const specificationResult = this.handleSpecificationPattern(normalized, productMap);
    if (specificationResult) {
      return specificationResult;
    }
    // 4. 세트 상품 처리
    const setResult = this.handleSetProduct(normalized, productMap);
    if (setResult) {
      return setResult;
    }
    // 5. 명시적 박스 키워드 처리 ("1박스", "2박스" 등)
    const explicitBoxResult = this.handleExplicitBox(normalized, productMap);
    if (explicitBoxResult) {
      return explicitBoxResult;
    }
    // 6. 다양한 단위 처리 ("2송이", "3마리", "5근" 등)
    const unitResult = this.handleUnitPattern(normalized, productMap);
    if (unitResult) {
      return unitResult;
    }
    // 7. 단순 숫자 → 박스 변환 (가장 모호함)
    const numberResult = this.processNumber(normalized, productMap);
    if (numberResult) {
      return numberResult;
    }
    return null;
  }
  /**
   * SIZE_VARIANT 상품 존재 여부 확인 (박스 + 다양한 단위)
   */ static hasBoxProducts(productMap) {
    return Array.from(productMap.values()).some((product)=>{
      const title = (product.title || product.name || '').toLowerCase();
      return this.isBoxProduct(title) || this.hasUnitKeyword(title);
    });
  }
  /**
   * 박스 상품인지 판별
   */ static isBoxProduct(title) {
    const allBoxKeywords = [
      ...this.BOX_KEYWORDS.HALF,
      ...this.BOX_KEYWORDS.FULL,
      ...this.BOX_KEYWORDS.SET
    ];
    return allBoxKeywords.some((keyword)=>title.includes(keyword.toLowerCase()));
  }
  /**
   * 단위 키워드를 가진 상품인지 판별
   */ static hasUnitKeyword(title) {
    return this.BOX_KEYWORDS.UNIT.some((unit)=>title.includes(unit));
  }
  /**
   * "반" 키워드 처리
   */ static handleHalfBox(normalized, productMap) {
    // "반", "반박스", "반상자" 등 감지 + 어미 포함
    const halfPatterns = [
      /^반(요|여|욧|였)?$/,
      /^반박스(요|여|욧|였)?$/,
      /^반상자(요|여|욧|였)?$/,
      /^반개(요|여|욧|였)?$/,
      /^하프박스(요|여|욧|였)?$/,
      /^하프상자(요|여|욧|였)?$/,
      /^반\s*(\d+)(요|여|욧|였)?$/,
      /^반박스\s*(\d+)(요|여|욧|였)?$/,
      /^반상자\s*(\d+)(요|여|욧|였)?$/ // "반상자 2", "반상자2", "반상자2요"
    ];
    for (const pattern of halfPatterns){
      const match = normalized.match(pattern);
      if (match) {
        // 수량 추출 (기본값: 1)
        // match[1]이 숫자인 경우만 수량으로 사용
        let quantity = 1;
        if (match[1] && /^\d+$/.test(match[1])) {
          quantity = parseInt(match[1]);
        }
        // 반박스 상품 찾기
        const halfBoxProduct = this.findHalfBoxProduct(productMap);
        if (halfBoxProduct) {
          return {
            isOrder: true,
            quantity,
            productItemNumber: halfBoxProduct.itemNumber,
            confidence: 0.95,
            matchMethod: 'half-box',
            boxType: 'half',
            debugInfo: {
              originalComment: normalized,
              pattern: pattern.source,
              quantity,
              matchedProduct: halfBoxProduct
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 반박스 상품 찾기
   */ static findHalfBoxProduct(productMap) {
    for (const [itemNumber, product] of productMap){
      const title = (product.title || product.name || '').toLowerCase();
      // 반박스 키워드 확인
      const isHalfBox = this.BOX_KEYWORDS.HALF.some((keyword)=>title.includes(keyword.toLowerCase()));
      if (isHalfBox) {
        return {
          ...product,
          itemNumber
        };
      }
    }
    return null;
  }
  /**
   * 상품 번호 패턴 처리 - 사양과 수량 구분하는 스마트한 방식
   * 예: "1번 4수" → 1번 상품의 4수 사양, 수량 1
   * 예: "2번 1박스" → 2번 상품, 수량 1
   * 예: "1번 2" → 1번 상품, 수량 2
   */ static handleProductIdentifier(normalized, productMap) {
    // "N번"으로 시작하는 패턴 - 사양과 수량을 구분하는 스마트한 방식
    const simplePattern = /^(\d+)번/;
    const match = normalized.match(simplePattern);
    if (match) {
      const productOrder = parseInt(match[1]); // 상품 번호 (1, 2, 3...)
      // "번" 이후 텍스트 분석
      const afterBun = normalized.slice(match[0].length).trim();
      // 수량 결정 로직 개선 - 사양과 수량을 구분
      let quantity = 1; // 기본값
      // 1. "수"가 포함된 경우 - 사양 지정이므로 수량은 뒤에 오는 숫자나 기본값 1
      if (afterBun.match(/^\d+수/)) {
        // "1번 4수" 형태 - 4수는 사양, 수량은 그 뒤의 숫자나 1
        const afterSpec = afterBun.replace(/^\d+수/, '').trim();
        const qtyMatch = afterSpec.match(/\d+/);
        quantity = qtyMatch ? parseInt(qtyMatch[0]) : 1;
      } else if (afterBun.match(/^(\d+)\s*(박스|상자|개)/)) {
        const unitMatch = afterBun.match(/^(\d+)/);
        quantity = unitMatch ? parseInt(unitMatch[1]) : 1;
      } else if (afterBun.match(/^\d+$/)) {
        quantity = parseInt(afterBun);
      }
      // 4. "번" 뒤에 아무것도 없거나 다른 텍스트만 있으면 수량 1
      // 순서에 해당하는 박스 상품 찾기
      const identifiedProduct = this.findProductByOrder(productMap, productOrder);
      if (identifiedProduct) {
        return {
          isOrder: true,
          quantity,
          productItemNumber: identifiedProduct.itemNumber,
          confidence: 0.95,
          matchMethod: 'product-identifier',
          boxType: 'full',
          debugInfo: {
            originalComment: normalized,
            pattern: 'N번 패턴 (사양/수량 구분)',
            productOrder,
            quantity,
            afterBun,
            quantityLogic: afterBun.match(/^\d+수/) ? '사양 지정' : afterBun.match(/^(\d+)\s*(박스|상자|개)/) ? '단위 수량' : afterBun.match(/^\d+$/) ? '단순 수량' : '기본값',
            matchedProduct: identifiedProduct
          }
        };
      }
    }
    return null;
  }
  /**
   * 순서에 따른 박스 상품 찾기
   */ static findProductByOrder(productMap, order) {
    // 박스 상품들만 필터링하고 itemNumber 순으로 정렬
    const boxProducts = Array.from(productMap.entries()).map(([itemNumber, product])=>({
        ...product,
        itemNumber
      })).filter((product)=>{
      const title = (product.title || product.name || '').toLowerCase();
      return this.isBoxProduct(title);
    }).sort((a, b)=>a.itemNumber - b.itemNumber);
    // 순서에 해당하는 상품 반환 (1번 = index 0, 2번 = index 1)
    const targetIndex = order - 1;
    return targetIndex >= 0 && targetIndex < boxProducts.length ? boxProducts[targetIndex] : null;
  }
  /**
   * 세트 상품 처리
   */ static handleSetProduct(normalized, productMap) {
    // "1세트", "2세트", "세트", "셋" 등
    const setPatterns = [
      /^(\d+)\s*세트$/,
      /^(\d+)\s*셋$/,
      /^세트\s*(\d+)?$/,
      /^셋\s*(\d+)?$/ // "셋", "셋2"
    ];
    for (const pattern of setPatterns){
      const match = normalized.match(pattern);
      if (match) {
        // 수량 추출
        const quantity = match[1] ? parseInt(match[1]) : match[2] ? parseInt(match[2]) : 1;
        // 세트 상품 찾기
        const setProduct = this.findSetProduct(productMap);
        if (setProduct) {
          return {
            isOrder: true,
            quantity,
            productItemNumber: setProduct.itemNumber,
            confidence: 0.9,
            matchMethod: 'set-product',
            boxType: 'set',
            debugInfo: {
              originalComment: normalized,
              pattern: pattern.source,
              quantity,
              matchedProduct: setProduct
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 세트 상품 찾기
   */ static findSetProduct(productMap) {
    for (const [itemNumber, product] of productMap){
      const title = (product.title || product.name || '').toLowerCase();
      // 세트 키워드 확인
      const isSetProduct = this.BOX_KEYWORDS.SET.some((keyword)=>title.includes(keyword.toLowerCase()));
      if (isSetProduct) {
        return {
          ...product,
          itemNumber
        };
      }
    }
    return null;
  }
  /**
   * 다양한 단위 처리 ("2송이", "3마리", "5근" 등)
   * SIZE_VARIANT의 다양한 단위를 BoxPatternMatcher에서 처리
   */ static handleUnitPattern(normalized, productMap) {
    // "숫자+단위" 패턴 매칭
    const unitPattern = /^(\d+)\s*(송이|마리|근|병|캔|봉지|포|장|묶음|단|줄|알|입|잔|토막|쪽|망)(\s*이?\s*요?)?$/;
    const match = normalized.match(unitPattern);
    if (match) {
      let quantity = parseInt(match[1]);
      const unit = match[2];
      const commentPattern = `${quantity}${unit}`;
      console.log(`[BoxPatternMatcher] 단위 패턴 감지: ${commentPattern}`);
      // 해당 단위를 가진 상품 찾기
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(unit)) {
          // 상품명에 댓글과 동일한 "숫자+단위" 패턴이 포함되어 있는지 확인
          const isProductSpecification = title.includes(commentPattern.toLowerCase());
          if (isProductSpecification) {
            // 상품 지정으로 간주하고 수량을 1로 설정
            quantity = 1;
            console.log(`[BoxPatternMatcher] 상품 지정 감지: ${title} → quantity=1`);
          } else {
            console.log(`[BoxPatternMatcher] 수량 지정 감지: ${title} → quantity=${quantity}`);
          }
          console.log(`[BoxPatternMatcher] 단위 매칭 성공: ${title} (${unit})`);
          return {
            isOrder: true,
            quantity,
            productItemNumber: itemNumber,
            confidence: 0.95,
            matchMethod: 'unit-pattern',
            boxType: 'full',
            debugInfo: {
              originalComment: normalized,
              pattern: 'unit-pattern',
              quantity,
              unit,
              commentPattern,
              isProductSpecification,
              matchedProduct: product
            }
          };
        }
      }
      console.log(`[BoxPatternMatcher] 단위 매칭 실패: ${unit} 단위를 가진 상품 없음`);
    }
    return null;
  }
  /**
   * 사양 패턴 처리 ("3수", "4수")
   */ static handleSpecificationPattern(normalized, productMap) {
    // "3수", "4수", "3수1", "4수 1박스" 패턴
    const specificationPatterns = [
      /^(\d+)수\s*(\d*)$/,
      /^(\d+)수\s*(\d*)\s*박스$/
    ];
    for (const pattern of specificationPatterns){
      const match = normalized.match(pattern);
      if (match) {
        const specification = match[1]; // "3", "4"
        const quantity = match[2] ? parseInt(match[2]) : 1;
        // 해당 사양의 박스 상품 찾기
        const specProduct = this.findProductBySpecification(productMap, specification);
        if (specProduct) {
          return {
            isOrder: true,
            quantity,
            productItemNumber: specProduct.itemNumber,
            confidence: 0.91,
            matchMethod: 'specification-pattern',
            boxType: 'full',
            debugInfo: {
              originalComment: normalized,
              pattern: pattern.source,
              specification: specification + '수',
              quantity,
              matchedProduct: specProduct
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 사양에 따른 박스 상품 찾기
   */ static findProductBySpecification(productMap, specification) {
    for (const [itemNumber, product] of productMap){
      const title = (product.title || product.name || '').toLowerCase();
      // 박스 상품인지 확인
      if (!this.isBoxProduct(title)) {
        continue;
      }
      // 해당 사양이 상품명에 포함되어 있는지 확인
      // 예: "샤인머스켓 1박스(4수)" → "4수" 매칭
      if (title.includes(`(${specification}수)`) || title.includes(`${specification}수)`) || title.includes(`${specification}수 `) || title.includes(` ${specification}수`)) {
        return {
          ...product,
          itemNumber
        };
      }
    }
    return null;
  }
  /**
   * 명시적 박스 키워드 처리
   */ static handleExplicitBox(normalized, productMap) {
    // "1박스", "2박스", "한박스", "두박스" 등 + 어미 포함
    const explicitBoxPatterns = [
      /^(\d+)\s*박스(요|여|욧|였)?$/,
      /^(\d+)\s*박(요|여|욧|였)?$/,
      /^(\d+)\s*상자(요|여|욧|였)?$/,
      /^(한|두|세|네|다섯)\s*박스(요|여|욧|였)?$/,
      /^(한|두|세|네|다섯)\s*박(요|여|욧|였)?$/,
      /^(한|두|세|네|다섯)\s*상자(요|여|욧|였)?$/,
      /^박스\s*(\d+)(요|여|욧|였)?$/,
      /^박\s*(\d+)(요|여|욧|였)?$/,
      /^상자\s*(\d+)(요|여|욧|였)?$/ // "상자1", "상자2", "상자1요"
    ];
    // 한글 숫자 매핑
    const koreanNumbers = {
      '한': 1,
      '두': 2,
      '세': 3,
      '네': 4,
      '다섯': 5
    };
    for (const pattern of explicitBoxPatterns){
      const match = normalized.match(pattern);
      if (match) {
        let quantity = 1;
        // 수량 결정
        if (match[1]) {
          if (koreanNumbers[match[1]]) {
            quantity = koreanNumbers[match[1]];
          } else {
            quantity = parseInt(match[1]);
          }
        } else if (match[2]) {
          quantity = parseInt(match[2]);
        }
        // 풀박스 상품 찾기 (반박스 제외)
        const fullBoxProduct = this.findFullBoxProduct(productMap);
        if (fullBoxProduct) {
          return {
            isOrder: true,
            quantity,
            productItemNumber: fullBoxProduct.itemNumber,
            confidence: 0.92,
            matchMethod: 'explicit-box',
            boxType: 'full',
            debugInfo: {
              originalComment: normalized,
              pattern: pattern.source,
              quantity,
              matchedProduct: fullBoxProduct
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 풀박스 상품 찾기 (반박스 제외)
   */ static findFullBoxProduct(productMap) {
    for (const [itemNumber, product] of productMap){
      const title = (product.title || product.name || '').toLowerCase();
      // 반박스가 아닌 박스 상품 확인
      const isHalfBox = this.BOX_KEYWORDS.HALF.some((keyword)=>title.includes(keyword.toLowerCase()));
      const isFullBox = this.BOX_KEYWORDS.FULL.some((keyword)=>title.includes(keyword.toLowerCase()));
      if (isFullBox && !isHalfBox) {
        return {
          ...product,
          itemNumber
        };
      }
    }
    return null;
  }
  /**
   * 단순 숫자 → 박스 변환
   */ static processNumber(normalized, productMap) {
    // 단순 숫자 패턴 ("1", "2", "3")
    const numberMatch = normalized.match(/^(\d+)$/);
    if (numberMatch) {
      const quantity = parseInt(numberMatch[1]);
      // 1-10 범위의 합리적인 수량인지 확인
      if (quantity >= 1 && quantity <= 10) {
        // 풀박스 상품 우선 선택
        const fullBoxProduct = this.findFullBoxProduct(productMap);
        if (fullBoxProduct) {
          return {
            isOrder: true,
            quantity,
            productItemNumber: fullBoxProduct.itemNumber,
            confidence: 0.8,
            matchMethod: 'number-to-box',
            boxType: 'full',
            debugInfo: {
              originalComment: normalized,
              pattern: 'simple_number',
              quantity,
              matchedProduct: fullBoxProduct,
              reasoning: '단순 숫자 → 박스 상품 매칭'
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 주문 패턴 추출
   * "1박스요 25000맞나요" → "1박스요"
   * "2박스 가격이 얼마인가요" → "2박스"
   */ static extractOrderPattern(comment) {
    // 박스 관련 패턴을 찾아서 추출
    // 숫자+박스/박+어미 패턴
    const patterns = [
      /(\d+\s*박스(요|여|욧|였)?)/,
      /(\d+\s*박(요|여|욧|였)?)/,
      /(반\s*박스(요|여|욧|였)?)/,
      /(반박스(요|여|욧|였)?)/,
      /(\d+\s*상자(요|여|욧|였)?)/,
      /(한|두|세|네|다섯)\s*박스(요|여|욧|였)?/
    ];
    for (const pattern of patterns){
      const match = comment.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }
  /**
   * 댓글 정규화
   */ static normalizeComment(comment) {
    // 멀티라인 댓글에서 마지막 줄만 추출 (주문은 보통 마지막 줄에 있음)
    const lines = comment.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    return lastLine.trim().toLowerCase().replace(/\s+/g, ' ') // 연속 공백 제거
    .replace(/[~!@#$%^&*()_+=\-`{}\[\]:;"'<>,.?\/\\|♡♥★☆○●◎◇◆□■△▲▽▼※₩]+/g, '') // 특수문자 제거
    .replace(/[ㅋㅎㅜㅠㅡ]+/g, '') // 자음/모음 제거
    .replace(/(요|해요|주세요|줘|해줘)$/g, '') // 일반적인 어미 제거
    .trim();
  }
  /**
   * 박스 패턴 빠른 체크
   */ static isBoxPattern(comment) {
    const normalized = this.normalizeComment(comment);
    // 박스 관련 키워드 체크
    const allKeywords = [
      ...this.BOX_KEYWORDS.HALF,
      ...this.BOX_KEYWORDS.FULL,
      ...this.BOX_KEYWORDS.SET
    ];
    for (const keyword of allKeywords){
      if (normalized.includes(keyword.toLowerCase())) {
        return true;
      }
    }
    // "반" 키워드 체크
    if (normalized.includes('반')) {
      return true;
    }
    // 상품 번호 패턴 체크 ("1번", "2번")
    if (/\d+번/.test(normalized)) {
      return true;
    }
    // 사양 패턴 체크 ("3수", "4수") - 숫자+수 패턴
    if (/\d+수/.test(normalized)) {
      return true;
    }
    // 단순 숫자도 박스 패턴 가능성
    if (/^\d+$/.test(normalized)) {
      return true;
    }
    return false;
  }
  /**
   * 신뢰도 조정
   */ static adjustConfidence(result, productMap) {
    let confidence = result.confidence;
    // 박스 상품 개수에 따른 신뢰도 조정
    if (productMap) {
      const boxProductCount = Array.from(productMap.values()).filter((product)=>{
        const title = (product.title || product.name || '').toLowerCase();
        return this.isBoxProduct(title);
      }).length;
      // 박스 상품이 많을수록 신뢰도 증가
      if (boxProductCount >= 2) {
        confidence = Math.min(1, confidence + 0.05);
      }
    }
    // 명시적인 박스 키워드일수록 높은 신뢰도
    if (result.matchMethod === 'half-box') {
      confidence = Math.max(confidence, 0.95);
    } else if (result.matchMethod === 'explicit-box') {
      confidence = Math.max(confidence, 0.9);
    } else if (result.matchMethod === 'set-product') {
      confidence = Math.max(confidence, 0.88);
    }
    return {
      ...result,
      confidence
    };
  }
}
