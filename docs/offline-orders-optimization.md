# offline-orders 페이지 최적화 분석

**분석 대상**: `app/offline-orders/page.jsx`
**분석 일자**: 2025-12-03

---

## 1. 네트워크 비효율성

### 1.1 초기 로딩 함수 순차 실행
**위치**: line 500-505

```javascript
loadRecentOrders();
loadQueueSize();
loadProducts();
loadPosts();
loadDbCounts();
loadStorageEstimate();
```

**문제점**: 서로 의존성이 없는 함수들이 순차적으로 실행됨

**해결방안**:
```javascript
Promise.all([
  loadRecentOrders(),
  loadQueueSize(),
  loadProducts(),
  loadPosts(),
  loadDbCounts(),
  loadStorageEstimate(),
]);
```

---

### 1.2 syncIncremental finally 블록 순차 실행
**위치**: line 317-321

```javascript
finally {
  await loadRecentOrders();
  await loadProducts();
  await loadPosts();
  await loadDbCounts();
  setIncrementalSyncing(false);
}
```

**문제점**: 4개의 독립적인 조회 함수가 순차 실행되어 총 대기 시간 증가

**해결방안**:
```javascript
finally {
  await Promise.all([
    loadRecentOrders(),
    loadProducts(),
    loadPosts(),
    loadDbCounts(),
  ]);
  setIncrementalSyncing(false);
}
```

---

### 1.3 Health Check 최적화 부재
**위치**: line 507-530

```javascript
healthTimer = setInterval(checkHealth, 30000);
```

**문제점**:
- 탭이 비활성화 상태에서도 30초마다 폴링 지속
- 연속 성공 시에도 동일한 간격 유지 (백오프 전략 없음)

**해결방안**:
```javascript
// visibility 기반 폴링 제어
const checkHealth = async () => {
  if (document.visibilityState === 'hidden') return;
  // ... 기존 로직
};

// 또는 exponential backoff 적용
let healthInterval = 30000;
const checkHealthWithBackoff = async () => {
  const isHealthy = await checkHealth();
  if (isHealthy) {
    healthInterval = Math.min(healthInterval * 1.5, 120000); // 최대 2분
  } else {
    healthInterval = 30000; // 실패 시 기본값 복귀
  }
};
```

---

## 2. 데이터 중복 조회

### 2.1 loadDbCounts에서 데이터 재조회
**위치**: line 339-366

```javascript
const loadDbCounts = async () => {
  const [allPosts, allProducts, allOrders] = await Promise.all([
    getAllFromStore("posts"),
    getAllFromStore("products"),
    getAllFromStore("orders"),
  ]);
  // ...
};
```

**문제점**: `loadProducts()`, `loadPosts()`, `loadRecentOrders()`에서 이미 조회한 데이터를 다시 조회

**해결방안**: 이미 로드된 state 데이터를 활용하거나, 로드 함수에서 카운트도 함께 업데이트

```javascript
const loadProducts = async () => {
  const allProducts = await getAllFromStore("products");
  const filtered = filterByUserId(allProducts);
  setProducts(filtered);
  // 카운트도 함께 업데이트
  setDbCounts(prev => ({ ...prev, products: filtered.length }));
};
```

---

## 3. React 최적화 이슈

### 3.1 syncIncremental useCallback 미적용
**위치**: line 276, 569

```javascript
const syncIncremental = async () => { ... };

// useEffect dependency로 사용
useEffect(() => {
  // ...
}, [syncIncremental]); // 매 렌더링마다 새 함수 생성으로 effect 재실행
```

**해결방안**:
```javascript
const syncIncremental = useCallback(async () => {
  // ... 기존 로직
}, [incrementalSyncing]); // 필요한 의존성만 포함
```

---

### 3.2 useMemo dependency에 미사용 변수
**위치**: line 940

```javascript
}, [orders, excludedCustomers, exactCustomerFilter, statusFilter, productsByPostKey, currentPage]);
```

**문제점**: `excludedCustomers`가 dependency에 있지만 실제 필터링에 사용되지 않음 (주석으로 비활성화됨)

**해결방안**: 미사용 dependency 제거
```javascript
}, [orders, exactCustomerFilter, statusFilter, productsByPostKey, currentPage]);
```

---

### 3.3 getCandidateProductsForOrder 반복 계산
**위치**: line 1323

```javascript
{displayedOrders.map((order) => {
  const productList = getCandidateProductsForOrder(order); // 매번 계산
```

**해결방안**: useMemo로 전체 매핑을 캐싱
```javascript
const orderProductMap = useMemo(() => {
  const map = new Map();
  orders.forEach(order => {
    map.set(order.order_id, getCandidateProductsForOrder(order));
  });
  return map;
}, [orders, productsByPostKey, productsByBandPost, products]);

// 사용 시
const productList = orderProductMap.get(order.order_id) || [];
```

