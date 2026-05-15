# 프로젝트 결정 기록

중요한 기술적 결정, 비즈니스 결정, DB 설계 변경을 날짜 기준 역순으로 기록합니다.

---

## 2026-05-22 — 다중 인증 제공자 지원 (`User` 모델 확장)

**결정:** `User` 모델에 `provider`(인증 경로: 'local'|'google'|'facebook' 등)와 `provider_id`(외부 서비스 고유 ID) 컬럼 추가. `hashed_password`를 nullable로 변경하여 소셜 로그인 시 비밀번호 미사용.

**이유:** (1) 초기 이메일/비밀번호 방식에서 OAuth 기반 소셜 로그인으로 확장하기 위해 스키마 준비, (2) 단일 `User` 테이블에서 로컬/소셜 가입자 모두 관리 가능, (3) `provider` 필드의 기본값 "local"로 기존 사용자 호환성 유지.

**대안:** (1) OAuth 제공자별 별도 테이블(`GoogleUsers`, `FacebookUsers`) — 코드 중복, 조인 복잡도, (2) 별도 `UserProvider` 중간 테이블 — 정규화되나 join 쿼리 증가, (3) NoSQL 구조 — 현재 PostgreSQL/SQLite 스택과 불일치.

**파일:** `models.py` (`User` 클래스)

---

## 2026-05-21 — SaaS 사용자 인증 테이블 도입 (`User` 모델)

**결정:** `models.py`에 `User` ORM 모델 추가. 이메일(unique, indexed), 해시 비밀번호, 역할(기본값 "Member"), 생성일시 필드 포함.

**이유:** 개인 대시보드에서 SaaS 다중 사용자 지원 아키텍처로 전환하기 위함. 사용자 인증 및 권한 관리 기반 구축.

**대안:** (1) OAuth 외부 제공자(Google, GitHub) — 초기 구현 복잡도 증가, 외부 의존성, (2) 직접 비밀번호 저장(평문) — 보안 위험, (3) 토큰만 사용(비밀번호 없음) — 초기 가입/로그인 프로세스 미흡.

**파일:** `models.py` (User 클래스)

---

## 2026-05-15 — 브라우저 캐시 방지 전략

**결정:** `index.html` `<head>`에 `no-cache` 메타 태그 3개 추가.

**이유:** CSS가 화면에 노출되는 버그를 수정했음에도 브라우저가 구버전 파일을 캐시에서 서빙하는 문제 발생. `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0` 조합으로 브라우저 강제 새로고침 유도.

**대안:** (1) 파일 버전 쿼리스트링(`?v=20260515`) — 매번 수동 변경 번거로움, (2) 서버 측 Cache-Control 헤더 설정 — FastAPI StaticFiles에서 가능하나 코드 변경 범위가 넓음.

**파일:** `static/index.html` (head 섹션)

---

## 2026-05-15 — JS 템플릿 리터럴 내 HTML 주석 제거

**결정:** `<script>` 블록 안 JS 템플릿 리터럴에 포함된 `<!-- -->` HTML 주석을 전부 제거.

**이유:** 일부 브라우저 HTML 파서가 `<script>` 태그 내에서 `<!--`를 만나면 "script data escaped" 상태로 전환하여 `</style>`, `</script>` 등의 태그를 다르게 처리할 수 있음. 조건부 렌더링 문자열은 삼항 연산자 + 문자열 연결로 대체.

**파일:** `static/index.html` (`_renderStatsContent()` 함수)

---

## 2026-05-21 — 거래내역 인라인 수정 UI 패턴

**결정:** 주식 거래 내역(매입/매도) 수정 기능을 **인라인 편집 방식**으로 구현. 사용자가 거래 내역 행의 "수정" 버튼을 클릭하면 해당 행이 입력폼으로 변환되고, 저장/취소 버튼으로 확정하는 방식.

**이유:** (1) 거래 내역은 이미 주식 상세 패널(▼ 토글로 표시)에 목록 형태로 노출되어 있으므로, 인라인 편집이 추가 UI 레이어 없이 자연스러움, (2) 모달은 새로운 거래 추가(submitBuyModal, submitSellModal)에 이미 사용 중이므로 혼동 최소화, (3) 빠른 수정-확인 워크플로우 제공하여 UX 효율성 높음, (4) `_editingRecord` 상태 변수로 어느 행이 편집 중인지 추적하여 명확한 상태 관리.

**대안:** (1) 모달 다이얼로그 — 이미 "추가" 용도로 모달 사용 중, 수정에도 모달 사용 시 UI 일관성 저하 및 UX 장황함, (2) 더블클릭 인라인 편집 — 마우스 제스처에 의존하여 터치 기기 지원 어려움, 실수 발생 가능, (3) 슬라이드아웃 사이드 패널 — 화면 공간 낭비, 복잡한 레이아웃 충돌, (4) 별도 편집 페이지 — 네비게이션 복잡도, 페이지 이동 오버헤드.

**파일:** `static/admin.html` (functions: startEditRecord, cancelEditRecord, saveEditRecord, deleteRecord)

---

## 2026-05-21 — 주식 통계 화면 구현 (Chart.js 모달)

