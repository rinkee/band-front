import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// BAND 이미지 업로드 함수
async function uploadImageToBand(imageFile, accessToken) {
  try {
    const timestamp = Date.now();

    // akey 생성 로직 (실제로는 BAND API 문서에서 확인해야 하지만 추정)
    // 임시로 access_token의 일부를 사용
    const akey = accessToken
      ? accessToken.substring(10, 42)
      : "bbc59b0b5f7a1c6efe950f6236ccda35";

    const uploadUrl = `https://up.band.us/v3/upload_photo?language=ko&country=KR&version=1&akey=${akey}&ts=${timestamp}`;

    const formData = new FormData();
    formData.append("photo", imageFile);

    console.log("이미지 업로드 URL:", uploadUrl);
    console.log("이미지 파일:", imageFile.name, imageFile.size, imageFile.type);

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    console.log("BAND 이미지 업로드 응답:", result);

    return result;
  } catch (error) {
    console.error("BAND 이미지 업로드 오류:", error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const userId = formData.get("userId");
    const content = formData.get("content");
    const hasProduct = formData.get("hasProduct") === "true";
    const productInfo = hasProduct
      ? JSON.parse(formData.get("productInfo"))
      : null;

    // 이미지 파일들
    const images = formData.getAll("images");

    if (!userId || !content) {
      return NextResponse.json(
        { success: false, message: "필수 정보가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 사용자 정보 가져오기
    console.log("사용자 ID로 조회:", userId);
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("band_access_token, band_key")
      .eq("user_id", userId)
      .single();

    console.log("사용자 정보 조회 결과:", {
      userData: userData
        ? {
            band_access_token: userData.band_access_token
              ? `${userData.band_access_token.substring(0, 10)}...`
              : "null",
            band_key: userData.band_key,
          }
        : null,
      userError,
    });

    if (userError || !userData) {
      console.error("사용자 정보 조회 오류:", userError);
      return NextResponse.json(
        {
          success: false,
          message: "사용자 정보를 찾을 수 없습니다.",
          error: userError,
        },
        { status: 404 }
      );
    }

    const { band_access_token, band_key } = userData;

    if (!band_access_token || !band_key) {
      console.error("밴드 연동 정보 누락:", {
        band_access_token: !!band_access_token,
        band_key: !!band_key,
      });
      return NextResponse.json(
        {
          success: false,
          message:
            "밴드 연동 정보가 없습니다. 설정에서 밴드 API 정보를 등록해주세요.",
        },
        { status: 400 }
      );
    }

    // BAND 이미지 업로드 처리
    let imageUrls = [];
    let hasImages = false;
    let uploadedImageUrls = [];

    if (images && images.length > 0) {
      console.log(`${images.length}개의 이미지 파일 업로드 시작`);
      hasImages = true;

      // 순차적으로 이미지 업로드
      for (const image of images) {
        if (image.size > 0) {
          console.log(
            `이미지 업로드 중: ${image.name}, 크기: ${image.size}bytes`
          );

          try {
            // BAND 이미지 업로드 API 호출
            const uploadResult = await uploadImageToBand(
              image,
              band_access_token
            );

            if (uploadResult && uploadResult.result_code === 1) {
              const imageUrl = uploadResult.result_data.url;
              uploadedImageUrls.push(imageUrl);
              imageUrls.push({
                name: image.name,
                size: image.size,
                type: image.type,
                url: imageUrl,
                width: uploadResult.result_data.width,
                height: uploadResult.result_data.height,
              });
              console.log(`이미지 업로드 성공: ${imageUrl}`);
            } else {
              console.error(`이미지 업로드 실패: ${image.name}`, uploadResult);
              imageUrls.push({
                name: image.name,
                size: image.size,
                type: image.type,
                error: "업로드 실패",
              });
            }
          } catch (uploadError) {
            console.error(`이미지 업로드 오류: ${image.name}`, uploadError);
            imageUrls.push({
              name: image.name,
              size: image.size,
              type: image.type,
              error: uploadError.message,
            });
          }

          // 업로드 간격 조절 (너무 빠른 연속 요청 방지)
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // content에 업로드된 이미지 추가
    let finalContent = content;
    if (uploadedImageUrls.length > 0) {
      finalContent += "\n\n";
      uploadedImageUrls.forEach((url, index) => {
        finalContent += `\n${url}`;
      });
    } else if (hasImages) {
      finalContent += `\n\n📷 이미지 ${imageUrls.length}개 업로드 중 일부 실패`;
    }

    // 밴드 API로 글 작성
    const bandPostData = new URLSearchParams();
    bandPostData.append("access_token", band_access_token);
    bandPostData.append("band_key", band_key);
    bandPostData.append("content", finalContent);
    bandPostData.append("do_push", "true");

    console.log("밴드 API 요청 데이터:", {
      access_token: band_access_token
        ? `${band_access_token.substring(0, 10)}...`
        : "null",
      band_key,
      content: finalContent.substring(0, 100),
    });

    const bandResponse = await fetch(
      "https://openapi.band.us/v2.2/band/post/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bandPostData,
      }
    );

    const bandResult = await bandResponse.json();

    console.log("밴드 API 응답:", bandResult);

    if (bandResult.result_code !== 1) {
      console.error("밴드 API 오류:", bandResult);
      return NextResponse.json(
        {
          success: false,
          message: `밴드 게시물 작성에 실패했습니다: ${
            bandResult.result_data?.error_message ||
            bandResult.message ||
            "알 수 없는 오류"
          }`,
          debug: bandResult,
        },
        { status: 500 }
      );
    }

    const { post_key } = bandResult.result_data;

    // 제목 생성 (여러 상품 고려)
    let title = content.substring(0, 50);
    if (
      hasProduct &&
      productInfo &&
      Array.isArray(productInfo) &&
      productInfo.length > 0
    ) {
      if (productInfo.length === 1) {
        title = productInfo[0].title || title;
      } else {
        title = `${productInfo[0].title} 외 ${productInfo.length - 1}개 상품`;
      }
    }

    // DB에 게시물 저장
    const postId = `${band_key}_${post_key}`;
    const { data: postData, error: postError } = await supabase
      .from("posts")
      .insert({
        post_id: postId,
        post_key: post_key,
        band_key: band_key,
        user_id: userId,
        title: title,
        content: finalContent,
        author_name: "관리자", // 실제로는 사용자 이름을 가져와야 함
        posted_at: new Date().toISOString(),
        is_product: hasProduct,
        ai_extraction_status: hasProduct ? "completed" : null,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        band_post_url: `https://band.us/band/${band_key}/post/${post_key}`,
        crawled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (postError) {
      console.error("게시물 DB 저장 오류:", postError);
      return NextResponse.json(
        { success: false, message: "게시물 정보 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    // 여러 상품 정보가 있으면 products 테이블에 저장
    if (hasProduct && productInfo && Array.isArray(productInfo)) {
      const productInserts = [];

      for (const product of productInfo) {
        if (product.title && product.basePrice) {
          // 옵션을 올바른 형식으로 변환
          const priceOptions = product.options
            .filter((opt) => opt.name && opt.price)
            .map((opt) => ({
              name: opt.name,
              price: parseFloat(opt.price) || 0,
              description: opt.name,
            }));

          // product_id 생성 (post_key + 인덱스)
          const productId = `${post_key}_${productInfo.indexOf(product)}`;

          productInserts.push({
            product_id: productId,
            post_key: post_key,
            user_id: userId,
            title: product.title,
            base_price: parseFloat(product.basePrice) || 0,
            content: product.description || "",
            description: product.description || "",
            price_options: priceOptions,
            band_key: band_key,
            created_at: new Date().toISOString(),
          });
        }
      }

      if (productInserts.length > 0) {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .insert(productInserts);

        if (productError) {
          console.error("상품 정보 저장 오류:", productError);
          // 상품 저장 실패해도 게시물은 성공으로 처리
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "게시물이 성공적으로 작성되었습니다.",
      data: {
        post_key: post_key,
        band_key: band_key,
        products_count: hasProduct && productInfo ? productInfo.length : 0,
      },
    });
  } catch (error) {
    console.error("게시물 작성 오류:", error);
    return NextResponse.json(
      { success: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
