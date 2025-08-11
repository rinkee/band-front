'use client';

import { useState } from 'react';

export default function TestCommentLimit() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testCommentAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Band API 토큰과 키 (개발 환경 - 새 토큰)
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
        post_key: 'AABJAXbIl_aJxLKOHRULAQG6' // comment_count가 8인 게시물로 변경
      };

      console.log('테스트 시작 - 댓글 API 호출 (페이지네이션 테스트)');
      
      // 모든 댓글 가져오기 (페이지네이션)
      let allComments = [];
      let nextParams = null;
      let pageCount = 0;
      let hasMore = true;
      
      while (hasMore && pageCount < 5) { // 최대 5페이지까지
        pageCount++;
        const currentParams = nextParams ? { ...params, ...nextParams } : params;
        
        console.log(`${pageCount}번째 페이지 요청, params:`, currentParams);
        
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: '/band/post/comments',
            params: currentParams,
            method: 'GET'
          }),
        });

        const data = await response.json();
        
        console.log(`${pageCount}번째 페이지 전체 응답:`, data);
        console.log(`${pageCount}번째 페이지 응답 요약:`, {
          result_code: data.result_code,
          items_count: data.result_data?.items?.length || 0,
          has_next: !!data.result_data?.paging?.next_params,
          error_message: data.result_data?.message || data.message
        });
        
        if (data.result_code === 1) {
          const comments = data.result_data?.items || [];
          allComments = allComments.concat(comments);
          
          // 다음 페이지 확인
          if (data.result_data?.paging?.next_params) {
            nextParams = data.result_data.paging.next_params;
            console.log('다음 페이지 파라미터:', nextParams);
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
          setError(`API 오류: ${data.result_data?.message || 'Unknown error'}`);
        }
      }
      
      // 결과 정리
      const commentInfo = {
        total_count: allComments.length,
        page_count: pageCount,
        comments: allComments.map(c => ({
          comment_key: c.comment_key,
          author_name: c.author?.name,
          content: c.content?.substring(0, 50) + '...',
          created_at: c.created_at
        }))
      };
      
      setResult(commentInfo);
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testMultiplePosts = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 여러 게시물의 댓글 수 확인
      const postKeys = [
        'AAA0AXbImgrbukT6-pKoXXoZ', // comment_count: 3
        'AABJAXbImCu8T7JqTkeFkFvk', // comment_count: 8
        'AAAfAXbIl_aJxLKOHRULAQG6'  // comment_count: 4
      ];
      
      const results = [];
      
      for (const postKey of postKeys) {
        const params = {
          access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
          band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
          post_key: postKey
        };
        
        const response = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: '/band/post/comments',
            params,
            method: 'GET'
          }),
        });
        
        const data = await response.json();
        
        if (data.result_code === 1) {
          const comments = data.result_data?.items || [];
          results.push({
            post_key: postKey,
            comment_count: comments.length,
            has_paging: !!data.result_data?.paging?.next_params
          });
        }
      }
      
      setResult({ multiple_posts: results });
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Band API 댓글 제한 테스트</h1>
      
      <div className="space-y-4">
        <button
          onClick={testCommentAPI}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 mr-4"
        >
          {loading ? '테스트 중...' : '단일 게시물 댓글 테스트'}
        </button>
        
        <button
          onClick={testMultiplePosts}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : '여러 게시물 댓글 수 테스트'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          <h2 className="font-bold">에러:</h2>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h2 className="font-bold mb-2">테스트 결과:</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}