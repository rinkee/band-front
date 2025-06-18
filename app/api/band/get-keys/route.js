import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return Response.json(
        {
          result_code: 0,
          result_data: { error_description: "userId가 필요합니다." },
        },
        { status: 400 }
      );
    }

    // 사용자의 현재 밴드 키 정보 조회
    const { data, error } = await supabase
      .from("users")
      .select("band_access_token, band_key")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("밴드 키 조회 오류:", error);
      return Response.json(
        {
          result_code: 0,
          result_data: {
            error_description: `데이터베이스 조회 오류: ${error.message}`,
          },
        },
        { status: 500 }
      );
    }

    if (!data) {
      return Response.json(
        {
          result_code: 0,
          result_data: { error_description: "사용자를 찾을 수 없습니다." },
        },
        { status: 404 }
      );
    }

    return Response.json({
      result_code: 1,
      result_data: {
        access_token: data.band_access_token || "",
        band_key: data.band_key || "",
      },
    });
  } catch (error) {
    console.error("밴드 키 조회 API 오류:", error);
    return Response.json(
      {
        result_code: 0,
        result_data: { error_description: `서버 오류: ${error.message}` },
      },
      { status: 500 }
    );
  }
}
