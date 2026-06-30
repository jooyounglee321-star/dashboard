# DB Schema Documentation

> 최종 업데이트: 2026-06-30  
> 데이터베이스: PostgreSQL (Railway) / SQLite (로컬 개발)  
> ORM: SQLAlchemy 2.x (`Mapped` / `mapped_column`)

---

## 테이블 목록

| # | 테이블명 | 설명 |
|---|----------|------|
| 1 | `users` | SaaS 회원 정보 |
| 2 | `expense_categories` | 가계부 카테고리 (대분류/소분류, 시스템+사용자 커스텀) |
| 3 | `expenses` | 지출 내역 (user_id 기준 격리) |
| 4 | `expense_budgets` | 사용자별 카테고리별 예산 설정 |
| 5 | `exchange_rates` | 통화 환율 (USD 기준 9개 시드) |
| 6 | `diets` | 식단 기록 (user_id 기준 격리) |
| 7 | `diet_analyses` | 날짜별 AI 식단 분석 결과 (user_id+date 당 1건 UPSERT) |
| 8 | `memos` | 일일 메모 (user_id 기준 격리) |
| 8-1 | `pinned_memos` | 고정(날짜 독립) 메모 (user_id 기준 격리) |
| 9 | `stocks` | 보유 종목 (user_id 기준 격리) |
| 10 | `stock_price_history` | 종목별 일별 시세 스냅샷 |
| 11 | `bookmarks` | 북마크 (user_id 기준 격리) |
| 12 | `youtube_channels` | 유튜브 채널 목록 (user_id 기준 격리) |
| 13 | `timezone_config` | 시간대 설정 (user_id 당 1행) |
| 14 | `portfolio_groups` | 포트폴리오 그룹 데이터 (user_id 당 1행) |
| 15 | `permissions` | 레벨별 권한 매핑 |
| 16 | `daily_portfolio_snapshot` | 일별 포트폴리오 스냅샷 (user_id 기준 격리) |
| 17 | `todos` | 수동 할 일 체크리스트 (user_id 기준 격리, start_date~due_date 범위 표시, 날짜별 체크 독립) |
| 18 | `recurring_expenses` | 정기지출/수입 설정 (monthly·semi-monthly·weekly·biweekly, user_id 기준 격리) |

---

## 1. `users`

SaaS 회원 테이블. 로컬(이메일/비밀번호) 및 소셜 로그인 회원 모두 저장.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `email` | VARCHAR(320) | NOT NULL, UNIQUE, INDEX | 이메일 주소 (로그인 ID) |
| `hashed_password` | VARCHAR(255) | NULLABLE | bcrypt 해시 비밀번호 (소셜 가입 시 NULL) |
| `role` | VARCHAR(50) | NOT NULL, DEFAULT `'Member'` | 회원 레벨: `admin` / `premium` / `free` / `guest` |
| `provider` | VARCHAR(30) | NOT NULL, DEFAULT `'local'` | 가입 경로: `local` / `google` / 기타 |
| `provider_id` | VARCHAR(255) | NULLABLE, INDEX | 소셜 로그인 외부 서비스 고유 ID |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 가입 일시 |
| `name` | VARCHAR(100) | NULLABLE | 닉네임 (사용자 설정) |
| `plan` | VARCHAR(20) | NOT NULL, DEFAULT `'free'` | 구독 플랜: `free` / `premium` 등 |
| `plan_expires_at` | DATE | NULLABLE | 플랜 만료일 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT `'active'` | 계정 상태: `active` / `suspended` 등 |
| `last_login_at` | DATETIME | NULLABLE | 마지막 로그인 일시 |
| `login_count` | INTEGER | NOT NULL, DEFAULT `0` | 누적 로그인 횟수 |
| `total_payment` | NUMERIC(12,2) | NOT NULL, DEFAULT `0` | 누적 결제 금액 |
| `primary_device` | VARCHAR(20) | NULLABLE | 주 사용 기기: `desktop` / `mobile` 등 |
| `admin_memo` | TEXT | NULLABLE | 관리자 메모 |
| `widget_config` | TEXT | NULLABLE | 위젯 설정 JSON (on/off, 언어, 온도단위, 표시개수 등) |
| `birth_year` | INTEGER | NULLABLE | 출생년도 (AI 식단 분석용) |
| `gender` | VARCHAR(10) | NULLABLE | 성별: `male` / `female` / `other` |
| `height_cm` | FLOAT | NULLABLE | 키 (항상 cm 단위로 저장, 단위 변환은 프론트에서 처리) |
| `weight_kg` | FLOAT | NULLABLE | 몸무게 (항상 kg 단위로 저장, 단위 변환은 프론트에서 처리) |

