import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request, { params }) {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    if (!postId) {
      return Response.json({ error: "postId is required" }, { status: 400 });
    }

    // 1. 게시물 정보 조회
    const { data: post, error: postError } = await supabase
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
        author_user_key
      `
      )
      .eq("user_id", userId)
      .eq("post_id", postId)
      .single();

    if (postError || !post) {
      console.error("Post query error:", postError);
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // 2. 관련 상품들 조회
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(
        `
        product_id,
        title,
        content,
        base_price,
        status,
        pickup_date,
        quantity_text,
        price_options,
        barcode,
        barcode_options,
        created_at,
        updated_at
      `
      )
      .eq("user_id", userId)
      .eq("post_key", post.post_key);

    if (productsError) {
      console.error("Products query error:", productsError);
    }

    // 3. 관련 주문들 조회 (조인 없이 먼저 테스트)
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        `
        order_id,
        product_id,
        customer_id,
        quantity,
        price_per_unit,
        total_amount,
        status,
        ordered_at,
        processing_method,
        comment_key,
        comment,
        created_at
      `
      )
      .eq("user_id", userId)
      .eq("post_key", post.post_key)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Orders query error:", ordersError);
    }

    // 4. 댓글들은 posts.latest_comments에서 가져옴
    const comments = post.latest_comments || [];

    // 5. 통계 계산
    const totalOrders = orders?.length || 0;
    const totalRevenue =
      orders?.reduce(
        (sum, order) => sum + (parseFloat(order.total_amount) || 0),
        0
      ) || 0;
    const totalQuantity =
      orders?.reduce((sum, order) => sum + (order.quantity || 0), 0) || 0;

    const ordersByStatus =
      orders?.reduce((acc, order) => {
        const status = order.status || "pending";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {};

    const ordersByProduct =
      products?.map((product) => {
        const productOrders =
          orders?.filter((order) => order.product_id === product.product_id) ||
          [];
        const productRevenue = productOrders.reduce(
          (sum, order) => sum + (parseFloat(order.total_amount) || 0),
          0
        );
        const productQuantity = productOrders.reduce(
          (sum, order) => sum + (order.quantity || 0),
          0
        );

        return {
          ...product,
          orders: productOrders,
          total_orders: productOrders.length,
          total_revenue: productRevenue,
          total_quantity: productQuantity,
        };
      }) || [];

    const result = {
      post,
      products: ordersByProduct,
      orders: orders || [],
      comments: comments || [],
      statistics: {
        total_products: products?.length || 0,
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_quantity: totalQuantity,
        total_comments: comments?.length || 0,
        orders_by_status: ordersByStatus,
        processing_methods: {
          pattern:
            orders?.filter((o) => o.processing_method === "pattern").length ||
            0,
          ai: orders?.filter((o) => o.processing_method === "ai").length || 0,
          manual:
            orders?.filter((o) => o.processing_method === "manual").length || 0,
        },
      },
    };

    return Response.json(result);
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
