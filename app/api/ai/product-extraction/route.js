import { NextResponse } from 'next/server';
import {
  fetchWithGoogleApiKeyFallback,
  getGoogleApiKeyPool,
} from "../../../lib/server/googleApiKeyFallback";

const DEFAULT_AI_MODEL = "gemini-2.5-flash-lite";
const ALLOWED_AI_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-06-17",
]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CONTENT_CHARS = 20000;
const MAX_POST_KEY_CHARS = 200;
const MAX_PRODUCT_TITLE_CHARS = 56;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

const sanitizeProductTitle = (rawTitle) => {
  if (typeof rawTitle !== "string") return "";

  const normalized = rawTitle
    .trim()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (normalized.length <= MAX_PRODUCT_TITLE_CHARS) return normalized;

  const clipped = normalized
    .slice(0, MAX_PRODUCT_TITLE_CHARS)
    .replace(/[+,\-\/\s]+$/g, "")
    .trim();

  return `${clipped || normalized.slice(0, MAX_PRODUCT_TITLE_CHARS).trim()}...`;
};

const getRateLimitStore = () => {
  if (!globalThis.__aiProductExtractionRateLimitStore) {
    globalThis.__aiProductExtractionRateLimitStore = new Map();
  }
  return globalThis.__aiProductExtractionRateLimitStore;
};

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
};

const checkRateLimit = (key) => {
  const store = getRateLimitStore();
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
};

const parseJsonBodyWithLimit = async (request) => {
  const raw = await request.text();
  const bytes = Buffer.byteLength(raw || "", "utf8");
  if (bytes > MAX_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `요청 본문이 너무 큽니다. 최대 ${MAX_BODY_BYTES} bytes`,
    };
  }

  try {
    return { ok: true, body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, status: 400, message: "유효하지 않은 JSON 본문입니다." };
  }
};

/**
 * AI를 사용하여 게시물 내용에서 상품 정보 추출 (Gemini API 사용)
 * @param {Request} request 
 * @returns {Promise<NextResponse>}
 */
