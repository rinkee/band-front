# orders-test/page.js 비효율 코드 분석

> 작성일: 2025-12-03
> 대상 파일: `app/orders-test/page.js`

---

## 1. 메모이제이션 누락 (2359-2378 라인)

### 현재 코드
```javascript
const getProductNameById = (id) => {
  const product = products.find((p) => p.product_id === id);  // 배열 전체 탐색
  if (product?.title) return product.title;

  const order = orders.find((o) => o.product_id === id);      // 또 배열 전체 탐색
  // ...
};
```

### 왜 비효율적인가?
- **매 렌더링마다 함수가 새로 생성됨** → 자식 컴포넌트에 props로 전달 시 불필요한 리렌더링 유발
- **products.find()** → 100개 상품이면 최대 100번 비교
- **orders.find()** → 1000개 주문이면 최대 1000번 비교
- 화면에 30개 주문 표시 시 → **30 × (100 + 1000) = 33,000번 비교** 가능

### 개선 방안
```javascript
const getProductNameById = useCallback((id) => {
  // 동일 로직
}, [products, orders]);  // products, orders가 바뀔 때만 함수 재생성
```

### 효과
- 함수 재생성 방지
- 자식 컴포넌트 불필요한 리렌더링 방지

---

## 2. 그룹핑 시 불필요한 정렬 (852-856 라인)

### 현재 코드
```javascript
const rep = [...rows].sort((a, b) => {
  const ta = a.ordered_at ? new Date(a.ordered_at).getTime() : 0;
  const tb = b.ordered_at ? new Date(b.ordered_at).getTime() : 0;
  return ta - tb;
})[0];  // 첫 번째만 사용!
```

### 왜 비효율적인가?
- **`[...rows]`** → 배열 전체 복사 (메모리 낭비)
- **`.sort()`** → O(n log n) 복잡도로 전체 정렬
- **`[0]`** → 정렬 결과 중 **첫 번째만 사용** (나머지는 버림)
- 그룹이 100개, 각 그룹에 5개씩 → **100번의 배열 복사 + 정렬**

### 개선 방안
```javascript
// 최소값만 찾으면 됨 - O(n)
let rep = rows[0];
let minTime = rep.ordered_at ? new Date(rep.ordered_at).getTime() : Infinity;

for (const r of rows) {
  const t = r.ordered_at ? new Date(r.ordered_at).getTime() : Infinity;
  if (t < minTime) {
    minTime = t;
    rep = r;
  }
}
```

### 효과
- 배열 복사 없음
- **O(n log n) → O(n)으로 개선** (속도 2~3배 향상)

---

## 3. 중복 통계 계산 (757-825 라인)

### 현재 코드
```javascript
// allStats (757-790)
const allStats = useMemo(() => {
  const statusCounts = {};
  orders.forEach(order => {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    // ...
  });
  return { statusCounts, ... };
}, [orders]);

// clientStats (793-825) - 완전히 동일한 로직!
const clientStats = useMemo(() => {
  const statusCounts = {};
  displayOrders.forEach(order => {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    // ...
  });
  return { statusCounts, ... };
}, [displayOrders]);
```

### 왜 비효율적인가?
- **동일한 로직이 2번 작성됨** → 유지보수 어려움
- 수정 시 **두 곳 다 수정해야 함** → 버그 발생 가능성

### 개선 방안
```javascript
// 공통 함수 분리
const calculateStats = useCallback((dataArray) => {
  const statusCounts = {};
  const subStatusCounts = {};
  dataArray.forEach(order => {
    if (order.status) statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    if (order.sub_status) subStatusCounts[order.sub_status] = (subStatusCounts[order.sub_status] || 0) + 1;
  });
  return { totalOrders: dataArray.length, statusCounts, subStatusCounts };
}, []);

const allStats = useMemo(() => calculateStats(orders || []), [orders, calculateStats]);
const clientStats = useMemo(() => calculateStats(displayOrders || []), [displayOrders, calculateStats]);
```

### 효과
- 코드 중복 제거
- 유지보수 용이

---

