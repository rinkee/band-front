import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const user_id = formData.get('user_id');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Service Role Key를 사용한 admin 클라이언트 생성
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      }
    );

    // 파일명 생성
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${user_id}/${fileName}`;

    try {
      // 파일을 Buffer로 변환
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Supabase Storage에 업로드 (Admin 클라이언트 사용으로 RLS 우회)
      const { data, error } = await supabaseAdmin.storage
        .from('update-logs')
        .upload(filePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        // 버킷이 없을 경우를 대비한 더 자세한 에러 메시지
        if (error.message?.includes('bucket') || error.message?.includes('not found')) {
          return NextResponse.json(
            { success: false, error: 'Storage bucket "update-logs" not found. Please create it in Supabase.' },
            { status: 500 }
          );
        }
        
        // RLS 에러인 경우
        if (error.message?.includes('row-level security') || error.message?.includes('policy') || error.statusCode === '403') {
          return NextResponse.json(
            { success: false, error: 'Storage RLS policy violation. Please disable RLS for the update-logs bucket in Supabase Storage settings.' },
            { status: 403 }
          );
        }
        
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      // Public URL 생성
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('update-logs')
        .getPublicUrl(filePath);

      return NextResponse.json({ 
        success: true, 
        url: publicUrl 
      });
    } catch (uploadError) {
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Request failed: ${error.message}` },
      { status: 500 }
    );
  }
}