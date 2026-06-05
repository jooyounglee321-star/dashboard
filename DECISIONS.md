# 프로젝트 결정 기록

---
## 2026-06-05 — 수입 카테고리: 별도 테이블 대신 expense_categories 확장 + code 컬럼 추가
**결정:** 수입 전용 테이블을 신설하지 않고 기존 `expense_categories` 테이블에 `code`(VARCHAR 30)와 `category_type`('income'|'expense') 컬럼을 추가하여 수입/지출 카테고리를 통합 관리. 수입 항목 저장은 기존 `expenses` 테이블의 `type='income'` 행 활용.
**이유:** (1) 카테고리 구조(대분류/소분류 계층)가 수입·지출 동일하므로 테이블 공유가 최적, (2) 이미 `expenses.type` 컬럼이 존재하여 별도 income 테이블 추가 없이 구현 가능, (3) `code` 컬럼으로 'REGULAR','SALARY' 등 문자열 코드 조회 지원 — API/프론트 간 ID 의존 제거.
**대안:** 별도 `income_categories` + `income_entries` 테이블 신설 → 테이블 중복, 마이그레이션 복잡도 증가로 제외.
**파일:** `models.py`, `main.py`, `routers/income.py`

---
## 2025 — 지출/수입 이원화 API 설계
**결정:** Expense 모델의 기존 `type` 필드를 활용하여 지출 목록 조회(GET /expense)에 선택적 `type` 쿼리 필터를 추가하고, 지출 생성(POST /expense)시 `type` 값을 명시적으로 할당하도록 구현.

**이유:** 단일 Expense 테이블로 지출과 수입을 모두 관리할 수 있으며, 기존 데이터베이스 스키마 변경 없이 API 레벨에서 필터링 기능을 제공할 수 있음. 지출과 수입을 별도 엔티티로 분리하지 않으면서도 양쪽 데이터를 통합 관리 가능.

**대안:**
- 별도의 Income 모델/테이블 생성: 스키마 복잡도 증가, 마이그레이션 필요
- 클라이언트 측 필터링: 전체 데이터를 로드해야 하므로 성능 저하
- type 필드 없이 음수 금액으로 수입 표현: API 응답에서 명확성 부족, 예산 통계 계산 복잡화

**파일:** C:\Users\Jason\Desktop\dashboard\routers\expense.py

---
## 2026-01-10 — Phase 2 `type` 컬럼 스키마 확장
**결정:** `expenses` 테이블에 `type` VARCHAR(10) 컬럼을 추가 (NOT NULL, DEFAULT 'expense')하여 지출/수입 구분을 저장하고, 서버 시작 시 자동 마이그레이션 함수 `_migrate_expense_type_column()`으로 기존 레코드를 초기화.

**이유:** 향후 수입 기능 (Phase 2)을 단일 테이블 구조로 지원하면서, 기존 지출 데이터를 보존하고 점진적 마이그레이션이 가능. VARCHAR enum 패턴은 향후 추가 타입 확장(이체, 수정 기록 등)에 유연함.

**대안:**
- 별도 `income` 테이블: 스키마 분리로 인한 조회 복잡화, 통합 리포트 어려움
- BOOLEAN `is_income` 컬럼: 향후 타입 확장 불가능, 의미 명확성 부족
- 데이터베이스 뷰/트리거로 처리: 마이그레이션 과정 불명확, 유지보수 비용 증가

**파일:** C:\Users\Jason\Desktop\dashboard\DB_SCHEMA.md

---
## 2026-06-05 — 수입(Income) 기능 Phase 2 백엔드 구현
**결정:** `Expense.type` 컬럼을 활용하여 `ExpenseIn`/`ExpensePatch` 스키마에 `type` 필드(기본값 `'expense'`)를 추가하고, 목록 조회 API에 `?type=expense|income` 쿼리 필터를 구현. 서버 시작 시 `_migrate_expense_type_column()` 함수로 기존 테이블에 자동 컬럼 추가.

**이유:** 데이터베이스와 API 레이어가 분리되어 있으므로, 기존 지출 데이터를 보존하면서도 새로운 수입 기능을 점진적으로 추가 가능. 자동 마이그레이션은 Railway 배포 환경에서도 수동 개입 없이 작동하도록 함. 응답 스키마에 `type` 포함으로 클라이언트가 지출/수입을 명확히 구분 가능.

**대안:**
- 클라이언트에서만 구분 (API 응답에 `type` 미포함): 백엔드에서 저장하지 않아 데이터 일관성 보장 불가
- 수동 DB 마이그레이션 스크립트: 배포 시마다 관리 필요, Railway 자동 배포와 충돌 가능
- 별도 쿼리 파라미터 이름 (예: `category=income`): 기존 카테고리 필터와 혼동 가능

