import { NextResponse } from 'next/server';

/**
 * AI를 사용하여 게시물 내용에서 상품 정보 추출 (Gemini API 사용)
 * @param {Request} request 
 * @returns {Promise<NextResponse>}
 */
export async function POST(request) {
  try {
    const { 
      content, 
      postTime = null, 
      postKey,
      aiModel = "gemini-2.5-flash-lite-preview-06-17"
    } = await request.json();

    const aiApiKey = process.env.GOOGLE_API_KEY;
    const aiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiApiKey}`;
    
    // 기본 상품 생성 함수
    function getDefaultProduct(errorMessage = "") {
      return [
        {
          title: "[AI 분석 필요] 상품정보 추출 실패",
          description: errorMessage || "상품 정보를 추출할 수 없습니다.",
          quantity_text: "1개",
          priceOptions: [],
        },
      ];
    }
    
    if (!aiApiKey || !aiEndpoint || !aiEndpoint.includes("?key=")) {
      console.warn(
        "[AI 분석] API 키 또는 엔드포인트가 올바르게 구성되지 않았습니다. 기본 상품을 반환합니다."
      );
      return NextResponse.json({ products: getDefaultProduct("AI API 설정 오류") });
    }
    
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      console.warn(
        "[AI 분석] 유효하지 않은 콘텐츠입니다. 기본 상품을 반환합니다."
      );
      return NextResponse.json({ products: getDefaultProduct("콘텐츠 없음") });
    }
    
    console.log("[AI 분석] 시작 - postKey:", postKey || "unknown");
    
    // kstPostTime 계산
    const kstPostTime = postTime
      ? new Date(postTime).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })
      : new Date().toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        });
    
    const systemInstructions = `
    당신은 텍스트에서 상품 정보를 추출하여 지정된 JSON 형식으로만 응답하는 AI입니다. 다른 텍스트는 절대 포함하지 마세요.
[핵심 추출 규칙]
가격 판별 (매우 중요):
오직 고객이 실제로 지불하는 '판매 가격'만 추출하세요. 원가, 정상가, 시중가 등은 모두 무시합니다.
할인 처리: 
  - 동일 단위에 가격이 여러 개 표시되면(예: 18,000원 -> 14,800원), 항상 마지막/가장 낮은 가격을 '판매 가격'으로 간주합니다.
  - 🔥 중요: 취소선 가격(👉이전 가격)과 현재 가격(👉👉👉현재가격)이 함께 표시된 경우, 각각을 별도 옵션으로 만들지 말고 현재 가격만 하나의 옵션으로 추출하세요.
  - 예시: "1팩 👉4,900원 👉👉👉3,500원" → priceOptions에는 {"price": 3500, "description": "1팩"} 하나만 포함
가격을 절대 나누지 마세요: '3팩 묶음', '2개입 세트' 처럼 여러 개가 포함된 묶음 상품의 가격이 명시된 경우, 그 가격은 묶음 전체에 대한 가격입니다. 절대로 낱개 가격으로 나누어 계산하지 마세요.
basePrice: 유효한 판매 가격 옵션 중 가장 기본 단위(보통 quantity: 1)의 가격입니다. 유효한 가격이 없으면 0으로 설정합니다.
title: 상품의 핵심 명칭만 간결하게 추출합니다. (수량/단위 정보는 반드시 제외)
  🔥🔥🔥 **날짜 접두사 중요:** 맨 앞에 반드시 **\`[M월D일]\` 형식**으로 상품 수령일의 월과 일만 포함하세요. 
  - **"내일" 언급 시**: 게시물 작성일(${kstPostTime}) + 1일
  - **시간만 명시된 경우(예: "4시도착", "2시수령")**: 게시물 작성일 당일
  - **"지금부터", "바로", "즉시" 언급**: 게시물 작성일 당일
  - **"오늘" 언급**: 게시물 작성일 당일
  - **구체적 날짜 명시**: 해당 날짜 사용
  🔥 **상품명:** 날짜 접두사 바로 뒤에 **자연스러운 상품명**을 공백 하나로 구분하여 붙입니다.
      - **띄어쓰기:** 원문 텍스트의 불필요한 띄어쓰기나 줄바꿈을 제거하고, 일반적인 상품명 표기법에 따라 자연스럽게 띄어씁니다. 고유명사나 복합명사는 적절히 붙여 씁니다. (예: "성주 꿀 참외" -> \`성주꿀참외\` 또는 \`성주 꿀참외\`, "블랙 라벨 오렌지" -> \`블랙라벨오렌지\`, "메주리알 장조림" -> \`메주리알장조림\` 또는 \`메주리알 장조림\`) AI가 가장 자연스럽다고 판단하는 형태로 정제하세요.
  🔥 **특수문자/괄호:** 상품명 자체에는 괄호 \`()\` 를 포함하지 마세요. 원산지 등 부가 정보도 포함하지 마세요. (예:마늘 (국내산) -> 마늘)
      
  - **최종 형식 예시:**
      - \`[5월2일] 성주꿀참외\`
      - \`[12월25일] 블랙라벨오렌지\`
      - \`[5월2일] 메주리알 장조림\`
      - \`[5월2일] 마늘 국내산\`
quantity 필드 (priceOptions 내):
고객이 주문하는 '판매 단위'의 개수만을 나타냅니다. 절대로 무게, 용량, 내용물 개수가 아닙니다!
✅ 올바른 예시:
"오렌지 1봉지(6알) 8,900원" → quantity: 1 (봉지 1개)
"오렌지 2봉지(12알) 16,900원" → quantity: 2 (봉지 2개)
"맛조개 400g" → quantity: 1 (상품 1개, 400g은 내용량일 뿐)
"사과 3kg" → quantity: 1 (상품 1개, 3kg은 내용량일 뿐)
❌ 잘못된 예시:
"맛조개 400g" → quantity: 400 (절대 안됨!)
"오렌지 1봉지(6알)" → quantity: 6 (절대 안됨!)
상품 구분 (multipleProducts):
true (여러 상품): 상품명이 명확히 다르거나(예: 배추김치, 총각김치), 종류가 다르거나, 번호/줄바꿈으로 구분된 경우.
false (단일 상품): 동일 상품의 용량/수량별 옵션만 있는 경우(예: 우유 500ml, 우유 1L).
🔥 **옵션형 상품 특별 처리**: 동일한 상품이지만 크기/수량이 다른 경우(예: 수박 1통/반통, 사과 1박스/2박스)는 **단일 상품(false)**으로 처리하고, 각 옵션을 priceOptions 배열에 포함합니다. 이때 quantityText는 공통 단위(통, 박스, 세트 등)로 설정합니다.
keywordMappings (매우 중요 - 핵심 규칙):
핵심 원칙: '1 키워드 = 1 상품'. 각 키워드는 반드시 하나의 상품만을 고유하게 지칭해야 합니다.
키워드 추출 절차 및 우선순위:
상품명 전체: 상품명 전체를 고유 키워드로 포함합니다. (예: 열무물김치)
고유 핵심 단어: 상품명을 구성하는 핵심 단어를 추출합니다. 이 단어가 전체 상품 목록 내에서 단 하나의 상품하고만 명확하게 연결된다면 키워드로 포함합니다. (예: '배추김치' -> 배추, '총각김치' -> 총각, '오이소박이김치' -> 오이소박이, '열무물김치' -> 물김치)
고유 축약어/동의어: 널리 알려진 동의어 또는 명백한 축약어를 키워드로 포함합니다. 이 키워드 또한 전체 상품 목록 내에서 단 하나의 상품만을 지칭해야 합니다. (예: 쪽파김치 -> 파김치)
🔥 복합 단위 키워드 (중요): 세트 상품의 경우 개별 수량 키워드도 추가합니다. 예: "1세트(5개)" 상품의 경우 → "5개", "10개", "15개" 등도 키워드로 추가하여 "10개요" 같은 주문도 인식 가능하게 합니다.
키워드 제외 원칙:
모호성/중복성 배제: 두 개 이상의 상품에 포함되어 어떤 상품을 지칭하는지 불분명한 단어는 키워드에서 제외합니다. (예: '열무'는 '열무김치'와 '열무물김치' 둘 다에 쓰여 제외)
일반 명사 배제: 상품의 카테고리를 나타내는 일반적인 단어는 제외합니다. (예: 김치, 쿠키)
비-식별 정보 배제: 수량, 단위, 상태 등을 나타내는 단어는 제외합니다. (예: 1kg, 2kg) 단, 세트 상품의 개별 수량은 예외
[JSON 필드 정의]
title: [M월D일] 상품명 형식. 날짜는 수령일 기준, 수령일이 없으면 게시일 기준.
priceOptions: [{ "quantity": 숫자, "price": 숫자, "description": "옵션설명" }] 배열.
🔥 최종 판매가만 포함: 원가/정가 등은 무시하고, 고객이 실제 지불하는 가장 낮은 최종 가격만 포함합니다.
🔥🔥 중복 description 금지: 동일한 description을 가진 옵션을 여러 개 만들지 마세요. 같은 단위/수량에 여러 가격이 표시된 경우 가장 낮은 가격만 하나의 옵션으로 만드세요.
description: 주문 단위를 명확히 설명하는 텍스트 (예: "1kg", "2kg", "1팩(500g)").
basePrice에 해당하는 옵션도 반드시 포함해야 합니다.
quantity (루트 레벨): 상품의 가장 기본적인 판매 단위 수량. 대부분의 경우 1입니다.
quantityText: 🔥🔥🔥 **[중요] priceOptions와 일관성 보장**: 반드시 priceOptions의 description에서 실제로 사용된 주요 단위와 일치하도록 설정하세요.
**설정 순서:**
1. **priceOptions 기준 우선**: priceOptions의 description에서 가장 많이 등장하는 단위를 우선 채택
   - 예: "1팩(6개)", "2팩(12개)" → quantityText: "팩"
   - 예: "1박스", "2박스" → quantityText: "박스"  
   - 예: "1통", "반통" → quantityText: "통"
   - 🔥 복합 단위 주의: "3알(1세트)" 같은 경우 주문 단위로 더 자주 사용되는 "세트"를 quantityText로 설정
2. **일관성 검증**: quantityText와 priceOptions의 단위가 반드시 일치해야 함
3. **보편적 대안**: priceOptions에 명확한 단위가 없을 때만 "개"를 사용

**예시:**
- ✅ priceOptions: [{"description": "1팩(5장)"}] → quantityText: "팩" 
- ✅ priceOptions: [{"description": "1박스"}] → quantityText: "박스"
- ❌ priceOptions: [{"description": "1팩(5장)"}] → quantityText: "개" (절대 안됨!)

이렇게 설정해야 패턴 매칭에서 "1팩이요", "2팩이요" 같은 댓글을 올바르게 인식할 수 있습니다.
stockQuantity: 명확한 재고 수량만 숫자로 추출. 불명확하면 null.
pickupInfo: 픽업 관련 원본 텍스트를 그대로 포함합니다.
keywordMappings: {"키워드": { "productIndex": 숫자 }} 형식. 위에서 정의된 '키워드 추출' 규칙에 따라 생성된 키워드와 상품 인덱스(1부터 시작)의 매핑입니다. 이 필드는 필수입니다.
🔥 **옵션 키워드 포함**: 옵션형 상품의 경우 옵션별 키워드도 포함합니다(예: "1통", "반통", "한통", "1박스", "2박스", "한박스", "1세트", "2세트" 등).
order_needs_ai: 🔥🔥🔥 **[중요] 주문 처리 시 AI 필요 여부 판단**
이 필드는 고객이 댓글로 주문할 때 AI 분석이 필요한 복잡한 상품인지를 나타냅니다.
**판단 기준 (다음 중 하나라도 해당하면 true):**
1. **🔥 기본 판매 단위가 1이 아닌 상품 (최우선 체크)**: priceOptions의 첫 번째 옵션의 quantity가 1보다 큰 경우
   - 핵심: 기본 판매 단위가 2개, 3개, 5개 등 복수인 경우
   - 예: "2팩 → 1,500원" → quantity: 2 → order_needs_ai: true
   - 예: "3개 → 1,900원" → quantity: 3 → order_needs_ai: true
   - 예: "5개입 → 5,000원" → quantity: 5 → order_needs_ai: true
   - 중요: 단위 변환 복잡성 발생 (2팩 = 1세트, 4팩 = 2세트 등)
2. **세트/묶음 단위 상품 (기본 단위가 1이 아니거나 내용물 개수가 명시된 경우)**:
   - 예: "2팩 3,000원" → order_needs_ai: true (기본 단위가 2)
   - 예: "1세트(5개) 3,500원" → order_needs_ai: true (내용물 개수 명시)
   - 예: "1팩 1,000원" → order_needs_ai: false (단순 1팩)
   - 예: "1박스 10,000원" → order_needs_ai: false (단순 1박스)
   - 중요: 기본 단위가 1이고 내용물 개수가 없으면 단순 상품
3. **무게/용량 단위 + 다중 옵션**: 2개 이상의 가격 옵션이 있으면서 kg, 키로, g, 그램, L, 리터 단위 사용
   - 예: "1.5키로 9,900원", "5키로 한박스 27,900원" 옵션이 있는 경우
   - 중요: "5"가 5키로인지 5개인지 판단 필요
4. **복합 단위 표현**: description에 "N개 = 1세트" 형태나 복합 표현이 있는 경우
   - 예: "5키로 한박스" → order_needs_ai: true
   - 중요: 단위 변환과 최적 가격 계산 필요

**판단 알고리즘:**

const reasons = [];

// 1. 기본 판매 단위가 1이 아닌 경우 (최우선)
if (priceOptions[0].quantity > 1) {
  reasons.push('기본 판매 단위가 ' + priceOptions[0].quantity + '개로 단위 변환 복잡성 존재');
}

// 2. 세트/묶음 단위 상품 (단, 기본 단위가 1이 아닌 경우만)
if (quantityText && ['세트', '묶음', '박스', '팩', '통'].includes(quantityText) && priceOptions[0].quantity === 1) {
  // 기본 단위가 1인 세트/묶음 상품은 복잡하지 않음 (예: 1팩, 1세트, 1박스)
  // 하지만 "1팩(5개)" 같이 내용물 개수가 명시된 경우는 복잡할 수 있음
  if (priceOptions[0].description.match(/(\d+)[개알장]/)) {
    const match = priceOptions[0].description.match(/(\d+)[개알장]/);
    reasons.push(quantityText + ' 단위 상품 (' + match[0] + ')');
  }
  // 단순히 "1팩", "1세트" 같은 경우는 복잡하지 않으므로 이유 추가하지 않음
}

// 3. 무게/용량 단위 + 다중 옵션
if (priceOptions.length > 1 && priceOptions.some(opt => opt.description.match(/\d+[kgglml키로그램리터]/i))) {
  reasons.push('무게/용량 단위 다중 옵션으로 최적 가격 계산 복잡');
}

// 4. 복합 단위 표현
if (priceOptions[0].description.match(/\d+[kgglml키로그램리터].*[한박스통]/i) || 
    priceOptions[0].description.match(/\d+개.*=.*1세트/i)) {
  reasons.push('복합 단위 표현으로 단위 변환 필요');
}

// 다중 가격 옵션이 있지만 위 조건에 해당하지 않는 단순한 경우는 제외
// 예: "1개 1000원", "2개 1900원" 같은 단순 수량 옵션은 order_needs_ai = false

order_needs_ai = reasons.length > 0;
order_needs_ai_reason = reasons.length > 0 ? reasons.join('; ') : null;

🔥🔥🔥 **중요**: 위의 알고리즘을 사용하여 각 상품에 대해 order_needs_ai와 order_needs_ai_reason을 반드시 계산하고 설정하세요.
- order_needs_ai가 true면 order_needs_ai_reason에 구체적인 이유를 설정
- order_needs_ai가 false면 order_needs_ai_reason은 null

**예시:**
- "순두부 2팩 1,500원" → priceOptions: [{quantity: 2, price: 1500, description: "2팩"}] → order_needs_ai: true, order_needs_ai_reason: "기본 판매 단위가 2개로 단위 변환 복잡성 존재"
- "사과 1개 500원" → priceOptions: [{quantity: 1, price: 500, description: "1개"}] → order_needs_ai: false, order_needs_ai_reason: null
- "백오이 3개 1,900원" → priceOptions: [{quantity: 3, price: 1900, description: "3개"}] → order_needs_ai: true, order_needs_ai_reason: "기본 판매 단위가 3개로 단위 변환 복잡성 존재"
- "흑미찰옥수수 1세트(5개) 3,500원" → order_needs_ai: true, order_needs_ai_reason: "세트 단위 상품 (5개)"
- "사과 1개 500원, 2개 900원" → order_needs_ai: false (단순 수량 옵션이므로)
- "김치 1팩 5,000원" → order_needs_ai: false (기본 단위가 1이고 내용물 개수 없음)
- "김치 2팩 9,000원" → order_needs_ai: true, order_needs_ai_reason: "기본 판매 단위가 2개로 단위 변환 복잡성 존재"
order_needs_ai_reason: 🔥🔥🔥 **[중요] AI 필요 판단 이유**
order_needs_ai가 true인 경우, 구체적인 이유를 설명하는 텍스트입니다. order_needs_ai가 false면 null입니다.
**이유 설명 예시:**
- "기본 판매 단위가 2개로 단위 변환 복잡성 존재" (quantity > 1인 경우)
- "세트 단위 상품 (5개)" (세트/묶음 상품인 경우)
- "팩 단위 상품으로 개수 해석 모호" (단위가 모호한 경우)
- "무게/용량 단위 다중 옵션으로 최적 가격 계산 복잡" (kg 단위 + 다중 옵션)
- "복합 단위 표현으로 단위 변환 필요" (5키로 한박스 등)
- "기본 판매 단위가 3개로 단위 변환 복잡성 존재; 세트 단위 상품 (5개)" (여러 이유)
[JSON 출력 형식]
여러 상품일 경우:
{
  "multipleProducts": true,
  "products": [
    {
      "itemNumber": 1,
      "title": "[7월5일] 상품명1",
      "basePrice": 10000,
      "priceOptions": [
        { "quantity": 1, "price": 10000, "description": "옵션 설명 1" }
      ],
      "quantityText": "개",
      "quantity": 1,
      "category": "식품",
      "status": "판매중",
      "tags": [],
      "features": [],
      "pickupInfo": "픽업 안내",
      "pickupType": "픽업",
      "stockQuantity": null,
      "postTime": "${kstPostTime}",
      "order_needs_ai": false,
      "order_needs_ai_reason": null
    }
  ],
  "keywordMappings": {
    "배추김치": { "productIndex": 1 },
    "배추": { "productIndex": 1 },
    "총각김치": { "productIndex": 2 },
    "총각": { "productIndex": 2 }
  }
}

단일 상품일 경우:
{
  "multipleProducts": false,
  "itemNumber": 1,
  "title": "[7월5일] 상품명1",
  "basePrice": 8900,
  "priceOptions": [
    { "quantity": 1, "price": 8900, "description": "1봉지(6알)" },
    { "quantity": 2, "price": 16900, "description": "2봉지(12알)" }
  ],
  "quantityText": "봉지",
  "quantity": 1,
  "category": "식품",
  "status": "판매중",
  "tags": [],
  "features": [],
  "pickupInfo": "픽업 안내",
  "pickupType": "수령",
  "stockQuantity": null,
  "keywordMappings": {
    "블랙라벨오렌지": { "productIndex": 1 },
    "블랙라벨": { "productIndex": 1 },
    "오렌지": { "productIndex": 1 }
  },
  "postTime": "${kstPostTime}",
  "order_needs_ai": true,
  "order_needs_ai_reason": "2가지 가격 옵션 존재"
}

[가격 처리 예시]
텍스트: "찰순대 500g\n👉👉👉4,900원\n👉👉👉3,500원"
❌ 잘못된 추출:
priceOptions: [
  { "quantity": 1, "price": 4900, "description": "1팩(500g)" },
  { "quantity": 1, "price": 3500, "description": "1팩(500g)" }
]
✅ 올바른 추출:
priceOptions: [
  { "quantity": 1, "price": 3500, "description": "1팩(500g)" }
]

텍스트: "3키로 1박스\n20,000원 -> 15,900원"
✅ 올바른 추출:
priceOptions: [
  { "quantity": 1, "price": 15900, "description": "3키로 1박스" }
]`;

    const prompt = `
다음 텍스트에서 상품 정보를 위 규칙과 형식에 맞춰 JSON으로 추출해주세요:

${content}`;

    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: systemInstructions,
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };
    
    // AI API 호출 (재시도 로직 포함)
    let response;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        response = await fetch(aiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000), // 30초 타임아웃
        });
        
        if (!response.ok) {
          if (response.status === 500 && retryCount < maxRetries) {
            console.warn(`[AI 분석] 500 에러, 재시도 ${retryCount + 1}/${maxRetries}`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 지수 백오프
            continue;
          }
          throw new Error(
            `AI API HTTP error: ${response.status} ${response.statusText}`
          );
        }
        
        break; // 성공 시 루프 종료
      } catch (error) {
        if (retryCount < maxRetries && (error.name === 'AbortError' || error.message.includes('500'))) {
          console.warn(`[AI 분석] 요청 실패, 재시도 ${retryCount + 1}/${maxRetries}:`, error.message);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
        throw error;
      }
    }
    
    const aiResponse = await response.json();
    
    // AI 응답 파싱
    const candidates = aiResponse.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("AI response has no candidates");
    }
    
    const content_parts = candidates[0].content;
    if (
      !content_parts ||
      !content_parts.parts ||
      content_parts.parts.length === 0
    ) {
      throw new Error("AI response content is empty");
    }
    
    const textContent = content_parts.parts[0].text;
    if (!textContent) {
      throw new Error("AI response text is missing");
    }
    
    console.log(
      "[AI 분석] AI 응답 받음:",
      textContent.substring(0, 200) + "..."
    );
    
    // JSON 추출 시도 (에러 처리 강화)
    let parsedResult;
    try {
      const jsonMatch = textContent.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        // JSON 블록 내의 불완전한 문자열 처리
        let jsonStr = jsonMatch[1];
        // 마지막 쉼표 제거
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        parsedResult = JSON.parse(jsonStr);
      } else {
        // 직접 JSON 파싱 시도
        parsedResult = JSON.parse(textContent);
      }
    } catch (parseError) {
      console.error("[AI 분석] JSON 파싱 실패:", parseError.message);
      console.error("[AI 분석] 파싱 시도한 텍스트 (첫 500자):", textContent.substring(0, 500));
      
      // 빈 객체나 불완전한 응답 처리
      if (textContent.trim() === '{}' || textContent.trim() === '') {
        return NextResponse.json({ products: getDefaultProduct("AI가 빈 응답 반환") });
      }
      
      return NextResponse.json({ products: getDefaultProduct(`JSON 파싱 오류: ${parseError.message}`) });
    }
    
    // 파싱된 결과 로그
    console.log(
      "[AI 분석] 파싱된 결과:",
      JSON.stringify(parsedResult).substring(0, 300) + "..."
    );
    
    // 응답 검증 및 정리
    if (!parsedResult) {
      console.error("[AI 분석] 예상하지 못한 형식의 AI 응답:", parsedResult);
      return NextResponse.json({ products: getDefaultProduct("잘못된 AI 응답 형식") });
    }
    
    // 새로운 형식 처리: multipleProducts 체크
    if (parsedResult.multipleProducts === true) {
      // 여러 상품인 경우
      if (
        !Array.isArray(parsedResult.products) ||
        parsedResult.products.length === 0
      ) {
        console.warn(
          "[AI 분석] AI가 상품을 추출하지 못했습니다. 빈 배열 반환.",
          parsedResult
        );
        return NextResponse.json({ products: [], keywordMappings: parsedResult.keywordMappings || {} });
      }
      
      const validProducts = parsedResult.products
        .filter((product) => {
          // 필수 필드 체크
          if (
            !product.title ||
            typeof product.title !== "string" ||
            product.title.trim().length === 0
          ) {
            console.warn("[AI 분석] 상품 제목이 없습니다:", product);
            return false;
          }
          return true;
        })
        .map((product, index) => {
          // 새로운 형식의 상품 정리
          // 제목에서 괄호와 그 내용을 제거
          const cleanTitle = product.title.trim().replace(/\s*\([^)]*\)/g, "");
          return {
            ...product,
            itemNumber: product.itemNumber || index + 1,
            title: cleanTitle,
            keywords: Object.keys(parsedResult.keywordMappings || {}).filter(
              (key) =>
                parsedResult.keywordMappings[key].productIndex === index + 1
            ),
          };
        });
      
      console.log(
        `[AI 분석] ${validProducts.length}개 상품 추출 완료:`,
        validProducts.map((p) => p.title)
      );
      
      return NextResponse.json({ 
        products: validProducts,
        keywordMappings: parsedResult.keywordMappings || {}
      });
      
    } else if (parsedResult.multipleProducts === false) {
      // 단일 상품인 경우
      if (
        !parsedResult.title ||
        typeof parsedResult.title !== "string" ||
        parsedResult.title.trim().length === 0
      ) {
        console.warn("[AI 분석] 상품 제목이 없습니다:", parsedResult);
        return NextResponse.json({ products: getDefaultProduct("상품 제목 없음") });
      }
      
      // 제목에서 괄호와 그 내용을 제거
      const cleanTitle = parsedResult.title.trim().replace(/\s*\([^)]*\)/g, "");
      
      // 단일 상품을 배열로 반환
      const singleProduct = {
        ...parsedResult,
        itemNumber: parsedResult.itemNumber || 1,
        title: cleanTitle,
        keywords: Object.keys(parsedResult.keywordMappings || {}),
        order_needs_ai: parsedResult.order_needs_ai || false,
        order_needs_ai_reason: parsedResult.order_needs_ai_reason || null,
      };
      
      console.log(`[AI 분석] 단일 상품 추출 완료:`, singleProduct.title);
      console.log(
        `[AI 분석] order_needs_ai: ${singleProduct.order_needs_ai}, reason: ${singleProduct.order_needs_ai_reason}`
      );
      
      return NextResponse.json({ 
        products: [singleProduct],
        keywordMappings: parsedResult.keywordMappings || {}
      });
      
    } else {
      // 이전 형식 지원 (하위 호환성)
      if (!parsedResult.products) {
        console.error("[AI 분석] 예상하지 못한 형식의 AI 응답:", parsedResult);
        return NextResponse.json({ products: getDefaultProduct("잘못된 AI 응답 형식") });
      }
      
      // 상품이 없거나 빈 배열인 경우
      if (
        !Array.isArray(parsedResult.products) ||
        parsedResult.products.length === 0
      ) {
        console.warn(
          "[AI 분석] AI가 상품을 추출하지 못했습니다. 빈 배열 반환.",
          parsedResult
        );
        return NextResponse.json({ products: [] });
      }
      
      // 각 상품 검증 및 정리
      const validProducts = parsedResult.products
        .filter((product) => {
          // 필수 필드 체크
          if (
            !product.title ||
            typeof product.title !== "string" ||
            product.title.trim().length === 0
          ) {
            console.warn("[AI 분석] 상품 제목이 없습니다:", product);
            return false;
          }
          return true;
        })
        .map((product, index) => {
          // 제목에서 괄호와 그 내용을 제거
          const cleanTitle = product.title.trim().replace(/\s*\([^)]*\)/g, "");
          
          // 기본값 설정
          const cleanProduct = {
            itemNumber: product.itemNumber || index + 1,
            title: cleanTitle,
            description: product.description || "",
            quantity_text:
              product.quantity_text || product.quantityText || "1개",
            keywords: Array.isArray(product.keywords) ? product.keywords : [],
            priceOptions: [],
            pickupInfo: product.pickupInfo || null,
            pickupDate: product.pickupDate || null,
            pickupType: product.pickupType || null,
            productId: product.productId,
            basePrice: product.basePrice,
            quantityText: product.quantityText,
            quantity: product.quantity,
            category: product.category,
            status: product.status,
            tags: product.tags,
            features: product.features,
            stockQuantity: product.stockQuantity,
            postTime: product.postTime,
          };
          
          // 가격 옵션 정리
          if (
            Array.isArray(product.priceOptions) &&
            product.priceOptions.length > 0
          ) {
            cleanProduct.priceOptions = product.priceOptions
              .filter((opt) => opt && typeof opt.price === "number")
              .map((opt) => ({
                description: opt.description || cleanProduct.quantity_text,
                price: opt.price,
                unit: opt.unit || "원",
                quantity: opt.quantity || 1,
              }));
          }
          
          // 가격 옵션이 없는 경우 기본값 설정
          if (cleanProduct.priceOptions.length === 0) {
            cleanProduct.priceOptions = [
              {
                description: cleanProduct.quantity_text,
                price: 0,
                unit: "원",
                quantity: 1,
              },
            ];
          }
          
          return cleanProduct;
        });
      
      if (validProducts.length === 0) {
        console.warn(
          "[AI 분석] 처리 완료되었지만 유효한 상품이 추출되지 않았습니다. null을 반환합니다."
        );
        return NextResponse.json({ products: [] });
      }
      
      console.log(
        `[AI 분석] ${validProducts.length}개 상품 추출 완료:`,
        validProducts.map((p) => p.title)
      );
      
      return NextResponse.json({ products: validProducts });
    }
    
  } catch (error) {
    console.error("[AI 분석] AI 처리 중 오류 발생:", error.message);
    console.error("[AI 분석] 오류 상세:", error);
    
    // 기본 상품 반환
    return NextResponse.json({ 
      error: error.message,
      products: [{
        title: "주문 양식 확인 필요",
        description: `AI 분석 오류: ${error.message}`,
        quantity_text: "1개",
        priceOptions: [],
      }]
    }, { status: 500 });
  }
}