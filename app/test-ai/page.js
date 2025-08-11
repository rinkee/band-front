'use client';

import { useState } from 'react';

export default function TestAI() {
  const [content, setContent] = useState(`[오늘 수령]
사과 1개 500원
사과 2개 900원
사과 3개 1,300원

오후 4시 도착 예정입니다.`);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testAI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/ai/product-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          postTime: new Date().toISOString(),
          postKey: 'test_' + Date.now()
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'AI 처리 실패');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI 상품 추출 테스트</h1>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          테스트 게시물 내용:
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-40 p-2 border rounded-md"
          placeholder="게시물 내용을 입력하세요..."
        />
      </div>

      <button
        onClick={testAI}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {loading ? 'AI 처리 중...' : 'AI 테스트'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">에러:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded">
          <h3 className="font-bold mb-2">AI 추출 결과:</h3>
          <pre className="whitespace-pre-wrap text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-8 p-4 bg-yellow-100 border border-yellow-400 rounded">
        <h3 className="font-bold mb-2">⚠️ 중요 안내:</h3>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            <strong>Google API 키 설정 필요:</strong>
            <br />
            <code className="bg-gray-200 px-1">front/.env.local</code> 파일에서 
            <code className="bg-gray-200 px-1 ml-1">GOOGLE_API_KEY</code> 설정
          </li>
          <li>
            API 키 발급:
            <br />
            <a 
              href="https://makersuite.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              https://makersuite.google.com/app/apikey
            </a>
          </li>
          <li>
            서버 재시작 필요:
            <br />
            환경변수 변경 후 <code className="bg-gray-200 px-1">npm run dev</code> 재실행
          </li>
        </ol>
      </div>
    </div>
  );
}