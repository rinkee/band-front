// 단위 기반 패턴 매칭 함수

import { smartUnitMapping } from './orderPatternExtraction.js';

/**
 * 단위 기반 주문 추출 함수
 */
export function extractOrderByUnitPattern(
  commentText,
  productMap
) {
  if (!commentText || !productMap || productMap.size === 0) {
    return null;
  }

  // 텍스트 정규화 (개선 버전)
  const text = commentText
    .replace(/,/g, "")
    // 한글 숫자+단위 조합 처리 강화
    .replace(/한통/g, "1통")
    .replace(/한세트/g, "1세트")
    .replace(/한팩/g, "1팩")
    .replace(/한박스/g, "1박스")
    .replace(/한봉지/g, "1봉지")
    .replace(/한개/g, "1개")
    .replace(/두통/g, "2통")
    .replace(/두세트/g, "2세트")
    .replace(/두팩/g, "2팩")
    .replace(/두박스/g, "2박스")
    .replace(/두봉지/g, "2봉지")
    .replace(/두개/g, "2개")
    .replace(/세통/g, "3통")
    .replace(/세박스/g, "3박스")
    .replace(/네통/g, "4통")
    .replace(/네박스/g, "4박스")
    // 한글 숫자 변환
    .replace(/한(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "1")
    .replace(/두(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "2")
    .replace(/세(?!트)(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "3")
    .replace(/네(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "4")
    .replace(/다섯(?=\s*[봉팩통개병박상포묶키킬그손속모덩마알대])/g, "5")
    // 특수문자 변환
    .replace(/ㅣ/g, "1")
    .replace(/ㄱ/g, "1")
    .replace(/[lL]/g, "1")
    .replace(/[iI]/g, "1")
    .replace(/[oO]/g, "0")
    .replace(/([가-힣])(\d)/g, "$1 $2")
    .replace(/(\d)([가-힣])/g, "$1 $2")
    .trim()
    .toLowerCase();

  const foundOrders = [];

  // 취소/마감 댓글 체크
  if (text.includes("마감") || text.includes("취소") || text.includes("완판")) {
    return null;
  }

  // 스마트 단위 호환성 체크 함수
  function isUnitCompatible(commentUnit, productUnit) {
    if (!commentUnit || !productUnit) return false;
    
    const commentLower = commentUnit.toLowerCase();
    const productLower = productUnit.toLowerCase();
    
    // 완전 일치
    if (commentLower === productLower) return true;
    
    // 댓글 단위가 상품 단위와 호환되는지 체크
    const compatibleUnits = smartUnitMapping[productLower] || [];
    return compatibleUnits.includes(commentLower);
  }

  // 폴백 패턴 매칭 함수
  function tryFallbackPatternMatching(commentText, productMap) {
    // 숫자 추출
    const numbers = commentText.match(/\d+/g);
    if (!numbers) return null;
    
    const validNumbers = numbers
      .map((n) => parseInt(n))
      .filter((n) => n >= 1 && n <= 99);
      
    if (validNumbers.length === 0) return null;

    // 단위 추출
    let foundUnit = null;
    const allUnits = new Set();
    
    for (const units of Object.values(smartUnitMapping)) {
      units.forEach((unit) => allUnits.add(unit));
    }

    for (const unit of allUnits) {
      const unitPattern = new RegExp(`\\b${unit}\\b`, "i");
      if (unitPattern.test(commentText)) {
        foundUnit = unit;
        break;
      }
    }

    // 상품과 매칭
    for (const [itemNumber, productInfo] of productMap) {
      const productUnit = productInfo.quantity_text;
      if (foundUnit && isUnitCompatible(foundUnit, productUnit)) {
        return [{
          itemNumber: itemNumber,
          quantity: validNumbers[0],
          matchedUnit: foundUnit,
          actualUnit: productUnit,
          matchType: "fallback-unit-compatible",
          isAmbiguous: true,
          processingMethod: "fallback-pattern"
        }];
      }
    }

    // 단일 상품이고 숫자만 있는 경우
    if (productMap.size === 1 && validNumbers.length > 0) {
      const [itemNumber, productInfo] = Array.from(productMap)[0];
      return [{
        itemNumber: itemNumber,
        quantity: validNumbers[0],
        matchedUnit: "개",
        actualUnit: productInfo.quantity_text,
        matchType: "fallback-single-product",
        isAmbiguous: true,
        processingMethod: "fallback-pattern"
      }];
    }

    return null;
  }

  // 0단계: "k" 단위 처리
  const kMatch = text.match(/(\d+)\s*k(?:\s*주문)?(?:\s*[이요욧])?/i);
  if (kMatch && kMatch[1]) {
    const numberStr = kMatch[1];
    if (!(numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0")))) {
      const quantity = parseInt(numberStr);
      if (quantity >= 1 && quantity <= 999) {
        const convertedText = text.replace(/(\d+)\s*k/, `${quantity}키로`);
        
        // 키로 단위를 허용하는 상품 찾기
        for (const [itemNumber, productInfo] of productMap) {
          const quantityText = productInfo.quantity_text;
          const similarUnits = smartUnitMapping[quantityText] || [quantityText, "개"];
          
          if (similarUnits.includes("키로") || similarUnits.includes("k")) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: "키로",
              actualUnit: quantityText,
              matchType: "k-unit-conversion",
              isAmbiguous: false,
              processingMethod: "k-unit-pattern"
            });
            return foundOrders;
          }
        }
      }
    }
  }

  // 1단계: 우선 개/대/요 매칭
  const universalMatch = text.match(/(\d+)\s*(?:개|대|요)(?:\s*[요욧])?/i);
  if (universalMatch && universalMatch[1]) {
    const numberStr = universalMatch[1];
    if (!(numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0")))) {
      const quantity = parseInt(numberStr);
      if (quantity >= 1 && quantity <= 999) {
        // 단일 상품인 경우
        if (productMap.size === 1) {
          const [itemNumber, productInfo] = Array.from(productMap)[0];
          const quantityText = productInfo.quantity_text;
          foundOrders.push({
            itemNumber: itemNumber,
            quantity: quantity,
            matchedUnit: "개",
            actualUnit: quantityText,
            matchType: "universal-unit-priority",
            isAmbiguous: false,
            processingMethod: "universal-unit-pattern"
          });
          return foundOrders;
        }
        
        // 다중 상품인 경우: "개"를 허용하는 첫 번째 상품에만 매칭
        for (const [itemNumber, productInfo] of productMap) {
          const quantityText = productInfo.quantity_text;
          const similarUnits = smartUnitMapping[quantityText] || [quantityText, "개"];
          
          if (similarUnits.includes("개")) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: "개",
              actualUnit: quantityText,
              matchType: "universal-unit-priority",
              isAmbiguous: productMap.size > 1,
              processingMethod: "universal-unit-pattern"
            });
            return foundOrders;
          }
        }
      }
    }
  }

  // 2단계: 각 상품의 quantity_text 기반 매칭
  for (const [itemNumber, productInfo] of productMap) {
    const quantityText = productInfo.quantity_text;
    if (quantityText) {
      const similarUnits = smartUnitMapping[quantityText] || [quantityText];
      
      // 각 유사 단위에 대해 매칭 시도
      for (const unit of similarUnits) {
        // 명시적 단위 매칭 패턴
        const explicitPattern = new RegExp(`(\\d+)\\s*${unit}(?:\\s*[이요욧])?`, "gi");
        const match = text.match(explicitPattern);
        
        if (match && match[0]) {
          const numberMatch = match[0].match(/(\d+)/);
          if (numberMatch && numberMatch[1]) {
            const numberStr = numberMatch[1];
            if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"))) {
              continue;
            }
            
            const quantity = parseInt(numberStr);
            if (quantity >= 1 && quantity <= 999) {
              foundOrders.push({
                itemNumber: itemNumber,
                quantity: quantity,
                matchedUnit: unit,
                actualUnit: quantityText,
                matchType: "quantity-text-explicit",
                isAmbiguous: false,
                processingMethod: "quantity-text-pattern"
              });
              return foundOrders;
            }
          }
        }
      }

      // 단순 숫자 매칭
      const simplePatterns = [
        /^\s*(\d+)\s*$/,
        /^\s*(\d+)\s*요\s*$/
      ];

      for (const pattern of simplePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const numberStr = match[1];
          if (numberStr.length >= 4 || (numberStr.length >= 3 && numberStr.startsWith("0"))) {
            continue;
          }
          
          const quantity = parseInt(numberStr);
          if (quantity >= 1 && quantity <= 999) {
            foundOrders.push({
              itemNumber: itemNumber,
              quantity: quantity,
              matchedUnit: quantityText,
              matchType: pattern === simplePatterns[0] ? "quantity-text-number-only" : "quantity-text-number-with-yo",
              isAmbiguous: false,
              processingMethod: "quantity-text-pattern"
            });
            return foundOrders;
          }
        }
      }
    }
  }

  // 3단계: 폴백 매칭 시도
  if (foundOrders.length === 0) {
    const fallbackResult = tryFallbackPatternMatching(commentText, productMap);
    if (fallbackResult) {
      return fallbackResult;
    }
  }

  // 4단계: 상품 번호 + 수량 매칭
  const itemNumberQuantityMatch = text.match(/(\d+)\s*번\s*(\d+)/);
  if (itemNumberQuantityMatch) {
    const itemNum = parseInt(itemNumberQuantityMatch[1]);
    const quantity = parseInt(itemNumberQuantityMatch[2]);
    
    if (productMap.has(itemNum) && quantity >= 1 && quantity <= 999) {
      const productInfo = productMap.get(itemNum);
      foundOrders.push({
        itemNumber: itemNum,
        quantity: quantity,
        matchedUnit: productInfo.quantity_text || "개",
        actualUnit: productInfo.quantity_text || "개",
        matchType: "item-number-quantity",
        isAmbiguous: false,
        processingMethod: "item-number-pattern"
      });
      return foundOrders;
    }
  }

  return foundOrders.length > 0 ? foundOrders : null;
}