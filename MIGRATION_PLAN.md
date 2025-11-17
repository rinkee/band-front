# band-get-posts-a의 주요 기능 프론트엔드 이식 작업
## 각각 AI는 위 작업을 위한 모듈들을 모아 프론트엔드로 이식함.
## 각각 기능은 목표폴더 front/app/lib/updateButton/fuc/ 안에 모듈별로 넣을것 
## 각각 기능을 먼저 포팅
AI 1 ai/productExtraction.ts를 이식한다
✅ doneCheck - productExtraction.js를 front/app/lib/updateButton/fuc/에 이식 완료 (Deno → Next.js 환경 변경)
AI 2 band-get-posts-a의 기능중 실제 사용중인 matching. matcher를 확인하고 목표폴더에 폴더별로 이식한다
✅ doneCheck
AI 3 band-get-posts-a에서 실제로 사용중인 patterns를 확인하고 목표 폴더에 폴더별로 이식한다.
✅ doneCheck
AI 4 band-get-posts-a에서 실제로 사용중인 utils를 확인하고 목표 폴더에 폴더별로 이식한다.
✅ doneCheck


## 자기 작업이 끝난뒤 doneCheck에 체크할것 자기가 맡은 기능을 이식한 뒤 해당 기능을 연동하기 위해 다음 작업을 아래에 적는다

AI 1 - 완료
- 이식된 파일: front/app/lib/updateButton/fuc/productExtraction.js
- 주요 변경사항:
  - Deno.env.get → process.env로 환경 변수 접근 방식 변경
  - TypeScript → JavaScript 변환
  - 모든 기능과 로직은 원본 그대로 유지
- 다음 작업: 다른 모듈들(matcher, patterns, utils)과 함께 통합 테스트 필요

AI 2 - 완료
- 이식된 파일:
  **matching 폴더** (front/app/lib/updateButton/fuc/matching/):
  - matcherOrchestrator.ts - 메인 오케스트레이터, 여러 matcher 조율
  - commentAnalyzer.ts - 댓글 분석 및 패턴 감지
  - similarityMatching.ts - 유사도 기반 상품 매칭 (findBestProductMatch, calculateTextSimilarity)
  - productMatching.ts - 단위 패턴 기반 매칭 (extractOrderByUnitPattern, smartUnitMapping)

  **matchers 폴더** (front/app/lib/updateButton/fuc/matching/matchers/):
  - simpleNumberMatcher.ts - 단순 숫자 패턴 매칭
  - recursivePatternMatcher.ts - 재귀 패턴 매칭
  - boxPatternMatcher.ts - 박스/세트 패턴 매칭
  - numberBasedMatcher.ts - 번호 기반 매칭
  - colorOptionMatcher.ts - 색상 옵션 매칭
  - unitPatternMatcher.ts - 단위 패턴 매칭
  - productNameMatcher.ts - 상품명 매칭

  **utils 폴더** (front/app/lib/updateButton/fuc/utils/):
  - productPatternClassifier.ts - 상품 패턴 분류
  - textUtils.ts - 텍스트 처리 유틸리티
  - dateUtils.ts (추가)
  - idUtils.ts (추가)

- 총 15개 파일 이식 완료
- 다음 작업: patterns 및 기타 utils와 통합, 프론트엔드 환경에 맞게 import 경로 수정 필요

AI 3 - 완료
- 이식된 파일: 4개의 patterns 파일을 폴더별로 이식
  **patterns 폴더들** (front/app/lib/updateButton/fuc/):
  - keywordMatching/keywordMatching.js - 키워드 기반 매칭 (extractOrderByKeywordMatching, generateKimchiKeywordMappings)
  - orderPatternExtraction/orderPatternExtraction.js - 패턴 추출 및 처리 (smartUnitMapping, extractQuantityFromComment, shouldUsePatternProcessing)
  - similarityMatching/similarityMatching.js - 유사도 기반 매칭 (findBestProductMatch, extractOrderBySimilarityMatching)
  - unitPatternMatching/unitPatternMatching.js - 단위 기반 패턴 매칭 (extractOrderByUnitPattern)
