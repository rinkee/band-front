'use client';

import { useState } from 'react';

export default function TestFinal() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 올바른 Band 정보
  const BAND_CONFIG = {
    access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
    band_key: 'AACx_YiaV5fqWT_QmHuHUZol',  // 장봐주는 언니 조촌점
    band_name: '장봐주는 언니 조촌점'
  };

  const testGetPosts = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== 게시물 가져오기 테스트 =====');
      console.log('Band:', BAND_CONFIG.band_name);
      
      const params = {
        access_token: BAND_CONFIG.access_token,
        band_key: BAND_CONFIG.band_key,
        locale: 'ko_KR',
        limit: '10'
      };
      
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
      console.log('게시물 응답:', data);
      
      if (data.result_code === 1) {
        const posts = data.result_data?.items || [];
        
        setResult({
          posts_success: true,
          total_posts: posts.length,
          posts: posts.slice(0, 5).map(post => ({
            post_key: post.post_key,
            content: post.content?.substring(0, 100),
            comment_count: post.comment_count,
            created_at: post.created_at
          }))
        });
        
        // 댓글이 많은 게시물 테스트
        const postWithComments = posts.find(p => p.comment_count > 5);
        if (postWithComments) {
          await testCommentsPagination(postWithComments.post_key, postWithComments.comment_count);
        } else if (posts.length > 0) {
          await testCommentsPagination(posts[0].post_key, posts[0].comment_count);
        }
        
      } else {
        setError(`게시물 API 오류: ${data.result_data?.message || data.message}`);
      }
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testCommentsPagination = async (postKey, expectedCount) => {
    try {
      console.log(`\n===== 댓글 페이지네이션 테스트 =====`);
      console.log(`Post Key: ${postKey}, 예상 댓글 수: ${expectedCount}`);
      
      let allComments = [];
      let nextParams = null;
      let pageCount = 0;
      let hasMore = true;
      
      while (hasMore && pageCount < 5) {
        pageCount++;
        
        // 페이지별 파라미터 구성
        let params;
        if (nextParams) {
          // 다음 페이지: next_params 사용
          params = nextParams;
        } else {
          // 첫 페이지
          params = {
            access_token: BAND_CONFIG.access_token,
            band_key: BAND_CONFIG.band_key,
            post_key: postKey
          };
        }
        
        console.log(`${pageCount}번째 페이지 요청:`, {
          post_key: params.post_key || postKey,
          has_after: !!params.after
        });
        
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
          allComments = allComments.concat(comments);
          
          console.log(`${pageCount}번째 페이지 결과:`, {
            comments_count: comments.length,
            total_so_far: allComments.length,
            has_next: !!data.result_data?.paging?.next_params
          });
          
          // 다음 페이지 확인
          if (data.result_data?.paging?.next_params) {
            nextParams = data.result_data.paging.next_params;
          } else {
            hasMore = false;
          }
        } else {
          console.error('댓글 API 오류:', data);
          hasMore = false;
        }
      }
      
      setResult(prev => ({
        ...prev,
        comments_test: {
          post_key: postKey,
          expected_count: expectedCount,
          actual_count: allComments.length,
          page_count: pageCount,
          match: allComments.length === expectedCount,
          comments_sample: allComments.slice(0, 3).map(c => ({
            comment_key: c.comment_key,
            author: c.author?.name,
            content: c.content?.substring(0, 50)
          }))
        }
      }));
      
    } catch (err) {
      console.error('댓글 테스트 실패:', err);
    }
  };

  const testFullProcess = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== 전체 프로세스 테스트 =====');
      
      // 1. 게시물 가져오기
      const postsParams = {
        access_token: BAND_CONFIG.access_token,
        band_key: BAND_CONFIG.band_key,
        locale: 'ko_KR',
        limit: '20'
      };
      
      const postsResponse = await fetch('/api/band-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/band/posts',
          params: postsParams,
          method: 'GET'
        }),
      });

      const postsData = await postsResponse.json();
      
      if (postsData.result_code !== 1) {
        throw new Error('게시물 가져오기 실패');
      }
      
      const posts = postsData.result_data?.items || [];
      const testResults = {
        total_posts: posts.length,
        posts_with_comments: 0,
        total_comments_expected: 0,
        total_comments_retrieved: 0,
        posts_details: []
      };
      
      // 2. 각 게시물의 댓글 가져오기 (처음 5개만)
      for (let i = 0; i < Math.min(5, posts.length); i++) {
        const post = posts[i];
        
        if (post.comment_count > 0) {
          testResults.posts_with_comments++;
          testResults.total_comments_expected += post.comment_count;
          
          // 모든 댓글 가져오기 (페이지네이션 포함)
          let allComments = [];
          let nextParams = null;
          let hasMore = true;
          let pageCount = 0;
          
          while (hasMore && pageCount < 10) {
            pageCount++;
            
            const params = nextParams || {
              access_token: BAND_CONFIG.access_token,
              band_key: BAND_CONFIG.band_key,
              post_key: post.post_key
            };
            
            const response = await fetch('/api/band-api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: '/band/post/comments',
                params,
                method: 'GET'
              }),
            });

            const data = await response.json();
            
            if (data.result_code === 1) {
              const comments = data.result_data?.items || [];
              allComments = allComments.concat(comments);
              
              if (data.result_data?.paging?.next_params) {
                nextParams = data.result_data.paging.next_params;
              } else {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          }
          
          testResults.total_comments_retrieved += allComments.length;
          testResults.posts_details.push({
            post_key: post.post_key,
            expected_comments: post.comment_count,
            retrieved_comments: allComments.length,
            pages_needed: pageCount,
            match: allComments.length === post.comment_count
          });
        }
      }
      
      setResult(testResults);
      
    } catch (err) {
      console.error('전체 테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">최종 Band API 테스트</h1>
      
      <div className="mb-4 p-4 bg-green-100 rounded">
        <h2 className="font-semibold">현재 설정</h2>
        <p className="text-sm mt-1">밴드: {BAND_CONFIG.band_name}</p>
        <p className="text-xs mt-1">Band Key: {BAND_CONFIG.band_key}</p>
      </div>
      
      <div className="space-x-4">
        <button
          onClick={testGetPosts}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : '게시물 & 댓글 테스트'}
        </button>
        
        <button
          onClick={testFullProcess}
          disabled={loading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : '전체 프로세스 테스트'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          <h2 className="font-bold">에러:</h2>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          {result.posts_success && (
            <div className="p-4 bg-gray-100 rounded">
              <h2 className="font-bold mb-2">게시물 ({result.total_posts}개)</h2>
              {result.posts?.map((post, idx) => (
                <div key={idx} className="mb-2 p-2 bg-white rounded text-sm">
                  <div className="font-semibold">댓글 {post.comment_count}개</div>
                  <div className="text-xs text-gray-600">{post.content}</div>
                </div>
              ))}
            </div>
          )}
          
          {result.comments_test && (
            <div className={`p-4 rounded ${result.comments_test.match ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <h2 className="font-bold mb-2">댓글 페이지네이션 테스트</h2>
              <div className="text-sm">
                <div>예상: {result.comments_test.expected_count}개</div>
                <div>실제: {result.comments_test.actual_count}개</div>
                <div>페이지 수: {result.comments_test.page_count}</div>
                <div>매치: {result.comments_test.match ? '✅' : '⚠️'}</div>
              </div>
            </div>
          )}
          
          {result.posts_details && (
            <div className="p-4 bg-blue-100 rounded">
              <h2 className="font-bold mb-2">전체 프로세스 결과</h2>
              <div className="mb-3">
                <div>총 게시물: {result.total_posts}개</div>
                <div>댓글 있는 게시물: {result.posts_with_comments}개</div>
                <div>예상 댓글 총합: {result.total_comments_expected}개</div>
                <div>실제 가져온 댓글: {result.total_comments_retrieved}개</div>
              </div>
              
              <h3 className="font-semibold mb-1">게시물별 상세:</h3>
              {result.posts_details?.map((post, idx) => (
                <div key={idx} className={`mb-1 p-2 rounded text-sm ${post.match ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div>게시물 {idx + 1}: {post.expected_comments} → {post.retrieved_comments} ({post.pages_needed}페이지)</div>
                  <div>{post.match ? '✅ 일치' : '⚠️ 불일치'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}