**결정:** 포트폴리오 통계 기능을 전체 화면 모달 오버레이로 구현하되, Chart.js 라이브러리로 3개의 차트(파이, 라인, 바)를 렌더링하고, 기존 `_lastStockData` 캐시를 활용하여 중복 API 호출 방지.

**이유:** (1) 사용자가 대시보드 카드에서 "↗ 통계" 버튼 클릭 시 전체 화면 분석 뷰 제공하여 UX 향상, (2) 같은 세션 내 여러 차트가 동일한 데이터 기반으로 일관성 있게 표시, (3) 차트 인스턴스를 관리하고 모달 종료 시 정리하여 메모리 누수 방지, (4) 기존 renderStock() 실행 후 _lastStockData 캐시가 있으면 재사용해 불필요한 API 재호출 제거.

**대안:** (1) 사이드바 패널 — 화면 공간 낭비, 차트 표현 제약, (2) 인라인 표시 — 대시보드 카드 내에서 차트 렌더링 → 성능 저하, 복잡한 layout 충돌, (3) 별도 페이지 (/stats) — 네비게이션 복잡도 증가, (4) WebSocket 실시간 업데이트 — 초기 구현으로는 과도하며 batch snapshot 전략과 맞지 않음.

**파일:** `static/index.html` (`_renderStatsContent()` 함수, Chart.js 파이·라인·바 차트)

---

## 2026-05-21 — 포트폴리오 데이터 세션 캐싱 전략

**결정:** `renderStock()` 함수가 실행된 후 portfolio 데이터(`activeGroups`, `priceMap`, `fxRate`)를 전역 변수 `_lastStockData`에 저장하여 통계 화면이 재사용하도록 구현.

**이유:** 사용자가 대시보드에서 통계 오버레이를 열 때 불필요한 API 재호출을 방지하고, 같은 데이터로 일관된 통계를 표시하기 위함. 페이지 로드 후 한 번의 API 조회로 충분하며, 사용자가 새로고침하기 전까지 같은 시세 데이터를 유지해야 함.

**대안:** (1) 매번 API 재호출 — 네트워크 낭비, (2) localStorage 사용 — 느리고 페이지 reload 후에도 유지되어 stale data 가능, (3) 통계 화면에서 독립적으로 데이터 fetch — 중복 API 호출, (4) IndexedDB — 필요 이상으로 복잡함.

**파일:** `static/index.html` (`_lastStockData` 전역 변수)

---

## 2026-05-14 — 종목 소프트 삭제 (`is_deleted` 플래그)

**결정:** 종목 삭제 시 DB에서 실제로 삭제하지 않고 JSON 내 `is_deleted: true` 플래그를 설정.

**이유:** 매입/매도 거래 내역이 종목에 연결되어 있으므로 완전 삭제 시 데이터 손실 발생. 실수 삭제 복구 가능성 유지. index.html 렌더링 시 `is_deleted` 종목 자동 필터링.

**파일:** `static/admin.html` (delStock 함수), `static/index.html` (renderStock 필터링)

---

## 2026-05-14 — APScheduler 데일리 스냅샷 보장

**결정:** 매일 23:59:00 KST에 APScheduler를 사용하여 당일 스냅샷이 없으면 빈 플레이스홀더를 자동 저장.

**이유:** 사용자가 23:59에 대시보드를 열어두지 않아 프론트엔드 스냅샷 전송을 못할 경우에도, 날짜별 스냅샷 연속성을 보장하기 위함. `saved_by` 컬럼으로 출처 구분.

**파일:** `main.py` (`_daily_snapshot_job`, APScheduler CronTrigger)

---

## 2026-05-14 — `PortfolioGroups` 단일 행 UPSERT 전략

**결정:** `portfolio_groups` 테이블에 id=1 단일 행만 유지하고, 그룹 변경 시 항상 전체 JSON을 덮어쓰는 UPSERT 방식 채택.

**이유:** 포트폴리오 구조가 복잡한 중첩 JSON(`groups > stocks > purchases/sells`)이라 관계형 정규화보다 JSON 전체 저장이 단순하고 유지보수가 쉬움. localStorage 미러링 개념과 일치하여 동기화 로직이 명확함.

**대안:** (1) 정규화 — stocks/purchases/sells 테이블 분리 → 조인 복잡도 증가, 프론트 데이터 구조와 불일치, (2) NoSQL(MongoDB) — 스택 변경 비용, (3) 날짜별 버전 저장 — 스토리지 낭비.

**파일:** `models.py` (`PortfolioGroups`), `routers/portfolio.py`

---

## 2026-05-13 — Yahoo Finance `.KS → .KQ` 코스닥 자동 재시도

**결정:** 한국 주식 조회 시 `.KS`(코스피)로 먼저 시도하고, 실패하면 `.KQ`(코스닥)로 자동 재시도.

**이유:** 동일한 종목 번호가 코스피에 없으면 코스닥에 존재할 수 있음. 사용자가 접미사를 직접 입력하지 않아도 되므로 UX 향상.

**파일:** `routers/stocks.py` (`_fetch_price`, `_fetch_hist`)

---