- 주요 변경사항:
  - TypeScript → JavaScript 변환
  - import 경로를 상대 경로로 변경 (ES6 모듈)
  - 타입 선언 제거, 모든 기능과 로직은 원본 그대로 유지
- 다음 작업: matcher 및 utils 모듈과 함께 통합 테스트, 중복 파일 확인 (matching 폴더와 patterns 폴더에 similarityMatching이 중복됨)

AI 4 - 완료 ✅
- 이식된 파일: 5개의 utils 파일을 utils 폴더에 이식
  **utils 폴더** (front/app/lib/updateButton/fuc/utils/):
  - dateUtils.ts - 날짜 처리 유틸리티 (convertUTCtoKST, safeParseDate, extractPickupDate)
  - textUtils.ts - 텍스트 처리 유틸리티 (normalizeAndTokenize, extractMeaningfulSegments, contentHasPriceIndicator)
  - idUtils.ts - ID 생성 유틸리티 (generateProductUniqueIdForItem, generateOrderUniqueId, generateCustomerUniqueId)
  - priceUtils.ts - 가격 계산 유틸리티 (extractPriceInfoFromContent, calculateOptimalPrice, findMatchingPriceOption 등)
  - logger.ts - 로깅 유틸리티 (createLogger)
- 주요 변경사항:
  - logger.ts: Deno.env.get → process.env로 환경 변수 접근 방식 변경 (브라우저/Node.js 환경 대응)
  - 모든 기능과 로직은 원본 그대로 유지
- 다음 작업:
  1. 다른 모듈(AI 1-3)에서 이식한 기능들이 utils 함수를 import하여 사용할 수 있도록 경로 확인
  2. AI 2에서 이미 일부 utils 파일(textUtils.ts, dateUtils.ts, idUtils.ts)을 이식했으므로 중복 확인 필요
  3. logger.ts 환경변수 설정 확인
  4. 전체 모듈 통합 및 테스트 진행

---

## ###band-get-posts-a 내부 함수 이식

**backend/supabase/functions/band-get-posts-a/index.ts 내부에서 정의된 함수들** (import하지 않고 파일 내부에 구현된 함수)

### 유틸리티 함수 ✅ 완료
1. formatKstDateTime - KST 시간대 날짜 포맷팅
2. kstDateToUtcISOString - KST 날짜를 UTC ISO 문자열로 변환
3. updateTitleWithDate - 제목에 날짜 추가
- **이식 위치**: front/app/lib/updateButton/fuc/utils/dateUtils.ts
- **변경사항**: JavaScript로 변환, JSDoc 주석 추가, 모든 로직 유지

### 취소 처리 함수 ✅ 완료
4. filterCancellationComments - 취소 댓글 필터링
5. processCancellationRequests - 취소 요청 처리
6. cancelPreviousOrders - 이전 주문 취소 처리
- **이식 위치**: front/app/lib/updateButton/fuc/cancellation/
  - cancellationFilter.js - 취소 댓글 필터링 (filterCancellationComments)
  - cancellationProcessor.js - 취소 요청 및 주문 취소 처리 (processCancellationRequests, cancelPreviousOrders)
- **변경사항**:
  - TypeScript → JavaScript 변환
  - logger → console 로깅으로 변경 (프론트엔드 환경)
  - JSDoc 주석 추가
  - 모든 비즈니스 로직과 패턴 매칭 로직 유지
  - Supabase 클라이언트 인스턴스를 파라미터로 받도록 설계

