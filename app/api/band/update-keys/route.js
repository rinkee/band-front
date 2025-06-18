import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
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

    const body = await request.json();
    const { accessToken, bandKey } = body;

    if (!accessToken || !bandKey) {
      return Response.json(
        {
          result_code: 0,
          result_data: {
            error_description: "accessToken과 bandKey가 필요합니다.",
          },
        },
        { status: 400 }
      );
    }

    // 사용자의 밴드 키 업데이트
    const { error } = await supabase
      .from("users")
      .update({
        band_access_token: accessToken,
        band_key: bandKey,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("밴드 키 업데이트 오류:", error);
      return Response.json(
        {
          result_code: 0,
          result_data: {
            error_description: `데이터베이스 업데이트 오류: ${error.message}`,
          },
        },
        { status: 500 }
      );
    }

    return Response.json({
      result_code: 1,
      result_data: {
        message: "밴드 키가 성공적으로 업데이트되었습니다.",
        updated_keys: {
          access_token: accessToken,
          band_key: bandKey,
        },
      },
    });
  } catch (error) {
    console.error("밴드 키 업데이트 API 오류:", error);
    return Response.json(
      {
        result_code: 0,
        result_data: { error_description: `서버 오류: ${error.message}` },
      },
      { status: 500 }
    );
  }
}
