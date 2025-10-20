import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // 클라이언트에서 전달받은 파라미터들
    const accessToken = searchParams.get("access_token");
    const bandKey = searchParams.get("band_key");
    const postKey = searchParams.get("post_key");
    const sort = searchParams.get("sort") || "-created_at";

    // 필수 파라미터 검증
    if (!accessToken || !bandKey || !postKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required parameters: access_token, band_key, post_key",
        },
        { status: 400 }
      );
    }

    // BAND API에 요청할 URL 구성
    const bandApiUrl = new URL("https://openapi.band.us/v2/band/post/comments");
    bandApiUrl.searchParams.append("access_token", accessToken);
    bandApiUrl.searchParams.append("band_key", bandKey);
    bandApiUrl.searchParams.append("post_key", postKey);
    bandApiUrl.searchParams.append("sort", sort);

    // 추가 파라미터가 있다면 포함 (페이징 등)
    const additionalParams = ["limit", "after", "before"];
    additionalParams.forEach((param) => {
      const value = searchParams.get(param);
      if (value) {
        bandApiUrl.searchParams.append(param, value);
      }
    });

    console.log("Fetching comments from BAND API:", bandApiUrl.toString());

    // BAND API 호출
    const response = await fetch(bandApiUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PODER-Web-App/1.0",
      },
    });

    console.log(
      "BAND API response status:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      console.error(
        "BAND API response error:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        {
          success: false,
          message: `BAND API error: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("BAND API full response:", JSON.stringify(data, null, 2));

    // BAND API 응답 구조 확인 및 에러 처리
    if (data.result_code !== 1) {
      console.error("BAND API result error:", data.result_message || data);
      return NextResponse.json(
        {
          success: false,
          message: data.result_message || "BAND API returned an error",
          debug: data, // 디버깅을 위해 전체 응답 포함
        },
        { status: 400 }
      );
    }

    // 성공적인 응답 반환
    return NextResponse.json({
      success: true,
      data: data.result_data || {},
      message: "Comments fetched successfully",
    });
  } catch (error) {
    console.error("Comments API proxy error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error while fetching comments",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
