// api/auth/register/route.js
import { NextResponse } from "next/server";

// API 기본 URL 설정
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8080/api"
    : process.env.BACKEND_API_URL;

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
      storeName,
      storeAddress,
      ownerName,
      phoneNumber,
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
      storeName,
      storeAddress,
      ownerName,
      phoneNumber,
    });

    // 서버 API 호출
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        naverId,
        naverPassword,
        loginId,
        loginPassword,
        bandUrl,
        storeName,
        storeAddress,
        ownerName: ownerName || loginId,
        phoneNumber: phoneNumber || "",
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