### 상품 처리 함수 ✅ 완료
7. getDefaultProduct - 기본 상품 정보 반환
8. processProduct - 상품 정보 처리 및 검증
9. detectAndMergeQuantityBasedProducts - 수량 기반 상품 병합
10. extractNumberedProducts - 번호 지정 상품 추출
- **이식 위치**: front/app/lib/updateButton/fuc/productProcessing/
  - defaultProduct.js - 기본 상품 정보 생성 (getDefaultProduct)
  - productProcessor.js - 상품 정보 처리 및 검증 (processProduct)
  - productMerger.js - 수량 기반 상품 병합 (detectAndMergeQuantityBasedProducts)
  - numberedProductExtractor.js - 번호 지정 상품 추출 (extractNumberedProducts)
- **변경사항**:
  - TypeScript → JavaScript 변환
  - logger → console 로깅으로 변경
  - JSDoc 주석 추가
  - 모든 비즈니스 로직 유지:
    - 개별 상품 vs priceOptions 구조 자동 판별
    - 중복 옵션 제거 및 최저가 유지
    - basePrice 자동 설정 (최소 수량 우선)
    - 바코드 자동 생성 (userSettings 기반)
    - 제목 정규화를 통한 동일 상품 병합
    - 6가지 번호 패턴 매칭 (숫자, 특수문자 번호 지원)

### Band API 통신 함수 ✅ 완료
11. fetchBandPosts - Band API에서 게시물 가져오기
12. fetchBandComments - Band API에서 댓글 가져오기
13. fetchBandPostsWithFailover - Failover를 적용한 게시물 가져오기
14. fetchBandCommentsWithFailover - Failover를 적용한 댓글 가져오기
15. fetchBandCommentsWithBackupFallback - 백업 Fallback을 적용한 댓글 가져오기
- **이식 위치**: front/app/lib/updateButton/fuc/bandApi/bandApiClient.js
- **변경사항**:
  - TypeScript → JavaScript 변환
  - logger → console.log/error/info/debug로 변경
  - isQuotaExceededError 헬퍼 함수 추가 (할당량 초과 에러 감지)
  - 5개 함수 모두 이식 완료
  - 모든 로직과 페이징 처리 로직 유지
  - Band API 엔드포인트 URL 유지
- **주요 기능**:
  - fetchBandCommentsWithBackupFallback: 메인 토큰 실패 시 백업 토큰으로 자동 재시도
  - fetchBandPostsWithFailover: bandApiFailover 객체를 사용한 다중 토큰 failover
  - fetchBandCommentsWithFailover: bandApiFailover 객체를 사용한 다중 토큰 failover
  - fetchBandPosts/fetchBandComments: 단일 토큰 기본 구현
  - 페이징 지원: next_params를 사용한 자동 페이지네이션
- **다음 작업**: bandApiFailover 클래스 및 상품 처리 함수, DB 저장 함수 이식 필요

### AI 및 데이터 처리 함수 ✅ 완료
16. enhancePickupDateFromContent - 게시물 내용에서 픽업 날짜 추출 및 향상
- **이식 위치**: front/app/lib/updateButton/fuc/aiProcessing/
  - enhancePickupDateFromContent.js - 게시물 내용에서 픽업 날짜 추출 및 향상
- **변경사항**:
  - TypeScript → JavaScript 변환
  - logger를 console 로깅으로 변경 (브라우저 환경 대응)
  - JSDoc 주석 추가
  - 모든 비즈니스 로직 유지 (시간/날짜/요일 패턴 추출, 영업시간 고려, 다음주 키워드 감지)
  - dateUtils의 convertUTCtoKST, kstDateToUtcISOString, updateTitleWithDate 함수 import
  - 특수 패턴 처리 (상품수령기간, 명시적 날짜, 요일, 시간)
- **주요 기능**:
  - 게시물 내용에서 시간 패턴 추출 (2단계 접근: 정확한 패턴 → 느슨한 패턴)
  - 날짜 패턴 추출 (상품수령기간, N월 N일 형식)
  - 요일 패턴 추출 (오늘, 내일, 모레, 월~일요일)
  - 영업시간 고려 (8시~20시, 8시 미만은 오후로 변환)
  - pickup_date 계산 및 title 업데이트