---

## 4. UI/UX 최적화

### 4.1 검색 Debouncing 부재
**위치**: line 1210-1211

```javascript
onChange={(e) => setSearchTerm(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && handleSearch(searchTerm)}
```

**문제점**: 빠른 타이핑 시 불필요한 상태 업데이트

**해결방안**: debounce 적용
```javascript
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback((term) => {
  handleSearch(term);
}, 300);
```

---

### 4.2 이미지 최적화 미적용
**위치**: line 1531-1538

```javascript
<img
  src={imgUrl}
  alt={title}
  className="w-full h-full object-cover"
  referrerPolicy="no-referrer"
  onError={(e) => { e.currentTarget.style.display = "none"; }}
/>
```

**문제점**:
- Next.js Image 컴포넌트 미사용
- lazy loading, srcset 최적화 없음
- 외부 이미지 도메인 설정 필요

**해결방안**: 외부 이미지라 next/image 사용이 어려우면 최소한 loading="lazy" 추가
```javascript
<img
  src={imgUrl}
  alt={title}
  loading="lazy"
  decoding="async"
  className="w-full h-full object-cover"
  referrerPolicy="no-referrer"
  onError={(e) => { e.currentTarget.style.display = "none"; }}
/>
```

---

## 5. 우선순위별 권장 수정 사항

| 우선순위 | 항목 | 예상 효과 | 난이도 |
|---------|------|----------|--------|
| **높음** | 초기 로딩 병렬화 | 초기 로딩 시간 50%+ 단축 | 낮음 |
| **높음** | syncIncremental finally 병렬화 | 동기화 완료 시간 단축 | 낮음 |
| **중간** | loadDbCounts 중복 조회 제거 | IndexedDB 접근 3회 감소 | 중간 |
| **중간** | useCallback 적용 | 불필요한 effect 재실행 방지 | 낮음 |
| **중간** | 이미지 lazy loading | 초기 렌더링 성능 향상 | 낮음 |
| **낮음** | 검색 debouncing | UX 개선 | 낮음 |
| **낮음** | Health check 최적화 | 백그라운드 네트워크 요청 감소 | 중간 |
| **낮음** | useMemo dependency 정리 | 미미한 성능 개선 | 낮음 |

---

## 6. 참고: 잘 되어 있는 부분

- `syncIncremental` 내 3개 테이블 병렬 fetch (line 297-301)
- `productsByPostKey`, `productsByBandPost` useMemo 캐싱
- 페이지네이션으로 DOM 부담 감소
- beforeunload 이벤트로 데이터 손실 방지

---

*작성: Claude Code*

## GPT의 교차검증

- **1.1 초기 로딩 병렬화 주장**: `loadRecentOrders()` 등은 `await` 없이 호출되어 바로 비동기 실행을 시작하므로 이미 병렬로 진행됩니다. `Promise.all`로 묶어도 체감 성능 개선은 크지 않으며, 완료 시점을 하나로 관리하려는 목적이 아니라면 필수 사항은 아닙니다.
- **1.2 syncIncremental finally**: finally에서 네 개 로더를 순차 `await`하는 것이 맞습니다. `Promise.all`로 묶으면 동기화 완료까지의 대기 시간을 줄일 수 있어 제안이 타당합니다.
- **1.3 헬스 체크**: `setInterval(checkHealth, 30000)`이 탭 비활성 상태에서도 돌고, 성공 후에도 동일 주기를 유지하는 것이 사실입니다. 가시성 체크나 백오프 전략 추가 제안은 유효합니다.
- **2.1 loadDbCounts 중복 조회**: posts/products/orders를 다시 `getAllFromStore`로 읽어 카운트하는 구조가 맞습니다. 이미 로드한 state를 재활용하면 중복 I/O를 줄일 수 있지만, 현재 방식은 최신 스냅샷을 별도로 읽어오는 장점도 있어 트레이드오프를 명시하면 더 명확합니다.
- **3.1 syncIncremental useCallback 부재**: 함수가 매 렌더마다 새로 만들어져 `[syncIncremental]` 의존 useEffect가 매번 재등록됩니다. `useCallback` 적용 제안이 적절합니다.
- **3.2 useMemo 의존성**: `excludedCustomers`가 의존성에 있으나 내부에서 사용되지 않는다는 지적은 맞습니다. 추가로 `productsByPostKey`도 사용되지 않아 함께 정리하는 것이 좋습니다.
- **3.3 getCandidateProductsForOrder 반복 계산**: 행 렌더마다 호출되는 것은 사실이나 내부는 대부분 O(1) 맵 조회이고, `productsByPostKey`/`productsByBandPost`가 이미 memoized입니다. 대규모 데이터가 아니라면 별도 `useMemo` 맵의 체감 이득은 크지 않을 수 있습니다.
- **4.1 검색 디바운싱**: 입력 시에는 `setSearchTerm`만 실행되고 실제 검색은 Enter/검색 버튼에서만 발생하므로 타이핑 중 비싼 작업이 없습니다. 자동 검색으로 바꿀 계획이 아니라면 debounce 필요성은 낮습니다.
- **4.2 이미지 로딩**: `<img>`에 `loading="lazy"`나 `decoding="async"`가 없어 최적화 여지는 있습니다. `next/image`를 못 쓰더라도 lazy 옵션 추가는 도움이 됩니다.

