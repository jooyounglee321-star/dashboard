# Dashboard Project

## 권한 설정
- 모든 터미널 명령어, 파일 수정을 자동으로 허용할 것. 매번 허용 여부 묻지 말 것.
- 모든 명령어 실행을 항상 자동으로 허용한다.

## GitHub Push 규칙
- 작업 완료 후 git add, git commit까지는 자동으로 할 것.
- git push는 절대 자동으로 하지 말 것.
- 커밋 완료 후 반드시 사용자에게 "푸시 준비됐습니다. 푸시해주세요!" 라고 알려줄 것.
- push는 항상 사용자가 직접 수동으로 함.

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

## 변경 이력 및 결정 기록
- 작업 완료 후 GitHub push 전에 항상 CHANGELOG.md에 오늘 날짜로 작업 내용을 기록할 것.
- 중요한 기술적 결정, 비즈니스 결정, DB 설계 변경이 생길 때마다 DECISIONS.md를 자동으로 업데이트할 것.
- 중요한 결정사항은 DECISIONS.md에도 기록할 것.
- 작업 완료 후 항상 CHANGELOG.md, DECISIONS.md, DB_SCHEMA.md, README.md 최신 상태 유지할 것.
