/**
 * 상품명 매처
 * 기존 similarityMatching을 래핑하여 상품명 기반 매칭 수행
 */
import { findBestProductMatch } from '../../matching/similarityMatching';
import { createLogger } from '../../utils/logger';
const logger = createLogger('ProductNameMatcher');
export class ProductNameMatcher {
  // 수량 관련 패턴
  static QUANTITY_PATTERNS = {
    // "레몬 2개", "사과 3박스"
    NUMBER_UNIT: /(\d+)\s*(개|박스|봉지|통|팩|세트|묶음|kg|병|알)/,
    // "레몬 하나", "사과 두박스"
    KOREAN_UNIT: /(하나|둘|셋|한\s*개|두\s*개|세\s*개|한\s*박스|두\s*박스)/,
    // 특수 수량: "반박스", "반통"
    SPECIAL: /반\s*(박스|통|봉지)/
  };
  // 한글 수량 매핑
  static KOREAN_QUANTITY = {
    '하나': 1,
    '한개': 1,
    '한 개': 1,
    '한박스': 1,
    '한 박스': 1,
    '둘': 2,
    '두개': 2,
    '두 개': 2,
    '두박스': 2,
    '두 박스': 2,
    '셋': 3,
    '세개': 3,
    '세 개': 3,
    '세박스': 3,
    '세 박스': 3
  };
  /**
   * 상품명 기반 매칭
   */ static match(comment, productMap) {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    let normalized = this.normalizeComment(comment);
    // 🔥 슬래시 구분 패턴 처리: "이름/전화/지점/상품수량"
    // 예: "강복순/1226/상무점/꼬막1" → "꼬막1"
    const slashMatch = comment.match(/^([가-힣]+)\/(\d{3,4})\/([가-힣]+점?)\/([가-힣]+\d*)/);
    if (slashMatch) {
      const productPart = slashMatch[4]; // "꼬막1"
      normalized = this.normalizeComment(productPart);
    }
    // 🔥 키로/kg 패턴 처리 (유연한 매칭)
    const kiloPattern = normalized.match(/(\d+)\s*(키로|kg)/);
    if (kiloPattern) {
      const requestedQuantity = parseInt(kiloPattern[1]);
      const unit = kiloPattern[2];
      // 단일 상품인 경우
      if (productMap.size === 1) {
        const product = Array.from(productMap.values())[0];
        const productTitle = (product.title || product.name || '').toLowerCase();
        // 상품명에서 키로 정보 추출
        const productKiloMatch = productTitle.match(/(\d+)\s*(키로|kg)/);
        if (productKiloMatch) {
          const productKilo = parseInt(productKiloMatch[1]);
          // 정확히 나누어 떨어지는 경우 (4키로 요청 → 2키로 상품 2개)
          if (requestedQuantity % productKilo === 0) {
            const calculatedQuantity = requestedQuantity / productKilo;
            const itemNumber = Array.from(productMap.keys())[0];
            return {
              itemNumber,
              quantity: calculatedQuantity,
              confidence: 0.95,
              pattern: 'KILO_CALCULATION',
              productName: product.title || product.name,
              similarity: 0.95,
              debugInfo: {
                originalComment: comment,
                extractedProductName: `${requestedQuantity}${unit}`,
                matchedProduct: product,
                similarityScore: 0.95,
                reason: `"${requestedQuantity}${unit}" calculated as ${calculatedQuantity} units of "${productKilo}${unit}" product`
              }
            };
          }
          // 1키로 상품인 경우 (기존 로직)
          if (productKilo === 1) {
            const itemNumber = Array.from(productMap.keys())[0];
            return {
              itemNumber,
              quantity: requestedQuantity,
              confidence: 0.95,
              pattern: 'KILO_QUANTITY',
              productName: product.title || product.name,
              similarity: 0.95,
              debugInfo: {
                originalComment: comment,
                extractedProductName: `${requestedQuantity}${unit}`,
                matchedProduct: product,
                similarityScore: 0.95,
                reason: `"${requestedQuantity}${unit}" interpreted as quantity for "1${unit}" product`
              }
            };
          }
        }
      }
    }
    // "반박스" 같은 특수 패턴 먼저 체크 
    const halfPattern = normalized.match(/^반\s*(박스|통|봉지)$/);
    if (halfPattern) {
      const unit = halfPattern[1];
      // "반박스"가 상품명인지 확인
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        // 상품명에 "반박스"가 포함되어 있으면 그 상품 선택
        if (productTitle.includes('반' + unit) || productTitle.includes('반 ' + unit)) {
          return {
            itemNumber,
            quantity: 1,
            confidence: 0.95,
            pattern: 'HALF_UNIT_PRODUCT',
            productName: '반' + unit,
            similarity: 0.95,
            debugInfo: {
              originalComment: comment,
              extractedProductName: '반' + unit,
              matchedProduct: product,
              similarityScore: 0.95,
              reason: `"반${unit}" matched as product name, not half quantity`
            }
          };
        }
      }
      // 상품명에 없으면 일반 상품 1개로 처리 (소수점 수량 방지)
      // 일반 박스/통 상품 찾기
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        if (productTitle.includes(unit) && !productTitle.includes('반')) {
          return {
            itemNumber,
            quantity: 1,
            confidence: 0.8,
            pattern: 'HALF_AS_ONE',
            productName: unit,
            similarity: 0.8,
            debugInfo: {
              originalComment: comment,
              extractedProductName: '반' + unit,
              matchedProduct: product,
              similarityScore: 0.8,
              reason: `"반${unit}" interpreted as 1 unit (integer quantity required)`
            }
          };
        }
      }
    }
    // 🔥 "1박스", "2박스" 등 박스 관련 매칭 (반박스/한박스/1박스 우선순위 처리)
    const boxPattern = normalized.match(/^(\d+|한|두|세)\s*박스/);
    if (boxPattern) {
      const quantityStr = boxPattern[1];
      let quantity = quantityStr === '한' ? 1 : quantityStr === '두' ? 2 : quantityStr === '세' ? 3 : parseInt(quantityStr);
      // 숫자를 한글로 변환하는 매핑
      const numberToKoreanMap = {
        1: '한',
        2: '두',
        3: '세',
        4: '네',
        5: '다섯'
      };
      // 🚨 2개 이상 주문 시 전체 박스 우선 처리 로직
      if (quantity >= 2) {
        // 반박스, 한박스, 1박스 상품 모두 찾기
        let halfBoxProduct = null;
        let fullBoxProduct = null; // 한박스 또는 1박스
        for (const [itemNumber, product] of productMap){
          const productTitle = (product.title || product.name || '').toLowerCase();
          // 반박스 상품
          if (productTitle.includes('반박스') || productTitle.includes('반 박스')) {
            halfBoxProduct = {
              itemNumber,
              product,
              type: 'half'
            };
          }
          // 한박스 상품 (우선순위 1)
          if (productTitle.includes('한박스') || productTitle.includes('한 박스')) {
            fullBoxProduct = {
              itemNumber,
              product,
              type: 'korean-full'
            };
          }
          // 1박스 상품 (우선순위 2) - 한박스가 없을 때만
          if (!fullBoxProduct && (productTitle.includes('1박스') || productTitle.includes('1 박스'))) {
            fullBoxProduct = {
              itemNumber,
              product,
              type: 'number-full'
            };
          }
        }
        // 반박스와 전체박스(한박스 또는 1박스)가 모두 있으면 전체박스 기준으로 처리
        if (halfBoxProduct && fullBoxProduct) {
          return {
            itemNumber: fullBoxProduct.itemNumber,
            quantity: quantity,
            confidence: 0.95,
            pattern: 'MULTI_BOX_FULL_PRIORITY',
            productName: fullBoxProduct.product.title || fullBoxProduct.product.name,
            similarity: 0.95,
            debugInfo: {
              originalComment: comment,
              extractedProductName: quantity + '박스',
              matchedProduct: fullBoxProduct.product,
              similarityScore: 0.95,
              reason: `"${quantity}박스" prioritized to full box (${fullBoxProduct.type}): ${quantity} × ${fullBoxProduct.type === 'korean-full' ? '한박스' : '1박스'}`
            }
          };
        }
      }
      // 먼저 "N박스" → "N박" 상품 찾기
      const packProductKey = quantity + '박';
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        if (productTitle.includes(packProductKey)) {
          return {
            itemNumber,
            quantity: 1,
            confidence: 0.95,
            pattern: 'BOX_TO_PACK',
            productName: product.title || product.name,
            similarity: 0.95,
            debugInfo: {
              originalComment: comment,
              extractedProductName: quantity + '박스',
              matchedProduct: product,
              similarityScore: 0.95,
              reason: `"${quantity}박스" matched to "${packProductKey}" product`
            }
          };
        }
      }
      // "N박" 상품이 없으면 "N박스" → "한글박스" 또는 "숫자박스" 매칭 시도
      const koreanQuantity = numberToKoreanMap[quantity];
      // 한글 박스 매칭 (한박스, 두박스 등)
      if (koreanQuantity) {
        const koreanBoxKey = koreanQuantity + '박스';
        for (const [itemNumber, product] of productMap){
          const productTitle = (product.title || product.name || '').toLowerCase();
          if (productTitle.includes(koreanBoxKey) || productTitle.includes(koreanQuantity + ' 박스')) {
            return {
              itemNumber,
              quantity: 1,
              confidence: 0.95,
              pattern: 'NUMBER_TO_KOREAN_BOX',
              productName: product.title || product.name,
              similarity: 0.95,
              debugInfo: {
                originalComment: comment,
                extractedProductName: quantity + '박스',
                matchedProduct: product,
                similarityScore: 0.95,
                reason: `"${quantity}박스" converted to "${koreanBoxKey}" and matched`
              }
            };
          }
        }
      }
      // 숫자 박스 매칭 (1박스, 2박스 등)
      const numberBoxKey = quantity + '박스';
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        if (productTitle.includes(numberBoxKey) || productTitle.includes(quantity + ' 박스')) {
          return {
            itemNumber,
            quantity: 1,
            confidence: 0.95,
            pattern: 'NUMBER_BOX_DIRECT',
            productName: product.title || product.name,
            similarity: 0.95,
            debugInfo: {
              originalComment: comment,
              extractedProductName: quantity + '박스',
              matchedProduct: product,
              similarityScore: 0.95,
              reason: `"${quantity}박스" matched directly to "${numberBoxKey}" product`
            }
          };
        }
      }
    }
    // 🎯 순수 숫자 주문에 대한 가격 최적화 (예: "4개요" → 최적 조합)
    const pureNumberPattern2 = normalized.match(/^(\d+)\s*개?\s*요?$/);
    if (pureNumberPattern2) {
      const requestedQuantity = parseInt(pureNumberPattern2[1]);
      const optimized = this.findOptimalPriceMatch(requestedQuantity, productMap);
      if (optimized) {
        return optimized;
      }
    }
    // "1봉지", "2박스", "1봉" 같은 패턴 체크 (숫자-한글 변환 포함)
    const unitPattern = normalized.match(/^(\d+)\s*(봉지|봉|박스|개|통|팩|세트|묶음)/);
    if (unitPattern) {
      const quantity = parseInt(unitPattern[1]);
      const unit = unitPattern[2];
      // 숫자를 한글로 변환하는 매핑
      const numberToKoreanMap = {
        1: '한',
        2: '두',
        3: '세',
        4: '네',
        5: '다섯'
      };
      // 해당 단위를 가진 상품 찾기
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        // 단위가 일치하고 수량이 일치하는 상품 찾기
        // "봉"이 요청되었을 때 "봉지"가 있는 상품도 매칭되도록 처리
        const unitToCheck = unit === '봉' ? '봉지' : unit;
        if (productTitle.includes(unitToCheck) || unit === '봉' && productTitle.includes('봉지')) {
          const titleQuantityMatch = productTitle.match(/(\d+)\s*(봉지|봉|박스|개|통|팩|세트|묶음)/);
          if (titleQuantityMatch) {
            const titleQuantity = parseInt(titleQuantityMatch[1]);
            if (titleQuantity === quantity) {
              return {
                itemNumber,
                quantity: 1,
                confidence: 0.9,
                pattern: 'UNIT_ONLY',
                productName: unit,
                similarity: 0.9,
                debugInfo: {
                  originalComment: comment,
                  extractedProductName: unit,
                  matchedProduct: product,
                  similarityScore: 0.9
                }
              };
            }
          }
        }
      }
      // 숫자를 한글로 변환하여 매칭 시도 (예: "1개" → "한개")
      const koreanQuantity = numberToKoreanMap[quantity];
      if (koreanQuantity) {
        const koreanUnitKey = koreanQuantity + unit;
        for (const [itemNumber, product] of productMap){
          const productTitle = (product.title || product.name || '').toLowerCase();
          if (productTitle.includes(koreanUnitKey) || productTitle.includes(koreanQuantity + ' ' + unit)) {
            return {
              itemNumber,
              quantity: 1,
              confidence: 0.9,
              pattern: 'NUMBER_TO_KOREAN_UNIT',
              productName: koreanUnitKey,
              similarity: 0.9,
              debugInfo: {
                originalComment: comment,
                extractedProductName: quantity + unit,
                matchedProduct: product,
                similarityScore: 0.9,
                reason: `"${quantity}${unit}" converted to "${koreanUnitKey}" and matched`
              }
            };
          }
        }
      }
      // 정확한 매칭이 없으면 첫 번째 해당 단위 상품 반환
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        const unitToCheck = unit === '봉' ? '봉지' : unit;
        if (productTitle.includes(unitToCheck) || unit === '봉' && productTitle.includes('봉지')) {
          return {
            itemNumber,
            quantity,
            confidence: 0.7,
            pattern: 'UNIT_ONLY',
            productName: unit,
            similarity: 0.7,
            debugInfo: {
              originalComment: comment,
              extractedProductName: unit,
              matchedProduct: product,
              similarityScore: 0.7
            }
          };
        }
      }
    }
    // 상품명 추출
    const productName = this.extractProductName(normalized);
    if (!productName) {
      return null;
    }
    // 🔥 "N알" 패턴 특별 처리 - productMap에서 정확히 매칭되는 상품 찾기
    const eggPattern = /^(\d+)\s*알$/;
    const eggMatch = productName.match(eggPattern);
    if (eggMatch) {
      // productMap에서 정확한 "N알" 상품 찾기
      for (const [itemNumber, product] of productMap.entries()){
        const title = (product.title || product.name || '').toLowerCase();
        // 정확한 "3알" 패턴 매칭
        if (title.includes(productName.toLowerCase())) {
          return {
            itemNumber,
            quantity: 1,
            confidence: 0.95,
            pattern: 'EGG_PRODUCT_EXACT',
            productName,
            similarity: 1.0,
            debugInfo: {
              originalComment: comment,
              extractedProductName: productName,
              matchedProduct: product,
              similarityScore: 1.0,
              matchType: 'exact_egg_pattern'
            }
          };
        }
      }
      logger.info('정확한 상품 매치 실패, 유사도 매칭으로 전환', {
        productName
      });
    }
    // similarityMatching 호출
    const similarityResult = findBestProductMatch(productName, productMap);
    if (!similarityResult || similarityResult.confidence < 0.5) {
      return null;
    }
    // 수량 추출
    const quantity = this.extractQuantity(normalized) || 1;
    // 결과 구성
    const matchedProduct = productMap.get(similarityResult.itemNumber);
    return {
      itemNumber: similarityResult.itemNumber,
      quantity,
      confidence: this.adjustConfidence(similarityResult.confidence, productName, matchedProduct),
      pattern: 'PRODUCT_NAME',
      productName: matchedProduct.title || matchedProduct.name,
      similarity: similarityResult.confidence,
      debugInfo: {
        originalComment: comment,
        extractedProductName: productName,
        matchedProduct,
        similarityScore: similarityResult.confidence
      }
    };
  }
  /**
   * 복합 상품명 매칭
   * "레몬 1봉지", "사과 2박스" 등
   */ static matchWithQuantity(comment, productMap) {
    if (!productMap || productMap.size === 0) {
      return [];
    }
    let normalized = this.normalizeComment(comment);
    // 🔥 슬래시 구분 패턴 처리: "이름/전화/지점/상품수량"
    // 예: "강복순/1226/상무점/꼬막1" → "꼬막1"
    const slashMatch = comment.match(/^([가-힣]+)\/(\d{3,4})\/([가-힣]+점?)\/([가-힣]+\d*)/);
    if (slashMatch) {
      const productPart = slashMatch[4]; // "꼬막1"
      normalized = this.normalizeComment(productPart);
    }
    const results = [];
    // 🔥 "2키로" 같은 특별 케이스 먼저 처리
    const kiloPattern = normalized.match(/^(\d+)\s*(키로|kg)$/);
    if (kiloPattern) {
      const requestedQuantity = parseInt(kiloPattern[1]);
      const unit = kiloPattern[2];
      // "1키로" 상품 찾기
      for (const [itemNumber, product] of productMap){
        const productTitle = (product.title || product.name || '').toLowerCase();
        if (productTitle.match(/1\s*(키로|kg)/)) {
          results.push({
            itemNumber,
            quantity: requestedQuantity,
            confidence: 0.95,
            pattern: 'KILO_QUANTITY_MULTI',
            productName: product.title || product.name,
            similarity: 0.95,
            debugInfo: {
              originalComment: comment,
              extractedProductName: `${requestedQuantity}${unit}`,
              matchedProduct: product,
              similarityScore: 0.95,
              reason: `"${requestedQuantity}${unit}" as quantity for "1${unit}" product`
            }
          });
          return results; // 찾았으면 바로 반환
        }
      }
    }
    // 상품명 + 수량 패턴 찾기
    const patterns = [
      // "레몬 2봉지", "레몬 2봉"
      /([가-힣]+)\s*(\d+)\s*(개|박스|봉지|봉|통|팩|세트|묶음)/g,
      // "레몬2봉지", "레몬2봉" (공백 없음)
      /([가-힣]+)(\d+)(개|박스|봉지|봉|통|팩|세트|묶음)/g,
      // "레몬 한봉지", "레몬 한봉"
      /([가-힣]+)\s*(하나|둘|셋|한|두|세)\s*(개|박스|봉지|봉|통|팩|세트|묶음)/g,
      // 🔥 "불고기4", "찌개1" (단위 없는 숫자)
      /([가-힣]{2,})(\d+)(?![가-힣])/g
    ];
    // 🔥 중복 매칭 방지를 위한 Set
    const processedMatches = new Set();
    for (const pattern of patterns){
      let match;
      while((match = pattern.exec(normalized)) !== null){
        const productName = match[1];
        const quantityStr = match[2];
        const unit = match[3] || ''; // 단위가 없을 수 있음
        // 🔥 중복 체크: 이미 처리한 매칭은 건너뛰기
        const matchKey = `${productName}_${quantityStr}_${unit}`;
        if (processedMatches.has(matchKey)) {
          continue;
        }
        processedMatches.add(matchKey);
        // 수량 파싱
        const quantity = this.parseQuantity(quantityStr);
        // 상품명과 수량 매칭
        let bestMatch = null;
        let bestScore = 0;
        // 각 상품과 비교
        for (const [itemNumber, product] of productMap){
          const productTitle = (product.title || product.name || '').toLowerCase();
          // 🔥 단위가 있는 경우: 정확한 매칭 확인 (레몬 2봉지 -> 레몬 2봉지)
          if (unit && (productTitle.includes(`${productName} ${quantity}${unit}`) || productTitle.includes(`${productName}${quantity}${unit}`))) {
            bestMatch = {
              itemNumber,
              confidence: 0.95
            };
            break;
          }
          // 🔥 단위가 없는 경우: 상품명만 매칭하고 수량은 별도 처리 (불고기4 -> 한우불고기)
          if (!unit && productTitle.includes(productName)) {
            const similarity = findBestProductMatch(productName, new Map([
              [
                itemNumber,
                product
              ]
            ]));
            if (similarity && similarity.confidence > bestScore) {
              bestMatch = {
                itemNumber,
                confidence: similarity.confidence
              };
              bestScore = similarity.confidence;
            }
          }
          // 상품명과 단위가 모두 일치하는지 확인
          if (productTitle.includes(productName) && productTitle.includes(unit)) {
            // 수량도 일치하는지 확인
            const titleQuantityMatch = productTitle.match(/(\d+)/);
            if (titleQuantityMatch && parseInt(titleQuantityMatch[1]) === quantity) {
              bestMatch = {
                itemNumber,
                confidence: 0.9
              };
              break;
            }
          }
        }
        // 정확한 매칭이 없으면 similarityMatching 사용
        if (!bestMatch) {
          const similarityResult = findBestProductMatch(productName, productMap);
          if (similarityResult && similarityResult.confidence > 0.6) {
            bestMatch = similarityResult;
          }
        }
        if (bestMatch) {
          const matchedProduct = productMap.get(bestMatch.itemNumber);
          // 🔥 단위가 없는 경우 (불고기4, 찌개1) 추출된 수량 사용
          const finalQuantity = !unit ? quantity : 1;
          results.push({
            itemNumber: bestMatch.itemNumber,
            quantity: finalQuantity,
            confidence: bestMatch.confidence || 0.8,
            pattern: 'PRODUCT_NAME_WITH_QUANTITY',
            productName,
            similarity: bestMatch.confidence,
            debugInfo: {
              originalComment: comment,
              extractedProductName: productName,
              matchedProduct,
              similarityScore: bestMatch.confidence,
              reason: `Pattern: ${unit ? 'with unit' : 'no unit'}, extracted quantity: ${quantity}, final: ${finalQuantity}`
            }
          });
        }
      }
    }
    return results;
  }
  /**
   * 상품명 추출
   */ static extractProductName(text) {
    // 🔥 "N알" 패턴이면 전체를 상품명으로 간주
    const eggPattern = /^\d+\s*알(\s*이?\s*요?)?$/;
    if (eggPattern.test(text.trim())) {
      return text.trim().replace(/(\s*이?\s*요?)?$/, ''); // "3알요" → "3알"
    }
    // 불필요한 부분 제거
    const cleaned = text.replace(/\d+\s*(개|박스|봉지|봉|통|팩|세트|묶음|kg|병)/g, '') // 알 제외
    .replace(/(주세요|부탁|드려요|드립니다|요)$/g, '').replace(/\d+번/g, '').replace(/\d+$/g, '') // 🔥 끝에 오는 단위없는 숫자 제거 (전복1 → 전복)
    .replace(/\s+/g, ' ').trim();
    // 🔥 2글자 이상의 한글 모두 추출하되, 지역명/점포명은 제외
    const locationPatterns = /점$|상무점|봉선점|풍암점|수완점|광천점|하남점|동명점|월계점|광주점/;
    const allMatches = cleaned.match(/[가-힣]{2,}/g);
    if (!allMatches) return null;
    // 지역명이 아닌 첫 번째 한글 단어 선택
    let productName = null;
    for (const match of allMatches){
      if (!locationPatterns.test(match)) {
        productName = match;
        break;
      }
    }
    // 지역명만 있고 상품명이 없는 경우
    if (!productName) return null;
    // 🔥 너무 일반적인 키워드는 더 구체적인 매칭 시도
    const tooGenericKeywords = [
      '찌개',
      '제육',
      '불고기',
      '국거리'
    ];
    if (tooGenericKeywords.includes(productName)) {
      // 더 구체적인 키워드 찾기 시도 (원본 텍스트에서)
      const specificPatterns = [
        /([가-힣]*찌개[가-힣]*)/,
        /([가-힣]*제육[가-힣]*)/,
        /([가-힣]*불고기[가-힣]*)/,
        /([가-힣]*국거리[가-힣]*)/ // "한우국거리", "소국거리" 등
      ];
      for (const pattern of specificPatterns){
        const specificMatch = text.match(pattern);
        if (specificMatch && specificMatch[1].length > productName.length) {
          productName = specificMatch[1];
          break;
        }
      }
    }
    return productName;
  }
  /**
   * 수량 추출
   */ static extractQuantity(text) {
    // 🔥 모든 상품명+숫자 패턴을 찾아서 4자리가 아닌 유효한 수량을 선택
    const allMatches = [
      ...text.matchAll(/([가-힣]{2,})\s*(\d+)(?!번|개|박스|봉|통|팩|세트|묶음|kg|병|알)/g)
    ];
    for (const match of allMatches){
      const quantity = parseInt(match[2]);
      const productName = match[1];
      // 🔥 4자리 숫자는 점포코드/지역번호이므로 건너뜀 (상무점9998 같은 패턴)
      if (quantity >= 1000 && quantity <= 9999) {
        continue;
      }
      // 유효한 수량(1-99)을 찾으면 반환
      if (quantity >= 1 && quantity <= 99) {
        return quantity;
      }
    }
    // 숫자 + 단위 패턴
    const numberMatch = text.match(this.QUANTITY_PATTERNS.NUMBER_UNIT);
    if (numberMatch) {
      const quantity = parseInt(numberMatch[1]);
      // 🔥 4자리 숫자는 점포코드/지역번호이므로 제외
      if (quantity >= 1000 && quantity <= 9999) {
        return null;
      }
      return quantity;
    }
    // 한글 수량 패턴
    const koreanMatch = text.match(this.QUANTITY_PATTERNS.KOREAN_UNIT);
    if (koreanMatch) {
      const normalized = koreanMatch[1].replace(/\s+/g, '');
      return this.KOREAN_QUANTITY[normalized] || null;
    }
    // 특수 수량 처리는 match 메서드에서 처리하므로 여기서는 제거
    // "반박스"는 상품명일 수도 있고 수량일 수도 있으므로
    // 상품 맥락이 없는 이 메서드에서는 처리하지 않음
    return null;
  }
  /**
   * 수량 문자열 파싱
   */ static parseQuantity(str) {
    const num = parseInt(str);
    if (!isNaN(num)) {
      return num;
    }
    // 한글 수량
    const koreanMap = {
      '하나': 1,
      '한': 1,
      '둘': 2,
      '두': 2,
      '셋': 3,
      '세': 3,
      '넷': 4,
      '네': 4,
      '다섯': 5,
      '여섯': 6,
      '일곱': 7,
      '여덟': 8,
      '아홉': 9,
      '열': 10
    };
    return koreanMap[str] || 1;
  }
  /**
   * 단위 일치 확인
   */ static checkUnitMatch(product, unit) {
    if (!product || !product.title) {
      return false;
    }
    const title = product.title.toLowerCase();
    return title.includes(unit);
  }
  /**
   * 신뢰도 조정
   */ static adjustConfidence(baseConfidence, productName, matchedProduct) {
    let confidence = baseConfidence;
    // 상품명이 정확히 일치하면 신뢰도 상승
    if (matchedProduct && matchedProduct.title) {
      const title = matchedProduct.title.toLowerCase();
      if (title.includes(productName)) {
        confidence = Math.min(1, confidence + 0.1);
      }
    }
    // 상품명이 너무 짧으면 신뢰도 하락
    if (productName.length < 2) {
      confidence = Math.max(0.3, confidence - 0.2);
    }
    return confidence;
  }
  /**
   * 가격 최적화 매칭
   * 동일한 개수를 만들 수 있는 조합 중 가장 저렴한 조합 선택
   */ static findOptimalPriceMatch(requestedQuantity, productMap) {
    if (requestedQuantity <= 0 || !productMap || productMap.size === 0) {
      return null;
    }
    // 가능한 모든 조합 생성
    const combinations = [];
    // 각 상품의 단위 개수와 가격 정보 추출
    const productInfo = [];
    for (const [itemNumber, product] of productMap){
      const title = (product.title || product.name || '').toLowerCase();
      const price = product.price || product.base_price || product.basePrice || 0;
      // 상품명에서 개수 추출 (예: "애호박 2개" → 2)
      const countMatch = title.match(/(\d+)\s*개/);
      const unitCount = countMatch ? parseInt(countMatch[1]) : 1;
      productInfo.push({
        itemNumber,
        unitCount,
        price,
        product
      });
    }
    // 단일 상품으로 정확히 맞는 경우 찾기
    for (const info of productInfo){
      if (requestedQuantity % info.unitCount === 0) {
        const needQuantity = requestedQuantity / info.unitCount;
        const totalCost = info.price * needQuantity;
        combinations.push({
          combination: [
            {
              itemNumber: info.itemNumber,
              quantity: needQuantity,
              unitCount: info.unitCount,
              unitPrice: info.price
            }
          ],
          totalCost,
          totalCount: requestedQuantity
        });
      }
    }
    // 조합으로 만들 수 있는 경우 찾기 (2개 조합까지만)
    for(let i = 0; i < productInfo.length; i++){
      for(let j = i; j < productInfo.length; j++){
        const product1 = productInfo[i];
        const product2 = productInfo[j];
        // 두 상품의 조합으로 정확히 requestedQuantity를 만들 수 있는지 확인
        for(let qty1 = 0; qty1 * product1.unitCount <= requestedQuantity; qty1++){
          const remaining = requestedQuantity - qty1 * product1.unitCount;
          if (remaining >= 0 && remaining % product2.unitCount === 0) {
            const qty2 = remaining / product2.unitCount;
            if (qty1 + qty2 > 0) {
              const totalCost = product1.price * qty1 + product2.price * qty2;
              const combo = [];
              if (qty1 > 0) combo.push({
                itemNumber: product1.itemNumber,
                quantity: qty1,
                unitCount: product1.unitCount,
                unitPrice: product1.price
              });
              if (qty2 > 0) combo.push({
                itemNumber: product2.itemNumber,
                quantity: qty2,
                unitCount: product2.unitCount,
                unitPrice: product2.price
              });
              combinations.push({
                combination: combo,
                totalCost,
                totalCount: requestedQuantity
              });
            }
          }
        }
      }
    }
    // 가장 저렴한 조합 선택
    if (combinations.length === 0) {
      return null;
    }
    const bestCombination = combinations.reduce((best, current)=>current.totalCost < best.totalCost ? current : best);
    // 가장 간단한 조합을 반환 (단일 상품 우선)
    if (bestCombination.combination.length === 1) {
      const item = bestCombination.combination[0];
      const product = productMap.get(item.itemNumber);
      return {
        itemNumber: item.itemNumber,
        quantity: item.quantity,
        confidence: 0.95,
        pattern: 'PRICE_OPTIMIZED_SINGLE',
        productName: `${item.unitCount}개`,
        similarity: 0.95,
        debugInfo: {
          originalComment: `${requestedQuantity}개`,
          extractedProductName: `${requestedQuantity}개`,
          matchedProduct: product,
          similarityScore: 0.95,
          reason: `Optimized: ${requestedQuantity}개 = ${item.unitCount}개 × ${item.quantity} (₩${bestCombination.totalCost.toLocaleString()})`
        }
      };
    }
    // 복합 조합인 경우 첫 번째 항목 반환 (향후 개선 필요)
    const firstItem = bestCombination.combination[0];
    const product = productMap.get(firstItem.itemNumber);
    return {
      itemNumber: firstItem.itemNumber,
      quantity: firstItem.quantity,
      confidence: 0.9,
      pattern: 'PRICE_OPTIMIZED_COMBO',
      productName: `${firstItem.unitCount}개`,
      similarity: 0.9,
      debugInfo: {
        originalComment: `${requestedQuantity}개`,
        extractedProductName: `${requestedQuantity}개`,
        matchedProduct: product,
        similarityScore: 0.9,
        reason: `Best combo: ${requestedQuantity}개 = ${bestCombination.combination.map((c)=>`${c.unitCount}개×${c.quantity}`).join(' + ')} (₩${bestCombination.totalCost.toLocaleString()})`
      }
    };
  }
  /**
   * 댓글 정규화
   */ static normalizeComment(comment) {
    return comment.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
