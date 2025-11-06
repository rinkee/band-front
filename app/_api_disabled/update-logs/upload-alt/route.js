import { NextResponse } from 'next/server';

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

    // 파일명 생성
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${user_id}/${fileName}`;

    try {
      // 파일을 읽기
      const fileData = await file.arrayBuffer();

      // 직접 REST API 호출 (서비스 키 사용)
      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/update-logs/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': file.type,
            'x-upsert': 'false'
          },
          body: fileData
        }
      );

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(error);
      }

      // Public URL 생성
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/update-logs/${filePath}`;

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