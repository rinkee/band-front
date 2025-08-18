import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '../auth-middleware';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    console.log('Bands API called');
    
    // 관리자 권한 확인
    const authResult = await checkAdminAuth(request);
    if (!authResult.authorized) {
      console.log('Bands API: Not authorized');
      return authResult.response;
    }

    console.log('Bands API: User authorized');

    // URL 파라미터 처리
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'last_post_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    console.log('Query params:', { page, limit, search, sortBy, sortOrder });

    // 밴드 목록 조회 (뷰 사용)
    let query = supabase
      .from('v_admin_band_overview')
      .select('*', { count: 'exact' });

    // 검색 조건 추가
    if (search) {
      query = query.or(`store_name.ilike.%${search}%,login_id.ilike.%${search}%`);
    }

    // 정렬
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // 페이지네이션
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: bands, error: bandsError, count } = await query;

    console.log('Bands query result:', { 
      bandsCount: bands?.length, 
      totalCount: count,
      error: bandsError 
    });

    if (bandsError) {
      console.error('Bands error details:', {
        error: bandsError,
        message: bandsError.message,
        code: bandsError.code
      });
      return NextResponse.json({ error: '밴드 목록 조회 실패' }, { status: 500 });
    }

    const response = {
      bands,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    };

    console.log('Returning bands response:', {
      bandsCount: response.bands?.length,
      pagination: response.pagination
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}