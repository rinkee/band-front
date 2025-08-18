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

    // orders 테이블에서 해당 댓글들이 저장되어 있는지 확인
    // order_id 패턴: order_{bandKey}_{postKey}_{commentKey}_{itemNumber}
    // comment_key로 부분 매칭
    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_id, comment_key')
      .eq('post_key', postKey)
      .eq('band_key', bandKey);

    if (error) {
      console.error('주문 확인 에러:', error);
      return NextResponse.json({
        error: '주문 데이터 확인에 실패했습니다.'
      }, { status: 500 });
    }

    // 각 댓글 키에 대해 DB 저장 여부 확인
    const savedComments = {};
    
    commentKeys.forEach(commentKey => {
      // order_id에서 comment_key 부분 추출하여 매칭
      const isSaved = orders?.some(order => {
        // order_id에서 comment_key 부분 추출
        const parts = order.order_id?.split('_');
        if (parts && parts.length >= 4) {
          const orderCommentKey = parts[3];
          return orderCommentKey === commentKey;
        }
        // 또는 comment_key 필드가 있으면 직접 비교
        return order.comment_key === commentKey;
      });
      
      savedComments[commentKey] = isSaved || false;
    });

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