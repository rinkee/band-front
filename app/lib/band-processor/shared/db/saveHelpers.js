/**
 * 주문과 고객 데이터를 트랜잭션처럼 안전하게 저장
 * @param {Object} supabase - Supabase 클라이언트
 * @param {Array} orders - 저장할 주문 배열
 * @param {Array} customers - 저장할 고객 배열
 * @param {Object} metadata - 메타데이터 (userId, bandNumber, postKey)
 * @returns {Promise<Object>} 저장 결과 객체
 */
export async function saveOrdersAndCustomersSafely(
  supabase,
  orders,
  customers,
  metadata = {}
) {
  // customers를 배열로 받음
  const customersArray = Array.isArray(customers) ? customers : [];
  
  console.log(
    `[데이터 정합성] 주문 ${orders.length}개, 고객 ${customersArray.length}개 트랜잭션 저장 시작`
  );
  let savedCustomerIds = [];
  let orderSaveSuccess = false;
  
  try {
    // 1단계: 고객 먼저 저장 (외래키 의존성)
    if (customersArray.length > 0) {
      console.log(
        `[데이터 정합성] 1단계: 고객 ${customersArray.length}명 저장 중...`
      );
      
      // 저장하려는 고객 데이터 디버깅
      console.log(`[데이터 정합성] 저장할 고객 데이터 샘플:`, 
        customersArray.slice(0, 2).map(c => ({
          customer_id: c.customer_id,
          fields: Object.keys(c),
          has_band_user_no: 'band_user_no' in c
        }))
      );
      
      const { data: savedCustomers, error: customerError } = await supabase
        .from("customers")
        .upsert(customersArray, {
          onConflict: "customer_id"
        })
        .select("customer_id");
      
      if (customerError) {
        console.error(
          `[데이터 정합성] 고객 저장 실패: ${customerError.message}`,
          customerError
        );
        throw customerError;
      }
      
      // 저장된 고객 ID 추적
      savedCustomerIds = savedCustomers?.map((c) => c.customer_id) || [];
      console.log(
        `[데이터 정합성] 고객 ${savedCustomerIds.length}명 저장 완료`
      );
    }
    
    // 2단계: 주문 저장
    if (orders.length > 0) {
      console.log(`[데이터 정합성] 2단계: 주문 ${orders.length}개 저장 중...`);
      
      // 저장하려는 주문 데이터 디버깅
      console.log(`[데이터 정합성] 저장할 주문 데이터 샘플:`, 
        orders.slice(0, 2).map(o => ({
          order_id: o.order_id,
          customer_id: o.customer_id,
          fields: Object.keys(o),
          has_post_key: 'post_key' in o,
          has_product_name: 'product_name' in o
        }))
      );
      
      const { error: orderError } = await supabase
        .from("orders")
        .upsert(orders, {
          onConflict: "order_id",
          ignoreDuplicates: true,
        });
      
      if (orderError) {
        console.error(`[데이터 정합성] 주문 저장 실패: ${orderError.message}`, orderError);
        throw orderError;
      }
      
      orderSaveSuccess = true;
      console.log(`[데이터 정합성] 주문 ${orders.length}개 저장 완료`);
    }
    
    // 3단계: 성공 상태 기록
    // Note: order_generation 컬럼은 posts 테이블에 존재하지 않으므로 주석 처리
    // if (savedPostId) {
    //   const { error: statusError } = await supabase
    //     .from("posts")
    //     .update({
    //       order_generation_status: 'completed',
    //       order_generation_at: new Date().toISOString(),
    //       order_generation_error: null
    //     })
    //     .eq("post_id", savedPostId);
    //
    //   if (statusError) {
    //     console.warn(`[데이터 정합성] 상태 업데이트 실패: ${statusError.message}`);
    //   }
    // }
    
    return {
      success: true,
      savedOrders: orders.length,
      savedCustomers: savedCustomerIds.length,
    };
    
  } catch (error) {
    console.error(`[데이터 정합성] 트랜잭션 실패, 롤백 시작: ${error.message}`);
    
    // 롤백: 주문 저장이 실패한 경우, 저장된 고객 데이터 삭제
    if (!orderSaveSuccess && savedCustomerIds.length > 0) {
      try {
        console.log(
          `[데이터 정합성] 롤백: ${savedCustomerIds.length}개 고객 데이터 삭제 중...`
        );
        
        const { error: rollbackError } = await supabase
          .from("customers")
          .delete()
          .in("customer_id", savedCustomerIds);
        
        if (rollbackError) {
          console.error(`[데이터 정합성] 롤백 실패: ${rollbackError.message}`);
        } else {
          console.log(
            `[데이터 정합성] 롤백 완료: ${savedCustomerIds.length}개 고객 데이터 삭제됨`
          );
        }
      } catch (rollbackErr) {
        console.error(
          `[데이터 정합성] 롤백 중 예외 발생: ${rollbackErr.message}`
        );
      }
    }
    
    // 실패 상태 기록
    // Note: order_generation 컬럼은 posts 테이블에 존재하지 않으므로 주석 처리
    // if (savedPostId) {
    //   const { error: statusError } = await supabase
    //     .from("posts")
    //     .update({
    //       order_generation_status: 'error',
    //       order_generation_at: new Date().toISOString(),
    //       order_generation_error: error.message
    //     })
    //     .eq("post_id", savedPostId);
    //
    //   if (statusError) {
    //     console.warn(`[데이터 정합성] 상태 업데이트 실패: ${statusError.message}`);
    //   }
    // }
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 게시물과 상품 정보를 저장
 * @param {Object} supabase - Supabase 클라이언트
 * @param {Object} postData - 저장할 게시물 데이터
 * @param {Array} products - 저장할 상품 배열
 * @returns {Promise<Object>} 저장된 게시물 ID와 성공 여부
 */
export async function savePostAndProducts(supabase, postData, products) {
  try {
    // 게시물 데이터 필수 필드 검증 및 보정
    const validatedPostData = {
      ...postData,
      // title이 없으면 content 첫 줄에서 추출
      title: postData.title || (postData.content ? postData.content.split('\n')[0].substring(0, 100) : '제목 없음'),
      // ai_extraction_status 기본값 설정
      ai_extraction_status: postData.ai_extraction_status || 'pending',
      // keyword_mappings 기본값 설정
      keyword_mappings: postData.keyword_mappings || {},
      // order_needs_ai 기본값
      order_needs_ai: postData.order_needs_ai || false,
      order_needs_ai_reason: postData.order_needs_ai_reason || null,
      // 날짜 필드 - posts 테이블은 posted_at 사용
      posted_at: postData.posted_at || postData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // created_at 필드 제거 (posts 테이블에 존재하지 않음)
    delete validatedPostData.created_at;
    
    console.log(`[DB 저장] 게시물 저장 시작 - ID: ${validatedPostData.post_id}, Title: ${validatedPostData.title}`);
    
    // 게시물 저장 (upsert)
    const { data: savedPost, error: postError } = await supabase
      .from("posts")
      .upsert(validatedPostData, {
        onConflict: "post_id",
      })
      .select("post_id")
      .single();
    
    if (postError) {
      console.error(`[DB 저장] 게시물 저장 실패: ${postError.message}`);
      throw postError;
    }
    
    const savedPostId = savedPost?.post_id;
    
    // 상품 저장
    if (products && products.length > 0) {
      // 각 상품 데이터 검증 및 보정
      const validatedProducts = products.map((product, index) => {
        const validatedProduct = {
          ...product,
          post_id: savedPostId,
          // products 테이블은 title, content, base_price 필드 사용
          title: product.product_name || product.title || `상품 ${index + 1}`,
          content: product.description || product.content || '',
          base_price: product.price || product.basePrice || product.base_price || 0,
          // updated_at은 항상 현재 시간
          updated_at: new Date().toISOString()
        };
        
        // description, product_name, price 필드 제거 (products 테이블에 없음)
        delete validatedProduct.description;
        delete validatedProduct.product_name;
        delete validatedProduct.price;
        
        // created_at은 있는 경우에만 포함
        if (product.created_at) {
          validatedProduct.created_at = product.created_at;
        }
        
        return validatedProduct;
      });
      
      console.log(`[DB 저장] ${validatedProducts.length}개 상품 저장 중...`);
      
      const { error: productError } = await supabase
        .from("products")
        .upsert(validatedProducts, {
          onConflict: "product_id",
          ignoreDuplicates: true,
        });
      
      if (productError) {
        console.error(`[DB 저장] 상품 저장 실패: ${productError.message}`);
        throw productError;
      }
      
      console.log(`[DB 저장] ${products.length}개 상품 저장 완료`);
    }
    
    return {
      success: true,
      savedPostId,
    };
    
  } catch (error) {
    console.error(`[DB 저장] 저장 실패: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 배치로 주문 데이터를 저장 (대량 처리용)
 * @param {Object} supabase - Supabase 클라이언트
 * @param {Array} orders - 저장할 주문 배열
 * @param {number} batchSize - 배치 크기 (기본값: 100)
 * @returns {Promise<Object>} 저장 결과
 */
export async function saveOrdersBatch(supabase, orders, batchSize = 100) {
  if (!orders || orders.length === 0) {
    return {
      success: true,
      savedOrders: 0,
    };
  }
  
  let totalSaved = 0;
  const errors = [];
  
  try {
    // 배치로 나누어 처리
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      console.log(
        `[배치 저장] ${i + 1}~${Math.min(i + batchSize, orders.length)}번째 주문 저장 중...`
      );
      
      const { error } = await supabase
        .from("orders")
        .upsert(batch, {
          onConflict: "order_id",
          ignoreDuplicates: true,
        });
      
      if (error) {
        console.error(`[배치 저장] 배치 저장 실패: ${error.message}`);
        errors.push({
          batch: `${i + 1}~${Math.min(i + batchSize, orders.length)}`,
          error: error.message,
        });
      } else {
        totalSaved += batch.length;
      }
    }
    
    console.log(`[배치 저장] 총 ${totalSaved}개 주문 저장 완료`);
    
    return {
      success: errors.length === 0,
      savedOrders: totalSaved,
      errors: errors.length > 0 ? errors : undefined,
    };
    
  } catch (error) {
    console.error(`[배치 저장] 예외 발생: ${error.message}`);
    return {
      success: false,
      error: error.message,
      savedOrders: totalSaved,
    };
  }
}

/**
 * 고객 정보를 업데이트 또는 삽입
 * @param {Object} supabase - Supabase 클라이언트
 * @param {Object} customer - 고객 데이터
 * @returns {Promise<Object>} 저장 결과
 */
export async function upsertCustomer(supabase, customer) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .upsert(customer, {
        onConflict: "customer_id",
      })
      .select()
      .single();
    
    if (error) {
      console.error(`[고객 저장] 실패: ${error.message}`);
      throw error;
    }
    
    return {
      success: true,
      customer: data,
    };
    
  } catch (error) {
    console.error(`[고객 저장] 예외 발생: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}