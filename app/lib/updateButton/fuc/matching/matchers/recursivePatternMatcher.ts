/**
 * 재귀적 패턴 매처
 * ProductNameMatcher를 재귀적으로 호출하여 다중 상품 처리
 * "크림스프레이 1 치즈 1" → ProductNameMatcher로 "크림스프레이" 매칭 → 제거 → "치즈 1" 재처리
 */ import { ProductNameMatcher } from './productNameMatcher.ts';
import { OptimalPriceCalculator } from '../../utils/optimalPriceCalculator.ts';
import { ProductPatternClassifier } from '../../utils/productPatternClassifier.ts';
import { normalizeAndTokenize } from '../../utils/textUtils.ts';
import { createLogger } from '../../utils/logger.ts';
const logger = createLogger('RecursivePatternMatcher');
export class RecursivePatternMatcher {
  static MAX_DEPTH = 10;
  static MIN_CONFIDENCE = 0.5;
  static hasQuantityVariant(productMap) {
    if (!productMap || productMap.size === 0) {
      return false;
    }
    for (const product of productMap.values()){
      const variant = product?.variantType || product?.variant_type || product?.products_data?.variantType;
      if (variant === 'QUANTITY_VARIANT') {
        return true;
      }
    }
    return false;
  }
  /**
   * 메인 매칭 함수
   * ProductNameMatcher를 재귀적으로 호출하여 다중 상품 처리
   */ static match(comment, productMap) {
    logger.info('재귀 패턴 매칭 시작', {
      comment
    });
    // 🔥 먼저 전화번호 포함 패턴 전처리 (이름+4자리숫자 등)
    const originalComment = comment;
    let processedComment = this.preprocessSlashPattern(comment);
    if (processedComment !== originalComment) {
      logger.info('전처리로 텍스트 변경됨', {
        original: originalComment,
        processed: processedComment
      });
      // 전처리된 텍스트로 재귀 호출
      return this.match(processedComment, productMap);
    }
    // 🔥 단순 숫자나 상품명+숫자 패턴인 경우 상품 패턴에 따라 처리
    const isSimpleNumber = /^\d+$/.test(comment.trim());
    const isProductWithNumber = /^[가-힣]{2,}\d+$/.test(comment.trim());
    // 🔥 공백이 있는 패턴 추가: "열무김치 1개", "불고기 2", "머루포도 2송이" 등
    const isProductWithSpaceNumber = /^[가-힣]{2,}\s+\d+[개팩봉세트병송이마리근캔통봉지포장묶음단줄알입잔토막쪽망]*$/.test(comment.trim());
    // 🔥 상품명+숫자+기타 패턴 추가: "안심2 봉선점", "목살3 상무점" 등
    const isProductWithNumberAndExtra = /^[가-힣]{2,}\d+\s+/.test(comment.trim());
    // 🔥 다중 상품 패턴 감지: "배추2 석박지1", "배추김치1 석박지 2", "안심1 국거리1" 등
    // 공백이 있거나 없는 다중 상품 패턴을 모두 감지
    // 하지만 단위 패턴("배추김치2키로 1")은 예외 처리
    const hasUnitPattern = /[가-힣]{2,}\d+\s*(키로|kg|박스|개|봉|팩|세트|병|그램|g)\s*\d+/.test(comment.trim());
    const hasMultipleProducts = !hasUnitPattern && (// 패턴 1: "배추2 석박지1" (붙어있는 상품+숫자 패턴 다중개)
    /([가-힣]{2,}\d+)[\s가-힣]*([가-힣]{2,}\d+)/.test(comment.trim()) || // 패턴 2: "배추김치1 석박지 2" (첫번째는 붙어있고, 두번째는 공백분리)
    /([가-힣]{2,}\d+)\s+([가-힣]{2,})\s+(\d+)/.test(comment.trim()) || // 패턴 3: "배추김치 1 석박지 2" (둘 다 공백분리, 최소 2개)
    (comment.trim().match(/([가-힣]{2,})\s+(\d+)/g) || []).length >= 2);
    // 🔥 순수 상품명 패턴 추가: "무", "양파", "브로콜리" 등
    const isPureProductName = /^[가-힣]{1,10}$/.test(comment.trim());
    // 🔥 다중 상품이 감지된 경우 단일 상품 패턴 처리를 건너뛰고 분할 로직으로 진행
    if (hasMultipleProducts) {
      logger.info('다중 상품 패턴 감지, 분할 로직으로 진행', {
        comment: comment.trim(),
        hasMultipleProducts
      });
    // 분할 로직으로 넘어가기 위해 단일 상품 처리를 건너뜀
    } else if ((isSimpleNumber || isProductWithNumber || isProductWithSpaceNumber || isProductWithNumberAndExtra || isPureProductName) && productMap && productMap.size > 0) {
      let quantity = 1;
      let productNameFromComment = null;
      logger.info('🔍 패턴 분석 시작', {
        comment,
        isSimpleNumber,
        isProductWithNumber,
        isProductWithSpaceNumber,
        isProductWithNumberAndExtra,
        isPureProductName,
        productMapSize: productMap.size
      });
      if (isSimpleNumber) {
        // 🔥 단일상품에서만 단순 숫자를 quantity로 해석
        // 다중상품에서는 고객이 단순 숫자로 주문하지 않으므로 처리하지 않음
        if (productMap.size === 1) {
          quantity = parseInt(comment.trim());
          logger.info('단일상품에서 단순 숫자를 quantity로 해석', {
            quantity
          });
        } else {
          logger.info('다중상품에서 단순 숫자는 처리하지 않음', {
            comment,
            productCount: productMap.size,
            reason: '고객이 다중상품에서 단순 숫자로 주문하지 않음'
          });
          return null;
        }
      } else if (isProductWithNumber) {
        // "열무김치2" → productName: "열무김치", quantity: 2
        const match = comment.trim().match(/^([가-힣]+)(\d+)$/);
        if (match) {
          productNameFromComment = match[1];
          quantity = parseInt(match[2]);
          // 🔥 4자리 숫자는 전화번호로 간주하고 건너뜀 (0000~9999)
          if (quantity >= 1000 || quantity >= 100 && match[2].length === 4) {
            logger.warn('4자리 숫자는 전화번호로 간주하고 건너뜀', {
              comment,
              productNameFromComment,
              quantity,
              originalNumber: match[2],
              numberLength: match[2].length
            });
            return {
              success: false,
              products: [],
              confidence: 0
            };
          }
          logger.info('🎯 상품명+숫자 패턴 정규식 매칭 성공', {
            comment,
            productNameFromComment,
            quantity,
            fullMatch: match[0],
            group1: match[1],
            group2: match[2]
          });
        } else {
          const numMatch = comment.trim().match(/(\d+)$/);
          quantity = numMatch ? parseInt(numMatch[1]) : 1;
          logger.warn('정규식 매칭 실패, 숫자만 추출 시도', {
            comment,
            quantity
          });
        }
        logger.info('상품명+숫자 패턴 감지', {
          comment,
          quantity,
          productNameFromComment
        });
      } else if (isProductWithSpaceNumber) {
        // "열무김치 1개", "머루포도 2송이" → productName: "열무김치"/"머루포도", quantity: 1/2
        const match = comment.trim().match(/^([가-힣]+)\s+(\d+)[개팩봉세트병송이마리근캔통봉지포장묶음단줄알입잔토막쪽망]*$/);
        if (match) {
          productNameFromComment = match[1];
          quantity = parseInt(match[2]);
        } else {
          const numMatch = comment.trim().match(/\s+(\d+)[개팩봉세트병송이마리근캔통봉지포장묶음단줄알입잔토막쪽망]*$/);
          quantity = numMatch ? parseInt(numMatch[1]) : 1;
        }
        logger.info('상품명+공백+숫자 패턴 감지', {
          comment,
          quantity,
          productNameFromComment
        });
      } else if (isProductWithNumberAndExtra) {
        // "안심2 봉선점" → productName: "안심", quantity: 2
        const match = comment.trim().match(/^([가-힣]+)(\d+)\s+/);
        if (match) {
          productNameFromComment = match[1];
          quantity = parseInt(match[2]);
          // 🔥 4자리 숫자는 전화번호로 간주하고 건너뜀 (0000~9999)
          if (quantity >= 1000 || quantity >= 100 && match[2].length === 4) {
            logger.info('4자리 숫자는 전화번호로 간주, 패턴 스킵', {
              quantity,
              originalNumber: match[2],
              numberLength: match[2].length
            });
            return null;
          }
        }
        logger.info('상품명+숫자+기타 패턴 감지', {
          comment,
          quantity,
          productNameFromComment
        });
      } else if (isPureProductName) {
        // 🔥 순수 상품명: "무", "양파", "브로콜리" 등
        productNameFromComment = comment.trim();
        quantity = 1;
        logger.info('순수 상품명 패턴 감지', {
          comment,
          productNameFromComment,
          quantity
        });
      }
      // 🔥 상품명이 추출된 경우 직접 매칭 시도
      if (productNameFromComment) {
        logger.info('🔍 상품명으로 직접 매칭 시도 시작', {
          productNameFromComment,
          quantity,
          totalProducts: productMap.size
        });
        // 모든 상품을 검사하여 최적의 매칭 찾기
        let bestMatch = null;
        for (const [itemNumber, product] of productMap.entries()){
          const productTitle = (product.title || product.name || '').toLowerCase();
          const cleanTitle = productTitle.replace(/\[[^\]]+\]/g, '') // 날짜 제거
          .replace(/\d+kg/g, '') // 무게 제거
          .replace(/\d+[가-힣]+/g, '') // 가격 등 제거
          .replace(/\d+/g, '') // 남은 숫자 제거
          .trim();
          // 🔥 더 유연한 매칭 조건
          const commentLower = productNameFromComment.toLowerCase();
          const exactMatch = cleanTitle === commentLower;
          const titleIncludesComment = cleanTitle.includes(commentLower);
          const commentIncludesTitle = commentLower.includes(cleanTitle);
          const similarity = this.calculateSimilarity(cleanTitle, commentLower);
          // 🔥 1단어 상품명 특별 처리
          let similarityMatch = false;
          if (cleanTitle.length === 1 || commentLower.length === 1) {
            // 1글자 상품명은 정확히 일치해야만 매칭 (유사도 매칭 제외)
            similarityMatch = exactMatch;
          } else {
            // 2글자 이상은 기존 유사도 로직 적용
            similarityMatch = similarity > 0.2;
          }
          const isMatched = exactMatch || titleIncludesComment || commentIncludesTitle || similarityMatch;
          logger.info(`🔍 상품 ${itemNumber} 매칭 시도`, {
            itemNumber,
            originalTitle: product.title || product.name,
            productTitle,
            cleanTitle,
            commentLower,
            exactMatch,
            titleIncludesComment,
            commentIncludesTitle,
            similarity: similarity.toFixed(3),
            similarityMatch,
            isMatched,
            isSingleChar: cleanTitle.length === 1 || commentLower.length === 1,
            unitPrice: product.price || product.base_price || product.basePrice || 0
          });
          if (isMatched) {
            // 매칭 타입별 우선순위 점수 계산
            let score = similarity;
            let matchType = 'similarity';
            if (exactMatch) {
              score = 1.0;
              matchType = cleanTitle.length === 1 || commentLower.length === 1 ? 'exact_single_char' : 'exact';
            } else if (titleIncludesComment || commentIncludesTitle) {
              score = Math.max(score, 0.8);
              matchType = 'includes';
            }
            // 기존 최고 매치보다 점수가 높으면 업데이트
            if (!bestMatch || score > bestMatch.similarity) {
              bestMatch = {
                itemNumber,
                product,
                productTitle,
                cleanTitle,
                similarity: score,
                matchType
              };
              logger.info(`🎯 새로운 최고 매치 발견!`, {
                itemNumber,
                productName: product.title || product.name,
                similarity: score.toFixed(3),
                matchType,
                previousBest: bestMatch ? `${bestMatch.itemNumber} (${bestMatch.similarity.toFixed(3)})` : 'none'
              });
            }
          }
        }
        // 최고 매치 결과 반환
        if (bestMatch) {
          logger.info('✅ 최적 상품명 매칭 성공!', {
            productNameFromComment,
            matchedProduct: bestMatch.product.title || bestMatch.product.name,
            itemNumber: bestMatch.itemNumber,
            quantity,
            cleanTitle: bestMatch.cleanTitle,
            similarity: bestMatch.similarity,
            matchType: bestMatch.matchType,
            directPrice: bestMatch.product.price || bestMatch.product.base_price || bestMatch.product.basePrice || 0,
            totalPrice: (bestMatch.product.price || bestMatch.product.base_price || bestMatch.product.basePrice || 0) * quantity
          });
          logger.info('🎯 상품명 직접 매칭으로 가격 계산 완료 - OptimalPriceCalculator 우회', {
            itemNumber: bestMatch.itemNumber,
            productName: bestMatch.product.title || bestMatch.product.name,
            unitPrice: bestMatch.product.price || bestMatch.product.base_price || bestMatch.product.basePrice || 0,
            quantity,
            totalPrice: (bestMatch.product.price || bestMatch.product.base_price || bestMatch.product.basePrice || 0) * quantity
          });
          return {
            success: true,
            products: [
              {
                itemNumber: bestMatch.itemNumber,
                quantity: quantity,
                confidence: 0.95,
                productName: bestMatch.product.title || bestMatch.product.name,
                price: bestMatch.product.price || bestMatch.product.base_price || bestMatch.product.basePrice || 0,
                matchedText: comment,
                depth: 0
              }
            ],
            confidence: 0.95,
            patternDetails: {
              originalComment: comment,
              pattern: 'PRODUCT_NAME_WITH_QUANTITY',
              extractedProductName: productNameFromComment,
              matchedProduct: bestMatch.product.title || bestMatch.product.name,
              matchType: bestMatch.matchType,
              similarity: bestMatch.similarity,
              quantity: quantity
            }
          };
        }
        logger.warn('상품명 매칭 실패, 기존 로직으로 계속', {
          productNameFromComment,
          availableProducts: Array.from(productMap.values()).map((p)=>p.title || p.name)
        });
      }
      // 상품 패턴 분석
      const pattern = ProductPatternClassifier.classify(productMap);
      const hasVariantByFlag = this.hasQuantityVariant(productMap);
      const strategy = ProductPatternClassifier.determineMatchingStrategy(comment, pattern, productMap);
      logger.info('매칭 전략 결정', {
        patternType: pattern.type,
        strategy: strategy.strategy,
        useOptimalPrice: pattern.useOptimalPrice
      });
      // QUANTITY_VARIANT (동일 상품, 수량 차이): 최적 가격 계산 사용
      const shouldUseQuantityVariant = pattern.type === 'QUANTITY_VARIANT' && pattern.useOptimalPrice || hasVariantByFlag;
      if (shouldUseQuantityVariant) {
        logger.info('최적 가격 계산 시작', {
          patternType: 'QUANTITY_VARIANT',
          quantity,
          variantFlag: hasVariantByFlag
        });
        // 🔥 먼저 상품을 필터링한 후 OptimalPriceCalculator 호출
        const filteredMap = this.filterProductsByName(comment, productMap);
        // 필터링된 맵이 있으면 사용, 없으면 전체 맵 사용
        const targetMap = filteredMap && filteredMap.size > 0 ? filteredMap : productMap;
        const bestOption = OptimalPriceCalculator.findBestOption(quantity, targetMap, comment);
        if (bestOption) {
          logger.info('최적 상품 선택 완료', {
            productName: bestOption.product.title || bestOption.product.name,
            finalQuantity: bestOption.finalQuantity,
            totalPrice: bestOption.totalPrice
          });
          const normalizedTotal = typeof bestOption.totalPrice === 'number' ? bestOption.totalPrice : Number(String(bestOption.totalPrice).replace(/[^0-9.]/g, '')) || 0;
          const unitPrice = bestOption.finalQuantity > 0 ? normalizedTotal / bestOption.finalQuantity : normalizedTotal;
          return {
            success: true,
            products: [
              {
                itemNumber: bestOption.itemNumber || bestOption.product.itemNumber,
                quantity: bestOption.finalQuantity,
                confidence: 0.95,
                productName: bestOption.product.title || bestOption.product.name,
                price: unitPrice,
                totalPrice: normalizedTotal,
                matchedText: comment,
                depth: 0
              }
            ],
            confidence: 0.95,
            patternDetails: {
              originalComment: comment,
              pattern: 'QUANTITY_VARIANT_OPTIMAL',
              optimalReason: bestOption.reason,
              totalPrice: normalizedTotal
            }
          };
        }
      }
      // SIZE_VARIANT (크기/단위 차이): 상품명에 의미 있는 숫자가 있을 때만 매칭, 없으면 수량으로 해석
      if (pattern.type === 'SIZE_VARIANT') {
        // 상품명에 의미 있는 숫자가 있는 경우에만 상품명 매칭 시도 (날짜/시간 제외)
        let hasExplicitNumber = false;
        for (const [itemNumber, product] of productMap.entries()){
          const productName = product.title || product.name || '';
          // 날짜 패턴 제거 후 의미 있는 숫자 확인 (예: [8월28일], [1월15일] 등)
          const nameWithoutDate = productName.replace(/\[?\d+월\d+일\]?/g, '').replace(/\[\d{4}-\d{2}-\d{2}\]/g, '');
          // 의미 있는 숫자가 포함되어 있으면 매칭 시도 (박스, 키로, 개 등과 연관된 숫자)
          const meaningfulNumberPattern = new RegExp(`${quantity}\\s*(박스|키로|개|봉|팩|세트|송이|마리|근|병|캔|통|봉지|포|장|묶음|단|줄|알|입|잔|토막|쪽|망)`);
          if (meaningfulNumberPattern.test(nameWithoutDate) || nameWithoutDate.includes(`${quantity}박스`) || nameWithoutDate.includes(`${quantity}개`) || nameWithoutDate.includes(`${quantity}송이`) || nameWithoutDate.includes(`${quantity}마리`) || nameWithoutDate.includes(`${quantity}근`)) {
            hasExplicitNumber = true;
            return {
              success: true,
              products: [
                {
                  itemNumber: itemNumber,
                  quantity: 1,
                  confidence: 0.95,
                  productName: productName,
                  price: product.price || product.base_price || product.basePrice || 0,
                  matchedText: comment,
                  depth: 0
                }
              ],
              confidence: 0.95
            };
          }
        }
        // 상품명에 숫자가 없으면 수량으로 해석하여 더 큰 상품(1박스) 선택
        if (!hasExplicitNumber) {
          // 1박스를 찾기 위해 상품들을 가격순으로 정렬하여 더 비싼 것(큰 상품) 선택
          const products = Array.from(productMap.values()).sort((a, b)=>(b.price || b.basePrice || 0) - (a.price || a.basePrice || 0));
          const largerProduct = products[0]; // 가장 비싼 상품 = 1박스
          return {
            success: true,
            products: [
              {
                itemNumber: largerProduct.itemNumber,
                quantity: quantity,
                confidence: 0.95,
                productName: largerProduct.title || largerProduct.name,
                price: largerProduct.price || largerProduct.basePrice || largerProduct.base_price || 0,
                matchedText: comment,
                depth: 0
              }
            ],
            confidence: 0.95
          };
        }
      }
      // MIXED_PRODUCTS인 경우: 토큰 매칭으로 최적 상품 선택
      if (pattern.type === 'MIXED_PRODUCTS') {
        const bestMatch = this.findBestTokenMatch(comment, productMap);
        if (bestMatch) {
          return {
            success: true,
            products: [
              {
                itemNumber: bestMatch.itemNumber,
                quantity: 1,
                confidence: 0.9,
                productName: bestMatch.productName,
                price: bestMatch.price,
                matchedText: comment,
                depth: 0
              }
            ],
            confidence: 0.9
          };
        }
      }
      // 기본값: 먼저 상품 필터링 시도 후 직접 가격 계산 또는 OptimalPriceCalculator 사용
      const filteredMap = this.filterProductsByName(comment, productMap);
      const targetMap = filteredMap && filteredMap.size > 0 ? filteredMap : productMap;
      // 🔥 필터링된 상품이 1개뿐이면 해당 상품의 직접 가격 사용 (OptimalPriceCalculator 불필요)
      if (filteredMap && filteredMap.size === 1) {
        const [targetItemNumber, targetProduct] = Array.from(filteredMap.entries())[0];
        const directPrice = targetProduct.price || targetProduct.basePrice || targetProduct.base_price || 0; // 단가만 저장
        logger.info('상품명 직접 매칭으로 가격 계산', {
          productName: targetProduct.title || targetProduct.name,
          itemNumber: targetItemNumber,
          quantity,
          unitPrice: targetProduct.price || targetProduct.basePrice || 0,
          totalPrice: directPrice
        });
        return {
          success: true,
          products: [
            {
              itemNumber: targetItemNumber,
              quantity: quantity,
              confidence: 0.95,
              productName: targetProduct.title || targetProduct.name,
              price: directPrice,
              matchedText: comment,
              depth: 0
            }
          ],
          confidence: 0.95,
          patternDetails: {
            originalComment: comment,
            preprocessedText: comment,
            splitMethod: 'direct_product_match',
            segments: [],
            processingFlow: [
              `시작: "${comment}"`,
              `상품 필터링: 1개 매칭`,
              `직접 가격 계산: ${targetProduct.title || targetProduct.name} × ${quantity} = ${directPrice}원`
            ]
          }
        };
      }
      // 🔥 필터링된 상품이 없으면 매칭 실패로 처리 (잘못된 OptimalPriceCalculator 호출 방지)
      if (!filteredMap || filteredMap.size === 0) {
        logger.warn('상품명 필터링 실패, 매칭 불가능', {
          comment,
          availableProducts: Array.from(productMap.values()).map((p)=>p.title || p.name),
          reason: '상품명과 일치하는 제품이 없음'
        });
        return null;
      }
      // 🔥 필터링된 상품이 여러 개이면 OptimalPriceCalculator 사용
      const optimalResult = OptimalPriceCalculator.findBestOption(quantity, filteredMap, comment);
      if (optimalResult) {
        const normalizedTotal = typeof optimalResult.totalPrice === 'number' ? optimalResult.totalPrice : Number(String(optimalResult.totalPrice).replace(/[^0-9.]/g, '')) || 0;
        const unitPrice = optimalResult.finalQuantity > 0 ? normalizedTotal / optimalResult.finalQuantity : normalizedTotal;
        return {
          success: true,
          products: [
            {
              itemNumber: optimalResult.itemNumber || optimalResult.product.itemNumber,
              quantity: optimalResult.finalQuantity,
              confidence: 0.95,
              productName: optimalResult.product.title || optimalResult.product.name,
              price: unitPrice,
              totalPrice: normalizedTotal,
              matchedText: comment,
              depth: 0
            }
          ],
          confidence: 0.95,
          patternDetails: {
            originalComment: comment,
            preprocessedText: comment,
            splitMethod: 'optimal_price',
            segments: [],
            processingFlow: [
              `시작: "${comment}"`,
              `단순 숫자 감지: ${quantity}`,
              `최적 가격 계산: ${optimalResult.reason}`
            ]
          },
          debugInfo: {
            originalComment: comment,
            expectedCount: 1,
            actualCount: 1,
            optimalPrice: normalizedTotal,
            optimalReason: optimalResult.reason,
            processingSteps: [
              {
                product: optimalResult.product.title || optimalResult.product.name,
                quantity: optimalResult.finalQuantity,
                depth: 0,
                matchedText: comment
              }
            ]
          }
        };
      }
    }
    // 🔥 "N알" 단위 패턴 직접 처리
    const eggPattern = /^(\d+)\s*알(\s*이?\s*요?)?$/;
    const eggMatch = comment.trim().match(eggPattern);
    if (eggMatch && productMap) {
      const requestedQuantity = parseInt(eggMatch[1]);
      // productMap에서 "N알" 상품 찾기
      for (const [itemNumber, product] of productMap.entries()){
        const title = (product.title || product.name || '').toLowerCase();
        const eggText = `${requestedQuantity}알`;
        if (title.includes(eggText)) {
          const unitPrice = product.price || product.base_price || product.basePrice || 0;
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity: 1,
                confidence: 0.95,
                productName: product.title || product.name,
                price: unitPrice * 1,
                matchedText: comment,
                depth: 0
              }
            ],
            confidence: 0.95,
            patternDetails: {
              originalComment: comment,
              preprocessedText: comment,
              splitMethod: 'egg_pattern_direct',
              segments: [
                {
                  segment: comment,
                  extractedProductName: eggText,
                  extractedQuantity: 1,
                  matchedProduct: product.title || product.name,
                  processingOrder: 1
                }
              ],
              processingFlow: [
                `시작: "${comment}"`,
                `알 패턴 직접 처리: "${eggText}" → itemNumber ${itemNumber}`,
                `상품: ${product.title || product.name}`
              ]
            }
          };
        }
      }
      logger.warn('패턴 매칭 실패, 일반 처리로 전환', {
        comment
      });
    }
    // 🔥 패턴 디버깅 정보 수집
    const patternDetails = {
      originalComment: comment,
      preprocessedText: '',
      splitMethod: '',
      segments: [],
      processingFlow: [
        `시작: "${comment}"`
      ]
    };
    // 1. 예상 상품 수 파악
    const expectedCount = this.analyzeExpectedProductCount(comment);
    logger.info('상품 수 예상', {
      expectedCount
    });
    patternDetails.processingFlow.push(`예상 상품 수: ${expectedCount}`);
    // 2. ProductNameMatcher를 재귀적으로 호출
    const products = this.recursiveMatch(comment, productMap, 0, patternDetails);
    if (products.length === 0) {
      return {
        success: false,
        products: [],
        confidence: 0,
        debugInfo: {
          originalComment: comment,
          reason: 'No matches found',
          expectedCount
        }
      };
    }
    // 3. 🔥 중복 제거 로직 개선: itemNumber와 productName을 모두 고려
    const uniqueProducts = [];
    const seenProducts = new Set();
    for (const product of products){
      // 🔥 itemNumber와 productName 조합으로 고유성 판단
      const productKey = `${product.itemNumber}_${product.productName || ''}`;
      if (!seenProducts.has(productKey)) {
        seenProducts.add(productKey);
        uniqueProducts.push(product);
        logger.info('상품 추가', {
          itemNumber: product.itemNumber,
          productName: product.productName,
          depth: product.depth,
          segmentIndex: product.segmentIndex || 'undefined'
        });
      } else {
        logger.info('중복 상품 제거', {
          itemNumber: product.itemNumber,
          productName: product.productName,
          depth: product.depth,
          reason: '동일한 itemNumber와 productName 조합'
        });
      }
    }
    // 4. 가격 정보 추가 (🔥 수량 곱셈 적용)
    const productsWithPrice = uniqueProducts.map((p)=>{
      const productInfo = productMap.get(p.itemNumber);
      const unitPrice = productInfo?.price || productInfo?.base_price || productInfo?.basePrice || 0;
      return {
        ...p,
        price: unitPrice // 🔥 단가만 저장 (band-get-posts-a에서 수량 곱하기)
      };
    });
    // 4. 전체 신뢰도 계산
    const avgConfidence = productsWithPrice.reduce((sum, p)=>sum + (p.confidence || 0.8), 0) / productsWithPrice.length;
    // 예상 개수와 실제 매칭 개수 비교하여 신뢰도 조정
    const countRatio = Math.min(productsWithPrice.length / expectedCount, 1);
    const finalConfidence = avgConfidence * (0.5 + 0.5 * countRatio);
    return {
      success: productsWithPrice.length > 0 && finalConfidence >= this.MIN_CONFIDENCE,
      products: productsWithPrice,
      confidence: finalConfidence,
      patternDetails: patternDetails,
      debugInfo: {
        originalComment: comment,
        expectedCount,
        actualCount: productsWithPrice.length,
        processingSteps: productsWithPrice.map((p)=>({
            product: p.productName,
            quantity: p.quantity,
            depth: p.depth,
            matchedText: p.matchedText
          }))
      }
    };
  }
  /**
   * 예상 상품 수 분석
   * 숫자 개수를 기반으로 주문한 상품 수 예측
   */ static analyzeExpectedProductCount(comment) {
    // 숫자 추출
    const numbers = comment.match(/\d+/g);
    if (!numbers || numbers.length === 0) return 0;
    // "N번 M개" 패턴 체크
    if (comment.match(/\d+\s*번\s*\d+\s*(개|봉|박스)?/)) {
      return 1; // 단일 상품
    }
    // "1번2개요" 같은 패턴
    if (comment.match(/^\d+번\d+개/)) {
      return 1;
    }
    // 일반적으로 숫자 개수 = 상품 개수
    // "크림스프레이 1 치즈 1" → 2개 상품
    return numbers.length;
  }
  /**
   * 재귀적 매칭 함수
   * ProductNameMatcher를 반복 호출
   */ static recursiveMatch(text, productMap, depth, patternDetails) {
    // 종료 조건
    if (depth >= this.MAX_DEPTH || !text || text.trim().length === 0) {
      return [];
    }
    // 🔥 전처리는 이미 메인 match() 함수에서 실행됨
    let processedText = text;
    // 🔥 모든 depth에서 분할 시도 (복합 패턴 처리)
    const segments = this.splitByDelimiters(processedText);
    // 분할이 성공했으면 (여러 세그먼트로 나뉘었으면) 각각 처리
    if (segments.length > 1) {
      // depth 0에서만 patternDetails 업데이트
      if (depth === 0) {
        logger.info('텍스트 분할 성공', {
          depth,
          segmentCount: segments.length,
          segments
        });
        if (patternDetails) {
          patternDetails.splitMethod = this.getSplitMethodUsed(processedText);
          patternDetails.processingFlow.push(`구분자 분할: ${segments.length}개 세그먼트 → [${segments.join(', ')}]`);
        }
      } else {
        logger.info('텍스트 분할 성공', {
          depth,
          segmentCount: segments.length,
          segments
        });
      }
      const allMatches = [];
      for(let i = 0; i < segments.length; i++){
        const segment = segments[i];
        // 🔥 세그먼트별 디버깅 정보 수집 (depth 0에서만)
        let segmentInfo = null;
        if (depth === 0) {
          segmentInfo = {
            segment: segment,
            extractedProductName: '',
            extractedQuantity: 0,
            matchedProduct: '',
            processingOrder: i + 1
          };
        }
        // 🔥 depth가 0일 때 각 세그먼트를 메인 match() 함수로 재처리하여 패턴 검사 로직 적용
        // 🔥 각 세그먼트별로 이미 사용된 itemNumber 추적하여 중복 방지
        let segmentMatches = [];
        if (depth === 0) {
          logger.info(`🔍 세그먼트 "${segment}" 메인 match() 함수로 재처리 시작`, {
            segment,
            depth,
            segmentIndex: i
          });
          // 🔥 이미 매칭된 상품들의 itemNumber 수집
          const usedItemNumbers = new Set();
          for(let j = 0; j < i; j++){
          // 이전 세그먼트에서 매칭된 상품들의 itemNumber 확인 (allMatches 참조)
          }
          const mainMatchResult = this.match(segment, productMap);
          if (mainMatchResult && mainMatchResult.success) {
            // match() 결과를 recursiveMatch 형식으로 변환
            segmentMatches = mainMatchResult.products.map((p)=>({
                ...p,
                depth: depth + 1,
                segmentIndex: i // 🔥 세그먼트 인덱스 추가로 구분
              }));
            logger.info(`✅ 세그먼트 "${segment}" 메인 match() 성공`, {
              segment,
              segmentIndex: i,
              matchCount: segmentMatches.length,
              matches: segmentMatches.map((m)=>({
                  itemNumber: m.itemNumber,
                  productName: m.productName,
                  quantity: m.quantity,
                  price: m.price
                }))
            });
          } else {
            logger.info(`❌ 세그먼트 "${segment}" 메인 match() 실패, recursiveMatch 시도`, {
              segment,
              segmentIndex: i
            });
            segmentMatches = this.recursiveMatch(segment, productMap, depth + 1, patternDetails);
            // 🔥 공백 분리 후처리: 순수 한글 상품명이 공백으로 구분된 경우 재시도
            if (segmentMatches.length === 0 && /^[가-힣\s]+$/.test(segment) && segment.includes(' ')) {
              const spaceSegments = segment.split(' ').filter((s)=>s.trim().length > 0);
              if (spaceSegments.length > 1) {
                logger.info(`🔄 공백 분리 재처리 시도: "${segment}" → [${spaceSegments.join(', ')}]`, {
                  segment,
                  segmentIndex: i,
                  spaceSegmentCount: spaceSegments.length
                });
                for (const spaceSegment of spaceSegments){
                  const spaceMatchResult = this.match(spaceSegment, productMap);
                  if (spaceMatchResult && spaceMatchResult.success) {
                    const spaceMatches = spaceMatchResult.products.map((p)=>({
                        ...p,
                        depth: depth + 1,
                        segmentIndex: i,
                        matchedText: `${p.matchedText} (공백분리처리)`
                      }));
                    segmentMatches.push(...spaceMatches);
                    logger.info(`✅ 공백 분리 성공: "${spaceSegment}"`, {
                      spaceSegment,
                      matchCount: spaceMatches.length,
                      matches: spaceMatches.map((m)=>({
                          itemNumber: m.itemNumber,
                          productName: m.productName,
                          quantity: m.quantity
                        }))
                    });
                  }
                }
              }
            }
          }
        } else {
          segmentMatches = this.recursiveMatch(segment, productMap, depth + 1, patternDetails);
          // 🔥 공백 분리 후처리: 순수 한글 상품명이 공백으로 구분된 경우 재시도 (모든 depth에서)
          if (segmentMatches.length === 0 && /^[가-힣\s]+$/.test(segment) && segment.includes(' ')) {
            const spaceSegments = segment.split(' ').filter((s)=>s.trim().length > 0);
            if (spaceSegments.length > 1) {
              logger.info(`🔄 공백 분리 재처리 시도 (depth ${depth}): "${segment}" → [${spaceSegments.join(', ')}]`, {
                segment,
                segmentIndex: i,
                depth,
                spaceSegmentCount: spaceSegments.length
              });
              for (const spaceSegment of spaceSegments){
                const spaceMatchResult = this.match(spaceSegment, productMap);
                if (spaceMatchResult && spaceMatchResult.success) {
                  const spaceMatches = spaceMatchResult.products.map((p)=>({
                      ...p,
                      depth: depth + 1,
                      segmentIndex: i,
                      matchedText: `${p.matchedText} (공백분리처리)`
                    }));
                  segmentMatches.push(...spaceMatches);
                  logger.info(`✅ 공백 분리 성공 (depth ${depth}): "${spaceSegment}"`, {
                    spaceSegment,
                    depth,
                    matchCount: spaceMatches.length,
                    matches: spaceMatches.map((m)=>({
                        itemNumber: m.itemNumber,
                        productName: m.productName,
                        quantity: m.quantity
                      }))
                  });
                }
              }
            }
          }
        }
        // 세그먼트 결과 정보 업데이트 (depth 0에서만)
        if (depth === 0 && segmentInfo) {
          if (segmentMatches.length > 0) {
            const match = segmentMatches[0];
            segmentInfo.extractedProductName = match.productName || '';
            segmentInfo.extractedQuantity = match.quantity || 0;
            segmentInfo.matchedProduct = match.productName || '';
          }
          if (patternDetails) {
            patternDetails.segments.push(segmentInfo);
            patternDetails.processingFlow.push(`세그먼트 ${i + 1}: "${segment}" → ${segmentInfo.matchedProduct} (${segmentInfo.extractedQuantity}개)`);
          }
        }
        allMatches.push(...segmentMatches);
      }
      logger.info('매칭 완료', {
        depth,
        matchCount: allMatches.length,
        matches: allMatches.map((m)=>({
            productName: m.productName,
            quantity: m.quantity
          }))
      });
      return allMatches;
    }
    // ProductNameMatcher 호출 (분할 실패했거나 depth > 0인 경우)
    const matchResult = ProductNameMatcher.match(processedText, productMap);
    if (!matchResult || !matchResult.itemNumber) {
      // 🔥 매칭 실패 시 더 이상 처리할 수 없음 (depth 0에서는 이미 분할 시도했음)
      return [];
    }
    // 매칭된 상품 정보 구성
    const product = {
      itemNumber: matchResult.itemNumber,
      quantity: matchResult.quantity,
      confidence: matchResult.confidence || 0.8,
      productName: matchResult.productName,
      matchedText: matchResult.debugInfo?.extractedProductName || matchResult.productName
    };
    // 디버깅 로그
    if (depth === 0) {}
    // 매칭된 텍스트 제거
    const remainingText = this.removeMatchedText(processedText, product);
    // 🔥 남은 텍스트가 의미있는 길이가 있고 상품명 패턴이 있고, 원본과 다를 때만 재귀 호출
    const additionalMatches = remainingText.trim().length > 2 && remainingText.match(/[가-힣]{2,}/) && remainingText !== processedText ? this.recursiveMatch(remainingText, productMap, depth + 1, patternDetails) : [];
    if (remainingText === processedText) {}
    // depth 정보 추가
    const productWithDepth = {
      ...product,
      depth: depth
    };
    return [
      productWithDepth,
      ...additionalMatches
    ];
  }
  /**
   * 매칭된 텍스트 제거
   * ProductNameMatcher가 찾은 상품과 수량을 텍스트에서 제거
   */ static removeMatchedText(text, product) {
    const matchedText = product.matchedText || product.productName || '';
    const quantity = product.quantity || 1;
    // 🔥 정확한 상품명+수량 패턴 우선 제거 ("전복1", "병어4" 등)
    // "전복1병어4"에서 "전복1"을 정확히 제거하여 "병어4"만 남기기
    const exactProductPattern = new RegExp(`\\b${this.escapeRegex(matchedText)}${quantity}\\b`, 'gi');
    let remainingText = text.replace(exactProductPattern, '').trim();
    if (remainingText.length < text.length) {
      return remainingText.replace(/\s+/g, ' ').trim();
    }
    // 🔥 문자 경계 없이 정확한 제거 시도 (복합 패턴용)
    const exactPattern = new RegExp(`${this.escapeRegex(matchedText)}${quantity}`, 'gi');
    remainingText = text.replace(exactPattern, '').trim();
    if (remainingText.length < text.length) {
      return remainingText.replace(/\s+/g, ' ').trim();
    }
    // 🔥 유연한 패턴들 시도 (fallback)
    const patterns = [
      // "크림스프레이 1" 형태 (공백 포함)
      new RegExp(`${this.escapeRegex(matchedText)}\\s*${quantity}(?:개|봉|박스)?`, 'gi'),
      // "1 크림스프레이" 형태 (수량이 앞에)
      new RegExp(`${quantity}(?:개|봉|박스)?\\s*${this.escapeRegex(matchedText)}`, 'gi'),
      // 상품명만 제거 (수량은 남겨둠)
      new RegExp(`\\b${this.escapeRegex(matchedText)}\\b`, 'gi'),
      // 수량만 제거 (상품명은 이미 제거된 경우)
      new RegExp(`\\b${quantity}(?:개|봉|박스)?\\b`, 'gi')
    ];
    // 각 패턴으로 제거 시도
    for(let i = 0; i < patterns.length; i++){
      const pattern = patterns[i];
      const beforeLength = remainingText.length;
      const tempText = remainingText.replace(pattern, ' ').trim();
      if (tempText.length < beforeLength) {
        remainingText = tempText;
        break;
      }
    }
    // 최종 정리
    remainingText = remainingText.replace(/\s+/g, ' ').trim();
    return remainingText;
  }
  /**
   * 문자열 유사도 계산 (Levenshtein Distance 기반)
   */ static calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0;
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  /**
   * Levenshtein Distance 계산
   */ static levenshteinDistance(str1, str2) {
    const matrix = [];
    for(let i = 0; i <= str2.length; i++){
      matrix[i] = [
        i
      ];
    }
    for(let j = 0; j <= str1.length; j++){
      matrix[0][j] = j;
    }
    for(let i = 1; i <= str2.length; i++){
      for(let j = 1; j <= str1.length; j++){
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }
  /**
   * 슬래시 패턴 전처리
   * "김혜선/0089/봉선점/국거리1돼지앞다리1" → "국거리1돼지앞다리1"
   * "이민자상무점3934한우국거리2,한우불고기2,돼지후지살2" → "한우국거리2,한우불고기2,돼지후지살2"
   * "양미란 6963 봉선점 꽃게2\n새우 1" → "꽃게2 새우 1"
   */ static preprocessSlashPattern(text) {
    // 0. 줄바꿈을 공백으로 변환
    text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    // 🔥 상품명+숫자 패턴 보호: 이런 패턴은 전처리하지 않음
    // "안심2", "목살3", "비건식빵1" 등
    const productNameNumberPattern = /^([가-힣]*?(안심|목살|등심|삼겹|김치|식빵|빵|쿠키|치아바타|모닝빵|단팥빵|전어|새우|돼지|한우|소고기|돼지고기))\d+/;
    if (productNameNumberPattern.test(text)) {
      console.log(`[preprocessSlashPattern] 상품명+숫자 패턴 보호: "${text}" → 전처리 안함`);
      return text; // 전처리하지 않고 그대로 반환
    }
    // 1. 표준 슬래시 구분 패턴: "이름/전화번호/지점/상품부분"
    const slashMatch = text.match(/^([가-힣]+)\/(\d{3,4})\/([가-힣]+점?)\/(.+)/);
    if (slashMatch) {
      const productPart = slashMatch[4]; // "국거리1돼지앞다리1"
      return productPart;
    }
    // 1-1. 🔥 더블 슬래시 구분 패턴: "이름 전화번호 지점 //상품부분"
    // "강지연 1601 운암점 //우리밀단팥빵 우리밀모닝빵" → "우리밀단팥빵 우리밀모닝빵"
    const doubleSlashMatch = text.match(/^([가-힣]+)\s+(\d{3,4})\s+([가-힣]+점?)\s*\/\/(.+)/);
    if (doubleSlashMatch) {
      const productPart = doubleSlashMatch[4].trim(); // "우리밀단팥빵 우리밀모닝빵"
      console.log('[preprocessSlashPattern] 더블 슬래시 패턴 감지', {
        name: doubleSlashMatch[1],
        phone: doubleSlashMatch[2],
        location: doubleSlashMatch[3],
        productPart
      });
      return productPart;
    }
    // 2. 복합 패턴: "이름+지점+전화번호+상품리스트"
    // "이민자상무점3934한우국거리2,한우불고기2,돼지후지살2"
    const complexPattern = text.match(/^([가-힣]+)([가-힣]+점?)(\d{3,4})(.+)/);
    if (complexPattern) {
      const name = complexPattern[1];
      const location = complexPattern[2];
      const phone = complexPattern[3];
      const productPart = complexPattern[4];
      // 상품 부분이 콤마나 한글로 시작하면 이 패턴으로 간주
      if (productPart.match(/^[,가-힣]/)) {
        return productPart;
      }
    }
    // 2-1. 이름+공백+지점명+4자리숫자 패턴 (새로 추가)
    // "이홍임 상무점2673단팥4..." → "단팥4..."
    const nameSpaceLocationPhonePattern = text.match(/^([가-힣]+)\s+([가-힣]+점)(\d{4})(.+)/);
    if (nameSpaceLocationPhonePattern) {
      const productPart = nameSpaceLocationPhonePattern[4];
      console.log('[preprocessSlashPattern] 이름 공백 지점+전화번호 패턴 감지', {
        name: nameSpaceLocationPhonePattern[1],
        location: nameSpaceLocationPhonePattern[2],
        phone: nameSpaceLocationPhonePattern[3],
        productPart
      });
      return productPart;
    }
    // 2-2. 이름+4자리숫자+공백 패턴
    // "이영옥7219 상무점..." → "상무점..."  
    const namePhoneSpacePattern = text.match(/^([가-힣]+)(\d{4})\s+(.+)/);
    if (namePhoneSpacePattern) {
      const productPart = namePhoneSpacePattern[3];
      console.log('[preprocessSlashPattern] 이름+전화번호 공백 패턴 감지', {
        name: namePhoneSpacePattern[1],
        phone: namePhoneSpacePattern[2],
        productPart
      });
      return productPart;
    }
    // 2-3. 지점명+4자리숫자 패턴 (공백 없음)
    // "상무점2673단팥4..." → "단팥4..."
    const locationPhonePattern = text.match(/^([가-힣]+점)(\d{4})([가-힣].+)/);
    if (locationPhonePattern) {
      const productPart = locationPhonePattern[3];
      console.log('[preprocessSlashPattern] 지점+전화번호 패턴 감지', {
        location: locationPhonePattern[1],
        phone: locationPhonePattern[2],
        productPart
      });
      return productPart;
    }
    // 3. 공백 구분 패턴: "이름 전화번호 지점 상품리스트"
    // "남현경 7933 상무점 불고기4, 찌개1"
    // "김수연 0662 상무점 오징어2" - 지점과 상품이 분리된 경우
    // 🔥 지점명은 반드시 "점"으로 끝나는 경우에만 인식하여 상품명 오인식 방지
    const spacePattern = text.match(/^([가-힣]+)\s+(\d{3,4})\s+([가-힣]+점)\s+(.+)/);
    if (spacePattern && spacePattern[4]) {
      const name = spacePattern[1];
      const phone = spacePattern[2];
      const location = spacePattern[3];
      const productPart = spacePattern[4];
      console.log(`[preprocessSlashPattern] 공백 구분 패턴 감지: "${text}"`, {
        name,
        phone,
        location,
        productPart
      });
      // 상품 부분이 의미있는 한글을 포함하는지 확인
      if (productPart.match(/[가-힣]{2,}/)) {
        return productPart;
      }
    }
    // 3-1. 🔥 지점명 없는 공백 구분 패턴: "이름 전화번호 상품리스트"
    // "최선미 3397 자반2, 꽃게1, 전어1" - 지점명이 없는 경우 별도 처리
    const spacePatternNoLocation = text.match(/^([가-힣]+)\s+(\d{3,4})\s+(.+)/);
    if (spacePatternNoLocation && spacePatternNoLocation[3] && !spacePatternNoLocation[3].includes('점')) {
      const name = spacePatternNoLocation[1];
      const phone = spacePatternNoLocation[2];
      const productPart = spacePatternNoLocation[3];
      // 상품 부분이 의미있는 한글과 숫자/기호를 포함하는지 확인 (콤마, 공백 등)
      if (productPart.match(/[가-힣]{2,}/) && (productPart.match(/\d+/) || productPart.match(/[,\s]/))) {
        console.log(`[preprocessSlashPattern] 지점명 없는 공백 구분 패턴 감지: "${text}"`, {
          name,
          phone,
          productPart
        });
        return productPart;
      }
    }
    // 4. 복합 공백 패턴: "이름 전화번호+지점+상품" (지점과 상품이 붙어있는 경우)
    // "김수연 0662상무점 오징어2" → "상무점 오징어2"
    const spaceComplexPattern = text.match(/^([가-힣]+)\s+(\d{3,4})([가-힣점].+)/);
    if (spaceComplexPattern) {
      const name = spaceComplexPattern[1];
      const phone = spaceComplexPattern[2];
      const locationAndProduct = spaceComplexPattern[3]; // "상무점 오징어2"
      return locationAndProduct;
    }
    // 4-1. 간단한 이름+상품 패턴: "이름(2-3글자) + 공백 + 상품명"
    // "이봉희 얼갈이 1", "김영희 배추김치 2" → "얼갈이 1", "배추김치 2"
    const nameProductPattern = text.match(/^([가-힣]{2,3})\s+([가-힣]{2,}.+)/);
    if (nameProductPattern) {
      const name = nameProductPattern[1];
      const productPart = nameProductPattern[2];
      // 상품 부분이 의미있는 한글과 숫자를 포함하는지 확인
      if (productPart.match(/[가-힣]{2,}/) && productPart.match(/\d+/)) {
        console.log('[preprocessSlashPattern] 이름+상품 패턴 감지', {
          name,
          productPart
        });
        return productPart;
      }
    }
    // 5. 엄격한 이름+지점 패턴: "이름(2-4글자) + 전화번호(4자리) + 지점 + 상품" 또는 "이름(3-4글자) + 지점 + 상품"
    // "소성남 봉선점 배추김치 4키로" → "배추김치 4키로" (이름이 3글자 이상인 경우만)
    // "안심2 봉선점" → 전처리하지 않음 (이름이 너무 짧고 전화번호 없음)
    // 이름(3-4글자) + 전화번호(4자리) + 지점 + 상품 패턴
    const namePhoneLocationPattern = text.match(/^([가-힣]{3,4})\s*(\d{4})\s*([가-힣]+점)\s+(.+)/);
    if (namePhoneLocationPattern) {
      const productPart = namePhoneLocationPattern[4];
      console.log(`[preprocessSlashPattern] 이름+전화번호+지점 패턴 감지: "${text}" → "${productPart}"`);
      return productPart;
    }
    // 이름(3-4글자) + 지점 + 상품 패턴 (전화번호 없는 경우, 이름이 3글자 이상일 때만)
    const nameLocationPattern = text.match(/^([가-힣]{3,4})\s+([가-힣]+점)\s+(.+)/);
    if (nameLocationPattern) {
      const name = nameLocationPattern[1];
      const location = nameLocationPattern[2];
      const productPart = nameLocationPattern[3];
      // 상품 부분이 의미있는 한글을 포함하는지 확인
      if (productPart.match(/[가-힣]{2,}/)) {
        console.log(`[preprocessSlashPattern] 이름+지점 패턴 감지: "${text}" → "${productPart}"`);
        return productPart;
      }
    }
    // 6. 🔥 이름+4자리전화번호 패턴: "주동엽0381 상무  배1봉" → "상무  배1봉"
    // 0으로 시작하는 4자리 숫자도 전화번호로 인식하여 제거
    const namePhoneOnlyPattern = text.match(/^([가-힣]{2,4})(\d{4})\s+(.+)/);
    if (namePhoneOnlyPattern) {
      const name = namePhoneOnlyPattern[1]; // "주동엽"
      const phone = namePhoneOnlyPattern[2]; // "0381"
      const remainingPart = namePhoneOnlyPattern[3]; // "상무  배1봉"
      // 전화번호 패턴이 확실한 경우 제거
      // 4자리 숫자 (0000~9999)는 모두 전화번호로 간주
      if (phone.length === 4) {
        console.log(`[preprocessSlashPattern] 이름+전화번호 패턴 감지: "${text}" → "${remainingPart}"`);
        return remainingPart;
      }
    }
    // 7. 🔥 지점명+4자리숫자 패턴: "상무점9998 전어2" → "전어2"
    // 4자리 숫자는 보통 점포코드/지역번호이므로 제거
    const locationCodePattern = text.match(/^([가-힣]+점?)(\d{4})\s+(.+)/);
    if (locationCodePattern) {
      const location = locationCodePattern[1]; // "상무점"
      const code = locationCodePattern[2]; // "9998"
      const productPart = locationCodePattern[3]; // "전어2"
      // 상품 부분이 의미있는 한글을 포함하는지 확인
      if (productPart.match(/[가-힣]{2,}/)) {
        return productPart;
      }
    }
    return text;
  }
  /**
   * 구분자로 텍스트 분할
   * "국거리1돼지앞다리1" → ["국거리1", "돼지앞다리1"]
   * "한우국거리1,돼지찌개용1" → ["한우국거리1", "돼지찌개용1"]  
   * "찌개1.제육1" → ["찌개1", "제육1"]
   * "안심1 국거리1" → ["안심1", "국거리1"]
   * "배추김치2키로 1" → ["배추김치2키로 1"] (단위 패턴은 분할하지 않음)
   */ static splitByDelimiters(text) {
    // 🔥 먼저 텍스트 정리 (줄바꿈을 공백으로 변환 후 앞뒤 공백 제거)
    let cleanText = text.replace(/\n/g, ' ').trim();
    // 🔥 단위 패턴 보호: "상품명+숫자+단위" 패턴이 포함된 경우 분할하지 않음
    // "배추김치2키로 1", "고구마3kg 2개", "사과5박스 1", "머루포도2송이 1" 등
    const hasUnitPattern = /[가-힣]{2,}\d+\s*(키로|kg|박스|개|봉|팩|세트|병|그램|g|송이|마리|근|캔|통|봉지|포|장|묶음|단|줄|알|입|잔|토막|쪽|망)\s*\d+/.test(cleanText);
    if (hasUnitPattern) {
      console.log(`[splitByDelimiters] 단위 패턴 보호: "${cleanText}" → 분할하지 않음`);
      return [
        cleanText
      ];
    }
    // 🔥 전화번호 패턴 제거 (directNumberPattern 적용 전 처리)
    // 지점명+4자리숫자, 이름+4자리숫자 패턴 제거
    cleanText = cleanText.replace(/([가-힣]+점)(\d{4})/g, ''); // 상무점2673 → ''
    cleanText = cleanText.replace(/([가-힣]+)(\d{4})\s+/g, ''); // 이영옥7219 → ''
    cleanText = cleanText.replace(/\s+/g, ' ').trim(); // 중복 공백 제거
    // 다양한 구분자로 분할 시도  
    const delimiters = [
      ',',
      '.',
      ';',
      '/',
      '|'
    ];
    for (const delimiter of delimiters){
      if (cleanText.includes(delimiter)) {
        const segments = cleanText.split(delimiter).map((s)=>s.trim()).filter((s)=>s.length > 0 && s.match(/[가-힣]/)); // 한글이 포함된 것만
        if (segments.length > 1) {
          return segments;
        }
      }
    }
    // 🔥 혼합 패턴 처리: 숫자 있는 상품과 없는 상품이 섞여있는 경우
    // "오이6개 파프리카 3봉 애호박1개 팽이버섯1봉 생표고버섯1봉 깻잎2봉 당근 부추 대파 오이맛고추"
    const allSegments = [];
    // 1. 상품명+숫자가 붙어있는 패턴 ("오이6", "애호박1" 등)
    const directNumberPattern = /([가-힣]{2,}\d+)/g;
    const directMatches = [
      ...cleanText.matchAll(directNumberPattern)
    ];
    // 2. 상품명 숫자가 분리된 패턴 ("파프리카 3" 등)
    const separatedNumberPattern = /([가-힣]{2,})\s+(\d+)(?:개|봉|박스|키로)?/g;
    const separatedMatches = [
      ...cleanText.matchAll(separatedNumberPattern)
    ];
    // 3. 알려진 상품명 패턴 (숫자 없는 경우) - 🔥 복합 상품명을 먼저 처리하도록 정렬
    const knownProducts = [
      // 🔥 용도 키워드 (최우선 처리)
      '찌개용',
      '제육용',
      '불고기용',
      '국거리',
      '구이용',
      '스테이크용',
      '샤브용',
      // 복합 김치류 (길이 순으로 우선 처리)
      '오이소박이김치',
      '열무김치',
      '배추김치',
      '얼갈이겉절이김치',
      '새송이버섯',
      '팽이버섯',
      '표고버섯',
      '느타리버섯',
      '적양배추',
      '양배추',
      // 🔥 육류 부위별 키워드 추가
      '앞다리살',
      '후지살',
      '등갈비',
      '목살',
      '삼겹살',
      '안심',
      '등심',
      '채끝살',
      '부채살',
      '국거리',
      // 일반 상품
      '당근',
      '브로콜리',
      '파프리카',
      '오이',
      '청경채',
      '애호박',
      '가지',
      '양파',
      '대파',
      '쪽파',
      '상추',
      '깻잎',
      '시금치',
      '고구마',
      '감자',
      '토마토',
      '호박',
      '연근',
      '도라지',
      '마늘',
      '생강',
      '콩나물',
      '숙주',
      '돼지고기',
      '소고기',
      '닭고기',
      '생선',
      '고등어',
      '삼치',
      '갈치',
      '명태',
      '조기',
      '전복',
      '새우',
      '오징어',
      '꽃게',
      '게',
      '홍합',
      '바지락',
      '굴',
      '부추',
      '오이맛고추',
      // 단일 글자는 마지막에 (다른 복합어에 방해되지 않도록)
      '무',
      '배추',
      '버섯',
      '김치',
      '표고',
      '새송이',
      '팽이'
    ];
    // 사용된 패턴 위치 추적
    const usedPositions = new Set();
    // 직접 붙어있는 숫자 패턴 추가
    for (const match of directMatches){
      allSegments.push({
        text: match[1],
        start: match.index,
        end: match.index + match[0].length,
        hasNumber: true
      });
      for(let i = match.index; i < match.index + match[0].length; i++){
        usedPositions.add(i);
      }
    }
    // 분리된 숫자 패턴 추가
    for (const match of separatedMatches){
      const productName = match[1];
      const number = match[2];
      // 이미 직접 패턴으로 처리된 것은 제외
      const alreadyUsed = Array.from({
        length: match[0].length
      }, (_, i)=>match.index + i).some((pos)=>usedPositions.has(pos));
      if (!alreadyUsed) {
        allSegments.push({
          text: productName + number,
          start: match.index,
          end: match.index + match[0].length,
          hasNumber: true
        });
        for(let i = match.index; i < match.index + match[0].length; i++){
          usedPositions.add(i);
        }
      }
    }
    // 숫자 없는 상품명 찾기 (길이 순으로 정렬하여 긴 것부터 매칭)
    const sortedProducts = knownProducts.sort((a, b)=>b.length - a.length);
    for (const product of sortedProducts){
      // 🔥 한글 상품명을 위한 공백/문자열 경계 패턴 사용 (word boundary \b는 한글에서 동작하지 않음)
      const regex = new RegExp(`(?:^|\\s)(${product})(?=\\s|$)`, 'g');
      let match;
      while((match = regex.exec(cleanText)) !== null){
        // 실제 상품명의 시작 위치 계산
        const productStart = match.index + match[0].indexOf(match[1]);
        // 이미 사용된 위치가 아닌지 확인
        const alreadyUsed = Array.from({
          length: match[1].length
        }, (_, i)=>productStart + i).some((pos)=>usedPositions.has(pos));
        if (!alreadyUsed) {
          allSegments.push({
            text: product,
            start: productStart,
            end: productStart + match[1].length,
            hasNumber: false
          });
          for(let i = productStart; i < productStart + match[1].length; i++){
            usedPositions.add(i);
          }
        }
      }
    }
    // 위치 순으로 정렬하여 원래 순서 보존
    allSegments.sort((a, b)=>a.start - b.start);
    // 🔥 혼합 패턴으로 상품을 찾았다면 개수와 상관없이 반환 (단일 상품도 유효)
    if (allSegments.length > 0) {
      return allSegments.map((seg)=>seg.text);
    }
    // 🔥 기존 로직들 - 혼합 패턴이 없는 경우를 위한 fallback
    // 🔥 공백으로 구분된 상품명+숫자 패턴 분할 개선 ("배추2 석박지1", "안심1 국거리1", "전복1병어4 오징어1")
    // 먼저 모든 상품명+숫자 조합을 찾기
    const allProductNumbers = [
      ...cleanText.matchAll(/([가-힣]{2,}\d+)/g)
    ];
    if (allProductNumbers.length > 1) {
      // 🔥 공백으로 분리된 패턴인지 확인 ("배추2 석박지1")
      const hasSpaceBetween = /([가-힣]{2,}\d+)\s+([가-힣]{2,}\d+)/.test(cleanText);
      if (hasSpaceBetween) {
        // 공백으로 구분된 경우, 순서대로 추출
        const segments = allProductNumbers.map((match)=>match[1]);
        console.log(`[splitByDelimiters] 공백 구분 패턴 감지: "${cleanText}" → [${segments.join(', ')}]`);
        return segments;
      }
      // 연속으로 붙어있는 패턴 ("전복1병어4")도 처리
      const segments = allProductNumbers.map((match)=>match[1]);
      console.log(`[splitByDelimiters] 연속 상품 패턴 감지: "${cleanText}" → [${segments.join(', ')}]`);
      return segments;
    }
    // 공백 분리된 상품명과 숫자 패턴 ("안심 1 국거리 1")
    const spaceSeparatedPattern = /([가-힣]{2,})\s+(\d+)/g;
    const spaceSeparatedMatches = [
      ...cleanText.matchAll(spaceSeparatedPattern)
    ];
    if (spaceSeparatedMatches.length >= 2) {
      const segments = spaceSeparatedMatches.map((match)=>match[1] + match[2]); // "안심" + "1" = "안심1"
      return segments;
    }
    // 구분자가 없으면 상품명+숫자 패턴으로 분할
    const productNumberPattern = /([가-힣]{2,}\d+)/g;
    const matches = [
      ...cleanText.matchAll(productNumberPattern)
    ];
    if (matches.length > 1) {
      // 단순 단위 패턴은 분할하지 않음 ("1박스요", "2박스", "3알이요", "2송이", "5마리" 등)
      // 한국어 어미 추가: 요, 여, 욧, 였
      const hasSimpleUnit = cleanText.match(/^\d+\s*(박스|박|알|키로|개|송이|마리|근|병|캔|통|봉지|포|장|묶음|단|줄|입|잔|토막|쪽|망|봉|팩|세트|그램|g)(\s*이?\s*)?(요|여|욧|였)?$/);
      if (hasSimpleUnit) {
        return [
          cleanText
        ]; // 분할하지 않고 원본 반환
      }
      const segments = matches.map((match)=>match[1]).filter((s)=>s.length > 0);
      // 분할 검증: 모든 세그먼트의 합이 원본과 일치하는지 확인
      const reconstructed = segments.join('');
      const cleanTextNoSpaces = cleanText.replace(/\s+/g, '');
      if (reconstructed === cleanTextNoSpaces || segments.length >= 2) {
        return segments;
      }
    }
    // 더 유연한 상품명+숫자 패턴 분할 (한글 2글자 이상)
    const flexiblePattern = /([가-힣]{2,})\s*(\d+)/g;
    const flexibleMatches = [
      ...cleanText.matchAll(flexiblePattern)
    ];
    if (flexibleMatches.length > 1) {
      const segments = flexibleMatches.map((match)=>match[1] + match[2]); // "새우" + "1" = "새우1"
      return segments;
    }
    // 🔥 연속된 상품명 패턴 분할 (숫자 없는 경우) - fallback 처리
    // "당근브로콜리파프리카오이" → ["당근", "브로콜리", "파프리카", "오이"]
    const foundProducts = [];
    let remainingText = cleanText;
    // 길이가 긴 상품명부터 먼저 찾기 (예: "새송이버섯"이 "버섯"보다 우선)
    // knownProducts는 위에서 이미 정의됨
    for (const product of sortedProducts){
      if (remainingText.includes(product)) {
        foundProducts.push(product);
        // 첫 번째 매칭만 제거하여 순서 보존
        remainingText = remainingText.replace(product, '|SPLIT|');
      }
    }
    if (foundProducts.length > 1) {
      return foundProducts;
    }
    // 🔥 공백으로 구분된 순수 한글 상품명 분리 처리
    // "우리밀단팥빵 우리밀모닝빵" → ["우리밀단팥빵", "우리밀모닝빵"]
    if (/^[가-힣\s]+$/.test(cleanText) && cleanText.includes(' ')) {
      const spaceSegments = cleanText.split(' ').filter((s)=>s.trim().length > 0);
      // 2개 이상의 세그먼트가 있고, 각각 2글자 이상인 경우
      if (spaceSegments.length > 1 && spaceSegments.every((s)=>s.length >= 2)) {
        console.log(`[splitByDelimiters] 공백 구분 순수 상품명 분리: "${cleanText}" → [${spaceSegments.join(', ')}]`);
        return spaceSegments;
      }
    }
    // 분할할 수 없으면 원본 반환 (정리된 텍스트)
    return [
      cleanText
    ];
  }
  /**
   * 사용된 분할 방법 감지
   */ static getSplitMethodUsed(text) {
    // 콤마 구분
    if (text.includes(',')) return 'comma';
    // 점 구분
    if (text.includes('.')) return 'dot';
    // 공백 분리 상품명+숫자 패턴
    if (text.match(/([가-힣]{2,})\s+(\d+)/g)) return 'space_separated';
    // 공백 구분 상품명+숫자 패턴
    if (text.match(/([가-힣]{2,}\d+)\s+([가-힣]{2,}\d+)/)) return 'space_compound';
    // 상품명+숫자 패턴
    if (text.match(/([가-힣]{2,}\d+)/g)) return 'product_number';
    return 'unknown';
  }
  /**
   * 정규식 특수문자 이스케이프
   */ static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  /**
   * 토큰 매칭으로 최적 상품 찾기
   */ /**
   * 댓글에서 상품명을 추출하여 해당 상품만 필터링
   */ static filterProductsByName(comment, productMap) {
    // 댓글에서 숫자와 단위를 제거하여 순수 상품명 추출
    const cleanComment = comment.replace(/\d+/g, '').replace(/개|봉|세트|박스|팩|키로|kg/g, '').trim().toLowerCase();
    if (!cleanComment || cleanComment.length < 2) {
      return null;
    }
    const filteredMap = new Map();
    for (const [itemNumber, product] of productMap.entries()){
      const productName = (product.title || product.name || '').toLowerCase();
      const cleanProductName = productName.replace(/\[[^\]]+\]/g, '') // 날짜 제거
      .replace(/\d+kg/g, '') // 무게 제거
      .replace(/\d+[가-힣]+/g, '') // 가격 제거
      .replace(/\d+/g, '') // 남은 숫자 제거
      .trim();
      // 양방향 포함 검사 또는 유사도 검사
      const isMatched = cleanProductName.includes(cleanComment) || cleanComment.includes(cleanProductName) || cleanComment.length > 2 && cleanProductName.length > 2 && this.calculateSimilarity(cleanProductName, cleanComment) > 0.6;
      if (isMatched) {
        console.log(`[RecursivePattern] 상품 필터링: "${cleanComment}" → "${productName}"`);
        filteredMap.set(itemNumber, product);
      }
    }
    return filteredMap.size > 0 ? filteredMap : null;
  }
  static findBestTokenMatch(comment, productMap) {
    const commentTokens = normalizeAndTokenize(comment);
    let bestMatch = null;
    let maxMatchCount = 0;
    for (const [itemNumber, product] of productMap.entries()){
      const productName = product.title || product.name || '';
      const productTokens = normalizeAndTokenize(productName);
      // 교집합 계산
      const intersection = commentTokens.filter((token)=>productTokens.includes(token));
      const matchCount = intersection.length;
      if (matchCount > maxMatchCount) {
        maxMatchCount = matchCount;
        bestMatch = {
          itemNumber: itemNumber,
          productName: productName,
          price: product.price || product.base_price || product.basePrice || 0,
          matchCount: matchCount
        };
      }
    }
    return bestMatch;
  }
}
