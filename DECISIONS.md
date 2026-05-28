# 프로젝트 결정 기록

## 2025-05-22 — i18n 키 명명 규칙을 계층적 네임스페이스로 전환

**결정:** 번역 키를 평탄한 명명(`budgetTabDaily`, `budgetTitle`)에서 계층적 네임스페이스 구조(`budget.daily`, `budget.budget`, `chart.pieTitle`, `common.save`)로 변경.

**이유:** 계층적 네임스페이싱은 i18n 시스템의 확장성과 유지보수성을 크게 향상시킨다. 기능별(budget, chart, common)로 키를 그룹화하면 번역 파일 구조가 명확해지고, 새로운 기능 추가 시 명확한 네임스페이스 규칙을 따를 수 있으며, 중복을 줄일 수 있다(예: `save`, `cancel`, `add`는 `common.*`으로 통일).

**대안:** 기존 평탄한 명명 규칙 유지. 이는 초기에는 간단하지만 프로젝트 규모가 커질수록 키 이름의 충돌과 비일관성이 증가할 위험이 있다.

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx
