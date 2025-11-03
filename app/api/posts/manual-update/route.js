import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for privileged updates (server only)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, postKey, updates } = body || {};

    if (!userId || !postKey || !updates || typeof updates !== 'object') {
      return NextResponse.json(
        { success: false, message: 'userId, postKey, updates 가 필요합니다.' },
        { status: 400 }
      );
    }

    // Always update updated_at on server side
    const updatePayload = { ...updates, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('posts')
      .update(updatePayload)
      .eq('post_key', postKey)
      .eq('user_id', userId);

    if (error) {
      console.error('Service update posts 실패:', error);
      return NextResponse.json(
        { success: false, message: '업데이트 실패', error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Service update posts 예외:', e);
    return NextResponse.json(
      { success: false, message: '서버 오류' },
      { status: 500 }
    );
  }
}

