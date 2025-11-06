'use client';

export default function UpdateLogsPage() {
  // 정적 업데이트 로그 데이터
  const logs = [
    {
      id: 1,
      date: '2025년 1월 7일',
      updates: [
        '상품 추가 오류 수정',
        '상품 가격 수정 시 기존 주문 자동 업데이트 기능 추가',
        '게시물 날짜 표시 오류 수정'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">업데이트 로그</h1>

        {/* 업데이트 로그 목록 */}
        <div className="space-y-6">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                {log.date} 수정사항
              </h2>
              <ul className="space-y-2">
                {log.updates.map((update, index) => (
                  <li key={index} className="flex items-start text-gray-700">
                    <span className="mr-2 text-blue-600">•</span>
                    <span>{update}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}