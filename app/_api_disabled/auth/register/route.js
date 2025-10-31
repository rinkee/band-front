// api/auth/register/route.js
import { NextResponse } from "next/server";

// Supabase Edge Function URL 설정
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 회원가입 처리 API
 * @param {Request} request - 요청 객체
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      naverId,
      naverPassword,
      loginId,
      loginPassword = "0000", // 추가: 로그인 비밀번호
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

    // 밴드 URL이 있는 경우에만 유효성 검증
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

    console.log("회원가입 요청:", {
      loginId,
      naverId,
      bandUrl,
      bandAccessToken: bandAccessToken ? "***제공됨***" : "없음",
      bandKey: bandKey ? "***제공됨***" : "없음",
      storeName,
      storeAddress,
      ownerName,
      phoneNumber,
    });

    // Supabase Edge Function 호출
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/auth-register`;
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
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
        // 주문 처리 모드 전달 (raw/legacy)
        order_processing_mode:
          order_processing_mode || orderProcessingMode || "legacy",
        orderProcessingMode:
          orderProcessingMode || order_processing_mode || "legacy",
      }),
    });

    const data = await response.json();
    console.log("회원가입 응답:", data);

    if (!response.ok) {
      throw new Error(data.message || "회원가입에 실패했습니다.");
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("회원가입 처리 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: "회원가입 처리 중 오류가 발생했습니다.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
