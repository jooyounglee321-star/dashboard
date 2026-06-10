# 프로젝트 결정 기록

---
## 2026-06-09 — 차트/백필 시작일 정책 통일: MAX(최초 purchase.date, users.created_at)
**결정:** 누적 투자금액 추이 차트의 x축 시작일을 `MAX(최초 purchase.date, users.created_at)`로 계산. 가입일 이전 매수 이력은 차트에서 완전 제외.
**이유:** 가입 전 이력을 포함하면 차트가 의미 없는 과거 날짜부터 시작되어 현재 포트폴리오 관리 맥락과 무관한 데이터가 표시됨. 백필 로직(`routers/portfolio.py`)과 동일한 정책으로 일관성 확보.
**대안:** 최초 purchase.date만 사용 — 가입 전 이력이 있으면 차트가 불필요하게 과거로 확장됨.
**파일:** `frontend/src/pages/index/StockStatsOverlay.jsx`

---
## 2024-12-19 — 누적 투자액 차트에서 가입 전 매수 이력 제외

**결정:** 누적 투자액 차트의 시작일을 "MAX(최초 매수일, 가입일)"로 설정하여 가입 전 매수 이력을 차트에서 제외하기로 결정했습니다.

**이유:** 사용자가 플랫폼에 가입하기 전의 투자 이력은 현재 포트폴리오 관리 맥락과 무관하므로, 가입 후의 투자 이력만 시각화하는 것이 더 명확한 포트폴리오 성과 추이를 보여줍니다.

**대안:** 
- 모든 매수 이력을 표시 (현재는 이 방식이 아님)
- 사용자가 차트 범위를 수동으로 선택할 수 있도록 허용
- 가입 전 이력도 표시하되 시각적으로 구분

**파일:** `C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx`

---
## 2024-12-19 — 회원가입일 조회: localStorage 우선 → API 폴백 전략

**결정:** StockStatsOverlay 컴포넌트에서 사용자의 가입일을 localStorage에서 먼저 조회하고, 실패 시 `/api/auth/me` 엔드포인트로 폴백하는 방식을 선택했습니다.

**이유:** 가입일은 세션마다 자주 필요하지만 변경되지 않는 정적 데이터이므로, localStorage에 캐시하면 API 호출을 줄일 수 있습니다. 동시에 로컬 스토리지가 없거나 손상된 경우 API로 폴백하여 신뢰성을 보장합니다.

**대안:**
- 순수 API 호출 (매번 네트워크 왕복 필요, 신뢰성 높음)
- 순수 localStorage (로컬 데이터 손상 시 복구 불가)
- 서버 세션에 사용자 정보 포함 (서버 메모리 증가)

**파일:** `C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx`