## 4. useMemo 내부 함수 재정의 (669-755 라인)

### 현재 코드 (요약)
```javascript
const displayOrders = useMemo(() => {
  // useMemo 안에서 함수 정의 (매번 재정의)
  const toKstYmdLocal = (dateInput) => { ... };
  const isAvailableLocal = (dateInput) => { ... };

  // 필터링 로직
  return arr.filter(o => isAvailableLocal(getOrderPickupDate(o)));
}, [orders, ...]);
```

### 왜 비효율적인가?
- `toKstYmdLocal`, `isAvailableLocal`가 **useMemo가 재계산될 때마다 새로 정의됨**
- 이 함수들이 외부에 이미 비슷한 함수가 있을 수 있음 (중복)

### 개선 방안
```javascript
// 컴포넌트 외부 또는 상단에 정의
const toKstYmd = (dateInput) => { ... };
const isAvailable = (dateInput) => { ... };

// useMemo는 순수 로직만
const displayOrders = useMemo(() => {
  return arr.filter(o => isAvailable(getOrderPickupDate(o)));
}, [orders, ...]);
```

### 효과
- 함수 재정의 방지
- 코드 재사용성 향상

---

## 5. 상태 폭발 (424-542 라인) - 대규모 리팩토링

### 현재 상태
- 30개 이상의 개별 useState 훅 사용
- 필터 관련 상태가 여러 곳에 흩어져 있음

### 왜 비효율적인가?
- 한 상태 변경 시 전체 컴포넌트 리렌더링
- 관련 상태의 분산으로 초기화/관리 복잡

### 개선 방안 (대규모 리팩토링 필요)
```javascript
// 필터 상태 통합
const [filterState, setFilterState] = useState({
  searchTerm: '',
  filterSelection: '주문완료',
  // ... 관련 상태 그룹화
});
```

### 주의
- 변경 범위가 매우 큼
- 별도 작업으로 진행 권장
- 충분한 테스트 필요

---

## 요약

| # | 패턴 | 현재 | 개선 후 | 효과 | 난이도 |
|---|------|------|---------|------|--------|
| 1 | 메모이제이션 | 매 렌더링 함수 재생성 | useCallback | 리렌더링 감소 | 낮음 |
| 2 | 그룹핑 정렬 | O(n log n) + 배열 복사 | O(n) 최소값 찾기 | 속도 2~3배 향상 | 낮음 |
| 3 | 통계 계산 | 동일 로직 2번 작성 | 함수 분리 | 유지보수 용이 | 낮음 |
| 4 | 내부 함수 | useMemo 내 함수 정의 | 외부 분리 | 코드 정리 | 중간 |
| 5 | 상태 폭발 | 30개+ useState | 상태 그룹화 | 렌더링 최적화 | 높음 |

---

## 권장 작업 순서

1. **#1~3 먼저 적용** (안전, 영향 범위 작음)
2. **#4 검토 후 적용** (중간 범위)
3. **#5는 별도 작업으로** (대규모 리팩토링)

---

## GPT 검증 코멘트 (2025-02-08)

