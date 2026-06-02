# 프로젝트 결정 기록

---
## 2026-05-27 — CHF 환율: 백엔드 시드 + Yahoo Finance 갱신 티커 추가
**결정:** CHF(스위스 프랑)를 `_DEFAULT_EXCHANGE_RATES`(기본값 0.89)와 `_RATE_TICKERS`("USDCHF=X")에 추가했습니다.
**이유:** BudgetPage 통화 선택 목록에 CHF가 포함되어 있었으나 백엔드 환율 시드와 Yahoo Finance 갱신 대상에서 누락되어, CHF 선택 시 변환율이 1.0(fallback)으로 적용되는 버그가 있었습니다. Phase 7 최종 점검에서 발견하여 수정.
**대안:** CHF를 BudgetPage 통화 목록에서 제거 → 기능 축소이므로 백엔드 추가 선택.
**파일:** `C:\Users\Jason\Desktop\dashboard\main.py`, `C:\Users\Jason\Desktop\dashboard\routers\expense.py`

---
## 2026-06-02 — BudgetPage: 5탭 단일 파일 + raw Chart.js 패턴
**결정:** BudgetPage.jsx를 단일 파일에 5개 탭 컴포넌트(DailyTab·MonthlyTab·YearlyTab·SummaryTab·SettingTab)로 구성하고, 차트는 react-chartjs-2 없이 Chart.js 4.x를 직접 사용하는 패턴을 채택했습니다.
**이유:** (1) 탭마다 별도 파일 분리보다 단일 파일이 상태 공유(currency, rateMap)와 유지보수에 유리, (2) react-chartjs-2는 이미 설치된 StockStatsOverlay.jsx의 raw Chart.js 패턴과 일관성 유지 및 추가 의존성 배제, (3) chartsRef.current 배열로 차트 인스턴스 추적 → useEffect cleanup에서 일괄 destroy 처리.
**대안:** (1) 탭별 파일 분리 → import 복잡도 증가, (2) react-chartjs-2 사용 → 패키지 추가 필요, (3) 별도 BudgetPage 폴더 구조 → 오버엔지니어링
**파일:** `frontend/src/pages/BudgetPage.jsx`

---
## 2026-06-02 — Phase 3 가계부 API 아키텍처: 인메모리 캐시 + 라우터 분리 + 인라인 스키마
**결정:** 환율 데이터를 30분 TTL의 인메모리 캐시로 관리하고, `expense_router`와 `exchange_router`를 분리하며, Pydantic 스키마를 `routers/expense.py` 내 인라인으로 정의하는 구조를 채택했습니다.
**이유:** (1) 인메모리 캐시는 Redis 없이도 빠른 환율 조회를 제공하면서 30분 간격으로 정확한 갱신 주기 보장, (2) 라우터 분리로 관심사 분리 및 향후 비지출 환율 사용처 확장 용이, (3) 인라인 스키마는 FastAPI 엔드포인트와 스키마의 강한 결합을 유지하며 모놀리식 스키마 파일 회피.
**대안:** (1) Redis 기반 캐시 → 배포 의존성 증가, (2) 단일 라우터 통합 → 코드 응집도 증가, (3) 중앙 `schemas.py` → 기존 14개 엔드포인트와 혼재로 파일 비대화
**파일:** `routers/expense.py`, `main.py`

---
## 2026-06-02 — APScheduler에 30분 환율 갱신 작업 추가
**결정:** APScheduler를 사용하여 매 30분마다 Yahoo Finance에서 환율 데이터를 자동 갱신하는 정기 작업을 추가했습니다.
**이유:** 사용자가 입력하는 다국 통화 거래에서 항상 최신 환율을 제공하기 위해, `_refresh_rates_job()` 함수를 30분 주기로 자동 실행하도록 스케줄링했습니다. 일 1회 포트폴리오 스냅샷과 함께 단일 APScheduler 인스턴스로 통합 관리하는 구조입니다.
**대안:** (1) Celery + Redis를 별도 프로세스로 운영 → 배포 복잡성 증가, (2) 클라이언트 측 on-demand 갱신 → 환율 노후화 위험, (3) 캐시 TTL 방식만 사용 → 정확한 시간 제어 불가
**파일:** `main.py`

