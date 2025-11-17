/**
 * 최적 가격 계산기 클래스
 * 주문 수량에 대해 가장 저렴한 가격 조합을 찾습니다
 */
export class OptimalPriceCalculator {
  /**
   * 주문 수량에 대해 최적의 상품 옵션을 찾습니다
   *
   * @param quantity - 주문 수량
   * @param productMap - 상품 맵
   * @param comment - 댓글 내용 (옵션 매칭용)
   * @returns 최적 옵션 정보 또는 null
   */
  static findBestOption(
    quantity: number,
    productMap: Map<number, any>,
    comment?: string
  ): {
    product: any;
    finalQuantity: number;
    totalPrice: number;
    unitPrice: number;
    matchedOption?: any;
  } | null {
    if (!productMap || productMap.size === 0 || quantity <= 0) {
      return null;
    }

    let bestResult: any = null;
    let lowestPrice = Infinity;

    // 각 상품에 대해 최적 가격 계산
    for (const [itemNumber, product] of productMap) {
      const priceOptions = product.price_options || product.priceOptions || [];
      const basePrice = product.base_price || product.basePrice || 0;

      // 가격 옵션이 있는 경우
      if (priceOptions && priceOptions.length > 0) {
        // 동적 계획법으로 최적 조합 찾기
        const optimalResult = this.calculateOptimalCombination(
          quantity,
          priceOptions,
          basePrice,
          comment
        );

        if (optimalResult && optimalResult.totalPrice < lowestPrice) {
          lowestPrice = optimalResult.totalPrice;
          bestResult = {
            product,
            finalQuantity: quantity,
            totalPrice: optimalResult.totalPrice,
            unitPrice: optimalResult.totalPrice / quantity,
            matchedOption: optimalResult.matchedOption
          };
        }
      } else if (basePrice > 0) {
        // 기본 가격만 있는 경우
        const totalPrice = basePrice * quantity;
        if (totalPrice < lowestPrice) {
          lowestPrice = totalPrice;
          bestResult = {
            product,
            finalQuantity: quantity,
            totalPrice,
            unitPrice: basePrice,
            matchedOption: null
          };
        }
      }
    }

    return bestResult;
  }

  /**
   * 동적 계획법으로 최적 가격 조합 계산
   */
  private static calculateOptimalCombination(
    quantity: number,
    priceOptions: any[],
    fallbackUnitPrice: number,
    comment?: string
  ): { totalPrice: number; matchedOption: any } | null {
    const validOpts = priceOptions.filter(
      (opt) =>
        typeof opt.quantity === 'number' &&
        opt.quantity > 0 &&
        typeof opt.price === 'number' &&
        opt.price >= 0
    );

    if (validOpts.length === 0 && fallbackUnitPrice > 0) {
      return {
        totalPrice: fallbackUnitPrice * quantity,
        matchedOption: null
      };
    }

    if (validOpts.length === 0) {
      return null;
    }

    // 댓글 내용과 옵션 매칭 시도
    if (comment) {
      const matchedOption = this.findMatchingOption(
        comment,
        validOpts,
        quantity
      );
      if (matchedOption) {
        const totalPrice =
          matchedOption.quantity === quantity
            ? matchedOption.price
            : (matchedOption.price / matchedOption.quantity) * quantity;
        return { totalPrice, matchedOption };
      }
    }

    // 정확히 일치하는 수량 옵션 찾기
    const exactMatch = validOpts.find((opt) => opt.quantity === quantity);
    if (exactMatch) {
      return { totalPrice: exactMatch.price, matchedOption: exactMatch };
    }

    // 동적 계획법으로 최적 조합 찾기
    const dp = new Array(quantity + 1).fill(Infinity);
    const dpPath = new Array(quantity + 1).fill(null);
    dp[0] = 0;

    for (let i = 1; i <= quantity; i++) {
      for (const option of validOpts) {
        if (option.quantity <= i) {
          const remainingQuantity = i - option.quantity;
          if (dp[remainingQuantity] !== Infinity) {
            const costWithThisOption = dp[remainingQuantity] + option.price;
            if (costWithThisOption < dp[i]) {
              dp[i] = costWithThisOption;
              dpPath[i] = { option, remaining: remainingQuantity };
            }
          }
        }
      }

      // fallback 단가로도 계산
      if (fallbackUnitPrice > 0 && i > 0) {
        const costWithFallback = dp[i - 1] + fallbackUnitPrice;
        if (costWithFallback < dp[i]) {
          dp[i] = costWithFallback;
          dpPath[i] = { fallback: true, remaining: i - 1 };
        }
      }
    }

    if (dp[quantity] === Infinity) {
      return fallbackUnitPrice > 0
        ? { totalPrice: fallbackUnitPrice * quantity, matchedOption: null }
        : null;
    }

    // 가장 많이 사용된 옵션 찾기
    let currentQuantity = quantity;
    const optionCounts = new Map();
    let mostUsedOption = null;

    while (currentQuantity > 0 && dpPath[currentQuantity]) {
      const path = dpPath[currentQuantity];
      if (path.option) {
        const count = optionCounts.get(path.option) || 0;
        optionCounts.set(path.option, count + 1);
        if (!mostUsedOption || (count + 1) > (optionCounts.get(mostUsedOption) || 0)) {
          mostUsedOption = path.option;
        }
      }
      currentQuantity = path.remaining;
    }

    return {
      totalPrice: Math.round(dp[quantity]),
      matchedOption: mostUsedOption
    };
  }

  /**
   * 댓글 내용과 가장 잘 매칭되는 옵션 찾기
   */
  private static findMatchingOption(
    comment: string,
    options: any[],
    quantity: number
  ): any | null {
    const lowerComment = comment.toLowerCase();

    // 텍스트 유사도 계산
    const scores = options.map((option) => {
      const description = (option.description || '').toLowerCase();
      const tokens = this.tokenize(description);
      const commentTokens = this.tokenize(lowerComment);

      let matchCount = 0;
      for (const token of commentTokens) {
        if (tokens.some((t) => t.includes(token) || token.includes(t))) {
          matchCount++;
        }
      }

      const similarity = matchCount / Math.max(commentTokens.length, 1);
      return { option, similarity, matchCount };
    });

    // 가장 높은 유사도의 옵션 선택
    const best = scores.reduce((best, current) => {
      if (current.matchCount > best.matchCount) return current;
      if (
        current.matchCount === best.matchCount &&
        current.similarity > best.similarity
      )
        return current;
      return best;
    });

    // 유사도가 너무 낮으면 수량 기반 선택
    if (best.similarity < 0.1) {
      return options.find((opt) => opt.quantity === quantity) || options[0];
    }

    return best.option;
  }

  /**
   * 텍스트를 토큰으로 분리
   */
  private static tokenize(text: string): string[] {
    return text
      .replace(/[^\w가-힣]/g, ' ')
      .replace(/(\d+)([가-힣]+)/g, '$1 $2')
      .replace(/([가-힣]+)(\d+)/g, '$1 $2')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }
}
