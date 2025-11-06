// app/api/band/posts/route.js
import { NextResponse } from "next/server";
import supabase from "../../../lib/supabaseClient";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const bandKey = searchParams.get("bandKey");
    const afterPostId = searchParams.get("afterPostId");

    if (!userId || !bandKey) {
      return NextResponse.json(
        { error: "userId와 bandKey는 필수 파라미터입니다." },
        { status: 400 }
      );
    }

    // 1) Supabase에서 쿠키 조회
    const { data: user, error: supaError } = await supabase
      .from("users")
      .select("cookies")
      .eq("user_id", userId)
      .single();
    if (supaError || !user?.cookies) {
      return NextResponse.json(
        { error: supaError?.message || "쿠키가 존재하지 않습니다." },
        { status: 500 }
      );
    }

    // 2) band.us/ajax로 JSON 요청
    const params = new URLSearchParams({ bandKey, size: "50" });
    if (afterPostId) params.set("afterPostId", afterPostId);

    const externalRes = await fetch(
      `https://band.us/ajax/band/postList?${params.toString()}`,
      {
        headers: {
          Cookie: user.cookies,
          Referer: `https://band.us/band/${bandKey}/postList`,
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
      }
    );

    if (!externalRes.ok) {
      const text = await externalRes.text();
      console.error("[Band API 에러]", externalRes.status, text);
      return NextResponse.json(
        { error: `Band API 오류: ${externalRes.status}`, detail: text },
        { status: externalRes.status }
      );
    }

    // 3) JSON 파싱
    const json = await externalRes.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("[Unexpected Error in /api/band/posts]", err);
    return NextResponse.json(
      { error: "서버 내부 오류", detail: err.message },
      { status: 500 }
    );
  }
}
