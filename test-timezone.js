const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hxjywmbivdhettlumvbb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4anl3bWJpdmRoZXR0bHVtdmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIzMTA0MDMsImV4cCI6MjA1Nzg4NjQwM30.oovDowsUrNpo4Pjx51fgSC3KBVJkvehTQ9S6Pv1YDQ4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTimezone() {
  const { data, error } = await supabase
    .from('posts')
    .select('posted_at, title, author_name')
    .order('posted_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('현재 시간:', new Date().toISOString());
  console.log('현재 시간 (한국):', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
  console.log('\nDB 데이터:');

  data.forEach((post, i) => {
    console.log(`\n게시물 ${i + 1}:`);
    console.log('  작성자:', post.author_name);
    console.log('  제목:', post.title?.substring(0, 30));
    console.log('  DB 저장값:', post.posted_at);

    const dbDate = new Date(post.posted_at);
    console.log('  파싱된 UTC:', dbDate.toISOString());
    console.log('  파싱된 KST:', dbDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));

    // 현재 코드의 로직 (9시간 더하기)
    const withOffset = new Date(dbDate.getTime() + 9 * 60 * 60 * 1000);
    const nowWithOffset = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const diffMs = nowWithOffset - withOffset;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    console.log('  현재 코드 계산:', `${diffDays}일 전`);

    // 올바른 계산 (오프셋 없이)
    const now = new Date();
    const correctDiffMs = now - dbDate;
    const correctDiffDays = Math.floor(correctDiffMs / (1000 * 60 * 60 * 24));
    console.log('  올바른 계산:', `${correctDiffDays}일 전`);
  });
}

checkTimezone();
