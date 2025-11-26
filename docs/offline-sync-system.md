# 오프라인 동기화 시스템 문서

> 최종 업데이트: 2025-11-26

## 개요

서버(Supabase)와 연결이 끊어졌을 때 사용자가 계속 영업을 이어갈 수 있도록 IndexedDB 기반의 오프라인 백업 시스템을 구현했습니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 브라우저                           │
│  ┌─────────────────┐         ┌─────────────────────────────┐   │
│  │  /orders-test   │         │    /offline-orders          │   │
│  │   (온라인 모드)   │◄───────►│     (오프라인 모드)           │   │
│  └────────┬────────┘         └──────────────┬──────────────┘   │
│           │                                  │                  │
│           ▼                                  ▼                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    IndexedDB                             │   │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐      │   │
│  │  │  posts  │ │ products │ │ orders │ │ syncQueue │      │   │
│  │  └─────────┘ └──────────┘ └────────┘ └───────────┘      │   │
│  │  ┌───────────┐ ┌──────┐                                  │   │
│  │  │ snapshots │ │ meta │                                  │   │
│  │  └───────────┘ └──────┘                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase 서버                               │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐             │
│  │  posts  │ │ products │ │ orders │ │ customers │             │
│  └─────────┘ └──────────┘ └────────┘ └───────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## 핵심 파일 구조

```
app/
├── lib/
│   ├── indexedDbClient.js      # IndexedDB CRUD 헬퍼
│   └── indexedDbSync.js        # 동기화 유틸리티 함수
├── api/
│   └── sync/
│       └── route.js            # 동기화 API 엔드포인트
├── components/
│   ├── IndexedDBBackupButton.jsx  # 백업 버튼 컴포넌트
│   ├── ClearIndexedDBButton.jsx   # DB 초기화 버튼
│   └── ErrorCard.js               # 서버 오류 안내 카드
├── offline-orders/
│   └── page.jsx                # 오프라인 주문 관리 페이지
└── indexeddb-view/
    └── page.jsx                # IndexedDB 데이터 뷰어
```

## IndexedDB 스키마

### 데이터베이스 정보
- **DB 이름**: `band-offline-cache`
- **버전**: 1

### Object Stores

| Store Name | Key Path | 인덱스 | 설명 |
|------------|----------|--------|------|
| `posts` | `post_id` | `updated_at`, `status` | 게시물 데이터 |
| `products` | `product_id` | `post_id`, `updated_at` | 상품 데이터 |
| `orders` | `order_id` | `post_key`, `status`, `updated_at`, `customer_name`, `customer_phone` | 주문 데이터 |
| `syncQueue` | `id` (auto) | `table`, `updatedAt` | 동기화 대기열 |
| `snapshots` | `snapshotId` | - | 백업 스냅샷 메타데이터 |
| `meta` | `key` | - | 설정값 (lastSyncAt 등) |

## 데이터 흐름

### 1. 백업 (서버 → 로컬)

```javascript
// IndexedDBBackupButton.jsx
handleBackup() {
  1. sessionStorage에서 userId 확인
  2. Supabase에서 최근 14일 데이터 조회
     - posts (posted_at 기준)
     - products (updated_at 기준)
     - orders (ordered_at 기준, 제외 고객 필터링)
  3. IndexedDB에 bulkPut
  4. 스냅샷 저장 및 lastBackupAt 메타데이터 기록
}
```

### 2. 오프라인 상태 변경 (로컬)

```javascript
// offline-orders/page.jsx
handleBulkStatusUpdate(nextStatus) {
  1. 선택된 주문들의 상태 변경
  2. upsertOrderLocal()로 IndexedDB 업데이트
  3. addToQueue()로 syncQueue에 추가 (사용자 필터 포함)
  4. 서버 헬스가 OK이면 짧은 지연(예: 2초) 후 자동 서버 반영을 예약
}
```

### 3. 동기화 (로컬 → 서버)

```javascript
// offline-orders/page.jsx
handleSyncQueue() {
  1. getPendingQueue()로 대기열 조회 후 sessionStorage의 user_id와 일치하는 항목만 전송
  2. POST /api/sync 호출
  3. 성공한 항목 deleteQueueItems()로 제거
  4. syncIncremental()로 서버 최신 데이터 가져오기 (온라인 이벤트/탭 복귀/헬스 회복 시 자동 실행, 호출은 짧게 디바운스)
}
```

### 4. 증분 동기화 (서버 → 로컬)

```javascript
// offline-orders/page.jsx
syncIncremental() {
  1. getMeta("lastSyncAt") 또는 7일 전 기준
  2. 해당 시점 이후 변경된 데이터만 조회 (orders는 updated_at 기준)
  3. IndexedDB에 bulkPut
  4. lastSyncAt 업데이트
}
```

## 서버 상태 모니터링

### Health Check
```javascript
// offline-orders/page.jsx:485-508
const HEALTH_URL = `${SUPABASE_URL}/auth/v1/health`;

// 30초마다 폴링
setInterval(checkHealth, 30000);

// 상태값
type SupabaseHealth = "checking" | "healthy" | "offline";
```