---
## 2026-06-02 — ExpenseCard 컴포넌트: 카테고리 계층 구조 + 예산 추적 + 다중 통화 포맷팅
**결정:** ExpenseCard를 전면 재설계하여 (1) API 스키마를 단일 flat 모델에서 카테고리-서브카테고리 계층 구조로 변경, (2) 월별 예산 추적 및 진행률 표시 추가, (3) 클라이언트 측 다중 통화 기호 포맷팅 구현, (4) 아이템 수정 기능 추가, (5) 상태 관리를 form/editForm 분리 구조로 개편했습니다.
**이유:** (1) 사용자가 지출을 더 세밀하게 분류할 수 있도록 계층 구조 도입 (예: 식비→카페 vs 식당), (2) 예산 기능으로 월간 지출 모니터링 가능, (3) 클라이언트 기호 포맷팅으로 다국가 통화 표시 자동화 및 서버 부담 감소, (4) 기존 read-only 리스트에서 CRUD 완전 구현으로 기능성 확대.
**대안:** (1) 카테고리 단일 flat 모델 유지 → 사용자 분류 정확도 저하, (2) 서버 측 통화 포맷팅 → API 응답 부피 증가 및 i18n 복잡도, (3) 예산 추적 없음 → 월간 지출 제어 기능 부재
**파일:** `frontend/src/pages/index/ExpenseCard.jsx`

---
## 2026-06-02 — BudgetPage 분석 탭: 클라이언트 측 통화 변환 + CSV BOM + Promise.all 병렬 조회
**결정:** BudgetPage에서 (1) 모든 금액 표시를 `toDisplay(usdAmt)` 콜백으로 USD→선택통화 실시간 변환, (2) CSV 내보내기에 UTF-8 BOM(`﻿`) 삽입, (3) MonthlyTab·SummaryTab에서 `Promise.all`로 복수 API 병렬 호출하는 방식을 채택했습니다.
**이유:** (1) 클라이언트 변환으로 렌더링 중 동적 환율 반영 가능 및 서버 계산 부담 회피, (2) BOM 삽입으로 Excel 한글 인코딩 호환성 보장, (3) Promise.all로 월별/연별 다중 데이터 조회 성능 개선.
**대안:** (1) 서버 측 통화 변환 → API 응답 지연 및 캐싱 복잡도, (2) BOM 없음 → Excel에서 한글 깨짐, (3) 순차 API 호출 → 탭 전환 시 응답 지연
**파일:** `frontend/src/pages/BudgetPage.jsx`

---
## 2026-06-02 — i18n 키 명명 규칙을 계층적 네임스페이스로 전환

**결정:** 번역 키를 평탄한 명명(`budgetTabDaily`, `budgetTitle`)에서 계층적 네임스페이스 구조(`budget.daily`, `budget.budget`, `chart.pieTitle`, `common.save`)로 변경.

**이유:** 계층적 네임스페이싱은 i18n 시스템의 확장성과 유지보수성을 크게 향상시킨다. 기능별(budget, chart, common)로 키를 그룹화하면 번역 파일 구조가 명확해지고, 새로운 기능 추가 시 명확한 네임스페이스 규칙을 따를 수 있으며, 중복을 줄일 수 있다(예: `save`, `cancel`, `add`는 `common.*`으로 통일).

**대안:** 기존 평탄한 명명 규칙 유지. 이는 초기에는 간단하지만 프로젝트 규모가 커질수록 키 이름의 충돌과 비일관성이 증가할 위험이 있다.

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx

---
## 2026-06-02 — users 테이블에 `widget_config` JSON 컬럼 추가
**결정:** 사용자별 위젯 설정(on/off, 언어, 온도단위, 표시개수 등)을 저장하기 위해 `users` 테이블에 `widget_config` TEXT 컬럼(NULLABLE)을 추가했습니다.
**이유:** (1) 위젯 설정은 사용자당 1행의 1:1 관계이므로 별도 테이블 생성보다 JSON 컬럼 추가가 효율적, (2) JSON 형식으로 저장하면 동적 설정 항목 확장 시 스키마 변경 불필요, (3) 기존 `timezone_config`, `portfolio_groups` 패턴(user_id당 1행 JSON 저장)과 일관성 유지.
**대안:** (1) 별도 `widget_preferences` 정규화 테이블 → 사용자당 1행만 조회되므로 join 비용이 이득보다 크고, (2) 설정 항목을 별도 컬럼들로 분산 → 위젯 기능 추가 시 마다 ALTER TABLE 필요
**파일:** C:\Users\Jason\Desktop\dashboard\DB_SCHEMA.md
