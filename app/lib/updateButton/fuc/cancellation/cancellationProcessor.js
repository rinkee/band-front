/**
 * 취소 처리 모듈
 * DB의 기존 주문을 취소 처리합니다.
 */

/**
 * 취소 요청 처리 - DB의 기존 주문을 취소 상태로 업데이트합니다.
 *
 * @param {Object} supabase - Supabase 클라이언트 인스턴스
 * @param {string} postKey - 게시물 키
 * @param {Set} cancellationUsers - 취소 요청한 사용자의 user_key Set
 * @returns {Promise<void>}
 */
export async function processCancellationRequests(supabase, postKey, cancellationUsers) {
  if (cancellationUsers.size === 0) return;

  try {
    for (const authorUserNo of cancellationUsers) {
      // 같은 post_key와 customer_band_id를 가진 모든 활성 주문을 취소
      const { data: existingOrders, error: ordersError } = await supabase
        .from("orders")
        .select("order_id, customer_name, quantity, total_amount, status")
        .eq("post_key", postKey)
        .eq("customer_band_id", authorUserNo)
        .in("status", ["주문완료", "확인필요"]);

      if (ordersError) {
        console.error('기존 주문 조회 실패', ordersError, {
          postKey,
          authorUserNo
        });
        continue;
      }

      if (!existingOrders || existingOrders.length === 0) {
        console.info('취소할 주문이 없음', {
          postKey,
          authorUserNo
        });
        continue;
      }

      // 찾은 모든 주문을 취소 상태로 업데이트
      const orderIds = existingOrders.map((order) => order.order_id);
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "주문취소",
          sub_status: "취소요청",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in("order_id", orderIds);

      if (updateError) {
        console.error('주문 취소 상태 업데이트 실패', updateError, {
          orderIds
        });
        continue;
      }

      console.info('주문 취소 완료', {
        cancelledCount: existingOrders.length,
        orderIds,
        customerName: existingOrders[0]?.customer_name,
        totalAmount: existingOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
      });
    }
  } catch (error) {
    console.error('processCancellationRequests 처리 중 오류', error, {
      postKey,
      cancellationUsers: Array.from(cancellationUsers)
    });
  }
}

/**
 * 이전 주문 취소 처리 - 특정 사용자의 이전 주문들을 취소합니다.
 *
 * @param {Object} supabase - Supabase 클라이언트 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {string} postKey - 게시물 키
 * @param {string} bandKey - 밴드 키
 * @param {string} bandNumber - 밴드 번호
 * @param {string} authorUserNo - 취소 요청자의 Band user_key
 * @param {string} cancellationTime - 취소 요청 시간
 * @param {string} cancellationComment - 취소 요청 댓글 내용
 * @returns {Promise<void>}
 */
export async function cancelPreviousOrders(
  supabase,
  userId,
  postKey,
  bandKey,
  bandNumber,
  authorUserNo,
  cancellationTime,
  cancellationComment
) {
  try {
    console.info('주문 취소 처리 시작', {
      postKey,
      authorUserNo,
      cancellationComment
    });

    // 같은 post_key와 customer_band_id를 가진 모든 주문을 취소
    const { data: existingOrders, error: ordersError } = await supabase
      .from("orders")
      .select("order_id, customer_name, quantity, total_amount, status")
      .eq("post_key", postKey)
      .eq("customer_band_id", authorUserNo)
      .in("status", ["주문완료", "확인필요"]); // 활성 주문만 취소

    if (ordersError) {
      console.error('기존 주문 조회 실패', ordersError, {
        postKey,
        authorUserNo
      });
      return;
    }

    if (!existingOrders || existingOrders.length === 0) {
      console.info('취소할 주문이 없음', {
        postKey,
        authorUserNo
      });
      return;
    }

    // 찾은 모든 주문을 취소 상태로 업데이트
    const orderIds = existingOrders.map((order) => order.order_id);
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "주문취소",
        sub_status: "취소요청",
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in("order_id", orderIds);

    if (updateError) {
      console.error('주문 취소 상태 업데이트 실패', updateError, {
        orderIds
      });
      return;
    }

    console.info('주문 취소 완료', {
      cancelledCount: existingOrders.length,
      orderIds,
      customerName: existingOrders[0]?.customer_name,
      totalAmount: existingOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    });

    // 취소 로그 저장 (선택적)
    try {
      await supabase.from("order_logs").insert({
        user_id: userId,
        post_key: postKey,
        band_key: bandKey,
        action: "취소요청",
        details: {
          author_user_no: authorUserNo,
          cancelled_orders: existingOrders.length,
          cancellation_comment: cancellationComment,
          order_ids: orderIds
        },
        created_at: new Date().toISOString()
      });
    } catch (logError) {
      console.warn('취소 로그 저장 실패', {
        error: logError.message
      });
    }
  } catch (error) {
    console.error('cancelPreviousOrders 처리 중 오류', error, {
      postKey,
      authorUserNo
    });
  }
}
