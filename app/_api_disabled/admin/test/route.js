import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  try {
    console.log('=== TEST API CALLED ===');
    console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
    
    // anon 키로 클라이언트 생성 테스트
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    // 서비스 역할 키로 직접 클라이언트 생성
    const directClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // anon 키로 테스트 쿼리 실행
    console.log('Executing test query with anon key...');
    const { data: anonData, error: anonError } = await anonClient
      .from('v_admin_dashboard_stats')
      .select('*')
      .single();

    console.log('Anon key test result:', { anonData, anonError });
    
    // 서비스 역할 키로 테스트 쿼리 실행
    console.log('Executing test query with service role key...');
    const { data, error } = await directClient
      .from('users')
      .select('user_id, login_id, role')
      .limit(1);

    console.log('Service role key test result:', { data, error });

    return NextResponse.json({ 
      success: true, 
      anonKeyResult: {
        data: anonData,
        error: anonError
      },
      serviceRoleResult: {
        data,
        error
      },
      message: 'Test complete'
    });
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}