/**
 * Band API 댓글 응답 구조 테스트용 API
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { postKey, userId } = await request.json();
    
    if (!postKey || !userId) {
      return NextResponse.json(
        { error: 'postKey and userId are required' },
        { status: 400 }
      );
    }

    // Supabase 클라이언트 초기화
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 사용자의 Band 토큰 가져오기
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('band_access_token, band_key')
      .eq('user_id', userId)
      .single();

    if (userError || !userData?.band_access_token) {
      return NextResponse.json(
        { error: 'Band token not found' },
        { status: 404 }
      );
    }

    // Band API 직접 호출
    const apiUrl = new URL('https://openapi.band.us/v2/band/post/comments');
    apiUrl.searchParams.set('access_token', userData.band_access_token);
    apiUrl.searchParams.set('band_key', userData.band_key);
    apiUrl.searchParams.set('post_key', postKey);
    apiUrl.searchParams.set('limit', '5'); // 테스트용으로 5개만

    console.log('Band API Comments URL:', apiUrl.toString().replace(/access_token=[^&]+/, 'access_token=***'));

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Band API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Band API error', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // 전체 응답 구조 로깅
    console.log('Band API Full Response:', {
      result_code: data.result_code,
      has_result_data: !!data.result_data,
      has_items: !!(data.result_data?.items),
      items_count: data.result_data?.items?.length || 0
    });

    // 첫 번째 댓글의 전체 구조 로깅
    if (data.result_data?.items?.length > 0) {
      const firstComment = data.result_data.items[0];
      console.log('First Comment Full Structure:', JSON.stringify(firstComment, null, 2));
      console.log('First Comment Keys:', Object.keys(firstComment));
      
      // 특정 필드 확인
      console.log('Key Fields Check:', {
        comment_key: firstComment.comment_key,
        content: firstComment.content,
        body: firstComment.body,
        author: firstComment.author ? {
          user_key: firstComment.author.user_key,
          name: firstComment.author.name
        } : null,
        created_at: firstComment.created_at
      });
    }

    return NextResponse.json({
      success: true,
      result_code: data.result_code,
      comments_count: data.result_data?.items?.length || 0,
      first_comment: data.result_data?.items?.[0] || null,
      all_comment_keys: data.result_data?.items?.map(c => ({
        comment_key: c.comment_key,
        has_comment_key: 'comment_key' in c,
        keys: Object.keys(c)
      })) || []
    });

  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}