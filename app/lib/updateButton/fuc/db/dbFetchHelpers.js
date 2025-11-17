/**
 * DB 조회 헬퍼 함수들
 * backend/supabase/functions/band-get-posts-a/index.ts에서 이식
 */

/**
 * 함수명: fetchProductMapForPost
 * 목적: 특정 게시물의 상품 정보를 DB에서 조회하여 Map으로 반환
 * 사용처: 댓글에서 주문 생성 시 상품 매칭
 * 의존성: Supabase 클라이언트
 * 파라미터:
 *   - supabase: Supabase 클라이언트 인스턴스
 *   - userId: 사용자 ID
 *   - postKey: 게시물 키
 * 리턴값: Map<itemNumber, productData> - 상품 번호를 키로 하는 상품 정보 Map
 */
export async function fetchProductMapForPost(supabase, userId, postKey) {
  // console.log(`[fetchProductMap] Start for post ${postKey}`);
  const productMap = new Map();

  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("product_id, base_price, price_options, item_number, title, quantity_text")
      .eq("user_id", userId)
      .eq("post_key", postKey);

    if (error) {
      console.error(`[fetchProductMap] DB Error for post ${postKey}: ${error.message}`);
      throw error; // 오류 발생 시 상위로 전파
    }

    // console.log(
    //   `[fetchProductMap] Fetched ${products?.length ?? 0} products for post ${postKey}`
    // );

    if (products && products.length > 0) {
      products.forEach((p) => {
        const itemNumKey = typeof p.item_number === "number" && p.item_number > 0
          ? p.item_number
          : 1;

        if (p.product_id) {
          productMap.set(itemNumKey, {
            // 필요한 데이터만 Map에 저장
            product_id: p.product_id,
            base_price: p.base_price,
            price_options: p.price_options || [],
            title: p.title,
            quantity_text: p.quantity_text,
            item_number: itemNumKey,
            itemNumber: itemNumKey // 🔥 Enhanced Pattern Matcher 호환성
          });
        } else {
          console.warn(
            `[fetchProductMap] Product missing product_id for post ${postKey}, item_number ${itemNumKey}`
          );
        }
      });
    }
  } catch (e) {
    console.error(`[fetchProductMap] Exception for post ${postKey}: ${e.message}`, e.stack);
    throw e; // 에러 재전파
  }

  // console.log(
  //   `[fetchProductMap] End for post ${postKey}, map size: ${productMap.size}`
  // );

  return productMap;
}
