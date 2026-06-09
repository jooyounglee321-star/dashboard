# 프로젝트 결정 기록

---
## 2026-06-09 — DB_SCHEMA.md: `daily_portfolio_snapshot` 테이블에 realized_pl 컬럼 및 backfill 저장 주체 추가
**결정:** `daily_portfolio_snapshot` 테이블 스키마에 (1) `realized_pl` 컬럼 추가 (FLOAT, NULLABLE): 해당 날짜까지 누적 실현 손익 합계, (2) `saved_by` 열거값 확장: `frontend` / `scheduler`에서 `frontend` / `backfill` / `scheduler`로 변경.
**이유:** 포트폴리오 성과 분석을 위해 평가손익(unrealized P&L)과 별도로 실현손익(realized P&L)을 추적해야 함. `backfill` 값 추가는 백필 프로세스(`backfill_portfolio_snapshots()`)가 과거 스냅샷을 재구성할 때 저장 주체를 명확히 하기 위함.
**대안:**
- realized_pl을 JSON `data` 필드에만 저장: 조회 시마다 파싱 필요, 쿼리 성능 저하
- 실시간 계산 API: 조회 시마다 매도 거래 데이터 집계 필요
- 선택한 방식: 스냅샷 저장 시점에 미리 계산하여 컬럼에 저장, 빠른 조회 및 차트 렌더링 지원
**파일:** C:\Users\Jason\Desktop\dashboard\DB_SCHEMA.md

---
## 2026-06-09 — 포트폴리오 스냅샷에 실현 손익(realized_pl) 추가 저장
**결정:** `backfill_portfolio_snapshots()` 함수에서 매일 스냅샷 저장 시 ticker별 실현 손익(`ticker_real_pl`)을 누적하여 `total_realized_pl`을 계산하고, 이를 `DailyPortfolioSnapshot.realized_pl` 필드에 저장하도록 변경.
**이유:** 포트폴리오 성과 평가를 위해서는 평가손익과 함께 실현손익도 필요. target_date 이전 완료된 매도에 대해 `(매도가 - 평균매수가) × 매도수량` 공식으로 계산하면, 전량 매도된 종목도 실현 손익이 정확히 반영됨.
**대안:**
- 실현 손익을 별도 집계 API로 처리: 조회 시마다 계산 필요, 성능 저하
- 프론트에서만 관리: 백필 데이터 일관성 문제
- 선택한 방식: 스냅샷 저장 시점에 계산하여 DB에 저장, 조회 성능 최적화
**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-08 — realized_pl 계산 시점: qty 체크 전에 수행하여 전량 매도 종목도 반영
**결정:** `backfill_portfolio_snapshots()`에서 `ticker_real_pl` 계산을 `if qty <= 0: continue` 이전으로 이동. 전량 매도 종목의 실현 손익이 `total_realized_pl`에 포함되도록 구조 변경.
**이유:** 전량 매도 종목은 보유량이 0이므로 그룹 목록에서 제외되지만, 해당 종목의 매도 수익은 스냅샷의 실현 손익 합계에 포함되어야 정확한 결산이 가능함. qty 체크 후 건너뛰면 누락 발생.
**대안:** 별도 루프로 realized_pl만 다시 계산 → 코드 중복; qty 체크 후 계산 유지 → 전량 매도 종목 누락(기존 문제).
**파일:** `routers/portfolio.py`

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
