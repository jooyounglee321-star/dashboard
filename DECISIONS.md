# 프로젝트 결정 기록

---
## 2026-05-19 — 슈퍼어드민 회원관리 페이지 설계

**결정:** 슈퍼어드민 페이지를 단일 HTML 파일(superadmin.html)로 구현, 별도 인증 미들웨어 없이 URL 기반 접근 제어.

**이유:** 현재 프로젝트 규모에서 JWT/세션 인증을 추가하는 것은 오버엔지니어링. URL(`/superadmin`)을 외부에 노출하지 않는 운영 방식으로 충분한 보안 수준 확보. 추후 role 체크 미들웨어 추가 여지 남겨둠.

**기술 결정:**
- `_migrate_user_columns()`: Alembic 없이 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 방식으로 기존 DB에 안전하게 컬럼 추가. SQLite·PostgreSQL 모두 호환.
- 비밀번호 초기화: 12자 랜덤 문자열을 생성·bcrypt 해싱 저장 후 평문을 1회 응답에만 포함. 이메일 발송 미구현으로 관리자가 직접 전달.
- 월 결제금액 통계: payments 전용 테이블 없이 users.total_payment 합산으로 근사치 표시. 추후 결제 테이블 도입 시 교체 필요.

**대안:** Alembic 마이그레이션 도입(복잡도↑), FastAPI depends role 체크(추후 추가 예정), 이메일 발송 연동(SendGrid 등).

---
## 2026-05-01 — 인증 라우터 설계 및 구현

**결정:** FastAPI 기반 회원가입/관리 인증 라우터를 구현하였으며, bcrypt 해싱, 정규식 이메일 검증, 8자 비밀번호 정책을 선택함.

**이유:** bcrypt는 비밀번호 저장의 업계 표준이며 passlib 라이브러리를 통해 안전한 구현이 보장됨. 정규식은 간단한 형식 검증에 적합하고, 8자 최소 길이는 보안과 사용성의 균형을 맞춤.

**대안:** 이메일 검증은 email-validator 라이브러리 고려. 비밀번호 해싱은 argon2/scrypt도 가능했으나 bcrypt의 광범위한 지원과 안정성을 우선. 비밀번호 길이는 10자 이상도 검토했으나 사용자 편의성을 고려하여 8자로 결정.

**파일:** C:\Users\Jason\Desktop\dashboard\routers\auth.py

---
## 2026-05-01 — User 테이블 확장: 슈퍼어드민 및 빌링 기능 추가

**결정:** User 테이블에 9개의 새로운 컬럼(name, plan, plan_expires_at, status, last_login_at, login_count, total_payment, primary_device, admin_memo)을 직접 추가하여 어드민 및 빌링 관련 기능을 구현하기로 결정.

**이유:** 슈퍼어드민 기능과 SaaS 빌링 기능이 핵심 요구사항이므로, User 테이블에 직접 확장하는 것이 가장 단순하고 빠른 구현 방식. 대부분의 User 조회 시에 이 정보가 필요할 가능성이 높음.

**대안:** (1) 별도 Subscription/Billing 테이블 생성 후 foreign key로 연결 - 더 정규화된 설계이나 조회 시 JOIN 필요. (2) User 테이블에 JSON 컬럼 추가 - 유연하나 쿼리 필터링이 복잡. (3) admin_profile 같은 별도 테이블 생성 - 관심사 분리는 좋으나 대부분의 요청에서 필요하므로 N+1 쿼리 문제 가능성.

**파일:** C:\Users\Jason\Desktop\dashboard\models.py

---
## 2026-05-XX — 어드민 사용자 응답 스키마 및 업데이트 스키마 설계

**결정:** `UserAdminOut`, `PlanUpdate`, `StatusUpdate`, `AdminMemoUpdate` 4개의 별도 Pydantic 스키마를 추가하여 어드민 API의 응답 및 업데이트 요청을 구조화함.

**이유:** 슈퍼어드민 기능에서 사용자 정보 조회 시 일반 사용자 응답(`UserOut`)과 구분되는 상세 정보(name, provider_id, plan, login_count, total_payment, primary_device, admin_memo 등)가 필요함. 각 관리 작업(플랜 변경, 상태 변경, 어드민 메모)을 별도 스키마로 분리하여 API 계약(contract)을 명확히 하고, 유효성 검증을 각각 처리할 수 있게 함.

**대안:** (1) `UserOut`에 모든 어드민 필드를 선택적으로 추가 - API 응답이 부풀어지고 일반 사용자/어드민 조회의 경계가 모호. (2) 어드민 업데이트를 일반 User 모델 전체 변경으로 처리 - PATCH 안전성 및 의도성 감소. (3) 동적 응답 구성 - 타입 안전성과 IDE 자동완성 손상.

**파일:** C:\Users\Jason\Desktop\dashboard\schemas.py

---
## 2026-05-19 12:57 — 어드민 라우터 구현: 비밀번호 초기화 응답 전략

**결정:** 어드민 사용자 관리 라우터(`/admin`)를 구현하면서 비밀번호 초기화 엔드포인트에서 새로운 비밀번호를 평문으로 API 응답에 반환하기로 결정.

**이유:** 어드민이 사용자 비밀번호를 초기화할 때 즉시 새 비밀번호를 확인할 수 있어야 하며, 이메일 전송 인프라가 아직 구축되지 않은 상태에서 가장 빠른 구현 방식. 임시 비밀번호이므로 사용자는 로그인 후 자체 비밀번호 변경을 수행할 것으로 예상.

**대안:** (1) 비밀번호 초기화 링크 또는 토큰 발급 - 보안성은 높으나 이메일 전송 시스템 필요. (2) 이메일로만 전송하고 API에서 반환하지 않음 - 가장 안전하나 이메일 인프라 필수. (3) 현재 선택: 평문 반환 - 구현 빠르고 임시 비밀번호 특성에 적합하지만, HTTPS 연결 보장 필수.

**파일:** C:\Users\Jason\Desktop\dashboard\routers\admin.py

---
## 2026-05-19 — 런타임 스키마 마이그레이션: 동적 컬럼 추가 전략

**결정:** FastAPI 애플리케이션의 lifespan 이벤트 동안 `_migrate_user_columns()` 함수를 통해 users 테이블의 신규 컬럼을 동적으로 추가하는 방식을 선택함.

**이유:** 기존의 ORM 정의로는 스키마 확장 시 수동 마이그레이션 스크립트가 필요하므로, 앱 시작 시 존재하지 않는 컬럼을 자동 감지하여 추가하는 방식으로 배포 프로세스를 단순화함. SQLAlchemy의 inspect를 사용한 안전한 컬럼 존재 여부 확인과 예외 처리로 멱등성을 보장.

**대안:** (1) Alembic 기반의 정식 마이그레이션 도구 - 버전 관리와 추적성은 우수하나 초기 설정 복잡도 높음. (2) 완전 SQL 스크립트 관리 - 세밀한 제어 가능하나 운영 부담 증가. (3) ORM 모델 정의만 사용하고 create_all 의존 - 기존 데이터 보존 불가능하고 프로덕션에서 위험. 현재 선택은 런타임 안전성과 구현 단순성의 균형.

**파일:** C:\Users\Jason\Desktop\dashboard\main.py
