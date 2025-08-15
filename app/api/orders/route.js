import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userId) {
      return NextResponse.json({
        error: 'user_id는 필수 파라미터입니다.'
      }, { status: 400 });
    }

    // orders_with_products 뷰를 사용하여 상품 정보와 함께 주문 조회
    const { data, error, count } = await supabase
      .from('orders_with_products')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('ordered_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('주문 조회 에러:', error);
      return NextResponse.json({
        error: '주문 데이터를 가져오는데 실패했습니다.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error) {
    console.error('주문 API 에러:', error);
    return NextResponse.json({
      error: '서버 에러가 발생했습니다.'
    }, { status: 500 });
  }
}