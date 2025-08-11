'use client';

import { useState } from 'react';

export default function TestSimpleAPI() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testDirectAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== Band API 직접 테스트 =====');
      
      // 가장 기본적인 파라미터로 테스트
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa'
      };
      
      console.log('요청 파라미터:', params);
      
      // 직접 Band API 호출 (프록시 경유)
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

      console.log('응답 상태:', response.status);
      
      const data = await response.json();
      console.log('전체 응답 데이터:', data);
      
      // 응답 분석
      const analysis = {
        status: response.status,
        result_code: data.result_code,
        has_result_data: !!data.result_data,
        error_message: data.result_data?.message || data.message || null,
        error_code: data.result_data?.code || data.code || null,
        response_keys: Object.keys(data),
        result_data_keys: data.result_data ? Object.keys(data.result_data) : [],
        items_count: data.result_data?.items?.length || 0
      };
      
      setResult(analysis);
      
      // Band Developer 사이트의 예제와 비교
      console.log('\n===== 파라미터 검증 =====');
      console.log('access_token 길이:', params.access_token.length);
      console.log('access_token 첫 10자:', params.access_token.substring(0, 10));
      console.log('band_key:', params.band_key);
      console.log('band_key 형식 확인:', /^AAA[a-zA-Z0-9]+$/.test(params.band_key));
      
    } catch (err) {
      console.error('테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testWithLocale = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== locale 파라미터 추가 테스트 =====');
      
      // locale 파라미터 추가
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5',
        band_key: 'AAA6JNnUtJZ3Y82443310LvQa',
        locale: 'ko_KR'
      };
      
      console.log('요청 파라미터 (with locale):', params);
      
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
      console.log('locale 포함 응답:', data);
      
      setResult({
        with_locale: true,
        status: response.status,
        result_code: data.result_code,
        success: data.result_code === 1,
        items_count: data.result_data?.items?.length || 0,
        error: data.result_data?.message || data.message || null
      });
      
    } catch (err) {
      console.error('locale 테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testProfile = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('===== 프로필 정보 테스트 =====');
      
      // 프로필 API로 토큰 유효성 확인
      const params = {
        access_token: 'ZQAAAb8wL-WFHvMmIjwvcQHSkcaOfINnsWWaylyY2t2zXJE3igobOID3_XepLqwi5kQetWObmIMsY_fsOnN1h4rkmRTDWD4J71Kuge44qqCvY0j5'
      };
      
      console.log('프로필 요청 파라미터:', params);
      
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/profile',
          params: params,
          method: 'GET'
        }),
      });

      const data = await response.json();
      console.log('프로필 응답:', data);
      
      setResult({
        profile_test: true,
        status: response.status,
        result_code: data.result_code,
        success: data.result_code === 1,
        user_name: data.result_data?.name || null,
        user_key: data.result_data?.user_key || null,
        error: data.result_data?.message || data.message || null
      });
      
    } catch (err) {
      console.error('프로필 테스트 실패:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Band API 간단 테스트</h1>
      
      <div className="mb-4 p-4 bg-yellow-100 rounded">
        <p className="text-sm">토큰과 band_key가 유효한지 확인합니다.</p>
        <p className="text-xs mt-2">콘솔에서 자세한 로그를 확인하세요.</p>
      </div>
      
      <div className="space-x-4">
        <button
          onClick={testDirectAPI}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : '기본 파라미터 테스트'}
        </button>
        
        <button
          onClick={testWithLocale}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : 'locale 포함 테스트'}
        </button>
        
        <button
          onClick={testProfile}
          disabled={loading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          {loading ? '테스트 중...' : '프로필 테스트 (토큰 확인)'}
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