### 자동 동기화 트리거
- `window.online` 이벤트 발생 시
- `document.visibilitychange` (탭 포커스 복귀) 시
- `supabaseHealth`가 `"healthy"`로 변경 시
- 위 트리거는 큐를 자동 전송하되 짧게 디바운스하며, 백오프/재시도 횟수 제한은 없음

### UI/로딩 정책
- orders-test 페이지: 검색 중 오버레이 제거, 검색 버튼 내부 스피너 사용

## API 엔드포인트

### POST /api/sync

동기화 대기열의 항목들을 Supabase에 반영합니다.

**요청 형식:**
```json
{
  "items": [
    {
      "id": 1,
      "table": "orders",
      "op": "upsert",
      "pkValue": "order_xxx",
      "payload": { "order_id": "order_xxx", "status": "수령완료", ... }
    }
  ]
}
```

**응답 형식:**
```json
{
  "results": [
    { "id": 1, "ok": true },
    { "id": 2, "ok": false, "reason": "error message" }
  ]
}
```

**지원 연산:**
- `upsert`: 삽입 또는 업데이트
- `delete`: 삭제

## 사용자 경험 (UX)

### 온라인 상태
1. `/orders-test`에서 정상 작업
2. 백그라운드에서 IndexedDB에 데이터 동기화
3. 상단에 "DB백업" 버튼으로 수동 백업 가능

### 서버 연결 끊김 감지 시
1. `ErrorCard` 컴포넌트 표시
2. "백업 페이지로 이동" 버튼 제공
3. `/offline-orders`로 이동하여 영업 지속

### 오프라인 모드 (`/offline-orders`)
1. IndexedDB 데이터로 주문 목록 표시
2. 상태 변경 시 syncQueue에 저장
3. 상단에 "동기화 대기중 (N)" 표시
4. 서버 복구 시 자동 동기화

### 페이지 이탈 경고
```javascript
// syncQueue에 항목이 있을 때 브라우저 종료/새로고침 시 경고
window.addEventListener("beforeunload", (e) => {
  if (queueSize > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
```

## UI 상태 표시

### 서버 상태 인디케이터
```
● 초록색: 서버 정상
● 노란색: 서버 상태 확인 중
● 빨간색: 서버 오프라인
```

### 저장 공간 정보
```
저장용량 12.5 MB / 2.0 GB
게시물 150건 / 상품 320건 / 주문 890건
```

## 알려진 제한사항

### 1. 충돌 해결 전략
- **현재**: 마지막 쓰기 승리 (Last Write Wins)
- **위험**: 오프라인 중 서버에서 같은 레코드 수정 시 데이터 손실 가능
- **권장 개선**: `updated_at` 타임스탬프 비교 로직 추가

### 2. 재시도 로직
- **현재**: 온라인/가시성 회복/헬스 정상 시 자동 전송을 다시 시도하지만 백오프·횟수 제한 없음
- **권장 개선**: 지수 백오프를 사용한 최대 3회 재시도 + 실패 사유 표기

### 3. 데이터 기간/컬럼 불일치
- 백업: 14일(orders는 ordered_at 기준)
- 증분 동기화 기본값: 7일(orders는 updated_at 기준)
- **권장 개선**: 기간 및 기준 컬럼을 통일하거나 차이를 문서/UI에 명시

### 4. 큐 전송 사용자 필터
- sessionStorage의 user_id와 일치하는 대기열 항목만 서버로 전송
- 다계정/공용 브라우저 환경에서는 의도치 않게 일부 항목이 미전송될 수 있음

### 4. 다중 기기/탭 지원
- 현재 단일 브라우저 탭 기준으로 설계됨
- 여러 탭에서 동시 작업 시 충돌 가능

## 테스트 방법

### 오프라인 시뮬레이션
1. Chrome DevTools → Network → Offline 체크
2. 또는 URL에 `?debugErrorCard=1` 추가

### IndexedDB 데이터 확인
1. `/indexeddb-view` 페이지 접속
2. 또는 Chrome DevTools → Application → IndexedDB

### 동기화 테스트
1. 오프라인 상태에서 주문 상태 변경
2. `syncQueue` 테이블에서 대기열 확인
3. 온라인 복귀 후 자동 동기화 확인

## 관련 이벤트

### `indexeddb-sync` 커스텀 이벤트
```javascript
// 발생 시점: 상품/주문 데이터가 IndexedDB에 저장될 때
window.dispatchEvent(new Event("indexeddb-sync"));

// 리스너 (IndexedDBBackupButton, offline-orders 등에서 사용)
window.addEventListener("indexeddb-sync", () => {
  // UI 업데이트 또는 증분 동기화 수행
});
```

## 참고 코드 위치

| 기능 | 파일 | 라인 |
|------|------|------|
| DB 연결 및 스키마 정의 | `indexedDbClient.js` | 15-69 |
| 대기열 추가 | `indexedDbClient.js` | 171-183 |
| 서버 Health Check | `offline-orders/page.jsx` | 485-508 |
| 자동 동기화 트리거 | `offline-orders/page.jsx` | 795-816 |
| 동기화 API | `api/sync/route.js` | 11-62 |
| 백업 로직 | `IndexedDBBackupButton.jsx` | 99-154 |

---

*이 문서는 시스템 분석을 기반으로 작성되었습니다.*
