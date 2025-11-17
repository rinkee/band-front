/**
 * 댓글 분석 및 분류 시스템
 * backend/supabase/functions/_shared/matching/commentAnalyzer.ts 및
 * backend/supabase/functions/_shared/comment-classifier.ts에서 이식
 */

/**
 * 댓글 분류 클래스
 */
export class CommentClassifier {
  /**
   * 댓글을 분류하는 메인 함수
   */
  static classify(comment, isMultiProductPost, productMap) {
    const normalizedComment = this.normalizeComment(comment);

    // 단일 상품 게시물인 경우
    if (!isMultiProductPost) {
      return {
        type: 'quantity-only',
        isMultiProduct: false,
        numberReferences: [],
        productNameReferences: [],
        confidence: 0.95,
        reason: '단일 상품 게시물 - 수량만 추출'
      };
    }

    // 다중 상품 게시물인 경우
    const numberRefs = this.extractNumberReferences(normalizedComment);
    const hasNumberKeyword = this.hasNumberOrderKeyword(normalizedComment);
    const productNames = this.extractProductNames(normalizedComment, productMap);

    // 1. "N번" 패턴이 있으면 번호 기반 주문
    if (hasNumberKeyword && numberRefs.length > 0) {
      return {
        type: 'number-based',
        isMultiProduct: true,
        numberReferences: numberRefs,
        productNameReferences: [],
        confidence: 0.95,
        reason: `번호 주문 패턴 감지: ${numberRefs.join(', ')}번`
      };
    }

    // 2. 상품명이 감지되면 상품명 기반 주문
    if (productNames.length > 0) {
      return {
        type: 'product-name',
        isMultiProduct: true,
        numberReferences: [],
        productNameReferences: productNames,
        confidence: 0.85,
        reason: `상품명 주문: ${productNames.join(', ')}`
      };
    }

    // 3. 둘 다 있으면 혼합형
    if (numberRefs.length > 0 && productNames.length > 0) {
      return {
        type: 'mixed',
        isMultiProduct: true,
        numberReferences: numberRefs,
        productNameReferences: productNames,
        confidence: 0.7,
        reason: '번호와 상품명 혼재'
      };
    }

    // 4. 명확하지 않은 경우
    return {
      type: 'ambiguous',
      isMultiProduct: true,
      numberReferences: numberRefs,
      productNameReferences: productNames,
      confidence: 0.5,
      reason: '패턴 불명확 - AI 처리 권장'
    };
  }

  /**
   * 댓글 정규화
   */
  static normalizeComment(comment) {
    return comment.trim().toLowerCase();
  }

  /**
   * 번호 참조 추출 (N번 패턴)
   */
  static extractNumberReferences(comment) {
    const numbers = [];
    const numberPattern = /(\d+)\s*번/g;
    let match;

    while ((match = numberPattern.exec(comment)) !== null) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= 20) {
        numbers.push(num);
      }
    }

    return numbers;
  }

  /**
   * 번호 주문 키워드 확인
   */
  static hasNumberOrderKeyword(comment) {
    return /\d+\s*번/.test(comment);
  }

  /**
   * 상품명 추출
   */
  static extractProductNames(comment, productMap) {
    if (!productMap || productMap.size === 0) return [];

    const foundNames = [];
    const normalizedComment = comment.toLowerCase();

    for (const product of productMap.values()) {
      const productTitle = (product.title || '').toLowerCase();
      if (productTitle && normalizedComment.includes(productTitle)) {
        foundNames.push(product.title);
      }
    }

    return foundNames;
  }
}

/**
 * 번호 기반 주문 처리
 */
export function processNumberBasedOrder(comment, productMap, numberReferences) {
  const orderItems = [];

  for (const itemNumber of numberReferences) {
    const product = productMap.get(itemNumber);
    if (product) {
      // 수량 추출 (N번 뒤의 숫자)
      const quantityPattern = new RegExp(`${itemNumber}\\s*번[\\s가-힣]*?(\\d+)`);
      const quantityMatch = comment.match(quantityPattern);
      const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

      orderItems.push({
        itemNumber: itemNumber,
        productId: product.productId || product.product_id,
        productName: product.title || product.name,
        quantity: quantity,
        price: product.basePrice || product.price || 0,
        matchMethod: 'number-based'
      });
    }
  }

  return orderItems;
}

/**
 * 상품명 기반 주문 처리
 */
export function processProductNameOrder(comment, productMap, productNameReferences) {
  const orderItems = [];

  for (const productName of productNameReferences) {
    // productMap에서 해당 상품 찾기
    let matchedProduct = null;
    for (const product of productMap.values()) {
      if ((product.title || '').toLowerCase().includes(productName.toLowerCase())) {
        matchedProduct = product;
        break;
      }
    }

    if (matchedProduct) {
      // 수량 추출 (상품명 뒤의 숫자)
      const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const quantityPattern = new RegExp(`${escapedName}[\\s가-힣]*?(\\d+)`, 'i');
      const quantityMatch = comment.match(quantityPattern);
      const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

      orderItems.push({
        itemNumber: matchedProduct.itemNumber || 1,
        productId: matchedProduct.productId || matchedProduct.product_id,
        productName: matchedProduct.title || matchedProduct.name,
        quantity: quantity,
        price: matchedProduct.basePrice || matchedProduct.price || 0,
        matchMethod: 'product-name'
      });
    }
  }

  return orderItems;
}
