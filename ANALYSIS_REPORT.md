# Dashboard 프로젝트 전체 소스코드 분석 보고서

> 분석 일자: 2026-06-11
> 분석 범위: 백엔드(main.py, models.py, database.py, schemas.py, routers/ 전체) + 프론트(frontend/src/ 전체)
> **중요: 이 보고서는 분석 전용이며 코드 수정은 포함되지 않습니다.**

---

## 목차
1. [보안 이슈 (Critical/High/Medium/Low)](#보안-이슈)
2. [버그](#버그)
3. [성능](#성능)
4. [중복 코드](#중복-코드)
5. [전체 예상 수정 소요 시간](#전체-예상-수정-소요-시간)

---

## 보안 이슈

### Critical

#### SEC-01 | JWT 토큰 localStorage 저장 → XSS 노출
- **파일**: `frontend/src/utils/api.js` L1-3, `frontend/src/pages/LoginPage.jsx` L55
- **심각도**: Critical
- **설명**: JWT Access Token을 `localStorage`에 저장하고 있음. XSS 공격 시 공격자가 JS로 `localStorage.getItem('token')`을 실행하면 토큰 탈취 가능. 전 프론트엔드 17개 파일에서 localStorage로 토큰을 읽는 패턴이 68회 사용됨.
- **위치 요약**:
  - `frontend/src/utils/api.js` L1: `localStorage.getItem('token')`
  - `frontend/src/pages/LoginPage.jsx` L55: `localStorage.setItem('token', jwt)`
  - 외 16개 파일 전체 참조
- **권장 수정**: HttpOnly Cookie로 전환 (쿠키는 JS에서 접근 불가)
- **예상 수정 시간**: 약 3시간

---

#### SEC-02 | 하드코딩된 JWT Secret Key (기본값 평문 노출)
- **파일**: `routers/auth.py` L28-34
- **심각도**: Critical
- **설명**: SECRET_KEY 환경변수가 없을 경우 "dashboard-dev-secret-change-in-production" 평문 문자열을 사용. 소스코드에 노출되어 있어 공격자가 임의의 JWT 토큰을 위조할 수 있음. 경고 로그만 출력하고 서버를 정상 기동함.
- **코드**: `_DEFAULT_SECRET = "dashboard-dev-secret-change-in-production"`
- **권장 수정**: 환경변수 누락 시 서버 기동 거부 (raise SystemExit)
- **예상 수정 시간**: 약 10분

---

#### SEC-03 | 하드코딩된 Admin 이메일 (소스코드 노출)
- **파일**: `routers/auth.py` L25, `main.py` L217
- **심각도**: Critical
- **설명**: Admin 계정 이메일 주소가 소스코드에 평문 하드코딩. 이 이메일로 가입하면 자동으로 admin 역할 부여. GitHub 등에 코드가 공개될 경우 공격자가 해당 이메일로 가입 시도 가능.
- **권장 수정**: 환경변수로 이동 (ADMIN_EMAIL=...)
- **예상 수정 시간**: 약 15분

---

### High

#### SEC-04 | CORS allow_origins=["*"] — 환경변수 미설정 시
- **파일**: `main.py` L926-937
- **심각도**: High
- **설명**: CORS_ALLOWED_ORIGINS 환경변수가 설정되지 않으면 모든 출처("*")를 허용. 배포 환경에서 환경변수 누락 시 다른 도메인의 악성 사이트가 인증된 사용자의 API를 호출할 수 있음.
- **권장 수정**: 기본값을 ["*"] 대신 빈 리스트로 하고, 환경변수 필수화
- **예상 수정 시간**: 약 10분

---

#### SEC-05 | Rate Limiting 없는 로그인/회원가입 엔드포인트 (브루트포스 가능)
- **파일**: `routers/auth.py` L60-128
- **심각도**: High
- **설명**: POST /api/auth/login, POST /api/auth/register 엔드포인트에 요청 횟수 제한이 전혀 없음. 공격자가 비밀번호 브루트포스 공격을 무제한으로 시도 가능.
- **권장 수정**: slowapi 등 Rate Limiter 적용 (예: 1분당 최대 10회)
- **예상 수정 시간**: 약 1시간

---

#### SEC-06 | 환율 조회 API 인증 미적용
- **파일**: `routers/expense.py` L820-838, L851-865
- **심각도**: High
- **설명**: GET /api/exchange-rates 및 GET /api/exchange-rates/{currency} 엔드포인트에 get_current_user 의존성이 없음. 로그인 없이도 환율 데이터 전체 조회 가능.
- **예상 수정 시간**: 약 15분

---

#### SEC-07 | 주식 가격/뉴스/검색 API 인증 미적용
- **파일**: `routers/stocks.py` L143, L157, L253, L285, L344
- **심각도**: High
- **설명**: 아래 엔드포인트들이 인증 없이 접근 가능:
  - GET /api/stocks/price/{ticker} — Yahoo Finance 실시간 시세 (L143)
  - GET /api/stocks/exchange-rate — USD/KRW 환율 (L157)
  - GET /api/stocks/search — 종목 검색 (L253)
  - GET /api/stocks/history/{ticker} — 과거 시세 (L285)
  - GET /api/stocks/news — 뉴스 조회 (L344)
- **영향**: 외부에서 백엔드를 Yahoo Finance 프록시로 무제한 활용 가능. 서버 부하 및 Yahoo Finance IP 차단 위험.
- **예상 수정 시간**: 약 30분

---

### Medium

#### SEC-08 | Admin 패스워드 리셋 시 평문 비밀번호 응답 반환
- **파일**: `routers/admin.py` L189-200
- **심각도**: Medium
- **설명**: POST /api/admin/users/{id}/reset-password 엔드포인트가 임시 비밀번호를 API 응답 JSON에 평문으로 반환. 응답이 로그에 기록되거나 중간자 공격에 노출될 경우 비밀번호 탈취 가능.
- **코드**: `return {"ok": True, "new_password": new_pw}`
- **권장 수정**: 이메일 발송 또는 일회용 링크 방식으로 전환
- **예상 수정 시간**: 약 1시간

---

#### SEC-09 | 프론트엔드 역할 검사 localStorage 기반 (클라이언트 신뢰)
- **파일**: `frontend/src/App.jsx` L16-34
- **심각도**: Medium
- **설명**: SuperadminPage 접근 시 localStorage의 user.role 값으로 클라이언트에서만 역할 검사. 공격자가 localStorage 조작 시 어드민 UI 우회 가능. (백엔드 API는 서버에서 재검증하므로 데이터 탈취는 어렵지만 UI 노출 가능)
- **권장 수정**: 페이지 진입 시 /api/auth/me 호출로 서버에서 role 재확인
- **예상 수정 시간**: 약 30분

---

#### SEC-10 | f-string을 사용한 동적 DDL (잠재적 SQL Injection 패턴)
- **파일**: `main.py` L89, L126, L143, L306, L326, L621, L638, L658
- **심각도**: Medium
- **설명**: 마이그레이션 함수들에서 테이블명, 컬럼명을 f-string으로 직접 SQL에 삽입. 컬럼명/테이블명은 코드 내 상수이므로 현재는 직접 공격 위험이 낮으나, 패턴 자체가 안전하지 않음.
- **코드 예시**: conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
- **권장 수정**: 컬럼명/테이블명을 화이트리스트로 검증 후 사용
- **예상 수정 시간**: 약 1시간

---

#### SEC-11 | JWT 토큰 무효화 메커니즘 없음 (로그아웃 후 토큰 30일간 유효)
- **파일**: `routers/auth.py` L214-221
- **심각도**: Medium
- **설명**: 로그아웃 시 서버에서 토큰을 블랙리스트에 등록하지 않음. 클라이언트에서 localStorage를 삭제해도 해당 토큰을 탈취한 공격자는 30일간 계속 사용 가능 (TOKEN_EXPIRE_DAYS=30).
- **권장 수정**: Redis 기반 토큰 블랙리스트 구현 또는 토큰 만료 시간 단축
- **예상 수정 시간**: 약 2시간

---

### Low

#### SEC-12 | 에러 메시지에 내부 예외 정보 노출
- **파일**: `routers/stocks.py` L280-281, L326
- **심각도**: Low
- **설명**: 검색 실패 시 내부 예외 메시지 str(e)를 그대로 HTTP 응답에 포함. 서버 내부 구조, 라이브러리 버전, 경로 등이 노출될 수 있음.
- **권장 수정**: 사용자용 메시지와 내부 로그를 분리
- **예상 수정 시간**: 약 30분

---

#### SEC-13 | 비밀번호 복잡도 검증 미흡 (길이만 체크)
- **파일**: `routers/auth.py` L73-77, L192-198
- **심각도**: Low
- **설명**: 회원가입/비밀번호 변경 시 길이(8자 이상)만 검증. 숫자/특수문자 포함 여부 검증 없음.
- **예상 수정 시간**: 약 20분

---

## 버그

#### BUG-01 | 수입 라우터 경로 순서 문제 (summary/monthly → /{income_id} 우선 매칭)
- **파일**: `routers/income.py` L260-300
- **심각도**: High
- **설명**: GET /api/income/summary/monthly가 GET /api/income/{income_id} 라우터보다 뒤에 선언되어 있음. income_id가 int 타입이라 422 오류 또는 라우팅 오류 발생 가능. 구체적인 경로는 파라미터 경로보다 먼저 선언해야 함.
- **예상 수정 시간**: 약 10분 (라우터 순서 변경)

---

#### BUG-02 | 인메모리 환율 캐시 멀티 워커 간 공유 안 됨
- **파일**: `routers/expense.py` L816
- **심각도**: Medium
- **설명**: _rate_cache 딕셔너리가 모듈 레벨 변수. Gunicorn/uvicorn 멀티 워커 환경에서 각 워커가 독립된 메모리를 가지므로 30분 캐시 TTL이 워커마다 다르게 동작.
- **예상 수정 시간**: 약 1시간

---

#### BUG-03 | `once` 타입 Todo 완료 후 다른 날짜 조회 시 재노출
- **파일**: `routers/todos.py` L51-54
- **심각도**: Low
- **설명**: once 타입 Todo는 is_done_dates에 날짜가 하나라도 있으면 목록에서 제외하나, ?date= 파라미터를 변경해 다른 날 조회하면 동일 Todo가 다시 표시됨.
- **예상 수정 시간**: 약 20분

---

#### BUG-04 | 프론트 useEffect 내 fetch 클린업 없음 (메모리 누수)
- **파일**: `frontend/src/pages/index/IndexPage.jsx` L111-121, L158-165, L168-173, L177-189
- **심각도**: Medium
- **설명**: useEffect 내 fetch() 호출에 AbortController 클린업이 없음. 컴포넌트 언마운트 후 응답이 돌아오면 "Can't perform a React state update on an unmounted component" 경고 및 메모리 누수 발생 가능.
- **예상 수정 시간**: 약 1시간

---

#### BUG-05 | 포트폴리오 백필 — _CAT_META 외 카테고리 시세 조회 스킵
- **파일**: `routers/portfolio.py` L321-322
- **심각도**: Medium
- **설명**: 백필 루프에서 if category not in _CAT_META: continue로 처리. _CAT_META에 정의되지 않은 커스텀 그룹 카테고리는 백필에서 완전히 제외됨.
- **예상 수정 시간**: 약 30분

---

#### BUG-06 | 레거시 expenses 라우터와 신규 expense 라우터 기능 중복
- **파일**: `routers/expenses.py` (레거시), `routers/expense.py` (신규)
- **심각도**: Low
- **설명**: /api/expenses (레거시)와 /api/expense (신규) 두 라우터가 공존하며 동일한 Expense 테이블을 다룸. 레거시 라우터는 category_id, converted_amount, type 필드를 지원하지 않아 응답 스키마 불일치 가능.
- **예상 수정 시간**: 약 30분 (레거시 라우터 폐기 또는 신규로 통일)

---

#### BUG-07 | `_build_cat_map` — cat_map 없이 `_expense_dict` 호출 시 N+1
- **파일**: `routers/expense.py` L119-142
- **심각도**: Medium
- **설명**: _expense_dict에서 cat_map 인자가 None이면 항목마다 db.get(ExpenseCategory, e.category_id)를 2회 호출. 일부 호출 경로에서 cat_map 미전달 가능성 존재.
- **예상 수정 시간**: 약 30분

---

## 성능

#### PERF-01 | `list_income_categories` — N+1 쿼리 (대분류별 소분류 개별 조회)
- **파일**: `routers/income.py` L79-107
- **심각도**: High
- **설명**: 대분류 부모 목록 조회 후, 각 부모마다 db.query(ExpenseCategory).filter(parent_id == p.id)를 개별 실행. expense.py의 list_categories는 한 번의 쿼리로 처리하지만 income.py에는 미적용.
- **예상 수정 시간**: 약 30분

---

#### PERF-02 | `backfill_portfolio_snapshots` — 날짜별 개별 DB Commit
- **파일**: `routers/portfolio.py` L388
- **심각도**: Medium
- **설명**: 백필 루프에서 날짜별로 db.commit()을 각각 실행. 신규 유저 최대 365일 백필 시 365번의 커밋 발생.
- **예상 수정 시간**: 약 30분

---

#### PERF-03 | 포트폴리오 그룹 이름 변경 시 전체 스냅샷 메모리 로드
- **파일**: `routers/portfolio.py` L467-485
- **심각도**: Medium
- **설명**: 그룹 이름 변경 시 DailyPortfolioSnapshot 전체를 메모리에 로드해 JSON 파싱/수정. 스냅샷이 수천 건 이상일 경우 응답 지연 발생 가능.
- **예상 수정 시간**: 약 1시간

---

#### PERF-04 | IndexPage 마운트 시 다수의 독립 API 호출 병렬화 없음
- **파일**: `frontend/src/pages/index/IndexPage.jsx` L111, L158, L168, L177, L199
- **심각도**: Medium
- **설명**: /api/auth/me, /api/timezone, /api/auth/widget-config, /api/portfolio/backfill 등 독립적인 요청들이 각 useEffect에서 순차 실행됨. Promise.all로 묶으면 초기 로딩 속도 개선 가능.
- **예상 수정 시간**: 약 1시간

---

#### PERF-05 | 주식 뉴스 — 캐시 없음, 매번 새로 fetch
- **파일**: `frontend/src/pages/index/StockCard.jsx` L51-63
- **심각도**: Low
- **설명**: 뉴스 컴포넌트에서 "캐시 없음 — 항상 새로 fetch" 주석 명시. 버튼 클릭마다 Google RSS를 새로 요청.
- **예상 수정 시간**: 약 20분

---

#### PERF-06 | `_seed_exchange_rates` — 루프 내 개별 DB 쿼리 (N+1)
- **파일**: `main.py` L349-370
- **심각도**: Low
- **설명**: 기본 환율 시드 시 각 통화 쌍마다 존재 여부를 개별 쿼리로 확인. 10개 통화 쌍 = 10번의 SELECT 쿼리. 한 번의 WHERE IN 쿼리로 최적화 가능.
- **예상 수정 시간**: 약 20분

---

## 중복 코드

#### DUP-01 | `getToken()` 함수 여러 파일에 중복 정의
- **파일**: `frontend/src/utils/api.js` L1, `frontend/src/pages/BudgetPage.jsx` L57-65, `frontend/src/pages/index/IndexPage.jsx` L66 외 다수
- **심각도**: Medium
- **설명**: localStorage에서 토큰을 읽는 로직이 17개 파일에 분산. utils/api.js에 이미 getToken, authH, authHJ가 정의되어 있으나 일부 파일에서 직접 재구현.
- **권장 수정**: 전체 파일을 utils/api.js import로 통일
- **예상 수정 시간**: 약 1시간

---

#### DUP-02 | Admin 권한 검사 함수 두 곳에 중복 정의
- **파일**: `routers/admin.py` L25-28 (_require_admin), `routers/expense.py` L191-194 (require_admin)
- **심각도**: Low
- **설명**: 동일한 역할의 admin 권한 검사 함수가 두 라우터 파일에 각각 구현됨.
- **권장 수정**: routers/_shared.py에 공통 함수로 이동
- **예상 수정 시간**: 약 15분

---

#### DUP-03 | 통화 포맷 함수 여러 컴포넌트에 분산
- **파일**: `frontend/src/pages/index/StockCard.jsx` L15-16, `frontend/src/pages/BudgetPage.jsx` L46-51
- **심각도**: Low
- **설명**: 통화 포맷팅 로직(fmtKRW, fmtUSD, fmtAmt)이 여러 컴포넌트에 분산. 포맷 정책 변경 시 모든 파일을 수정해야 함.
- **권장 수정**: frontend/src/utils/format.js 파일로 통합
- **예상 수정 시간**: 약 30분

---

#### DUP-04 | 수입 월별 요약 집계 로직이 공통 함수를 재사용하지 않음
- **파일**: `routers/expense.py` L145-188, `routers/income.py` L260-300
- **심각도**: Low
- **설명**: income_monthly_summary가 expense.py의 공통 집계 함수(_split_income_expense 등)를 재사용하지 않고 직접 SQL 집계. 일관성 문제 발생 가능.
- **예상 수정 시간**: 약 30분

---

#### DUP-05 | Yahoo Finance 티커 변환 함수 두 파일에 중복
- **파일**: `routers/stocks.py` L38-47 (_resolve_yf_ticker), `routers/portfolio.py` L29-33 (_backfill_resolve_ticker)
- **심각도**: Low
- **설명**: Yahoo Finance 티커 변환 로직(.KS 자동 추가)이 동일한 패턴으로 두 파일에 각각 구현됨.
- **권장 수정**: routers/_shared.py에 공통 함수로 이동
- **예상 수정 시간**: 약 15분

---

#### DUP-06 | 날짜/월 배열 IndexPage.jsx에 하드코딩 (i18n 미활용)
- **파일**: `frontend/src/pages/index/IndexPage.jsx` L24-27
- **심각도**: Low
- **설명**: 한국어/영어 요일 및 월 배열이 컴포넌트 내부에 직접 하드코딩. locales/ko.json에서 관리해야 할 데이터가 컴포넌트 내부에 존재.
- **예상 수정 시간**: 약 20분

---

## 전체 예상 수정 소요 시간

| 분류 | 항목 수 | 예상 시간 |
|------|---------|----------|
| 보안 (Critical) | 3개 | 약 3시간 25분 |
| 보안 (High) | 4개 | 약 2시간 5분 |
| 보안 (Medium) | 4개 | 약 4시간 |
| 보안 (Low) | 2개 | 약 50분 |
| 버그 | 7개 | 약 3시간 20분 |
| 성능 | 6개 | 약 3시간 40분 |
| 중복 코드 | 6개 | 약 2시간 50분 |
| **합계** | **32개** | **약 20시간 10분** |

---

### 우선순위 권장 작업 순서

1. **즉시 처리 (당일)**: SEC-02 Secret Key 환경변수 강제화, SEC-03 Admin 이메일 환경변수 이동
2. **단기 처리 (1주 이내)**: SEC-01 JWT Cookie 전환, SEC-04 CORS 제한, SEC-05 Rate Limiting, SEC-06/07 미인증 API 보호
3. **중기 처리 (2주 이내)**: 버그 수정 전체 (BUG-01~07), SEC-08/09/10/11 보안 이슈
4. **장기 처리 (1달 이내)**: 성능 최적화 (PERF-01~06), 중복 코드 정리 (DUP-01~06)

---

*이 보고서는 정적 코드 분석 결과이며, 실제 런타임 동작과 차이가 있을 수 있습니다.*
