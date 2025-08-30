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
    

    // 먼저 orders 테이블의 실제 구조와 데이터 확인
    const { data: sampleOrders, error: sampleError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);
      
    console.log('🔍 Orders 테이블 샘플:', {
      sampleError,
      sampleData: sampleOrders?.[0],
      columns: sampleOrders?.[0] ? Object.keys(sampleOrders[0]) : []
    });

    // orders 테이블에서 band_key, post_key, comment_key로 조회 (주문 상세 정보 포함)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('band_comment_id, status, product_name, quantity, price')
      .eq('band_number', bandKey)
      .eq('post_number', postKey)
      .in('band_comment_id', commentKeys);

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
        comment_key: o.band_comment_id,
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
      const commentOrders = orders?.filter(order => order.band_comment_id === commentKey) || [];
      
      if (commentOrders.length > 0) {
        savedComments[commentKey] = {
          isSaved: true,
          status: commentOrders[0].status, // 첫 번째 주문의 상태 사용
          orders: commentOrders.map(order => ({
            product_name: order.product_name,
            quantity: order.quantity,
            product_price: order.price, // price -> product_price로 매핑
            order_status: order.status // status를 order_status로 매핑
          }))
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