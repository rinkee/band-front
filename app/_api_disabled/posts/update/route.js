import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "사용자 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 사용자 정보 조회
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("band_access_token, band_key")
      .eq("user_id", userId)
      .single();

    if (userError || !userData) {
      console.error("사용자 정보 조회 오류:", userError);
      return NextResponse.json(
        { success: false, message: "사용자 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const { band_access_token, band_key } = userData;

    if (!band_access_token || !band_key) {
      return NextResponse.json(
        { success: false, message: "밴드 연동 정보가 없습니다." },
        { status: 400 }
      );
    }

    console.log(`게시물 업데이트 시작 - Band Key: ${band_key}`);

    // BAND API에서 게시물 가져오기
    const bandApiUrl = `https://openapi.band.us/v2/band/posts?access_token=${band_access_token}&band_key=${band_key}&locale=ko_KR`;

    console.log(
      "BAND API 호출:",
      bandApiUrl.replace(band_access_token, "TOKEN_HIDDEN")
    );

    const bandResponse = await fetch(bandApiUrl);
    const bandResult = await bandResponse.json();

    if (bandResult.result_code !== 1) {
      console.error("BAND API 오류:", bandResult);
      return NextResponse.json(
        { success: false, message: "밴드 게시물을 가져올 수 없습니다." },
        { status: 500 }
      );
    }

    const bandPosts = bandResult.result_data.items || [];
    console.log(`BAND API에서 ${bandPosts.length}개 게시물 조회됨`);

    if (bandPosts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "새로운 게시물이 없습니다.",
        data: { newPosts: 0, totalPosts: 0 },
      });
    }

    // DB에 이미 있는 post_key들 조회
    const bandPostKeys = bandPosts.map((post) => post.post_key);
    const { data: existingPosts, error: existingError } = await supabase
      .from("posts")
      .select("post_key")
      .eq("band_key", band_key)
      .in("post_key", bandPostKeys);

    if (existingError) {
      console.error("기존 게시물 조회 오류:", existingError);
      return NextResponse.json(
        { success: false, message: "기존 게시물 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    const existingPostKeys = new Set(
      existingPosts.map((post) => post.post_key)
    );
    const newPosts = bandPosts.filter(
      (post) => !existingPostKeys.has(post.post_key)
    );

    console.log(`${newPosts.length}개의 새로운 게시물 발견`);

    if (newPosts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "새로운 게시물이 없습니다.",
        data: { newPosts: 0, totalPosts: bandPosts.length },
      });
    }

    // 새로운 게시물들을 DB 형식으로 변환
    const postsToInsert = newPosts.map((post) => {
      // epoch time을 ISO string으로 변환
      const postedAt = new Date(post.created_at).toISOString();

      // 이미지 URL들 추출
      const imageUrls = post.photos
        ? post.photos.map((photo) => photo.url)
        : [];

      // 제목 생성 (content의 첫 50자)
      const title = post.content
        ? post.content.substring(0, 50).replace(/<[^>]*>/g, "")
        : "";

      // 최근 댓글 데이터 처리
      const latestComments = post.latest_comments || [];
      console.log(
        `게시물 ${post.post_key}: ${latestComments.length}개 최근 댓글`
      );

      return {
        post_id: `${band_key}_${post.post_key}`,
        post_key: post.post_key,
        band_key: band_key,
        user_id: userId,
        title: title,
        content: post.content || "",
        author_name: post.author?.name || "",
        author_description: post.author?.description || "",
        author_profile: post.author?.profile_image_url || "",
        author_user_key: post.author?.user_key || "",
        comment_count: post.comment_count || 0,
        emotion_count: post.emotion_count || 0,
        posted_at: postedAt,
        crawled_at: new Date().toISOString(),
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        photos_data: post.photos || null,
        latest_comments: latestComments.length > 0 ? latestComments : null,
        band_post_url: `https://band.us/band/${band_key}/post/${post.post_key}`,
        status: "active",
        is_product: false, // 상품 분석은 나중에
        ai_extraction_status: null,
      };
    });

    // DB에 새로운 게시물들 저장
    const { data: insertedPosts, error: insertError } = await supabase
      .from("posts")
      .insert(postsToInsert)
      .select();

    if (insertError) {
      console.error("게시물 저장 오류:", insertError);
      return NextResponse.json(
        {
          success: false,
          message: "게시물 저장에 실패했습니다.",
          error: insertError,
        },
        { status: 500 }
      );
    }

    console.log(`${insertedPosts.length}개 새로운 게시물 저장 완료`);

    return NextResponse.json({
      success: true,
      message: `${insertedPosts.length}개의 새로운 게시물을 저장했습니다.`,
      data: {
        newPosts: insertedPosts.length,
        totalPosts: bandPosts.length,
        savedPosts: insertedPosts.map((post) => ({
          post_key: post.post_key,
          title: post.title,
          author_name: post.author_name,
          posted_at: post.posted_at,
        })),
      },
    });
  } catch (error) {
    console.error("게시물 업데이트 오류:", error);
    return NextResponse.json(
      { success: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
