# DB Schema Documentation

> 최종 업데이트: 2026-05-21  
> 데이터베이스: PostgreSQL (Railway) / SQLite (로컬 개발)  
> ORM: SQLAlchemy 2.x (`Mapped` / `mapped_column`)

---

## 테이블 목록

| # | 테이블명 | 설명 |
|---|----------|------|
| 1 | `users` | SaaS 회원 정보 |
| 2 | `expenses` | 지출 내역 (user_id 기준 격리) |
| 3 | `diets` | 식단 기록 (user_id 기준 격리) |
| 4 | `memos` | 일일 메모 (user_id 기준 격리) |
| 5 | `stocks` | 보유 종목 (user_id 기준 격리) |
| 6 | `stock_price_history` | 종목별 일별 시세 스냅샷 |
| 7 | `bookmarks` | 북마크 (user_id 기준 격리) |
| 8 | `youtube_channels` | 유튜브 채널 목록 (user_id 기준 격리) |
| 9 | `timezone_config` | 시간대 설정 (user_id 당 1행) |
| 10 | `portfolio_groups` | 포트폴리오 그룹 데이터 (user_id 당 1행) |
| 11 | `permissions` | 레벨별 권한 매핑 |
| 12 | `daily_portfolio_snapshot` | 일별 포트폴리오 스냅샷 (user_id 기준 격리) |

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

**비고:**
- `role` 컬럼 레거시 값 `'Member'`는 서버 시작 시 `'free'`로 자동 마이그레이션
- `jooyounglee321123@gmail.com` 계정은 서버 시작 시 `role='admin'`으로 자동 설정

---

## 2. `expenses`

지출 내역 기록 테이블. **사용자별 데이터 격리 (user_id FK).**

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `id` | INTEGER | PK, INDEX | 자동 증가 고유 ID |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` CASCADE, INDEX | 소유 사용자 ID |
| `date` | DATE | NOT NULL, INDEX | 지출 날짜 |
| `amount` | NUMERIC(12,2) | NOT NULL | 지출 금액 |
| `category` | VARCHAR(100) | NULLABLE | 지출 카테고리 (예: 식비, 교통) |
| `description` | VARCHAR(500) | NULLABLE | 지출 내용 설명 |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |

---

## 3. `diets`

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

## 4. `memos`

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

## 5. `stocks`

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

## 6. `stock_price_history`

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

## 7. `bookmarks`

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

## 8. `youtube_channels`

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

## 9. `timezone_config`

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

## 10. `portfolio_groups`

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

## 11. `permissions`

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

## 12. `daily_portfolio_snapshot`

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
| `data` | TEXT | NULLABLE | JSON — 그룹·종목 상세 데이터 |
| `saved_by` | VARCHAR(20) | DEFAULT `'frontend'` | 저장 주체: `frontend` / `scheduler` |
| `created_at` | DATETIME | DEFAULT `now()` (서버) | 레코드 생성 일시 |
| `updated_at` | DATETIME | DEFAULT `now()`, ON UPDATE `now()` | 마지막 수정 일시 |

**UNIQUE 제약:** `(user_id, snapshot_date)` — `uq_user_snapshot_date`

**비고:**
- 프런트엔드가 당일 스냅샷을 저장하지 않으면 APScheduler가 23:59 KST에 `user_id=NULL` 플레이스홀더 자동 저장
- API 조회 시 항상 현재 로그인 사용자의 `user_id` 기준으로 필터링
- 기존 데이터 마이그레이션: 서버 시작 시 `user_id=NULL` 인 기존 rows를 `user_id=1`(admin)으로 설정

---

## Foreign Key 관계 요약

```
users (id)
  ├─── expenses          (user_id)  ON DELETE CASCADE
  ├─── diets             (user_id)  ON DELETE CASCADE
  ├─── memos             (user_id)  ON DELETE CASCADE
  ├─── stocks            (user_id)  ON DELETE CASCADE
  │      └─── stock_price_history (stock_id) ON DELETE CASCADE
  ├─── bookmarks         (user_id)  ON DELETE CASCADE
  ├─── youtube_channels  (user_id)  ON DELETE CASCADE
  ├─── timezone_config   (user_id)  ON DELETE CASCADE
  ├─── portfolio_groups  (user_id)  ON DELETE CASCADE
  └─── daily_portfolio_snapshot (user_id, nullable) ON DELETE CASCADE

permissions  — 독립 테이블 (FK 없음)
```

---

## 서버 시작 시 자동 실행 작업

| 순서 | 함수 | 내용 |
|------|------|------|
| 1 | `Base.metadata.create_all()` | 존재하지 않는 테이블 자동 생성 |
| 2 | `_migrate_user_columns()` | `users` 테이블에 신규 컬럼 누락 시 `ALTER TABLE`로 추가 |
| 3 | `_migrate_add_user_id()` | 각 데이터 테이블에 `user_id` 컬럼 추가, 기존 rows → `user_id=1`, `daily_portfolio_snapshot` UNIQUE 제약 교체 |
| 4 | `_migrate_user_roles()` | `users.role = 'Member'` → `'free'` 일괄 변환 |
| 5 | `_seed_admin_email()` | `jooyounglee321123@gmail.com` 계정의 `role`을 `'admin'`으로 설정 |
| 6 | `_seed_default_permissions()` | `permissions` 테이블이 비어 있으면 기본 28개 권한 행 삽입 |
