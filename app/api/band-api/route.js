/**
 * Band API 프록시 라우트
 * CORS 문제를 해결하기 위해 서버 사이드에서 Band API 호출
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { endpoint, params, method = 'GET' } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    // Band API URL 구성
    // 댓글 API는 v2.1 사용 (대댓글 지원), 나머지는 v2 사용
    const version = endpoint.includes('/comments') ? 'v2.1' : 'v2';
    const baseUrl = `https://openapi.band.us/${version}`;
    const url = new URL(`${baseUrl}${endpoint}`);
    
    // 쿼리 파라미터 추가
    if (params) {
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log('Band API Request URL:', url.toString().replace(/access_token=[^&]+/g, 'access_token=***'));
    }

    // Band API 호출
    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Band API error:', response.status, errorText);
      
      return NextResponse.json(
        { 
          error: 'Band API error',
          status: response.status,
          message: errorText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Band API 응답 디버깅
    if (process.env.NODE_ENV === "development") {
      console.log('Band API Response:', {
        endpoint,
        status: response.status,
        result_code: data.result_code,
        has_result_data: !!data.result_data,
        message: data.result_data?.message || data.message,
        // access_token 일부만 로깅 (보안상)
        token_prefix: params?.access_token ? params.access_token.substring(0, 10) + '...' : 'none',
        band_key: params?.band_key,
        // 전체 데이터 구조 확인 (개발용)
        data_keys: Object.keys(data),
        result_data_keys: data.result_data ? Object.keys(data.result_data) : null
      });
    }
    
    // Band API는 comment_key를 제공하며, content 필드에 댓글 내용이 있음
    
    // result_code 에러 처리
    if (data.result_code === 2300) {
      console.error('Band API Invalid Response (2300):', {
        message: data.result_data?.message || data.message || 'Invalid response',
        endpoint,
        band_key: params?.band_key,
        full_response: JSON.stringify(data)
      });
    } else if (data.result_code !== 1) {
      console.error('Band API Error:', {
        result_code: data.result_code,
        message: data.result_data?.message || data.message || 'Unknown error',
        endpoint,
        band_key: params?.band_key
      });
    }
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('Band API proxy error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

// GET 메소드도 지원
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  
  if (!endpoint) {
    return NextResponse.json(
      { error: 'Endpoint is required' },
      { status: 400 }
    );
  }

  // 쿼리 파라미터를 객체로 변환
  const params = {};
  for (const [key, value] of searchParams) {
    if (key !== 'endpoint') {
      params[key] = value;
    }
  }

  return POST(new Request(request.url, {
    method: 'POST',
    body: JSON.stringify({ endpoint, params, method: 'GET' })
  }));
}
