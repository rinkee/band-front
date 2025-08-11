'use client';

import { useState } from 'react';

export default function TestBandPosts() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testGetPosts = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Band API 토큰과 키
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
        locale: 'ko_KR',
        limit: '10'
      };

      console.log('게시물 목록 가져오기 시작');
      
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/band/posts',
          params,
          method: 'GET'
        }),
      });

      const data = await response.json();
      
      console.log('Band API 전체 응답:', data);
      
      if (data.result_code === 1) {
        const posts = data.result_data?.items || [];
        
        // 게시물 정보 정리
        const postInfo = posts.map(post => ({
          post_key: post.post_key,
          content: post.content?.substring(0, 100) + '...',
          comment_count: post.comment_count,
          created_at: post.created_at,
          photos: post.photos?.length || 0
        }));
        
        setResult({
          total_posts: posts.length,
          posts: postInfo,
          raw_first_post: posts[0] // 첫 번째 게시물 전체 구조 확인
        });
        
      } else {
        setError(`API 오류: ${data.result_data?.message || data.message || 'Unknown error'}`);
      }
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testGetComments = async (postKey) => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
        post_key: postKey
      };

      console.log('댓글 가져오기 시작, post_key:', postKey);
      console.log('요청 파라미터:', params);
      
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
      
      console.log('댓글 API 전체 응답:', data);
      
      if (data.result_code === 1) {
        const comments = data.result_data?.items || [];
        
        setResult(prev => ({
          ...prev,
          selected_post_comments: {
            post_key: postKey,
            total_comments: comments.length,
            has_paging: !!data.result_data?.paging?.next_params,
            comments: comments.map(c => ({
              comment_key: c.comment_key,
              author_name: c.author?.name,
              content: c.content?.substring(0, 50) + '...'
            }))
          }
        }));
        
      } else {
        setError(`댓글 API 오류: ${data.result_data?.message || data.message || 'Unknown error'}`);
      }
      
    } catch (err) {
      console.error('댓글 테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Band API 게시물 테스트</h1>
      
      <div className="space-y-4">
        <button
          onClick={testGetPosts}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '게시물 목록 가져오기'}
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
          <h2 className="font-bold mb-2">게시물 목록:</h2>
          
          {result.posts && result.posts.map((post, idx) => (
            <div key={idx} className="mb-4 p-3 bg-white rounded shadow">
              <div className="text-sm">
                <div><strong>Post Key:</strong> {post.post_key}</div>
                <div><strong>댓글 수:</strong> {post.comment_count}</div>
                <div><strong>내용:</strong> {post.content}</div>
                <button
                  onClick={() => testGetComments(post.post_key)}
                  disabled={loading}
                  className="mt-2 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                >
                  댓글 가져오기
                </button>
              </div>
            </div>
          ))}
          
          {result.selected_post_comments && (
            <div className="mt-4 p-3 bg-yellow-50 rounded">
              <h3 className="font-bold mb-2">선택한 게시물의 댓글:</h3>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(result.selected_post_comments, null, 2)}
              </pre>
            </div>
          )}
          
          {result.raw_first_post && (
            <div className="mt-4 p-3 bg-blue-50 rounded">
              <h3 className="font-bold mb-2">첫 번째 게시물 전체 구조:</h3>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(result.raw_first_post, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}