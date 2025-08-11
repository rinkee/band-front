'use client';

import { useState } from 'react';

export default function TestBandList() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedBand, setSelectedBand] = useState(null);

  const testGetBands = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== 밴드 목록 가져오기 =====');
      
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5'
      };
      
      console.log('요청 파라미터:', params);
      
      // 밴드 목록 가져오기
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/bands',
          params: params,
          method: 'GET'
        }),
      });

      const data = await response.json();
      console.log('밴드 목록 응답:', data);
      
      if (data.result_code === 1) {
        const bands = data.result_data?.bands || [];
        
        const bandInfo = bands.map(band => ({
          band_key: band.band_key,
          name: band.name,
          member_count: band.member_count,
          cover: band.cover
        }));
        
        setResult({
          total_bands: bands.length,
          bands: bandInfo,
          original_band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
          match_found: bands.some(b => b.band_key === 'AAA6JNnUtJZ3Y82443310LvQa')
        });
        
        // 첫 번째 밴드를 자동 선택
        if (bands.length > 0) {
          setSelectedBand(bands[0]);
        }
        
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

  const testBandPosts = async (bandKey) => {
    setLoading(true);
    setError(null);

    try {
      console.log(`===== ${bandKey} 밴드의 게시물 가져오기 =====`);
      
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: bandKey,
        locale: 'ko_KR'
      };
      
      console.log('게시물 요청 파라미터:', params);
      
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/band/posts',
          params: params,
          method: 'GET'
        }),
      });

      const data = await response.json();
      console.log('게시물 응답:', data);
      
      if (data.result_code === 1) {
        const posts = data.result_data?.items || [];
        
        setResult(prev => ({
          ...prev,
          selected_band_posts: {
            band_key: bandKey,
            total_posts: posts.length,
            posts: posts.slice(0, 3).map(post => ({
              post_key: post.post_key,
              content: post.content?.substring(0, 100),
              comment_count: post.comment_count
            }))
          }
        }));
        
        // 첫 번째 게시물의 댓글 테스트
        if (posts.length > 0) {
          testPostComments(bandKey, posts[0].post_key);
        }
        
      } else {
        setResult(prev => ({
          ...prev,
          selected_band_posts: {
            band_key: bandKey,
            error: data.result_data?.message || data.message || 'Failed to get posts'
          }
        }));
      }
      
    } catch (err) {
      console.error('게시물 테스트 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const testPostComments = async (bandKey, postKey) => {
    try {
      console.log(`===== 댓글 가져오기: ${postKey} =====`);
      
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: bandKey,
        post_key: postKey
      };
      
      console.log('댓글 요청 파라미터:', params);
      
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/band/post/comments',
          params: params,
          method: 'GET'
        }),
      });

      const data = await response.json();
      console.log('댓글 응답:', data);
      
      if (data.result_code === 1) {
        const comments = data.result_data?.items || [];
        
        setResult(prev => ({
          ...prev,
          test_comment: {
            post_key: postKey,
            success: true,
            comment_count: comments.length,
            has_paging: !!data.result_data?.paging?.next_params
          }
        }));
      } else {
        setResult(prev => ({
          ...prev,
          test_comment: {
            post_key: postKey,
            success: false,
            error: data.result_data?.message || data.message
          }
        }));
      }
      
    } catch (err) {
      console.error('댓글 테스트 실패:', err);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Band 목록 및 접근 권한 테스트</h1>
      
      <div className="mb-4 p-4 bg-yellow-100 rounded">
        <p className="text-sm">현재 토큰으로 접근 가능한 밴드를 확인합니다.</p>
        <p className="text-xs mt-2 text-red-600">기존 band_key: AAA6JNnUtJZ3Y82443310LvQa</p>
      </div>
      
      <button
        onClick={testGetBands}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? '로딩 중...' : '밴드 목록 가져오기'}
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
            <h2 className="font-bold mb-2">접근 가능한 밴드 ({result.total_bands}개)</h2>
            <div className={`mb-2 p-2 rounded ${result.match_found ? 'bg-green-100' : 'bg-red-100'}`}>
              <strong>기존 band_key 매치:</strong> {result.match_found ? '✅ 찾음' : '❌ 없음'}
            </div>
            
            {result.bands && result.bands.map((band, idx) => (
              <div key={idx} className="mb-2 p-3 bg-white rounded shadow">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{band.name}</div>
                    <div className="text-sm text-gray-600">
                      <div>Band Key: {band.band_key}</div>
                      <div>멤버: {band.member_count}명</div>
                    </div>
                  </div>
                  <button
                    onClick={() => testBandPosts(band.band_key)}
                    disabled={loading}
                    className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    게시물 테스트
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {result.selected_band_posts && (
            <div className="p-4 bg-blue-100 rounded">
              <h3 className="font-bold mb-2">선택한 밴드의 게시물</h3>
              {result.selected_band_posts.error ? (
                <div className="text-red-600">에러: {result.selected_band_posts.error}</div>
              ) : (
                <div>
                  <div>총 {result.selected_band_posts.total_posts}개 게시물</div>
                  {result.selected_band_posts.posts?.map((post, idx) => (
                    <div key={idx} className="mt-2 p-2 bg-white rounded">
                      <div className="text-sm">
                        <div><strong>Post Key:</strong> {post.post_key}</div>
                        <div><strong>댓글:</strong> {post.comment_count}개</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {result.test_comment && (
            <div className={`p-4 rounded ${result.test_comment.success ? 'bg-green-100' : 'bg-red-100'}`}>
              <h3 className="font-bold mb-2">댓글 API 테스트</h3>
              <div className="text-sm">
                <div>Post Key: {result.test_comment.post_key}</div>
                {result.test_comment.success ? (
                  <>
                    <div>✅ 성공: {result.test_comment.comment_count}개 댓글</div>
                    <div>페이징: {result.test_comment.has_paging ? '있음' : '없음'}</div>
                  </>
                ) : (
                  <div>❌ 실패: {result.test_comment.error}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}