## 2026-05-13 — 매입/매도 내역을 `purchases[]` + `sells[]` 배열로 관리

**결정:** 종목 데이터 구조에 `sells: [{id, date, qty, price}]` 배열을 추가하고, 보유수량 = `sum(purchases.qty) - sum(sells.qty)`, 평가손익 = `(현재가 - 평균매입가) × 보유수량`으로 계산.

**이유:** 단순 `quantity` / `avgPrice` 단일 필드는 거래 내역 추적 불가. 배열 구조로 가중평균 자동 계산, 매도 내역 분리, 실현손익 계산 지원.

**파일:** `static/admin.html` (sells 배열), `static/index.html` (evalPL, realizedPL 계산)

---

## 2026-05-12 — 한국 주식 `kr_stocks.json` 정적 파일 자동완성

**결정:** 코스피 300 + 코스닥 105개 종목을 `static/kr_stocks.json`에 정적 파일로 저장하여 한글 검색 자동완성에 활용.

**이유:** Yahoo Finance API는 한글 검색을 지원하지 않음. 주요 한국 종목은 정적 파일로 관리하면 API 호출 없이 빠른 자동완성 가능.

**대안:** (1) 한국거래소 API — 인증 복잡, (2) 매번 Yahoo Finance 검색 — 한글 지원 없음, (3) DB 저장 — 업데이트 관리 복잡.

**파일:** `static/kr_stocks.json`

---

## 2026-05-11 — 매입 내역 `purchases[]` 배열 도입

**결정:** 종목별 단일 `quantity` / `avgPrice` 필드에서 `purchases: [{id, date, qty, price}]` 배열 구조로 전환. 기존 데이터 자동 마이그레이션 포함.

**이유:** 분할 매수 내역 관리, 날짜별 매입가 추적, 가중평균 자동 계산을 위해 배열 구조 필요.

**파일:** `static/admin.html`, `static/index.html`

---

## 2026-05-10 — 포트폴리오 저장소로 `localStorage` 채택 (초기)

**결정:** 포트폴리오 그룹 데이터를 localStorage (`stock_groups_v2` 키)에 저장. 그룹당 최대 10개 종목, 최대 10개 그룹 제한.

**이유:** 초기 빠른 구현. 서버 API 없이 클라이언트 단에서 즉시 데이터 관리 가능.

**한계:** 다른 기기에서 접속 시 데이터 없음 → 이후 DB 연동으로 해결 (2026-05-14).

**파일:** `static/admin.html`, `static/index.html`

---

## 2026-05-09 — SQLite(로컬) ↔ PostgreSQL(프로덕션) 이중 DB 전략

**결정:** `DATABASE_URL` 환경변수 미설정 시 SQLite로 폴백, 설정 시 PostgreSQL 사용. Railway의 `postgres://` URL을 `postgresql+psycopg2://`로 자동 변환.

**이유:** 로컬 개발 시 PostgreSQL 설치 없이 즉시 시작 가능. Railway 배포 시 환경변수만 바꾸면 동일 코드로 PostgreSQL 사용.

**파일:** `database.py`

---

## 2026-05-21 — 회원관리 화면의 클라이언트 사이드 필터링/페이지네이션

**결정:** admin_users.html에서 회원 목록 조회 시 `/api/auth/users`로 전체 사용자를 한 번에 로드한 후, 브라우저 JS에서 클라이언트 사이드 필터링(이메일 검색, 역할 필터)과 페이지네이션(20명/페이지)을 구현.

**이유:** (1) 초기 구현 단순성 — 서버 API에 필터/페이지네이션 로직 추가 불필요, (2) 동적 필터링 시 API 재호출 없이 즉각적 반응, (3) 작은 규모 사용자 데이터셋(수십~수백 명)에 적합.

**대안:** (1) 서버 사이드 페이지네이션 — API에 `?page=1&size=20` 파라미터 구현, 필터 쿼리 추가 필요하나 대규모 사용자 데이터에 적합, (2) 무한 스크롤 — 더 많은 UX 복잡도, (3) 가상 스크롤(virtualization) — 매우 큰 데이터셋용, 초기에는 과도함.

**한계:** 수천 명 이상 사용자 시 메모리 사용량 증가, 로딩 지연 가능 → 향후 서버 사이드 페이지네이션으로 마이그레이션 필요.

**파일:** `static/admin_users.html` (loadUsers, applyFilter, renderTable 함수)

---

## 2026-05-09 — FastAPI + SQLAlchemy + Uvicorn 스택 선택

**결정:** 백엔드를 Python FastAPI + SQLAlchemy 2.x (Mapped 스타일) + Uvicorn으로 구성.

**이유:** (1) FastAPI: 자동 Swagger UI, Pydantic 기반 유효성 검사, 비동기 지원, (2) SQLAlchemy 2.x: 타입 힌트 기반 ORM, 마이그레이션 없이 `create_all()` 개발 속도 우선, (3) Uvicorn: ASGI 서버, Railway 배포 간편.

**대안:** (1) Django — 과도한 설정, (2) Flask — 비동기 미지원, (3) Node.js Express — Python 생태계(yfinance) 활용 불가.