---

## Claude의 교차검증

GPT의 피드백을 검토한 결과:

### GPT 의견에 동의하는 부분

| 항목 | GPT 의견 | Claude 판단 |
|------|----------|-------------|
| **1.1 초기 로딩** | await 없이 호출되어 이미 병렬 실행됨 | ✅ **동의**. 기술적으로 맞음. 다만 `Promise.all`로 묶으면 전체 완료 시점을 관리할 수 있어 로딩 UI 제어에 유리 |
| **4.1 검색 디바운싱** | Enter/버튼에서만 검색 발생, debounce 불필요 | ✅ **동의**. `setSearchTerm`만 호출되고 실제 검색은 명시적 액션에서만 발생. 우선순위 하향 |
| **3.3 반복 계산** | O(1) 맵 조회라 체감 이득 적음 | ✅ **부분 동의**. `productsByPostKey`가 이미 memoized되어 있어 추가 캐싱 효과 제한적 |

### GPT 의견에 반박하는 부분

| 항목 | GPT 의견 | Claude 반박 |
|------|----------|-------------|
| **3.2 useMemo dependency** | `productsByPostKey`도 사용되지 않아 정리 필요 | ❌ **틀림**. `isPickupAvailable` 함수(line 886)에서 `productsByPostKey[pk]`를 직접 참조함. "수령가능" 필터 시 사용되므로 dependency 유지 필요 |

### 추가 발견 사항

1. **isPickupAvailable 클로저 문제**: `isPickupAvailable` 함수가 컴포넌트 내부에 정의되어 `productsByPostKey`를 클로저로 참조함. useMemo 내에서 호출되지만 함수 자체는 dependency에 없음. React의 exhaustive-deps 규칙 위반 가능성 있음.

2. **loadDbCounts 트레이드오프**: GPT가 언급한 "최신 스냅샷" 장점은 유효하나, 초기 로딩 시 거의 동시에 실행되므로 실질적 차이 미미. 다만 `syncIncremental` 후에는 최신 데이터 보장 목적으로 별도 조회가 의미 있음.

---

## 최종 제안 (수정된 우선순위)

| 우선순위 | 항목 | 근거 | 작업량 |
|---------|------|------|--------|
| **1순위** | syncIncremental finally 병렬화 | GPT/Claude 모두 동의, 확실한 개선 | 5분 |
| **2순위** | 이미지 lazy loading 추가 | 양측 동의, 간단한 속성 추가 | 3분 |
| **3순위** | excludedCustomers dependency 제거 | 미사용 변수, 린트 경고 해소 | 1분 |
| **4순위** | useCallback 적용 (syncIncremental) | 불필요한 effect 재실행 방지 | 10분 |
| **5순위** | Health check visibility 체크 | 백그라운드 요청 감소 | 5분 |
| **보류** | 초기 로딩 Promise.all | 이미 병렬 실행됨, 선택적 적용 | - |
| **보류** | 검색 debouncing | 현재 구조상 불필요 | - |
| **보류** | getCandidateProductsForOrder 캐싱 | 이미 O(1) 조회, 체감 효과 적음 | - |

### 즉시 적용 권장 코드

```javascript
// 1순위: syncIncremental finally 수정 (line 317-321)
finally {
  await Promise.all([
    loadRecentOrders(),
    loadProducts(),
    loadPosts(),
    loadDbCounts(),
  ]);
  setIncrementalSyncing(false);
}

// 2순위: 이미지 태그 수정 (line 1531-1538)
<img
  src={imgUrl}
  alt={title}
  loading="lazy"
  decoding="async"
  className="w-full h-full object-cover"
  referrerPolicy="no-referrer"
  onError={(e) => { e.currentTarget.style.display = "none"; }}
/>

// 3순위: useMemo dependency 수정 (line 940)
}, [orders, exactCustomerFilter, statusFilter, productsByPostKey, currentPage]);
```

---

*최종 검토: Claude Code (2025-12-03)*