### DB 저장 함수 ✅ 완료
17. savePostAndProducts - 게시물 및 상품 저장
18. fetchProductMapForPost - 게시물의 상품 맵 조회
- **이식 위치**: front/app/lib/updateButton/fuc/db/
  - dbSaveHelpers.js - 게시물 및 상품 저장 (savePostAndProducts)
  - dbFetchHelpers.js - 상품 맵 조회 (fetchProductMapForPost)
- **변경사항**:
  - TypeScript → JavaScript 변환
  - logger → console 로깅으로 변경
  - enhancePickupDateFromContent, generateProductUniqueIdForItem import
  - JSDoc 주석 추가
  - 모든 DB 저장 로직 및 데이터 검증 로직 유지
  - Supabase 클라이언트 인스턴스를 파라미터로 받도록 설계

---

## 🔥 Phase 2: 미완료 핵심 기능 이식

### AI 1 - 상품 처리 함수 이식 (4개 함수) ✅ 완료
**담당 함수**: backend/supabase/functions/band-get-posts-a/index.ts 내부
- getDefaultProduct (Line 213-242) - 기본 상품 정보 반환
- processProduct (Line 244-376) - 상품 정보 처리 및 검증
- detectAndMergeQuantityBasedProducts (Line 378-459) - 수량 기반 상품 병합
- extractNumberedProducts (Line 461-574) - 번호 지정 상품 추출

**목표 폴더**: front/app/lib/updateButton/fuc/productProcessing/
**완료된 작업**:
1. ✅ productProcessing 폴더 생성
2. ✅ 4개 파일 생성 및 이식 완료:
   - defaultProduct.js (getDefaultProduct)
   - productProcessor.js (processProduct)
   - productMerger.js (detectAndMergeQuantityBasedProducts)
   - numberedProductExtractor.js (extractNumberedProducts)
3. ✅ TypeScript → JavaScript 변환
4. ✅ logger → console 로깅으로 변경
5. ✅ JSDoc 주석 추가
6. ✅ 모든 비즈니스 로직 유지

**주요 기능**:
- getDefaultProduct: AI 분석 필요 시 기본 상품 구조 반환
- processProduct: 개별 상품 vs priceOptions 구조 자동 판별, basePrice 자동 설정, 바코드 옵션 생성
- detectAndMergeQuantityBasedProducts: 동일 제목 상품 병합, 가격 옵션 통합, 재고 합산
- extractNumberedProducts: 6가지 번호 패턴 지원 (1번., 1., ①, 등)

---

### AI 2 - BandApiFailover 클래스 이식 ✅ 완료
**담당 파일**: backend/supabase/functions/band-get-posts-a/bandApiFailover.ts (전체 파일)

**목표 폴더**: front/app/lib/updateButton/fuc/bandApi/
**이식 위치**: front/app/lib/updateButton/fuc/bandApi/BandApiFailover.js

**작업 완료**:
1. ✅ BandApiFailover.js 파일 생성
2. ✅ 클래스 전체 이식 (9개 메서드):
   - loadApiKeys() - DB에서 API 키 로딩
   - getCurrentApiKey() - 현재 사용할 API 키 반환
   - switchToNextKey() - 다음 백업 키로 전환
   - executeWithFailover() - 자동 페일오버 실행 (핵심 메서드)
   - analyzeErrorType() - 에러 타입 분석
   - logApiUsage() - API 사용 로그 기록
   - startSession() - 세션 시작
   - endSession() - 세션 종료 및 통계 저장
   - getUsageStats() - 현재 사용 통계 반환
3. ✅ TypeScript → JavaScript 변환
4. ✅ logger → console.log/error/info/debug로 변경
5. ✅ Supabase 클라이언트 생성자 파라미터로 받기
6. ✅ JSDoc 주석 추가 (모든 메서드와 파라미터)
7. ✅ 세션 관리 및 API 키 상태 추적 로직 유지

