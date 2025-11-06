export async function POST(request) {
  try {
    const { userId, postKey } = await request.json();

    if (!userId || !postKey) {
      return Response.json(
        {
          success: false,
          message: "userId와 postKey가 필요합니다.",
        },
        { status: 400 }
      );
    }

    // band-get-posts-postkey Edge Function 호출
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/band-get-posts-postkey`;

    const response = await fetch(
      `${edgeFunctionUrl}?userId=${userId}&post_key=${postKey}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Edge Function error:", result);
      return Response.json(
        {
          success: false,
          message: result.message || "Edge Function 호출 실패",
        },
        { status: response.status }
      );
    }

    return Response.json({
      success: true,
      message: "게시물 처리가 완료되었습니다.",
      data: result.data,
    });
  } catch (error) {
    console.error("Process API error:", error);
    return Response.json(
      {
        success: false,
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
