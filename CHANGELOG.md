# Changelog

모든 주요 변경사항을 날짜 기준 역순으로 기록합니다.

---

## [2026-05-19] — Railway DB 테이블 자동 생성 보장

### 수정
- **main.py** `models.py`의 모든 모델 클래스를 명시적으로 import
  - 기존: `from models import DailyPortfolioSnapshot` (단 1개)
  - 변경: User, Expense, Diet, Memo, Stock, StockPriceHistory, Bookmark, YoutubeChannel, TimezoneConfig, PortfolioGroups, DailyPortfolioSnapshot 전체 명시 import
  - `Base.metadata.create_all()`은 메모리에 올라온 모델만 처리하므로, 누락 시 해당 테이블이 DB에 생성되지 않음
- **main.py** `lifespan` 내 `create_all` 실행 로직 강화
  - 생성 전 예정 테이블 목록 로그 출력
  - `create_all` 실패 시 에러 로그 + 재크래시 (DB 없이 서버 구동 방지)
- **main.py** `/api/health` 응답에 테이블 비교 정보 추가
  - `tables_expected`: 코드(모델)에 정의된 테이블 목록
  - `tables_actual`: DB에 실제 존재하는 테이블 목록

---

## [2026-05-19] — Railway PostgreSQL DATABASE_URL 환경변수 연결 수정

### 수정
- **database.py** Railway 환경변수 탐색 로직 강화
  - 단일 `DATABASE_URL` 의존 → 5개 변수명 우선순위 순서 폴백 체인으로 변경
  - 탐색 순서: `DATABASE_URL` → `DATABASE_PRIVATE_URL` → `POSTGRES_URL` → `POSTGRESQL_URL` → `DATABASE_PUBLIC_URL` → SQLite 폴백
  - 서버 시작 시 어느 변수가 실제로 잡혔는지 로그 출력 (비밀번호 마스킹)
  - SQLite 폴백 시 경고 로그 출력
- **main.py** `/api/health` 응답에 디버깅 정보 추가
  - `db_var_used`: 실제로 사용된 환경변수명
  - `db_url_masked`: 마스킹된 연결 URL
  - `env_vars`: 5개 후보 변수의 설정 여부(set/not_set)
  - Railway 크래시 발생 시 헬스체크 URL로 즉시 원인 파악 가능

---

## [2026-05-19] — JWT 로그인 시스템 구현

### 추가
- **static/login.html** 신규 생성 — `/login` URL, 이메일·비밀번호 로그인 페이지
  - register.html과 동일한 디자인 언어 (Playfair + Noto Sans KR, 베이지 카드 레이아웃)
  - 구글/페이스북 소셜 로그인 버튼 UI (기능 준비 중 표시)
  - 비밀번호 눈 토글, 폼 검증, 성공 후 `/` 자동 리다이렉트
  - 페이지 로드 즉시 `sessionStorage.auth_pending = '1'` 설정 (Navigation Guard 우회)
- **routers/auth.py** `POST /api/auth/login` 엔드포인트 추가
  - bcrypt 비밀번호 검증 → JWT(30일 유효) 발급 → `AuthOut` 반환
  - 로그인 시 `last_login_at`, `login_count` 자동 업데이트
- **routers/auth.py** `POST /api/auth/register` 응답을 `UserOut` → `AuthOut`으로 변경
  - 가입 직후 토큰 자동 발급 → 별도 로그인 단계 없이 바로 대시보드 진입

### 변경
- **schemas.py** `UserLogin`(email+password), `AuthOut`(access_token+token_type+user) 스키마 추가
- **requirements.txt** `python-jose[cryptography]` 추가 (JWT 서명/검증)
- **main.py** `/login` 라우트 추가 → `static/login.html` 서빙
- **static/register.html** 로그인 링크 `/` → `/login` 변경, 토큰 저장 로직을 `AuthOut.access_token` 직접 사용으로 수정
- **static/index.html** Navigation Guard 미인증 리다이렉트 대상 `/register` → `/login` 변경
- **.gitignore** `dashboard_.txt` 추가 (토큰 유출 방지)