**변경사항**:
- TypeScript 타입 제거, JSDoc으로 대체
- logger → console 메서드로 변경
- Deno 특화 코드 제거
- 모든 비즈니스 로직과 페일오버 로직 유지

**주요 기능**:
- 다중 API 키 관리 (메인 키 + 백업 키 배열)
- 할당량 초과 시 자동 전환 (quota_exceeded, invalid_token 감지)
- API 키별 사용 통계 추적 (posts/comments 개수, API 호출 수)
- 세션별 API 호출 추적 (band_api_sessions, band_api_usage_logs 테이블)
- 자동 페일오버: 모든 키를 순차적으로 시도, 성공 시 메인 키로 복구
- 테스트 모드 지원 (simulateQuotaError)

**다음 작업**: fetchBandPostsWithFailover, fetchBandCommentsWithFailover 함수에서 이 클래스를 import하여 사용

---

### AI 3 - generateOrderData 함수 이식 ✅ 완료
**담당 함수**: backend/supabase/functions/band-get-posts-a/index.ts의 generateOrderData (Line 1689-3728, ~2039줄)

**이식 위치**: front/app/lib/updateButton/fuc/orderGeneration/
- generateOrderData.js - 주문 데이터 생성 메인 함수
- fetchProductMapForPost - 상품 정보 조회 헬퍼 함수

**작업 완료**:
1. ✅ generateOrderData.js 파일 생성
2. ✅ 핵심 로직 단계별 이식 (6개 Phase):
   - **Phase 1** ✅: 댓글 분류 시스템 (Line 1857-1976)
     - 명확한 패턴 vs 애매한 패턴 감지
     - 무게/용량 제품 감지
     - 다중 숫자 패턴 감지
   - **Phase 2** ✅: AI 모드 전환 로직 (Line 1980-2047)
     - off/smart/aggressive 모드 분기
     - 사용자 설정 기반 AI 사용 결정
   - **Phase 3** ✅: AI 배치 처리 (Line 2048-2269)
     - 10개 댓글씩 배치 처리
     - extractOrdersFromCommentsAI 호출
     - AI 응답 파싱 및 검증
   - **Phase 4** ✅: 제외 고객 필터링 (Line 1820-1848)
     - excluded_customers 테이블 조회
     - 제외 대상 사전 필터링
   - **Phase 5** ✅: 4개 매처 시스템 통합 (Line 2270-3500)
     - MatcherOrchestrator 사용
     - processNumberBasedOrder, processProductNameOrder
     - 폴백 매칭 전략
   - **Phase 6** ✅: 주문/고객 데이터 생성 (Line 3500-3720)
     - order 객체 생성
     - customer Map 구축
     - 중복 제거 및 집계
3. ✅ TypeScript → JavaScript 변환 완료
4. ✅ logger → console.log/error/info/warn/debug로 변경
5. ✅ 모든 import 추가:
   - filterCancellationComments
   - MatcherOrchestrator
   - extractOrdersFromCommentsAI
   - processNumberBasedOrder, processProductNameOrder
   - findBestProductMatch
   - extractOrderByUnitPattern
   - CommentClassifier
   - shouldUsePatternProcessing
   - generateOrderUniqueId, generateCustomerUniqueId
   - calculateOptimalPrice
   - safeParseDate
6. ✅ JSDoc 주석 추가 (함수 설명, 파라미터, 반환값)
7. ✅ 에러 핸들링 강화 (배치 실패 시 부분 결과 반환)

**변경사항**:
- TypeScript → JavaScript 변환 (타입 제거, JSDoc으로 대체)
- logger → console 메서드로 변경
- 모든 비즈니스 로직 유지 (댓글 분류, AI 모드, 배치 처리, 매처 시스템, 가격 계산)
- Supabase 클라이언트 파라미터로 받기
- ZERO ORDER MISS 정책 포함 (모든 댓글을 주문으로 처리)