**파일:** C:\Users\Jason\Desktop\dashboard\routers\expense.py, C:\Users\Jason\Desktop\dashboard\models.py, C:\Users\Jason\Desktop\dashboard\main.py

---
## 2025-01-15 — 수입 카테고리 임시 프론트엔드 가상 목록 전략
**결정:** ExpenseCard 컴포넌트 초기화 폼에 `type: 'expense'` 필드를 추가하고, 데이터베이스 카테고리 로드 전 단계에서 사용할 수입 전용 가상 카테고리를 `INCOME_CATS` 상수로 하드코딩 (ID: `__primary__`, `__secondary__`, `__other__`).

**이유:** 데이터베이스에서 카테고리를 모두 로드할 때까지 프론트엔드에서 수입 폼을 사용 가능하게 하기 위한 임시 방안. 별도의 API 요청 추가 없이 클라이언트 측에서만 처리 가능하며, 특수 ID 프리픽스(`__`)로 가상 카테고리를 실제 DB 카테고리와 명확히 구분.

**대안:**
- 수입 카테고리 API 엔드포인트 추가: 추가 서버 요청 증가, 로딩 시간 증가
- DB 카테고리 전부 로드 후 폼 활성화: 초기 렌더링 지연, UX 악화
- 하드코딩하지 않고 설정 파일에서 로드: 복잡도 증가, 클라이언트 배포 시 동기화 필요

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2025-01-15 — 수입/지출 폼 UI 토글 방식 (세그먼트 버튼)
**결정:** ExpForm 컴포넌트에서 수입/지출 전환을 위한 UI를 세그먼트 토글 버튼 패턴(💸 지출, 💰 수입)으로 구현하고, 타입 전환 시 카테고리 초기화. 소분류 선택 필드는 수입 모드에서 조건부로 숨김.
**이유:** 수입/지출 모드 전환이 빈번한 사용자 작업이므로 즉시 인식 가능한 세그먼트 버튼이 UX에 적합. 각 모드의 카테고리 구조가 다르므로 (지출: 이분류 체계, 수입: 단일 레벨) 동적으로 필드를 표시/숨김으로써 UI 혼동 방지. 타입 전환 시 자동으로 카테고리를 초기화하여 사용자가 이전 모드의 선택을 유지하는 실수 방지.
**대안:**
- 드롭다운/셀렉트 컨트롤: 발견성 낮음, 클릭 깊이 증가
- 별도 폼 페이지 분리: 컨텍스트 전환 비용, UX 복잡화
- 모드별 완전 격리된 컴포넌트: 중복 코드 증가, 유지보수 어려움
- 금액 부호(음수/양수)로 구분: 직관성 부족, 입력 검증 복잡화
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2026-06-04 — 수입 카테고리 가상 ID를 설명(description) 필드에 인코딩
**결정:** `addExpense()` 함수에서 수입 모드 전송 시, 가상 수입 카테고리 ID를 데이터베이스에 저장하지 않고, 선택한 카테고리의 이름을 추출하여 `description` 필드에 포함시킨 후 `category_id/subcategory_id`는 null로 전송. 동시에 API 페이로드에 `type` 필드를 명시적으로 추가.

**이유:** 데이터베이스 카테고리 테이블에 수입 카테고리를 추가하지 않으면서도 사용자가 수입 종류를 추적할 수 있음. 프론트엔드 가상 카테고리(`__primary__`, `__secondary__`, `__other__`)는 클라이언트 렌더링 전용이므로, 이를 DB에 저장할 필요가 없음. 카테고리명을 설명에 포함하면 기존 expense 테이블 스키마 변경 없이 데이터 손실 방지.

**대안:**
- 수입 카테고리를 DB categories 테이블에 추가: 스키마 복잡화, 기존 쿼리 필터 로직 변경 필요
- 수입 시 category_id에 특수 음수 값 저장: 데이터 의미성 부족, 외래키 제약 위반
- 별도 income_category 테이블 생성: 테이블 분리로 통합 리포트 쿼리 복잡화

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2025-01-16 — ExpenseCategory 모델에 category_type과 code 필드 추가
**결정:** `ExpenseCategory` 모델에 `category_type: Mapped[str]` (NOT NULL, DEFAULT 'expense') 필드와 `code: Mapped[str | None]` (인덱싱, nullable) 필드를 추가하여 카테고리 레벨에서 지출/수입 구분과 프로그래매틱 카테고리 코드를 저장.

