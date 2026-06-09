# 프로젝트 결정 기록

---
## 2026-06-09 — 백필 호출을 App.jsx에서 IndexPage.jsx로 이동 (React 라이프사이클 버그 수정)
**결정:** 포트폴리오 백필(portfolio/snapshot) API 호출을 App 컴포넌트의 최상위 useEffect에서 IndexPage(홈 화면) 컴포넌트의 useEffect로 옮김. 이를 통해 새로운 로그인 직후에도 자동으로 백필이 실행되도록 수정.
**이유:** App.jsx의 `useEffect([], [])` 는 앱 최초 로드 시 1회만 실행되는데, 로그인 전에는 토큰이 없어 return 되고, 로그인 후 `navigate('/')` 는 App 컴포넌트를 재마운트하지 않음. 따라서 신규 로그인 시 백필이 실행되지 않는 버그 발생. IndexPage는 로그인 후 `/` 진입 시마다 마운트되므로 신규 로그인과 페이지 새로고침 모두 커버 가능.
**대안:**
- App.jsx 유지 + 상태 기반 트리거: 로그인 여부가 변경될 때마다 별도 상태 관리 필요, 복잡도 증가
- 로그인 페이지에서만 호출: 자동 로그인 시나리오를 놓침
- 컴포넌트 언마운트 시 백필 호출: 불안정한 타이밍, 네비게이션 중 실행 위험
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx, C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

---
## 2026-06-09 — 앱 초기화 시 포트폴리오 백필 자동 실행 (자동 로그인)
**결정:** App.jsx의 App 컴포넌트에서 useEffect hook을 이용해 컴포넌트 마운트 시(앱 로드 시) 1회 실행되는 자동 백필 로직 추가. localStorage에 유효한 토큰이 있으면 `/api/portfolio/backfill` 엔드포인트를 자동으로 호출하도록 구현.
**이유:** 사용자가 앱을 열 때 포트폴리오 데이터가 자동으로 최신 상태로 동기화되어야 함. 토큰 기반 자동 로그인과 함께 포트폴리오 스냅샷도 자동 업데이트하여 사용자 경험 개선.
**대안:**
- 수동 백필 버튼: 사용자가 명시적으로 트리거해야 함, UX 저하
- 서버 사이드 스케줄러만 사용: 실시간성 부족, 사용자가 앱을 열었을 때 즉시 최신 데이터 없음
- 지연 로딩(Lazy backfill): 특정 페이지 진입 시 트리거, 네비게이션 지연 발생
- 선택한 방식: 앱 마운트 시 자동 실행으로 즉시성과 자동화 모두 달성
**파일:** `frontend/src/App.jsx`

