'use client';

export default function UpdateLogsPage() {
  // 정적 업데이트 로그 데이터
  const logs = [
    {
      id: 5,
      date: '2025년 12월 1일',
      updates: [
        '백업 DB 적용 기본 30일로 변경',
        '주문페이지 필터 수량 오류 수정',
        '서버 9번에서 댓글 수정, 삭제 감지 적용'
      ]
    },
    {
      id: 4,
      date: '2025년 11월 25일',
      updates: [
        '서버 9번에서 수령일이 +9시간으로 저장되던 문제를 해결함',
        '서버 9번에서 기본키 할당량 초과시 백업키로 댓글까지 적용',
        '주문 중복 저장 문제 해결',
        '일괄버튼 네트워크 요청 최적화',
        '동기화 기능, 버튼 추가'
      ]
    },
    {
      id: 3,
      date: '2025년 11월 9일',
      updates: [
        '주문 수정이 안되던 문제를 해결',
        'raw모드에서 주문 검색시 초기화가 안되던 문제를 해결',
        '상품 이미지 proxy 해결'
      ]
    },
    {
      id: 2,
      date: '2025년 11월 8일',
      updates: [
        '공지사항으로 추출된 게시물을 상품게시물로 전환 가능하게 수정',
        '수령일 시간 감지 누락 문제 해결',
        '주문관리 베타페이지에 상품정보가 다 보이게 수정',
        '주문관리 베타페이지 일괄 버튼 버그 수정',
        '주문관리 베타페이지에서 대표주문만 보이게 설정 추가'
      ]
    },
    {
      id: 1,
      date: '2025년 11월 7일',
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