export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const actorUserId = (request.headers.get("x-user-id") || "").trim() || "anonymous";
    const rl = checkRateLimit(`ai-product-extraction:${actorUserId}:${clientIp}`);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          products: [],
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const parsedBody = await parseJsonBodyWithLimit(request);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { products: [], message: parsedBody.message },
        { status: parsedBody.status }
      );
    }

    const { 
      content, 
      postTime = null, 
      postKey,
      aiModel = DEFAULT_AI_MODEL
    } = parsedBody.body || {};

    const googleApiKeyPool = getGoogleApiKeyPool();
    
    // 기본 상품 생성 함수 - 빈 배열 반환으로 잘못된 데이터 생성 방지
    function getDefaultProduct(errorMessage = "") {
      console.warn(`[AI API] getDefaultProduct 호출됨 - 이유: ${errorMessage}`);
      console.warn(`[AI API] 잘못된 더미 데이터 생성을 방지하기 위해 빈 배열을 반환합니다.`);
      return [];
    }

    if (typeof aiModel !== "string" || !ALLOWED_AI_MODELS.has(aiModel)) {
      return NextResponse.json(
        {
          products: getDefaultProduct("허용되지 않은 aiModel"),
          message: `허용되지 않은 모델입니다: ${aiModel}`,
        },
        { status: 400 }
      );
    }

    if (postKey && (typeof postKey !== "string" || postKey.length > MAX_POST_KEY_CHARS)) {
      return NextResponse.json(
        {
          products: getDefaultProduct("postKey 형식 오류"),
          message: `postKey는 최대 ${MAX_POST_KEY_CHARS}자 문자열이어야 합니다.`,
        },
        { status: 400 }
      );
    }

    if (googleApiKeyPool.length === 0) {
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

    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        {
          products: getDefaultProduct("콘텐츠 길이 초과"),
          message: `content가 너무 큽니다. 최대 ${MAX_CONTENT_CHARS}자`,
        },
        { status: 413 }
      );
    }

    console.log("[AI 분석] 시작 - postKey:", postKey || "unknown");
    
    // postTime 검증 및 요일 정보 포함 변수 생성
    let postTimeWithWeekday = postTime; // 기본값
    if (postTime) {
      console.log(`[AI 분석] 받은 postTime 원본값:`, postTime);
      // postTime 타입별 처리로 유효성 검증
      let postDate;
      if (typeof postTime === 'string') {
        postDate = new Date(postTime);
      } else if (typeof postTime === 'number') {
        postDate = new Date(postTime);
      } else if (postTime instanceof Date) {
        postDate = postTime;
      } else {
        console.warn(`[AI 분석] 알 수 없는 postTime 형식:`, postTime);
        postDate = new Date();
      }
      console.log(`[AI 분석] Date 유효성:`, !isNaN(postDate.getTime()));
      if (isNaN(postDate.getTime())) {
        console.warn(`[AI 분석] Date 파싱 실패, 현재 시간 사용`);
        postDate = new Date();
      }
      // 요일 정보 포함한 새로운 변수 생성
      const dayNames = [
        '일요일',
        '월요일',
        '화요일',
        '수요일',
        '목요일',
        '금요일',
        '토요일'
      ];
      const dayOfWeek = dayNames[postDate.getUTCDay()];
      postTimeWithWeekday = `${postDate.toISOString()} (${dayOfWeek})`;
    }

    const systemInstructions = `# 상품 정보 추출 AI 프롬프트

## 1. 시스템 역할
텍스트에서 상품 정보를 추출하여 지정된 JSON 형식으로만 응답합니다. 다른 텍스트는 포함하지 않습니다.
가격이 명시된 판매 단위를 상품 후보로 추출하되, 최종 출력은 **중복 제거 후 고유 상품만** 포함합니다.
동일한 상품/가격/단위가 본문에 여러 번 반복되어도(단, 번호 구분 제외) 최종 products에는 1번만 포함합니다.

## 2. 최우선 규칙 (다른 모든 규칙보다 우선)

### 2.1 번호 구분 절대 우선 규칙
**번호로 구분된 상품은 가격이나 단위가 같아도 모두 별개 상품으로 추출합니다.**
- 1️⃣플레인맛 5,900원, 2️⃣딸기맛 5,900원 → 2개 상품 (가격 같아도)
- ①사과 1박스, ②배 1박스 → 2개 상품 (단위 같아도)
- 1. 상품A, 2. 상품B, 3. 상품C → 3개 상품
- 번호가 있으면 중복 판단 규칙을 적용하지 않습니다.

### 2.2 반박스는 독립 상품 규칙
**"1박스"와 "반박스"는 항상 서로 다른 별개의 상품입니다.**
- "1박스 22,000원, 반박스 11,500원" → 2개 상품
- "한박스"와 "반박스" → 2개 상품
- 반박스는 박스의 절반 수량을 의미하는 독립적인 판매 단위

### 2.3 소스별도/소스 추가는 독립 상품 규칙 (중요)
**본문에 "소스별도", "소스 별도", "소스 추가", "소스 별매" 등의 문구와 함께 가격이 있으면, 소스는 반드시 별도의 상품으로 추출합니다.**
- 소스는 메인 상품과 다른 SKU로 간주합니다.
- 소스 가격이 명시되어 있으면 그 가격으로 상품을 생성합니다. (예: "소스별도(700원 판매합니다)" → 소스 700원)
- 괄호 안 가격이어도 유효합니다. 이 규칙은 아래 "괄호 안 가격 제외" 규칙의 예외입니다.
- 메인 상품(예: 함박스테이크)과 소스가 함께 존재하면 'multipleProducts'는 반드시 true 입니다.
- 이 경우 결과의 'variantType'은 "MIXED_PRODUCTS"로 설정하고, 각 상품의 variantType도 "MIXED_PRODUCTS"로 설정합니다.
- 소스의 title은 "소스"로 단순화하되, 특정 소스명이 명시된 경우(예: 데미글라스 소스) 해당 명칭을 title에 사용합니다.
- 메인 상품의 할인 전 가격(예: 5,500원)은 무시하고, 할인된 판매가(예: 3,900원)만 가격으로 사용합니다. 소스 가격은 소스 라인에 표시된 가격만 사용합니다.

예시)
입력 요약: "고관함박스테이크(1팩177g) 5,500원 → 3,900원", "소스별도(700원 판매합니다)"
→ 출력: multipleProducts=true, variantType="MIXED_PRODUCTS"
  - 상품1: title="고관함박스테이크 1팩 177g", price=3900
  - 상품2: title="소스", price=700

### 2.4 반복/복붙 중복 금지 규칙 (매우 중요)
**번호로 구분되지 않은 경우**, 본문에 동일한 상품/가격/단위가 여러 번 반복되어도 최종 products에는 반드시 1번만 포함합니다.
- 반복 홍보 문구, 이모지 강조, 설명 문장 사이에 끼어 있는 동일 가격/단위 재언급은 "추가 상품"이 아닙니다.
- 동일 상품 판단 키(필수): "normalizedTitle + normalizedQuantityText + finalPrice"
  - normalizedTitle: 날짜/이모지/프로모션 문구/반복 감탄사 제거 후 공백 정리 (단, 크기/등급/용량/포장 단위 정보는 보존)
  - normalizedQuantityText: 의미가 같으면 통일 (예: "1키로"="1kg", "한박스"="1박스")
  - finalPrice: 화살표/할인 표기(→, -->>, 👉 등)가 있으면 항상 **할인된 최종가 1개만** 사용
- 중복이 발견되면: 더 구체적인 정보(크기/등급/용량/포장 단위)가 포함된 title을 우선으로 남기고 나머지는 제거합니다.
- 최종 검증: 최종 products 배열에서 동일 키가 2번 이상이면 실패로 간주하고, 중복 제거 후 다시 출력합니다. (단, 번호 구분 상품은 2.1이 우선)

### 2.5 상품명 최소 식별 규칙 (최우선, 중요)
**title은 "상품을 서로 구분할 수 있을 정도"의 최소 정보만 남깁니다.**
- 불필요한 수식어(고당도, 산지/지역 반복, 브랜드성 미사여구, 홍보 문구)는 제거합니다.
- 판매 단위(예: 1팩, 2팩, 반박스, 한박스, 1세트, 2묶음)는 **단일 상품이든 다중 상품이든 항상 title에 유지**합니다.
- 무게/용량(g, kg, ml, L)은 **상품 구분에 꼭 필요할 때만** title에 포함합니다.
- 이미 다른 단서(예: 1팩/2팩, 반박스/한박스)로 충분히 구분되면, 무게/용량은 title에서 제거합니다.
- 즉, 고객이 "어떤 상품을 몇 단위 가져가는지"는 title만 보고 바로 알 수 있어야 합니다.

예시)
- 단일 상품: "크래미 1팩 200g" -> title: "크래미 1팩"
- 다중 상품: "크래미 1팩 200g", "크래미 2팩 400g" -> title: "크래미 1팩", "크래미 2팩"
- 다중 상품: "조생감귤 반박스", "조생감귤 한박스" -> title: "조생감귤 반박스", "조생감귤 한박스"
- 그람수로만 구분되는 경우: "한우 등심 300g", "한우 등심 600g" -> title: "한우 등심 300g", "한우 등심 600g"
- 잘못된 예: "고당도 서귀포 중문 달코미 조생감귤 2S 사이즈 한박스"
- 올바른 예: "조생감귤 한박스"

## 3. 핵심 원칙

### 2.1 할인 가격 처리
할인 표시는 하나의 상품입니다. 2개로 나누지 않습니다.
- "7,000원 → 4,900원" = 1개 상품 (4,900원)
- "👉👉👉7,000원 👉👉👉4,900원" = 1개 상품 (4,900원)
- "6.000원👉👉4,500원" = 1개 상품 (4,500원)
- "1통-->> 6.000원👉👉4,500원" = 1개 상품 (4,500원)
- "사전예약가 : 14,800원(18,000원)" = 1개 상품 (14,800원)
- "예약가 : 5,980원(8,500원)" = 1개 상품 (5,980원)
- 같은 상품명/단위에 여러 가격 = 가장 낮은 가격만
- 연속된 가격 표시는 할인으로 간주 (공백/이모티콘 무관)

#### 동일 용량/수량의 다른 가격 표시 = 할인 관계
**단위+괄호와 단순 표시가 같은 용량이면 할인 관계로 처리**
- "1봉지(150g) 10,000원" + "150g 8,500원" = 1개 상품 (8,500원)
- "1박스(10개) 15,000원" + "10개 12,000원" = 1개 상품 (12,000원)
- 괄호 안 용량과 독립 용량이 같으면 = 같은 상품의 할인

### 3.2 중복 방지 규칙 (번호 구분이 없는 경우에만 적용)
동일한 상품을 중복으로 추출하지 않습니다.

#### 중복 판단 기준 (번호 구분이 없을 때만)
- 같은 상품명 + 같은 가격 = 중복 (한 번만 추출)
- 같은 상품명 + 같은 단위 = 중복 (한 번만 추출)
- ⚠️ 중요: 번호로 구분된 상품은 이 규칙을 적용하지 않음
- 단위 표현이 다르더라도 의미가 같으면 중복
  - "1키로" = "1kg" = "1KG" = "1kg한세트" = "1kg 1단"
  - "1박스" = "한박스" = "1box"
  
#### 최종 출력 강제 규칙 (중요)
- 최종 products 배열에는 **중복된 상품이 절대 존재하면 안 됩니다.**
- 중복 판단은 반드시 "normalizedTitle + normalizedQuantityText + finalPrice" 키로 수행합니다.
- 본문에 같은 판매 단위/가격이 여러 번 반복되어도 상품은 1개로만 반환합니다.

#### ⚠️ 반박스는 별개 상품 (재강조)
**"1박스"와 "반박스"는 무조건 서로 다른 상품으로 처리**
- "1박스" ≠ "반박스" (별개 상품) - 반드시 2개 추출
- "한박스" ≠ "반박스" (별개 상품) - 반드시 2개 추출
- 반박스는 정확히 박스의 절반 수량을 의미하는 별도 판매 단위
- 예시: "캠벨포도 1박스 22,000원, 반박스 11,500원" → 2개 상품 추출 필수

#### 같은 상품 판단 추가 기준 (할인 관계 처리)
단위+괄호용량과 단순용량이 같으면 동일 상품으로 처리
- "1봉지(150g)"와 "150g" = 같은 상품 (용량이 동일, 할인 관계)
- "1박스(10개)"와 "10개" = 같은 상품 (수량이 동일, 할인 관계)
- "2상자(500ml*12)"와 "500ml*12" = 같은 상품 (내용물이 동일)
- 이런 경우 더 낮은 가격으로 하나의 상품만 추출

#### 세트 상품과 단가 표시 중복 방지
개별 단가 × 세트 수량 = 세트 가격인 경우
- "1개 625원" + "4개입 1세트 2,500원" (625×4=2,500) → 세트만 추출
- "낱개 1,000원" + "10개 묶음 10,000원" (1,000×10=10,000) → 묶음만 추출  
- 계산이 정확히 맞으면 세트/묶음 상품만 의미있는 판매 단위
- 개별 단가는 참고용이므로 상품으로 추출하지 않음

#### 중복 체크 프로세스
1. 모든 상품 추출
2. 상품명 정규화 (날짜, 특수문자 제거)
3. 단위 정규화 후 중복 체크
4. 같은 상품의 할인 관계 확인
5. 고유한 상품만 반환

### 3.3 상품 개수 결정 규칙

#### 최우선: 번호 구분이 있는 경우
**번호가 있으면 무조건 번호 개수만큼 상품 추출**
- 가격이 같아도 번호가 다르면 다른 상품
- 단위가 같아도 번호가 다르면 다른 상품
- 예: 1️⃣플레인 5,900원, 2️⃣딸기 5,900원 → 2개 상품

#### 차선: 번호 구분이 없는 경우
- 상품 개수 = 고유 판매 단위 개수 (반복 횟수와 무관)
- 고유 판매 단위는 "normalizedTitle + normalizedQuantityText + finalPrice"로 판단
- 다른 상품명(정규화 후)이면 가격이 같아도 다른 상품
- 최종 가격 기준으로만 판단 (할인 전 가격 무시)

인식하는 번호 패턴:
- 이모지 번호: 1️⃣2️⃣3️⃣
- 텍스트 번호: "1번", "2번", "3번"
- 숫자 리스트: "1.", "2.", "3."
- 기호 번호: "①", "②", "③"

### 2.4 가격 추출 규칙

#### 추출 대상 (판매 가격) - 우선순위 순
1. "사전예약가", "예약가" 다음에 오는 첫 번째 가격 (최우선)
2. ✔, ✓, →, 👉, -->>, ->, ⇒ 기호와 함께 표시된 가격
3. "판매", "공구가", "특가"와 연결된 가격
4. 숫자+원 형태의 명확한 가격 (쉼표, 점 구분 모두 인식)
   - "4,500원", "6.000원", "10000원" 모두 유효한 가격 형태

#### 제외 대상 (원가/비교 가격)
- 괄호 안의 가격 (예: (18,000원), (8,500원))
- "기존"이 포함된 모든 라인
- 원래, 예전, 이전, 시중가, 정가, 원가
- 편의점, 마트, 타사

### 2.5 상품 vs 공지사항 구분
- **상품으로 판단**: 가격이 명시되어 있음
- **공지사항으로 판단**: 가격 정보가 전혀 없음

### 2.6 세트 상품의 단가 표시 처리
**세트/묶음 상품과 개별 단가가 함께 나올 때 처리 규칙**

#### 단가 계산식이 맞는 경우 = 세트 상품만 추출
**개별 가격이 단순 참고용일 때 세트만 상품으로 인식**
- "1개 625원" + "4개입 1세트 2,500원" (625×4=2,500) → 세트만 추출
- "1개 1,000원" + "10개입 1박스 10,000원" (1,000×10=10,000) → 박스만 추출
- "낱개 500원" + "12개입 6,000원" (500×12=6,000) → 묶음만 추출

#### 판단 기준
1. **계산 일치**: 개별가격 × 세트수량 = 세트가격이면 → 세트만 판매 상품
2. **단가 키워드**: "낱개", "개별", "1개" 가격이 세트와 함께 → 단가 표시 가능성
3. **세트 강조**: 세트/박스/묶음이 이모지나 특별 표기로 강조 → 세트 위주 판매
4. **할인 없음**: 단가×수량=세트가격이면 할인이 없으므로 세트만 의미 있음


### 기본 상품명 구성
- 정식 상품명 우선
- title은 최소 식별 원칙을 우선 적용 (상품 구분에 필요 없는 단어는 제거)
- 상품명 길이는 최대 ${MAX_PRODUCT_TITLE_CHARS}자로 제한하고, 초과 시 자연스러운 경계에서 "..."로 마무리
- 원산지는 구분 필요시에만 포함:
  - 수입산은 항상 표기 (노르웨이산, 칠레산 등)
  - 프리미엄 지역은 표기 (제주산, 횡성 등)
  - 일반 국내산은 생략 (기본값)
- 괄호 내용 선택적 처리 - 중요 정보는 보존, 불필요한 정보만 제거
  
  #### 보존해야 할 괄호 내용 (괄호 기호만 제거, 내용은 유지)
  - 과일 크기/등급: (4수), (3수), (대), (중), (소), (특), (상)
  - 품질 등급: (특품), (상품), (1등급), (프리미엄), (고급)
  - 수량 정보: (10개), (12개입), (24알), (6마리) (상품 구분에 필요할 때만 보존)
  - 용량 정보: (500g), (1kg), (2L), (150ml) (상품 구분에 필요할 때만 보존)
  - 포장 단위: (1박스), (2상자), (3팩)
  - 부위/종류: (등심), (안심), (갈비), (목심), (제육용), (국거리용)
  - 상태 정보: (냉동), (냉장), (생), (활어), (손질)
  
  #### 제거할 괄호 내용
  - 일반 원산지: (국내산) - 기본값이므로 제거
  - 설명성 정보: (신선한), (맛있는), (고품질)
  - 범위 표시: (200g 내외), (약 1kg)
  
  #### 예시 (올바른 처리)
  - "샤인머스켓1박스(4수)2KG" → "샤인머스켓 1박스 4수 2KG"
  - "샤인머스켓1박스(3수)2KG" → "샤인머스켓 1박스 3수 2KG"
  - "전복(국내산)" → "전복" (국내산은 기본값이므로 제거)
  - "자반고등어(노르웨이산)" → "자반고등어 노르웨이산" (수입산은 보존)
  - "돼지앞다리(제육용)" → "돼지앞다리 제육용" (부위 정보 보존)
  - "민어회(국내산)200g(활어)" → "민어회 200g 활어" (활어 정보 보존)
  - "무항생제 한우국거리(덩어리) 300g" → "무항생제 한우국거리 덩어리 300g"
  - "완숙토마토(유기농)" → "완숙토마토 유기농" (품질 정보 보존)
  - "고급 야채 청경채 1봉지(200g 내외)" → "고급 야채 청경채 1봉지" (범위 표시만 제거)
- 날짜 패턴 제거 (픽업 날짜 [M월D일]은 유지, ISO 형식만 제거)
  - "[9월5일] 9월4일 횡성 토마토" → "[9월5일] 횡성 토마토" (대괄호 날짜는 유지)
  - "2024.09.05 유기농 배추" → "유기농 배추" (ISO 형식 제거)
  - "2025-09-02 한우 등심" → "한우 등심" (ISO 형식 제거)
  - "24-09-05 한우" → "한우" (짧은 ISO 형식 제거)
- 중복 키워드 제거
  - "유기농 토마토 완숙토마토 유기농" → "유기농 완숙토마토"
  - "국내산 한우 국내산 등심" → "국내산 한우 등심"
  - 더 구체적인 키워드 우선 (동일 상품명의 경우): "토마토 완숙토마토" → "완숙토마토"
- 단위 표시 규칙 (세트/묶음은 항상 보존):
  - 세트/묶음: 항상 보존 (1세트, 2묶음, 3패키지)
  - 박스/상자: 있으면 보존 (1박스, 2상자)  
  - 수량: 상품 구분에 필요할 때만 보존 (4알, 10개, 5봉)
  - 용량: 상품 구분에 필요할 때만 보존 (300g, 500ml)
  - 조합 허용: "1세트 4알", "2묶음 8개", "1박스 12개" 등 자연스러운 조합
  - 최대 제한: 3개 이상 단위는 중요도 순으로 선별
- 제외: 날짜 정보, 재고 표시, 이모티콘, 프로모션 문구

### 단위 표기 규칙

#### 박스/상자 정규화 (필수)
- "반박스" → "반박스" (유지)
- "한박스" → "1박스" (변경)
- "반상자" → "반상자" (유지)
- "한상자" → "1상자" (변경)

#### 내용물 표기
- 박스: "1박스 12개"
- 봉지: "1봉지 10개"
- 세트: 게시물에 명시된 경우만 사용

#### 원문 단위 보존
- "3알", "5구", "2송이", "1손" → 그대로 유지

### 수량별 가격 차이 상품 — 반드시 별도 상품으로 추출
수량 기준으로 가격이 달라지는 경우는 각 구간을 **무조건 별도 상품**으로 추출합니다.

**인식해야 할 패턴 (필수):**
- "1개 X원", "2개부터 Y원", "2개이상 Y원"
- "1팩 X원", "2팩부터 Y원씩", "2팩이상 Y원"
- "1봉지 X원", "2봉지이상 Y원씩"
- "1박스 X원", "2박스 Y원"
- "N개/팩/봉지/박스 + (부터/이상/~)" 패턴 모두

**제목 규칙 (필수):**
기본 상품명 뒤에 구간 라벨을 **반드시** 붙입니다.
- "1개", "1팩", "1봉지" → 그대로 붙임
- "2개부터", "2팩부터", "2개이상" → "2개 이상", "2팩 이상"으로 정규화
- 예시:
  - "블루베리 1팩 4,500원" → 상품1: title="블루베리 1팩", price=4500, quantityText="1팩", variantType="STANDARD"
  - "2팩부터 4,000원씩" → 상품2: title="블루베리 2팩 이상", price=4000, quantityText="2팩 이상", variantType="STANDARD"
  - "방촌시장떡볶이 500g\n1팩 5,500원\n2팩부터 5,000원" → 2개 상품:
    - 상품1: title="방촌시장떡볶이 1팩", price=5500, quantityText="1팩"
    - 상품2: title="방촌시장떡볶이 2팩 이상", price=5000, quantityText="2팩 이상"
  - "어포 튀각 1봉 3,000원 / 4봉 묶음 10,000원" → 2개 상품:
    - 상품1: title="어포 튀각 1봉", price=3000, quantityText="1봉"
    - 상품2: title="어포 튀각 4봉 묶음", price=10000, quantityText="4봉"

**중요:**
- 구간 라벨이 다르면 무조건 다른 상품입니다 (가격이 같아도).
- "~씩"은 단가(개당/봉지당)를 의미하므로 그대로 판매가로 사용합니다.
- 각 상품의 priceOptions는 빈 배열([])로 두고, variantType은 STANDARD로 유지합니다.
- multipleProducts는 구간이 2개 이상이면 true로 설정합니다.

수량별 가격 차이가 아닌 완전히 다른 상품(예: 전혀 다른 맛/구성)으로 판단될 때는 'multipleProducts: true' + 각 상품의 variantType을 "MIXED_PRODUCTS"로 처리합니다.

### variantType 필드 정의
- "STANDARD": 추가 규칙이 없는 일반 상품 (기본값). 수량별 가격 차이 상품도 각각 STANDARD로 설정합니다.
- "MIXED_PRODUCTS": 게시물에 서로 다른 상품이 여러 개 존재하는 경우 (예: 함박스테이크 + 소스). multipleProducts는 true, 각 상품 객체의 variantType도 "MIXED_PRODUCTS"로 설정합니다.

참고: 수량별 가격 차이 상품(1팩/2팩 이상)은 더 이상 QUANTITY_VARIANT를 사용하지 않고, 각각을 별도의 STANDARD 상품으로 추출합니다.


#### 절대 추출 금지:
- 가격 정보: "사전예약가 43,500원" 
- 할인 정보: "(50,000원)" 
- 상품 설명: "입안 가득 고소하고 담백한" 


## 6. JSON 출력 구조

{
  "multipleProducts": boolean,
  "variantType": "STANDARD" | "QUANTITY_VARIANT" | "MIXED_PRODUCTS",
  "products": [
    {
      "itemNumber": 1,
      "title": "상품명", 
      "basePrice": 할인된_판매가격,
      "price": 할인된_판매가격,
      "quantity": 1,
      "quantityText": "단위",
      "description": "상세설명",
      "priceOptions": [
        {
          "quantity": 1,
          "price": 할인된_판매가격,
          "description": "옵션 설명",
          "minQuantity"?: 최소주문수량,
          "unitLabel"?: "팩" | "박스" | ...
        }
      ],
      "category": "식품",
      "status": "판매중",
       "postTime": null, 
      "pickupInfo": "9.5~6(2일간) 또는 매주 금요일 형태의 실제 수령 일정 정보",
      "pickupDate": null,
      "pickupType": "수령",
      "stockQuantity": null,
      "order_needs_ai": false,
      "order_needs_ai_reason": null,
      "variantType": "STANDARD" | "QUANTITY_VARIANT" | "MIXED_PRODUCTS"
      // title 날짜는 pickupDate와 일치해야 함
    }
  ]
}

## 6.5 basePrice와 price 필드 규칙
basePrice와 price는 모두 동일한 할인된 판매가격이어야 함

- basePrice: 고객이 실제로 지불할 할인된 판매가격 (DB 저장용)
- price: 고객이 실제로 지불할 할인된 판매가격 (동일한 값)
- 잘못된 예: basePrice에 원가, price에 할인가를 각각 다르게 설정
- 올바른 예: "basePrice": 12800, "price": 12800 (둘 다 할인가)
- 잘못된 예: "basePrice": 16000, "price": 12800 (원가와 할인가 분리)


## 8. 최종 검증 체크리스트
1. **번호로 구분된 상품을 모두 추출했는가?** (가격/단위가 같아도)
2. **반박스를 독립 상품으로 추출했는가?** (1박스와 반박스는 2개 상품)
3. 중복된 상품이 없는가? (번호 구분이 없는 경우만)
4. 할인 가격을 2개 상품으로 나누지 않았는가?
5. "한박스", "한상자"를 "1박스", "1상자"로 변경했는가?
6. basePrice와 price가 모두 동일한 할인된 판매가격으로 설정되었는가?
7. pickupInfo에 가격 정보가 포함되지 않았는가? (수령 일정만 포함해야 함)
8. title이 ${MAX_PRODUCT_TITLE_CHARS}자를 넘지 않는가? (넘으면 "..." 처리)
9. title이 "구분 가능한 최소 정보"만 포함하는가? (불필요한 수식어/중복 키워드 제거)
10. 판매 단위(1팩/2팩, 반박스/한박스 등)는 title에 유지했는가?
11. 1팩/2팩, 반박스/한박스 등으로 이미 구분 가능하면 무게/용량(g, kg 등)은 title에서 제거했는가? (단, 무게가 유일한 구분자면 유지)



## 9. 가격 추출 예시 (중요)

### 번호 구분 예시 (최우선):
- 입력: "1️⃣플레인맛 요거트 1곽 : 5,900원\n2️⃣딸기맛 요거트 1곽 : 5,900원"
  결과: 2개 상품 추출 - "플레인맛 요거트" 5,900원, "딸기맛 요거트" 5,900원
  설명: 번호 구분이 있으므로 가격이 같아도 2개 상품

- 입력: "①생거나오레 1봉 3,000원 ②김 포트팔 1봉 3,000원 ③참김 단평 1봉 3,000원"
  결과: 3개 상품 모두 추출 (각각 3,000원)
  설명: 번호 구분이 있으므로 모두 별개 상품

### 반박스 예시:
- 입력: "캠벨포도 1박스 8송이 22,000원\n반박스 4송이 11,500원"
  결과: 2개 상품 - "캠벨포도 1박스 8송이" 22,000원, "캠벨포도 반박스 4송이" 11,500원
  설명: 1박스와 반박스는 항상 별개 상품

### 올바른 가격 추출 예시:
- 입력: "배추김치2kg,사전예약가 : 14,800원(18,000원)" 
  결과: 추출 14,800원 (사전예약가가 판매가), 제외 18,000원 (괄호 안 원가)

- 입력: "석박지1kg,사전예약가 : 5,980원(8,500원)"
  결과: 추출 5,980원 (사전예약가가 판매가), 제외 8,500원 (괄호 안 원가)

- 입력: "7,000원에서 4,900원으로 할인"
  결과: 추출 4,900원 (할인 후 판매가), 제외 7,000원 (할인 전 원가)

### 동일 용량 할인 관계 예시:
- 입력: "맥반석 오징어 1봉지(150g) 10,000원\n150g 8,500원"
  결과: 1개 상품 "맥반석 오징어 150g" 8,500원 (할인가 적용, 중복 제거)

- 입력: "프리미엄 사과 1박스(10개) 15,000원\n10개 12,000원"
  결과: 1개 상품 "프리미엄 사과 10개" 12,000원 (할인가 적용)

### 특수 화살표 할인 관계 예시:
- 입력: "미니글로우 파인 1통-->> 6.000원👉👉4,500원"
  결과: 1개 상품 "미니글로우 파인 1통" 4,500원 (할인가 적용)
  
- 입력: "달콤한 토마토 1박스--> 8.000원→6,500원"
  결과: 1개 상품 "달콤한 토마토 1박스" 6,500원 (할인가 적용)

### 세트 상품 단가 표시 예시:
- 입력: "🧨장언니 1개 625원\n💝장언니 공구가 1set 4병 2,500원"
  결과: 1개 상품 "페리에 레몬 4개입 1세트" 2,500원
  설명: 625×4=2,500이므로 1개 가격은 단가 표시, 세트만 추출

- 입력: "낱개 1,000원\n10개입 1박스 10,000원"  
  결과: 1개 상품 "상품명 10개입 1박스" 10,000원
  설명: 1,000×10=10,000이므로 낱개는 참고 정보, 박스만 추출

## 9. 상품명 단위 우선순위 및 괄호 처리 예시

### 단위 표시 규칙 (세트/묶음 보존):
- 잘못된 예 (세트 누락): "1세트/ 4알" → "홍로 햇 사과 4알"
- 올바른 예 (세트 보존): "1세트/ 4알" → "홍로 햇 사과 1세트 4알"

- 잘못된 예 (묶음 누락): "2묶음 8개" → "상품명 8개"
- 올바른 예 (묶음 보존): "2묶음 8개" → "상품명 2묶음 8개"

- 잘못된 예 (너무 많은 단위): "여자애석류 70ml*30포*2박스 1세트"
- 올바른 예 (중요도 순 선별): "여자애석류 1세트 2박스"

### 괄호 처리 (중요 정보 보존):
- 잘못된 예 (괄호 기호 포함): "민어회(국내산)200g(활어)"
- 올바른 예 (선택적 처리): "민어회 200g 활어" (활어는 상태정보이므로 보존, 국내산은 제거)

- 잘못된 예: "무항생제 한우국거리(덩어리) 300g"
- 올바른 예: "무항생제 한우국거리 덩어리 300g" (부위정보 보존)

- 잘못된 예: "완숙토마토(유기농) 800g"
- 올바른 예: "완숙토마토 유기농 800g" (품질정보 보존)

- 과일 크기 보존 예시:
  - 잘못된 예: "샤인머스켓1박스(4수)2KG" → "샤인머스켓 1박스 2KG"
  - 올바른 예: "샤인머스켓1박스(4수)2KG" → "샤인머스켓 1박스 4수 2KG"

- 잘못된 예: "고급 야채 청경채 1봉지(200g 내외)"
- 올바른 예: "고급 야채 청경채 1봉지"


### 중복 키워드 제거:
- 잘못된 예 (중복 단어): "유기농 토마토 완숙토마토 유기농 800g"
- 올바른 예 (중복 제거): "유기농 완숙토마토 800g"

- 잘못된 예 (포함 관계 중복): "국내산 한우 국내산 등심"
- 올바른 예 (중복 정리): "국내산 한우 등심"

### 기타 금지 사항
- 상품명에 괄호 기호 () 포함 (괄호 기호는 제거하되, 중요한 내용은 보존해야 함)
  - 잘못된 예: "샤인머스켓(4수)" (괄호 기호 포함)
  - 올바른 예: "샤인머스켓 4수" (괄호 기호 제거, 크기 정보 보존)

- 상품명에 중복 키워드 포함 (유기농 토마토 완숙토마토 → 유기농 완숙토마토)
- 3개 이상의 단위 표시 (박스>세트>수량>용량 순으로 최대 2개만)
- 괄호 안 가격을 판매가로 추출
- 사전예약가/예약가를 무시하고 괄호 안 가격 선택
- pickupInfo에 가격 정보 포함 ("사전예약가 43,500원" 같은 가격 정보 금지)
- "한박스", "한상자" 그대로 사용
- 수량별 가격 차이 상품에 중량/용량 단위 포함
- 할인 가격을 여러 상품으로 분리
- 가격이 있는데 products가 빈 배열
`;

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
    
    const response = await fetchWithGoogleApiKeyFallback({
      model: aiModel,
      requestBody,
      timeoutMs: 30000,
      retriesPerKey: 2,
      logPrefix: "[AI 분석]",
    });
    
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
    
    // ✅ 새로운 형식 처리: products 배열이 있으면 multipleProducts 값과 무관하게 처리
    if (Array.isArray(parsedResult.products)) {
      // products 배열이 있는 경우 (multipleProducts 값 무관)
      if (parsedResult.products.length === 0) {
        console.warn(
          "[AI 분석] AI가 상품을 추출하지 못했습니다. 빈 배열 반환.",
          parsedResult
        );
        return NextResponse.json({
          products: [],
          keywordMappings: parsedResult.keywordMappings || {},
          emptyProductsReason: "ai_empty_products"
        });
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
          const cleanTitle = sanitizeProductTitle(product.title);
          if (!cleanTitle) return null;
          return {
            ...product,
            itemNumber: product.itemNumber || index + 1,
            title: cleanTitle,
            keywords: Object.keys(parsedResult.keywordMappings || {}).filter(
              (key) =>
                parsedResult.keywordMappings[key].productIndex === index + 1
            ),
          };
        })
        .filter(Boolean);

      console.log(
        `[AI 분석] ${validProducts.length}개 상품 추출 완료:`,
        validProducts.map((p) => p.title)
      );

      return NextResponse.json({
        products: validProducts,
        keywordMappings: parsedResult.keywordMappings || {}
      });

    } else if (parsedResult.multipleProducts === false && parsedResult.title) {
      // ✅ 옛날 형식 (products 배열 없고 직접 title/basePrice 등)
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
      const cleanTitle = sanitizeProductTitle(parsedResult.title);
      if (!cleanTitle) {
        console.warn("[AI 분석] 상품 제목 정제 결과가 비어있습니다:", parsedResult.title);
        return NextResponse.json({ products: getDefaultProduct("상품 제목 정제 실패") });
      }
      
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
        return NextResponse.json({
          products: [],
          emptyProductsReason: "ai_empty_products"
        });
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
          const cleanTitle = sanitizeProductTitle(product.title);
          if (!cleanTitle) return null;
          
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
        })
        .filter(Boolean);
      
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
