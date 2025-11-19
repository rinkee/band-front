import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const createServiceSupabaseClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin credentials are not configured");
  }

  return createClient(url, key);
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
    console.log('[PATCH API] 시작', { params });
    const { orderId } = await params;
    console.log('[PATCH API] orderId:', orderId);
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "order_id는 필수입니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "업데이트할 데이터가 필요합니다." },
        { status: 400 }
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

    console.log('[PATCH API] Supabase 조회 시작', { orderId });
    // 기존 주문 정보 조회 (총액 계산에 필요)
    const {
      data: existingOrder,
      error: fetchError,
      status: fetchStatus,
    } = await supabase
      .from("orders")
      .select("quantity, price")
      .eq("order_id", orderId)
      .single();

    console.log('[PATCH API] Supabase 조회 결과', {
      existingOrder,
      fetchError,
      fetchStatus
    });

    if (fetchError) {
      if (fetchStatus === 406 || fetchError.code === "PGRST116") {
        return NextResponse.json(
          { success: false, message: "해당 주문을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      console.error("주문 조회 실패:", {
        orderId,
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
      .eq("order_id", orderId)
      .select()
      .single();

    if (error) {
      console.error("주문 업데이트 실패:", error);
      return NextResponse.json(
        { success: false, message: "주문 업데이트에 실패했습니다.", error },
        { status: 500 }
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
