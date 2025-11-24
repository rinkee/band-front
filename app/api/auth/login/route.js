// api/auth/login/route.js

import { NextResponse } from "next/server";

// API 기본 URL 설정
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8080/api"
    : process.env.BACKEND_API_URL;

/**
 * 로그인 처리 API
 * @param {Request} request - 요청 객체
 */
export async function POST(request) {
  try {
    const { loginId, loginPassword } = await request.json();

    // 필수 필드 검증
    if (!loginId || !loginPassword) {
      return NextResponse.json(
        { success: false, message: "아이디와 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    console.log("로그인 요청:", { loginId });

    // Supabase 직접 연결하여 사용자 정보 조회
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 사용자 정보 조회
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("login_id", loginId)
      .single();

    if (userError || !userData) {
      console.warn(`로그인 실패: 사용자 없음 - loginId: ${loginId}`);
      return NextResponse.json(
        { success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    // 계정 활성화 상태 확인
    if (userData.is_active === false) {
      console.warn(`로그인 실패: 비활성화된 계정 - loginId: ${loginId}`);
      return NextResponse.json(
        { success: false, message: "비활성화된 계정입니다. 관리자에게 문의해주세요." },
        { status: 403 }
      );
    }

    // 비밀번호 검증
    if (userData.login_password !== loginPassword) {
      console.warn(`로그인 실패: 비밀번호 불일치 - loginId: ${loginId}`);
      return NextResponse.json(
        { success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    // 서버 API 호출 (기존 로직 유지 - 토큰 생성 등을 위해)
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        loginId,
        loginPassword,
      }),
      credentials: "include",
    });

    const data = await response.json();
    console.log("로그인 응답 상태:", response.status);
    console.log(
      "로그인 응답 헤더:",
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      console.error("로그인 실패:", data);
      // 서버에서 받은 에러 메시지를 그대로 클라이언트에 전달
      return NextResponse.json(
        { success: false, message: data.message || "로그인에 실패했습니다." },
        { status: response.status }
      );
    }

    // 응답 데이터 구조 확인
    if (data.success && data.data) {
      const userData = data.data;

      console.log("로그인 성공 - 사용자 정보:", {
        userId: userData.userId,
        loginId: userData.loginId,
        storeName: userData.storeName,
        role: userData.role,
        isActive: userData.isActive,
        token: userData.token,
      });

      // 클라이언트에 모든 데이터 반환
      return NextResponse.json(data);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("로그인 처리 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "로그인 처리 중 오류가 발생했습니다.",
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
