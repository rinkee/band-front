# Supabase Edge Function Usage Audit

본 문서는 현재 프론트엔드에서 호출하는 Supabase Edge Function들을 점검하고, 굳이 Edge Function이 필요 없는 경우(=클라이언트 Supabase 직조회 또는 Next API 라우트로 대체 가능)를 정리한 것입니다. 보안 가정: Supabase RLS가 `user_id = current_user_id` 등으로 안전하게 설정되어 있고, 브라우저에 노출되면 안 되는 시크릿/외부 API 호출이 포함되어 있지 않은 경우에만 클라이언트 직접 접근을 권장합니다.

## 굳이 Edge Function을 쓰지 않아도 되는 읽기 전용 범주
- `users-get-data` (사용자 프로필 조회)  
  - 대체: `useUserClient`로 Supabase 클라이언트 직조회.  
  - 영향: 대시보드 “최근 업데이트” 표시 등에 사용. Edge 제거 시에도 기능 유지 가능.
- `orders-get-all`, `orders-get-by-id`, `orders-stats` (주문 조회/통계)  
  - 이미 주문 페이지는 `useOrdersClient`/`useOrderStatsClient`로 직조회.  
  - Edge 훅(`useOrders`, `useOrderStats`)은 정리 대상.
- `products-get-all`, `products-get-by-id` (상품 조회)  
  - 대체: `useProductsClient`로 직조회.  
  - 주문 페이지 등 남은 Edge 호출을 클라이언트 버전으로 교체 가능.
- `posts-get-all`, `posts-get-by-id` (게시글 조회)  
  - 게시글 페이지는 Supabase 직조회 사용. Edge 훅(`usePosts`) 미사용 시 제거 가능.

## Edge Function을 유지하는 것이 나은 범주
- 외부 API 연동/크롤링/토큰·쿠키 관리 (`band-get-posts`, 각종 UpdateButton 계열)  
  - 이유: 서비스 시크릿/쿠키 노출 방지, 서버에서만 가능한 처리.
- 쓰기/변경 계열 (주문 상태 변경, 상품 생성/수정/삭제 등)  
  - 이유: 현재 인증 구조에서는 서버 측에서 검증/제한을 거는 편이 안전.

## 권장 정리/전환 작업
1) 대시보드에서 `useUser` → `useUserClient`로 교체 (또는 최근 업데이트 표시 제거) → `users-get-data` 호출 제거.  
2) 주문 페이지에서 `useProducts` → `useProductsClient`로 교체, `useOrders` 훅 미사용 시 삭제.  
3) Edge 훅 파일/exports (`useUser`, `useProducts`, `usePosts`, `useOrders`) 중 실제 라우트에서 안 쓰는 것 정리.  
4) 클라이언트 직조회 전환 시 RLS 정책을 반드시 재확인: anon 키로도 안전하게 제한되는지, 사용자 식별이 정확히 되는지 검증 필요.

## 참고
- RLS 없이 anon 키로 직조회하면 누구나 데이터에 접근할 수 있으므로, **반드시** RLS와 클라이언트 컨텍스트에서 전달되는 `user_id`/세션 검증을 확인한 뒤 전환할 것.
- 외부 API 호출/시크릿 사용이 포함된 함수는 계속 Edge(Function) 또는 서버 라우트에서 수행해야 한다.

---

## Claude 검증 내용 (2025-12-02)

### 정확한 내용

| 항목 | 문서 주장 | 실제 현황 |
|------|---------|----------|
| **orders 페이지** | `useOrdersClient`/`useOrderStatsClient`로 직조회 사용 | ✅ `orders/page.js:16-20`에서 확인됨 |
| **usePosts Edge 훅** | 미사용 시 제거 가능 | ✅ 정의만 있고 어떤 페이지에서도 `usePosts()`를 호출하지 않음 |
| **useUserClient** | 클라이언트 직조회로 존재 | ✅ `settings/page.js:11`에서 사용 중 |
| **Edge Function 유지 대상** | 외부 API/크롤링/쓰기 계열 | ✅ 적절한 분류 |

### 부정확한 내용

| 항목 | 문서 주장 | 실제 현황 |
|------|---------|----------|
| **대시보드 useUser** | `useUser` → `useUserClient` 교체 필요 | ❌ 대시보드(`dashboard/page.js`)에서 `useUser` 사용 안함. `useProducts`, `useOrders`, `useOrderStats`만 사용 |
| **주문 페이지 useProducts** | `useProductsClient`로 교체 가능 | ⚠️ `orders/page.js:15`에서 `useProducts` (Edge 버전) 여전히 import 중 |

### 업데이트 필요한 내용

| 현황 | 권장 조치 |
|------|----------|
| `dashboard/page.js` | `useProducts`, `useOrders` → 클라이언트 버전으로 교체 가능 (문서에 명시 필요) |
| `test-order-edit/page.js` | 유일하게 `useUser` (Edge) 사용 중 - 정리 대상 |
| `usePosts`, `usePost` | 미사용 - 삭제 대상으로 명시 필요 |
| `useOrderStats` (Edge) | 이미 내부적으로 클라이언트 버전 사용 중 (`useOrders.js:85-98`) |

### 권장 정리/전환 작업 (수정안)

1. ~~대시보드에서 `useUser` → `useUserClient`로 교체~~ → **대시보드에서 `useProducts`, `useOrders` → `useProductsClient`, `useOrdersClient`로 교체**
2. 주문 페이지에서 `useProducts` → `useProductsClient`로 교체 (유지)
3. `test-order-edit/page.js`에서 `useUser` → `useUserClient`로 교체 또는 제거
4. Edge 훅 `usePosts`, `usePost` 삭제 (미사용 확인됨)
5. `useOrderStats`는 이미 클라이언트 버전 사용 중 (추가 작업 불필요)

## Claude 검증 내용 교차검증
- ✅ `orders/page.js`는 `useOrdersClient`/`useOrderStatsClient`만 사용하여 조회 시 Edge 호출 없음(`app/orders/page.js:15-20`). Claude의 확인과 일치.
- ✅ `usePosts`/`usePost` 훅은 어디에서도 호출되지 않음(`rg usePosts` 결과 없음). 삭제 가능하다는 판단이 맞음.
- ✅ `useUserClient`는 실제로 `app/settings/page.js:10-15`에서 사용 중으로, 존재 확인이 정확함.
- ⚠️ 대시보드에서 `useUser`를 사용하지 않으므로 “`useUser`→`useUserClient` 교체” 권고는 불필요. 실제 Edge 호출은 `useProducts`/`useOrders`(둘 다 Edge 버전) 사용(`app/dashboard/page.js:7`).
- ⚠️ 주문 페이지는 여전히 `useProducts`(Edge) 호출을 포함(`app/orders/page.js:15`); Claude가 “교체 필요”라고 표시한 부분은 유효한 개선 제안임.
- ⚠️ `app/test-order-edit/page.js:5`는 `useUser`를 import하지만 호출하지 않아 실제 Edge 요청은 발생하지 않음. “유일하게 사용 중”이라는 표현은 부정확하며, 단순 미사용 import 정리 대상.
- ✅ `useOrderStats`는 클라이언트 Supabase 직조회 구현이며 Edge 호출이 아님(`app/hooks/useOrders.js:85-98`). Claude의 지적과 일치.

## 해야 할 일
- 대시보드(`app/dashboard/page.js`): `useProducts`/`useOrders`를 `useProductsClient`/`useOrdersClient`로 교체해 Edge 호출 제거.
- 주문 페이지(`app/orders/page.js`): `useProducts`(Edge) → `useProductsClient`로 교체. 데이터 shape 차이 여부 확인 후 대응.
- 훅/exports 정리: 미사용 `usePosts`/`usePost` 훅 및 관련 export 삭제, `app/test-order-edit/page.js`의 미사용 `useUser` import 제거.
- 보안 점검: 클라이언트 직조회 전환 시 RLS와 세션 기반 필터가 anon 키에서도 안전하게 작동하는지 재검증.
