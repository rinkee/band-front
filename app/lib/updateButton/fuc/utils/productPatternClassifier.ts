/**
 * 상품 패턴 분류 시스템
 * 상품의 특성을 분석하여 적절한 매칭 전략 결정
 */ export class ProductPatternClassifier {
  /**
   * 상품 맵을 분석하여 패턴 분류
   */ static classify(productMap) {
    if (!productMap || productMap.size === 0) {
      return {
        type: 'SINGLE_PRODUCT',
        unitType: 'piece',
        isNumberMeaningQuantity: true,
        useOptimalPrice: true,
        confidence: 1.0
      };
    }
    if (productMap.size === 1) {
      return {
        type: 'SINGLE_PRODUCT',
        unitType: this.extractUnitType(productMap),
        isNumberMeaningQuantity: true,
        useOptimalPrice: true,
        defaultProductIndex: 1,
        confidence: 1.0
      };
    }
    // 다중 상품 패턴 분석
    const products = Array.from(productMap.values());
    const pattern = this.analyzeMultiProductPattern(products);
    return pattern;
  }
  /**
   * 다중 상품 패턴 분석 (개선된 버전)
   * 상품명이 같고 숫자+단위만 다른 경우를 정확히 구분
   */ static analyzeMultiProductPattern(products) {
    // 1단계: 기본 상품명 추출 (숫자와 크기 관련 단어 제거)
    const baseProductNames = products.map((p)=>{
      const name = p.title || p.name || '';
      // 숫자 제거
      let baseName = name.replace(/\d+/g, '');
      // 크기/단위 관련 단어 제거 (무게 단위 추가)
      baseName = baseName.replace(/박스|반박스|하프|대|중|소|봉|개|팩|통|세트|알|병|마리|줄|입|kg|키로|g/g, '');
      // 공백 정규화
      return baseName.replace(/\s+/g, ' ').trim();
    });
    // 2단계: 기본 상품명이 모두 같은지 확인
    const uniqueBaseNames = new Set(baseProductNames);
    if (uniqueBaseNames.size === 1) {
      // 상품명이 모두 같음 → 숫자+단위만 다름
      console.log(`[ProductPatternClassifier] 동일 상품명 감지: "${baseProductNames[0]}"`);
      // 0단계: 박스 상품 우선 체크
      if (this.hasBoxKeywords(products)) {
        console.log(`[ProductPatternClassifier] BOX_PRODUCTS 감지: 박스/상자 키워드 존재`);
        return {
          type: 'BOX_PRODUCTS',
          unitType: 'box',
          isNumberMeaningQuantity: false,
          useOptimalPrice: false,
          confidence: 0.95
        };
      }
      // 3단계: 단위 정보 분석
      const unitInfo = this.extractUnitInfo(products);
      if (unitInfo.isSameUnit && unitInfo.unit !== 'unknown') {
        // 같은 단위, 다른 숫자 (1봉 vs 4봉, 2알 vs 8알)
        console.log(`[ProductPatternClassifier] QUANTITY_VARIANT 감지: 단위="${unitInfo.unit}", 수량=${Array.from(unitInfo.unitVariations.get(unitInfo.unit) || []).join(', ')}`);
        return {
          type: 'QUANTITY_VARIANT',
          unitType: unitInfo.unit,
          isNumberMeaningQuantity: true,
          useOptimalPrice: true,
          confidence: 0.95
        };
      } else if (this.isSizeKeyword(products)) {
        // 크기 키워드가 있는 경우 (박스/반박스, 대/중/소)
        console.log(`[ProductPatternClassifier] SIZE_VARIANT 감지: 크기 키워드 존재`);
        return {
          type: 'SIZE_VARIANT',
          unitType: 'mixed',
          isNumberMeaningQuantity: false,
          useOptimalPrice: false,
          confidence: 0.9
        };
      } else {
        // 단위가 섞여있거나 명확하지 않은 경우 → SIZE_VARIANT로 처리
        console.log(`[ProductPatternClassifier] SIZE_VARIANT 감지: 다른 단위 또는 불명확`);
        return {
          type: 'SIZE_VARIANT',
          unitType: 'mixed',
          isNumberMeaningQuantity: false,
          useOptimalPrice: false,
          confidence: 0.85
        };
      }
    }
    // 상품명이 다름 → MIXED_PRODUCTS
    console.log(`[ProductPatternClassifier] MIXED_PRODUCTS: 서로 다른 상품`);
    return {
      type: 'MIXED_PRODUCTS',
      unitType: 'mixed',
      isNumberMeaningQuantity: false,
      useOptimalPrice: false,
      confidence: 0.8
    };
  }
  /**
   * 단위 정보 추출 및 분석
   * 동적으로 모든 한글 단위를 감지
   */ static extractUnitInfo(products) {
    const unitMap = new Map();
    for (const product of products){
      const name = product.title || product.name || '';
      // 🔥 복합 단위 패턴 우선 처리: "숫자+세트+숫자+봉지" 
      const compositeSetPattern = /(\d+)세트\s*(\d+)봉지/g;
      const compositeMatch = [
        ...name.matchAll(compositeSetPattern)
      ];
      if (compositeMatch.length > 0) {
        // 복합 패턴에서는 "세트"만 주요 단위로 인식
        for (const match of compositeMatch){
          const setNumber = match[1];
          const unit = '세트';
          if (!unitMap.has(unit)) {
            unitMap.set(unit, []);
          }
          unitMap.get(unit).push(parseInt(setNumber));
          console.log(`[ProductPatternClassifier] 복합 세트 패턴 감지: "${name}" → ${setNumber}세트`);
        }
        continue; // 복합 패턴이 감지되면 일반 패턴 스킵
      }
      // 더 유연한 숫자+단위 패턴 추출 (모든 한글 단위 감지)
      const matches = name.matchAll(/(\d+)([가-힣]+)/g);
      for (const match of matches){
        const numberStr = match[1];
        const unit = match[2];
        // 날짜 패턴 제외 (월, 일로 끝나는 것)
        if (unit === '월' || unit === '일') {
          continue;
        }
        // 박스/반박스 같은 특수 케이스는 제외 (SIZE_VARIANT로 처리)
        // 세트는 QUANTITY_VARIANT 단위로 허용
        if (!unit.includes('박스') && !unit.includes('반')) {
          if (!unitMap.has(unit)) {
            unitMap.set(unit, []);
          }
          unitMap.get(unit).push(parseInt(numberStr));
        }
      }
    }
    // 디버깅 로그 추가
    console.log(`[ProductPatternClassifier] extractUnitInfo - unitMap:`, Array.from(unitMap.entries()).map(([k, v])=>`${k}: [${v.join(', ')}]`).join(', '));
    // 모든 상품이 같은 단위를 사용하는지 확인
    const units = Array.from(unitMap.keys());
    const isSameUnit = units.length === 1;
    // 각 단위별로 서로 다른 숫자가 있는지 확인
    let hasVariation = false;
    for (const numbers of unitMap.values()){
      const uniqueNumbers = new Set(numbers);
      if (uniqueNumbers.size > 1) {
        hasVariation = true;
        break;
      }
    }
    console.log(`[ProductPatternClassifier] extractUnitInfo - units: ${units.join(', ')}, isSameUnit: ${isSameUnit}, hasVariation: ${hasVariation}`);
    return {
      isSameUnit: isSameUnit && hasVariation,
      unit: units[0] || 'unknown',
      unitVariations: unitMap
    };
  }
  /**
   * 박스 키워드 체크 (BoxPattern 전용)
   */ static hasBoxKeywords(products) {
    const boxKeywords = [
      '박스',
      '상자',
      'box'
    ];
    for (const product of products){
      const name = (product.title || product.name || '').toLowerCase();
      for (const keyword of boxKeywords){
        if (name.includes(keyword)) {
          return true;
        }
      }
    }
    return false;
  }
  /**
   * 크기 관련 키워드 체크 (박스 키워드 제외)
   */ static isSizeKeyword(products) {
    const sizeKeywords = [
      '반박스',
      '하프',
      '대',
      '중',
      '소',
      'large',
      'medium',
      'small',
      'big',
      'small',
      'g',
      'kg',
      '키로' // 무게 단위 추가
    ];
    for (const product of products){
      const name = (product.title || product.name || '').toLowerCase();
      for (const keyword of sizeKeywords){
        if (name.includes(keyword)) {
          return true;
        }
      }
    }
    return false;
  }
  /**
   * 단위 타입 추출
   */ static extractUnitType(productMap) {
    const product = productMap.values().next().value;
    if (!product) return 'piece';
    const name = (product.title || product.name || '').toLowerCase();
    // 동적 단위 추출
    const matches = name.match(/\d+([가-힣]+)/);
    if (matches && matches[1]) {
      return matches[1];
    }
    // 영문 단위
    if (name.includes('box')) return 'box';
    if (name.includes('pack')) return 'pack';
    if (name.includes('set')) return 'set';
    if (name.includes('kg')) return 'kg';
    if (name.includes('bundle')) return 'bundle';
    return 'piece';
  }
  /**
   * 댓글과 상품 패턴을 기반으로 매칭 전략 결정
   */ static determineMatchingStrategy(comment, productPattern, productMap) {
    const normalizedComment = comment.toLowerCase().trim();
    // 단순 숫자 댓글인 경우
    if (/^\d+$/.test(normalizedComment)) {
      const number = parseInt(normalizedComment);
      switch(productPattern.type){
        case 'QUANTITY_VARIANT':
          // 동일 상품의 수량 차이: 최적 가격 계산
          return {
            strategy: 'use_optimal_price',
            confidence: 0.95
          };
        case 'SIZE_VARIANT':
          // 크기/단위 차이: 상품 번호 또는 수량
          return {
            strategy: 'use_item_number',
            confidence: 0.9
          };
        case 'BOX_PRODUCTS':
          // 박스/상자 상품: 키워드 매칭
          return {
            strategy: 'use_keyword_matching',
            confidence: 0.95
          };
        case 'SINGLE_PRODUCT':
          // 단일 상품: 숫자는 수량
          return {
            strategy: 'use_first_product',
            confidence: 0.95
          };
        case 'MIXED_PRODUCTS':
          // 다른 상품들: 토큰 매칭으로 최적 상품 선택
          return {
            strategy: 'use_keyword_matching',
            confidence: 0.8
          };
      }
    }
    // 키워드가 포함된 경우
    if (normalizedComment.includes('박스') || normalizedComment.includes('반')) {
      return {
        strategy: 'use_keyword_matching',
        confidence: 0.95
      };
    }
    // 기본값
    return {
      strategy: productPattern.useOptimalPrice ? 'use_optimal_price' : 'use_first_product',
      confidence: 0.7
    };
  }
}
