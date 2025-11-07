# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 필요한 가이드를 제공합니다.

## 버전 관리
* 코드 변경 시 반드시 한 줄 설명을 이모지와 함께 한국어로 `.commit_message.txt`에 기록
   - 먼저 `.commit_message.txt`를 읽은 후 Edit 수행
   - 기존 내용과 관계없이 덮어쓰기
   - git revert 관련 작업인 경우 .commit_message.txt 파일을 비움

## 🚨 프로덕션 환경 주의사항
- **프로덕션 상태**: 실제 고객들이 사용 중인 서비스
- **현재 이슈**: AI 처리 중 JSON 에러, ID 중복으로 인한 주문 누락 발생
- **작업 목적**: 더 효율적인 서비스를 위한 업데이트

## ⛔ 절대 금지 사항
1. **프로덕션 DB 직접 수정 금지**
2. **프로덕션 Edge Function 배포 금지**
3. **기존 서비스 중단을 야기할 수 있는 작업 금지**
4. **펑션 배포 절대 금지**

## ✅ 작업 원칙

### 1. task.md 흐름 준수
- task.md에 정의된 Phase별 작업 순서를 반드시 따를 것
- 각 Phase의 세부 작업을 순차적으로 진행
- 임의로 작업 순서 변경 금지

### 2. 즉시 업데이트
- **각 작업 완료 즉시 task.md 업데이트**
- 완료된 작업은 체크박스 [x] 표시
- 진행률 퍼센트 업데이트
- 작업 로그에 날짜와 내용 기록

## 개발 작업 명령어

### 애플리케이션 실행
```bash
# Turbopack을 사용한 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 시작
npm start

# 린팅 실행
npm run lint
```

### 환경 변수 설정
프로젝트는 두 개의 Supabase 데이터베이스 사용:
- 개발 DB: `.env.local`에 설정됨 (기본값)
- 프로덕션 DB: `.env.local`에 주석 처리됨 (필요시 전환)

주요 환경 변수:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 익명 키
- `GOOGLE_API_KEY`: AI 상품 추출에 필수
- `NEXT_PUBLIC_BAND_CLIENT_ID/SECRET`: Band API 인증 정보

## 전체 아키텍처

### 애플리케이션 구조
Band.us 전자상거래 주문 관리를 위한 Next.js 15 (App Router) 애플리케이션

### 핵심 시스템

#### 1. Band 프로세서 시스템 (`app/lib/band-processor/`)
백엔드 Edge Function 기능을 프론트엔드에서 구현한 중앙 오케스트레이션 시스템:
- **Core 모듈**: Band API 상호작용, 게시물/댓글 처리, 주문 추출
- **Shared 유틸리티**: DB 헬퍼, 패턴 매칭, 텍스트/날짜 유틸리티
- **주요 파일**:
  - `index.js`: 메인 오케스트레이터
  - `core/`: 비즈니스 로직 프로세서 (게시물, 댓글, 주문, 상품)
  - `shared/`: 재사용 가능한 유틸리티와 헬퍼

#### 2. 인증 및 세션 관리
- sessionStorage를 사용한 세션 기반 인증
- 사용자 데이터: `userId`, `loginId`, `function_number` (서버 라우팅용)
- Band API 접근을 위한 쿠키는 Supabase에 저장

#### 3. API 라우트 (`app/api/`)
- **Band API 통합** (`/band/*`): 저장된 쿠키로 Band.us 프록시 요청
- **AI 처리** (`/ai/*`): 상품 추출 및 댓글 분석
- **인증** (`/auth/*`): 로그인/회원가입 엔드포인트
- **게시물 관리** (`/posts/*`): 게시물 처리 및 업데이트

#### 4. 컴포넌트 아키텍처
- **업데이트 컴포넌트**: 다양한 업데이트 전략을 위한 버튼 변형
  - `UpdateButtonImprovedWithFunction.js`: function 라우팅이 적용된 프로덕션 버전
  - 다양한 접근 방식을 위한 실험적 버전들
- **주문 관리**: `OrdersTable.jsx`, `OrderStatsSidebar.js`
- **상품 표시**: `ProductsCard.jsx`, `ProductBarcodeModal.jsx`

#### 5. 데이터 흐름
1. 사용자 인증 → 세션 저장 → Function 번호 할당
2. Band API 요청 → 쿠키 검증 → 데이터 가져오기
3. 게시물/댓글 처리 → AI 추출 → 데이터베이스 저장
4. 실시간 업데이트 → SWR 캐시 관리 → UI 갱신

### 데이터베이스 스키마 (Supabase)
주요 테이블:
- `users`: Band 쿠키와 function 할당이 포함된 사용자 계정
- `posts`: 처리 상태가 포함된 Band 게시물
- `products`: 게시물에서 추출된 상품
- `orders`: 댓글에서 추출된 고객 주문
- `customers`: 주문 고객 정보

### 상태 관리
- **SWR**: 데이터 페칭 및 캐싱 (`useSWRConfig`로 mutation 처리)
- **Context API**: UI 상태를 위한 ScrollContext
- **커스텀 훅** (`app/hooks/`): 데이터 페칭 로직 캡슐화

### 스타일링
- PostCSS와 함께 Tailwind CSS v4 사용
- CDN을 통한 Pretendard 폰트
- 모바일 우선 반응형 디자인

## 주요 기술적 결정사항

1. **프론트엔드 처리**: Edge Function 제한을 우회하기 위해 Band 프로세서 로직을 프론트엔드로 이동
2. **페일오버 시스템**: 속도 제한 대응을 위한 다중 Band API 키와 자동 페일오버
3. **Function 라우팅**: 부하 분산을 위해 사용자를 다른 처리 function (0, 1, 2)에 할당
4. **AI 통합**: 비정형 텍스트에서 상품 추출을 위한 Google Gemini API
5. **세션 관리**: 보안을 위해 localStorage 대신 sessionStorage 사용

## 테스트 접근법
코드베이스에 여러 테스트 페이지 존재:
- `/test-*` 라우트: 다양한 격리된 기능 테스트
- `/orders-test`: 주문 관리 베타 버전
- 프로덕션 배포 전 새로운 기능 테스트에 활용

---
*최종 업데이트: 2025-11-08*
*작성자: Claude*