import { NextResponse } from 'next/server';
import { checkAdminAuth, supabaseAdmin } from '../auth-middleware';

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status');
    const bandKey = searchParams.get('bandKey');

    // 주문 목록 조회 (뷰 사용)
    let query = supabaseAdmin
      .from('v_admin_orders_overview')
      .select('*', { count: 'exact' });

    // 날짜 필터
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // 상태 필터
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // 밴드 필터
    if (bandKey && bandKey !== 'all') {
      query = query.eq('band_key', bandKey);
    }

    // 정렬 (최신순)
    query = query.order('created_at', { ascending: false });

    // 페이지네이션
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: orders, error: ordersError, count } = await query;

    if (ordersError) {
      console.error('Orders error:', ordersError);
      return NextResponse.json({ error: '주문 목록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({
      orders,
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