import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 환경 변수 디버깅
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Service Role Key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('Service Role Key length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
console.log('Service Role Key prefix:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20));

// 서비스 역할 키를 사용하여 관리자 권한으로 데이터베이스에 접근
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 관리자 권한 확인 미들웨어
 * Authorization 헤더에서 사용자 ID를 추출하고 관리자 권한을 확인
 */
export async function checkAdminAuth(request) {
  try {
    // Authorization 헤더에서 userId 추출
    const authHeader = request.headers.get('Authorization');
    console.log('Auth header received:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid auth header');
      return {
        authorized: false,
        response: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
      };
    }
    
    const userId = authHeader.substring(7); // 'Bearer ' 제거
    console.log('Extracted userId:', userId);
    
    if (!userId) {
      console.log('Empty userId after extraction');
      return {
        authorized: false,
        response: NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 })
      };
    }
    
    // 사용자 권한 확인
    console.log('Querying user with userId:', userId);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, login_id, user_id')
      .eq('user_id', userId)
      .single();
    
    console.log('User query result:', { userData, userError });
    
    if (userError) {
      console.error('User fetch error details:', {
        error: userError,
        userId: userId,
        message: userError.message,
        code: userError.code
      });
      return {
        authorized: false,
        response: NextResponse.json({ error: '사용자 조회 실패' }, { status: 401 })
      };
    }
    
    // admin 권한 확인
    if (userData?.role !== 'admin') {
      console.log('Not admin:', userData);
      return {
        authorized: false,
        response: NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })
      };
    }
    
    return {
      authorized: true,
      user: userData
    };
  } catch (error) {
    console.error('Auth middleware error:', error);
    return {
      authorized: false,
      response: NextResponse.json({ error: '인증 처리 중 오류가 발생했습니다' }, { status: 500 })
    };
  }
}