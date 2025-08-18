import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '../auth-middleware';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // 관리자 권한 확인
    const authResult = await checkAdminAuth(request);
    if (!authResult.authorized) {
      return authResult.response;
    }

    // URL 파라미터 처리
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const filter = searchParams.get('filter') || 'all'; // all, active, inactive, admin

    // 사용자 목록 조회 (뷰 사용)
    let query = supabase
      .from('v_admin_user_activity')
      .select('*', { count: 'exact' });

    // 검색 조건 추가
    if (search) {
      query = query.or(`login_id.ilike.%${search}%,store_name.ilike.%${search}%`);
    }

    // 필터 적용
    switch (filter) {
      case 'active':
        query = query.eq('is_active', true);
        break;
      case 'inactive':
        query = query.eq('is_active', false);
        break;
      case 'admin':
        query = query.eq('role', 'admin');
        break;
      case 'has_band':
        query = query.eq('has_band', true);
        break;
    }

    // 페이지네이션
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: users, error: usersError, count } = await query;

    if (usersError) {
      console.error('Users error:', usersError);
      return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// 사용자 정보 수정 (권한, 상태 등)
export async function PATCH(request) {
  try {
    // 관리자 권한 확인
    const authResult = await checkAdminAuth(request);
    if (!authResult.authorized) {
      return authResult.response;
    }

    const body = await request.json();
    const { userId, updates } = body;

    if (!userId || !updates) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 });
    }

    // 사용자 정보 업데이트
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json({ error: '사용자 정보 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}