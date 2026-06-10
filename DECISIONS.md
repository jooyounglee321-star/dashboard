# 프로젝트 결정 기록

---
## 2026-06-10 12:15 — 종목 뉴스 조회 백엔드: RSS 피드 파싱 + 메모리 캐시 (5분 TTL)
**결정:** `/api/stocks/news` 엔드포인트에서 Google/Naver RSS 피드를 feedparser로 파싱하고, 메모리 내 dict 캐시(`_news_cache`)에 5분 TTL로 저장. ThreadPoolExecutor를 통해 블로킹 RSS 작업을 비동기 실행.
**이유:** RSS는 뉴스 제공자의 표준 공개 인터페이스이므로 추가 인증 없이 접근 가능. 개별 종목의 최신 뉴스 1건만 조회하므로 DB 저장 불필요하고, 5분 캐시로 중복 요청 방지 가능. ThreadPoolExecutor는 기존 가격 조회(`_fetch_price`)와 동일한 패턴으로 일관성 유지.
**대안:** 전문 뉴스 API(NewsAPI 등) — API 구독 비용, 인증 복잡성. DB 저장 — 뉴스는 시간 민감 데이터로 장기 저장 가치 낮음. 웹 스크래핑 — 약관 위반 위험, 구조 변경에 취약. 동기 호출 — 뉴스 조회 지연으로 API 응답성 저하.
**파일:** `routers/stocks.py`

---
## 2026-06-10 — 종목별 뉴스 설정 저장: portfolio_groups.data의 news_config 필드 활용
**결정:** 종목별 뉴스 소스(Google/Naver), 검색어, 언어 설정을 `portfolio_groups.data` JSON의 각 종목 객체에 `news_config: { source, query, lang }` 필드로 저장. 별도 테이블 없이 기존 JSON 구조 활용.
**이유:** 뉴스 설정은 종목 데이터와 강하게 결합되어 있고, 이미 종목 데이터가 `portfolio_groups.data` JSON에 관리되므로 같은 구조에 추가하면 별도 DB 마이그레이션 없이 즉시 저장 가능. PUT API도 기존 것을 재사용하여 코드 변경 최소화.
**대안:** 별도 `stock_news_config` 테이블 — DB 마이그레이션 필요, 관계 조인 복잡도 증가. localStorage — 디바이스 간 동기화 불가.
**파일:** `frontend/src/pages/index/StockSettingsModal.jsx`

---
## 2026-06-10 — 보유주식 관리 UI 추출: 재사용 가능한 StockSettingsModal 컴포넌트 분리
**결정:** AdminPage의 인라인 주식 관리 UI(그룹/종목 CRUD, 삭제 모달)를 독립적인 `StockSettingsModal.jsx` 컴포넌트로 분리. `embedded` 모드로 AdminPage 내 렌더링, 기본 모드로 IndexPage에서 전체화면 모달로 표시.
**이유:** 보유주식 관리 기능이 다중 진입점(AdminPage 설정 탭, IndexPage 주식 카드의 "내 주식 설정" 버튼)에서 필요하므로, 컴포넌트로 분리하면 코드 중복 제거, AdminPage 복잡도 감소, UI 일관성 확보. 임베드 모드로 유연한 렌더링 지원.
**대안:** AdminPage에 인라인 유지 → 복제 코드 발생, 관리 부담 증대. 공유 Context 도입 → 상태 관리 복잡도 증가. 별도 페이지(`/stock-settings`) 생성 → IndexPage에서 페이지 네비게이션 필요로 사용자 경험 단절.
**파일:** `frontend/src/pages/index/StockSettingsModal.jsx`, `frontend/src/pages/AdminPage.jsx`, `frontend/src/pages/index/IndexPage.jsx`

---
## 2026-06-09 — 포트폴리오 백필 NULL snapshot_date 처리: 쿼리 필터링 + 마이그레이션 정리
**결정:** `backfill_portfolio_snapshots`에서 latest/existing 쿼리에 `.isnot(None)` 필터를 추가하여 NULL snapshot_date 행을 제외하고, 서버 시작 시 마이그레이션으로 기존 NULL 행을 자동 정리.
**이유:** PostgreSQL의 `ORDER BY snapshot_date DESC`는 NULL을 FIRST로 반환하므로, NULL이 조회되면 `latest.snapshot_date + timedelta(1)`에서 TypeError 발생. 쿼리 레벨에서 NULL을 필터링하면 이 문제를 근본적으로 해결하고, 마이그레이션으로 기존 데이터도 정리하여 DB 일관성 확보.
**대안:** 애플리케이션 로직에서 NULL 체크 → 쿼리 결과 후 처리가 복잡하고 모든 곳에서 일일이 확인 필요. DB 제약조건으로 NOT NULL 강제 → 기존 NULL 데이터 손실.
**파일:** `routers/portfolio.py`, `main.py`

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

