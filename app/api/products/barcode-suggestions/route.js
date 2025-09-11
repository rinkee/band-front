import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productTitle = searchParams.get('title');
    const userId = searchParams.get('userId');
    
    if (!productTitle || !userId) {
      return NextResponse.json(
        { error: '상품명과 사용자 ID가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // Supabase 클라이언트 초기화
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase 설정이 필요합니다.' },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 날짜 패턴 제거 (예: [9월11일] -> '')
    const cleanTitle = productTitle.replace(/^\[.*?\]\s*/, '').trim();
    
    if (!cleanTitle) {
      return NextResponse.json({ suggestions: [] });
    }
    
    // 비슷한 상품명으로 바코드 검색
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        product_id,
        title,
        barcode,
        barcode_options,
        base_price,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .or(`barcode.neq.,barcode_options.not.is.null`)
      .ilike('title', `%${cleanTitle}%`)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('바코드 추천 조회 오류:', error);
      return NextResponse.json(
        { error: '바코드 추천을 가져오는데 실패했습니다.' },
        { status: 500 }
      );
    }
    
    // 바코드 정보 수집 및 정리
    const barcodeMap = new Map();
    
    products?.forEach(product => {
      // 기본 바코드 처리
      if (product.barcode && product.barcode.trim() !== '') {
        const key = product.barcode;
        if (!barcodeMap.has(key)) {
          barcodeMap.set(key, {
            barcode: product.barcode,
            products: []
          });
        }
        barcodeMap.get(key).products.push({
          title: product.title,
          clean_title: product.title.replace(/^\[.*?\]\s*/, '').trim(),
          price: product.base_price || 0,
          date: product.created_at,
          product_id: product.product_id
        });
      }
      
      // barcode_options 처리
      if (product.barcode_options?.options?.length > 0) {
        product.barcode_options.options.forEach(option => {
          if (option.barcode && option.barcode.trim() !== '') {
            const key = option.barcode;
            if (!barcodeMap.has(key)) {
              barcodeMap.set(key, {
                barcode: option.barcode,
                products: []
              });
            }
            barcodeMap.get(key).products.push({
              title: product.title,
              clean_title: product.title.replace(/^\[.*?\]\s*/, '').trim(),
              price: option.price || product.base_price || 0,
              option_name: option.name,
              date: product.created_at,
              product_id: product.product_id
            });
          }
        });
      }
    });
    
    // 추천 목록 생성
    const suggestions = Array.from(barcodeMap.values()).map(item => {
      const latestProduct = item.products[0]; // 가장 최근 사용
      const now = new Date();
      const lastUsedDate = new Date(latestProduct.date);
      const daysAgo = Math.floor((now - lastUsedDate) / (1000 * 60 * 60 * 24));
      
      return {
        barcode: item.barcode,
        product_title: latestProduct.title,
        clean_title: latestProduct.clean_title,
        option_name: latestProduct.option_name,
        price: latestProduct.price,
        last_used: lastUsedDate.toISOString().split('T')[0],
        days_ago: daysAgo,
        used_count: item.products.length,
        // 가격 범위 (여러 번 사용된 경우)
        price_range: item.products.length > 1 ? {
          min: Math.min(...item.products.map(p => p.price)),
          max: Math.max(...item.products.map(p => p.price))
        } : null,
        // 최근 3개 사용 이력
        recent_uses: item.products.slice(0, 3).map(p => ({
          title: p.title,
          price: p.price,
          date: new Date(p.date).toISOString().split('T')[0]
        }))
      };
    });
    
    // 정렬: 1) 정확한 매칭 2) 최근 사용 3) 사용 빈도
    suggestions.sort((a, b) => {
      // 정확한 매칭 우선
      const aExact = a.clean_title === cleanTitle ? 1 : 0;
      const bExact = b.clean_title === cleanTitle ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      
      // 최근 사용 우선 (7일 이내)
      const aRecent = a.days_ago <= 7 ? 1 : 0;
      const bRecent = b.days_ago <= 7 ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      
      // 사용 빈도
      if (a.used_count !== b.used_count) {
        return b.used_count - a.used_count;
      }
      
      // 날짜순
      return a.days_ago - b.days_ago;
    });
    
    // 상위 5개만 반환
    const topSuggestions = suggestions.slice(0, 5);
    
    return NextResponse.json({
      suggestions: topSuggestions,
      total_found: suggestions.length
    });
    
  } catch (error) {
    console.error('바코드 추천 API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}