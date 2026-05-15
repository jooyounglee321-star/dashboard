# 프로젝트 결정 기록

중요한 기술적·비즈니스·설계 결정을 날짜 기준으로 기록합니다.

---

## 2026-05-14 — 포트폴리오 데이터 저장 전략: localStorage JSON을 DB에 통째 저장

**결정:** 기존 `stocks` 테이블(ticker/qty/avg_price 단순 구조) 대신, 새 `portfolio_groups` 테이블에 `stock_groups_v2` localStorage 전체 JSON을 단일 행으로 저장하는 방식 선택  
**이유:** localStorage의 그룹/구매내역 배열/매도내역/is_deleted 구조가 기존 stocks 테이블과 완전히 불일치. 정규화 DB 스키마로 재설계하면 admin.html 전체를 재작성해야 함. JSON blob 저장 방식은 기존 코드 최소 변경으로 DB 연동 달성 가능  
**대안:** stocks 테이블에 group_id/purchases_json/sells_json 컬럼 추가 (데이터 정합성은 높지만 마이그레이션 복잡), 전체 재설계 (공수 과다)  
**트레이드오프:** DB 쿼리로 개별 종목 검색 불가 (snapshot은 별도 테이블로 처리), JSON 충돌 시 last-write-wins  
**파일:** `models.py` (PortfolioGroups), `routers/portfolio.py` (GET/POST /api/portfolio/groups), `static/admin.html` (saveGroups, initGroupsFromDB)

---

## 2026-05-14 — DECISIONS.md 자동 기록 방식

**결정:** Claude Code PostToolUse agent hook으로 자동 감지 + CLAUDE.md 명시 규칙 이중 적용  
**이유:** hook만으로는 세션 시작 시 파일이 없으면 감시자가 작동 안 할 수 있음. CLAUDE.md 규칙으로 Claude가 직접 기록하는 방식을 병행하여 신뢰성 확보  
**대안:** Stop hook (agent 타입 미지원으로 제외), PreCompact hook (결정 시점과 불일치)  
**파일:** `.claude/settings.json`, `CLAUDE.md`

---

## 2026-05-14 — 종목 삭제: 하드 삭제 대신 소프트 삭제 (is_deleted)

**결정:** 삭제 시 localStorage에서 실제 제거하지 않고 `is_deleted: true` 플래그로 숨김 처리  
**이유:** 매입/매도 내역이 있는 종목을 실수로 삭제했을 때 복구 불가 문제 방지. 데이터 보존이 우선  
**대안:** 실제 삭제 후 휴지통 기능 (구현 복잡도 높음), 확인 후 즉시 삭제 (데이터 손실 위험)  
**파일:** `static/admin.html` (`delStock`, `_confirmDelStock`, `renderGroups`)

---

## 2026-05-14 — 데일리 스냅샷: 프런트엔드 트리거 + 백엔드 APScheduler 이중 구조

**결정:** 스냅샷 데이터는 프런트엔드(index.html)가 23:59에 POST로 전송, 백엔드 APScheduler는 프런트 미수신 시 플레이스홀더만 저장  
**이유:** 포트폴리오 데이터(보유수량, 매입/매도 내역)가 localStorage에 있어 서버가 직접 접근 불가. 실시간 가격 조회도 프런트가 이미 수행 중이므로 프런트 전송이 자연스러움  
**대안:** 전부 서버 측 처리 (localStorage 접근 불가로 제외), cron job (서버 외부 의존성 추가)  
**파일:** `main.py`, `routers/portfolio.py`, `static/index.html`

---

## 2026-05-14 — 스냅샷 상세 데이터: 정규화 테이블 대신 JSON 컬럼

**결정:** `daily_portfolio_snapshot.data` 컬럼에 그룹·종목 전체를 JSON 문자열로 저장  
**이유:** 스냅샷 시점의 구조가 향후 변경될 수 있으므로 스키마 유연성 확보. 조회 시 파싱만 하면 되고 JOIN 불필요  
**대안:** 종목별 정규화 테이블 (스키마 변경 시 마이그레이션 필요, 과거 기록과 불일치 위험)  
**파일:** `models.py` (`DailyPortfolioSnapshot`), `schemas.py`

---

## 2026-05-13 — 매입/매도 팝업: 인라인 폼 대신 모달 오버레이

**결정:** 종목 행 내 인라인 폼 대신 `#stock-modal` 전역 모달로 매입/매도 입력  
**이유:** 인라인 폼은 종목이 많을 때 레이아웃이 복잡해짐. 모달은 입력에 집중할 수 있고 보유수량 표시 등 추가 정보 제공 공간 확보  
**대안:** 인라인 폼 (이미 있던 방식, UX 복잡), 별도 페이지 이동 (SPA 구조와 불일치)  
**파일:** `static/admin.html` (`openBuyModal`, `openSellModal`, `#stock-modal`)

---

## 2026-05-13 — 평균매입가: 전체 매입 수량 기준 가중평균

**결정:** `avgBuyPrice = Σ(price × qty) / Σqty` — 가격 있는 매입 내역만 포함  
**이유:** 단순 평균이 아닌 수량 가중 평균으로 실제 투자 원가 정확히 반영. 가격 미입력 내역은 가중평균에서 제외하여 0원으로 왜곡 방지  
**대안:** 단순 평균 (수량 차이 무시), 최초 매입가 고정 (추가 매입 반영 안 됨)  
**파일:** `static/admin.html` (`stockSummary`), `static/index.html`

---

## 2026-05-13 — 실현손익 계산: `Σ(매도가 - 평균매입가) × 매도수량`

**결정:** 매도 시점의 평균매입가를 기준으로 실현손익 산출  
**이유:** FIFO/LIFO 방식은 복잡도 높음. 평균단가법이 개인 투자자에게 직관적이고 한국 세법 기준과도 부합  
**대안:** FIFO (먼저 산 것부터 팔기, 구현 복잡), LIFO (세금 최적화용, 국내 비표준)  
**파일:** `static/admin.html` (`stockSummary`), `static/index.html`

---

## 2026-05-13 — 과거 시세 조회: Yahoo Finance history API 활용

**결정:** `yf.Ticker(ticker).history(start=date, end=date+7days)` 로 특정일 종가 조회, 주말·공휴일이면 이후 첫 거래일 반환  
**이유:** 매입가 자동완성 시 해당일이 비거래일인 경우에도 가장 근접한 거래일 종가를 제공하여 UX 개선  
**대안:** 정확히 해당일만 조회 (비거래일 오류 발생), 사용자가 직접 입력 (자동화 없음)  
**파일:** `routers/stocks.py` (`get_stock_history`)

---

## 2026-05-12 — 한국 주식 검색: 로컬 JSON + Yahoo Finance API 혼합

**결정:** 한글 입력 → `kr_stocks.json` 로컬 검색, 영문/티커 입력 → Yahoo Finance `/v1/finance/search` API  
**이유:** 한글 키워드로 Yahoo Finance API 검색 시 결과가 부정확하거나 없음. 로컬 파일로 오프라인에서도 한국 주식 검색 가능  
**대안:** 전부 Yahoo Finance API (한글 검색 불안정), 전부 로컬 파일 (미국 주식 커버 불가)  
**파일:** `static/kr_stocks.json`, `static/admin.html` (`_loadKrStocks`, `_isKorean`, `_krSearch`)

---

## 2026-05-12 — 한국 주식 티커: `.KS` 우선, `.KQ` 자동 재시도

**결정:** 숫자만 입력된 티커(한국 종목 번호)에 `.KS` 접미사 먼저 적용, 시세 조회 실패 시 `.KQ` 자동 재시도  
**이유:** 한국 주식은 코스피(`.KS`)와 코스닥(`.KQ`) 두 시장이 있고, 종목 번호만으로는 구분 불가. 코스피 비율이 높아 `.KS` 우선 시도가 효율적  
**대안:** 사용자가 `.KS`/`.KQ` 직접 입력 (UX 불편), 별도 거래소 선택 UI (입력 단계 증가)  
**파일:** `routers/stocks.py` (`_resolve_yf_ticker`, `_fetch_price`), `static/kr_stocks.json`

---

## 2026-05-14 (2차) — 포트폴리오 데이터 DB 연동: localStorage → DB 동기화 전환

**결정:** localStorage만 사용하던 포트폴리오 데이터를 DB(`PortfolioGroups` 테이블)로 마이그레이션. DB를 source of truth로 설정, localStorage는 캐시·폴백용  
**이유:** 다중 기기 접속 시 데이터 불일치 문제 해결. 재접속하면 항상 최신 DB 데이터 우선 로드  
**대안:** 계속 localStorage만 사용 (다중 기기 동기화 불가), Redis/캐시 계층 (과度한 복잡도)  
**파일:** `models.py` (`PortfolioGroups`), `routers/portfolio.py` (GET/POST `/api/portfolio/groups`), `static/admin.html` (`saveGroups`, `initGroupsFromDB`)

