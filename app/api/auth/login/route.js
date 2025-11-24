// app/api/auth/login/route.js

import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  try {
    const { loginId, loginPassword } = await request.json();

    if (!loginId || !loginPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "아이디와 비밀번호를 입력해주세요.",
        },
        { status: 400 }
      );
    }

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

    const endpoint = `${SUPABASE_URL}/functions/v1/auth-login`;

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ loginId, loginPassword }),
      });
    } catch (err) {
      console.error("Supabase auth-login 호출 실패:", err);
      return NextResponse.json(
        {
          success: false,
          message: "로그인 서버에 연결할 수 없습니다.",
        },
        { status: 502 }
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      console.error("Supabase auth-login 응답 파싱 실패:", err);
      return NextResponse.json(
        {
          success: false,
          message: "로그인 응답을 해석하지 못했습니다.",
        },
        { status: 502 }
      );
    }

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          message: data?.message || data?.error || "아이디 또는 비밀번호가 올바르지 않습니다.",
        },
        { status: response.status || 401 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("로그인 처리 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: "로그인 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