**주요 기능**:
- 댓글에서 주문 정보 자동 추출
- AI 기반 주문 분석 (10개씩 배치 처리)
- 3개 AI 모드 지원 (off/smart/aggressive)
- 4개 매처 시스템 자동 적용
- 취소 댓글 필터링
- 제외 고객 사전 필터링 (리소스 절약)
- 주문/고객 데이터 구조화
- 가격 계산 (단위 변환, 옵션 선택)
- 긴급 주문 생성 (ZERO MISS)

**의존성 (모두 이미 이식 완료)**:
- ✅ filterCancellationComments
- ✅ MatcherOrchestrator
- ✅ extractOrdersFromCommentsAI
- ✅ processNumberBasedOrder, processProductNameOrder
- ✅ findBestProductMatch
- ✅ extractOrderByUnitPattern
- ✅ CommentClassifier
- ✅ shouldUsePatternProcessing
- ✅ generateOrderUniqueId, generateCustomerUniqueId
- ✅ calculateOptimalPrice
- ✅ safeParseDate

**다음 작업**:
- 프론트엔드 환경에서 통합 테스트
- AI 배치 처리 성능 모니터링
- 에러 핸들링 검증
- import 경로 최종 확인

---

## 작업 우선순위

1. **AI 3** (generateOrderData) - 최우선 ⚠️ ✅ 완료
2. **AI 1** (상품 처리 함수) - 중요 ✅ 완료
3. **AI 2** (BandApiFailover) - 중요 ✅ 완료

**결과**: 모든 핵심 함수 이식 완료!

---

## 🎉 Phase 3: 메인 오케스트레이터 구현

### 메인 프로세서 함수 생성 ✅ 완료

**파일명**: front/app/lib/updateButton/fuc/processBandPosts.js
**함수명**: processBandPosts(supabase, userId, options)

**구현 완료 내용**:
1. ✅ 파라미터 처리 (userId, testMode, processingLimit, processWithAI, simulateQuotaError)
2. ✅ Execution lock (중복 실행 방지)
3. ✅ 사용자 설정 조회
4. ✅ BandApiFailover 초기화
5. ✅ Smart Priority System (pending/failed/old posts 조회 및 병합)
6. ✅ Band API 게시물 가져오기
7. ✅ DB 기존 게시물 조회 (dbPostsMap 생성)
8. ✅ **배치 처리 로직 완료** - 약 900줄 구현
9. ✅ 댓글 정보 일괄 업데이트
10. ✅ 사용자 last_crawl_at 업데이트
11. ✅ 결과 반환
12. ✅ Execution lock 해제
13. ✅ 에러 핸들링

**모든 import 완료**:
- ✅ BandApiFailover
- ✅ fetchBandPostsWithFailover, fetchBandCommentsWithFailover
- ✅ getDefaultProduct, processProduct
- ✅ extractProductInfoAI
- ✅ generateOrderData
- ✅ savePostAndProducts, fetchProductMapForPost
- ✅ saveOrdersAndCustomersSafely
- ✅ processCancellationRequests
- ✅ contentHasPriceIndicator
- ✅ enhancePickupDateFromContent

**배치 처리 로직 구현 완료** (약 900줄):
- ✅ 게시물 10개씩 배치로 나누기
- ✅ AI 요청 세마포어 (최대 8개 동시 실행)
- ✅ 신규 게시물 처리 (AI 추출 → 저장 → 댓글 → 주문)
- ✅ 기존 게시물 처리 (AI 재시도, 강제 추출, 댓글 업데이트 → 주문)
- ✅ 개별 에러 핸들링
- ✅ 댓글 체크 우선순위 정렬 제외 (사용자 요청)

---

## 📊 전체 이식 진행률: **100%** ✅

