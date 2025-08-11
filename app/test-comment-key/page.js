'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BandApiFailover } from '../lib/band-processor/core/bandApiClient.js';

export default function TestCommentKey() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testCommentKey = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 테스트용 userId (실제 사용자 ID로 변경 필요)
      const userId = 'cda8244e-b5c1-4f08-9129-555b4122e1bd';
      
      // 최근 게시물 가져오기
      const { data: posts, error: postError } = await supabase
        .from('posts')
        .select('post_key, band_key, comment_count')
        .eq('user_id', userId)
        .gt('comment_count', 0)
        .order('updated_at', { ascending: false })  // created_at이 아닌 updated_at 사용
        .limit(1);

      if (postError || !posts || posts.length === 0) {
        throw new Error('게시물을 찾을 수 없습니다');
      }

      const post = posts[0];
      console.log('테스트할 게시물:', post);

      // 먼저 테스트 API로 Band API 원본 응답 확인
      console.log('=== Band API 원본 응답 테스트 ===');
      const testResponse = await fetch('/api/test-band-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postKey: post.post_key, userId })
      });
      
      if (testResponse.ok) {
        const testData = await testResponse.json();
        console.log('Band API 테스트 결과:', testData);
        console.log('첫 번째 댓글 전체:', testData.first_comment);
        console.log('모든 댓글의 comment_key 상태:', testData.all_comment_keys);
      }

      // 기존 BandApiFailover로 댓글 가져오기
      const sessionId = `test_${Date.now()}`;
      const failover = new BandApiFailover(supabase, userId, sessionId);
      await failover.loadApiKeys();
      
      console.log('=== BandApiFailover로 댓글 가져오기 ===');
      console.log('Post Key:', post.post_key);
      
      const commentsResult = await failover.fetchBandComments(post.post_key);
      const comments = commentsResult.comments || [];

      console.log('가져온 댓글 수:', comments.length);
      console.log('=== BandApiFailover 응답 ===');
      console.log('commentsResult:', commentsResult);
      
      // 첫 번째 댓글의 구조 확인
      if (comments.length > 0) {
        const firstComment = comments[0];
        console.log('첫 번째 댓글 전체 구조:', firstComment);
        console.log('첫 번째 댓글 키 필드들:', {
          comment_key: firstComment.comment_key,
          commentKey: firstComment.commentKey,
          key: firstComment.key,
          모든_키: Object.keys(firstComment)
        });
      }

      setResult({
        postKey: post.post_key,
        commentCount: comments.length,
        firstComment: comments[0] || null,
        allKeys: comments[0] ? Object.keys(comments[0]) : []
      });

    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Comment Key 테스트</h1>
      
      <button 
        onClick={testCommentKey}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '테스트 중...' : '댓글 구조 테스트'}
      </button>

      {error && (
        <div style={{ marginTop: '20px', color: 'red' }}>
          <h3>에러:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h3>테스트 결과:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
          
          {result.firstComment && (
            <>
              <h3>첫 번째 댓글 전체 데이터:</h3>
              <pre>{JSON.stringify(result.firstComment, null, 2)}</pre>
            </>
          )}
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <p>콘솔을 열어서 상세 로그를 확인하세요.</p>
      </div>
    </div>
  );
}