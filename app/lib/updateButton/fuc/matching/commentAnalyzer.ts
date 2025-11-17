/**
 * 댓글 분석 엔진
 * 댓글 내용을 분석하여 패턴을 식별하고 적절한 매처를 선택
 */ export class CommentAnalyzer {
  // 패턴 정의
  static PATTERNS = {
    // 단순 숫자: "1", "2", "3", "10"
    SIMPLE_NUMBER: /^[0-9]+$/,
    // 번호 기반: "1번", "2번 3개", "1번 하나"
    NUMBER_BASED: /(\d+)\s*번/,
    // 수량 표현: "하나", "두개", "세개", "한개"
    KOREAN_QUANTITY: /(하나|둘|셋|한\s*개|두\s*개|세\s*개|한\s*봉지|두\s*봉지)/,
    // 단위 패턴: "1박스", "2봉지", "3개"
    UNIT_PATTERN: /(\d+|한|두|세|네|다섯)\s*(박스|봉지|개|통|팩|세트|묶음|kg|키로|병|알)/,
    // 상품명 포함: "레몬", "사과", "브로컬리"
    PRODUCT_NAME: /[가-힣]+/,
    // 특수 수량: "반박스", "반통"
    SPECIAL_QUANTITY: /반\s*(박스|통|봉지)/,
    // 정중어: "주세요", "부탁드려요", "요"
    POLITE_SUFFIX: /(주세요|부탁|드려요|드립니다|요)$/,
    // 색상 옵션 패턴: "네이비1", "레드2", "블랙 3"
    COLOR_OPTION: /(네이비|레드|블랙|화이트|블루|그린|옐로우|핑크|퍼플|오렌지|브라운|그레이|베이지|아이보리|카키|와인|민트|크림|차콜|실버|골드|navy|red|black|white|blue|green|yellow|pink|purple|orange|brown|gray|grey|beige|ivory|khaki|wine|mint|cream|charcoal|silver|gold)\s*\d+/gi,
    // 🔥 슬래시 구분 패턴: "이름/전화번호/지점/상품수량"
    // 예: "강복순/1226/상무점/꼬막1", "김영희/5678/본점/사과2"
    SLASH_SEPARATED: /^([가-힣]+)\/(\d{3,4})\/([가-힣]+점?)\/([가-힣]+\d*)/,
    // 🔥 상품명+숫자 패턴: "꼬막1", "사과2", "생선3", "간장맛 2"  
    PRODUCT_WITH_NUMBER: /([가-힣]{2,})\s*(\d+)/
  };
  /**
   * 댓글 분석 메인 함수
   */ static analyze(comment: any, productMap: any) {
    const normalized = this.normalizeComment(comment);
    const tokens = this.tokenize(normalized);
    const patterns = this.detectPatterns(normalized);
    const isSingleProduct = this.isSingleProduct(productMap);
    // 패턴 타입 결정
    const type = this.determineType(patterns, normalized);
    // 매처 추천
    const recommendedMatcher = this.recommendMatcher(type, isSingleProduct, patterns, normalized);
    // 신뢰도 계산
    const confidence = this.calculateConfidence(patterns, type);
    // 댓글의 숫자 개수 계산 (전화번호 제외)
    const numberCount = this.countNumbers(comment);
    return {
      type,
      isSingleProduct,
      patterns,
      confidence,
      recommendedMatcher,
      numberCount,
      debugInfo: {
        originalComment: comment,
        normalized,
        tokens,
        patterns
      }
    };
  }
  /**
   * 댓글 정규화
   */ static normalizeComment(comment: string) {
    return comment.trim().toLowerCase().replace(/\s+/g, ' ') // 연속 공백 제거
    .replace(/[.!?]/g, ''); // 구두점 제거 (쉼표는 유지!)
  }
  /**
   * 토큰화
   */ static tokenize(normalized: string) {
    return normalized.split(/\s+/).filter((token)=>token.length > 0);
  }
  /**
   * 패턴 감지
   */ static detectPatterns(normalized: string) {
    const patterns: Array<{
      pattern: string;
      value: string;
      type: string;
      confidence: number;
    }> = [];
    // 단순 숫자 체크 (전체 문자열이 숫자인 경우)
    if (this.PATTERNS.SIMPLE_NUMBER.test(normalized)) {
      patterns.push({
        pattern: 'SIMPLE_NUMBER',
        value: normalized,
        type: 'simple_number',
        confidence: 0.95
      });
    }
    // 번호 기반 패턴
    const numberBasedMatch = normalized.match(this.PATTERNS.NUMBER_BASED);
    if (numberBasedMatch) {
      patterns.push({
        pattern: 'NUMBER_BASED',
        value: numberBasedMatch[0],
        type: 'number_based',
        confidence: 0.9
      });
    }
    // 단위 패턴
    const unitMatch = normalized.match(this.PATTERNS.UNIT_PATTERN);
    if (unitMatch) {
      patterns.push({
        pattern: 'UNIT_PATTERN',
        value: unitMatch[0],
        type: 'unit_pattern',
        confidence: 0.85
      });
    }
    // 한글 수량
    const koreanQuantityMatch = normalized.match(this.PATTERNS.KOREAN_QUANTITY);
    if (koreanQuantityMatch) {
      patterns.push({
        pattern: 'KOREAN_QUANTITY',
        value: koreanQuantityMatch[0],
        type: 'korean_quantity',
        confidence: 0.8
      });
    }
    // 상품명 패턴 (2글자 이상의 한글)
    const productNameMatch = normalized.match(/[가-힣]{2,}/);
    if (productNameMatch && !this.PATTERNS.KOREAN_QUANTITY.test(productNameMatch[0]) && !productNameMatch[0].includes('주세요') && !productNameMatch[0].includes('부탁')) {
      patterns.push({
        pattern: 'PRODUCT_NAME',
        value: productNameMatch[0],
        type: 'product_name',
        confidence: 0.75
      });
    }
    // 특수 수량
    const specialQuantityMatch = normalized.match(this.PATTERNS.SPECIAL_QUANTITY);
    if (specialQuantityMatch) {
      patterns.push({
        pattern: 'SPECIAL_QUANTITY',
        value: specialQuantityMatch[0],
        type: 'special_quantity',
        confidence: 0.85
      });
    }
    // 색상 옵션 패턴
    const colorOptionMatches = [
      ...normalized.matchAll(this.PATTERNS.COLOR_OPTION)
    ];
    if (colorOptionMatches.length > 0) {
      patterns.push({
        pattern: 'COLOR_OPTION',
        value: colorOptionMatches.map((m)=>m[0]).join(' '),
        type: 'color_option',
        confidence: 0.9
      });
    }
    // 🔥 슬래시 구분 패턴 ("이름/전화번호/지점/상품수량")
    const slashMatch = normalized.match(this.PATTERNS.SLASH_SEPARATED);
    if (slashMatch) {
      patterns.push({
        pattern: 'SLASH_SEPARATED',
        value: slashMatch[0],
        type: 'slash_separated',
        confidence: 0.95
      });
    }
    // 🔥 상품명+숫자 패턴 ("꼬막1", "사과2", "간장맛 2")
    const productWithNumberMatch = normalized.match(this.PATTERNS.PRODUCT_WITH_NUMBER);
    if (productWithNumberMatch) {
      patterns.push({
        pattern: 'PRODUCT_WITH_NUMBER',
        value: productWithNumberMatch[0],
        type: 'product_with_number',
        confidence: 0.9
      });
    }
    // 🔥 상품명 숫자단위 패턴 ("간장맛 2봉", "불고기 3팩")도 product_with_number로 처리
    const productWithUnitMatch = normalized.match(/([가-힣]{2,})\s+(\d+)\s*(개|박스|봉지|봉|통|팩|세트|묶음|kg|키로|병|알)/);
    if (productWithUnitMatch && !productWithNumberMatch) {
      patterns.push({
        pattern: 'PRODUCT_WITH_NUMBER',
        value: productWithUnitMatch[1] + productWithUnitMatch[2],
        type: 'product_with_number',
        confidence: 0.85
      });
    }
    return patterns;
  }
  /**
   * 단일상품 여부 판단
   */ static isSingleProduct(productMap: any) {
    if (!productMap) return false;
    return productMap.size === 1;
  }
  /**
   * 패턴 타입 결정
   */ static determineType(patterns: any[], _normalized: string) {
    if (patterns.length === 0) {
      return 'unknown';
    }
    // 🔥 상품명+숫자 패턴이 있는 경우 (최우선순위 - 다중상품 처리)
    if (patterns.some((p)=>p.pattern === 'PRODUCT_WITH_NUMBER')) {
      return 'product_with_number';
    }
    // 🔥 쉼표가 포함된 슬래시 패턴은 다중상품으로 처리
    if (patterns.some((p)=>p.pattern === 'SLASH_SEPARATED')) {
      // 댓글에 쉼표가 있으면 다중상품으로 간주하여 RecursivePattern 사용
      if (_normalized.includes(',')) {
        return 'product_with_number'; // RecursivePattern 매처 사용
      }
      return 'slash_separated';
    }
    // 단순 숫자만 있는 경우
    if (patterns.some((p)=>p.pattern === 'SIMPLE_NUMBER') && patterns.length === 1) {
      return 'simple_number';
    }
    // 번호 기반 패턴이 있는 경우
    if (patterns.some((p)=>p.pattern === 'NUMBER_BASED')) {
      return 'number_based';
    }
    // 색상 옵션 패턴이 있는 경우 (우선순위 높음)
    if (patterns.some((p)=>p.pattern === 'COLOR_OPTION')) {
      return 'color_option';
    }
    // 단위 패턴이 있는 경우
    if (patterns.some((p)=>p.pattern === 'UNIT_PATTERN')) {
      return 'unit_pattern';
    }
    // 상품명이 있는 경우
    if (patterns.some((p)=>p.pattern === 'PRODUCT_NAME')) {
      return 'product_name';
    }
    // 여러 패턴이 혼재
    if (patterns.length > 2) {
      return 'mixed';
    }
    return 'unknown';
  }
  /**
   * 매처 추천
   */ static recommendMatcher(type: string, isSingleProduct: boolean, patterns: any[], normalized: string) {
    // 다중 상품 패턴 감지 (여러 개의 숫자와 상품명이 있는 경우)
    const hasMultipleNumbers = this.hasMultipleNumbers(normalized);
    const hasMultipleProducts = this.hasMultipleProductNames(normalized);
    // 다중상품이고 여러 숫자나 상품명이 있으면 RecursivePattern 추천
    if (!isSingleProduct && (hasMultipleNumbers || hasMultipleProducts)) {
      console.log(`[CommentAnalyzer] 다중 패턴 감지 → RecursivePattern 추천: "${normalized}"`);
      return 'RecursivePattern';
    }
    // 단일상품인 경우
    if (isSingleProduct) {
      // 단순 숫자는 수량으로 해석
      if (type === 'simple_number') {
        return 'SimpleNumber';
      }
      // 단위 패턴 우선
      if (type === 'unit_pattern') {
        return 'UnitPattern';
      }
      // 그 외는 상품명 매칭
      return 'ProductName';
    }
    // 다중상품인 경우
    // 🔥 슬래시 구분 패턴 최우선 (전용 매처 필요)
    if (type === 'slash_separated') {
      return 'ProductName'; // 일단 ProductName 매처 사용
    }
    // 색상 옵션 패턴 최우선
    if (type === 'color_option') {
      return 'ColorOption';
    }
    // 번호 기반 패턴 우선
    if (type === 'number_based') {
      return 'NumberBased';
    }
    // 🔥 상품명+숫자 패턴
    if (type === 'product_with_number') {
      return 'RecursivePattern';
    }
    // 박스/알 단위가 있는 경우 RecursivePattern 우선 (정확도 높음)
    const hasBoxOrUnit = patterns.some((p)=>{
      const value = (p.value || '').toLowerCase();
      return value.includes('박스') || value.includes('알') || /\d+(박스|알)/.test(value);
    });
    if (hasBoxOrUnit) {
      console.log(`[CommentAnalyzer] 박스/알 단위 감지 → RecursivePattern 추천`);
      return 'RecursivePattern';
    }
    // 상품명이 포함된 경우 ProductName 추천
    if (patterns.some((p)=>p.pattern === 'PRODUCT_NAME')) {
      return 'ProductName';
    }
    // 단위 패턴이지만 상품명도 있으면 ProductName
    if (type === 'unit_pattern' && patterns.some((p)=>p.pattern === 'PRODUCT_NAME')) {
      return 'ProductName';
    }
    // 단위 패턴만 있으면 UnitPattern
    if (type === 'unit_pattern') {
      return 'UnitPattern';
    }
    // 복잡한 패턴은 Mixed 처리
    if (type === 'mixed') {
      return 'Mixed';
    }
    // 단순 숫자는 다중상품에서 RecursivePattern으로 처리 (상품명 매칭 시도)
    if (type === 'simple_number') {
      return 'RecursivePattern';
    }
    // 그 외는 AI 처리
    return 'AI';
  }
  /**
   * 여러 개의 숫자가 있는지 확인
   * 🔥 전화번호 4자리 숫자 제외 로직 추가
   */ static hasMultipleNumbers(text: string) {
    // 전화번호 패턴 제거 후 숫자 추출
    const cleanText = this.removePhoneNumberPatterns(text);
    const numbers = cleanText.match(/\d+/g);
    return numbers ? numbers.length > 1 : false;
  }
  /**
   * 댓글에 포함된 숫자 개수 계산 (전화번호 제외)
   */ static countNumbers(text: string) {
    // 전화번호 패턴 제거 후 숫자 추출
    const cleanText = this.removePhoneNumberPatterns(text);
    const numbers = cleanText.match(/\d+/g);
    return numbers ? numbers.length : 0;
  }
  /**
   * 전화번호 패턴 제거 함수
   * 다양한 전화번호 형식을 제거
   */ static removePhoneNumberPatterns(text: string) {
    let result = text;
    // 전화번호 패턴들 제거
    // 010-1234-5678, 02-123-4567 등
    result = result.replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '');
    // 4자리 이상 연속 숫자 (전화번호 가능성)
    result = result.replace(/\b\d{4,}\b/g, '');
    // 연속 공백 정리
    result = result.replace(/\s+/g, ' ').trim();
    // 빈 슬래시나 점 정리
    result = result.replace(/\/\s*\//g, '/').replace(/\.\s*\./g, '.');
    return result;
  }
  /**
   * 여러 개의 상품명이 있는지 확인
   * 🔥 전화번호 패턴 제거 후 검사하여 이름이 상품으로 오인식되는 것 방지
   */ static hasMultipleProductNames(text: string) {
    // 전화번호 패턴 제거 후 검사 
    const cleanText = this.removePhoneNumberPatterns(text);
    // 🔥 다양한 다중 상품 패턴 감지
    // 패턴 1: "상품명 숫자 상품명 숫자" (예: "크림스프레이 1 치즈 1")
    const pattern1 = cleanText.match(/[가-힣]+\s+\d+\s+[가-힣]+\s+\d+/);
    if (pattern1) return true;
    // 패턴 2: "상품명숫자 상품명숫자" (예: "사과1 배2")
    const pattern2 = cleanText.match(/[가-힣]+\d+\s+[가-힣]+\d+/);
    if (pattern2) return true;
    // 패턴 3: "숫자상품명 숫자상품명" (예: "1사과 2배")
    const pattern3 = cleanText.match(/\d+[가-힣]+\s+\d+[가-힣]+/);
    if (pattern3) return true;
    // 패턴 4: 기존 패턴 개선 - "한글+숫자" 형태가 2개 이상
    const pattern4 = cleanText.match(/[가-힣]+\s*\d+/g);
    if (pattern4 && pattern4.length > 1) return true;
    // 패턴 5: 여러 개의 한글 단어와 여러 개의 숫자가 있는 경우
    const koreanWords = cleanText.match(/[가-힣]+/g);
    const numbers = cleanText.match(/\d+/g);
    // 한글 단어가 2개 이상이고 숫자가 2개 이상이면 다중 상품으로 간주
    if (koreanWords && numbers && koreanWords.length >= 2 && numbers.length >= 2) {
      return true;
    }
    return false;
  }
  /**
   * 신뢰도 계산
   */ static calculateConfidence(patterns: any[], type: string) {
    if (patterns.length === 0) {
      return 0.1;
    }
    // 패턴별 가중치
    const weights = {
      'SIMPLE_NUMBER': 0.95,
      'NUMBER_BASED': 0.9,
      'COLOR_OPTION': 0.9,
      'UNIT_PATTERN': 0.85,
      'PRODUCT_NAME': 0.75,
      'KOREAN_QUANTITY': 0.8,
      'SPECIAL_QUANTITY': 0.85
    };
    // 가장 높은 신뢰도 반환
    const maxConfidence = Math.max(...patterns.map((p)=>weights[p.pattern] || 0.5));
    // 타입별 보정
    const typeBonus = {
      'simple_number': 0.05,
      'number_based': 0.1,
      'color_option': 0.1,
      'unit_pattern': 0.05,
      'product_name': 0,
      'mixed': -0.1,
      'unknown': -0.2
    };
    return Math.min(1, maxConfidence + (typeBonus[type] || 0));
  }
  /**
   * 대표상품 선택 (단일상품 게시물용)
   */ static selectRepresentativeProduct(productMap: any) {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    const products = Array.from(productMap.values());
    // 우선순위 점수 계산
    const scoredProducts = products.map((product)=>{
      let score = 0;
      const title = product.title || product.name || '';
      // 패키지/묶음 단위 우선 (+100점)
      if (/박스|세트|묶음|패키지/.test(title)) {
        score += 100;
      }
      // 가격 점수 (최대 50점)
      const maxPrice = Math.max(...products.map((p)=>p.price || 0));
      if (maxPrice > 0) {
        score += product.price / maxPrice * 50;
      }
      // 특가/할인 상품 (+30점)
      if (/특가|할인|세일/.test(title)) {
        score += 30;
      }
      // itemNumber가 작을수록 (+10점)
      score += 10 - (product.itemNumber || 0);
      return {
        product,
        score
      };
    });
    // 점수가 가장 높은 상품 반환
    scoredProducts.sort((a, b)=>b.score - a.score);
    return scoredProducts[0]?.product || products[0];
  }
}