**완료된 작업**:
- ✅ Phase 1: 기본 모듈 이식 (AI 1-4) - 100%
- ✅ Phase 2: 핵심 기능 이식 (AI 1-3) - 100%
- ✅ Phase 3: 메인 오케스트레이터 골격 - 100%
- ✅ Phase 4: 배치 처리 로직 구현 - 100%

**이식 완료!** 🎉

---

## ✅ Phase 4: 배치 처리 로직 구현 (완료)

### AI 4 - 배치 처리 로직 구현 ✅ 완료

**담당 파일**: front/app/lib/updateButton/fuc/processBandPosts.js
**작업 라인**: TODO 주석 위치 (현재 Line ~370)
**참고 원본**: backend/supabase/functions/band-get-posts-a/index.ts (Line 4046-4924, 약 880줄)

**작업 내용**:

#### 1. 배치 처리 설정 구현
```javascript
// 🎯 배치 처리를 위한 설정
const POST_BATCH_SIZE = 10; // 게시물 10개씩 배치 처리
const MAX_CONCURRENT_AI_REQUESTS = 8; // 동시 AI 요청 최대 8개
const MAX_POSTS_FOR_COMMENT_CHECK = 200; // 댓글 체크 대상 최대 200개
```

#### 2. AI 세마포어 패턴 구현
```javascript
// AI 동시 요청 제한을 위한 세마포어
let currentAIRequests = 0;
const aiRequestQueue = [];

const acquireAISlot = async () => {
  while(currentAIRequests >= MAX_CONCURRENT_AI_REQUESTS) {
    await new Promise((resolve) => {
      aiRequestQueue.push(resolve);
    });
  }
  currentAIRequests++;
};

const releaseAISlot = () => {
  currentAIRequests--;
  const nextRequest = aiRequestQueue.shift();
  if (nextRequest) {
    nextRequest();
  }
};

const limitedAIRequest = async (aiFunction, ...args) => {
  await acquireAISlot();
  try {
    return await aiFunction(...args);
  } finally {
    releaseAISlot();
  }
};
```

#### 3. 댓글 체크 우선순위 정렬
- pending posts 우선
- 7일 이상 미체크 posts
- DB에서 가져온 posts
- 댓글 증가량이 많은 순
- 오래 체크 안 한 순

#### 4. 게시물 배치로 나누기
```javascript
const postBatches = [];
for(let i = 0; i < posts.length; i += POST_BATCH_SIZE) {
  postBatches.push(posts.slice(i, i + POST_BATCH_SIZE));
}
```

#### 5. 각 배치 순차 처리 + 내부 병렬 처리
```javascript
for(let batchIndex = 0; batchIndex < postBatches.length; batchIndex++) {
  const batch = postBatches[batchIndex];

  const batchPromises = batch.map(async (apiPost) => {
    // 각 게시물 병렬 처리 (AI는 세마포어로 제한)
  });

  const batchResults = await Promise.all(batchPromises);
  allProcessedResults.push(...batchResults);
}
```

#### 6. 신규 게시물 처리 로직 (Line 4184-4501)
**Phase A: 비상품 게시물 처리**
- `contentHasPriceIndicator()` 체크
- 가격 정보 없으면 "공지사항"으로 저장
- `ai_extraction_status: 'not_product'`
- `comment_sync_status: 'completed'`

**Phase B: 상품 게시물 AI 추출**
- `limitedAIRequest(extractProductInfoAI, ...)`로 AI 호출 (세마포어 적용)
- `convertUTCtoKST()`, `formatKstDateTime()` 사용
- AI 응답 검증 (products 배열 확인)
- keywordMappings 처리 (단일/다중 상품)
- `processProduct()` 각 상품 처리
- `aiExtractionStatus` 설정 ('success', 'failed', 'error')

**Phase C: 게시물 및 상품 저장**
- `savePostAndProducts()` 호출
- testMode일 경우 저장 건너뛰기

