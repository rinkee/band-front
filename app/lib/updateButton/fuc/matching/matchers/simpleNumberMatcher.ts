/**
 * 단순 숫자 매처
 * 단일상품: 숫자를 찾아 수량으로 변환
 * QUANTITY_VARIANT: OptimalPriceCalculator로 최적 가격 계산
 * "2", "2개", "2세트", "한세트", "4봉" 등 모든 수량 표현 처리
 */
import { OptimalPriceCalculator } from '../../utils/optimalPriceCalculator';
import { ProductPatternClassifier } from '../../utils/productPatternClassifier';
export class SimpleNumberMatcher {
  /**
   * 숫자 패턴 매칭 (단일상품 + QUANTITY_VARIANT)
   * 단일상품: 숫자를 찾아 수량으로 변환
   * QUANTITY_VARIANT: OptimalPriceCalculator로 최적 가격 계산
   */ static match(comment, productMap, isSingleProduct) {
    // 🔥 전처리: 고객정보 제거 (RecursivePatternMatcher와 동일한 로직 사용)
    const preprocessed = this.preprocessComment(comment);
    const normalized = preprocessed.trim().toLowerCase();
    // 단일상품인지 확인
    const isSingle = isSingleProduct !== undefined ? isSingleProduct : productMap?.size === 1;
    const normalizeNumber = (value)=>{
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.replace(/[^0-9.]/g, '');
        if (normalized.length === 0) return NaN;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
      }
      return NaN;
    };
    const resolveUnitPrice = (product)=>{
      if (!product) return 0;
      const candidates = [
        product.price,
        product.basePrice,
        product.base_price
      ];
      for (const candidate of candidates){
        const normalized = normalizeNumber(candidate);
        if (Number.isFinite(normalized) && normalized > 0) {
          return normalized;
        }
      }
      return 0;
    };
    const computeUnitPrice = (totalPrice, quantity)=>{
      const normalizedTotal = normalizeNumber(totalPrice);
      if (!Number.isFinite(normalizedTotal)) {
        return 0;
      }
      const divisor = quantity && quantity > 0 ? quantity : 1;
      return normalizedTotal / divisor;
    };
    console.log(`[SimpleNumberMatcher] 댓글: "${comment}" → 전처리: "${preprocessed}" → 정규화: "${normalized}", 단일상품: ${isSingle}, productMap크기: ${productMap?.size}`);
    // 🔥 QUANTITY_VARIANT 패턴 체크 (단일상품이라도 variantType이 지정되면 포함)
    const mapHasQuantityVariant = (map)=>{
      if (!map || map.size === 0) return false;
      for (const product of map.values()){
        const variant = product?.variantType || product?.variant_type || product?.products_data?.variantType;
        if (variant === 'QUANTITY_VARIANT') {
          return true;
        }
      }
      return false;
    };
    let isQuantityVariant = false;
    if (productMap && productMap.size > 0) {
      if (mapHasQuantityVariant(productMap)) {
        isQuantityVariant = true;
        console.log('[SimpleNumberMatcher] variantType 기반 QUANTITY_VARIANT 감지');
      } else if (!isSingle && productMap.size > 1) {
        const pattern = ProductPatternClassifier.classify(productMap);
        isQuantityVariant = pattern.type === 'QUANTITY_VARIANT' && pattern.useOptimalPrice;
        console.log(`[SimpleNumberMatcher] 패턴 체크: ${pattern.type}, 최적가격사용: ${pattern.useOptimalPrice}, QUANTITY_VARIANT: ${isQuantityVariant}`);
      }
    }
    // 단일상품이 아니고 QUANTITY_VARIANT도 아니면 처리하지 않음
    if (!isSingle && !isQuantityVariant) {
      console.log(`[SimpleNumberMatcher] 단일상품도 아니고 QUANTITY_VARIANT도 아니므로 null 반환`);
      return null;
    }
    // 🔥 단일상품에서 모든 수량 패턴을 찾아서 처리
    // 1. 한글 수량 패턴 (한세트, 두세트, 한개, 두개 등)
    const koreanQuantityPattern = /^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(세트|개|봉|박스|포)?$/;
    const koreanQuantityMatch = normalized.match(koreanQuantityPattern);
    console.log(`[SimpleNumberMatcher] 한글 수량 패턴 테스트: "${normalized}" → ${koreanQuantityMatch ? '매치됨' : '매치안됨'}`);
    if (koreanQuantityMatch) {
      const koreanToNumber = {
        '한': 1,
        '두': 2,
        '세': 3,
        '네': 4,
        '다섯': 5,
        '여섯': 6,
        '일곱': 7,
        '여덟': 8,
        '아홉': 9,
        '열': 10
      };
      const quantity = koreanToNumber[koreanQuantityMatch[1]];
      console.log(`[SimpleNumberMatcher] 한글 수량 변환: "${koreanQuantityMatch[1]}" → ${quantity}`);
      if (quantity) {
        if (isQuantityVariant) {
          // QUANTITY_VARIANT: OptimalPriceCalculator 사용
          const bestOption = OptimalPriceCalculator.findBestOption(quantity, productMap, comment);
          if (bestOption) {
            console.log(`[SimpleNumberMatcher] QUANTITY_VARIANT 한글수량 최적가격: ${quantity}개 → ${bestOption.product.title} × ${bestOption.finalQuantity} = ${bestOption.totalPrice}원`);
            const totalPrice = normalizeNumber(bestOption.totalPrice);
            const unitPrice = computeUnitPrice(totalPrice, bestOption.finalQuantity);
            return {
              itemNumber: bestOption.itemNumber || bestOption.product.itemNumber,
              quantity: bestOption.finalQuantity,
              confidence: 0.95,
              pattern: 'KOREAN_QUANTITY_OPTIMAL',
              isQuantityOnly: true,
              price: unitPrice,
              totalPrice,
              debugInfo: {
                originalComment: comment,
                extractedNumber: quantity,
                interpretedAs: 'optimal_quantity',
                representativeProduct: bestOption.product,
                optimalReason: bestOption.reason,
                totalPrice
              }
            };
          }
        } else {
          // 단일상품: 직접 첫 번째 상품 선택
          const firstProduct = productMap ? Array.from(productMap.values())[0] : null;
          const itemNumber = firstProduct?.itemNumber || Array.from(productMap?.keys() || [])[0] || 1;
          console.log(`[SimpleNumberMatcher] 한글 수량 매칭 성공: ${quantity}개, itemNumber: ${itemNumber}, 첫번째상품: ${firstProduct?.title || 'null'}`);
          const unitPrice = resolveUnitPrice(firstProduct);
          const totalPrice = unitPrice * quantity;
          return {
            itemNumber,
            quantity,
            confidence: 0.95,
            pattern: 'KOREAN_QUANTITY_SINGLE_PRODUCT',
            isQuantityOnly: true,
            price: unitPrice,
            totalPrice,
            debugInfo: {
              originalComment: comment,
              extractedNumber: quantity,
              interpretedAs: 'quantity',
              representativeProduct: firstProduct,
              totalPrice
            }
          };
        }
      }
    }
    // 2. 숫자+단위 패턴 (2세트, 3개, 5봉 등)  
    const numberUnitPattern = /^(\d+)(세트|개|봉|박스|포)?$/;
    const numberUnitMatch = normalized.match(numberUnitPattern);
    if (numberUnitMatch) {
      const quantity = parseInt(numberUnitMatch[1]);
      const unit = numberUnitMatch[2] || '';
      if (quantity > 0 && quantity <= 100) {
        if (isQuantityVariant) {
          // 🔥 QUANTITY_VARIANT에서 단위 패턴 특별 처리
          // "4봉" → 4봉 상품 찾기, 없으면 OptimalPriceCalculator
          if (unit) {
            // 단위가 있으면 해당 단위 상품 찾기
            for (const [itemNumber, product] of productMap.entries()){
              const title = (product.title || product.name || '').toLowerCase();
              const unitPattern = `${quantity}${unit}`;
              if (title.includes(unitPattern)) {
                console.log(`[SimpleNumberMatcher] 단위 매칭: "${comment}" → "${title}" (${itemNumber})`);
                const unitPrice = resolveUnitPrice(product);
                return {
                  itemNumber,
                  quantity: 1,
                  confidence: 0.98,
                  pattern: 'UNIT_DIRECT_MATCH',
                  isQuantityOnly: false,
                  price: unitPrice,
                  totalPrice: unitPrice,
                  debugInfo: {
                    originalComment: comment,
                    extractedNumber: quantity,
                    interpretedAs: 'item_number',
                    representativeProduct: product,
                    strategy: `${unitPattern} 상품 직접 매칭`,
                    totalPrice: unitPrice
                  }
                };
              }
            }
          }
          // 직접 매칭 실패하면 OptimalPriceCalculator 사용
          const bestOption = OptimalPriceCalculator.findBestOption(quantity, productMap, comment);
          if (bestOption) {
            console.log(`[SimpleNumberMatcher] QUANTITY_VARIANT 숫자+단위 최적가격: ${quantity}${unit} → ${bestOption.product.title} × ${bestOption.finalQuantity} = ${bestOption.totalPrice}원`);
            const totalPrice = normalizeNumber(bestOption.totalPrice);
            const unitPrice = computeUnitPrice(totalPrice, bestOption.finalQuantity);
            return {
              itemNumber: bestOption.itemNumber || bestOption.product.itemNumber,
              quantity: bestOption.finalQuantity,
              confidence: 0.95,
              pattern: 'NUMBER_UNIT_OPTIMAL',
              isQuantityOnly: true,
              price: unitPrice,
              totalPrice,
              debugInfo: {
                originalComment: comment,
                extractedNumber: quantity,
                interpretedAs: 'optimal_quantity',
                representativeProduct: bestOption.product,
                optimalReason: bestOption.reason,
                totalPrice
              }
            };
          }
        } else {
          // 단일상품: 직접 첫 번째 상품 선택
          const firstProduct = productMap ? Array.from(productMap.values())[0] : null;
          const itemNumber = firstProduct?.itemNumber || Array.from(productMap?.keys() || [])[0] || 1;
          console.log(`[SimpleNumberMatcher] 숫자+단위 매칭 성공: ${quantity}개, itemNumber: ${itemNumber}`);
          const unitPrice = resolveUnitPrice(firstProduct);
          const totalPrice = unitPrice * quantity;
          return {
            itemNumber,
            quantity,
            confidence: 0.95,
            pattern: 'NUMBER_UNIT_SINGLE_PRODUCT',
            isQuantityOnly: true,
            price: unitPrice,
            totalPrice,
            debugInfo: {
              originalComment: comment,
              extractedNumber: quantity,
              interpretedAs: 'quantity',
              representativeProduct: firstProduct,
              totalPrice
            }
          };
        }
      }
    }
    // 3. 댓글 내에서 숫자 추출 (복합 패턴: "저도 2개 주세요", "3개 부탁해요" 등)
    const numberInTextPattern = /(\d+)\s*(세트|개|봉|박스|포|개\s*주세요|개\s*부탁|세트\s*주세요|세트\s*부탁)?/;
    const numberInTextMatch = normalized.match(numberInTextPattern);
    if (numberInTextMatch) {
      const quantity = parseInt(numberInTextMatch[1]);
      if (quantity > 0 && quantity <= 100) {
        if (isQuantityVariant) {
          // QUANTITY_VARIANT: OptimalPriceCalculator 사용
          const bestOption = OptimalPriceCalculator.findBestOption(quantity, productMap, comment);
          if (bestOption) {
            console.log(`[SimpleNumberMatcher] QUANTITY_VARIANT 텍스트내숫자 최적가격: ${quantity}개 → ${bestOption.product.title} × ${bestOption.finalQuantity} = ${bestOption.totalPrice}원`);
            const totalPrice = normalizeNumber(bestOption.totalPrice);
            const unitPrice = computeUnitPrice(totalPrice, bestOption.finalQuantity);
            return {
              itemNumber: bestOption.itemNumber || bestOption.product.itemNumber,
              quantity: bestOption.finalQuantity,
              confidence: 0.9,
              pattern: 'NUMBER_IN_TEXT_OPTIMAL',
              isQuantityOnly: true,
              price: unitPrice,
              totalPrice,
              debugInfo: {
                originalComment: comment,
                extractedNumber: quantity,
                interpretedAs: 'optimal_quantity',
                representativeProduct: bestOption.product,
                optimalReason: bestOption.reason,
                totalPrice
              }
            };
          }
        } else {
          // 단일상품: 직접 첫 번째 상품 선택
          const firstProduct = productMap ? Array.from(productMap.values())[0] : null;
          const itemNumber = firstProduct?.itemNumber || Array.from(productMap?.keys() || [])[0] || 1;
          console.log(`[SimpleNumberMatcher] 텍스트내숫자 매칭 성공: ${quantity}개, itemNumber: ${itemNumber}`);
          const unitPrice = resolveUnitPrice(firstProduct);
          const totalPrice = unitPrice * quantity;
          return {
            itemNumber,
            quantity,
            confidence: 0.9,
            pattern: 'NUMBER_IN_TEXT_SINGLE_PRODUCT',
            isQuantityOnly: true,
            price: unitPrice,
            totalPrice,
            debugInfo: {
              originalComment: comment,
              extractedNumber: quantity,
              interpretedAs: 'quantity',
              representativeProduct: firstProduct,
              totalPrice
            }
          };
        }
      }
    }
    // 4. 순수 숫자 패턴 ("2", "3" 등)
    if (/^\d+$/.test(normalized)) {
      const quantity = parseInt(normalized);
      if (quantity > 0 && quantity <= 100) {
        if (isQuantityVariant) {
          // QUANTITY_VARIANT: OptimalPriceCalculator 사용
          const bestOption = OptimalPriceCalculator.findBestOption(quantity, productMap, comment);
          if (bestOption) {
            console.log(`[SimpleNumberMatcher] QUANTITY_VARIANT 순수숫자 최적가격: ${quantity}개 → ${bestOption.product.title} × ${bestOption.finalQuantity} = ${bestOption.totalPrice}원`);
            const totalPrice = normalizeNumber(bestOption.totalPrice);
            const unitPrice = computeUnitPrice(totalPrice, bestOption.finalQuantity);
            return {
              itemNumber: bestOption.itemNumber || bestOption.product.itemNumber,
              quantity: bestOption.finalQuantity,
              confidence: 0.95,
              pattern: 'PURE_NUMBER_OPTIMAL',
              isQuantityOnly: true,
              price: unitPrice,
              totalPrice,
              debugInfo: {
                originalComment: comment,
                extractedNumber: quantity,
                interpretedAs: 'optimal_quantity',
                representativeProduct: bestOption.product,
                optimalReason: bestOption.reason,
                totalPrice
              }
            };
          }
        } else {
          // 단일상품: 직접 첫 번째 상품 선택
          const firstProduct = productMap ? Array.from(productMap.values())[0] : null;
          const itemNumber = firstProduct?.itemNumber || Array.from(productMap?.keys() || [])[0] || 1;
          console.log(`[SimpleNumberMatcher] 순수숫자 매칭 성공: ${quantity}개, itemNumber: ${itemNumber}`);
          const unitPrice = resolveUnitPrice(firstProduct);
          const totalPrice = unitPrice * quantity;
          return {
            itemNumber,
            quantity,
            confidence: 0.95,
            pattern: 'PURE_NUMBER_SINGLE_PRODUCT',
            isQuantityOnly: true,
            price: unitPrice,
            totalPrice,
            debugInfo: {
              originalComment: comment,
              extractedNumber: quantity,
              interpretedAs: 'quantity',
              representativeProduct: firstProduct,
              totalPrice
            }
          };
        }
      }
    }
    // 숫자를 찾지 못하면 null 반환
    return null;
  }
  /**
   * 댓글 전처리: 고객정보 제거
   * RecursivePatternMatcher의 preprocessSlashPattern과 동일한 로직
   */ static preprocessComment(comment) {
    const text = comment.trim();
    // 1. 슬래시 패턴: "이름/전화번호/지점/상품"
    const slashPattern = text.match(/^([가-힣]+)\/(\d{3,4})\/([가-힣]+점?)\/(.+)/);
    if (slashPattern) {
      const productPart = slashPattern[4];
      console.log('[SimpleNumberMatcher] 전처리: 슬래시 패턴', {
        original: text,
        name: slashPattern[1],
        phone: slashPattern[2],
        location: slashPattern[3],
        productPart
      });
      return productPart;
    }
    // 2. 점 패턴: "지점.전화번호이름.상품"
    const dotPattern = text.match(/^([가-힣.]+점?)\.(\d{3,4})([가-힣]+)\.(.+)/);
    if (dotPattern) {
      const productPart = dotPattern[4];
      console.log('[SimpleNumberMatcher] 전처리: 점 패턴', {
        original: text,
        location: dotPattern[1],
        phone: dotPattern[2],
        name: dotPattern[3],
        productPart
      });
      return productPart;
    }
    // 3. "이름 전화번호 지점 상품" 패턴
    const spacePattern = text.match(/^([가-힣]+)\s+(\d{3,4})\s*([가-힣]+점?)?\s*(.+)/);
    if (spacePattern && spacePattern[4]) {
      const productPart = spacePattern[4];
      if (productPart.match(/[가-힣]{2,}/)) {
        console.log('[SimpleNumberMatcher] 전처리: 이름+전화번호+지점 제거', {
          original: text,
          productPart
        });
        return productPart;
      }
    }
    // 4. "이름+상품" 패턴
    const nameProductPattern = text.match(/^([가-힣]{2,3})\s+([가-힣]{2,}.+)/);
    if (nameProductPattern) {
      const productPart = nameProductPattern[2];
      if (productPart.match(/[가-힣]{2,}/) && productPart.match(/\d+/)) {
        console.log('[SimpleNumberMatcher] 전처리: 이름+상품 패턴', {
          original: text,
          productPart
        });
        return productPart;
      }
    }
    // 5. 틸드(~) 패턴: "이름전화번호~지점 ~수량" 
    const tildePattern = text.match(/^([가-힣]+)(\d{3,4})~([가-힣]+점?)\s*~(.+)/);
    if (tildePattern) {
      const productPart = tildePattern[4];
      console.log('[SimpleNumberMatcher] 전처리: 틸드 패턴', {
        original: text,
        name: tildePattern[1],
        phone: tildePattern[2],
        location: tildePattern[3],
        productPart
      });
      return productPart;
    }
    // 6. "이름+지점+전화번호+상품" 패턴
    const complexPattern = text.match(/^([가-힣]+)([가-힣]+점?)(\d{3,4})(.+)/);
    if (complexPattern) {
      const productPart = complexPattern[4];
      if (productPart.match(/^[,가-힣]/)) {
        console.log('[SimpleNumberMatcher] 전처리: 이름+지점+전화번호 패턴', {
          original: text,
          productPart
        });
        return productPart;
      }
    }
    // 전처리할 패턴이 없으면 원본 반환
    return text;
  }
}