---

## [2026-05-19] — 슈퍼어드민 회원관리 페이지 구현

### 추가
- **static/superadmin.html** 신규 생성 — `/superadmin` URL, 관리자 전용 회원관리 페이지
  - 상단 요약 카드 5개 (전체 회원, 오늘 가입자, 유료 회원, 이번달 신규, 이번달 결제)
  - 회원 목록 테이블 (11개 컬럼: 번호·이름·이메일·가입일·플랜·플랜 만료일·상태·마지막 접속·로그인 횟수·누적 결제·기기)
  - 이름/이메일 검색(디바운스), 플랜/상태별 필터, 6가지 정렬 옵션
  - 회원 클릭 → 상세 모달: 플랜 변경, 계정 상태 변경(활성/비활성/정지), 임시 비밀번호 발급, 관리자 메모 저장
- **routers/admin.py** 신규 생성 — 어드민 전용 API 라우터
  - `GET  /api/admin/users`            — 검색·필터·정렬 파라미터 지원 회원 목록
  - `GET  /api/admin/stats`            — 요약 통계 (전체/오늘/프리미엄/이번달 신규·결제)
  - `GET  /api/admin/users/{id}`       — 회원 상세
  - `PUT  /api/admin/users/{id}/plan`  — 플랜 변경
  - `PUT  /api/admin/users/{id}/status`— 계정 상태 변경
  - `PUT  /api/admin/users/{id}/memo`  — 관리자 메모 저장
  - `POST /api/admin/users/{id}/reset-password` — 임시 비밀번호 발급
- **models.py** `User` 테이블에 9개 컬럼 추가: `name`, `plan`, `plan_expires_at`, `status`, `last_login_at`, `login_count`, `total_payment`, `primary_device`, `admin_memo`
- **schemas.py** `UserAdminOut`, `PlanUpdate`, `StatusUpdate`, `AdminMemoUpdate` 스키마 추가
- **main.py** `admin_router` 등록, `/superadmin` 라우트 추가, `_migrate_user_columns()` 마이그레이션 함수 추가 (기존 DB에 컬럼 안전 추가)

---

## [2026-05-15] — 회원가입 백엔드 API 및 프론트엔드 연동

### 추가
- **routers/auth.py** 신규 생성
  - `POST /api/auth/register` — 이메일·비밀번호 회원가입, bcrypt 해싱, 중복 이메일 409 처리
  - `GET  /api/auth/users`    — 관리자용 회원 목록 조회
- **schemas.py** `UserRegister`, `UserOut` Pydantic 스키마 추가
- **main.py** `auth_router` 등록 (`app.include_router`)
- **requirements.txt** `passlib[bcrypt]` 추가

---

## [2026-05-15] — 회원가입 UX 개선 (비밀번호 토글)

### 변경
- **static/register.html** 비밀번호·비밀번호 확인 입력창에 눈 아이콘 토글 버튼 추가
  - 외부 라이브러리 없이 이모지(👁️ / 🙈) + 순수 CSS/JS 로 구현
  - 클릭 시 `type="password"` ↔ `type="text"` 전환, aria-label 동기화

---

## [2026-05-15] — SaaS 회원가입 기초 구현 (2차)

### 변경
- **models.py** `User` 테이블에 `provider`(기본값 'local'), `provider_id` 컬럼 추가, `hashed_password` nullable 처리 (소셜 가입 대응)
- **static/register.html** '구글로 시작하기' / '페이스북으로 시작하기' 소셜 버튼 UI 추가 (디자인 전용, API 미연결)
- **static/admin_users.html** 회원 목록에 '가입경로(provider)' 컬럼·뱃지 추가, 가입경로 필터 추가

---

## [2026-05-15] — SaaS 회원가입 기초 구현