**비고:**
- `role` 컬럼 레거시 값 `'Member'`는 서버 시작 시 `'free'`로 자동 마이그레이션
- `jooyounglee321123@gmail.com` 계정은 서버 시작 시 `role='admin'`으로 자동 설정

---

## 2. `expense_categories`

가계부 카테고리 테이블. 대분류 / 소분류 자기 참조 구조.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NULLABLE, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID (`NULL` = 시스템 기본 카테고리) |
| `parent_id` | INTEGER | NULLABLE, FK → `expense_categories.id` CASCADE, INDEX | 부모 카테고리 ID (`NULL` = 대분류, NOT NULL = 소분류) |
| `name_ko` | VARCHAR(100) | NOT NULL | 카테고리 한국어 이름 |
| `name_en` | VARCHAR(100) | NOT NULL | 카테고리 영어 이름 |
| `icon` | VARCHAR(50) | NULLABLE | 이모지 또는 아이콘 코드 |
| `order_num` | INTEGER | NOT NULL, DEFAULT `0` | 표시 순서 |
| `is_default` | BOOLEAN | NOT NULL, DEFAULT `false` | 시스템 기본 제공 여부 |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT `true` | 활성화 여부 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

**비고:**
- `user_id = NULL`: 모든 사용자에게 표시되는 시스템 기본 카테고리
- `user_id = INT`: 해당 사용자만 볼 수 있는 커스텀 카테고리
- 자기 참조 FK로 대분류 → 소분류 2단계 계층 구조 지원

---

## 3. `expenses`

지출 내역 기록 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `date` | DATE | NOT NULL, INDEX | 지출 날짜 |
| `amount` | NUMERIC(12,2) | NOT NULL | 지출 금액 (원래 통화 기준) |
| `category` | VARCHAR(100) | NULLABLE | 레거시 텍스트 카테고리 (Phase 1 이전 데이터 호환용) |
| `description` | VARCHAR(500) | NULLABLE | 지출 내용 설명 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `category_id` | INTEGER | NULLABLE, FK → `expense_categories.id` SET NULL, INDEX | 대분류 카테고리 ID |
| `subcategory_id` | INTEGER | NULLABLE, FK → `expense_categories.id` SET NULL, INDEX | 소분류 카테고리 ID |
| `currency` | VARCHAR(10) | NOT NULL, DEFAULT `'USD'` | 지출 통화 코드 (예: KRW, USD, EUR) |
| `converted_amount` | NUMERIC(14,2) | NULLABLE | USD 환산 금액 |
| `exchange_rate` | NUMERIC(14,6) | NULLABLE | 적용 환율 (원래통화 → USD) |
| `type` | VARCHAR(10) | NOT NULL, DEFAULT `'expense'` | 레코드 종류: `'expense'`(지출) \| `'income'`(수입) — Phase 2 신규 |

**비고:**
- `category` 컬럼은 Phase 1 이전 레거시 데이터 보존용 (신규 입력 시 `category_id` 사용 권장)
- `category_id` 카테고리 삭제 시 `SET NULL` (지출 내역 보존)
- Phase 1 신규 컬럼 5개는 서버 시작 시 `_migrate_expense_columns()`로 자동 추가
- Phase 2 `type` 컬럼은 서버 시작 시 `_migrate_expense_type_column()`으로 자동 추가; 기존 레코드는 `DEFAULT 'expense'`로 초기화

---

## 4. `expense_budgets`

사용자별 카테고리별 예산 설정 테이블.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `category_id` | INTEGER | NULLABLE, FK → `expense_categories.id` CASCADE, INDEX | 예산 적용 카테고리 (`NULL` = 전체 예산) |
| `year` | INTEGER | NOT NULL | 예산 연도 |
| `month` | INTEGER | NULLABLE | 예산 월 (`NULL` = 연간 예산, `1~12` = 월별 예산) |
| `amount` | NUMERIC(14,2) | NOT NULL | 예산 금액 |
| `currency` | VARCHAR(10) | NOT NULL, DEFAULT `'USD'` | 예산 통화 코드 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

---

## 5. `exchange_rates`

통화 환율 테이블. USD 기준 주요 통화 환율 저장.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `base_currency` | VARCHAR(10) | NOT NULL, DEFAULT `'USD'`, INDEX | 기준 통화 코드 |
| `target_currency` | VARCHAR(10) | NOT NULL, INDEX | 대상 통화 코드 |
| `rate` | NUMERIC(14,6) | NOT NULL | 환율 (1 base = rate target) |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(base_currency, target_currency)` — `uq_exchange_rate_pair`

**기본 시드 (서버 시작 시 존재하지 않는 쌍만 자동 삽입, 총 10쌍):**

| base | target | rate | 비고 |
|------|--------|------|------|
| USD | KRW | 1350 | 한국 원화 |
| USD | EUR | 0.92 | 유로 |
| USD | JPY | 149 | 일본 엔 |
| USD | GBP | 0.79 | 영국 파운드 |
| USD | CAD | 1.36 | 캐나다 달러 |
| USD | AUD | 1.53 | 호주 달러 |
| USD | CNY | 7.24 | 중국 위안 |
| USD | HKD | 7.82 | 홍콩 달러 |
| USD | SGD | 1.34 | 싱가포르 달러 |
| USD | CHF | 0.89 | 스위스 프랑 (BudgetPage 통화 목록) |

**Yahoo Finance 30분 갱신 티커:** `USDKRW=X`, `USDEUR=X`, `USDJPY=X`, `USDGBP=X`, `USDCAD=X`, `USDAUD=X`, `USDCNY=X`, `USDHKD=X`, `USDSGD=X`, `USDCHF=X`

---

## 6. `diets`

식단(끼니) 기록 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `date` | DATE | NOT NULL, INDEX | 식단 날짜 |
| `meal_type` | VARCHAR(50) | NULLABLE | 끼니 구분: `아침` / `점심` / `저녁` / `간식` 등 |
| `content` | TEXT | NULLABLE | 식단 내용 |
| `calories` | INTEGER | NULLABLE | 칼로리 (kcal) |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

---

## 7. `diet_analyses`

날짜별 AI 식단 분석 결과 테이블. **(user_id, date) 당 1건 UPSERT.**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `date` | DATE | NOT NULL, INDEX | 분석 대상 날짜 |
| `nutrition_analysis` | TEXT | NULLABLE | 영양 균형 분석 결과 (자유 텍스트) |
| `recommendations` | TEXT | NULLABLE | 메뉴 추천 목록 (JSON 배열 문자열) |
| `warnings` | TEXT | NULLABLE | 주의사항 텍스트 |
| `raw_meals` | TEXT | NULLABLE | 분석 당시 식단 스냅샷 (JSON 배열 문자열) |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 최초 저장 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(user_id, date)` — `uq_diet_analysis_user_date`

**비고:**
- 날짜당 1건만 허용 — 재분석 시 기존 행 UPDATE (upsert)
- `recommendations`, `raw_meals` 는 JSON 배열 문자열로 저장, 프론트에서 `JSON.parse()` 처리
- 서버 시작 시 `_migrate_create_diet_analyses()`로 `CREATE TABLE IF NOT EXISTS` 실행

---

## 8. `memos`

일일 메모 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `date` | DATE | NOT NULL, INDEX | 메모 날짜 |
| `title` | VARCHAR(200) | NULLABLE | 메모 제목 |
| `content` | TEXT | NULLABLE | 메모 본문 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

