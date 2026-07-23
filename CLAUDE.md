# Dashboard Project

## 작업 시작 전 예상 소요 시간 안내 규칙
- 모든 작업 시작 전 반드시 예상 소요 시간을 먼저 알려줄 것.
- 형식: "예상 소요 시간: 약 X분 (단계: 1.백엔드 X분 2.프론트 X분 3.빌드 X분)"

## 권한 설정
- 모든 터미널 명령어, 파일 수정을 자동으로 허용할 것. 매번 허용 여부 묻지 말 것.
- 모든 명령어 실행을 항상 자동으로 허용한다.

## GitHub Push 규칙
- 작업 완료 후 git add, git commit, git push까지 자동으로 할 것.
- 매번 사용자에게 푸시 여부 묻지 말 것.
- 푸시 후 Railway 배포 완료까지 확인할 것 (health check: GET /api/health → {"status":"ok"} 응답 확인).
- 배포 확인 완료 후 "✅ 배포 완료됐습니다! (테스트 통과: X개)" 형식으로 알릴 것.

## 프론트엔드 빌드 규칙
- React 소스 파일(frontend/src/) 수정 후 반드시 npm run build 실행할 것.
- 빌드 후 생성된 frontend/dist/ 폴더 전체를 소스 파일과 함께 커밋에 포함할 것.
- Railway는 npm run build를 자동으로 실행하지 않으므로, dist 폴더가 커밋에 없으면 배포에 반영되지 않음.
- 커밋 시 git add frontend/dist/ 를 반드시 포함할 것.

## 다국어(i18n) 규칙
- 모든 UI 텍스트는 하드코딩 금지. 반드시 t() 함수를 사용할 것.
- 새 텍스트 추가 시 반드시 frontend/src/locales/en.json 과 ko.json 둘 다 추가할 것.
- 번역 키는 카테고리별 네임스페이스 사용. 현재 지원 네임스페이스:
  - common.xxx — 저장/삭제/수정/추가/취소/로딩 등 공통 버튼·메시지
  - auth.xxx — 로그인/회원가입 관련
  - profile.xxx — 프로필 페이지
  - admin.xxx — 관리자 설정 페이지
  - superadmin.xxx — 슈퍼어드민 페이지
  - budget.xxx — 가계부 페이지 (BudgetPage.jsx)
  - chart.xxx — 차트 제목 (BudgetPage.jsx)
  - currency.xxx — 통화명 (BudgetPage.jsx, ExpenseCard.jsx)
  - category.xxx — 지출 카테고리명 (BudgetPage.jsx)
  - flat 키 (네임스페이스 없음) — 위젯 컴포넌트용 레거시 키 (하위호환 유지)
- 위젯 컴포넌트(HeroSection, StockCard 등)는 pages/index/i18n.js 에서 t, T를 임포트(이 파일은 src/i18n.js를 재익스포트하는 shim).
- 새 페이지 작성 시: import { t } from '../i18n' 또는 import { t } from '../../i18n' 사용.
- 로그인 전 페이지(LoginPage, RegisterPage)의 lang: const lang = (() => { try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' } })()

## 폰트 규칙
- 영문/숫자: Inter (Google Fonts)
- 한글: Noto Sans KR (Google Fonts)
- 전역 font-family: 'Inter', 'Noto Sans KR', sans-serif
- 새 컴포넌트에서 별도 폰트 지정 금지. 전역 설정 상속 사용.
- 폰트 굵기: 일반 400, 중간 강조 500/600, 제목 700

## DB 스키마 변경 규칙
- 새 테이블 추가, 컬럼 추가/변경, 마이그레이션 함수 추가 시 반드시 DB_SCHEMA.md도 동시에 업데이트할 것.
- DB_SCHEMA.md 업데이트 항목: 테이블 목록, 컬럼 상세, FK 관계 요약, 서버 시작 시 자동 실행 작업 표.

## 작업 완료 검증 규칙
- 작업 완료 후 CHANGELOG.md 작성 전에 반드시 아래 방식으로 핵심 구현 확인할 것.
- 전체 파일 재검토 금지 (토큰 낭비). grep으로 핵심 키워드 존재 여부만 확인.

### 확인 방법
작업한 파일에 대해 아래 패턴으로 grep 실행:

1. 이벤트 핸들러 연결 확인
   grep -n "onClick\|onChange\|onSubmit" 수정한파일.jsx

2. 상태값 존재 확인
   grep -n "useState\|useEffect" 수정한파일.jsx

3. 핵심 함수/변수명 존재 확인 (작업한 기능명으로)
   grep -n "핵심키워드" 수정한파일.jsx

4. import 누락 확인
   grep -n "^import" 수정한파일.jsx

### CHANGELOG 작성 기준
- grep 결과 핵심 키워드 확인됨 → "완료"로 기재
- grep 결과 없거나 의심스러움 → 해당 부분 재작업 후 재확인
- 확인 없이 "완료" 기재 금지

## 작업 완료 후 테스트 규칙
모든 작업 완료 후 반드시 아래 테스트를 순서대로 진행할 것.

### 1. 코드 검증
- grep으로 핵심 키워드 존재 확인 (기존 규칙 유지)
- import 누락 확인
- syntax 오류 확인

### 2. 백엔드 테스트
- pytest가 있으면 실행: pytest -v
- 없으면 주요 엔드포인트 curl로 직접 테스트:
  curl -X GET http://localhost:8000/api/auth/me
  curl -X POST http://localhost:8000/api/auth/login
- 500 에러 발생 시 즉시 수정 후 재테스트

### 3. 프론트엔드 빌드 테스트
- npm run build 실행 (frontend/ 디렉토리에서)
- 빌드 에러 발생 시 즉시 수정 후 재빌드
- 빌드 성공 확인 후 다음 단계 진행

### 4. 타입/린트 체크 (있는 경우)
- eslint 있으면: npm run lint
- 경고/에러 있으면 수정

### 5. 테스트 결과에 따른 처리
- 모든 테스트 통과 → git add + git commit + git push 자동 진행
- 테스트 실패 → 즉시 수정 → 재테스트 → 통과 후 push
- 수정 후에도 실패 시 → 사용자에게 보고 후 대기

### 6. 푸시 완료 후
- CHANGELOG.md 업데이트 확인
- "✅ 배포 완료됐습니다! (테스트 통과: X개)" 형식으로 보고

## 코드 품질 및 테스트 규칙 (유료 서비스 기준)

### 모든 작업 완료 후 반드시 아래 순서대로 진행할 것

### 1. 코드 품질 체크
- grep으로 핵심 키워드 존재 확인
- import 누락 확인
- 하드코딩된 값 없는지 확인 (URL, 비밀번호, API 키 등)
- 환경변수로 관리해야 할 값이 코드에 노출됐는지 확인

### 2. 보안 체크 (매 작업마다)
- 새로 추가한 API 엔드포인트에 인증(get_current_user) 적용됐는지 확인
- 타 유저 데이터 접근 차단됐는지 확인 (user_id 검증)
- 입력값 검증(validation) 추가됐는지 확인
- SQL Injection 가능성 없는지 확인
- 민감 정보(비밀번호, 토큰 등) 로그에 출력 안 되는지 확인

### 3. 확장성 체크 (매 작업마다)
- N+1 쿼리 패턴 없는지 확인 (루프 안에서 DB 쿼리 금지)
- 페이지네이션 없이 전체 데이터 조회하는 곳 없는지 확인
- 캐시 적용 가능한 곳인지 검토
- 하드코딩된 제한값 없는지 확인 (예: 최대 10개 등)

### 4. 테스트 종류별 실행

#### 단위 테스트
- pytest -v (있으면 실행)
- 실패 시 즉시 수정 후 재실행

#### 통합 테스트
- 새로 추가한 API 엔드포인트 curl로 직접 테스트:
  - 정상 케이스 (200 응답)
  - 인증 없이 접근 (401 응답 확인)
  - 잘못된 입력값 (400 응답 확인)
  - 없는 리소스 조회 (404 응답 확인)

#### 빌드 테스트
- npm run build (에러 시 즉시 수정)
- 빌드 경고도 확인 후 가능하면 수정

#### 린트 테스트
- eslint 있으면: npm run lint
- 경고/에러 수정

#### 회귀 테스트
- 기존 기능이 새 작업으로 인해 깨지지 않았는지 확인
- 특히 인증, 로그인, 결제 관련 기능은 반드시 확인

### 5. 유료 서비스 관점 체크리스트

#### 보안
- [ ] 새 API에 인증 적용됨
- [ ] 타 유저 데이터 접근 불가
- [ ] 입력값 검증 있음
- [ ] 민감 정보 노출 없음

#### 확장성
- [ ] N+1 쿼리 없음
- [ ] 페이지네이션 적용됨
- [ ] 하드코딩 없음

#### 안정성
- [ ] 예외처리 있음
- [ ] 에러 메시지 사용자 친화적
- [ ] 롤백 가능한 DB 변경

#### 사용자 경험
- [ ] 로딩 상태 표시
- [ ] 에러 상태 표시
- [ ] 모바일 화면 확인

### 6. 푸시 전 최종 확인
위 체크리스트 모두 통과 후 git add + git commit + git push 자동 실행.
CHANGELOG.md 업데이트 후 아래 형식으로 보고:

```
✅ 배포 완료
- 테스트 통과: [통과한 테스트 목록]
- 보안 체크: 통과
- 확장성 체크: 통과
- 주의사항: [있으면 기재]
```

## 변경 이력 및 결정 기록
- 작업 완료 후 GitHub push 전에 항상 CHANGELOG.md에 오늘 날짜로 작업 내용을 기록할 것.
- 중요한 기술적 결정, 비즈니스 결정, DB 설계 변경이 생길 때마다 DECISIONS.md를 자동으로 업데이트할 것.
- 중요한 결정사항은 DECISIONS.md에도 기록할 것.
- 작업 완료 후 항상 CHANGELOG.md, DECISIONS.md, DB_SCHEMA.md, README.md 최신 상태 유지할 것.

## 유틸리티 함수 규칙 (중복 방지)
- 날짜/월 관련: 반드시 `frontend/src/utils/date.js` 에서 import. 로컬 선언 금지.
  - 월 배열: `import { ML, MONTHS_KO, MONTHS_EN, MONTHS_EN_FULL } from '../../utils/date'`
  - 오늘 날짜: `import { todayStr } from '../../utils/date'`
- 통화 포맷: 반드시 `frontend/src/utils/format.js` 에서 import. 로컬 선언 금지.
  - `import { fmtKRW, fmtUSD, formatAuto, fmtAmt } from '../../utils/format'`
  - 새 포맷 함수 필요시 이 파일에만 추가하고 import해서 사용.
- 새 유틸 함수 추가 시 반드시 utils/ 폴더에만 추가할 것.

## 공통 컴포넌트 규칙 (중복 방지)
- 기간 선택 UI: 반드시 `frontend/src/components/PeriodSelector.jsx` 사용.
  - `import PeriodSelector from '../../components/PeriodSelector'`
  - props: `value`, `onChange`, `customFrom`, `customTo`, `onCustomChange`
  - 1M/3M/6M/YTD/1Y/3Y/전체/직접 버튼 + custom 날짜 picker 내장
  - 인라인 버튼 배열로 직접 구현 금지.

## 파이썬 스크립트로 파일 수정 시 주의사항
- 스크립트 실행 전 반드시 현재 파일 구조를 grep으로 확인할 것.
- 파일이 이미 리팩토링되어 있으면 스크립트의 `old` 문자열이 다를 수 있음.
- 스크립트 실패(❌) 시 해당 부분을 grep으로 찾아 직접 Edit으로 수정할 것.
- 스크립트 성공(✅) 후에도 grep으로 실제 적용 여부 재확인할 것.

## StockStatsOverlay 구조 주의사항
- 파이차트는 두 개의 독립 데이터 경로를 사용함. 둘 다 동시에 수정해야 함:
  1. **캔버스 레이블** (`pieLabels`): useEffect 내 `vals` 배열에서 생성
  2. **좌측 범례** (`effectivePieItems`): 렌더 스코프에서 직접 `periodStockValues` 순회
- 기간 cutoff 계산: `calcCutoff(period, customFrom)` 함수 사용 (파일 상단 정의).
  - 1m/3m/6m/ytd/1y/3y/custom/all 모두 지원. 별도 구현 금지.