### 추가
- **models.py** — `User` 테이블 추가 (id, email, hashed_password, role 기본값 'Member', created_at)
- **static/register.html** — 이메일·비밀번호 회원가입 화면 (클라이언트 유효성 검사 포함)
- **static/admin_users.html** — 회원 목록 관리 화면 (이메일 검색, 역할 필터, 페이지네이션)
- **main.py** — `/register`, `/admin_users` 라우트 추가
- DB 시작 시 `Base.metadata.create_all` 로 User 테이블 자동 생성 확인 (기존 lifespan 활용)

---

## [2026-05-15]

### 추가 — 프로젝트 문서 전면 작성
- **README.md** 신규 작성 — 프로젝트 소개, 기술 스택, 로컬 실행 방법, Railway 배포 방법, 환경변수 목록
- **ERD.md** 신규 작성 — 전체 DB 테이블 구조, 컬럼 타입·설명, 테이블 관계
- **API.md** 신규 작성 — 전체 API 엔드포인트 목록, Method·URL·Input·Output·예시
- **ARCHITECTURE.md** 신규 작성 — 전체 시스템 구조도, 프론트/백/DB 관계, 핵심 설계 결정, 향후 기능 로드맵
- **DECISIONS.md** 전면 업데이트 — 프로젝트 시작(2026-05-09)부터 현재까지 모든 결정 사항 기록

### 수정 — `index.html` JS 문법 오류 + 파싱 안정화 (CSS 화면 출력 버그)
- **근본 원인 1**: `<style>` 블록 내 stray `</style>` 태그 → CSS 블록 조기 종료 → 이후 모든 CSS가 body 텍스트로 렌더링
- **근본 원인 2**: 주식 통계 바차트(`Chart.js`) 초기화 코드에서 `options:{}` 객체의 닫는 중괄호(`}`) 누락 → JS SyntaxError로 전체 스크립트 실행 불가
- **근본 원인 3**: `<script>` 블록 내 JS 템플릿 리터럴 안에 HTML 주석(`<!-- -->`) 포함 → 일부 브라우저 HTML 파서가 script data escaped 상태에서 오동작 가능
- **수정 1**: stray `</style>` 태그 제거 (CSS 블록 조기 종료 해결)
- **수정 2**: `_renderStatsContent()` 바차트 options 객체 `}` 추가 (JS 문법 오류 해결)
- **수정 3**: `<script>` 내 모든 HTML 주석(`<!-- -->`) 제거, 조건부 렌더링 → 삼항+문자열 연결로 대체
- **수정 4**: `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` 등 no-cache 메타 태그 3개 추가 (브라우저 캐시로 인한 구버전 서빙 방지)
- **수정 5**: `.claude/launch.json` runtimeExecutable 경로 수정 (`uvicorn` → 풀 Python 경로 + `-m uvicorn`)
- **검증**: Node.js `--check`로 JS 문법 오류 없음 확인, HTML 구조 및 script 블록 내 주석 없음 확인

---

## [2026-05-14] (2차)

### 수정 — 포트폴리오 데이터 DB 연동 (`admin.html` + `routers/portfolio.py` + `models.py`)
- **근본 원인 파악**: `admin.html`의 모든 주식 CRUD(addStock, delStock 등)가 `localStorage`만 사용하고 DB API(`/api/stocks`)를 전혀 호출하지 않았음
- **`PortfolioGroups` 테이블 신설** (`models.py`) — `stock_groups_v2` localStorage 전체 JSON을 단일 행(id=1)으로 DB에 저장
- **`GET /api/portfolio/groups`** 엔드포인트 추가 — DB에서 포트폴리오 그룹 전체 조회
- **`POST /api/portfolio/groups`** 엔드포인트 추가 — id=1 행 UPSERT (그룹 추가/수정/삭제 시 항상 전체 덮어쓰기)
- **`saveGroups()` 수정** (`admin.html`) — localStorage 저장 후 DB에도 비동기 POST (실패 시 localStorage 우선 유지)
- **`initGroupsFromDB()` 추가** (`admin.html`) — 페이지 로드 시 DB에서 그룹 데이터 우선 로드 후 localStorage 동기화; DB가 비어 있으면 localStorage 데이터를 DB에 push
- DB = source of truth: 재접속·다른 기기에서도 같은 데이터 유지

