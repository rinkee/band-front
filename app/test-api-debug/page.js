'use client';

import { useState } from 'react';

export default function TestAPIDebug() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testBandAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== Band API 디버깅 시작 =====');
      
      // Step 1: 게시물 목록 가져오기
      console.log('Step 1: 게시물 목록 가져오기');
      const postsParams = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
        locale: 'ko_KR',
        limit: '5'
      };
      
      console.log('게시물 API 파라미터:', postsParams);
      
      const postsResponse = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/band/posts',
          params: postsParams,
          method: 'GET'
        }),
      });

      const postsData = await postsResponse.json();
      console.log('게시물 API 응답:', postsData);
      
      if (postsData.result_code !== 1) {
        throw new Error(`게시물 API 오류: ${postsData.result_data?.message || postsData.message}`);
      }
      
      const posts = postsData.result_data?.items || [];
      const testResults = {
        posts_count: posts.length,
        posts: [],
        comments_tests: []
      };
      
      // 처음 3개 게시물의 정보만 저장
      for (let i = 0; i < Math.min(3, posts.length); i++) {
        const post = posts[i];
        testResults.posts.push({
          post_key: post.post_key,
          band_key: post.band.band_key,
          comment_count: post.comment_count,
          content_preview: post.content?.substring(0, 50)
        });
      }
      
      // Step 2: 각 게시물의 댓글 가져오기 테스트
      console.log('\nStep 2: 각 게시물의 댓글 가져오기');
      
      for (let i = 0; i < Math.min(3, posts.length); i++) {
        const post = posts[i];
        console.log(`\n게시물 ${i+1} 댓글 테스트:`, {
          post_key: post.post_key,
          expected_comments: post.comment_count
        });
        
        // 방법 1: band_key from post.band
        const params1 = {
          access_token: postsParams.access_token,
          band_key: post.band.band_key,  // post.band.band_key 사용
          post_key: post.post_key
        };
        
        console.log('댓글 API 파라미터 (band_key from post):', params1);
        
        try {
          const response1 = await fetch('/api/band-api', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: '/band/post/comments',
              params: params1,
              method: 'GET'
            }),
          });
          
          const data1 = await response1.json();
          console.log('댓글 API 응답 (band_key from post):', {
            result_code: data1.result_code,
            message: data1.result_data?.message || data1.message,
            comments_count: data1.result_data?.items?.length || 0
          });
          
          testResults.comments_tests.push({
            post_key: post.post_key,
            method: 'band_key from post.band',
            band_key_used: post.band.band_key,
            success: data1.result_code === 1,
            comments_retrieved: data1.result_data?.items?.length || 0,
            expected_comments: post.comment_count,
            error: data1.result_code !== 1 ? (data1.result_data?.message || data1.message) : null
          });
        } catch (err) {
          console.error('댓글 API 오류:', err);
          testResults.comments_tests.push({
            post_key: post.post_key,
            method: 'band_key from post.band',
            error: err.message
          });
        }
        
        // 방법 2: 원래 band_key 사용
        const params2 = {
          access_token: postsParams.access_token,
          band_key: postsParams.band_key,  // 원래 band_key 사용
          post_key: post.post_key
        };
        
        console.log('댓글 API 파라미터 (original band_key):', params2);
        
        try {
          const response2 = await fetch('/api/band-api', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: '/band/post/comments',
              params: params2,
              method: 'GET'
            }),
          });
          
          const data2 = await response2.json();
          console.log('댓글 API 응답 (original band_key):', {
            result_code: data2.result_code,
            message: data2.result_data?.message || data2.message,
            comments_count: data2.result_data?.items?.length || 0
          });
          
          testResults.comments_tests.push({
            post_key: post.post_key,
            method: 'original band_key',
            band_key_used: postsParams.band_key,
            success: data2.result_code === 1,
            comments_retrieved: data2.result_data?.items?.length || 0,
            expected_comments: post.comment_count,
            error: data2.result_code !== 1 ? (data2.result_data?.message || data2.message) : null
          });
        } catch (err) {
          console.error('댓글 API 오류:', err);
          testResults.comments_tests.push({
            post_key: post.post_key,
            method: 'original band_key',
            error: err.message
          });
        }
      }
      
      console.log('\n===== 테스트 완료 =====');
      console.log('최종 결과:', testResults);
      
      setResult(testResults);
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Band API 디버깅</h1>
      
      <div className="mb-4">
        <p className="text-gray-600">Band API의 게시물과 댓글 API를 테스트하여 올바른 파라미터를 찾습니다.</p>
      </div>
      
      <button
        onClick={testBandAPI}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? '테스트 중...' : 'API 디버깅 시작'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          <h2 className="font-bold">에러:</h2>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-gray-100 rounded">
            <h2 className="font-bold mb-2">게시물 목록 ({result.posts_count}개)</h2>
            {result.posts.map((post, idx) => (
              <div key={idx} className="mb-2 p-2 bg-white rounded">
                <div className="text-sm">
                  <div><strong>Post Key:</strong> {post.post_key}</div>
                  <div><strong>Band Key:</strong> {post.band_key}</div>
                  <div><strong>댓글 수:</strong> {post.comment_count}</div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 bg-blue-100 rounded">
            <h2 className="font-bold mb-2">댓글 API 테스트 결과</h2>
            {result.comments_tests.map((test, idx) => (
              <div key={idx} className={`mb-2 p-2 rounded ${test.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-sm">
                  <div><strong>Post Key:</strong> {test.post_key}</div>
                  <div><strong>Method:</strong> {test.method}</div>
                  <div><strong>Band Key Used:</strong> {test.band_key_used}</div>
                  <div><strong>Success:</strong> {test.success ? '✅' : '❌'}</div>
                  <div><strong>Comments:</strong> {test.comments_retrieved} / {test.expected_comments}</div>
                  {test.error && <div className="text-red-600"><strong>Error:</strong> {test.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}