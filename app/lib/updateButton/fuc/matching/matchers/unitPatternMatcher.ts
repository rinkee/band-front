/**
 * 단위 패턴 매처
 * "2세트", "20세트", "3박스" 같은 수량+단위 패턴 처리
 * 단일 상품에서 수량 주문으로 처리
 */

// BaseMatchResult 인터페이스 정의
interface BaseMatchResult {
  isOrder: boolean;
  quantity: number;
  productItemNumber: number;
  confidence: number;
  matchMethod?: string;
  debugInfo?: any;
}

export interface UnitPatternResult extends BaseMatchResult {
  unit: string;
  requestedQuantity: number;
}

export class UnitPatternMatcher {
  // 지원하는 단위 패턴
  private static readonly UNIT_PATTERNS = [
    '세트', '박스', '팩', '봉지', '봉', '개', '통', '묶음', '키로', 'kg'
  ];

  /**
   * 단위 패턴 매칭
   */
  static match(comment: string, productMap?: Map<number, any>): UnitPatternResult | null {
    const normalized = this.normalizeComment(comment);
    
    // 숫자+단위 패턴 체크 (예: "2세트", "20박스", "2세트요")
    // "요", "이요", "주세요" 등의 요청 표현도 허용
    const pattern = new RegExp(`^(\\d+)\\s*(${this.UNIT_PATTERNS.join('|')})(요|이요|주세요)?$`, 'i');
    const match = normalized.match(pattern);
    
    if (!match) {
      return null;
    }
    
    const requestedQuantity = parseInt(match[1], 10);
    const unit = match[2];
    
    // 비합리적인 수량 체크
    if (requestedQuantity <= 0 || requestedQuantity > 999) {
      return null;
    }
    
    // 단일 상품인지 확인
    const isSingleProduct = productMap && productMap.size === 1;
    if (!isSingleProduct) {
      // 다중 상품에서는 처리하지 않음
      return null;
    }
    
    // 상품 선택 (단일 상품)
    const product = this.selectProduct(productMap);
    if (!product) {
      return null;
    }
    
    // 상품명에 해당 단위가 포함되어 있는지 확인
    const productTitle = (product.title || product.name || '').toLowerCase();
    const unitToCheck = this.normalizeUnit(unit);
    
    // 🔥 특별 처리: "N키로" 댓글일 때 "1키로" 상품이면 N개로 처리
    if ((unit === '키로' || unit === 'kg') && this.isQuantityExpression(productTitle, requestedQuantity, unit)) {
      return {
        isOrder: true,
        quantity: requestedQuantity,  // "2키로" → 2개
        productItemNumber: product.itemNumber || 1,
        confidence: 0.95,  // 높은 신뢰도
        matchMethod: 'unit-pattern-quantity',
        debugInfo: {
          originalComment: comment,
          normalized,
          requestedQuantity,
          unit,
          interpretedAs: 'quantity_expression',
          reason: `"${requestedQuantity}${unit}" interpreted as quantity for "1${unit}" product`,
          productInfo: {
            itemNumber: product.itemNumber || 1,
            title: product.title || product.name,
            price: product.price
          }
        },
        unit,
        requestedQuantity
      };
    }
    
    if (!this.productHasUnit(productTitle, unitToCheck)) {
      return null;
    }
    
    return {
      isOrder: true,
      quantity: requestedQuantity,  // 요청된 수량 그대로
      productItemNumber: product.itemNumber || 1,
      confidence: 0.9,
      matchMethod: 'unit-pattern',
      debugInfo: {
        originalComment: comment,
        normalized,
        requestedQuantity,
        unit,
        productInfo: {
          itemNumber: product.itemNumber || 1,
          title: product.title || product.name,
          price: product.price
        }
      },
      unit,
      requestedQuantity
    };
  }

  /**
   * 상품명에 단위가 포함되어 있는지 확인
   */
  private static productHasUnit(productTitle: string, unit: string): boolean {
    // "봉"이 요청되었을 때 "봉지"도 매칭
    if (unit === '봉' && productTitle.includes('봉지')) {
      return true;
    }
    
    // "키로"가 요청되었을 때 "kg"도 매칭
    if (unit === '키로' && productTitle.includes('kg')) {
      return true;
    }
    
    if (unit === 'kg' && productTitle.includes('키로')) {
      return true;
    }
    
    return productTitle.includes(unit);
  }

  /**
   * "N키로" 댓글이 "1키로" 상품의 수량 표현인지 확인
   * 예: 상품명 "천도복숭아 1키로", 댓글 "2키로" → 2개 주문
   */
  private static isQuantityExpression(productTitle: string, requestedQuantity: number, unit: string): boolean {
    // 상품명에서 "1키로" 또는 "1kg" 패턴 찾기
    const oneUnitPattern = new RegExp(`1\\s*(${unit}|키로|kg)`, 'i');
    
    if (oneUnitPattern.test(productTitle)) {
      // "1키로" 상품에 "2키로", "3키로" 등의 댓글은 수량으로 해석
      return true;
    }
    
    // 상품명에 단위당 표현이 있는 경우 (예: "500g", "100g")
    const unitAmountPattern = new RegExp(`(\\d+)\\s*(g|kg|키로)`, 'i');
    const match = productTitle.match(unitAmountPattern);
    
    if (match) {
      const productAmount = parseInt(match[1]);
      const productUnit = match[2].toLowerCase();
      
      // 단위 변환 고려 (예: 500g 상품에 "2키로" → 4개)
      if (productUnit === 'g' && (unit === '키로' || unit === 'kg')) {
        // g to kg conversion
        const requestedGrams = requestedQuantity * 1000;
        const quantityNeeded = Math.round(requestedGrams / productAmount);
        return quantityNeeded > 0;
      }
    }
    
    return false;
  }

  /**
   * 단위 정규화
   */
  private static normalizeUnit(unit: string): string {
    const unitMap: Record<string, string> = {
      '봉': '봉지',
      '키로': 'kg'
    };
    
    return unitMap[unit] || unit;
  }

  /**
   * 댓글 정규화
   */
  private static normalizeComment(comment: string): string {
    return comment
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * 상품 선택 (단일 상품)
   */
  private static selectProduct(productMap?: Map<number, any>): any {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    
    // 단일 상품이면 해당 상품 반환
    if (productMap.size === 1) {
      return Array.from(productMap.values())[0];
    }
    
    return null;
  }

  /**
   * 단위 패턴인지 빠른 체크
   */
  static isUnitPattern(comment: string): boolean {
    const normalized = comment.trim().toLowerCase();
    const pattern = new RegExp(`^\\d+\\s*(${this.UNIT_PATTERNS.join('|')})$`, 'i');
    return pattern.test(normalized);
  }
}