---

## [2026-05-14]

### 추가
- **DECISIONS.md 자동 기록 hook** — `.claude/settings.json`에 PostToolUse agent hook 설정. 파일 Write/Edit 시 claude-haiku-4-5가 중요 결정 여부를 판단하여 DECISIONS.md에 자동 추가
- **CLAUDE.md 규칙** — 변경 이력·결정 기록 자동화 규칙 추가

### 추가 — 삭제 UX 개선 (`admin.html`)
- 종목 [삭제] 버튼 클릭 시 브라우저 `confirm()` 대신 커스텀 경고 모달 표시
  - 메시지: "이 종목의 모든 거래내역이 삭제됩니다. 정말 삭제하시겠습니까?"
  - 확인 클릭 → `is_deleted: true` 로 숨김 처리 (데이터 보존, 화면에서만 제거)
  - 취소 클릭 → 아무것도 안 함
- `index.html` 렌더링 시 `is_deleted` 종목 자동 필터링

### 추가 — 데일리 포트폴리오 스냅샷
- **DB 테이블** `daily_portfolio_snapshot` 신규 생성 (`models.py`)
  - 컬럼: `snapshot_date` (UNIQUE), `usd_krw`, `total_usd`, `total_krw`, `total_krw_equiv`, `data` (JSON), `saved_by`
- **APScheduler** 백엔드 스케줄러 추가 (`main.py`)
  - 매일 23:59:00 KST 자동 실행
  - 당일 스냅샷 없으면 플레이스홀더 저장 (프런트 미수신 대비)
- **API 엔드포인트** (`routers/portfolio.py`) 신규
  - `POST /api/portfolio/snapshot` — 스냅샷 저장 (날짜별 UPSERT)
  - `GET /api/portfolio/history` — 전체 조회 (최신순)
  - `GET /api/portfolio/history/{date}` — 특정 날짜 조회
- **프런트엔드 스냅샷 트리거** (`index.html`)
  - `_startSnapshotTimer()` — 1분마다 체크, 23:59 감지 시 포트폴리오 데이터 자동 전송
  - `savePortfolioSnapshot()` — 그룹·종목·평가금액·손익·환율 포함 POST
- **apscheduler** 패키지 설치

---

## [2026-05-13]

### 추가 — 매입/매도 기능 (`admin.html`, `index.html`)
- 종목 행에 **[+ 매입] [- 매도] [삭제]** 버튼 추가
- **추가매입 팝업 모달**
  - 매입일 (달력, 선택), 수량 (필수), 매입가 (선택)
  - 날짜 O + 매입가 X → Yahoo Finance 해당일 종가 자동 조회
- **추가매도 팝업 모달**
  - 매도일 (달력, 선택), 수량 (필수, 보유수량 초과 불가), 매도가 (선택)
  - 보유수량 실시간 표시
- **종목 클릭 → 매입/매도 통합 내역 패널**
  - 날짜순 정렬, 매입(파란 뱃지) / 매도(빨간 뱃지) 구분
  - 행별 [삭제] 버튼
- **데이터 구조 확장** (`stock_groups_v2`)
  - `sells: [{id, date, qty, price}]` 배열 추가
  - 기존 데이터 자동 마이그레이션 (sells[] 초기화)
- **`index.html` 수치 계산 업데이트**
  - `holdQty = totalBuyQty - totalSellQty`
  - `avgBuyPrice` — 매입 내역 기준 가중평균
  - `evalPL` (평가손익) = `(현재가 - 평균매입가) × holdQty`
  - `realizedPL` (실현손익) — 매도 내역 있을 때만 표시
  - 평가금액도 `holdQty` 기준으로 계산