- #1 메모이제이션: `getProductNameById`가 `app/orders-test/page.js:2359`에 함수 표현식으로 정의된 것은 사실이나, 현재 코드에서는 자식 컴포넌트에 prop으로 넘기지 않고 내부에서 직접 호출만 합니다. `useCallback`으로 감싸도 리렌더 방지 효과는 거의 없으며, 실질 비용은 `products/ orders`를 매번 `find`로 순회하는 부분입니다. 빈도가 많다면 미리 `product_id` 기준 맵을 만들어 두는 편이 체감 성능에 더 직접적입니다.
- #2 그룹 대표행 정렬: `app/orders-test/page.js:844-867`에서 `[...rows].sort(...)[0]`으로 대표행을 뽑는 로직이 실제 존재합니다. 대표행 하나만 필요하므로 정렬 대신 O(n) 최소값 스캔으로 바꾸는 제안이 타당합니다.
- #3 통계 계산 중복: `app/orders-test/page.js:757-806`(allStats)와 `app/orders-test/page.js:809-847`(clientStats)가 거의 동일한 집계 로직을 각각 갖고 있습니다. 공통 함수로 추출해 중복을 줄일 수 있다는 지적이 맞습니다.
- #4 useMemo 내부 함수: `app/orders-test/page.js:669-747`에서 `toKstYmdLocal`, `isAvailableLocal`, `getOrderPickupDate`가 useMemo 안에 선언되어 있습니다. 의존성이 바뀔 때마다 재생성되긴 하지만 useMemo가 재평가될 때만 발생하므로 비용은 제한적입니다. 외부로 뺄 경우 `postProductsByPostKey/ postProductsByBandPost`를 인자로 받거나 `useCallback`으로 래핑해야 해 의존성 관리가 추가로 필요합니다.
- #5 상태 폭발: `app/orders-test/page.js:424-542` 구간에 30개 이상의 useState가 실제로 존재합니다. 상태 그룹화나 reducer 전환으로 관리 난이도를 낮출 수 있지만 변경 폭이 크니 별도 작업으로 진행해야 한다는 설명과 일치합니다.
- 추가 관찰: #1 성능 개선 방향은 함수 메모이제이션보다 데이터 인덱싱(맵 캐싱) 쪽이 효과적일 것으로 보이며, #2~3은 작은 리팩토링으로 바로 개선 가능해 보입니다.

---

## Claude 교차검증 (2025-12-03)

GPT 검증 내용에 대한 재검증 결과:

### #1 메모이제이션 - GPT 지적 **동의**

GPT가 맞습니다. 코드 확인 결과:
- `getProductNameById`는 2719, 3470, 4801, 5072 라인에서 **내부 호출만** 됨
- 자식 컴포넌트에 prop으로 전달되지 않음
- 따라서 `useCallback`은 리렌더링 방지 효과 없음

**수정된 개선안:**
```javascript
// Map 캐싱으로 O(n) → O(1) 개선
const productNameMap = useMemo(() => {
  const map = new Map();
  products.forEach(p => map.set(p.product_id, p.title));
  orders.forEach(o => {
    if (!map.has(o.product_id) && o.product_name && o.product_name !== "상품명 없음") {
      map.set(o.product_id, o.product_name);
    }
  });
  return map;
}, [products, orders]);

const getProductNameById = (id) => productNameMap.get(id) || "상품명 없음";
```
→ 30번 호출 시 **33,000번 비교 → 30번 Map 조회**로 대폭 개선

### #2 그룹 대표행 정렬 - GPT 지적 **동의**

원래 분석 그대로 유효. O(n) 최소값 스캔으로 변경 권장.

### #3 통계 계산 중복 - GPT 지적 **동의**

원래 분석 그대로 유효. 공통 함수 분리 권장.

### #4 useMemo 내부 함수 - GPT 지적 **동의**

GPT가 맞습니다. 코드 확인 결과 (669-740 라인):
- `getOrderPickupDate` 함수가 `postProductsByPostKey`, `postProductsByBandPost`를 직접 참조
- 외부로 빼면 이 의존성들을 인자로 받거나 useCallback으로 래핑 필요
- useMemo 재계산 시에만 함수 재생성되므로 **비용 제한적**
- **우선순위 낮춤** - 복잡도 대비 효과 적음

### #5 상태 폭발 - GPT 지적 **동의**

원래 분석과 일치. 대규모 리팩토링 필요하므로 별도 작업 권장.

---

## 최종 권장 작업 (수정됨)

| 우선순위 | 항목 | 효과 | 난이도 |
|---------|------|------|--------|
| 1 | #1 Map 캐싱 | **매우 높음** | 낮음 |
| 2 | #2 O(n) 최소값 | 중간 | 낮음 |
| 3 | #3 통계 함수 분리 | 중간 (유지보수) | 낮음 |
| - | #4 내부 함수 분리 | 낮음 | 중간 |
| - | #5 상태 통합 | 높음 | 높음 |

**결론:** #1~3만 우선 적용, #4는 보류, #5는 별도 작업
