import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - 모든 업데이트 로그 조회
export async function GET() {
  try {
    const { data: logs, error } = await supabase
      .from('update_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching update logs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - 새 업데이트 로그 생성 (admin only)
export async function POST(request) {
  try {
    const body = await request.json();
    const { version, title, content, image_url, user_id } = body;

    // admin 권한 확인
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', user_id)
      .single();

    if (userError || user?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - User is not admin' },
        { status: 403 }
      );
    }

    // 업데이트 로그 생성
    const { data, error } = await supabase
      .from('update_logs')
      .insert({
        version,
        title,
        content,
        image_url,
        created_by: user_id,
        is_published: true
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating update log:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - 업데이트 로그 수정
export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, version, title, content, image_url, user_id } = body;

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

    // 업데이트
    const { data, error } = await supabase
      .from('update_logs')
      .update({
        version,
        title,
        content,
        image_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating log:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 업데이트 로그 삭제
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const user_id = searchParams.get('user_id');

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

    const { error } = await supabase
      .from('update_logs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting log:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}