---
## 2026-06-09 — 백필 엣지케이스 수정: avg=0.0 falsy 평가 버그, 전량 매도 시 빈 스냅샷 저장 조건 변경
**결정:** (1) `if avg:` → `if avg is not None:` 변경하여 평균가가 정확히 0.0인 경우도 실현손익 계산에 포함. (2) `if not groups: continue` → `if not groups and total_realized_pl == 0.0: continue` 변경하여 보유 종목이 없어도 실현 손익이 있으면 빈 스냅샷(groups=[])을 저장.
**이유:** Python의 falsy 평가에서 `0.0`은 거짓으로 평가되므로 `if avg:` 조건은 avg=0.0일 때 실현손익 계산을 건너뜀. 명시적 `is not None` 체크로 zero 값도 정상 처리. 또한 전량 매도 완료 후 날짜들의 스냅샷 누락으로 차트에 시각적 공백이 발생하는 문제를 해결하기 위해 realized_pl 여부로 스냅샷 저장 여부를 판단.
**대안:**
- avg=0.0 처리 안 함: 특정 시나리오(0.0 평균가)에서 실현손익 오류 계속 발생
- 매도 이벤트 시에만 스냅샷 저장: 조회 시 특정 날짜 데이터 누락 가능성
- 선택한 방식: 명시적 None 체크와 realized_pl 기반 저장 조건으로 데이터 정확성과 연속성 보장
**파일:** `routers/portfolio.py`

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
## 2026-06-09 — 백필 신규 유저 시작일 계산: stocks 테이블 → portfolio_groups 기준으로 전환
**결정:** `backfill_portfolio_snapshots()` 함수의 `is_new_user` 블록에서 신규 유저 백필 시작일을 결정하는 데이터 소스를 변경: (1) 기존 방식(stocks.created_at 최솟값) 제거, (2) 대신 portfolio_groups.data JSON을 파싱하여 종목 1개 이상 여부 확인, (3) 시작일 = MIN(portfolio_groups.updated_at, users.created_at) 중 이른 날짜, 단 users.created_at을 하한선 유지, (4) stocks 테이블은 보조 확인용으로만 유지 (없어도 백필 진행).
**이유:** stocks 테이블이 비어있으면 백필이 즉시 종료되던 문제 해결. portfolio_groups는 사용자가 종목 정보를 입력하는 신뢰할 수 있는 소스이며, 포트폴리오 매입/매도 데이터가 저장되는 primary 데이터 구조. 이를 기준으로 변경하면 stocks 테이블 없어도 백필 진행 가능하며, 더 정확한 보유 종목 정보 파싱 가능.
**대안:**
- stocks 테이블 기준 유지: 데이터 미입력 시 백필 불가
- 두 소스 모두 필수: 더 엄격한 검증이지만 데이터 미입력 가능성 증가
- portfolio_groups만 사용하되 updated_at 무시: users.created_at 이전 과거 데이터 포함 위험
- 선택한 방식: portfolio_groups 기준 + users.created_at 하한선으로 정확성과 안정성 모두 확보
**파일:** `routers/portfolio.py`, `CHANGELOG.md`

---
## 2026-06-09 — 백필 호출 위치 최종: IndexPage.jsx useEffect로 확정
**결정:** 포트폴리오 백필 API 호출을 `IndexPage.jsx`의 `useEffect([], [])` 훅으로 이동. App.jsx 백필 코드는 완전 제거.
**이유:** App.jsx useEffect는 앱 최초 로드 시 1회만 실행. 로그인 전에 토큰이 없으면 바로 return하고, 로그인 후 navigate('/')는 App을 재마운트하지 않아 신규 로그인 시 백필이 실행되지 않는 버그 발생. IndexPage는 로그인 후 홈 진입 시마다 마운트되어 신규 로그인과 페이지 새로고침 모두 커버.
**대안:** App.jsx 유지 + LoginPage 동시 호출(중복 방지 플래그) → 복잡도 증가; IndexPage 단독이 가장 단순하고 정확.
**파일:** `frontend/src/pages/index/IndexPage.jsx`, `frontend/src/App.jsx`

---
## 2026-06-09 — 백필 신규 유저 시작일 기준: stocks 테이블 → portfolio_groups.data 기준으로 전환
**결정:** `backfill_portfolio_snapshots()` 신규 유저 판단 시 종목 존재 여부를 `stocks` 테이블 대신 `portfolio_groups.data` JSON 파싱으로 확인. 시작일을 `MIN(portfolio_groups.updated_at, users.created_at)` 중 이른 날짜로 계산하되 `users.created_at` 하한선 유지.
**이유:** `stocks` 테이블이 비어있어도 `portfolio_groups.data`에 종목이 있을 수 있음. 기존 로직은 `stocks.created_at` 기준이라 stocks 미등록 유저는 백필이 바로 종료됨.
**대안:** stocks 테이블에 데이터 동기화 강제 → 프론트 변경 필요; portfolio_groups 단독 사용이 추가 변경 없이 가장 실용적.
**파일:** `routers/portfolio.py`

---
## 2026-06-09 — 백필 호출 위치: LoginPage → App.jsx useEffect로 이동
**결정:** 포트폴리오 백필 API 호출을 `LoginPage.jsx` 로그인 성공 핸들러에서 `App.jsx`의 `useEffect([], [])` 훅으로 이동. 앱 시작 시 토큰이 있으면 1회 자동 실행.
**이유:** LoginPage에서만 호출하면 자동 로그인(토큰 유지) 상태로 앱을 재오픈할 때 백필이 실행되지 않음. App.jsx 최상위 훅으로 이동하면 로그인 방식과 무관하게 항상 백필이 보장됨.
**대안:** LoginPage 유지 + 각 페이지에서 추가 호출 → 중복 호출 위험; IndexPage에서 호출 → 다른 페이지로 직접 진입 시 누락.
**파일:** `frontend/src/App.jsx`, `frontend/src/pages/LoginPage.jsx`

