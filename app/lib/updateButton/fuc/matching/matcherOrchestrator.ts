/**
 * 매처 오케스트레이터
 * 댓글 분석 결과를 바탕으로 적절한 매처를 선택하고 실행
 */ import { CommentAnalyzer } from './commentAnalyzer.ts';
import { SimpleNumberMatcher } from './matchers/simpleNumberMatcher.ts';
import { RecursivePatternMatcher } from './matchers/recursivePatternMatcher.ts';
import { BoxPatternMatcher } from './matchers/boxPatternMatcher.ts';
import { NumberBasedMatcher } from './matchers/numberBasedMatcher.ts';
import { ProductPatternClassifier } from '../utils/productPatternClassifier.ts';
export class MatcherOrchestrator {
  // 신뢰도 임계값 (동적 조정)
  static CONFIDENCE_THRESHOLD = 0.7;
  static SINGLE_PRODUCT_THRESHOLD = 0.5;
  // 3개 매처 시스템 우선순위 매트릭스
  static PATTERN_MATCHER_PRIORITY = {
    SINGLE_PRODUCT: [
      'SimpleNumber',
      'RecursivePattern'
    ],
    BOX_PRODUCTS: [
      'BoxPattern',
      'NumberBased',
      'RecursivePattern'
    ],
    SIZE_VARIANT: [
      'NumberBased',
      'SimpleNumber',
      'RecursivePattern'
    ],
    QUANTITY_VARIANT: [
      'NumberBased',
      'SimpleNumber',
      'RecursivePattern'
    ],
    MIXED_PRODUCTS: [
      'NumberBased',
      'RecursivePattern',
      'BoxPattern',
      'SimpleNumber'
    ]
  };
  /**
   * 동기식 오케스트레이션 함수 (기존 API 호환)
   * band-get-posts-a에서 사용
   */ static orchestrate(comment, productMap) {
    const result = this.executeMatcherSync(comment, productMap);
    if (!result || !result.success || result.products.length === 0) {
      return null;
    }
    return {
      isOrder: true,
      products: result.products,
      matchMethod: result.matcherUsed,
      pattern: result.debugInfo?.pattern || 'unknown',
      debugInfo: result.debugInfo
    };
  }
  /**
   * 비동기 오케스트레이션 함수 (새로운 API)
   */ static async orchestrateAsync(comment, productMap, options) {
    const startTime = performance.now();
    // 🏷️ band:refer 태그 전처리 제거
    // <band:refer user_key="...">username</band:refer> 패턴 제거
    comment = comment.replace(/<band:refer[^>]*>.*?<\/band:refer>\s*/g, '');
    // 🥦 댓글 우선 매칭: "브로컬리 2개" 같은 케이스
    // 댓글이 상품명과 일치하면 해당 상품 우선 매칭
    if (productMap && productMap.size > 1) {
      const exactMatchResult = this.handleExactProductMatch(comment, productMap);
      if (exactMatchResult) {
        const endTime = performance.now();
        const metadata = {
          commentAnalysis: {
            type: 'exact_match',
            isSingleProduct: false,
            patterns: [],
            confidence: exactMatchResult.confidence,
            recommendedMatcher: 'ExactMatch'
          },
          matcherUsed: 'ExactMatch',
          matchingTime: endTime - startTime,
          confidence: exactMatchResult.confidence,
          fallbackUsed: false,
          timestamp: new Date().toISOString(),
          debugInfo: {
            comment,
            exactMatch: true,
            matchingResult: exactMatchResult
          }
        };
        return {
          success: exactMatchResult.success,
          products: exactMatchResult.products,
          metadata,
          debugInfo: exactMatchResult.debugInfo
        };
      }
    }
    // 🍉 수박 특별 처리 (무게 제한 패턴)
    if (productMap && this.isWatermelonPost(productMap)) {
      const watermelonResult = this.handleWatermelonComment(comment, productMap);
      if (watermelonResult) {
        const endTime = performance.now();
        const metadata = {
          commentAnalysis: {
            type: 'product_name',
            isSingleProduct: productMap.size === 1,
            patterns: [],
            confidence: watermelonResult.confidence,
            recommendedMatcher: 'ProductName'
          },
          matcherUsed: 'Watermelon',
          matchingTime: endTime - startTime,
          confidence: watermelonResult.confidence,
          fallbackUsed: false,
          timestamp: new Date().toISOString(),
          debugInfo: {
            comment,
            watermelonPattern: true,
            matchingResult: watermelonResult
          }
        };
        return {
          success: watermelonResult.success,
          products: watermelonResult.products,
          metadata,
          debugInfo: watermelonResult.debugInfo
        };
      }
    }
    // 1. 댓글 분석
    const analysis = CommentAnalyzer.analyze(comment, productMap);
    // 2. 매처 선택 및 실행
    const matchingResult = await this.executeMatcher(comment, analysis, productMap, options);
    // 3. 메타데이터 구성
    const endTime = performance.now();
    const metadata = {
      commentAnalysis: analysis,
      matcherUsed: matchingResult.matcherUsed,
      matchingTime: endTime - startTime,
      confidence: matchingResult.confidence,
      fallbackUsed: matchingResult.fallbackUsed || false,
      timestamp: new Date().toISOString(),
      debugInfo: {
        comment,
        analysis,
        matchingResult,
        // 🔥 디버깅 정보 강화
        confidenceThreshold: analysis.isSingleProduct ? this.SINGLE_PRODUCT_THRESHOLD : this.CONFIDENCE_THRESHOLD,
        isSingleProduct: analysis.isSingleProduct,
        productCount: productMap?.size || 0,
        recommendedMatcher: analysis.recommendedMatcher,
        actualMatcher: matchingResult.matcherUsed
      }
    };
    return {
      success: matchingResult.success,
      products: matchingResult.products,
      metadata,
      debugInfo: matchingResult.debugInfo,
      patternDetails: matchingResult.patternDetails // 🔥 패턴 디버깅 정보 전달
    };
  }
  /**
   * 동기식 매처 실행 (기존 API 호환)
   */ static executeMatcherSync(comment, productMap) {
    // 🏷️ band:refer 태그 전처리 제거
    comment = comment.replace(/<band:refer[^>]*>.*?<\/band:refer>\s*/g, '');
    // 🔥 0. 상품명에 "박스"가 포함된 경우 BoxPatternMatcher 우선 실행
    if (productMap && this.hasBoxInProductNames(productMap)) {
      console.log(`[MatcherOrchestrator] 상품명에 박스 포함 감지 - BoxPatternMatcher 우선 실행 (동기)`);
      const analysis = CommentAnalyzer.analyze(comment, productMap);
      const boxResult = this.tryMatcherSync('BoxPattern', comment, analysis, productMap);
      if (boxResult && boxResult.success && boxResult.confidence >= 0.5) {
        console.log(`[MatcherOrchestrator] BoxPatternMatcher 우선 성공 (동기): confidence=${boxResult.confidence}`);
        return {
          ...boxResult,
          patternType: 'BOX_PRIORITY',
          patternConfidence: 0.95
        };
      }
    }
    // 1. 댓글 분석
    const analysis = CommentAnalyzer.analyze(comment, productMap);
    // 2. 상품 패턴 분류
    const productPattern = ProductPatternClassifier.classify(productMap || new Map());
    // 3. 패턴에 따른 매처 우선순위 결정
    const priority = this.PATTERN_MATCHER_PRIORITY[productPattern.type] || this.PATTERN_MATCHER_PRIORITY.MIXED_PRODUCTS;
    // 4. 동적 임계값 설정
    const confidenceThreshold = analysis.isSingleProduct ? this.SINGLE_PRODUCT_THRESHOLD : this.CONFIDENCE_THRESHOLD;
    console.log(`[MatcherOrchestrator] Pattern: ${productPattern.type}, Priority: [${priority.join(', ')}]`);
    let result = null;
    let attemptedMatchers = [];
    // 5. 우선순위에 따라 매처 순차 실행
    for (const matcherType of priority){
      attemptedMatchers.push(matcherType);
      const matcherResult = this.tryMatcherSync(matcherType, comment, analysis, productMap);
      if (matcherResult && matcherResult.success) {
        console.log(`[MatcherOrchestrator] ${matcherType} 매처 성공: confidence=${matcherResult.confidence}`);
        // 충분한 신뢰도면 바로 채택
        if (matcherResult.confidence >= confidenceThreshold) {
          result = {
            ...matcherResult,
            patternType: productPattern.type,
            patternConfidence: productPattern.confidence
          };
          break;
        }
        // 낮은 신뢰도라도 최선의 결과 보관
        if (!result || matcherResult.confidence > result.confidence) {
          result = {
            ...matcherResult,
            patternType: productPattern.type,
            patternConfidence: productPattern.confidence,
            fallbackUsed: true
          };
        }
      }
    }
    // 6. 결과 반환
    if (!result) {
      console.log(`[MatcherOrchestrator] 모든 매처 실패: Pattern=${productPattern.type}`);
      return {
        success: false,
        products: [],
        matcherUsed: 'NONE',
        confidence: 0,
        fallbackUsed: true,
        debugInfo: {
          reason: `모든 매처 실패 (${priority.length}개 매처 시도)`,
          attemptedMatchers,
          productPattern: productPattern.type,
          confidenceThreshold,
          comment
        }
      };
    }
    console.log(`[MatcherOrchestrator] 최종 선택: ${result.matcherUsed} (confidence=${result.confidence})`);
    return result;
  }
  /**
   * 패턴 기반 매처 실행 (새로운 4개 매처 시스템)
   */ static async executeMatcher(comment, analysis, productMap, options) {
    // 🔥 0. 상품명에 "박스"가 포함된 경우 BoxPatternMatcher 우선 실행
    if (productMap && this.hasBoxInProductNames(productMap)) {
      console.log(`[MatcherOrchestrator] 상품명에 박스 포함 감지 - BoxPatternMatcher 우선 실행`);
      const boxResult = await this.tryMatcher('BoxPattern', comment, analysis, productMap);
      if (boxResult && boxResult.success && boxResult.confidence >= 0.5) {
        console.log(`[MatcherOrchestrator] BoxPatternMatcher 우선 성공: confidence=${boxResult.confidence}`);
        return {
          ...boxResult,
          patternType: 'BOX_PRIORITY',
          patternConfidence: 0.95
        };
      }
    }
    // 1. 상품 패턴 분류
    const productPattern = ProductPatternClassifier.classify(productMap || new Map());
    // 2. 패턴에 따른 매처 우선순위 결정
    const priority = this.PATTERN_MATCHER_PRIORITY[productPattern.type] || this.PATTERN_MATCHER_PRIORITY.MIXED_PRODUCTS;
    // 3. 동적 임계값 설정
    const confidenceThreshold = analysis.isSingleProduct ? this.SINGLE_PRODUCT_THRESHOLD : this.CONFIDENCE_THRESHOLD;
    console.log(`[MatcherOrchestrator] Pattern: ${productPattern.type}, Priority: [${priority.join(', ')}]`);
    let result = null;
    let attemptedMatchers = [];
    // 4. 우선순위에 따라 매처 순차 실행
    for (const matcherType of priority){
      attemptedMatchers.push(matcherType);
      const matcherResult = await this.tryMatcher(matcherType, comment, analysis, productMap);
      if (matcherResult && matcherResult.success) {
        console.log(`[MatcherOrchestrator] ${matcherType} 매처 성공: confidence=${matcherResult.confidence}`);
        // 충분한 신뢰도면 바로 채택
        if (matcherResult.confidence >= confidenceThreshold) {
          result = {
            ...matcherResult,
            patternType: productPattern.type,
            patternConfidence: productPattern.confidence
          };
          break;
        }
        // 낮은 신뢰도라도 최선의 결과 보관
        if (!result || matcherResult.confidence > result.confidence) {
          result = {
            ...matcherResult,
            patternType: productPattern.type,
            patternConfidence: productPattern.confidence,
            fallbackUsed: true
          };
        }
      }
    }
    // 5. 결과 반환
    if (!result) {
      console.log(`[MatcherOrchestrator] 모든 매처 실패: Pattern=${productPattern.type}`);
      return {
        success: false,
        products: [],
        matcherUsed: 'NONE',
        confidence: 0,
        fallbackUsed: true,
        debugInfo: {
          reason: `모든 매처 실패 (${priority.length}개 매처 시도)`,
          attemptedMatchers,
          productPattern: productPattern.type,
          confidenceThreshold,
          comment
        }
      };
    }
    console.log(`[MatcherOrchestrator] 최종 선택: ${result.matcherUsed} (confidence=${result.confidence})`);
    return result;
  }
  /**
   * 개별 매처 실행 (동기식)
   */ static tryMatcherSync(matcherType, comment, analysis, productMap) {
    try {
      switch(matcherType){
        case 'SimpleNumber':
          return this.executeSimpleNumberMatcher(comment, analysis, productMap);
        case 'RecursivePattern':
          return this.executeRecursivePatternMatcher(comment, productMap);
        case 'BoxPattern':
          return this.executeBoxPatternMatcher(comment, productMap);
        case 'NumberBased':
          return this.executeNumberBasedMatcher(comment, productMap);
        default:
          console.warn(`[MatcherOrchestrator] Unknown matcher type: ${matcherType}`);
          return null;
      }
    } catch (error) {
      console.error(`[MatcherOrchestrator] Error in ${matcherType} matcher:`, error);
      return null;
    }
  }
  /**
   * 개별 매처 실행 (3개 매처 시스템)
   */ static async tryMatcher(matcherType, comment, analysis, productMap) {
    try {
      switch(matcherType){
        case 'SimpleNumber':
          return this.executeSimpleNumberMatcher(comment, analysis, productMap);
        case 'RecursivePattern':
          return this.executeRecursivePatternMatcher(comment, productMap);
        case 'BoxPattern':
          return this.executeBoxPatternMatcher(comment, productMap);
        case 'NumberBased':
          return this.executeNumberBasedMatcher(comment, productMap);
        default:
          console.warn(`[MatcherOrchestrator] Unknown matcher type: ${matcherType}`);
          return null;
      }
    } catch (error) {
      console.error(`[MatcherOrchestrator] Error in ${matcherType} matcher:`, error);
      return null;
    }
  }
  /**
   * SimpleNumber 매처 실행
   * 신뢰도 손실 방지를 위해 원본 confidence 유지
   */ static executeSimpleNumberMatcher(comment, analysis, productMap) {
    const result = SimpleNumberMatcher.match(comment, productMap, analysis.isSingleProduct);
    if (!result) {
      return null;
    }
    // 🔥 신뢰도 보정: 단일상품 + 단순 숫자 패턴일 때 신뢰도 유지
    let finalConfidence = result.confidence;
    // 단일상품이고 수량만 표현한 경우 신뢰도 보장
    if (analysis.isSingleProduct && result.isQuantityOnly) {
      // 이미 SimpleNumberMatcher에서 높은 신뢰도를 부여했으므로 그대로 사용
      finalConfidence = Math.max(result.confidence, 0.9);
    }
    const unitPrice = typeof result.price === 'number' ? result.price : null;
    const totalPrice = typeof result.totalPrice === 'number' ? result.totalPrice : unitPrice !== null ? unitPrice * result.quantity : undefined;
    return {
      success: true,
      products: [
        {
          itemNumber: result.itemNumber,
          quantity: result.quantity,
          confidence: finalConfidence,
          productName: result.debugInfo?.representativeProduct?.name || result.debugInfo?.representativeProduct?.title,
          price: unitPrice ?? undefined,
          totalPrice
        }
      ],
      matcherUsed: 'SimpleNumber',
      confidence: finalConfidence,
      fallbackUsed: false,
      debugInfo: {
        ...result.debugInfo,
        originalConfidence: result.confidence,
        adjustedConfidence: finalConfidence,
        isSingleProduct: analysis.isSingleProduct,
        totalPrice
      }
    };
  }
  /**
   * NumberBased 매처 실행 (다중 상품 번호 패턴)
   */ static executeNumberBasedMatcher(comment, productMap) {
    if (!productMap || productMap.size === 0) {
      return null;
    }
    const results = NumberBasedMatcher.match(comment, productMap);
    if (!results || results.length === 0) {
      return null;
    }
    const products = results.map((result)=>{
      const productInfo = productMap.get(result.itemNumber);
      const unitPrice = productInfo?.price ?? productInfo?.basePrice ?? productInfo?.base_price;
      return {
        itemNumber: result.itemNumber,
        quantity: result.quantity,
        confidence: result.confidence,
        productName: productInfo?.title || productInfo?.name,
        price: unitPrice
      };
    });
    const overallConfidence = products.length > 0 ? products.reduce((sum, product)=>sum + (product.confidence ?? 0), 0) / products.length : 0;
    return {
      success: true,
      products,
      matcherUsed: 'NumberBased',
      confidence: overallConfidence,
      fallbackUsed: false,
      debugInfo: {
        matchedResults: results,
        matcher: 'NumberBased'
      }
    };
  }
  /**
   * RecursivePattern 매처 실행 (다중 상품 재귀 매처)
   */ static executeRecursivePatternMatcher(comment, productMap) {
    const result = RecursivePatternMatcher.match(comment, productMap);
    if (!result || !result.success) {
      return null;
    }
    return {
      success: true,
      products: result.products.map((product)=>({
          itemNumber: product.itemNumber,
          quantity: product.quantity,
          confidence: product.confidence,
          productName: product.productName,
          price: product.price
        })),
      matcherUsed: 'RecursivePattern',
      confidence: result.products.length > 0 ? result.products[0].confidence : 0,
      fallbackUsed: false,
      debugInfo: {
        totalProducts: result.products.length,
        products: result.products
      }
    };
  }
  /**
   * BoxPattern 매처 실행 (박스/세트 전용)
   */ static executeBoxPatternMatcher(comment, productMap) {
    const result = BoxPatternMatcher.match(comment, productMap);
    if (!result || !result.isOrder) {
      return null;
    }
    return {
      success: true,
      products: [
        {
          itemNumber: result.productItemNumber,
          quantity: result.quantity,
          confidence: result.confidence
        }
      ],
      matcherUsed: 'BoxPattern',
      confidence: result.confidence,
      fallbackUsed: false,
      debugInfo: {
        ...result.debugInfo,
        matchMethod: result.matchMethod,
        boxType: result.boxType
      }
    };
  }
  /**
   * 수박 게시물 판별
   */ static isWatermelonPost(productMap) {
    return Array.from(productMap.values()).some((product)=>{
      const title = (product.title || product.name || '').toLowerCase();
      return title.includes('수박');
    });
  }
  /**
   * 수박 댓글 특별 처리
   */ static handleWatermelonComment(comment, productMap) {
    const normalized = comment.toLowerCase().trim();
    // 🍉 수박 무게 간단 표현: "5키로", "7키로 1", "5키로1" (이하 생략)
    const simpleWeightMatch = normalized.match(/^(\d+)\s*(키로|kg)\s*(\d+)?\s*(통|개|토에)?$/);
    if (simpleWeightMatch) {
      const weight = simpleWeightMatch[1];
      const quantityStr = simpleWeightMatch[3];
      const quantity = quantityStr ? parseInt(quantityStr) : 1;
      // 해당 무게 수박 찾기 (이하가 있는 상품)
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(`${weight}kg이하`) || title.includes(`${weight}키로이하`)) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity,
                confidence: 0.93
              }
            ],
            confidence: 0.93,
            debugInfo: {
              pattern: 'watermelon_simple_weight',
              weight,
              quantity,
              matchedProduct: product
            }
          };
        }
      }
    }
    // 패턴 1: "5kg이하", "7kg이하", "8kg이하" (숫자만)
    const weightOnlyMatch = normalized.match(/^(\d+)\s*(kg|키로)\s*이하$/);
    if (weightOnlyMatch) {
      const weight = weightOnlyMatch[1];
      // 해당 무게 수박 찾기
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(`${weight}kg이하`) || title.includes(`${weight}키로이하`)) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity: 1,
                confidence: 0.95
              }
            ],
            confidence: 0.95,
            debugInfo: {
              pattern: 'watermelon_weight_only',
              weight,
              matchedProduct: product
            }
          };
        }
      }
    }
    // 패턴 2: "5kg이하1", "7kg이하 1", "5kg이하 1통"
    const weightWithQuantityMatch = normalized.match(/^(\d+)\s*(kg|키로)\s*이하\s*(\d+)?\s*(통|개)?$/);
    if (weightWithQuantityMatch) {
      const weight = weightWithQuantityMatch[1];
      const quantityStr = weightWithQuantityMatch[3];
      const quantity = quantityStr ? parseInt(quantityStr) : 1;
      // 해당 무게 수박 찾기
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(`${weight}kg이하`) || title.includes(`${weight}키로이하`)) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity,
                confidence: 0.9
              }
            ],
            confidence: 0.9,
            debugInfo: {
              pattern: 'watermelon_weight_with_quantity',
              weight,
              quantity,
              matchedProduct: product
            }
          };
        }
      }
    }
    // 패턴 3: "수박 5kg이하", "수박 5kg이하 1통", "수박 7키로이하 2개"
    const watermelonWeightMatch = normalized.match(/^수박\s*(\d+)\s*(kg|키로)\s*이하\s*(\d+)?\s*(통|개)?$/);
    if (watermelonWeightMatch) {
      const weight = watermelonWeightMatch[1];
      const quantityStr = watermelonWeightMatch[3];
      const quantity = quantityStr ? parseInt(quantityStr) : 1;
      // 해당 무게 수박 찾기
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(`${weight}kg이하`) || title.includes(`${weight}키로이하`)) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity,
                confidence: 0.92
              }
            ],
            confidence: 0.92,
            debugInfo: {
              pattern: 'watermelon_with_weight',
              weight,
              quantity,
              matchedProduct: product
            }
          };
        }
      }
    }
    // 패턴 4: "5키로 이하 2통" (띄어쓰기 변형)
    const weightVariationMatch = normalized.match(/^(\d+)\s*(키로|kg)\s+이하\s*(\d+)?\s*(통|개)?$/);
    if (weightVariationMatch) {
      const weight = weightVariationMatch[1];
      const quantityStr = weightVariationMatch[3];
      const quantity = quantityStr ? parseInt(quantityStr) : 1;
      // 해당 무게 수박 찾기
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes(`${weight}kg이하`) || title.includes(`${weight}키로이하`)) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity,
                confidence: 0.9
              }
            ],
            confidence: 0.9,
            debugInfo: {
              pattern: 'watermelon_weight_variation',
              weight,
              quantity,
              matchedProduct: product
            }
          };
        }
      }
    }
    // 패턴 5: "수박", "수박 1통", "수박 2개"
    const simpleWatermelonMatch = normalized.match(/^수박\s*(\d+)?\s*(통|개)?$/);
    if (simpleWatermelonMatch) {
      const quantityStr = simpleWatermelonMatch[1];
      const quantity = quantityStr ? parseInt(quantityStr) : 1;
      // 첫 번째 수박 상품 선택 (보통 단일 상품)
      for (const [itemNumber, product] of productMap){
        const title = (product.title || product.name || '').toLowerCase();
        if (title.includes('수박')) {
          return {
            success: true,
            products: [
              {
                itemNumber,
                quantity,
                confidence: 0.85
              }
            ],
            confidence: 0.85,
            debugInfo: {
              pattern: 'watermelon_simple',
              quantity,
              matchedProduct: product
            }
          };
        }
      }
    }
    return null;
  }
  /**
   * 댓글 우선 정확 매칭
   * 예: "브로컬리 2개" 상품이 있을 때 "2개" 댓글 → 해당 상품 매칭
   */ static handleExactProductMatch(comment, productMap) {
    // 특수문자 제거하여 정규화 (이모지, 특수기호 등 모두 제거)
    const normalized = comment.toLowerCase().trim().replace(/[~!@#$%^&*()_+=\-`{}\[\]:;"'<>,.?\/\\|♡♥★☆○●◎◇◆□■△▲▽▼※₩]+/g, '') // 특수문자 제거
    .replace(/[ㅋㅎㅜㅠㅡ]+/g, '') // 자음/모음 제거
    .replace(/\s+/g, ' ') // 여러 공백을 하나로
    .trim();
    // 댓글에서 수량 표현 추출
    // "2개", "2개요", "두개", "두개요" 등
    const quantityPatterns = [
      /^(\d+)\s*개(요)?$/,
      /^(두|세|네|다섯)\s*개(요)?$/,
      /^(한|하나)(요)?$/ // "하나", "하나요"
    ];
    let requestedQuantity = 0;
    let isQuantityComment = false;
    // 숫자 패턴 체크
    for (const pattern of quantityPatterns){
      const match = normalized.match(pattern);
      if (match) {
        if (pattern === quantityPatterns[0]) {
          requestedQuantity = parseInt(match[1]);
        } else if (pattern === quantityPatterns[1]) {
          const koreanNumbers = {
            '두': 2,
            '세': 3,
            '네': 4,
            '다섯': 5
          };
          requestedQuantity = koreanNumbers[match[1]] || 0;
        } else if (pattern === quantityPatterns[2]) {
          requestedQuantity = 1;
        }
        isQuantityComment = true;
        break;
      }
    }
    if (!isQuantityComment || requestedQuantity === 0) {
      return null;
    }
    // 상품 중에서 댓글과 일치하는 상품 찾기
    // 예: "2개" 댓글 → "브로컬리 2개" 상품
    for (const [itemNumber, product] of productMap){
      const productTitle = (product.title || product.name || '').toLowerCase();
      // 상품명에 해당 수량이 포함되어 있는지 확인
      // "브로컬리 2개", "사과 3개" 등
      if (productTitle.includes(`${requestedQuantity}개`)) {
        return {
          success: true,
          products: [
            {
              itemNumber,
              quantity: 1,
              confidence: 0.99 // 매우 높은 신뢰도
            }
          ],
          confidence: 0.99,
          debugInfo: {
            pattern: 'exact_product_match',
            comment: normalized,
            requestedQuantity,
            matchedProduct: product,
            reason: `Comment "${comment}" exactly matches product containing "${requestedQuantity}개"`
          }
        };
      }
    }
    return null;
  }
  /**
   * 결과 병합 (중복 제거)
   */ static mergeResults(results) {
    const merged = new Map();
    for (const result of results){
      const key = result.itemNumber;
      if (!merged.has(key)) {
        merged.set(key, result);
      } else {
        // 같은 상품이면 수량 합산, 신뢰도는 높은 것 선택
        const existing = merged.get(key);
        merged.set(key, {
          ...existing,
          quantity: existing.quantity + result.quantity,
          confidence: Math.max(existing.confidence, result.confidence)
        });
      }
    }
    return Array.from(merged.values());
  }
  /**
   * 디버그용 상세 분석 (4개 매처 시스템)
   */ static async analyzeWithDetails(comment, productMap) {
    const analysis = CommentAnalyzer.analyze(comment, productMap);
    const productPattern = ProductPatternClassifier.classify(productMap || new Map());
    const allMatchers = {};
    // 새로운 4개 매처 실행하여 비교
    allMatchers['SimpleNumber'] = SimpleNumberMatcher.match(comment, productMap, analysis.isSingleProduct);
    allMatchers['ProductPattern'] = ProductPatternMatcher.match(comment, productMap);
    allMatchers['BoxPattern'] = BoxPatternMatcher.match(comment, productMap);
    allMatchers['NumberBased'] = NumberBasedMatcher.match(comment, productMap);
    // 패턴에 따른 우선순위
    const priority = this.PATTERN_MATCHER_PRIORITY[productPattern.type] || this.PATTERN_MATCHER_PRIORITY.MIXED_PRODUCTS;
    return {
      comment,
      analysis,
      productPattern: {
        type: productPattern.type,
        unitType: productPattern.unitType,
        confidence: productPattern.confidence,
        isNumberMeaningQuantity: productPattern.isNumberMeaningQuantity,
        useOptimalPrice: productPattern.useOptimalPrice
      },
      matcherPriority: priority,
      allMatchers,
      productMapSize: productMap?.size || 0,
      timestamp: new Date().toISOString()
    };
  }
  /**
   * 상품명에 "박스"가 포함되어 있는지 확인
   */ static hasBoxInProductNames(productMap) {
    for (const product of productMap.values()){
      const productName = (product.title || product.name || '').toLowerCase();
      if (productName.includes('박스') || productName.includes('box')) {
        return true;
      }
    }
    return false;
  }
}
