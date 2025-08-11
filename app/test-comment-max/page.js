'use client';

import { useState } from 'react';

export default function TestCommentMax() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 테스트할 Band 정보
  const BAND_CONFIG = {
    access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
    band_key: 'AAAZhwt1BC6KT8fYMbZDfwXN'  // 새로운 band_key
  };

  const testCommentLimit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== 댓글 API 한 번 호출 최대 개수 테스트 =====');
      console.log('Band Key:', BAND_CONFIG.band_key);
      
      // Step 1: 게시물 목록 가져오기
      console.log('\nStep 1: 게시물 목록 가져오기');
      const postsParams = {
        access_token: BAND_CONFIG.access_token,
        band_key: BAND_CONFIG.band_key,
        locale: 'ko_KR',
        limit: '10'
      };
      
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
      console.log('게시물 API 응답:', {
        result_code: postsData.result_code,
        posts_count: postsData.result_data?.items?.length || 0
      });
      
      if (postsData.result_code !== 1) {
        throw new Error(`게시물 API 오류: ${postsData.result_data?.message || postsData.message}`);
      }
      
      const posts = postsData.result_data?.items || [];
      const testResults = {
        band_key: BAND_CONFIG.band_key,
        total_posts: posts.length,
        posts_tested: [],
        max_comments_per_call: 0,
        summary: {
          posts_with_pagination: 0,
          posts_without_pagination: 0,
          average_comments_per_call: 0
        }
      };
      
      // Step 2: 처음 5개 게시물의 댓글 테스트
      console.log('\nStep 2: 각 게시물의 댓글 가져오기 (첫 번째 호출만)');
      
      for (let i = 0; i < Math.min(5, posts.length); i++) {
        const post = posts[i];
        console.log(`\n게시물 ${i + 1}/${Math.min(5, posts.length)}:`, {
          post_key: post.post_key,
          expected_comments: post.comment_count
        });
        
        // 첫 번째 댓글 API 호출 (페이지네이션 없이)
        const commentsParams = {
          access_token: BAND_CONFIG.access_token,
          band_key: BAND_CONFIG.band_key,
          post_key: post.post_key
        };
        
        const commentsResponse = await fetch('/api/band-api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: '/band/post/comments',
            params: commentsParams,
            method: 'GET'
          }),
        });

        const commentsData = await commentsResponse.json();
        
        if (commentsData.result_code === 1) {
          const comments = commentsData.result_data?.items || [];
          const hasPaging = !!commentsData.result_data?.paging?.next_params;
          
          console.log(`댓글 결과:`, {
            retrieved: comments.length,
            expected: post.comment_count,
            has_pagination: hasPaging,
            percentage: post.comment_count > 0 ? 
              Math.round((comments.length / post.comment_count) * 100) + '%' : 'N/A'
          });
          
          // 최대값 업데이트
          if (comments.length > testResults.max_comments_per_call) {
            testResults.max_comments_per_call = comments.length;
          }
          
          // 페이징 정보 확인
          if (hasPaging) {
            testResults.summary.posts_with_pagination++;
            console.log('페이징 파라미터:', commentsData.result_data.paging.next_params);
          } else {
            testResults.summary.posts_without_pagination++;
          }
          
          // 모든 댓글 가져오기 (페이지네이션 포함)
          let allComments = [...comments];
          let nextParams = commentsData.result_data?.paging?.next_params;
          let pageCount = 1;
          
          while (nextParams && pageCount < 10) {
            pageCount++;
            console.log(`  페이지 ${pageCount} 요청 중...`);
            
            const nextResponse = await fetch('/api/band-api', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                endpoint: '/band/post/comments',
                params: nextParams,
                method: 'GET'
              }),
            });

            const nextData = await nextResponse.json();
            
            if (nextData.result_code === 1) {
              const nextComments = nextData.result_data?.items || [];
              allComments = allComments.concat(nextComments);
              console.log(`  페이지 ${pageCount}: ${nextComments.length}개 추가 (총 ${allComments.length}개)`);
              
              nextParams = nextData.result_data?.paging?.next_params;
            } else {
              break;
            }
          }
          
          testResults.posts_tested.push({
            post_key: post.post_key,
            content_preview: post.content?.substring(0, 50),
            expected_comments: post.comment_count,
            first_call_comments: comments.length,
            total_comments_retrieved: allComments.length,
            pages_needed: pageCount,
            has_pagination: hasPaging,
            complete: allComments.length === post.comment_count
          });
          
        } else {
          console.error('댓글 API 오류:', commentsData);
          testResults.posts_tested.push({
            post_key: post.post_key,
            error: commentsData.result_data?.message || commentsData.message
          });
        }
      }
      
      // 평균 계산
      const validPosts = testResults.posts_tested.filter(p => !p.error);
      if (validPosts.length > 0) {
        const totalFirstCall = validPosts.reduce((sum, p) => sum + p.first_call_comments, 0);
        testResults.summary.average_comments_per_call = Math.round(totalFirstCall / validPosts.length);
      }
      
      console.log('\n===== 테스트 완료 =====');
      console.log('최대 댓글 수 (한 번 호출):', testResults.max_comments_per_call);
      console.log('평균 댓글 수 (한 번 호출):', testResults.summary.average_comments_per_call);
      
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
      <h1 className="text-2xl font-bold mb-4">Band API 댓글 최대 개수 테스트</h1>
      
      <div className="mb-4 p-4 bg-yellow-100 rounded">
        <h2 className="font-semibold">테스트 목적</h2>
        <p className="text-sm mt-1">페이지네이션 없이 한 번의 API 호출로 최대 몇 개의 댓글을 가져오는지 확인</p>
        <p className="text-xs mt-2">Band Key: {BAND_CONFIG.band_key}</p>
      </div>
      
      <button
        onClick={testCommentLimit}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? '테스트 중...' : '댓글 한계 테스트 시작'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          <h2 className="font-bold">에러:</h2>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          {/* 요약 정보 */}
          <div className="p-4 bg-blue-100 rounded">
            <h2 className="font-bold mb-2">테스트 요약</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-semibold">최대 댓글 수 (한 번 호출)</div>
                <div className="text-2xl font-bold text-blue-600">
                  {result.max_comments_per_call}개
                </div>
              </div>
              <div>
                <div className="font-semibold">평균 댓글 수 (한 번 호출)</div>
                <div className="text-2xl font-bold text-green-600">
                  {result.summary.average_comments_per_call}개
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm">
              <div>페이지네이션 필요: {result.summary.posts_with_pagination}개 게시물</div>
              <div>페이지네이션 불필요: {result.summary.posts_without_pagination}개 게시물</div>
            </div>
          </div>
          
          {/* 게시물별 상세 */}
          <div className="p-4 bg-gray-100 rounded">
            <h2 className="font-bold mb-2">게시물별 테스트 결과</h2>
            {result.posts_tested?.map((post, idx) => (
              <div key={idx} className={`mb-3 p-3 rounded ${
                post.error ? 'bg-red-50' : 
                post.complete ? 'bg-green-50' : 
                post.has_pagination ? 'bg-yellow-50' : 'bg-white'
              }`}>
                <div className="font-semibold mb-1">
                  게시물 {idx + 1}: {post.content_preview}...
                </div>
                {post.error ? (
                  <div className="text-red-600 text-sm">에러: {post.error}</div>
                ) : (
                  <div className="text-sm space-y-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>예상 댓글: {post.expected_comments}개</div>
                      <div>첫 호출: <span className="font-bold">{post.first_call_comments}개</span></div>
                      <div>총 가져온 댓글: {post.total_comments_retrieved}개</div>
                      <div>필요한 페이지: {post.pages_needed}페이지</div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          post.has_pagination ? 'bg-yellow-200' : 'bg-green-200'
                        }`}>
                          {post.has_pagination ? '페이지네이션 필요' : '한 번에 모두 가져옴'}
                        </span>
                        {post.complete && (
                          <span className="px-2 py-1 bg-green-200 rounded text-xs">
                            ✅ 완전히 가져옴
                          </span>
                        )}
                      </div>
                      {post.expected_comments > 0 && (
                        <div className="mt-1 text-xs text-gray-600">
                          첫 호출로 {Math.round((post.first_call_comments / post.expected_comments) * 100)}% 가져옴
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}