---

## 8. `stocks`

보유 종목(포트폴리오) 테이블. **사용자별 데이터 격리 (user_id FK).** 카테고리당 최대 10개.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `category` | VARCHAR(20) | NOT NULL, INDEX | 종목 카테고리: `USD` / `KRW` 등 |
| `ticker` | VARCHAR(20) | NOT NULL | 종목 코드 (예: `AAPL`, `005930`) |
| `name` | VARCHAR(200) | NULLABLE | 종목명 |
| `quantity` | FLOAT | NULLABLE | 보유 수량 |
| `avg_price` | NUMERIC(14,4) | NULLABLE | 평균 매수 단가 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**관계:** `stock_price_history` 테이블과 1:N 관계 (`cascade="all, delete-orphan"`)

---

## 9. `stock_price_history`

종목별 일별 시세 스냅샷 테이블. **stocks.user_id 를 통해 간접적으로 사용자 격리.**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `stock_id` | INTEGER | NOT NULL, FK → `stocks.id` CASCADE, INDEX | 연결된 종목 ID |
| `snapshot_date` | DATE | NOT NULL, INDEX | 시세 기준 날짜 |
| `current_price` | NUMERIC(14,4) | NULLABLE | 현재가 |
| `prev_close` | NUMERIC(14,4) | NULLABLE | 전일 종가 |
| `change_amount` | NUMERIC(14,4) | NULLABLE | 전일 대비 변동액 |
| `change_percent` | NUMERIC(8,4) | NULLABLE | 전일 대비 변동률 (%) |
| `volume` | INTEGER | NULLABLE | 거래량 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

**Foreign Key:**
- `stock_id` → `stocks.id` (`ON DELETE CASCADE`): 종목 삭제 시 관련 시세 기록 자동 삭제

---

## 10. `bookmarks`

북마크(즐겨찾기) 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `title` | VARCHAR(200) | NOT NULL | 북마크 제목 |
| `url` | VARCHAR(2000) | NOT NULL | 북마크 URL |
| `category` | VARCHAR(100) | NULLABLE | 북마크 카테고리 |
| `description` | VARCHAR(500) | NULLABLE | 북마크 설명 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

---

## 11. `youtube_channels`

유튜브 채널 구독 목록 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `channel_name` | VARCHAR(200) | NOT NULL | 채널명 |
| `channel_url` | VARCHAR(2000) | NULLABLE | 채널 URL |
| `category` | VARCHAR(100) | NULLABLE | 채널 카테고리 |
| `description` | VARCHAR(500) | NULLABLE | 채널 설명 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

---

## 12. `timezone_config`

시간대 설정 테이블. **단일 행 구조 폐기 → user_id 당 1행.**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX, UNIQUE | 소유 사용자 ID (1인당 1행) |
| `timezone` | TEXT | NOT NULL, DEFAULT `'UTC'` | JSON 배열로 최대 3개 시간대 저장 (예: `["Asia/Seoul","America/New_York","UTC"]`) |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(user_id)` — `uq_timezone_user`  
**비고:** user_id 기준 UPSERT (로그인 사용자별 독립 설정)

---

## 13. `portfolio_groups`

포트폴리오 그룹 전체 데이터 테이블. **단일 행 구조 폐기 → user_id 당 1행.**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX, UNIQUE | 소유 사용자 ID (1인당 1행) |
| `data` | TEXT | NOT NULL, DEFAULT `'[]'` | `stock_groups_v2` JSON 배열 전체 저장 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(user_id)` — `uq_portfolio_groups_user`  
**비고:** `localStorage` 미러. user_id 기준 UPSERT

---

## 14. `permissions`

회원 레벨(role)별 권한 매핑 테이블.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `role` | VARCHAR(20) | NOT NULL, INDEX | 회원 레벨: `admin` / `premium` / `free` / `guest` |
| `permission_name` | VARCHAR(50) | NOT NULL | 권한 이름 (아래 목록 참고) |
| `is_allowed` | BOOLEAN | NOT NULL, DEFAULT `false` | 해당 레벨에 권한 허용 여부 |

