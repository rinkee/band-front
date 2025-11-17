// 가격 및 수량 처리 유틸리티 함수들
/**
 * 함수명: extractPriceInfoFromContent
 * 목적: 게시물 콘텐츠에서 가격 정보 추출
 * 사용처: 가격 분석 로직
 * 의존성: 없음
 * 파라미터:
 *   - content: 게시물 콘텐츠
 * 리턴값: 추출된 가격 정보 배열
 */
export function extractPriceInfoFromContent(content: any) {
  const priceInfoList: any[] = [];
  console.log(`[extractPriceInfoFromContent] 컨텐츠 분석 시작:\n${content}`);
  // 🔥 천도복숭아 케이스 개선: 라인별 멀티라인 가격 패턴 처리
  // "🍑 천도복숭아 1키로\n👉👉👉 3,900원!!" 형식 처리
  const lines = content.split('\n');
  for(let i = 0; i < lines.length - 1; i++){
    const currentLine = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    // 다음 줄이 가격 패턴인지 확인 (현재 줄은 가격이 아니어야 함)
    const priceMatch = nextLine.match(/👉+\s*([0-9,]+)원/);
    const currentIsNotPrice = !currentLine.match(/👉+\s*([0-9,]+)원/);
    if (priceMatch && currentLine && currentIsNotPrice) {
      // 현재 줄에서 의미있는 설명 추출 (이모지 제거)
      let description = currentLine.replace(/^[🍑🍎‼️\s]*/, '').trim();
      const priceStr = priceMatch[1].replace(/,/g, "");
      const price = parseInt(priceStr);
      if (description && description.length > 2 && price > 0) {
        console.log(`[extractPriceInfoFromContent] 멀티라인 매칭: "${description}" → ${price}원`);
        priceInfoList.push({
          description,
          price
        });
      }
    }
  }
  // 단일라인 가격 패턴: "5키로한박스👉👉👉15,000원" 형식
  const inlinePricePattern = /([가-힣0-9키로박스팩개통병봉지세트][^\n👉]{2,}?)👉+([0-9,]+)원/g;
  let match;
  while((match = inlinePricePattern.exec(content)) !== null){
    let description = match[1].trim();
    const priceStr = match[2].replace(/,/g, "");
    const price = parseInt(priceStr);
    console.log(`[extractPriceInfoFromContent] 인라인 패턴 매칭: "${description}" → ${price}원`);
    if (price > 0 && !priceInfoList.some((item)=>item.price === price)) {
      priceInfoList.push({
        description,
        price
      });
    }
  }
  // 대체 패턴: "1박스 23,900원" 형식 (중복 제거)
  const altPricePattern = /([^\n]*?)\s*([0-9,]+)원/g;
  while((match = altPricePattern.exec(content)) !== null){
    let description = match[1].trim();
    const priceStr = match[2].replace(/,/g, "");
    const price = parseInt(priceStr);
    // 이미 추가된 가격이 아니고, 의미있는 description이 있는 경우만
    if (price > 0 && description.length > 2 && !description.match(/^[👉🍑🍎‼️\s]+$/) && !priceInfoList.some((item)=>item.price === price)) {
      console.log(`[extractPriceInfoFromContent] 대체 패턴 매칭: "${description}" → ${price}원`);
      priceInfoList.push({
        description,
        price
      });
    }
  }
  console.log(`[extractPriceInfoFromContent] 최종 결과: ${priceInfoList.length}개 옵션`);
  priceInfoList.forEach((opt, i)=>{
    console.log(`  ${i + 1}. "${opt.description}" → ${opt.price}원`);
  });
  return priceInfoList;
}
/**
 * 함수명: extractUnitFromComment
 * 목적: 댓글에서 단위 추출
 * 사용처: 주문 처리 로직
 * 의존성: 없음
 * 파라미터:
 *   - commentText: 댓글 텍스트
 * 리턴값: 추출된 단위 또는 null
 */
export function extractUnitFromComment(commentText: any) {
  const comment = commentText.toLowerCase();
  // 주요 단위들을 추출 (우선순위 순서대로)
  const units = [
    "팩",
    "컵",
    "통",
    "박스",
    "세트",
    "봉지",
    "개"
  ];
  for (const unit of units){
    if (comment.includes(unit)) {
      return unit;
    }
  }
  return null;
}

/**
 * 함수명: extractUnitFromDescription
 * 목적: 옵션 description에서 단위 추출
 * 사용처: 주문 처리 로직
 * 의존성: 없음
 * 파라미터:
 *   - description: 옵션 설명
 * 리턴값: 추출된 단위 또는 null
 */
