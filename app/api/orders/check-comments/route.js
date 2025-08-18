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
    
    console.log('댓글 확인 요청:', {
      commentKeys,
      postKey,
      bandKey
    });

    // orders 테이블에서 band_key, post_key, comment_key로 조회
    const { data: orders, error } = await supabase
      .from('orders')
      .select('comment_key')
      .eq('band_key', bandKey)
      .eq('post_key', postKey)
      .in('comment_key', commentKeys);

    if (error) {
      console.error('주문 확인 에러:', error);
      return NextResponse.json({
        error: '주문 데이터 확인에 실패했습니다.'
      }, { status: 500 });
    }

    console.log('조회된 주문 수:', orders?.length || 0);
    if (orders && orders.length > 0) {
      console.log('저장된 comment_key들:', orders.map(o => o.comment_key));
    }
    
    // 각 댓글 키에 대해 DB 저장 여부 확인
    const savedComments = {};
    
    commentKeys.forEach(commentKey => {
      // comment_key가 orders에 있는지 확인
      const isSaved = orders?.some(order => order.comment_key === commentKey);
      savedComments[commentKey] = isSaved || false;
    });
    
    console.log('저장된 댓글 상태:', savedComments);

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