import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search");
    const offset = (page - 1) * limit;

    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    // 검색 쿼리 빌더 함수
    const buildSearchQuery = (query) => {
      let searchQuery = query.eq("user_id", userId);

      if (search) {
        searchQuery = searchQuery.or(
          `title.ilike.%${search}%,content.ilike.%${search}%,author_name.ilike.%${search}%`
        );
      }

      return searchQuery;
    };

    // 전체 개수 조회 (검색 조건 포함)
    const { count, error: countError } = await buildSearchQuery(
      supabase.from("posts").select("*", { count: "exact", head: true })
    );

    if (countError) {
      console.error("Count query error:", countError);
      return Response.json({ error: "Failed to count posts" }, { status: 500 });
    }

    // 전체 통계 조회 (상품 게시물 수, 처리 완료 수) - 검색 조건 포함
    const { data: allPosts, error: allPostsError } = await buildSearchQuery(
      supabase.from("posts").select("is_product, ai_extraction_status")
    );

    if (allPostsError) {
      console.error("All posts query error:", allPostsError);
      return Response.json(
        { error: "Failed to fetch all posts stats" },
        { status: 500 }
      );
    }

    // 전체 통계 계산
    const totalProductPosts = allPosts.filter((post) => post.is_product).length;
    const totalCompletedPosts = allPosts.filter(
      (post) => post.ai_extraction_status === "completed"
    ).length;

    // 게시물 목록 조회 (연관 상품 정보 포함) - 검색 조건 포함
    const { data: posts, error: postsError } = await buildSearchQuery(
      supabase
        .from("posts")
        .select(
          `
          post_id,
          post_key,
          band_key,
          title,
          content,
          posted_at,
          crawled_at,
          comment_count,
          emotion_count,
          view_count,
          like_count,
          is_product,
          ai_extraction_status,
          ai_classification_result,
          band_post_url,
          products_data,
          image_urls,
          photos_data,
          latest_comments,
          author_name,
          author_profile,
          author_description,
          author_user_key,
          products:products(
            product_id,
            title,
            base_price,
            status,
            created_at
          )
        `
        )
        .order("posted_at", { ascending: false })
        .range(offset, offset + limit - 1)
    );

    if (postsError) {
      console.error("Posts query error:", postsError);
      return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
    }

    // 각 게시물에 상품 개수 추가
    const postsWithProductCount = posts.map((post) => ({
      ...post,
      product_count: post.products ? post.products.length : 0,
    }));

    const totalPages = Math.ceil(count / limit);

    return Response.json({
      posts: postsWithProductCount,
      totalCount: count,
      totalPages,
      currentPage: page,
      limit,
      // 전체 통계 추가
      totalStats: {
        totalPosts: count,
        totalProductPosts,
        totalCompletedPosts,
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
