import { NextResponse } from "next/server";
import supabase from "../../../lib/supabaseClient";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId는 필수 파라미터입니다." },
        { status: 400 }
      );
    }

    // 1) Supabase에서 band_access_token 조회
    const { data: user, error: supaError } = await supabase
      .from("users")
      .select("band_access_token")
      .eq("user_id", userId)
      .single();

    if (supaError || !user?.band_access_token) {
      return NextResponse.json(
        {
          error:
            supaError?.message || "Band Access Token이 설정되지 않았습니다.",
          detail: "Band API 인증 정보가 없습니다.",
        },
        { status: 400 }
      );
    }

    // 2) Band Open API 호출
    const bandApiUrl = `https://openapi.band.us/v2.1/bands?access_token=${user.band_access_token}`;

    const response = await fetch(bandApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; BandAPIClient/1.0)",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Band Bands API 에러]", response.status, errorText);
      return NextResponse.json(
        {
          error: `Band API 오류: ${response.status}`,
          detail: errorText,
        },
        { status: response.status }
      );
    }

    // 3) JSON 파싱 및 응답
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Band Bands API 처리 오류]", error);
    return NextResponse.json(
      {
        error: "서버 내부 오류",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