---
## 2026-06-09 — 전량 매도 날짜의 빈 스냅샷 저장 조건: realized_pl > 0이면 저장
**결정:** `backfill_portfolio_snapshots()`에서 `if not groups: continue` 조건을 `if not groups and total_realized_pl == 0.0: continue`로 변경. 보유 종목이 없어도 realized_pl이 존재하면 groups=[]인 빈 스냅샷을 저장.
**이유:** 전량 매도 완료 후 날짜들이 스냅샷에 누락되면 차트에서 해당 기간이 공백으로 표시됨. realized_pl은 실제로 발생한 손익이므로 기록되어야 함.
**대안:** 스냅샷 저장을 건너뛰고 차트 레이어에서 보간(interpolation) — 프론트 로직 복잡도 증가; 선택한 방식이 단순하고 정확함.
**파일:** `routers/portfolio.py`

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
## 2026-06-09 — 백필 시 empty groups 스냅샷 저장 조건 변경: realized_pl 여부로 판단
**결정:** `backfill_portfolio_snapshots()` 함수의 스냅샷 스킵 조건을 `if not groups:` 에서 `if not groups and total_realized_pl == 0.0:` 로 변경. 보유 종목이 없어도 실현 손익이 있으면 스냅샷을 저장하도록 수정.
**이유:** 전량 매도 완료 이후 날짜들에서 스냅샷이 저장되지 않아 차트에 시각적 공백이 발생하는 버그 방지. 실현 손익이 있다는 것은 그 날짜까지 거래가 있었다는 의미이므로, 포트폴리오 시계열 데이터의 연속성 보장.
**대안:**
- 항상 스냅샷 저장 (매일): 불필요한 empty 스냅샷 증가, DB 용량 낭비
- 매도 이벤트 시에만 스냅샷 저장: 특정 날짜 조회 시 데이터 누락 가능성
- 선택한 방식: realized_pl 존재 여부를 기준으로 조건부 저장, 데이터 완결성과 효율성 병행
**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
---
## 2026-06-09 — 백필 호출 위치 이동: LoginPage → App.jsx 상단 (자동 로그인 지원)
**결정:** `POST /api/portfolio/backfill` 호출 로직을 LoginPage.jsx에서 App.jsx의 최상위 App 컴포넌트 내 useEffect([], [])로 이동. localStorage에 유효한 토큰이 있으면 앱 마운트 시 1회만 백필을 자동 실행하도록 변경. LoginPage.jsx의 기존 백필 호출 코드는 제거하여 중복 방지.
**이유:** LoginPage 경유 로그인 시에만 백필이 실행되었으므로, 앱을 열었을 때 토큰이 유지되어 자동 로그인이 진행되는 경우 백필이 미실행되는 버그 발생. App.jsx 최상위에서 1회 실행하면 로그인 방식(LoginPage 또는 토큰 자동 로그인) 무관하게 항상 백필 보장.
**대안:**
- 로그인 페이지에서만 호출 (기존): 자동 로그인 시 백필 누락
- 특정 페이지 진입 시 트리거: 네비게이션 지연 및 사용자 경험 저하
- 주기적 polling: 불필요한 API 호출 증가, 배터리 소모
- 선택한 방식: 앱 초기화 단계에서 1회 실행으로 모든 로그인 경로 커버, 자동화와 단순성 동시 달성
**파일:** `frontend/src/App.jsx`, `frontend/src/pages/LoginPage.jsx`

