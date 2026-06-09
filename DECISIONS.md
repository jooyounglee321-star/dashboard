# 프로젝트 결정 기록

---
## 2026-06-08 — 1번 수정: 프론트 hold_qty 계산을 오늘 날짜 기준으로 변경하여 백필과 일치
**결정:** StockCard.jsx `calcStock()` 및 IndexPage.jsx 스냅샷 저장 로직의 hold_qty 계산을 오늘 날짜(YYYY-MM-DD) 기준으로 필터링하도록 변경. `date <= today or no date` 조건으로 purchases/sells 모두 필터링.
**이유:** 프론트 실시간 화면과 백필 결산 로직이 동일한 날짜 기준을 사용해야 차트 히스토리와 현재 화면이 일치함. 미래 날짜로 입력된 거래도 오늘 이전 것만 반영하여 정확도 확보.
**대안:** 전체 합산 유지(기존) → 미래 거래가 현재 화면에 반영되는 오류 가능성.
**파일:** `frontend/src/pages/index/StockCard.jsx`, `frontend/src/pages/index/IndexPage.jsx`

---
## 2026-06-08 — 3번 수정: 백필 시 quantity>0 필터 제거, target_date 기준 포함 여부 결정
**결정:** `backfill_portfolio_snapshots()` 의 종목 소스를 `stocks(quantity>0)` 에서 `portfolio_groups.data` 전체로 전환. target_date 기준 hold_qty > 0인 경우만 해당 날짜 결산에 포함.
**이유:** 전량 매도된 종목(quantity=0)도 매도 이전 날짜의 과거 백필에서 정확히 반영되어야 함. `stocks.quantity>0` 필터는 현재 잔고 기준이므로 과거 결산이 왜곡됨.
**대안:** stocks 테이블에 is_active 플래그 추가 → schema 변경 필요; 기존 portfolio_groups JSON 활용이 추가 변경 없이 가장 실용적.
**파일:** `routers/portfolio.py`

---
## 2024 — portfolio_groups을 포트폴리오 스냅샷의 primary source로 전환

**결정:** `backfill_portfolio_snapshots()` 함수의 데이터 소스를 변경했다. 이전에는 `stocks` 테이블(quantity > 0)을 주요 소스로, `portfolio_groups`를 보조로 사용했다. 이제 `portfolio_groups.data`를 주요 소스로, `stocks` 테이블은 name/avg_price 보완용 보조 소스로 변경했다.

**이유:** 전량 매도된 종목도 포트폴리오 히스토리에 포함되어야 한다. `stocks` 테이블의 `quantity > 0` 필터는 현재 보유량 기준이므로, 과거에 매도된 종목들이 스냅샷에서 누락된다. 반면 `portfolio_groups.data`는 매수/매도 거래 이력(날짜 포함)을 JSON으로 저장하므로, 어느 시점의 포지션이든 정확히 재현할 수 있다.

**대안:** 
- `stocks` 테이블에 `is_active` 플래그나 매도 이력을 저장: schema 변경 필요, 기존 데이터 마이그레이션 필요
- 별도의 `transaction_history` 테이블: 더 정규화되지만 복잡도 증가
- 선택한 방식: 기존 `portfolio_groups.data` JSON 구조를 활용해 스냅샷 재현

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py
