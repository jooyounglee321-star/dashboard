# My Day Dashboard

개인용 올인원 대시보드 — 주식 포트폴리오 · 가계부 · 식단 · 메모 · 일정 · 뉴스를 한 화면에서 관리합니다.

> **배포:** Railway (백엔드 + 프론트엔드 통합 서빙)  
> **언어:** 한국어 / English 전환 지원

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 백엔드 | Python 3.11 · FastAPI · SQLAlchemy 2.x · APScheduler |
| 데이터베이스 | PostgreSQL (Railway) / SQLite (로컬 개발) |
| 프론트엔드 | React 18 · Vite 5 · React Router v6 |
| 차트 | Chart.js 4.x (raw, react-chartjs-2 미사용) |
| 인증 | JWT (python-jose) · bcrypt |
| 환율 데이터 | Yahoo Finance (yfinance) — 30분 자동 갱신 |
| 배포 | Railway (Python 앱으로 감지, dist/ 직접 서빙) |

---

## 전체 기능 목록

### 🔐 인증 · 회원
- 이메일/비밀번호 회원가입 · 로그인 (JWT 30일 유효)
- 소셜 로그인 UI (Google/Facebook, 기능 준비 중)
- 프로필 페이지 — 닉네임 변경 · 비밀번호 변경 · 언어 설정
- 회원 레벨: `admin` / `premium` / `free` / `guest`
- 슈퍼어드민 — 회원 목록 · 플랜/상태 변경 · 임시 비밀번호 발급 · 권한 매트릭스 관리

### 📊 주식 포트폴리오
- 그룹 기반 포트폴리오 관리 (최대 10그룹 × 10종목)
- 한국/미국 주식 실시간 시세 (Yahoo Finance, 60초 캐시)
- 매입/매도 내역 관리 · 가중평균 매수가 자동 계산
- 평가손익 · 실현손익 · 전일 대비 등락 표시
- 통계 오버레이 — 파이/라인/바 차트 (Chart.js)
- 일별 포트폴리오 스냅샷 (매일 23:59 KST 자동 저장)
- 한국 주식 자동완성 (코스피 300 + 코스닥 105)

### 💳 가계부 (BudgetPage — `/budget`)
- **일별 탭** — 날짜 선택, 지출 목록, 인라인 수정·삭제, CSV 내보내기
- **월별 탭** — 카테고리별 예산/실지출/잔여/% 테이블 + 파이·라인·바 차트
- **연도별 탭** — 전년 대비 YoY 바차트 + 월별 테이블(▲▼) + 카테고리 연간 집계
- **결산 탭** — TOP 5 카테고리 · 예산초과 목록 · 최근 12개월 이력
- **예산 설정 탭** — 예산 CRUD (카테고리별/전체) + 기본/커스텀 카테고리 관리
- 대분류/소분류 카테고리 계층 구조 (10대분류, 44소분류 기본 제공)
- 다중 통화 지원: USD · KRW · EUR · JPY · GBP · CNY · CAD · AUD · CHF · HKD
- 실시간 환율 변환 (Yahoo Finance, 30분 자동 갱신)
- CSV 내보내기 (UTF-8 BOM, Excel 한글 호환)

### 🍽️ 식단 기록
- 아침/점심/저녁/간식별 식단 내용 · 칼로리 기록
- 끼니별 표시 on/off 설정 (위젯 설정)

### 📝 메모
- 일일 메모 작성 · 수정 · 저장 시각 표시

### 📅 일정
- Google Calendar 연동 UI (플레이스홀더)

### 📺 유튜브
- 즐겨찾기 유튜브 채널 목록 관리 (최대 N개 설정)

### 🔖 북마크
- 단골 사이트 북마크 (파비콘 자동 표시)

### 📰 뉴스
- 한국/미국 뉴스 탭 (기본 탭 설정 가능)

### 🌏 시계 · 날씨 (HeroSection)
- 최대 3개 시간대 아날로그 + 디지털 시계
- 현재 위치 날씨 (Open-Meteo API, geolocation)
- 온도 단위 °C / °F 선택

### ⚙️ 대시보드 설정
- 위젯별 표시/숨김 on/off
- 언어 설정 (한국어/English) — 전체 UI 즉시 전환
- 온도 단위, 통화 표시, 유튜브 최대 개수, 뉴스 기본 탭 설정

---

## 로컬 실행

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 DATABASE_URL, SECRET_KEY 등 설정

# 3. 백엔드 실행
uvicorn main:app --reload --port 8000