---
## 2026-06-09 — 신규 유저 백필 조건 변경: stocks 테이블 → portfolio_groups.data 기반 판단
**결정:** `backfill_portfolio_snapshots()`의 신규 유저(is_new_user=True) 백필 조건을 변경. (1) 백필 실행 여부를 `portfolio_groups.data`에 1개 이상의 종목 존재로 판단 (기존: stocks 테이블 조회). (2) 백필 시작일을 `MIN(portfolio_groups.updated_at, users.created_at)` 중 이른 날짜로 계산하되, `users.created_at`을 절대 하한선으로 유지 (기존: MAX(oldest_stock.created_at, users.created_at)). (3) stocks 테이블은 보조 확인용으로 변경 — portfolio_groups에 데이터 있으면 계속 진행.
**이유:** portfolio_groups.data는 프론트 localStorage에서 저장한 거래 이력 데이터로, 사용자가 실제로 입력한 포트폴리오를 반영함. stocks 테이블을 조회 조건으로 사용하면, stocks 데이터 동기화 지연 시 백필이 실행되지 않는 버그 가능성이 있음. portfolio_groups를 먼저 체크하고 stocks은 시작일 세부 조정용으로 활용하면 두 데이터 소스 간 불일치를 완화할 수 있음. 또한 users.created_at 하한선 유지로 회원가입 전 거래 기록은 차단.
**대안:**
- stocks 테이블 중심 유지: 프론트 입력과 DB 동기화 지연 시 백필 누락 가능성
- portfolio_groups만 사용, stocks 무시: 과거에 등록된 stocks 데이터(start_date 계산)를 놓칠 가능성
- 선택한 방식: portfolio_groups를 주요 판단 기준, stocks를 보조 source로 활용하여 두 데이터 소스 모두 반영
**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2024 — portfolio_groups을 포트폴리오 스냅샷의 primary source로 전환

**결정:** `backfill_portfolio_snapshots()` 함수의 데이터 소스를 변경했다. 이전에는 `stocks` 테이블(quantity > 0)을 주요 소스로, `portfolio_groups`를 보조로 사용했다. 이제 `portfolio_groups.data`를 주요 소스로, `stocks` 테이블은 name/avg_price 보완용 보조 소스로 변경했다.

**이유:** 전량 매도된 종목도 포트폴리오 히스토리에 포함되어야 한다. `stocks` 테이블의 `quantity > 0` 필터는 현재 보유량 기준이므로, 과거에 매도된 종목들이 스냅샷에서 누락된다. 반면 `portfolio_groups.data`는 매수/매도 거래 이력(날짜 포함)을 JSON으로 저장하므로, 어느 시점의 포지션이든 정확히 재현할 수 있다.

**대안:** 
- `stocks` 테이블에 `is_active` 플래그나 매도 이력을 저장: schema 변경 필요, 기존 데이터 마이그레이션 필요
- 별도의 `transaction_history` 테이블: 더 정규화되지만 복잡도 증가
- 선택한 방식: 기존 `portfolio_groups.data` JSON 구조를 활용해 스냅샷 재현

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-09 — 백필 호출 위치 재조정: IndexPage 추가 호출 (중복 호출 허용)
**결정:** 포트폴리오 백필 API 호출을 IndexPage.jsx 컴포넌트 마운트 시점에 추가로 실행하도록 구현. 기존 App.jsx의 백필은 유지하되, IndexPage에서도 `useEffect([], [])` 훅으로 1회 자동 실행하도록 함. 토큰 유효성 검증 후 `/api/portfolio/backfill` POST 요청.
**이유:** IndexPage는 모든 대시보드 데이터를 표시하는 메인 진입점이므로, 페이지 로드 시점에 포트폴리오 동기화가 최종 확인되어야 함. 로그인→IndexPage 경로뿐 아니라 북마크/직접 주소 입력으로 IndexPage에 진입하는 경우도 백필이 보장되어야 함. App.jsx 백필과 중복되더라도 엔드포인트가 idempotent하므로 무해.
**대안:**
- App.jsx만 유지 (기존): IndexPage 직접 진입 시 백필 누락 가능성 (예: 북마크, 이전 세션 복구)
- 라우터 레이어에서 가드 추가: 모든 라우트에 미들웨어 필요, 복잡도 증가
- localStorage 플래그로 중복 방지: 백필 상태 관리 필요, edge case 증가
- 선택한 방식: IndexPage 마운트 시 추가 호출로 단순성과 안정성 모두 확보, 중복 호출은 무시 처리
**파일:** `frontend/src/pages/index/IndexPage.jsx`