**UNIQUE 제약:** `(role, permission_name)` — `uq_role_permission`

**권한 목록 (`permission_name`):**

| 권한명 | 설명 |
|--------|------|
| `superadmin_access` | 슈퍼어드민 페이지 접근 |
| `manage_users` | 회원 관리 (조회·수정) |
| `manage_permissions` | 권한 설정 관리 |
| `dashboard_full` | 대시보드 전체 기능 |
| `dashboard_basic` | 대시보드 기본 기능 |
| `dashboard_view_only` | 대시보드 읽기 전용 |
| `own_settings` | 본인 설정 변경 |

**기본 권한 시드 (서버 시작 시 `permissions` 테이블이 비어 있을 때 자동 입력):**

| 권한명 | admin | premium | free | guest |
|--------|:-----:|:-------:|:----:|:-----:|
| `superadmin_access` | ✅ | ❌ | ❌ | ❌ |
| `manage_users` | ✅ | ❌ | ❌ | ❌ |
| `manage_permissions` | ✅ | ❌ | ❌ | ❌ |
| `dashboard_full` | ✅ | ✅ | ❌ | ❌ |
| `dashboard_basic` | ✅ | ✅ | ✅ | ❌ |
| `dashboard_view_only` | ✅ | ✅ | ✅ | ✅ |
| `own_settings` | ✅ | ✅ | ✅ | ❌ |

---

## 15. `daily_portfolio_snapshot`

매일 23:59 KST 자동 저장되는 포트폴리오 일별 스냅샷 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NULLABLE, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID (`NULL` = scheduler 자동 생성) |
| `snapshot_date` | DATE | NOT NULL, INDEX | 스냅샷 기준 날짜 |
| `usd_krw` | FLOAT | NULLABLE | USD/KRW 환율 |
| `total_usd` | FLOAT | NULLABLE | USD 그룹 합계 (달러) |
| `total_krw` | FLOAT | NULLABLE | KRW 그룹 합계 (원화) |
| `total_krw_equiv` | FLOAT | NULLABLE | 원화 환산 전체 합계 |
| `realized_pl` | FLOAT | NULLABLE | 해당 날짜까지 누적 실현 손익 합계 |
| `data` | TEXT | NULLABLE | JSON — 그룹·종목 상세 데이터 |
| `saved_by` | VARCHAR(20) | DEFAULT `'frontend'` | 저장 주체: `frontend` / `backfill` / `scheduler` |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(user_id, snapshot_date)` — `uq_user_snapshot_date`

**비고:**
- 프런트엔드가 당일 스냅샷을 저장하지 않으면 APScheduler가 23:59 KST에 `user_id=NULL` 플레이스홀더 자동 저장
- API 조회 시 항상 현재 로그인 사용자의 `user_id` 기준으로 필터링
- 기존 데이터 마이그레이션: 서버 시작 시 `user_id=NULL` 인 기존 rows를 `user_id=1`(admin)으로 설정

---

## 18. `recurring_expenses`

정기지출/수입 설정 테이블. 사용자가 등록한 주기별 자동 등록 항목.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `day_of_month` | INTEGER | NOT NULL | 월 기준 날짜 (0=말일, 1~31). weekly/biweekly 시 무시 |
| `type` | VARCHAR(10) | NOT NULL, DEFAULT `'expense'` | `'expense'` / `'income'` |
| `category_id` | INTEGER | NULLABLE, FK → `expense_categories.id` SET NULL | 대분류 카테고리 |
| `subcategory_id` | INTEGER | NULLABLE, FK → `expense_categories.id` SET NULL | 소분류 카테고리 |
| `amount` | NUMERIC(14,2) | NOT NULL | 금액 |
| `currency` | VARCHAR(10) | NOT NULL, DEFAULT `'USD'` | 통화 코드 |
| `memo` | VARCHAR(500) | NULLABLE | 메모 |
| `frequency` | VARCHAR(20) | NOT NULL, DEFAULT `'monthly'` | 결제 주기: `monthly` / `semi-monthly` / `weekly` / `biweekly` |
| `day_of_week` | INTEGER | NULLABLE | 요일 (weekly/biweekly용): 0=월 ~ 6=일 |
| `day_of_month_2` | INTEGER | NULLABLE | 두 번째 날짜 (semi-monthly용): 0=말일, 1~31 |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT `true` | 활성 여부 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 수정 일시 |

**비고:**
- `frequency='monthly'`: `day_of_month` 필수 (0~31)
- `frequency='semi-monthly'`: `day_of_month` + `day_of_month_2` 둘 다 필수, 서로 달라야 함
- `frequency='weekly'` / `'biweekly'`: `day_of_week` 필수 (0~6), `day_of_month` 무시

---

## Foreign Key 관계 요약

```
users (id)
  ├─── expense_categories (user_id, nullable)  ON DELETE CASCADE
  ├─── expenses           (user_id)            ON DELETE CASCADE
  │      ├─── category_id    → expense_categories.id  ON DELETE SET NULL
  │      └─── subcategory_id → expense_categories.id  ON DELETE SET NULL
  ├─── expense_budgets    (user_id)            ON DELETE CASCADE
  │      └─── category_id → expense_categories.id     ON DELETE CASCADE
  ├─── diets              (user_id)            ON DELETE CASCADE
  ├─── memos              (user_id)            ON DELETE CASCADE
  ├─── stocks             (user_id)            ON DELETE CASCADE
  │      └─── stock_price_history (stock_id)   ON DELETE CASCADE
  ├─── bookmarks          (user_id)            ON DELETE CASCADE
  ├─── youtube_channels   (user_id)            ON DELETE CASCADE
  ├─── timezone_config    (user_id)            ON DELETE CASCADE
  ├─── portfolio_groups   (user_id)            ON DELETE CASCADE
  └─── daily_portfolio_snapshot (user_id, nullable) ON DELETE CASCADE

