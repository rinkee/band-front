import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json(
      { error: 'userId가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    // execution_locks 테이블에서 해당 사용자의 실행 중 상태 확인
    const { data, error } = await supabase
      .from('execution_locks')
      .select('is_running')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116은 "결과가 없음" 오류 (정상적인 경우)
      console.error('execution_locks 조회 오류:', error);
      return Response.json(
        { error: 'DB 조회 중 오류가 발생했습니다.', is_running: false },
        { status: 500 }
      );
    }

    // 레코드가 없으면 실행 중이 아님
    const isRunning = data?.is_running || false;

    return Response.json(
      { 
        is_running: isRunning,
        message: isRunning ? '처리 중인 작업이 있습니다.' : '실행 가능한 상태입니다.'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('execution_locks 확인 중 예외 발생:', error);
    return Response.json(
      { error: '서버 오류가 발생했습니다.', is_running: false },
      { status: 500 }
    );
  }
}