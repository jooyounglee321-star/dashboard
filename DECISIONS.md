# 프로젝트 결정 기록

---
## 2026-05-27 — CHF 환율: 백엔드 시드 + Yahoo Finance 갱신 티커 추가
**결정:** CHF(스위스 프랑)를 `_DEFAULT_EXCHANGE_RATES`(기본값 0.89)와 `_RATE_TICKERS`("USDCHF=X")에 추가했습니다.
**이유:** BudgetPage 통화 선택 목록에 CHF가 포함되어 있었으나 백엔드 환율 시드와 Yahoo Finance 갱신 대상에서 누락되어, CHF 선택 시 변환율이 1.0(fallback)으로 적용되는 버그가 있었습니다. Phase 7 최종 점검에서 발견하여 수정.
**대안:** CHF를 BudgetPage 통화 목록에서 제거 → 기능 축소이므로 백엔드 추가 선택.
**파일:** `C:\Users\Jason\Desktop\dashboard\main.py`, `C:\Users\Jason\Desktop\dashboard\routers\expense.py`

## 2025-05-22 — i18n 키 명명 규칙을 계층적 네임스페이스로 전환

**결정:** 번역 키를 평탄한 명명(`budgetTabDaily`, `budgetTitle`)에서 계층적 네임스페이스 구조(`budget.daily`, `budget.budget`, `chart.pieTitle`, `common.save`)로 변경.

**이유:** 계층적 네임스페이싱은 i18n 시스템의 확장성과 유지보수성을 크게 향상시킨다. 기능별(budget, chart, common)로 키를 그룹화하면 번역 파일 구조가 명확해지고, 새로운 기능 추가 시 명확한 네임스페이스 규칙을 따를 수 있으며, 중복을 줄일 수 있다(예: `save`, `cancel`, `add`는 `common.*`으로 통일).

**대안:** 기존 평탄한 명명 규칙 유지. 이는 초기에는 간단하지만 프로젝트 규모가 커질수록 키 이름의 충돌과 비일관성이 증가할 위험이 있다.

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx
