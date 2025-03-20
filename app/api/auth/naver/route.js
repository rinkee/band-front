// api/naver/routes.js

import { NextResponse } from "next/server";

/**
 * 네이버 로그인 처리 API
 * @param {Request} request - 요청 객체
 */
export async function POST(request) {
  try {
    const { userId, bandId } = await request.json();

    // 필수 필드 검증
    if (!userId || !bandId) {
      return NextResponse.json(
        {
          success: false,
          message: "사용자 ID와 밴드 ID가 필요합니다.",
        },
        { status: 400 }
      );
    }

    console.log("네이버 로그인 요청:", { userId, bandId });

    // 서버 API 호출 - 백엔드에서 userId를 통해 네이버 계정 정보를 조회함
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/naver/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          bandId,
        }),
      }
    );

    const data = await response.json();
    console.log("네이버 로그인 응답 상태:", response.status);

    if (!response.ok) {
      console.error("네이버 로그인 실패:", data.message);
      // 서버에서 받은 에러 메시지를 그대로 클라이언트에 전달
      return NextResponse.json(
        {
          success: false,
          message: data.message || "네이버 로그인에 실패했습니다.",
        },
        { status: response.status }
      );
    }

    // 응답 데이터 반환
    return NextResponse.json(data);
  } catch (error) {
    console.error("네이버 로그인 처리 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "네이버 로그인 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

// GET 메소드 등 다른 HTTP 메소드에 대한 응답
export async function GET() {
  return NextResponse.json(
    { success: false, message: "허용되지 않는 메소드입니다." },
    { status: 405 }
  );
}