expense_categories (id)
  └─── parent_id → expense_categories.id  ON DELETE CASCADE  (자기 참조)

exchange_rates  — 독립 테이블 (FK 없음)
permissions     — 독립 테이블 (FK 없음)
```

---

## 서버 시작 시 자동 실행 작업

| 순서 | 함수 | 내용 |
|------|------|------|
| 1 | `Base.metadata.create_all()` | 존재하지 않는 테이블 자동 생성 |
| 2 | `_migrate_user_columns()` | `users` 테이블에 신규 컬럼 누락 시 `ALTER TABLE`로 추가 |
| 3 | `_migrate_add_user_id()` | 각 데이터 테이블에 `user_id` 컬럼 추가, 기존 rows → `user_id=1`, `daily_portfolio_snapshot` UNIQUE 제약 교체 |
| 4 | `_migrate_expense_columns()` | `expenses` 테이블에 Phase 1 신규 컬럼 5개 추가 (category_id, subcategory_id, currency, converted_amount, exchange_rate) |
| 5 | `_migrate_user_roles()` | `users.role = 'Member'` → `'free'` 일괄 변환 |
| 6 | `_seed_admin_email()` | `jooyounglee321123@gmail.com` 계정의 `role`을 `'admin'`으로 설정 |
| 7 | `_seed_default_permissions()` | `permissions` 테이블이 비어 있으면 기본 28개 권한 행 삽입 |
| 8 | `_seed_exchange_rates()` | `exchange_rates` 테이블에 USD 기준 기본 환율 10쌍 삽입 (없는 쌍만) |
| 9 | `_seed_expense_categories()` | `expense_categories` 테이블이 비어 있으면 기본 10대분류 44소분류 삽입 (`is_default=True`, `user_id=NULL`) |
| 10 | `_migrate_recurring_expenses_table()` | `recurring_expenses` 테이블 없으면 생성 |
| 11 | `_migrate_recurring_type_column()` | `recurring_expenses.type` 컬럼 누락 시 `ALTER TABLE`로 추가 |
| 12 | `_migrate_recurring_frequency_columns()` | `recurring_expenses`에 `frequency` / `day_of_week` / `day_of_month_2` 컬럼 누락 시 추가 |
