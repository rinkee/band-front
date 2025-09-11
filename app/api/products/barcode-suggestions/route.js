import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

// 문자열 유사도 계산 함수
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // 소문자로 변환하고 공백으로 분리
  const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // 공통 단어 찾기
  let matchCount = 0;
  const used = new Set();
  
  for (const word1 of words1) {
    for (let i = 0; i < words2.length; i++) {
      if (!used.has(i)) {
        const word2 = words2[i];
        
        // 완전 일치 또는 부분 일치 체크
        if (word1 === word2) {
          matchCount += 1.0;
          used.add(i);
          break;
        } else if (word1.includes(word2) || word2.includes(word1)) {
          // 부분 일치는 낮은 점수
          matchCount += 0.5;
          used.add(i);
          break;
        }
      }
    }
  }
  
  // 유사도 점수 계산 (0~1 범위)
  const maxWords = Math.max(words1.length, words2.length);
  let similarity = matchCount / maxWords;
  
  // 시작 부분이 같으면 보너스 점수
  if (words1[0] === words2[0]) {
    similarity = Math.min(1.0, similarity + 0.1);
  }
  
  // 핵심 키워드 가중치 (숫자나 단위는 낮은 가중치)
  const isNumberOrUnit = (word) => /^\d+$|^[\d.]+kg$|^[\d.]+g$|박스$|개$|통$|수$/i.test(word);
  
  // 핵심 단어(숫자/단위가 아닌 것)의 일치율 계산
  const coreWords1 = words1.filter(w => !isNumberOrUnit(w));
  const coreWords2 = words2.filter(w => !isNumberOrUnit(w));
  
  if (coreWords1.length > 0 && coreWords2.length > 0) {
    let coreMatchCount = 0;
    for (const word1 of coreWords1) {
      if (coreWords2.some(word2 => word1 === word2)) {
        coreMatchCount++;
      }
    }
    const coreSimilarity = coreMatchCount / Math.max(coreWords1.length, coreWords2.length);
    
    // 핵심 단어 유사도를 더 높은 가중치로 반영
    similarity = similarity * 0.4 + coreSimilarity * 0.6;
  }
  
  return Math.min(1.0, similarity);
}

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
      
      // 유사도 점수 계산
      const similarity = calculateSimilarity(cleanTitle, latestProduct.clean_title);
      
      return {
        barcode: item.barcode,
        product_title: latestProduct.title,
        clean_title: latestProduct.clean_title,
        option_name: latestProduct.option_name,
        price: latestProduct.price,
        last_used: lastUsedDate.toISOString().split('T')[0],
        days_ago: daysAgo,
        used_count: item.products.length,
        similarity_score: similarity, // 유사도 점수 추가
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
    
    // 정렬: 1) 유사도 (0.6 이상) 2) 최근 사용 3) 사용 빈도
    suggestions.sort((a, b) => {
      // 유사도 기반 정렬 (0.6 이상이면 유사한 것으로 간주)
      const aSimilar = a.similarity_score >= 0.6 ? a.similarity_score : 0;
      const bSimilar = b.similarity_score >= 0.6 ? b.similarity_score : 0;
      
      // 유사도가 둘 다 0.6 이상이면 유사도 순으로
      if (aSimilar > 0 && bSimilar > 0) {
        if (Math.abs(aSimilar - bSimilar) > 0.1) {
          return bSimilar - aSimilar;
        }
      } else if (aSimilar !== bSimilar) {
        return bSimilar - aSimilar;
      }
      
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