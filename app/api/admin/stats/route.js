import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '../auth-middleware';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    console.log('Stats API called');
    console.log('Headers:', Object.fromEntries(request.headers.entries()));
    
    // 관리자 권한 확인
    const authResult = await checkAdminAuth(request);
    console.log('Auth result:', authResult);
    
    if (!authResult.authorized) {
      console.log('Not authorized, returning:', authResult.response);
      return authResult.response;
    }

    console.log('User authorized, fetching stats');
    
    // 대시보드 통계 조회 (뷰 사용)
    const { data: stats, error: statsError } = await supabase
      .from('v_admin_dashboard_stats')
      .select('*')
      .single();

    console.log('Stats query result:', { stats, statsError });

    if (statsError) {
      console.error('Stats error details:', {
        error: statsError,
        message: statsError.message,
        code: statsError.code
      });
      return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 });
    }

    console.log('Returning stats:', stats);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}