### 추가 — 백엔드 과거 시세 API
- `GET /api/stocks/history/{ticker}?date=YYYY-MM-DD&category=` 엔드포인트
  - 주말·공휴일이면 이후 첫 거래일 종가 반환
  - `.KS → .KQ` 코스닥 자동 재시도

---

## [2026-05-12]

### 추가 — 한국 주식 검색 자동완성
- `kr_stocks.json` 생성 (코스피 300 + 코스닥 105, 총 405 종목)
  - 삼성전자, SK하이닉스, LG에너지솔루션 등 주요 종목 포함
- 관리자 페이지 종목 추가 입력 자동완성
  - 한글 입력 → `kr_stocks.json` 로컬 검색
  - 영문/티커 입력 → Yahoo Finance API 검색
  - 숫자만 입력 (한국 종목 번호) → 한국 주식으로 처리

### 추가 — 티커 ↔ 종목명 연동
- 티커 입력 시 Yahoo Finance에서 회사명 자동 조회 → 종목명 필드 자동 입력
- 종목명 입력 시 검색 드롭다운 표시 → 선택 시 티커 자동 입력

---

## [2026-05-11]

### 추가 — 매입 내역 관리 (`admin.html`)
- 종목 클릭 → 매입 내역 확장 패널 표시
- 매입 내역 추가: 날짜(달력), 수량(필수), 매입가(선택)
- 매입 내역 수정/삭제
- 날짜 O + 매입가 X → Yahoo Finance 종가 자동 조회

### 변경 — 포트폴리오 데이터 구조
- 종목별 `purchases: [{id, date, qty, price}]` 배열 도입
- 기존 `quantity` / `avgPrice` 단일 필드 → `purchases[]` 자동 마이그레이션
- 가중평균 계산: `sum(price × qty) / sum(qty)`

---

## [2026-05-10]

### 추가 — 보유주식 섹션 전면 개편
- **admin.html**: 그룹 기반 포트폴리오 관리
  - 최대 10개 그룹, 그룹당 최대 10개 종목
  - 그룹별 통화 설정 (KRW / USD)
  - 그룹 색상 자동 지정 (10가지)
- **index.html**: 실시간 시세 대시보드
  - Yahoo Finance 실시간 시세 (60초 캐시)
  - USD/KRW 환율 자동 조회 (KRW=X)
  - LIVE / 평균가 뱃지 표시
  - 수익률, 전일 대비 등락 표시
  - 전체 합계 표시 방식 선택 (KRW / USD / 분리)
  - `AbortController` 7초 타임아웃으로 무한 스피너 방지
- **데이터 저장**: `localStorage` (`stock_groups_v2` 키)

---

## [2026-05-09]

### 초기 설정
- FastAPI + SQLAlchemy + Uvicorn 기반 대시보드 프로젝트 구성
- `.claude/launch.json` 개발 서버 설정 저장
- `~/.claude/settings.json` 전역 Bash 자동 허용 설정
- `CLAUDE.md` 프로젝트 지침 파일 생성
- **DB 테이블 초기 생성**
  - `expenses` — 지출 내역
  - `diets` — 식단 기록
  - `memos` — 메모
  - `stocks` — 보유 종목 (카테고리별, 최대 10개)
  - `stock_price_history` — 일별 시세 스냅샷
  - `bookmarks` — 북마크
  - `youtube_channels` — 유튜브 채널
  - `timezone_config` — 시간대 설정
- **API 라우터 초기 구성**
  - GET/POST/DELETE 기본 CRUD (expenses, diets, memos, bookmarks, youtube-channels)
  - GET/POST/PUT/DELETE stocks + 실시간 시세, 환율, 검색
  - GET/PUT timezone
- SQLite(로컬) ↔ PostgreSQL(Railway) 자동 전환 구현 (`database.py`)
- `.env.example` 환경변수 예시 파일 생성
