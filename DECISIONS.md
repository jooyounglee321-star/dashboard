# 프로젝트 결정 기록

---
## 2026-05-27 — BudgetPage: 5탭 단일 페이지 + raw Chart.js 패턴
**결정:** BudgetPage.jsx를 단일 파일에 5개 탭 컴포넌트(DailyTab·MonthlyTab·YearlyTab·SummaryTab·SettingTab)로 구성하고, 차트는 react-chartjs-2 없이 Chart.js 4.x를 직접 사용하는 패턴을 채택했습니다.
**이유:** (1) 탭마다 별도 파일 분리보다 단일 파일이 상태 공유(currency, rateMap)와 유지보수에 유리, (2) react-chartjs-2는 이미 설치된 StockStatsOverlay.jsx의 raw Chart.js 패턴과 일관성 유지 및 추가 의존성 배제, (3) chartsRef.current 배열로 차트 인스턴스 추적 → useEffect cleanup에서 일괄 destroy 처리.
**대안:** (1) 탭별 파일 분리 → import 복잡도 증가, (2) react-chartjs-2 사용 → 패키지 추가 필요, (3) 별도 BudgetPage 폴더 구조 → 오버엔지니어링
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx

---
## 2026-05-29 — Phase 3 가계부 API 아키텍처: 인메모리 캐시 + 라우터 분리 + 인라인 스키마
**결정:** 환율 데이터를 30분 TTL의 인메모리 캐시로 관리하고, `expense_router`와 `exchange_router`를 분리하며, Pydantic 스키마를 `routers/expense.py` 내 인라인으로 정의하는 구조를 채택했습니다.
**이유:** (1) 인메모리 캐시는 Redis 없이도 빠른 환율 조회를 제공하면서 30분 간격 서버 리소드로 정확한 갱신 주기 보장, (2) 라우터 분리로 관심사 분리 및 향후 비지출 환율 사용처 확장 용이, (3) 인라인 스키마는 FastAPI 엔드포인트와 스키마의 강한 결합을 유지하며 모놀리식 스키마 파일 회피.
**대안:** (1) Redis 기반 캐시 → 배포 의존성 증가, (2) 단일 라우터 통합 → 코드 응집도 증가, (3) 중앙 `schemas.py` → 기존 14개 엔드포인트와 혼재로 파일 비대화
**파일:** C:\Users\Jason\Desktop\dashboard\routers\expense.py, C:\Users\Jason\Desktop\dashboard\main.py, C:\Users\Jason\Desktop\dashboard\CHANGELOG.md

---
## 2026-05-29 14:30 — APScheduler에 30분 환율 갱신 작업 추가
**결정:** APScheduler를 사용하여 매 30분마다 환율 데이터를 Yahoo Finance에서 자동 갱신하는 정기 작업을 추가했습니다.
**이유:** 사용자가 입력하는 다국 통화 거래에서 항상 최신 환율을 제공하기 위해, 이미 존재하는 `_refresh_rates_job()` 함수를 30분 주기로 자동 실행하도록 스케줄링했습니다. 일 1회 포트폴리오 스냅샷과 함께 단일 APScheduler 인스턴스로 통합 관리하는 구조입니다.
**대안:** (1) Celery + Redis를 별도 프로세스로 운영 → 배포 복잡성 증가, (2) 클라이언트 측 on-demand 갱신 → 환율 노후화 위험, (3) 캐시 TTL 방식 → 정확한 시간 제어 불가
**파일:** C:\Users\Jason\Desktop\dashboard\main.py

---
## 2026-05-29 — ExpenseCard 컴포넌트: 카테고리 계층 구조 + 예산 추적 + 다중 통화 포맷팅
**결정:** ExpenseCard를 142줄에서 446줄로 전면 재설계하여, (1) API 스키마를 단일 flat 모델에서 카테고리-서브카테고리 계층 구조로 변경, (2) 월별 예산 추적 및 진행률 표시 추가, (3) 클라이언트 측 다중 통화 기호 포맷팅 구현, (4) 아이템 수정 기능 추가, (5) 상태 관리를 form/editForm 분리 구조로 개편했습니다.
**이유:** (1) 사용자가 지출을 더 세밀하게 분류할 수 있도록 계층 구조 도입 (예: 식비→카페 vs 식당), (2) 예산 기능으로 월간 지출 모니터링 가능, (3) 클라이언트 기호 포맷팅으로 다국가 통화 표시 자동화 및 서버 부담 감소, (4) 기존 read-only 리스트에서 CRUD 완전 구현으로 기능성 확대, (5) 컴포넌트 내 sub-component 분리(ExpForm, ExpItem, TodayHeader)로 재사용성 및 가독성 개선.
**대안:** (1) 카테고리 단일 flat 모델 유지 → 사용자 분류 정확도 저하, (2) 서버 측 통화 포맷팅 → API 응답 부피 증가 및 i18n 복잡도, (3) 예산 추적 없음 → 월간 지출 제어 기능 부재, (4) 수정 기능 미제공 → 지출 오류 수정 불가
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2026-05-29 — BudgetPage 컴포넌트: 5탭 가계부 분석 + Chart.js 기반 시각화 + 클라이언트 측 통화 변환
**결정:** BudgetPage를 5개 탭 구조로 구현: (1) 일별 탭 - 일일 지출 입출관리, (2) 월별 탭 - 도넛/라인/바 차트 기반 월간 분석, (3) 연별 탭 - 전년도 비교 차트 및 테이블, (4) 요약 탭 - TOP 5 카테고리 및 예산 초과 알림, (5) 설정 탭 - 예산 추가/편집 및 카테고리 관리. Chart.js를 클라이언트 측 렌더링 라이브러리로 채택, 환율 기반 실시간 통화 변환을 `toDisplay()` 콜백으로 구현, localStorage 기반 언어 감지 및 csv 내보내기 기능 포함했습니다.
**이유:** (1) Chart.js는 경량의 번들 크기와 React 통합의 용이성 제공 (Three.js/D3 대비 간결), (2) 클라이언트 측 통화 변환으로 렌더링 중 동적 환율 반영 가능 및 서버 계산 부담 회피, (3) 5탭 구조로 일일/월간/연간/요약/설정 기능을 명확히 분리하여 사용자 UX 최적화, (4) Promise.all 병렬 API 호출로 월별/연별 다중 데이터 조회 성능 개선, (5) CSV BOM 마크 삽입으로 Excel 한글 인코딩 호환성 보장, (6) 언어별 월명 상수(ML) 및 통화 기호 맵(SYM) 분리로 i18n 유지보수성 향상.
**대안:** (1) D3.js → 번들 크기 증가(~180KB) 및 학습곡선 가파름, (2) Recharts → React 래퍼 추가 의존성 증가, (3) 서버 측 차트 이미지 생성 → API 응답 지연 및 캐싱 복잡도, (4) 단일 탭 구조 → 기능 과부하로 페이지 로딩 시간 증가, (5) Redux 기반 상태 관리 → 소규모 컴포넌트에 대한 over-engineering.
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx

