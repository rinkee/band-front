import { NextResponse } from 'next/server';
import supabase from '../../../lib/supabaseClient';

export async function POST(request) {
  try {
    const { userId, bandKey } = await request.json();

    // 필수 파라미터 확인
    if (!userId || !bandKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 사용자 권한 확인
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 밴드 키 업데이트
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({ 
        band_key: bandKey,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating band key:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update band key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updateData,
      message: 'Band key updated successfully'
    });

  } catch (error) {
    console.error('Error in update-band-key API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}