**Phase D: 댓글 및 주문 처리**
- `fetchBandCommentsWithFailover()` 댓글 가져오기
- `generateOrderData()` 주문 생성
- `saveOrdersAndCustomersSafely()` 주문 저장
- `processCancellationRequests()` 취소 처리
- `comment_sync_status` 업데이트

#### 7. 기존 게시물 처리 로직 (Line 4502-4880)
**Phase A: AI 재시도 로직**
- `ai_extraction_status === 'failed'` or `'error'`인 경우
- `limitedAIRequest(extractProductInfoAI, ...)` 재시도
- 성공 시 `savePostAndProducts()` 업데이트

**Phase B: 강제 추출 로직**
- `is_product === true` but products 없는 경우
- 1회 AI 추출 시도
- 성공 시 `forceProcessAllComments = true`

**Phase C: 댓글 업데이트 체크**
```javascript
const needsCommentUpdate = postsNeedingCommentCheck.includes(postKey);
const commentDiffFromApi = (apiPost.commentCount || 0) - (dbPostData?.comment_count || 0);
const isPendingOrFailedPost = /* pending/failed 상태 체크 */;
```

**Phase D: 새 댓글 필터링**
- `last_checked_comment_at` 기준으로 필터링
- 새 댓글만 처리 또는 전체 재처리 (`forceProcessAllComments`)

**Phase E: 주문 생성**
- `fetchProductMapForPost()` 상품 맵 조회
- `generateOrderData()` 주문 생성
- `saveOrdersAndCustomersSafely()` 저장
- `processCancellationRequests()` 취소 처리

#### 8. 결과 수집 및 반환
```javascript
const processedPost = {
  postKey,
  isNewPost,
  hasNewComments,
  processedComments,
  comment_sync_status,
  processingError,
  // ... 기타 정보
};
return processedPost;
```

#### 9. postsToUpdateCommentInfo 배열 구성
```javascript
postsToUpdateCommentInfo.push({
  post_id: dbPostData.post_id,
  comment_count: finalCommentCountForUpdate,
  last_checked_comment_at: latestCommentTimestampForUpdate,
  comment_sync_status: 'completed' // or 'failed'
});
```

**의존성 (모두 이미 이식 완료)**:
- ✅ extractProductInfoAI (with limitedAIRequest wrapper)
- ✅ contentHasPriceIndicator
- ✅ convertUTCtoKST, formatKstDateTime
- ✅ processProduct
- ✅ savePostAndProducts
- ✅ fetchBandCommentsWithFailover
- ✅ generateOrderData
- ✅ saveOrdersAndCustomersSafely
- ✅ processCancellationRequests
- ✅ fetchProductMapForPost

**주의사항**:
1. **에러 핸들링**: 각 게시물 처리는 try-catch로 감싸고, 에러 발생 시에도 다음 게시물 계속 처리
2. **testMode**: testMode === true일 때 DB 저장 건너뛰기
3. **메모리 관리**: 대량 데이터 처리 시 메모리 누수 주의
4. **로깅**: console.log로 진행 상황 추적 (배치 번호, 처리 시간 등)
5. **타임아웃**: 브라우저 환경에서 장시간 실행 시 타임아웃 고려

**예상 소요 시간**: 2-3시간

**참고 파일**:
- 원본 로직: `backend/supabase/functions/band-get-posts-a/index.ts` (Line 4046-4924)
- 작업 파일: `front/app/lib/updateButton/fuc/processBandPosts.js`
- 모든 필요한 함수는 이미 import 완료

**검증 방법**:
1. 신규 게시물 생성 후 처리 테스트
2. 기존 게시물 댓글 추가 후 업데이트 테스트
3. AI 추출 실패 케이스 테스트
4. 배치 처리 성능 확인 (10개씩 처리)
5. 에러 발생 시 다른 게시물 계속 처리 확인