export function extractUnitFromDescription(description: any) {
  const desc = description.toLowerCase();
  // 주요 단위들을 추출 (우선순위 순서대로)
  const units = [
    "팩",
    "컵",
    "통",
    "박스",
    "세트",
    "봉지",
    "개"
  ];
  for (const unit of units){
    if (desc.includes(unit)) {
      return unit;
    }
  }
  return null;
}

/**
 * 함수명: calculateOptionSimilarity
 * 목적: 댓글과 옵션 description의 텍스트 유사도 계산
 * 사용처: findMatchingPriceOption
 * 의존성: 없음
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - optionDescription: 옵션 설명
 * 리턴값: 유사도 정보 객체
 */
export function calculateOptionSimilarity(commentText: any, optionDescription: any) {
  // 개선된 토큰화: 단위와 숫자를 분리하여 처리
  function smartTokenize(text: any) {
    return text.toLowerCase().replace(/[^\w가-힣]/g, " ") // 숫자+단위 분리 (예: "2팩요" → "2", "팩", "요")
    .replace(/(\d+)([가-힣]+)/g, "$1 $2") // 한글+숫자 분리 (예: "흑수박1팩" → "흑수박", "1", "팩")
    .replace(/([가-힣]+)(\d+)/g, "$1 $2").split(/\s+/).filter((token: any)=>token.length > 0);
  }
  const commentTokens = smartTokenize(commentText);
  const optionTokens = smartTokenize(optionDescription);
  // 겹치는 토큰 개수 계산
  let matchCount = 0;
  const matchedTokens: any[] = [];
  for (const commentToken of commentTokens){
    for (const optionToken of optionTokens){
      if (commentToken === optionToken || commentToken.includes(optionToken) || optionToken.includes(commentToken)) {
        matchCount++;
        matchedTokens.push(`${commentToken}≈${optionToken}`);
        break; // 이미 매칭된 토큰은 중복 카운트하지 않음
      }
    }
  }
  return {
    matchCount,
    matchedTokens,
    commentTokens,
    optionTokens,
    similarity: matchCount / Math.max(commentTokens.length, 1)
  };
}

/**
 * 함수명: findMatchingPriceOption
 * 목적: 댓글 내용과 가격 옵션 description을 매칭 (텍스트 유사도 기반)
 * 사용처: 주문 처리 로직
 * 의존성: calculateOptionSimilarity
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - priceOptions: 가격 옵션 배열
 *   - orderQuantity: 주문 수량
 * 리턴값: 매칭된 옵션 또는 null
 */
