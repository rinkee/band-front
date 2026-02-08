import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const createServiceSupabaseClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin credentials are not configured");
  }

  return createClient(url, key);
};

const parseAuthUserId = (request) => {
  const authHeader = request.headers.get("authorization") || "";
  const headerUserId = (request.headers.get("x-user-id") || "").trim();

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "인증 헤더가 필요합니다." };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, message: "유효하지 않은 인증 토큰입니다." };
  }

  if (!headerUserId) {
    return { ok: false, status: 401, message: "x-user-id 헤더가 필요합니다." };
  }

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(headerUserId)) {
    return { ok: false, status: 403, message: "유효하지 않은 사용자 식별자입니다." };
  }

  // 현재 클라이언트 호환을 위한 최소 인증 규칙.
  if (token !== headerUserId) {
    return { ok: false, status: 403, message: "인증 정보가 사용자 식별자와 일치하지 않습니다." };
  }

  return { ok: true, userId: headerUserId };
};

const parseJsonBody = async (request) => {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 400, message: "업데이트할 데이터가 필요합니다." };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, message: "유효하지 않은 JSON 본문입니다." };
  }
};

const toValidInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
};

const toValidNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export async function PATCH(request, { params }) {
  try {
    const auth = parseAuthUserId(request);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, message: auth.message },
        { status: auth.status }
      );
    }

    const { orderId } = await params;
    const normalizedOrderId =
      typeof orderId === "string" || typeof orderId === "number"
        ? String(orderId).trim()
        : "";

    if (!normalizedOrderId) {
      return NextResponse.json(
        { success: false, message: "order_id는 필수입니다." },
        { status: 400 }
      );
    }

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, message: parsedBody.message },
        { status: parsedBody.status }
      );
    }
    const body = parsedBody.body;

    const bodyUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (bodyUserId && bodyUserId !== auth.userId) {
      return NextResponse.json(
        { success: false, message: "요청 본문의 userId와 인증 사용자 정보가 일치하지 않습니다." },
        { status: 403 }
      );
    }

    const hasUpdatableField =
      "product_id" in body ||
      "product_name" in body ||
      "quantity" in body ||
      "product_price" in body ||
      "memo" in body;

    if (!hasUpdatableField) {
      return NextResponse.json(
        {
          success: false,
          message: "수정 가능한 필드를 포함해야 합니다.",
        },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabaseClient();

    // 기존 주문 정보 조회 (총액 계산/소유권 검증에 필요)
    const {
      data: existingOrder,
      error: fetchError,
    } = await supabase
      .from("orders")
      .select("quantity, price")
      .eq("order_id", normalizedOrderId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (fetchError) {
      console.error("주문 조회 실패:", {
        orderId: normalizedOrderId,
        userId: auth.userId,
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint
      });
      return NextResponse.json(
        {
          success: false,
          message: "주문 조회 중 오류가 발생했습니다.",
          error: fetchError.message,
          code: fetchError.code
        },
        { status: 500 }
      );
    }

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, message: "해당 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };

    let quantityForTotal = existingOrder?.quantity ?? null;
    let priceForTotal = existingOrder?.price ?? null;

    if ("product_id" in body) {
      updatePayload.product_id = body.product_id || null;
    }

    if ("product_name" in body) {
      updatePayload.product_name = body.product_name || null;
    }

    if ("quantity" in body) {
      const parsedQuantity = toValidInteger(body.quantity);
      if (parsedQuantity === null || parsedQuantity <= 0) {
        return NextResponse.json(
          {
            success: false,
            message: "수량은 1 이상의 정수여야 합니다.",
          },
          { status: 400 }
        );
      }
      updatePayload.quantity = parsedQuantity;
      quantityForTotal = parsedQuantity;
    }

    if ("product_price" in body) {
      const parsedPrice = toValidNumber(body.product_price);
      if (parsedPrice === null || parsedPrice < 0) {
        return NextResponse.json(
          {
            success: false,
            message: "상품 가격은 0 이상이어야 합니다.",
          },
          { status: 400 }
        );
      }
      updatePayload.price = parsedPrice;
      priceForTotal = parsedPrice;
    }

    // memo 필드는 테이블에 컬럼이 있을 때만 업데이트
    if ("memo" in body) {
      try {
        updatePayload.memo = body.memo || null;
      } catch (e) {
        // memo 컬럼이 없어도 계속 진행
        console.warn("memo 필드 업데이트 실패 (컬럼이 없을 수 있음):", e);
      }
    }

    if (
      quantityForTotal !== null &&
      priceForTotal !== null &&
      Number.isFinite(quantityForTotal) &&
      Number.isFinite(priceForTotal)
    ) {
      updatePayload.total_amount = Number(priceForTotal) * Number(quantityForTotal);
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("order_id", normalizedOrderId)
      .eq("user_id", auth.userId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("주문 업데이트 실패:", error);
      return NextResponse.json(
        { success: false, message: "주문 업데이트에 실패했습니다.", error },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, message: "해당 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("주문 업데이트 처리 오류:", error);
    return NextResponse.json(
      { success: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