# 4. 프론트엔드 빌드 (또는 개발 서버)
cd frontend
npm install
npm run build        # 또는 npm run dev (개발용)
```

서버 시작 시 DB 테이블 자동 생성 + 마이그레이션 + 시드 데이터 삽입이 자동으로 실행됩니다.

---

## Railway 배포

1. Railway에 PostgreSQL 플러그인 추가
2. `DATABASE_URL` 환경변수 자동 주입 확인
3. `SECRET_KEY` 환경변수 설정
4. **중요:** Railway는 Python 앱으로 감지하여 `npm run build`를 자동 실행하지 않습니다.  
   → `frontend/dist/` 폴더를 **반드시 git 커밋에 포함**해야 배포에 반영됩니다.

---

## 환경변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 연결 URL | SQLite 폴백 |
| `SECRET_KEY` | JWT 서명 키 | (필수) |
| `ALGORITHM` | JWT 알고리즘 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_DAYS` | JWT 유효 기간 (일) | `30` |

---

## 프로젝트 구조

```
dashboard/
├── main.py                  # FastAPI 앱 진입점, APScheduler, 마이그레이션
├── models.py                # SQLAlchemy ORM 모델 (15개 테이블)
├── database.py              # DB 연결 (PostgreSQL/SQLite 자동 전환)
├── schemas.py               # Pydantic 스키마 (공통)
├── routers/
│   ├── auth.py              # 인증 (login, register, me, widget-config)
│   ├── admin.py             # 슈퍼어드민 API
│   ├── expense.py           # 가계부 + 환율 API (19개 엔드포인트)
│   ├── portfolio.py         # 포트폴리오 그룹 + 스냅샷
│   ├── stocks.py            # 주식 시세 · 검색 · 히스토리
│   ├── diets.py             # 식단 CRUD
│   ├── memos.py             # 메모 CRUD
│   ├── bookmarks.py         # 북마크 CRUD
│   ├── youtube.py           # 유튜브 채널 CRUD
│   └── timezone.py          # 시간대 설정
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # 라우터 (7개 페이지)
│   │   ├── i18n.js          # 중앙 i18n 모듈 (점표기 중첩 키 지원)
│   │   ├── locales/
│   │   │   ├── ko.json      # 한국어 번역
│   │   │   └── en.json      # 영어 번역
│   │   └── pages/
│   │       ├── index/       # 메인 대시보드 (위젯 9개)
│   │       ├── BudgetPage.jsx   # 가계부 전용 페이지 (5탭)
│   │       ├── LoginPage.jsx
│   │       ├── RegisterPage.jsx
│   │       ├── ProfilePage.jsx
│   │       ├── AdminPage.jsx
│   │       └── SuperadminPage.jsx
│   └── dist/                # 빌드 결과물 (git 포함 필수)
├── static/
│   └── login.html           # 폴백 HTML (삭제 금지)
├── CLAUDE.md                # 프로젝트 규칙
├── CHANGELOG.md             # 변경 이력
├── DECISIONS.md             # 기술 결정 기록
├── DB_SCHEMA.md             # DB 스키마 문서
└── README.md                # 이 파일
```

---

## API 엔드포인트 요약

| 그룹 | 주요 엔드포인트 |
|------|----------------|
| 인증 | `POST /api/auth/login` · `POST /api/auth/register` · `GET /api/auth/me` · `PUT /api/auth/me` · `GET/PUT /api/auth/widget-config` |
| 가계부 | `GET/POST/PUT/DELETE /api/expense` |
| 카테고리 | `GET/POST/PUT/DELETE /api/expense/categories` |
| 통계 | `GET /api/expense/summary/daily` · `/monthly` · `/yearly` · `/stats` |
| 예산 | `GET/POST/PUT/DELETE /api/expense/budget` |
| 환율 | `GET /api/exchange-rates` · `GET /api/exchange-rates/{currency}` · `POST /api/exchange-rates/refresh` |
| 포트폴리오 | `GET/POST /api/portfolio/groups` · `POST /api/portfolio/snapshot` · `GET /api/portfolio/history` |
| 주식 | `GET /api/stocks/price/{ticker}` · `GET /api/stocks/search` · `GET /api/stocks/history/{ticker}` |
| 식단 | `GET/POST/DELETE /api/diets` |
| 메모 | `GET/POST/PUT /api/memos` |
| 북마크 | `GET/POST/DELETE /api/bookmarks` |
| 유튜브 | `GET/POST/DELETE /api/youtube-channels` |
| 시간대 | `GET/PUT /api/timezone` |
| 어드민 | `GET /api/admin/users` · `GET /api/admin/stats` · `PUT /api/admin/users/{id}/plan` · `PUT /api/admin/users/{id}/role` |

전체 API 문서: 서버 실행 후 `http://localhost:8000/docs` (FastAPI Swagger UI)
