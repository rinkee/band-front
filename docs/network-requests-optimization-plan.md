## 네트워크 호출 최적화 계획 (Update 버튼 관련)

### 배경
- Update 버튼 실행 시 동일한 파라미터의 Supabase REST 호출이 중복되고, 대량의 `post_key in (...)` 쿼리가 반복되어 네트워크 낭비와 브라우저 부하가 발생함.
- 주요 중복: `orders` 목록 조회(같은 필터/offset/limit), `posts` 조회(미체크/대량 in 쿼리), `products?select=post_key` 존재 여부 체크, `users` 테이블 다중 조회.

### 목표
- 같은 요청을 한 번만 보내고, 캐시를 활용해 재요청을 최소화한다.
- 필요한 필드만 묶어서 가져와 호출 횟수를 줄인다.
- 대량 `in()` 쿼리는 배치 크기를 제한하고 결과를 재사용한다.

### 액션 아이템
1) **SWR 캐시/키 정리**
   - `orders` 리스트: 한 개의 SWR 키로 통합하고 `dedupingInterval`/`revalidateOnFocus`를 넉넉히 설정. 동일 필터로 여러 컴포넌트가 호출하지 않도록 공용 훅(fetcher + key) 제공.
   - `posts`/`products` 리스트도 동일. `post_key in (...)` 요청이 두 번 이상 나가므로 키 공유 + `dedupingInterval` 적용.
   - Update 버튼 완료 시 `mutate(key, undefined, { revalidate: true })`로 필요한 키만 수동 갱신해 불필요한 자동 재검증을 막는다.

2) **사용자 설정 단일 조회**
   - `users` 테이블을 여러 번 나누어 조회하지 말고, 필요한 컬럼(예: `band_access_tokens`, `current_band_key_index`, `post_fetch_limit`, `ai_*` 등)을 한 번에 `select`하는 fetcher로 통일.
   - 가능하면 서버 RPC/뷰를 만들어 필요한 필드만 반환하도록 하여 응답 크기를 최소화.

3) **게시물/상품 존재 여부 조회 단순화**
   - pending/미체크 posts 조회를 단일 RPC로 묶어 전달(필요한 컬럼만). 중복 호출 방지.
   - `products?select=post_key&post_key=in(...)` 존재 확인은 한 번의 배치(최대 50개) 조회 후 Set으로 캐시하고, 동일 세션 내에서는 재조회하지 않는다.

4) **Band API 세션/로그 호출 최소화**
   - `band_api_sessions`, `band_api_usage_logs` 호출이 반복되는 경우, 세션 ID 단위로 한 번만 호출하도록 프런트 단에서 메모이즈하거나 서버에서 배치 처리하는 엔드포인트 추가 검토.

5) **필드 최소화 및 응답 정리**
   - 목록 조회 시 `select=*` 대신 필요한 컬럼만 명시해 응답 크기를 줄이고, 이후 파이프라인의 JSON 파싱 비용을 낮춘다.

### 모니터링/검증
- 개발자도구 네트워크 탭에서 Update 버튼 1회 실행 시 호출 수/중복 여부 확인.
- Supabase 로그(Dashboard)에서 Update 호출 전후 일일 요청 수 변화 추적.
- `dedupingInterval` 적용 후에도 필요한 실시간성은 유지되는지 UI 동작 확인.