export function findMatchingPriceOption(commentText: any, priceOptions: any, orderQuantity: any) {
  if (!Array.isArray(priceOptions) || priceOptions.length === 0) {
    return null;
  }
  // 각 옵션과 댓글의 유사도 계산
  const optionScores = priceOptions.map((option)=>{
    const similarity = calculateOptionSimilarity(commentText, option.description);
    return {
      option,
      similarity,
      score: similarity.matchCount
    };
  });
  // 가장 높은 점수의 옵션 선택 (매칭되는 토큰이 많은 옵션)
  const bestMatch = optionScores.reduce((best, current)=>{
    if (current.score > best.score) {
      return current;
    }
    // 점수가 같다면 더 높은 유사도 선택
    if (current.score === best.score && current.similarity.similarity > best.similarity.similarity) {
      return current;
    }
    return best;
  });
  // 매칭된 토큰이 전혀 없거나 유사도가 너무 낮으면 기본 옵션 선택
  if (bestMatch.score === 0 || bestMatch.similarity.similarity < 0.1) {
    // 수량 기반 기본 옵션 선택
    const quantityOption = priceOptions.find((opt)=>opt.quantity === orderQuantity);
    if (quantityOption) {
      return quantityOption;
    }
    // 가장 기본적인 옵션 선택 (보통 첫 번째 옵션)
    return priceOptions[0];
  }
  return bestMatch.option;
}
export function calculateOptimalPrice(orderQuantity: any, priceOptions: any, fallbackUnitPrice: any = 0, commentText: any = null, productMap: any = null) {
  // calculateOptimalPrice 호출 - 개별 로그 제거 (성능 최적화)
  if (typeof orderQuantity !== "number" || orderQuantity <= 0) return 0;
  // priceOptions 로깅 제거
  const validOpts = (Array.isArray(priceOptions) ? priceOptions : []).filter((o)=>{
    const isValid = typeof o.quantity === "number" && o.quantity > 0 && typeof o.price === "number" && o.price >= 0;
    // 옵션 검증 로그 제거
    return isValid;
  });
  // 유효한 옵션 수 로그 제거 (성능 최적화)
  if (validOpts.length === 0) {
    // 🔥 2025-01-27: priceOptions가 비어있으면 fallbackUnitPrice 직접 사용
    // OptimalPriceCalculator는 전체 productMap을 탐색하여 다른 상품의 가격을 선택할 수 있어 제거
    const result = Math.round(fallbackUnitPrice * orderQuantity);
    console.log(`[calculateOptimalPrice] 옵션 없음 - ${orderQuantity} × ${fallbackUnitPrice} = ${result}`);
    return result;
  }
  // 디버깅: 첫 번째 옵션 정보 출력
  if (validOpts.length > 0) {
    console.log(`[calculateOptimalPrice] 첫 번째 옵션: quantity=${validOpts[0].quantity}, price=${validOpts[0].price}, description="${validOpts[0].description}"`);
  }
  // 🔥 세트 상품 처리 로직 제거 - order_needs_ai 플래그가 있는 상품은 AI가 처리
  // 예: "백오이 3개 → 1,900원" 같은 경우 AI가 처리하므로 여기서는 단순 계산만 수행
  // 🔥 박스 단위 댓글 특별 처리 (사용자 요청: 박스는 가장 큰 단위로 처리)
  if (commentText && /(박스|박)/.test(commentText.toLowerCase())) {
    console.log(`[calculateOptimalPrice] 박스 단위 감지: "${commentText}"`);
    // 박스 관련 옵션 찾기 (description에 "박스" 포함된 옵션)
    const boxOptions = validOpts.filter((opt)=>opt.description && /(박스|박)/.test(opt.description));
    if (boxOptions.length > 0) {
      // 가장 큰 단위 박스 옵션 선택 (가격 기준)
      const largestBoxOption = boxOptions.reduce((largest, current)=>current.price > largest.price ? current : largest);
      console.log(`[calculateOptimalPrice] 박스 옵션 매칭: "${commentText}" → "${largestBoxOption.description}" (${largestBoxOption.price}원)`);
      // 박스 주문은 항상 해당 박스 전체 가격으로 처리
      return Math.round(largestBoxOption.price * orderQuantity);
    }
    // 박스 관련 옵션이 없다면 가장 큰 수량 옵션으로 매칭
    const largestOption = validOpts.reduce((largest, current)=>current.quantity > largest.quantity ? current : largest);
    console.log(`[calculateOptimalPrice] 박스 요청 → 가장 큰 단위 옵션 사용: "${largestOption.description}" (${largestOption.price}원)`);
    return Math.round(largestOption.price * orderQuantity);
  }
  // 댓글 내용과 옵션 description 매칭 (우선순위 3)
  if (commentText) {
    const matchedOption = findMatchingPriceOption(commentText, validOpts, orderQuantity);
    if (matchedOption) {
      // 매칭된 옵션의 가격은 이미 해당 수량에 대한 총 가격
      console.log(`[calculateOptimalPrice] 텍스트 매칭: "${commentText}" → 옵션 "${matchedOption.description}" (${matchedOption.quantity}개 = ${matchedOption.price}원)`);
      // 주문 수량과 옵션 수량이 다른 경우 단순 비례 계산
      if (matchedOption.quantity !== orderQuantity) {
        // 단위 가격 계산하여 비례 적용
        const unitPrice = matchedOption.price / matchedOption.quantity;
        const totalPrice = unitPrice * orderQuantity;
        console.log(`[calculateOptimalPrice] 비례 계산: ${orderQuantity}개 × ${unitPrice}원/개 = ${totalPrice}원`);
        return Math.round(totalPrice);
      }
      return Math.round(matchedOption.price);
    }
  }
  // 정확히 일치하는 수량 옵션 찾기 (우선순위 4)
  const exactMatch = validOpts.find((opt)=>opt.quantity === orderQuantity);
  if (exactMatch) {
    console.log(`[calculateOptimalPrice] 정확한 수량 매칭 찾음: ${orderQuantity}개 = ${exactMatch.price}원`);
    return Math.round(exactMatch.price);
  } else {
    console.log(`[calculateOptimalPrice] 정확한 수량 매칭 없음 (주문수량: ${orderQuantity})`);
    // 🔥 세트 옵션 특수 처리 제거 - order_needs_ai 상품은 AI가 처리
    // 예전에는 "백오이 3개 → 1,900원"을 세트로 판단했지만, 이제 AI가 처리함
    // 단일 수량 옵션만 있는 경우 간단한 곱셈 계산
    if (validOpts.length === 1 && validOpts[0].quantity === 1) {
      const unitPrice = validOpts[0].price;
      const totalPrice = unitPrice * orderQuantity;
      console.log(`[calculateOptimalPrice] 단일 단위 가격으로 계산: ${orderQuantity} × ${unitPrice} = ${totalPrice}원`);
      return Math.round(totalPrice);
    } else {
      console.log(`[calculateOptimalPrice] 단일 단위 조건 불충족: validOpts.length=${validOpts.length}, validOpts[0].quantity=${validOpts[0]?.quantity}`);
    }
  }
  // 최적 가격 조합 찾기 - 개선된 동적 계획법 (우선순위 5)
  console.log(`[calculateOptimalPrice] 동적 계획법 시작 - orderQuantity: ${orderQuantity}`);
  // 고객에게 가장 유리한 가격 조합 찾기
  // 예: 4팩 주문 시 1팩×4(11,600원)보다 2팩×2(10,000원)이 더 유리
  let bestPrice = Infinity;
  let bestCombination: string | null = null;
  // 방법 1: 단일 옵션으로만 구성 (같은 옵션을 여러 개)
  for (const option of validOpts){
    if (orderQuantity % option.quantity === 0) {
      // 이 옵션으로 정확히 나눠떨어지는 경우
      const count = orderQuantity / option.quantity;
      const totalPrice = option.price * count;
      console.log(`[calculateOptimalPrice] 단일 옵션 조합: ${option.quantity}개짜리 × ${count} = ${totalPrice}원`);
      if (totalPrice < bestPrice) {
        bestPrice = totalPrice;
        bestCombination = `${option.quantity}개 옵션 × ${count}`;
      }
    }
  }
  // 방법 2: 동적 계획법으로 모든 조합 탐색
  // dp[i] = i개를 구매하는 최소 비용
  const dp = new Array(orderQuantity + 1).fill(Infinity);
  const dpPath = new Array(orderQuantity + 1).fill(null); // 경로 추적용
  dp[0] = 0;
  // 각 수량까지의 최소 비용 계산
  for(let i = 1; i <= orderQuantity; i++){
    // 각 가격 옵션을 시도
    for (const option of validOpts){
      if (option.quantity <= i) {
        // 이 옵션을 사용하는 경우
        const remainingQuantity = i - option.quantity;
        if (dp[remainingQuantity] !== Infinity) {
          const costWithThisOption = dp[remainingQuantity] + option.price;
          if (costWithThisOption < dp[i]) {
            dp[i] = costWithThisOption;
            dpPath[i] = {
              option,
              remaining: remainingQuantity
            };
            console.log(`[calculateOptimalPrice] dp[${i}] 업데이트: ${option.quantity}개 옵션 사용 → ${costWithThisOption}원`);
          }
        }
      }
    }
    // fallback 단가로도 계산 (옵션이 없는 경우에만)
    if (validOpts.length === 0 && fallbackUnitPrice > 0 && i > 0) {
      const costWithFallback = dp[i - 1] + fallbackUnitPrice;
      if (costWithFallback < dp[i]) {
        dp[i] = costWithFallback;
        dpPath[i] = {
          fallback: true,
          remaining: i - 1
        };
        console.log(`[calculateOptimalPrice] dp[${i}] 업데이트: fallback 단가(${fallbackUnitPrice}원) 사용 → ${costWithFallback}원`);
      }
    }
  }
  // DP 결과와 비교
  if (dp[orderQuantity] < bestPrice && dp[orderQuantity] !== Infinity) {
    bestPrice = dp[orderQuantity];
    // 경로 역추적하여 조합 확인
    let currentQuantity = orderQuantity;
    const usedOptions = [];
    while(currentQuantity > 0 && dpPath[currentQuantity]){
      const path = dpPath[currentQuantity];
      if (path.fallback) {
        usedOptions.push('fallback');
        currentQuantity = path.remaining;
      } else {
        usedOptions.push(`${path.option.quantity}개`);
        currentQuantity = path.remaining;
      }
    }
    bestCombination = `DP 최적 조합: ${usedOptions.join(' + ')}`;
  }
  // 최종 결과
  if (bestPrice === Infinity) {
    // 최적 조합을 찾지 못한 경우 fallback 사용
    const result = Math.round(fallbackUnitPrice * orderQuantity);
    console.log(`[calculateOptimalPrice] 최적 조합 없음 - fallback 사용: ${result}원`);
    return result;
  }
  console.log(`[calculateOptimalPrice] 최적 가격 계산 완료: ${Math.round(bestPrice)}원 (${bestCombination})`);
  return Math.round(bestPrice);
}
