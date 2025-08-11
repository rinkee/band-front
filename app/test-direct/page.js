'use client';

import { useState } from 'react';

export default function TestDirect() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testDirectAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 직접 Band API 테스트
      const postKey = 'AAA0AXbImgrbukT6-pKoXXoZ'; // 실제로 존재하는 게시물
      const userId = 'cda8244e-b5c1-4f08-9129-555b4122e1bd';
      
      console.log('=== Band API 직접 테스트 ===');
      console.log('Post Key:', postKey);
      console.log('User ID:', userId);
      
      const response = await fetch('/api/test-band-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postKey, userId })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API 호출 실패');
      }
      
      const data = await response.json();
      console.log('=== Band API 테스트 결과 ===');
      console.log('전체 응답:', data);
      
      if (data.first_comment) {
        console.log('=== 첫 번째 댓글 전체 구조 ===');
        console.log(data.first_comment);
        console.log('댓글 키 필드들:', Object.keys(data.first_comment));
      }
      
      console.log('=== 모든 댓글의 comment_key 상태 ===');
      console.log(data.all_comment_keys);
      
      setResult(data);

    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Band API 직접 테스트</h1>
      
      <button 
        onClick={testDirectAPI}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '테스트 중...' : 'Band API 테스트'}
      </button>

      {error && (
        <div style={{ marginTop: '20px', color: 'red' }}>
          <h3>에러:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h3>테스트 성공!</h3>
          
          <h4>요약:</h4>
          <p>댓글 수: {result.comments_count}</p>
          <p>Result Code: {result.result_code}</p>
          
          {result.first_comment && (
            <>
              <h4>첫 번째 댓글 comment_key 체크:</h4>
              <pre>{JSON.stringify({
                comment_key: result.first_comment.comment_key,
                has_comment_key: 'comment_key' in result.first_comment,
                content_preview: result.first_comment.content?.substring(0, 50) || result.first_comment.body?.substring(0, 50)
              }, null, 2)}</pre>
            </>
          )}
          
          <h4>모든 댓글 키 상태:</h4>
          <pre>{JSON.stringify(result.all_comment_keys, null, 2)}</pre>
          
          <details>
            <summary>전체 데이터 보기</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
      
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5' }}>
        <p><strong>테스트 게시물:</strong> AAA0AXbImgrbukT6-pKoXXoZ</p>
        <p><strong>사용자 ID:</strong> cda8244e-b5c1-4f08-9129-555b4122e1bd</p>
        <p>콘솔을 열어서 상세 로그를 확인하세요.</p>
      </div>
    </div>
  );
}