---

## 2026-05-14 — 포트폴리오 그룹 저장 형식: 전체 JSON → DB 단일 행

**결정:** `PortfolioGroups` 테이블에 id=1 고정 행 1개만 유지, `stock_groups_v2` 전체 JSON을 단일 TEXT/JSON 컬럼에 저장  
**이유:** 그룹·종목 구조가 자주 변경될 수 있어 정규화보다 유연성 중시. UPSERT(전체 덮어쓰기)로 구현 단순화  
**대안:** 정규화 스키마 (Groups → Stocks 1:N, 스키마 변경 시 마이그레이션 필요), 다중 행 저장 (버전/타임스탬프 관리 복잡)  
**파일:** `models.py` (PortfolioGroups.data 컬럼), `routers/portfolio.py` (POST UPSERT 로직)

---

## 2026-05-14 — 포트폴리오 동기화 패턴: 프런트 localStorage + 백엔드 DB 이중 저장

**결정:** `saveGroups()` 실행 시 ① localStorage 즉시 저장 → ② 비동기 POST `/api/portfolio/groups` → DB도 저장. 실패하면 localStorage만 유지  
**이유:** 로컬 우선(Offline-first) 패턴으로 네트워크 오류 시에도 데이터 손실 방지. localStorage는 UX 응답성 확보  
**대안:** 동기 DB 저장만 사용 (네트워크 지연 시 UX 저하), 로컬만 저장 (다중 기기 미지원)  
**파일:** `static/admin.html` (`saveGroups` 함수의 Promise.then)

---

## 2026-05-14 — 포트폴리오 초기화 순서: DB → localStorage 동기화

**결정:** 페이지 로드 시 `initGroupsFromDB()` → ① DB에서 그룹 데이터 로드 → ② 없으면 localStorage에서 로드 후 DB에 push → ③ localStorage 최신화  
**이유:** DB를 source of truth로 우선하되, 마이그레이션 단계에서 로컬 데이터 손실 방지. 여러 기기에서 항상 최신 DB 데이터 시작  
**대안:** 항상 localStorage 우선 (다중 기기 비동기 문제), DB만 사용 (마이그레이션 중 데이터 손실 위험)  
**파일:** `static/admin.html` (`initGroupsFromDB` 함수)

---

## 2026-05-11 — 포트폴리오 저장소: DB 대신 localStorage

**결정:** 그룹·종목·매입/매도 내역 전체를 `localStorage` (`stock_groups_v2` 키)에 저장  
**이유:** 개인 사용 대시보드로 서버 불필요. 페이지 로드 즉시 사용 가능, 서버 부하 없음. 브라우저 종료 후에도 유지  
**대안:** 백엔드 DB 저장 (API 설계·인증 필요, 복잡도 증가), 세션 스토리지 (탭 닫으면 소멸)  
**파일:** `static/admin.html` (`STOCK_LS_KEY = 'stock_groups_v2'`), `static/index.html`

---

## 2026-05-11 — 매입 내역: 단일 필드 대신 배열 구조

**결정:** `quantity` / `avgPrice` 단일 필드 대신 `purchases: [{id, date, qty, price}]` 배열로 교체  
**이유:** 여러 차례 분할 매수 기록, 날짜별 매입가 관리, 가중평균 계산 등 복수 매입 시나리오 지원 필요  
**대안:** 단일 수량/평균가 필드 유지 (분할 매수 기록 불가), 별도 매입 테이블 (localStorage 구조와 불일치)  
**파일:** `static/admin.html` (`loadGroups`, `stockSummary`, `purchases[]`)

---

## 2026-05-10 — 실시간 시세: 60초 캐시 + 7초 타임아웃

**결정:** 서버 측 60초 TTL 캐시 (`_price_cache`) + 프런트엔드 AbortController 7초 타임아웃  
**이유:** Yahoo Finance API 과호출 방지 (캐시) + 느린 응답으로 인한 무한 스피너 방지 (타임아웃). 가격 조회 실패 시 평균매입가로 폴백  
**대안:** 캐시 없음 (API 과부하), 타임아웃 없음 (UX 불량)  
**파일:** `routers/stocks.py` (`_price_cache`, `_CACHE_TTL`), `static/index.html` (`AbortController`)

---

