import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function PATCH(request, { params }) {
  try {
    const { orderId } = await params; // Next.js 15에서 params를 await해야 함
    const { product_id, product_name, quantity, product_price } = await request.json();

    console.log('Order update - orderId:', orderId, 'data:', { product_id, product_name, quantity, product_price });

    // 입력 값 검증
    if (!product_name || !quantity || quantity < 1) {
      return NextResponse.json({
        error: '상품명과 수량(1개 이상)을 입력해주세요.'
      }, { status: 400 });
    }

    // 주문 정보 업데이트 - product_id, product_price도 함께 업데이트
    const updateData = {
      quantity: parseInt(quantity),
      updated_at: new Date().toISOString()
    };
    
    // product_id가 제공된 경우 함께 업데이트
    if (product_id) {
      updateData.product_id = product_id;
    }

    // product_price가 제공된 경우 price 컬럼에 업데이트
    if (product_price !== undefined && product_price !== null) {
      updateData.price = parseInt(product_price);
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) {
      console.error('주문 업데이트 에러:', error);
      return NextResponse.json({
        error: '주문 정보 업데이트에 실패했습니다.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('주문 업데이트 API 에러:', error);
    return NextResponse.json({
      error: '서버 에러가 발생했습니다.'
    }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const { orderId } = await params; // Next.js 15에서 params를 await해야 함

    const { data, error } = await supabase
      .from('orders_with_products')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error) {
      console.error('주문 조회 에러:', error);
      return NextResponse.json({
        error: '주문 정보를 찾을 수 없습니다.'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('주문 조회 API 에러:', error);
    return NextResponse.json({
      error: '서버 에러가 발생했습니다.'
    }, { status: 500 });
  }
}