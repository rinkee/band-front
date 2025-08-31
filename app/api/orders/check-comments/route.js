import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { commentKeys, postKey, bandKey } = body;

    console.log('📥 API 요청 파라미터:', {
      commentKeys: commentKeys?.slice(0, 3),
      commentKeysCount: commentKeys?.length,
      postKey,
      bandKey
    });

    if (!commentKeys || !Array.isArray(commentKeys)) {
      return NextResponse.json({
        error: 'commentKeys 배열이 필요합니다.'
      }, { status: 400 });
    }

    if (!postKey || !bandKey) {
      return NextResponse.json({
        error: 'postKey와 bandKey가 필요합니다.'
      }, { status: 400 });
    }
    

    // orders 테이블에서 올바른 컬럼명으로 조회 (주문 상세 정보 포함)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('comment_key, status, product_name, quantity, price')
      .eq('band_key', bandKey)
      .eq('post_key', postKey)
      .in('comment_key', commentKeys);

    if (error) {
      console.error('주문 확인 에러:', error);
      return NextResponse.json({
        error: '주문 데이터 확인에 실패했습니다.'
      }, { status: 500 });
    }

    console.log('🔍 주문 데이터 조회 결과:', {
      commentKeysCount: commentKeys.length,
      ordersFound: orders?.length || 0,
      orders: orders?.map(o => ({
        comment_key: o.comment_key,
        product_name: o.product_name,
        quantity: o.quantity,
        price: o.price,
        status: o.status
      }))
    });

    
    // 각 댓글 키에 대해 DB 저장 여부 및 상태 확인 (주문 상세 정보 포함)
    const savedComments = {};
    
    commentKeys.forEach(commentKey => {
      // comment_key에 해당하는 모든 주문 찾기 (한 댓글에 여러 주문 있을 수 있음)
      const commentOrders = orders?.filter(order => order.comment_key === commentKey) || [];
      
      if (commentOrders.length > 0) {
        savedComments[commentKey] = {
          isSaved: true,
          status: commentOrders[0].status, // 첫 번째 주문의 상태 사용
          orders: commentOrders.map(order => {
            const finalPrice = order.total_amount || order.price;
            console.log(`💰 주문 가격 매핑:`, {
              customer: order.customer_name,
              product: order.product_name,
              quantity: order.quantity,
              original_price: order.price,
              total_amount: order.total_amount,
              final_price: finalPrice
            });
            return {
              product_name: order.product_name,
              quantity: order.quantity,
              total_amount: finalPrice, // total_amount로 필드명 변경
              order_status: order.status // status를 order_status로 매핑
            };
          })
        };
      } else {
        savedComments[commentKey] = {
          isSaved: false,
          status: null,
          orders: []
        };
      }
    });

    console.log('📤 최종 응답 데이터:', { savedComments });

    return NextResponse.json({
      success: true,
      savedComments
    });

  } catch (error) {
    console.error('댓글 확인 API 에러:', error);
    return NextResponse.json({
      error: '서버 에러가 발생했습니다.'
    }, { status: 500 });
  }
}