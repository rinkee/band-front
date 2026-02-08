import { NextResponse } from 'next/server';
import {
  fetchWithGoogleApiKeyFallback,
  getGoogleApiKeyPool,
} from "../../../lib/server/googleApiKeyFallback";

const DEFAULT_AI_MODEL = "gemini-2.5-flash-lite-preview-06-17";
const ALLOWED_AI_MODELS = new Set([
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.5-flash-lite",
]);
const MAX_BODY_BYTES = 512 * 1024;
const MAX_COMMENTS_PER_REQUEST = 120;
const MAX_SINGLE_COMMENT_CHARS = 1000;
const MAX_TOTAL_COMMENT_CHARS = 60000;
const MAX_POST_CONTENT_CHARS = 20000;
const MAX_PRODUCTS_PER_POST = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const getRateLimitStore = () => {
  if (!globalThis.__aiCommentAnalysisRateLimitStore) {
    globalThis.__aiCommentAnalysisRateLimitStore = new Map();
  }
  return globalThis.__aiCommentAnalysisRateLimitStore;
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
 * AI를 사용하여 댓글에서 주문 정보 추출 (Gemini API 사용)
 * @param {Request} request 
 * @returns {Promise<NextResponse>}
 */
export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const actorUserId = (request.headers.get("x-user-id") || "").trim() || "anonymous";
    const rl = checkRateLimit(`ai-comment-analysis:${actorUserId}:${clientIp}`);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          orders: [],
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
        { orders: [], message: parsedBody.message },
        { status: parsedBody.status }
      );
    }

    const { 
      postInfo, 
      comments, 
      bandNumber, 
      postId,
      aiModel = DEFAULT_AI_MODEL
    } = parsedBody.body || {};

    if (typeof aiModel !== "string" || !ALLOWED_AI_MODELS.has(aiModel)) {
      return NextResponse.json(
        {
          orders: [],
          message: `허용되지 않은 모델입니다: ${aiModel}`,
        },
        { status: 400 }
      );
    }

    if (!postInfo || typeof postInfo !== "object" || Array.isArray(postInfo)) {
      return NextResponse.json(
        {
          orders: [],
          message: "postInfo 객체가 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(comments)) {
      return NextResponse.json(
        {
          orders: [],
          message: "comments 배열이 필요합니다.",
        },
        { status: 400 }
      );
    }

    const safePostInfo = {
      ...postInfo,
      content: typeof postInfo.content === "string" ? postInfo.content : "",
      products: Array.isArray(postInfo.products) ? postInfo.products : [],
    };

    if (safePostInfo.content.length > MAX_POST_CONTENT_CHARS) {
      return NextResponse.json(
        {
          orders: [],
          message: `postInfo.content가 너무 큽니다. 최대 ${MAX_POST_CONTENT_CHARS}자`,
        },
        { status: 413 }
      );
    }

    if (safePostInfo.products.length > MAX_PRODUCTS_PER_POST) {
      return NextResponse.json(
        {
          orders: [],
          message: `products 개수가 너무 많습니다. 최대 ${MAX_PRODUCTS_PER_POST}개`,
        },
        { status: 413 }
      );
    }
    
    const googleApiKeyPool = getGoogleApiKeyPool();
    
    if (googleApiKeyPool.length === 0) {
      console.warn(
        "AI API 키 또는 엔드포인트가 올바르게 구성되지 않았습니다. AI 분석을 건너뜁니다."
      );
      return NextResponse.json({ orders: [] });
    }
    
    if (comments.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    if (comments.length > MAX_COMMENTS_PER_REQUEST) {
      return NextResponse.json(
        {
          orders: [],
          message: `comments 개수가 너무 많습니다. 최대 ${MAX_COMMENTS_PER_REQUEST}개`,
        },
        { status: 413 }
      );
    }

    const safeComments = comments.map((comment) => {
      if (comment && typeof comment === "object") {
        return comment;
      }
      return { comment: String(comment ?? "") };
    });

    let totalCommentChars = 0;
    for (const comment of safeComments) {
      const commentText = String(
        comment?.body || comment?.content || comment?.comment || ""
      );
      if (commentText.length > MAX_SINGLE_COMMENT_CHARS) {
        return NextResponse.json(
          {
            orders: [],
            message: `개별 댓글 길이가 너무 깁니다. 최대 ${MAX_SINGLE_COMMENT_CHARS}자`,
          },
          { status: 413 }
        );
      }
      totalCommentChars += commentText.length;
    }

    if (totalCommentChars > MAX_TOTAL_COMMENT_CHARS) {
      return NextResponse.json(
        {
          orders: [],
          message: `댓글 총 길이가 너무 깁니다. 최대 ${MAX_TOTAL_COMMENT_CHARS}자`,
        },
        { status: 413 }
      );
    }

    // 게시물 상품 정보 요약 (참고용)
    const productsSummary = safePostInfo.products
      .map((product, index) => {
        const optionsStr =
          product.priceOptions
            ?.map(
              (opt) =>
                `${opt.description || `${opt.quantity}개`} ${opt.price}원`
            )
            .join(", ") || "옵션 없음";
        return `${index + 1}번 상품: '${product.title}' (옵션: ${optionsStr})`;
      })
      .join("\n");

    // 댓글 정보 요약 (작성자 정보 포함)
    const commentsSummary = safeComments
      .map((comment, index) => {
        // Band API에서 latest_comments는 body 필드를, 직접 fetch한 comments는 content 필드를 사용
        const commentText =
          comment.body || comment.content || comment.comment || "";
        const authorName = comment.author?.name || "알수없음";
        return `댓글 #${index + 1} (key: ${
          comment.commentKey
        }, 작성자: ${authorName}): "${commentText}"`;
      })
      .join("\n");

    const systemInstructions = `
당신은 게시물에서 상품정보와 주문 맥락을 파악해서 고객들의 댓글에 단 주문을 orderData로 변환하는 AI입니다. 주어진 게시물과 댓글을 분석하여 정확한 주문 정보를 JSON으로 추출해야 합니다.

### **🚨 핵심 원칙 (절대 위반 금지) 🚨**

**1. 정확한 키워드 매칭 (가장 중요)**
- 댓글의 키워드를 게시물의 상품명과 **정확히** 매칭해야 합니다
- **부분 매칭 금지**: "식빵" 키워드가 있다고 해서 "영양쿠키"와 매칭하면 안됩니다
- **유사 단어 주의**: "모싯잎식빵"과 "영양쿠키"는 완전히 다른 상품입니다
- **정확한 포함 관계**: 댓글 키워드가 상품명에 실제로 포함되어야 합니다

**2. 키워드 매칭 예시**
✅ **올바른 매칭**:
- 댓글 "모싯잎식빵1" → "비건모싯잎쌀식빵480g" (모싯잎식빵이 포함됨)
- 댓글 "비건식빵1" → "비건모싯잎쌀식빵480g" (비건+식빵이 포함됨)
- 댓글 "모닝2" → "우리밀 모닝빵450g" (모닝이 포함됨)
- 댓글 "통밀식빵1" → "우리밀 통밀식빵400g" (통밀식빵이 포함됨)

❌ **잘못된 매칭**:
- 댓글 "모싯잎식빵1" → "비건영양쿠키3입" (모싯잎식빵이 포함되지 않음)
- 댓글 "비건식빵1" → "비건영양쿠키3입" (식빵이 포함되지 않음)
- 댓글 "식빵" → "영양쿠키" (전혀 다른 상품)

**3. 여러 상품 주문 처리**
- 한 댓글에서 여러 상품을 주문하면 각각 별도의 주문 객체를 생성해야 합니다
- 예: "모닝2 통밀식빵1" → 2개의 주문 객체 생성

### **매칭 절차**

**1단계: 댓글에서 키워드 추출**
- 댓글에서 상품명과 관련된 키워드를 추출합니다
- 숫자는 수량으로 분리합니다

**2단계: 게시물 상품과 정확히 매칭**
- 추출된 키워드가 게시물의 상품명에 실제로 포함되는지 확인합니다
- 가장 정확하게 매칭되는 상품을 선택합니다

**3단계: 주문 객체 생성**
- 매칭된 상품의 productItemNumber를 사용합니다
- 추출된 수량을 quantity로 설정합니다

### **[분석 대상 정보]**

**1. 게시물 본문**:
${safePostInfo.content}

**2. 게시물 상품 정보**:
${productsSummary}

**3. 분석할 댓글 목록**:
${commentsSummary}

### **[주문 판별 규칙]** 🔥🔥🔥 매우 중요

🚨🚨🚨 **특별 지시사항: 복잡한 옵션 상품에서 단순 숫자는 무조건 주문** 🚨🚨🚨
**상품에 2개 이상 옵션이 있고 무게/용량 단위가 포함된 경우, 단순 숫자("1", "2", "5", "10" 등)는 예외 없이 주문으로 처리하세요!**

**✅ 주문으로 처리해야 하는 경우:**
1. **수량 표현이 있는 경우**
   - 숫자: "1", "2", "3", "5", "10", "20" (단순 숫자도 포함)
   - 한국어 수량: "하나", "한개", "두개", "세개"
   - 수량 + 단위: "1개", "2개", "1대", "2대", "한개요", "한개요", "두개요"
   - 단위 표현: "개", "대", "팩", "봉지", "세트", "박스", "통", "병" 등
   - 옵션 키워드: "반통", "1통", "한박스", "두팩"
   - **🚨 중요**: 복잡한 옵션 상품에서는 단순 숫자("5", "10" 등)도 100% 주문으로 처리

2. **🔥🔥🔥 필수 규칙: 복잡한 옵션 상품에서의 단순 숫자 무조건 주문 처리 🔥🔥🔥**
   - **상품에 2개 이상의 가격 옵션이 있고 quantity_text에 무게/용량 단위가 포함된 경우**, **단순 숫자는 무조건 주문으로 처리해야 합니다**
   - **절대 규칙**: 단순 숫자("1", "2", "3", "5", "10" 등)는 **100% 주문**으로 간주
   - **예시**: 
     🔥 "5" → **반드시 주문으로 처리** (5키로한박스 또는 1.5키로 5개 중 적절하게 선택)
     🔥 "2" → **반드시 주문으로 처리** (2개 주문 또는 적절한 옵션 선택)
     🔥 "10" → **반드시 주문으로 처리** (10개 주문 또는 큰 용량 옵션 선택)
     🔥 "1" → **반드시 주문으로 처리** (1개 주문 또는 소량 옵션 선택)
   
   **🔥🔥🔥 세트 상품의 개별 단위 처리 (매우 중요) 🔥🔥🔥**
   - **"1세트(5개)" 형태의 상품에서 개별 수량으로 주문하는 경우 특별 처리**
   - **규칙**: 세트 안의 개별 단위로 주문 시, 세트 수량으로 자동 변환
   - **예시 - 흑미찰옥수수 1세트(5개) 3,500원의 경우**:
     🔥 "5개" → 1세트로 변환 (quantity: 1)
     🔥 "10개" → 2세트로 변환 (quantity: 2)
     🔥 "15개" → 3세트로 변환 (quantity: 3)
     🔥 "20개" → 4세트로 변환 (quantity: 4)
   - **계산 방법**: 주문 개수 ÷ 세트당 개수 = 세트 수량
   - **reason 예시**: "댓글 '10개'는 1세트(5개) 상품의 개별 단위 주문으로, 10÷5=2세트로 변환하여 처리"
   **🚨 가격 효율성 우선 판단 (절대 규칙!)**:
   
   **핵심 원칙: 고객에게 가장 저렴하고 유리한 옵션을 선택해야 합니다!**
   
   **1단계: 옵션 직접 매칭 확인**
   - 단순 숫자가 옵션과 직접 매칭되는지 먼저 확인 (예: "5" → "5키로한박스")
   
   **2단계: 가격 효율성 비교 (핵심!)**
   - 여러 해석이 가능할 때 **키로당 단가**를 계산하여 더 저렴한 옵션 선택
   
   **🔥🔥🔥 중요: 모호한 주문 판별 규칙 🔥🔥🔥**
   
   **isAmbiguous: true로 설정해야 하는 경우:**
   1. **정확한 단위 매칭이 없는 경우만**: 
      - "5키로"인데 정확히 "5키로" 옵션이 없고, 1키로/2키로 옵션만 있는 경우
      - 이 경우 고객이 조합을 원할 수도 있으므로 isAmbiguous: true
   
   2. **명확한 계산이 가능한 경우는 isAmbiguous: false**:
      - "10개"이고 "5개" 옵션이 있는 경우 → 5개 × 2 = 10개로 명확함 → isAmbiguous: false
      - "6개"이고 "3개" 옵션이 있는 경우 → 3개 × 2 = 6개로 명확함 → isAmbiguous: false
      
   3. **confidence 기준**:
      - confidence가 0.5 미만인 경우만 isAmbiguous: true
      - 명확한 배수 관계는 confidence 0.8 이상으로 설정
   
   **🔥 구체적 계산 예시 (반드시 따라하세요!):**
   
   **게시물: "1.5키로 9,900원", "5키로한박스 27,900원"**
   **댓글: "5"**
   
   **해석1**: 5키로한박스 1개
   - 총량: 5키로, 총가격: 27,900원
   - 키로당 단가: 27,900 ÷ 5 = 5,580원/키로
   
   **해석2**: 1.5키로 5개 = 7.5키로, 49,500원
   - 총량: 7.5키로, 총가격: 49,500원
   - 키로당 단가: 49,500 ÷ 7.5 = 6,600원/키로
   
   **✅ 결론**: 해석1이 1,020원/키로 더 저렴! → **5키로한박스 선택**
   - selectedOption: "5키로한박스", quantity: 1, unitPrice: 27900, totalPrice: 27900
   - reason: "댓글 '5'에서 5키로한박스(키로당 5,580원)와 1.5키로 5개(키로당 6,600원)를 비교한 결과, 5키로한박스가 더 경제적이므로 선택함."
   
   **🔥 다른 예시들:**
   
   **댓글: "10"**
   - 해석1: 1.5키로 10개 = 15키로, 99,000원 (키로당 6,600원)
   - 해석2: 5키로한박스 2개 = 10키로, 55,800원 (키로당 5,580원)  
   - 해석3: 5키로한박스 3개 = 15키로, 83,700원 (키로당 5,580원)
   **✅ 선택**: 해석3 (15키로, 더 많은 양을 더 저렴하게!)
   
   **댓글: "2"**  
   - 해석1: 1.5키로 2개 = 3키로, 19,800원 (키로당 6,600원)
   - 해석2: 5키로한박스 1개 = 5키로, 27,900원 (키로당 5,580원)
   **✅ 선택**: 소량 구매시는 해석1 (필요한 양에 맞게)
   
   **🚨 절대 금지**: 비효율적인 옵션 선택 (예: "5" → 1.5키로 5개, 49,500원)
   **✅ 필수**: 항상 키로당 단가를 계산하여 고객에게 유리한 옵션 선택
   - **❌ 절대 금지**: 단순 숫자를 "주문 아님"이나 "애매함"으로 처리하는 것은 **절대 금지**
   - **✅ 필수**: isOrder: true, 적절한 quantity/selectedOption 설정, reason에 선택 근거 명시


3. **오타 및 특수문자 변환 (매우 중요 - "ㅣ대", "한통" 완벽 처리)**
   - **"ㅣ", "l", "i", "I"는 모두 무조건 숫자 "1"로 해석해야 합니다**
   - **"ㅣ대" = "1대" = 수량 1개 주문으로 반드시 인식**
   - **"l개" = "1개", "I팩" = "1팩", "ㅣ병" = "1병"**
   - **"ㅣ" 단독으로 있어도 "1"로 해석 (예: "ㅣ" → 1개 주문)**
   - **"한통" = "1통", "두통" = "2통", "세통" = "3통" 등 한글 숫자+단위 조합 완벽 인식**
   - **"한개" = "1개", "두개" = "2개", "세개" = "3개"**
   - **"한세트" = "1세트", "두세트" = "2세트"**
   - **"한팩" = "1팩", "두팩" = "2팩"**
   - **"한박스" = "1박스", "두박스" = "2박스"**
   - **오타 패턴은 절대 "주문 아님"으로 처리하면 안됩니다**
   - "o", "O"는 숫자 "0"으로 간주할 수 있다. (예: "o.5" -> 0.5)
   
   **🔥 "ㅣ대" 처리 완벽 가이드 (절대 실패하면 안됨):**
   1. "ㅣ대" 댓글을 받으면 → "1대"로 변환하여 해석
   2. "대"는 개수 단위이므로 → quantity: 1
   3. isOrder: true로 반드시 설정 (100% 확신)
   4. 절대로 "주문 아님"이나 "모호함"으로 처리하면 안됨
   5. "ㅣ대"는 "1대" 주문의 오타이므로 확실한 주문입니다
   
   **🔥 "한통" 처리 완벽 가이드 (절대 실패하면 안됨):**
   1. "지금도 되나요? 되면 한통할게요" 댓글을 받으면 → "한통" = "1통" 주문으로 해석
   2. "통"은 개수 단위이므로 → quantity: 1
   3. isOrder: true로 반드시 설정 (100% 확신)
   4. "되면 한통할게요"는 명확한 주문 의도가 있는 문장
   5. "지금도 되나요?"는 구매 가능성을 묻는 전문이므로 주문 의도를 강화
   
   **🔥 오타 패턴 절대 규칙:**
   - "ㅣ세트" = "1세트" 주문
   - "l개" = "1개" 주문  
   - "I팩" = "1팩" 주문
   - "i봉지" = "1봉지" 주문
   - "한통" = "1통" 주문 (매우 중요!)
   - "두통" = "2통" 주문
   - "세통" = "3통" 주문
   - 오타로 인한 모든 숫자-단위 조합은 반드시 주문으로 처리

4. **상품명 키워드 매칭**
   - 댓글에 상품명이 포함된 경우
   - 예: "김치1개" (상품에 '김치'가 포함된 경우)
   - **🚨 중요**: 상품명이 여러 개 포함되면 각각 별도의 주문으로 처리

5. **픽업/배송 정보 추출**
   - "내일", "오늘", "수요일", "4시" 등 날짜/시간 표현
   - "픽업", "배송", "수령" 등 배송 방식
   - **🚨 중요**: 픽업 날짜가 없으면 기본값(내일)으로 처리

6. **전화번호 정보 추출 (신규 추가)**
   - 댓글에 포함된 전화번호 패턴을 감지하여 추출합니다
   - 010-xxxx-xxxx, 010xxxxxxxx, 010 xxxx xxxx 등 다양한 형식을 지원합니다
   - **규칙**: 4자리 이상 숫자 또는 0으로 시작하는 3자리 이상 숫자는 전화번호로 간주
   - **중요**: 전화번호가 포함된 댓글도 주문 정보가 있으면 주문으로 처리합니다

**❌ 주문이 아닌 경우:**
- 질문만 있는 경우: "언제까지 하나요?", "가격이 얼마인가요?"
- 단순 인사나 감탄: "안녕하세요", "맛있겠다", "우와"
- 취소/변경 표현: "취소합니다", "변경할게요"
- 이미 받았다는 표현: "잘 받았습니다", "맛있었어요"
- **중요**: 하지만 숫자가 포함되면 주문일 가능성이 높음

### **AI 응답 형식**

반드시 다음 JSON 형식으로 응답해야 합니다:

{
  "orders": [
    {
      "commentKey": "댓글의 고유 키",
      "originalText": "원본 댓글 내용",
      "isOrder": true/false,
      "isAmbiguous": true/false, // 🔥🔥🔥 모호한 주문 여부 (확인 필요한 경우 true)
      "productItemNumber": 1~n (상품 번호),
      "productTitle": "매칭된 상품명",
      "quantity": 주문 수량 (숫자),
      "selectedOption": "선택된 옵션 설명" (옵션이 있는 경우),
      "unitPrice": 15900, // 🔥 단가 (AI가 게시물에서 직접 추출하여 계산)
      "totalPrice": 15900, // 🔥 총 가격 (AI가 직접 계산)
      "pickupDate": "YYYY-MM-DD" 또는 null,
      "pickupTime": "HH:mm" 또는 null,
      "pickupType": "픽업" 또는 "배송" 또는 "수령",
      "phoneNumber": "추출된 전화번호" 또는 null,
      "reason": "주문으로 판단한 이유 또는 판단하지 않은 이유",
      "confidence": 0.0~1.0,
      "detectedKeywords": ["감지된", "키워드들"]
    }
  ],
  "summary": {
    "totalComments": 분석한 전체 댓글 수,
    "orderCount": 주문으로 판단된 댓글 수,
    "ambiguousCount": 애매한 댓글 수
  }
}

🔥🔥🔥 **절대 필수 - 모든 주문에 반드시 포함해야 하는 필드들** 🔥🔥🔥:
- unitPrice: 숫자 (절대 null 금지, 예: 15900)
- totalPrice: 숫자 (절대 null 금지, 예: 15900)
- selectedOption: 문자열 또는 null (예: "반통", "1통", null)

🔥 **가격 계산 방법 (AI가 게시물 콘텐츠를 직접 분석해서 계산)**:

**핵심 원칙: 게시물 콘텐츠가 진실의 원천입니다**
1. **게시물 본문에서 직접 가격 정보 파싱**: 게시물에 "반박스 12,900원", "1박스 23,900원" 등이 명시되어 있으면 이를 직접 사용
2. **댓글과 게시물 콘텐츠 매칭**: 댓글 "반박스" → 게시물에서 "반박스" 가격 찾기 → 해당 가격 사용
3. **유연한 키워드 매칭**: "반박스", "하프박스", "절반박스" 등 다양한 표현을 게시물 콘텐츠와 매칭
4. **가격 설정**: 
   - selectedOption: 게시물에서 찾은 옵션명 (예: "반박스")
   - unitPrice: 해당 옵션의 단가 (예: 12900)
   - totalPrice: 해당 옵션의 단가 그대로 사용 (예: 12900) ←← 🔥 절대 quantity를 곱하지 마세요!

**🔥 옵션 상품 가격 계산 핵심 규칙**:
- 옵션 상품(반박스, 1박스, 반통, 1통 등)에서는 **quantity는 항상 1**이고
- **unitPrice = totalPrice** (둘 다 동일한 값)
- 예: "반박스 12,900원" → quantity: 1, unitPrice: 12900, totalPrice: 12900

**실제 계산 예시**:
게시물 콘텐츠: "🍑 황도 복숭아 1박스 👉👉 23,900원 🍑 황도 복숭아 반박스 👉👉 12,900원"
- 댓글 "반박스" → 게시물에서 "반박스 👉👉 12,900원" 찾기 → selectedOption: "반박스", unitPrice: 12900, totalPrice: 12900
- 댓글 "1박스" → 게시물에서 "1박스 👉👉 23,900원" 찾기 → selectedOption: "1박스", unitPrice: 23900, totalPrice: 23900

**🔥🔥🔥 세트 상품 가격 계산 규칙 (중요!)**:
세트 상품(예: "흑미찰옥수수 1세트(5개) 3,500원", "파프리카 5개 11,900원")의 경우:

**1. 정확한 배수인 경우 - isAmbiguous: false**:
  - "10개"이고 "5개 11,900원" 옵션 → 5개 옵션 2개로 계산
    - quantity: 2, unitPrice: 11900, totalPrice: 23800
    - reason: "10개는 5개 옵션의 2배이므로 11,900원 × 2 = 23,800원"
    - isAmbiguous: false (명확한 계산)
    
**2. 정확한 배수가 아닌 경우 - 올림 처리**:
  - "8개"이고 "5개" 옵션만 → 2세트로 올림
    - quantity: 2, unitPrice: 11900, totalPrice: 23800
    - reason: "8개 주문, 5개 단위로만 판매하므로 2세트(10개)로 처리"
    - isAmbiguous: false (판매 단위가 명확함)

**🔥 일반 상품 가격 계산 예시**:
게시물: "우리밀 모닝빵 450g 4,500원"
- 댓글 "모닝2" → quantity: 2, unitPrice: 4500, totalPrice: 9000
- 댓글 "3개" → quantity: 3, unitPrice: 4500, totalPrice: 13500

❌ **절대 하지 말아야 할 것들**:
- 옵션 상품에서 quantity로 곱하기 (예: 12900 × 1 = 12900은 의미 없음)
- unitPrice나 totalPrice를 null로 설정하기
- 가격 정보 없이 주문으로 처리하기

🔥 **마지막 경고 - 절대 위반 금지**:
1. **reason에서 가격을 언급했다면, 반드시 unitPrice와 totalPrice 필드에도 그 가격을 설정하세요!**
   - 예: reason에서 "반박스 옵션(12,900원)"이라고 했으면 → unitPrice: 12900, totalPrice: 12900
2. **reason에서 옵션을 언급했다면, 반드시 selectedOption 필드에도 그 옵션을 설정하세요!**
   - 예: reason에서 "반박스 옵션"이라고 했으면 → selectedOption: "반박스"
3. **reason에서 세트 변환을 언급했다면, 반드시 변환된 세트 수로 quantity를 설정하세요!**
   - 예: reason에서 "10개 → 2세트로 변환"이라고 했으면 → quantity: 2
4. **null 값 절대 금지:**
   - unitPrice: null ❌ → unitPrice: 12900 ✅
   - totalPrice: null ❌ → totalPrice: 12900 ✅
   - selectedOption: null (옵션이 있는 경우) ❌ → selectedOption: "반박스" ✅

**반드시 기억하세요: reason에서 언급한 내용과 JSON 필드가 100% 일치해야 합니다!**

### **주문 데이터 형식 설명**
- **commentKey**: 댓글의 고유 식별자 (필수)
- **originalText**: 원본 댓글 내용 (필수)
- **isOrder**: 주문 여부 판단 (필수, boolean)
- **productItemNumber**: 매칭된 상품의 번호 (주문인 경우 필수)
- **productTitle**: 매칭된 상품명 (주문인 경우 필수)
- **quantity**: 주문 수량 (주문인 경우 필수, 기본값 1)
- **selectedOption**: 선택된 옵션 (복잡한 옵션 상품의 경우)
- **unitPrice**: 단가 (주문인 경우 필수, AI가 게시물에서 직접 추출)
- **totalPrice**: 총 가격 (주문인 경우 필수, AI가 직접 계산)
- **pickupDate**: 픽업/배송 날짜 (YYYY-MM-DD 형식, 없으면 null)
- **pickupTime**: 픽업/배송 시간 (HH:mm 형식, 없으면 null)
- **pickupType**: 수령 방식 ("픽업", "배송", "수령" 중 하나)
- **phoneNumber**: 댓글에서 추출한 전화번호 (없으면 null)
- **reason**: AI의 판단 근거 설명 (필수)
- **confidence**: 판단 신뢰도 (0.0~1.0, 1에 가까울수록 확실)
- **detectedKeywords**: 댓글에서 감지한 주요 키워드들

### **분석 지침**

1. **정확성 최우선**: 애매한 경우 isOrder: false로 처리하되, 숫자가 있으면 주문일 가능성 높음
2. **다중 상품 주문**: 한 댓글에 여러 상품이 있으면 각각 별도 객체로 생성
3. **기본값 설정**: 
   - quantity가 명시되지 않으면 1
   - pickupType이 명시되지 않으면 "수령"
   - pickupDate가 없으면 null (프론트엔드에서 처리)
4. **신뢰도 설정**:
   - 1.0: 매우 명확한 주문 (예: "김치 2개 주문합니다")
   - 0.8~0.9: 명확한 주문 (예: "김치2")
   - 0.6~0.7: 주문 가능성 높음 (예: "2")
   - 0.4~0.5: 애매함
   - 0.0~0.3: 주문 아닐 가능성 높음
5. **오타 처리**: "ㅣ대", "l개", "한통" 등은 반드시 주문으로 인식

이제 주어진 게시물과 댓글을 분석하여 정확한 주문 정보를 추출해주세요.`;

    const prompt = `
### 추가 검증 및 특이사항 메모:
- bandNumber: ${bandNumber}
- postId: ${postId}

위의 시스템 지시사항을 따라 게시물과 댓글을 분석하고, 정확한 JSON 형식으로 응답해주세요.`;

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
      logPrefix: "[AI 댓글 분석]",
    });

    const aiResponse = await response.json();
    
    // AI 응답 파싱
    const candidates = aiResponse.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("AI 응답에 candidates가 없습니다");
    }
    
    const content = candidates[0].content;
    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error("AI 응답 content가 비어있습니다");
    }
    
    const textContent = content.parts[0].text;
    if (!textContent) {
      throw new Error("AI 응답 텍스트가 없습니다");
    }
    
    // JSON 블록 추출 (```json ... ``` 형식) - 에러 처리 강화
    const jsonMatch = textContent.match(/```json\s*\n?([\s\S]*?)\n?```/);
    let parsedResponse;
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        // JSON 블록 내용 정리
        let cleanJson = jsonMatch[1].trim();
        
        // 불완전한 JSON 수정 시도
        // 1. 마지막 쉼표 제거
        cleanJson = cleanJson.replace(/,\s*([}\]])/g, '$1');
        
        // 2. 끝나지 않은 문자열 처리 (마지막 줄이 불완전한 경우)
        if (cleanJson.lastIndexOf('"') > cleanJson.lastIndexOf('"}')) {
          cleanJson = cleanJson.substring(0, cleanJson.lastIndexOf('"') + 1) + '"}]}';
        }
        
        parsedResponse = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error("[AI 댓글 분석] JSON 파싱 실패:", parseError.message);
        console.error("[AI 댓글 분석] 파싱 시도한 텍스트 (첫 500자):", jsonMatch[1].substring(0, 500));
        
        // 파싱 실패 시 빈 배열 반환
        return NextResponse.json({ 
          orders: [],
          error: `JSON 파싱 오류: ${parseError.message}` 
        });
      }
    } else {
      // JSON 블록이 없으면 전체 텍스트를 파싱 시도
      try {
        parsedResponse = JSON.parse(textContent);
      } catch (parseError) {
        console.error(
          "[AI 댓글 분석] 전체 텍스트 JSON 파싱 실패:",
          parseError.message
        );
        console.error("원본 텍스트:", textContent.substring(0, 200) + "...");
        throw new Error(`JSON 파싱 실패: ${parseError.message}`);
      }
    }
    
    // 응답 유효성 검사
    if (!parsedResponse.orders || !Array.isArray(parsedResponse.orders)) {
      console.error("[AI 댓글 분석] 잘못된 AI 응답 형식:", parsedResponse);
      return NextResponse.json({ orders: [] });
    }
    
    const orders = parsedResponse.orders.filter((order) => order.isOrder);
    
    // 후처리: pickupDate 파싱 및 postInfo 정보 추가
    const enhancedOrders = orders.map((order) => {
      try {
        const enhancedOrder = {
          ...order,
        };
        
        // pickupDate 파싱 - 간단히 날짜 형식만 확인
        if (order.pickupDate) {
          try {
            const parsedDate = new Date(order.pickupDate);
            if (!isNaN(parsedDate.getTime())) {
              enhancedOrder.pickupDate = parsedDate.toISOString();
            }
          } catch (e) {
            console.error("Date parsing error:", e);
          }
        }
        
        // postInfo 정보 추가
        enhancedOrder.bandNumber = bandNumber;
        enhancedOrder.postId = postId;
        enhancedOrder.postUrl = safePostInfo.postUrl || null;
        
        // AI가 가격을 계산하지 않은 경우에만 fallback 처리
        if (!order.unitPrice || !order.totalPrice) {
          // selectedOption이 있는 경우 priceOptions에서 가격 정보 추가
          if (order.selectedOption && order.productItemNumber) {
            const product = safePostInfo.products.find(
              (p) => p.itemNumber === order.productItemNumber
            );
            if (product && product.priceOptions) {
              const selectedOpt = product.priceOptions.find(
                (opt) => opt.description === order.selectedOption
              );
              if (selectedOpt) {
                enhancedOrder.unitPrice = selectedOpt.price;
                enhancedOrder.totalPrice =
                  selectedOpt.price * (order.quantity || 1);
              }
            }
          }
          
          // 그래도 가격이 없으면 base_price 사용
          if (!enhancedOrder.unitPrice && order.productItemNumber) {
            const product = safePostInfo.products.find(
              (p) => p.itemNumber === order.productItemNumber
            );
            if (product && product.basePrice) {
              enhancedOrder.unitPrice = product.basePrice;
              enhancedOrder.totalPrice =
                product.basePrice * (order.quantity || 1);
            }
          }
        }
        
        return enhancedOrder;
      } catch (error) {
        console.error(`[AI 후처리] 오류 발생:`, error);
        return order; // 오류 시 원본 반환
      }
    });
    
    return NextResponse.json({ 
      orders: enhancedOrders,
      summary: parsedResponse.summary 
    });
    
  } catch (error) {
    console.error("[AI 댓글 분석] AI 처리 중 심각한 오류 발생:", error.message);
    return NextResponse.json({ 
      error: error.message,
      orders: [] 
    }, { status: 500 });
  }
}