**이유:** 기존 Expense 테이블의 `type` 필드와 별개로, 카테고리 자체에도 타입 정보를 저장함으로써 카테고리 조회 시 필터링 효율성 증대. `code` 필드는 'REGULAR', 'SALARY' 등 사람이 읽을 수 있는 카테고리 코드로 API 응답과 UI에서 직접 사용 가능. 인덱싱으로 코드 기반 조회 성능 최적화.

**대안:**
- Expense의 type 필드만 사용: 카테고리 조회 후 개별 expense 조회 필요, 쿼리 조인 복잡화
- 프론트엔드에서만 코드 관리: 백엔드 API 응답에서 카테고리 코드 직접 제공 불가, 매핑 로직 분산
- 별도 카테고리 타입 테이블 생성: 스키마 정규화 강화되지만 단순 lookup 조회에 오버헤드

**파일:** C:\Users\Jason\Desktop\dashboard\models.py

---
## 2026-06-05 — 수입 카테고리 마이그레이션 및 시드 구현
**결정:** `main.py`의 `lifespan()` 함수 내에서 실행되는 `_migrate_add_category_code_fields()` 함수로 `expense_categories` 테이블에 `code`(VARCHAR 30)와 `category_type`(VARCHAR 10, DEFAULT 'expense') 컬럼을 추가. 동시에 `_DEFAULT_INCOME_CATEGORIES` 상수로 4개 주분류 × 13개 소분류 수입 카테고리를 정의하고, `_seed_income_categories()` 함수로 기존 지출 카테고리 시드 패턴을 따라 데이터베이스에 삽입. 이미 수입 카테고리가 존재하면 자동으로 스킵.

**이유:** 서버 시작 시 자동 마이그레이션으로 Railway 배포 환경에서 수동 DB 스크립트 실행 불필요. `category_type='income'` 필터로 향후 카테고리 조회 쿼리 최적화 가능. `code` 필드(REGULAR, SALARY, BONUS 등)를 통해 카테고리를 프로그래매틱하게 참조 가능하며, API 응답과 프론트엔드에서 고정된 카테고리 매핑 가능. 기존 지출 카테고리와 동일한 구조(parent-subcategory 계층, `is_default=True` 플래그, `user_id=NULL`)를 유지하여 통합 쿼리 및 UI 렌더링 로직 재사용.

**대안:**
- 마이그레이션 스크립트 분리: 배포 과정 복잡화, 누락 위험
- 프론트엔드에서만 수입 카테고리 정의: API 응답에 카테고리 코드 미포함, 클라이언트 하드코딩 필요
- 별도 `income_category` 테이블: 조인 쿼리 복잡화, 통합 리포트 어려움
- 수입/지출 카테고리를 동일하게 관리 (분류 구조 혼합): 각 타입의 고유한 계층 구조 표현 불가

**파일:** C:\Users\Jason\Desktop\dashboard\main.py

---
## 2026-06-05 — 수입 라우터 분리 설계 (income.py)
**결정:** `routers/income.py`를 새로운 독립 FastAPI 라우터로 생성하여 `/income` prefix 하의 모든 수입 CRUD 엔드포인트와 카테고리 조회를 담당하도록 구성. `IncomeIn`/`IncomePatch` Pydantic 스키마, `_get_rate()`, `_resolve_category()` 등 수입 전용 유틸 함수를 모듈 내에 포함. `GET /income/categories`로 수입 카테고리 조회, `POST /income`, `PUT /income/{id}`, `DELETE /income/{id}` CRUD 작업, `GET /income/summary/monthly` 월별 합계 리포트 구현.

**이유:** 기존 `routers/expense.py`와 대칭적인 리소스 지향 REST API 구조를 확립. 수입과 지출을 개념적으로 독립된 엔티티로 취급하여 클라이언트 측에서 각 리소스에 대해 직관적으로 접근 가능. 공통 로직은 `Expense` 모델의 `type` 필드로 통합 관리하면서도, API 응답 구조와 필터링은 각 라우터에서 특화하여 복잡도 분산. 라우터 분리로 향후 수입/지출 특화 기능 추가 시 영향 범위 제한.

**대안:**
- 통합 라우터: `GET /transactions?type=expense|income` 단일 엔드포인트로 통합 관리 → 쿼리 파라미터 복잡화, 응답 스키마 다형성 처리 필요
- type 필드 기반 분기: 라우터 내에서 조건부 로직으로 지출/수입 처리 → 각 타입의 비즈니스 로직 증가로 인한 코드 복잡성
- 독립 테이블/모델: `Income` 모델 분리 생성 → 데이터베이스 정규화 증가, 통합 리포트 조인 복잡화 (이전 단계에서 이미 제외)

**파일:** C:\Users\Jason\Desktop\dashboard\routers\income.py
