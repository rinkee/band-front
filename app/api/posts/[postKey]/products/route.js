import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 생성
const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Supabase credentials missing:', { url: !!url, key: !!key });
    throw new Error('Supabase credentials not configured');
  }

  return createClient(url, key);
};

export async function GET(request, { params }) {
  try {
    const { postKey } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const bandKey = searchParams.get('band_key');

    if (!postKey || !userId) {
      return NextResponse.json(
        { success: false, message: 'postKey와 user_id가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // products 테이블에서 해당 게시물의 상품 조회
    let query = supabase
      .from('products')
      .select('*')
      .eq('post_key', postKey)
      .eq('user_id', userId);

    // band_key가 있으면 추가 필터링
    if (bandKey) {
      query = query.eq('band_key', bandKey);
    }

    // 상품명 순으로 정렬
    query = query.order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('상품 조회 실패:', error);
      return NextResponse.json(
        { success: false, message: '상품 조회 실패', error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (e) {
    console.error('상품 조회 예외:', e);
    return NextResponse.json(
      { success: false, message: '서버 오류' },
      { status: 500 }
    );
  }
}