---
## 2026-01-17 — 누적투자액 차트 X축: Category → Time 스케일 전환
**결정:** Chart.js 누적투자액 라인차트의 X축 스케일을 `type: 'category'`에서 `type: 'time'` (date-fns adapter 기반)으로 변경. Y축 포맷을 억/천만 한글 표기 추가 지원.
**이유:** 시계열 데이터는 시간 축으로 표현하는 것이 정확하며, 불규칙한 날짜 간격에서 자동 틱 정렬(`source: 'auto', maxTicksLimit: 10`)이 가독성을 높임. 한국 사용자 기준 대규모 금액 표현(억/천만)이 필요함.
**대안:** Category 스케일 유지 — 모든 매수일을 카테고리로 표시하되 균등하지 않은 간격과 자동 틱 최적화 불가.
**파일:** `frontend/src/pages/index/StockStatsOverlay.jsx`

---
## 2026-01-17 — 누적투자액 차트 시간축: 희소(Sparse) → 연속(Continuous) 날짜 생성
**결정:** 누적투자액 차트의 X축 날짜 배열을 "매수가 발생한 날짜만" 수집하는 방식에서 "startDate부터 오늘까지 모든 연속 날짜"를 생성하는 방식으로 변경.
**이유:** 연속 날짜 배열을 사용하면 누적합(carry-forward) 로직에서 매수가 없는 날도 이전값을 유지하여 차트에 시각화됨. 투자 금액의 시간 흐름을 더 정확하게 표현하며, 빈 날 기간에도 그래프가 연속적으로 표시되어 사용자 가독성 향상.
**대안:** 희소 날짜 유지 — 매수날만 표시하여 데이터 포인트 수 감소 및 "점프"하는 듯한 시각 효과 (불규칙한 시간 간격이 강조됨).
**파일:** `frontend/src/pages/index/StockStatsOverlay.jsx`

---
## 2025-01-17 — 포트폴리오 히스토리 차트: 계층적 필터 우선순위 (그룹 > 통화 > 전체)
**결정:** 히스토리 라인차트의 데이터 값을 동적으로 추출하는 `getValue()` 헬퍼 함수를 도입하여 세 가지 우선순위로 데이터를 선택: (1) 그룹 필터 선택 시 `r.data` JSON 파싱 후 해당 그룹의 총액, (2) 그룹 미선택 시 통화 필터에 따라 `total_usd` 또는 `total_krw`, (3) 기본값으로 `total_krw_equiv` 사용.
**이유:** 다중 필터 조건(그룹, 통화)에서 명확한 우선순위를 정하면 사용자 기대와 일치하는 동작을 보장함. 그룹 필터가 통화 필터를 오버라이드하는 것이 직관적이며(그룹은 이미 단일 통화이므로), Y축 레이블과 숫자 포맷도 자동 전환되어 일관성 있는 UX 제공.
**대안:** 독립적 필터(그룹과 통화를 동시 적용) — 상충하는 필터 조합 시 어느 것을 우선할지 모호해져 사용자 혼동 증가.
**파일:** `frontend/src/pages/index/StockStatsOverlay.jsx`

---
## 2026-06-09 — 현황 탭 필터 UI 통합: 분산된 탭 → 단일 필터바
**결정:** StockStatsOverlay 컴포넌트의 "현황(overview)" 탭에서 필터 인터페이스를 재설계. 기존 요약 섹션 내 탭 인터페이스(그룹/통화 선택)와 바차트 섹션의 분산된 필터를 제거하고, 차트 영역 최상단에 통합 필터바(`overviewGroup`, `overviewCurrency`, `overviewPeriod`)를 배치. 모든 차트(파이/라인/바)가 이 필터에 반응하도록 통일.
**이유:** 분산된 필터는 사용자가 여러 위치에서 제어해야 하므로 혼동을 유발함. 단일 필터바는 모든 차트에 일관되게 적용되어 예측 가능한 UX 제공. 파이차트에 그룹 드릴다운 기능을 추가하면 더 효율적인 데이터 탐색 가능. 상태 관리도 간결해져 버그 위험 감소.
**대안:** (1) 탭 유지 + 필터 중복 — 어느 필터를 사용할지 사용자 혼동. (2) 각 차트별 독립 필터 — 불일치하는 필터 상태 발생 위험.
**파일:** `frontend/src/pages/index/StockStatsOverlay.jsx`

---
## 2026-06-10 12:16 — 종목 뉴스 프론트엔드: sessionStorage 클라이언트 캐시 (5분 TTL) + 온디맨드 fetch
**결정:** StockCard.jsx에 `StockNewsRow` 컴포넌트 추가. newsConfig에서 query/source/lang 등을 받아 `/api/stocks/news` 엔드포인트로 fetch 후, `sessionStorage`에 5분 TTL로 캐싱. 상태(`idle`/`loading`/`ok`/`err`) 기반 조건부 렌더링으로 로딩, 에러, 뉴스 링크 표시.
**이유:** 클라이언트 sessionStorage는 프론트엔드에서 간단하게 구현 가능하고, 5분 TTL로 같은 검색어에 대한 중복 API 호출 방지. 세션 범위 캐시이므로 다른 사용자 간 격리 필요 없음. 온디맨드 fetch 방식으로 불필요한 초기 로딩 시간 회피.
**대안:** (1) 백엔드에서만 캐시 — 프론트엔드에서 매번 API 호출 필요. (2) localStorage 영구 캐시 — 뉴스는 시간 민감 데이터로 오래된 캐시 표시 위험. (3) 다중 요청 배칭(Promise.all) — 초기 로딩 지연 증가.
**파일:** `frontend/src/pages/index/StockCard.jsx`