## 2026-05-10 — 환율: Yahoo Finance KRW=X 티커 활용

**결정:** USD/KRW 환율을 Yahoo Finance의 `KRW=X` 티커로 조회, 별도 환율 API 미사용  
**이유:** 이미 yfinance를 사용 중이므로 추가 의존성 없이 환율 조회 가능. 60초 캐시로 성능 최적화  
**대안:** 한국은행 API (인증 필요), 별도 환율 서비스 (추가 API 키 관리)  
**파일:** `routers/stocks.py` (`get_exchange_rate`)

---

## 2026-05-15 — 포트폴리오 그룹 DB 저장: localStorage 미러 테이블 추가

**결정:** admin.html의 전체 포트폴리오 그룹 데이터(`stock_groups_v2`)를 DB에 미러링할 `PortfolioGroups` 테이블 추가. 단일 행(id=1) UPSERT 패턴으로 JSON 배열 전체 저장  
**이유:** admin.html은 localStorage에만 데이터를 가지고 있어, 스냅샷 생성 시 그룹 정보가 필요하면 재구성 불가능. DB 미러로 admin.html과 서버 간 데이터 동기화 확보  
**대안:** admin.html 데이터를 API로 매번 조회 (localStorage 접근 불가로 불가능), 그룹 정보를 정규화 테이블로 설계 (admin.html이 DB 스키마에 의존하게 됨)  
**파일:** `models.py` (`PortfolioGroups`)

## 2026-05-15 — 포트폴리오 그룹 API 엔드포인트: GET/POST /groups 추가

**결정:** `/api/portfolio/groups` GET(조회) / POST(저장) 엔드포인트 추가. 단일 행 UPSERT로 전체 그룹 배열 관리  
**이유:** admin.html에서 포트폴리오 그룹을 저장/로드할 수 있는 API 필요. 단일 행 패턴(id=1)으로 구현하여 간단한 UPSERTv 로직과 데이터 일관성 보장  
**대안:** RESTful 다중 행 설계 (그룹별 개별 관리, 스키마 정규화 필요), 매번 전체 덮어쓰기 없이 부분 수정 API (delta sync 복잡도 증가)  
**파일:** `routers/portfolio.py` (`get_groups`, `save_groups`)

---

## 2026-05-15 — saveGroups() 함수: localStorage 우선 + DB 비동기 미러
**결정:** `saveGroups()` 함수에 `/api/portfolio/groups` POST 호출 추가. localStorage 저장 후 DB 동기화를 비동기로 수행하되, DB 실패 시 무시하고 localStorage 데이터 유지
**이유:** localStorage가 원본(source of truth)이고, DB는 스냅샷 재구성 시 필요한 참고 데이터. 사용자 입력 즉시성(localStorage)을 해치지 않으면서도 선택적 백업 기능 제공. 네트워크 지연이나 서버 오류가 사용자 경험에 영향 없음
**대안:** 동기 저장 (localStorage + DB 모두 성공 확인, 지연 발생), DB 없이 localStorage만 사용 (스냅샷 생성 시 그룹 정보 재구성 불가), DB만 사용 (localStorage 접근 불가, 오프라인 작동 불가)
**파일:** `static/admin.html` (`saveGroups`)

---

## 2026-05-15 — 포트폴리오 데이터 초기화: DB-우선 양방향 동기화
**결정:** `initGroupsFromDB()` 함수 추가. 페이지 로드 시 DB와 localStorage를 동기화하되: (1) DB에 데이터 있으면 DB 우선 사용, localStorage 덮어쓰기 (2) DB 비어있고 localStorage에만 데이터 있으면 localStorage → DB 푸시 (3) 둘 다 비어있으면 기존 동작 유지
**이유:** 프런트엔드 admin.html은 localStorage만 수정하므로, DB와의 상태 불일치 위험 존재. 페이지 로드 시 동기화하여 DB를 source of truth로 명확히 설정하면서도 오프라인 환경에서 localStorage 작동 보장. 마이그레이션된 데이터가 발생하면 DB에도 반영하여 일관성 확보
**대안:** 일방향 동기화 (DB → localStorage만, 초기 로드 시 데이터 손실 위험), 동기 확인 (API 응답 대기로 로드 지연), 수동 동기화 (사용자 실수로 중복 저장 가능)
**파일:** `static/admin.html` (`_migrateGroups` 추출, `loadGroups` 리팩토링, `initGroupsFromDB` 새 함수)
