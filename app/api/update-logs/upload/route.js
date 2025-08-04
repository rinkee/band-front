import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

    // admin 권한 확인
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', user_id)
      .single();

    if (userError || user?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 파일을 ArrayBuffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 고유한 파일명 생성
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `update-logs/${fileName}`;

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('update-logs-images')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
      });

    if (error) {
      // 버킷이 없으면 생성 시도
      if (error.message.includes('Bucket not found')) {
        const { error: createError } = await supabase.storage.createBucket('update-logs-images', {
          public: true,
        });
        
        if (!createError) {
          // 다시 업로드 시도
          const { data: retryData, error: retryError } = await supabase.storage
            .from('update-logs-images')
            .upload(filePath, buffer, {
              contentType: file.type,
              cacheControl: '3600',
            });
          
          if (retryError) throw retryError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('update-logs-images')
            .getPublicUrl(filePath);
          
          return NextResponse.json({ 
            success: true, 
            url: publicUrl 
          });
        }
      }
      throw error;
    }

    // 공개 URL 가져오기
    const { data: { publicUrl } } = supabase.storage
      .from('update-logs-images')
      .getPublicUrl(filePath);

    return NextResponse.json({ 
      success: true, 
      url: publicUrl 
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}