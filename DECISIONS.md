# 프로젝트 결정 기록

---
## 2025-01-01 00:00 — RolePermission 테이블 추가로 RBAC 구현

**결정:** role별 권한 매핑을 위한 `RolePermission` 테이블을 SQLAlchemy 모델로 추가했습니다. role과 permission_name의 복합 유니크 제약을 사용하여 각 역할별 권한을 정규화된 형태로 저장합니다.

**이유:** 사용자의 role(admin|premium|free|guest)과 permission(superadmin_access|manage_users|manage_permissions|dashboard_full|dashboard_basic|dashboard_view_only|own_settings)을 분리하여 저장하면, 권한 정책 변경 시 User 테이블을 수정하지 않아도 되고, 권한 체계를 유연하게 확장할 수 있습니다. 정규화된 구조로 인해 권한 조회 성능도 최적화됩니다.

**대안:** (1) User 테이블에 JSON 컬럼으로 권한 저장 — 쿼리 필터링이 어렵고 확장성 낮음; (2) 권한을 코드에 하드코딩 — 배포 없이 권한 변경 불가; (3) 3정규화 User-Role-Permission 정규화 테이블 추가 — User별 role 할당이 별도 필요.

**파일:** C:\Users\Jason\Desktop\dashboard\models.py

---
## 2025-01-17 — FastAPI lifespan에서 DB 초기화 작업 수행
**결정:** 레거시 role 마이그레이션(`_migrate_user_roles`)과 기본 권한 시드(`_seed_default_permissions`)를 FastAPI의 `lifespan()` context manager에서 자동 실행하도록 구현했습니다.

**이유:** 애플리케이션 시작 시 필요한 데이터 상태를 자동으로 보장하면, 수동 마이그레이션 단계를 제거할 수 있고 배포 프로세스를 단순화합니다. 또한 권한 테이블이 비어 있으면 자동으로 기본값을 시드하므로, 초기 설정 후 즉시 RBAC가 작동합니다.

**대안:** (1) 별도 CLI 마이그레이션 명령어 — 배포 시 수동 실행 필요; (2) 관리자 대시보드 초기화 엔드포인트 — 수동으로 API 호출 필요; (3) Alembic 같은 외부 마이그레이션 도구 — 관리 오버헤드 증가.

**파일:** C:\Users\Jason\Desktop\dashboard\main.py

---
## 2026-05-21 13:51 — REST 엔드포인트 기반 역할 및 권한 관리 API 구현

**결정:** 사용자 역할(role) 업데이트와 권한(permission) 관리를 위해 3개의 REST 엔드포인트를 추가했습니다. `PUT /users/{user_id}/role`로 역할 변경, `GET /permissions`로 권한 목록 조회, `PUT /permissions`로 권한 일괄 수정을 지원합니다.

**이유:** RESTful 설계 원칙에 따라 역할과 권한을 분리된 엔드포인트로 관리하면, 관리 인터페이스(superadmin.html)에서 직관적으로 사용할 수 있고, 권한 정책을 런타임 중에 변경할 수 있습니다. 권한을 데이터베이스에 저장하면 코드 배포 없이 권한 체계를 유연하게 수정 가능합니다.

---
## 2026-05-21 — 권한 관리 UI: 권한 매트릭스 + 회원 레벨 배지 설계

**결정:** superadmin.html을 탭 구조로 개편하여 (1) 회원 목록 탭에 "레벨" 컬럼과 배지 표시, (2) 권한 관리 탭에 7개 권한 × 4개 레벨(admin/premium/free/guest) 토글 매트릭스를 추가했습니다.

**이유:** 권한 정책을 한 화면에서 직관적으로 관리할 수 있도록 매트릭스 UI를 선택했습니다. 각 셀의 토글로 role별 permission 할당을 시각적으로 제어하면, 관리자가 권한 정책의 전체 그림을 쉽게 파악하고 대량으로 수정할 수 있습니다. 회원 모달에 "레벨 변경" select 추가로 회원과 권한 관리를 통합했습니다.

**대안:** (1) 권한을 세로 목록(vertial list) 형태로 나열 — 비교가 어렵고 한눈에 권한 정책을 파악하기 어려움; (2) 개별 회원 상세페이지에서만 권한 수정 — 대량 정책 변경 불가; (3) 권한 정책을 JSON 에디터로 관리 — 비기술 관리자가 사용하기 어려움.

**파일:** C:\Users\Jason\Desktop\dashboard\static\superadmin.html

**대안:** (1) GraphQL mutation 방식 — 단순한 CRUD 작업에는 복잡도 증가; (2) WebSocket 기반 실시간 권한 동기화 — 초기 요구사항에는 과도함; (3) gRPC로 서비스 간 권한 공유 — 현재 단일 서비스 아키텍처에는 불필요.

**파일:** C:\Users\Jason\Desktop\dashboard\routers\admin.py
