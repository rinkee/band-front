// app/api/auth/register/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  clearAuthFailure,
  evaluateAuthGuards,
  getClientIp,
  registerAuthFailure,
} from "../_lib/bruteForceGuard";

// Supabase Edge Function URL 설정
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 회원가입 처리 API (프록시)
 * - 프론트에서 전달한 가입 정보를 Supabase Edge Function으로 전달합니다.
 * - 항상 JSON으로 응답을 반환합니다.
 */
export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const ipGuard = evaluateAuthGuards({
      routeId: "register",
      clientIp,
      accountId: "",
    });
    if (!ipGuard.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          retryAfterSeconds: ipGuard.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, ipGuard.retryAfterSeconds || 1)),
          },
        }
      );
    }

    const body = await request.json();
    const {
      naverId,
      naverPassword,
      loginId,
      loginPassword = "0000", // 기본 비밀번호
      bandUrl,
      bandAccessToken,
      bandKey,
      storeName,
      storeAddress,
      ownerName,
      phoneNumber,
      order_processing_mode,
      orderProcessingMode,
    } = body;

    const accountGuard = evaluateAuthGuards({
      routeId: "register",
      clientIp,
      accountId: loginId,
    });
    if (!accountGuard.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
          retryAfterSeconds: accountGuard.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, accountGuard.retryAfterSeconds || 1)
            ),
          },
        }
      );
    }

    // 필수 필드 검증
    if (!loginId || !loginPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "아이디와 비밀번호는 필수 입력 항목입니다.",
        },
        { status: 400 }
      );
    }

    // 밴드 URL 유효성 검증 (있으면 검사)
    if (bandUrl) {
      if (!bandUrl.includes("band.us") && !bandUrl.includes("band.com")) {
        return NextResponse.json(
          { success: false, message: "유효한 밴드 URL이 아닙니다." },
          { status: 400 }
        );
      }
    }

    // 네이버 아이디가 있는데 비밀번호가 없는 경우 확인
    if (naverId && !naverPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "네이버 아이디가 입력된 경우 비밀번호도 필수입니다.",
        },
        { status: 400 }
      );
    }

    // 환경 변수 체크
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        {
          success: false,
          message:
            "서버 설정이 완료되지 않았습니다. SUPABASE URL/ANON KEY를 확인해주세요.",
        },
        { status: 500 }
      );
    }

    const payload = {
      naverId,
      naverPassword,
      loginId,
      loginPassword,
      bandUrl,
      bandAccessToken,
      bandKey,
      storeName,
      storeAddress,
      ownerName: ownerName || loginId,
      phoneNumber: phoneNumber || "",
      // 주문 처리 모드(raw/legacy) - 호환 키 모두 전송
      order_processing_mode:
        order_processing_mode || orderProcessingMode || "legacy",
      orderProcessingMode:
        orderProcessingMode || order_processing_mode || "legacy",
    };

    // Supabase Edge Function 호출
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/auth-register`;
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // 응답 JSON 파싱
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status < 500) {
        registerAuthFailure({
          routeId: "register",
          clientIp,
          accountId: loginId,
        });
      }
      return NextResponse.json(
        {
          success: false,
          message: data?.message || "회원가입에 실패했습니다.",
          status: response.status,
          raw: data,
        },
        { status: response.status }
      );
    }

    clearAuthFailure({
      routeId: "register",
      clientIp,
      accountId: loginId,
    });

    // 백엔드가 값을 저장하지 않는 경우를 대비해 보정 업데이트
    try {
      const targetMode =
        order_processing_mode || orderProcessingMode || "legacy";
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL || SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (supabaseAdmin) {
        await supabaseAdmin
          .from("users")
          .update({
            order_processing_mode: targetMode,
            orderProcessingMode: targetMode,
          })
          .eq("login_id", loginId);
      }
    } catch (e) {
      console.warn("order_processing_mode 보정 업데이트 실패:", e?.message || e);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("회원가입 처리 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: "회원가입 처리 중 오류가 발생했습니다.",
        error: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}
