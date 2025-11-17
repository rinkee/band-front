/**
 * 번호 기반 매처
 * "1번", "2번 3개", "1번 하나" 등의 패턴 처리
 * 다중상품 게시물에서 가장 흔한 주문 패턴
 */ export class NumberBasedMatcher {
  // 번호 패턴 정규식
  static PATTERNS = {
    // "1번", "2번", "10번" 등
    SIMPLE_NUMBER: /(\d+)\s*번/,
    // "1번 2개", "2번 3개요" 등
    NUMBER_WITH_QUANTITY: /(\d+)\s*번\s*(\d+)\s*개/,
    // "1번 하나", "2번 두개" 등
    NUMBER_WITH_KOREAN: /(\d+)\s*번\s*(하나|둘|셋|한\s*개|두\s*개|세\s*개)/,
    // "1번주세요", "2번 부탁드려요" 등
    NUMBER_WITH_POLITE: /(\d+)\s*번\s*(주세요|부탁|드려요|드립니다|요)?/,
    // "1번이랑 2번" 등 (복수 주문)
    MULTIPLE_NUMBERS: /(\d+)\s*번.*?(\d+)\s*번/
  };
  // 한글 수량 매핑
  static KOREAN_NUMBERS = {
    '하나': 1,
    '한개': 1,
    '한 개': 1,
    '둘': 2,
    '두개': 2,
    '두 개': 2,
    '셋': 3,
    '세개': 3,
    '세 개': 3,
    '넷': 4,
    '네개': 4,
    '네 개': 4,
    '다섯': 5,
    '다섯개': 5,
    '다섯 개': 5,
    '여섯': 6,
    '일곱': 7,
    '여덟': 8,
    '아홉': 9,
    '열': 10,
    '열개': 10,
    '열 개': 10
  };
  /**
   * 번호 기반 주문 추출
   */ static match(comment, productMap) {
    const normalized = this.normalizeComment(comment);
    const results = [];
    // 복수 번호 패턴 체크
    if (this.PATTERNS.MULTIPLE_NUMBERS.test(normalized)) {
      return this.extractMultipleNumbers(normalized, productMap);
    }
    // 번호 + 수량 패턴
    const numberWithQuantity = normalized.match(this.PATTERNS.NUMBER_WITH_QUANTITY);
    if (numberWithQuantity) {
      const itemNumber = parseInt(numberWithQuantity[1]);
      const quantity = parseInt(numberWithQuantity[2]);
      if (this.isValidProduct(itemNumber, productMap)) {
        results.push({
          itemNumber,
          quantity,
          confidence: 0.95,
          pattern: 'NUMBER_WITH_QUANTITY',
          debugInfo: {
            originalComment: comment,
            extractedNumber: numberWithQuantity[1],
            extractedQuantity: numberWithQuantity[2]
          }
        });
        return results;
      }
    }
    // 번호 + 한글 수량 패턴
    const numberWithKorean = normalized.match(this.PATTERNS.NUMBER_WITH_KOREAN);
    if (numberWithKorean) {
      const itemNumber = parseInt(numberWithKorean[1]);
      const koreanQuantity = numberWithKorean[2];
      const quantity = this.parseKoreanNumber(koreanQuantity);
      if (this.isValidProduct(itemNumber, productMap)) {
        results.push({
          itemNumber,
          quantity,
          confidence: 0.9,
          pattern: 'NUMBER_WITH_KOREAN',
          debugInfo: {
            originalComment: comment,
            extractedNumber: numberWithKorean[1],
            extractedQuantity: koreanQuantity
          }
        });
        return results;
      }
    }
    // 단순 번호 패턴
    const simpleNumber = normalized.match(this.PATTERNS.SIMPLE_NUMBER);
    if (simpleNumber) {
      const itemNumber = parseInt(simpleNumber[1]);
      if (this.isValidProduct(itemNumber, productMap)) {
        // 수량 추출 시도
        const quantity = this.extractQuantityFromContext(normalized) || 1;
        results.push({
          itemNumber,
          quantity,
          confidence: 0.85,
          pattern: 'SIMPLE_NUMBER',
          debugInfo: {
            originalComment: comment,
            extractedNumber: simpleNumber[1],
            extractedQuantity: null
          }
        });
        return results;
      }
    }
    return results;
  }
  /**
   * 복수 번호 추출 ("1번이랑 2번")
   */ static extractMultipleNumbers(normalized, productMap) {
    const results = [];
    const regex = /(\d+)\s*번/g;
    let match;
    while((match = regex.exec(normalized)) !== null){
      const itemNumber = parseInt(match[1]);
      if (this.isValidProduct(itemNumber, productMap)) {
        // 각 번호별 수량 추출 시도
        const quantity = this.extractQuantityForNumber(normalized, itemNumber) || 1;
        results.push({
          itemNumber,
          quantity,
          confidence: 0.8,
          pattern: 'MULTIPLE_NUMBERS',
          debugInfo: {
            originalComment: normalized,
            extractedNumber: match[1],
            extractedQuantity: quantity.toString()
          }
        });
      }
    }
    return results;
  }
  /**
   * 특정 번호에 대한 수량 추출
   */ static extractQuantityForNumber(text, itemNumber) {
    // "1번 2개" 패턴
    const pattern = new RegExp(`${itemNumber}\\s*번\\s*(\\d+)\\s*개`);
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
    // "1번 4" 또는 "1번4" 패턴 (개 없이 번호 다음 숫자, 공백 선택적)
    // 수정: lookahead를 더 정확하게 - 바로 뒤에 번/개가 없을 때만
    const simpleNumberPattern = new RegExp(`${itemNumber}\\s*번\\s*(\\d+)(?![번개])`);
    const simpleMatch = text.match(simpleNumberPattern);
    if (simpleMatch) {
      return parseInt(simpleMatch[1]);
    }
    // "1번 하나" 패턴
    const koreanPattern = new RegExp(`${itemNumber}\\s*번\\s*(하나|둘|셋|한\\s*개|두\\s*개|세\\s*개)`);
    const koreanMatch = text.match(koreanPattern);
    if (koreanMatch) {
      return this.parseKoreanNumber(koreanMatch[1]);
    }
    return 1; // 기본값
  }
  /**
   * 문맥에서 수량 추출
   */ static extractQuantityFromContext(text) {
    // "2번2" 또는 "2번 2" 같은 번호 뒤 숫자 패턴 먼저 체크
    const numberAfterBeon = text.match(/\d+번\s*(\d+)(?![번개])/);
    if (numberAfterBeon) {
      return parseInt(numberAfterBeon[1]);
    }
    // "3개" 같은 독립적인 수량 표현 찾기
    const quantityMatch = text.match(/(\d+)\s*개/);
    if (quantityMatch && !text.includes(`${quantityMatch[1]}번`)) {
      return parseInt(quantityMatch[1]);
    }
    // 한글 수량 표현
    for (const [korean, number] of Object.entries(this.KOREAN_NUMBERS)){
      if (text.includes(korean) && !text.includes('번')) {
        return number;
      }
    }
    return null;
  }
  /**
   * 한글 숫자 파싱
   */ static parseKoreanNumber(korean) {
    const normalized = korean.replace(/\s+/g, '');
    return this.KOREAN_NUMBERS[normalized] || 1;
  }
  /**
   * 유효한 상품 번호인지 확인
   */ static isValidProduct(itemNumber, productMap) {
    if (!productMap) {
      // productMap이 없으면 1-20 범위로 가정
      return itemNumber >= 1 && itemNumber <= 20;
    }
    return productMap.has(itemNumber);
  }
  /**
   * 댓글 정규화
   */ static normalizeComment(comment) {
    return comment.trim().toLowerCase().replace(/\s+/g, ' '); // 연속 공백 제거
  }
  /**
   * 신뢰도 조정
   */ static adjustConfidence(result, productMap) {
    let confidence = result.confidence;
    // productMap에 있는 상품이면 신뢰도 상승
    if (productMap && productMap.has(result.itemNumber)) {
      confidence = Math.min(1, confidence + 0.05);
    }
    // 수량이 합리적인 범위면 신뢰도 상승
    if (result.quantity >= 1 && result.quantity <= 10) {
      confidence = Math.min(1, confidence + 0.03);
    }
    return {
      ...result,
      confidence
    };
  }
}
