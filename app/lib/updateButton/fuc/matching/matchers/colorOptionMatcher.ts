/**
 * 색상 옵션 매처
 * "네이비1 레드1", "블랙2 화이트3" 같은 색상별 수량 패턴 처리
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

export interface ColorOptionResult extends BaseMatchResult {
  colorOptions: Array<{
    color: string;
    quantity: number;
    normalizedColor: string;
  }>;
  totalQuantity: number;
  selectedColor?: string;  // 첫 번째 색상을 대표로
}

export class ColorOptionMatcher {
  // 색상 패턴 정의
  private static readonly COLOR_PATTERNS = {
    // 영문 색상
    ENGLISH: [
      'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple',
      'orange', 'brown', 'gray', 'grey', 'navy', 'beige', 'ivory', 'khaki',
      'wine', 'mint', 'cream', 'charcoal', 'silver', 'gold'
    ],
    
    // 한글 색상
    KOREAN: [
      '블랙', '화이트', '레드', '블루', '그린', '옐로우', '핑크', '퍼플',
      '오렌지', '브라운', '그레이', '네이비', '베이지', '아이보리', '카키',
      '와인', '민트', '크림', '차콜', '실버', '골드', '검정', '흰색', '빨강',
      '파랑', '초록', '노랑', '분홍', '보라', '주황', '갈색', '회색', '남색'
    ]
  };

  /**
   * 색상 옵션 패턴 매칭
   */
  static match(comment: string, productMap?: Map<number, any>): ColorOptionResult | null {
    const normalized = this.normalizeComment(comment);
    
    // 색상과 숫자 조합 패턴 찾기
    const colorOptions = this.extractColorOptions(normalized);
    
    if (colorOptions.length === 0) {
      return null;
    }
    
    // 총 수량 계산
    const totalQuantity = colorOptions.reduce((sum, opt) => sum + opt.quantity, 0);
    
    // 상품 선택 (단일 상품이면 해당 상품, 아니면 1번)
    const product = this.selectProduct(productMap);
    
    if (!product) {
      return null;
    }
    
    return {
      isOrder: true,
      quantity: totalQuantity,
      productItemNumber: product.itemNumber,
      confidence: 0.85,
      matchMethod: 'color-option',
      debugInfo: {
        originalComment: comment,
        normalized,
        colorOptions,
        totalQuantity,
        productInfo: {
          itemNumber: product.itemNumber,
          title: product.title || product.name,
          price: product.price
        }
      },
      colorOptions,
      totalQuantity,
      selectedColor: colorOptions[0]?.color  // 첫 번째 색상을 대표로
    };
  }

  /**
   * 색상 옵션 추출
   */
  private static extractColorOptions(normalized: string): Array<{
    color: string;
    quantity: number;
    normalizedColor: string;
  }> {
    const options: Array<{
      color: string;
      quantity: number;
      normalizedColor: string;
    }> = [];
    
    // 모든 색상 패턴 결합
    const allColors = [
      ...this.COLOR_PATTERNS.ENGLISH,
      ...this.COLOR_PATTERNS.KOREAN
    ];
    
    // 색상 + 숫자 패턴 찾기
    for (const color of allColors) {
      const colorLower = color.toLowerCase();
      // 색상 바로 뒤에 숫자가 오는 패턴 (예: "네이비1", "레드2")
      const pattern = new RegExp(`(${colorLower})(\\d+)`, 'gi');
      const matches = [...normalized.matchAll(pattern)];
      
      for (const match of matches) {
        const quantity = parseInt(match[2], 10);
        if (quantity > 0 && quantity <= 100) {  // 합리적인 수량 범위
          options.push({
            color: match[1],
            quantity,
            normalizedColor: this.normalizeColor(match[1])
          });
        }
      }
      
      // 색상과 숫자가 띄어쓰기로 구분된 패턴 (예: "네이비 1", "레드 2")
      const spacePattern = new RegExp(`(${colorLower})\\s+(\\d+)`, 'gi');
      const spaceMatches = [...normalized.matchAll(spacePattern)];
      
      for (const match of spaceMatches) {
        const quantity = parseInt(match[2], 10);
        if (quantity > 0 && quantity <= 100) {
          // 중복 체크
          const exists = options.some(opt => 
            opt.color === match[1] && opt.quantity === quantity
          );
          if (!exists) {
            options.push({
              color: match[1],
              quantity,
              normalizedColor: this.normalizeColor(match[1])
            });
          }
        }
      }
    }
    
    return options;
  }

  /**
   * 색상 이름 정규화
   */
  private static normalizeColor(color: string): string {
    const colorMap: Record<string, string> = {
      // 영문 -> 한글
      'black': '블랙',
      'white': '화이트',
      'red': '레드',
      'blue': '블루',
      'green': '그린',
      'yellow': '옐로우',
      'pink': '핑크',
      'purple': '퍼플',
      'orange': '오렌지',
      'brown': '브라운',
      'gray': '그레이',
      'grey': '그레이',
      'navy': '네이비',
      'beige': '베이지',
      'ivory': '아이보리',
      'khaki': '카키',
      'wine': '와인',
      'mint': '민트',
      'cream': '크림',
      'charcoal': '차콜',
      'silver': '실버',
      'gold': '골드',
      // 한글 -> 표준
      '검정': '블랙',
      '흰색': '화이트',
      '빨강': '레드',
      '파랑': '블루',
      '초록': '그린',
      '노랑': '옐로우',
      '분홍': '핑크',
      '보라': '퍼플',
      '주황': '오렌지',
      '갈색': '브라운',
      '회색': '그레이',
      '남색': '네이비'
    };
    
    const lowerColor = color.toLowerCase();
    return colorMap[lowerColor] || lowerColor;
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
   * 상품 선택
   */
  private static selectProduct(productMap?: Map<number, any>): any {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    
    // 단일 상품이면 해당 상품 반환
    if (productMap.size === 1) {
      return Array.from(productMap.values())[0];
    }
    
    // 다중 상품이면 1번 상품 우선
    return productMap.get(1) || Array.from(productMap.values())[0];
  }

  /**
   * 색상 옵션 패턴인지 빠른 체크
   */
  static isColorOptionPattern(comment: string): boolean {
    const normalized = comment.toLowerCase();
    
    // 색상 + 숫자 패턴이 있는지 빠른 체크
    const allColors = [
      ...this.COLOR_PATTERNS.ENGLISH,
      ...this.COLOR_PATTERNS.KOREAN
    ];
    
    for (const color of allColors) {
      const colorLower = color.toLowerCase();
      // 색상과 숫자가 연속되거나 띄어쓰기로 구분된 패턴
      const pattern = new RegExp(`${colorLower}\\s*\\d+`, 'i');
      if (pattern.test(normalized)) {
        return true;
      }
    }
    
    return false;
  }
}