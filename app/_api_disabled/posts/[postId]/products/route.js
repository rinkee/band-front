import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request, { params }) {
  try {
    const { postId } = await params; // Next.js 15에서 params를 await해야 함
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const bandKey = searchParams.get('band_key'); // band_key 파라미터 추가

    console.log('Products API - postId:', postId, 'userId:', userId, 'bandKey:', bandKey);

    if (!postId) {
      return NextResponse.json({
        error: 'post_key는 필수 파라미터입니다.'
      }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({
        error: 'user_id는 필수 파라미터입니다.'
      }, { status: 400 });
    }

    // 해당 게시물(post)에 속한 모든 상품 조회 - user_id, post_key, band_key로 조회
    let query = supabase
      .from('products')
      .select('product_id, title, base_price, quantity, stock_quantity, is_closed, post_key, item_number')
      .eq('user_id', userId) // user_id 필터 추가
      .eq('post_key', postId) // post_key로 조회
      .eq('is_closed', false) // 판매 중인 상품만
      .order('item_number', { ascending: true }); // item_number로 정렬
    
    // band_key가 제공된 경우에만 필터 추가
    if (bandKey) {
      query = query.eq('band_key', bandKey);
    }

    const { data, error } = await query;

    console.log('Products query result:', { data, error });

    if (error) {
      console.error('상품 조회 에러:', error);
      return NextResponse.json({
        error: '상품 목록을 가져오는데 실패했습니다.',
        details: error.message
      }, { status: 500 });
    }

    console.log('Products API 성공 - 상품 수:', data?.length || 0);

    return NextResponse.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    console.error('상품 목록 API 에러:', error);
    return NextResponse.json({
      error: '서버 에러가 발생했습니다.',
      details: error.message
    }, { status: 500 });
  }
}