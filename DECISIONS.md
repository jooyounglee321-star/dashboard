# 프로젝트 결정 기록

---
## 2026-06-05 — 드래그 앤 드롭: @dnd-kit 채택
**결정:** 대시보드 레이아웃 편집에 `@dnd-kit/core` + `@dnd-kit/sortable`을 사용. 위젯 순서와 크기(S/M/L)를 `widget_config.layout.items` 배열로 저장.
**이유:** React 18 완전 호환, 접근성(ARIA) 기본 지원, 추가 의존성 최소(5개 패키지), 기존 코드 수정 없이 SortableCard 래퍼로 비침투적 통합 가능.
**대안:** react-beautiful-dnd (React 18 미지원·deprecated), react-dnd (저수준 API, 보일러플레이트 많음), 직접 구현 (터치·접근성 처리 복잡).
**파일:** `frontend/src/pages/index/LayoutEditor.jsx`, `frontend/src/pages/index/IndexPage.jsx`

---
## 2026-06-05 — 레이아웃 편집: @dnd-kit/sortable 선택 + LayoutEditor 독립 컴포넌트 + 12컬럼 그리드 전환
**결정:** 대시보드 레이아웃 편집 기능을 위해 (1) @dnd-kit/sortable을 선택하여 순서 변경, (2) 독립 `LayoutEditor.jsx` 컴포넌트로 분리, (3) 기존 3컬럼 고정 그리드에서 12컬럼 유연 그리드로 전환, (4) 카드 크기를 S/M/L(50%/75%/100%) 이산값으로 제한, (5) 레이아웃 상태를 `widget_config.layout.items`에 DB 저장(PUT /api/auth/widget-config).
**이유:** (1) @dnd-kit/sortable은 현대적 React DnD로 accessible하고 터치/포인터 이벤트 모두 지원, (2) LayoutEditor 독립화로 IndexPage 복잡도 감소 및 재사용성 향상, (3) 12컬럼 그리드는 CSS Grid `span` 값으로 다양한 크기 조합 가능(기존 3컬럼은 span 1/2/3만 가능), (4) S/M/L 이산값은 사용자 경험 단순화 및 레이아웃 일관성 보장, (5) DB 저장으로 다기기 동기화 및 지속성 확보.
**대안:** (1) Sortable.js — 구식이고 React 통합 미흡, (2) React Grid Layout — 라이브러리 무겁고 불필요한 기능 다수, (3) localStorage만 사용 — 다기기 미동기, (4) 레이아웃 상태를 별도 테이블 신설 — users.widget_config JSON 활용이 더 효율적.
**파일:** `frontend/src/pages/index/LayoutEditor.jsx`, `frontend/src/pages/index/IndexPage.jsx`, `frontend/src/pages/index/index.css`

---
## 2026-06-05 20:11 — 레이아웃 편집: @dnd-kit 기반 드래그앤드롭 + Draft 모드 패턴
**결정:** IndexPage에서 레이아웃 편집 기능을 구현하기 위해 @dnd-kit/core의 `PointerSensor`를 사용한 드래그앤드롭 기능을 도입하고, `editMode` 토글로 draft/production 상태를 전환하는 이원 상태 관리 패턴을 적용. 활성 레이아웃은 `editMode ? draftItems : layoutItems`로 선택.
**이유:** (1) @dnd-kit은 현대적 React DnD 라이브러리로 터치/포인터 이벤트를 모두 지원하고 접근성 높음, (2) PointerSensor는 8px 거리 제약으로 의도치 않은 드래그 방지, (3) Draft 모드는 사용자가 변경을 커밋하기 전까지 원본 상태 보존 — 취소 기능이 자연스러움.
**대안:** (1) Sortable.js, React Beautiful DnD — 레거시이거나 유지보수 중단, (2) Framer Motion DragControls — 복잡한 다중 요소 정렬에 부적합, (3) 마우스/터치 이벤트 직접 구현 — 크로스 플랫폼 호환성 문제, 접근성 미흡.
**파일:** `C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx`

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
## 2026-06-06 10:39 — 수입/지출 API 엔드포인트 분리 및 페이로드 스키마 차등화
**결정:** BudgetPage의 `addExpense()` 함수에서 수입과 지출 처리를 분기하여, 수입은 `POST /api/income`(category_code/subcategory_code 사용), 지출은 `POST /api/expense`(category_id/subcategory_id 사용)로 전송. 폼 리셋 시 수입 모드에서는 첫 번째 수입 카테고리 코드로 기본값 설정, 지출 모드에서는 빈 문자열로 초기화.

**이유:** 프론트엔드에서 수입과 지출의 카테고리 선택 UI가 이미 분리되어 있으므로(code 기반 vs ID 기반), 이를 API 레이어에 반영하여 서버 측 검증과 데이터 저장 로직의 명확한 책임 분리 가능. 수입 전용 `/api/income` 엔드포인트는 향후 수입 통계, 예산 기능 추가 시 독립적인 로직 구현을 용이하게 함. 사용자 경험상 수입 추가 후 자동으로 기본 카테고리가 선택되므로 반복 입력 시 편의성 증대.

**대안:**
- 단일 `/api/expense` 엔드포인트로 통합: 페이로드 필드가 혼재(category_id와 category_code 동시 포함), 서버 쪽 조건부 처리 복잡화
- 수입 전용 필드를 `/api/expense`에 추가: 엔드포인트 책임 비대화, 테스트 케이스 증가
- 클라이언트에서 수동으로 폼을 초기화: 사용자가 매번 수입 카테고리를 재선택해야 하므로 UX 저하

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\BudgetPage.jsx

---
## 2026-06-05 — 수입 라우터 분리 설계 (income.py)
**결정:** `routers/income.py`를 새로운 독립 FastAPI 라우터로 생성하여 `/income` prefix 하의 모든 수입 CRUD 엔드포인트와 카테고리 조회를 담당하도록 구성. `IncomeIn`/`IncomePatch` Pydantic 스키마, `_get_rate()`, `_resolve_category()` 등 수입 전용 유틸 함수를 모듈 내에 포함. `GET /income/categories`로 수입 카테고리 조회, `POST /income`, `PUT /income/{id}`, `DELETE /income/{id}` CRUD 작업, `GET /income/summary/monthly` 월별 합계 리포트 구현.

**이유:** 기존 `routers/expense.py`와 대칭적인 리소스 지향 REST API 구조를 확립. 수입과 지출을 개념적으로 독립된 엔티티로 취급하여 클라이언트 측에서 각 리소스에 대해 직관적으로 접근 가능. 공통 로직은 `Expense` 모델의 `type` 필드로 통합 관리하면서도, API 응답 구조와 필터링은 각 라우터에서 특화하여 복잡도 분산. 라우터 분리로 향후 수입/지출 특화 기능 추가 시 영향 범위 제한.

**대안:**
- 통합 라우터: `GET /transactions?type=expense|income` 단일 엔드포인트로 통합 관리 → 쿼리 파라미터 복잡화, 응답 스키마 다형성 처리 필요
- type 필드 기반 분기: 라우터 내에서 조건부 로직으로 지출/수입 처리 → 각 타입의 비즈니스 로직 증가로 인한 코드 복잡성
- 독립 테이블/모델: `Income` 모델 분리 생성 → 데이터베이스 정규화 증가, 통합 리포트 조인 복잡화 (이전 단계에서 이미 제외)

**파일:** C:\Users\Jason\Desktop\dashboard\routers\income.py

---
## 2026-06-05 — 프론트엔드 수입/지출 API 분리 구현
**결정:** `ExpenseCard.jsx`의 `addExpense()` 함수에서 수입과 지출을 구분하여 **서로 다른 API 엔드포인트**로 POST 전송. 수입 모드(`isIncome=true`)에서는 `/api/income`으로 `category_code`/`subcategory_code` 필드를 사용하고, 지출 모드에서는 `/api/expense`로 `category_id`/`subcategory_id` 필드를 사용. 폼 리셋 시 수입용 필드(`income_main_code`, `income_sub_code`)도 함께 초기화.

**이유:** 백엔드에서 이미 `/api/income`과 `/api/expense` 엔드포인트를 별도 라우터(`routers/income.py`, `routers/expense.py`)로 분리하여 구현했으므로, 프론트엔드도 각 엔드포인트의 요청 스키마에 맞춰 적절한 필드를 전송해야 함. 이를 통해 (1) 수입 카테고리는 데이터베이스 `code` 컬럼 기반으로 조회 가능, (2) API 호출 시 불필요한 필드 전송 제거, (3) 각 도메인의 유효성 검사 로직을 서버에서 효율적으로 처리.

**대안:**
- 통합 POST `/api/expense` 유지: 백엔드 라우터 분리 이점 미활용, 서버에서 `type` 필드로 다시 분기 필요 → 중복 로직
- 수입 필드를 지출과 동일하게 (category_id 사용): 가상 ID(`__primary__` 등) 또는 음수 값 사용 필요 → 데이터 의미성 손상
- 런타임 조건부로 필드 선택: 프론트엔드에서 동적 페이로드 구성 복잡화, 에러 추적 어려움

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2026-06-05 — 수입 토글 시 첫 번째 카테고리 자동 선설정
**결정:** `ExpForm` 컴포넌트의 `switchType()` 함수에서 타입을 'income'으로 전환할 때, `income_main_code`를 `INCOME_CATEGORIES[0]?.code ?? ''`로 자동 설정하여 첫 번째 수입 카테고리를 자동 선택. 지출('expense')로 전환 시에는 빈 문자열로 초기화.

**이유:** 수입 모드에서는 대분류 선택 시 `getSubcategories(income_main_code)` 함수가 즉시 소분류 목록을 반환하므로, 대분류가 선설정되면 소분류 드롭다운이 즉시 활성화됨. 이를 통해 사용자가 수입 모드로 전환 후 추가적인 대분류 선택 없이 바로 소분류를 선택할 수 있게 하여 UX 개선. 지출 모드에서는 기존 동작 유지 (수동 선택).

**대안:**
- 모든 모드에서 빈 상태로 유지: 수입 소분류 드롭다운 초기 비활성화 상태 지속, 한 단계 추가 선택 필요 → UX 저하
- 수동 선택 시까지 대기하고 소분류 활성화 연기: 기존 지출 모드 패턴 동일, 수입의 이분류 구조 활용 부족
- 팝업/모달로 카테고리 선택 강제: 추가 UI 복잡화, 수입 항목 추가 플로우 저해

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\ExpenseCard.jsx

---
## 2026-06-05 11:45 — 데스크톱 그리드 레이아웃에서 .card-expense를 전폭(3열) 스팬으로 설정
**결정:** 1024px 이상 데스크톱 뷰포트의 `@media(min-width:960px)` 미디어 쿼리에서 `.card-hero`와 `.card-stock`이 이미 `grid-column:span 3;`으로 설정되어 있는 CSS 규칙에 `.card-expense`를 추가하여, 지출 카드도 3열 그리드의 전폭을 차지하도록 구성.

**이유:** 지출 카드가 대시보드 상의 중요한 주요 정보 카드(.card-hero: 현재 시간/날씨, .card-stock: 주식 포트폴리오)와 동일한 시각적 계층을 차지하도록 하여 사용자 인식도 향상. 지출 카드의 내용 폭이 예산 바, 지출 목록, 수입/지출 세그먼트 토글 등으로 충분히 크므로, 반절 너비(1~2열)로 제약할 필요 없음. 반응형 레이아웃(태블릿 768~959px)에서 이미 `.card-expense{grid-column:span 2;}`로 설정되어 있으므로 데스크톱에서도 최대 너비 유지 필요.

**대안:**
- `.card-expense`를 2열만 차지하도록 유지: 카드의 가로 공간 제약, 예산 바 및 목록의 가독성 저하
- 별도 스타일링 규칙 추가 (.card-expense {grid-column:span 3;}): 미디어 쿼리 내 기존 규칙과 중복, CSS 유지보수 비효율
- 데스크톱 전용 별도 CSS 클래스: 반응형 설계 원칙 위반, HTML 마크업 추가 필요

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\index.css

---
## 2026-06-06 14:xx — 대시보드 드래그앤드롭 레이아웃 편집 구현 (@dnd-kit 라이브러리 선택)
**결정:** 대시보드 위젯 레이아웃 편집 기능을 구현하기 위해 `@dnd-kit/sortable`, `@dnd-kit/core`, `@dnd-kit/utilities` 라이브러리를 활용한 `LayoutEditor.jsx` 컴포넌트 생성. `DEFAULT_LAYOUT_ITEMS` 상수에 9개 위젯의 기본 레이아웃(hero, schedule, youtube, stock, expense, diet, memo, news, sites)을 정의하고, 각 위젯의 그리드 스팬(12: 100%, 6: 50%)을 지정. `SortableCard` 컴포넌트에서 `useSortable()` 훅을 사용하여 드래그앤드롭 기능 구현. 편집 모드 활성화 시 위젯 상단에 드래그 핸들(⠿) 및 S/M/L 크기 조절 버튼 오버레이 표시. 드래그 중 시각적 피드백(opacity 0.4, zIndex 50) 제공.

**이유:** (1) `@dnd-kit`은 React 18 호환성, TypeScript 지원, 모듈식 구조(core, sortable, utilities 분리)로 최신 프론트엔드 스택 부합. (2) 기존 패키지 (`react-beautiful-dnd`는 더 이상 유지보수 안 됨, `react-dnd`는 학습곡선 높음, HTML5 drag-and-drop API는 브라우저 호환성 제약)와 비교하여 성능과 유지보수성 우수. (3) 기본 레이아웃을 `DEFAULT_LAYOUT_ITEMS` 상수로 정의하면 서버 DB 조회 전 즉시 초기 렌더링 가능, `widget_config.layout` 필드가 없을 때 폴백 전략으로 활용. (4) `SortableCard`를 재사용 가능한 컴포넌트로 구성하여 향후 레이아웃 커스터마이징 기능(저장, 복원 등) 추가 용이.

**대안:**
- `react-beautiful-dnd`: 이전 프로젝트의 표준이나 현재 유지보수 중단, React 18 호환성 불완전
- `react-dnd`: 고도의 커스터마이징 가능하나 복잡한 API(Context, hooks, decorators), 학습 비용 높음
- HTML5 native drag-and-drop API: 크로스브라우저 일관성 낮음, 접근성 고려 필요, 커스터마이징 제한
- 서버 DB에서 레이아웃만 조회: 초기 렌더링 지연, 사용자 경험 저하

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\LayoutEditor.jsx

---
## 2026-06-06 — 저장된 레이아웃 복원: widgetCfg 기반 자동 복구 useEffect
**결정:** IndexPage에서 언어 변경 감지 useEffect 다음에 새로운 useEffect를 추가하여 `widgetCfg?.layout?.items`이 존재하고 배열이며 길이가 0보다 클 때 자동으로 `setLayoutItems(saved)`를 호출함으로써 서버에서 로드된 레이아웃을 클라이언트 상태에 복구.
**이유:** 사용자가 레이아웃 편집 후 저장한 결과가 `widget_config.layout.items` 필드에 서버에 저장되었을 때, 페이지를 새로고침하거나 재방문 시 자동으로 해당 레이아웃을 복원하기 위함. `widgetCfg` 의존성으로 API(`/api/auth/widget-config`)에서 설정을 로드할 때마다 적용되어 서버 저장 상태와 클라이언트 상태 동기화. 조건부 검사(`Array.isArray` & `length` 확인)로 서버에 명시적으로 저장된 레이아웃만 적용하고, 미저장 상태(빈 배열, null)에서는 `DEFAULT_LAYOUT_ITEMS` 폴백 유지.
**대안:**
- `localStorage`에 직접 저장/복구: 클라이언트 로컬 스토리지만 사용하면 다중 기기 동기화 불가, 서버 소실 시 복구 불가
- 컴포넌트 마운트 시 API 별도 호출: 중복된 API 요청 증가, 이미 `/api/auth/widget-config`로 로드된 설정 재활용 미흡
- 레이아웃 변경 시 즉시 서버에 저장 없이 draft 모드만 유지: 브라우저 종료/새로고침 시 편집 내용 손실, 저장 의도 불명확
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2026-06-06 15:xx — PC 레이아웃 렌더링 패턴: 정적 조건부 렌더링에서 동적 DndContext 기반으로 전환
**결정:** IndexPage의 `<main>` 요소 내 PC 레이아웃을 기존 9개 위젯의 정적 조건부 렌더링(예: `{w('hero') && <HeroSection ... />}`, `{w('schedule') && <ScheduleCard ... />}` 등)에서 동적 배열 기반 렌더링으로 완전 리팩토링. `visibleItems` 계산식 `activeItems.map(item => ({ ...item, el: renderWidget(item) })).filter(i => i.el !== null)`을 통해 현재 활성 레이아웃(`editMode ? draftItems : layoutItems`)에 포함된 항목만 필터링하고, `DndContext`→`SortableContext`→`visibleItems.map()`으로 각 위젯을 `SortableCard`로 래핑하여 렌더링.
**이유:** (1) 레이아웃이 고정 배열(`layoutItems`)이 되면, 사용자가 향후 드래그앤드롭으로 위젯 순서를 재정렬하거나 추가/제거할 수 있는 유연성 확보. (2) 정적 조건부 렌더링은 모든 위젯이 JSX에 하드코딩되어 있어 순서 변경 불가능하고, 보이지 않는 위젯도 DOM에 마운트되면서 성능 저하 가능. (3) 동적 렌더링으로 `visibleItems` 배열의 순서 변경이 곧 화면 순서 변경을 의미하므로, 레이아웃 재정렬 로직 구현 간단화. (4) 기존 `renderWidget(item)` 함수가 이미 `w()` 필터링을 수행하므로, 필터링 로직 중복 최소화.
**대안:**
- 정적 위젯 렌더링 유지: 드래그앤드롭 편집 기능을 JavaScript로 후처리하거나 CSS 재정렬 필요 → 복잡도 증가
- 모든 위젯을 항상 렌더링하고 CSS `display:none` 제어: 불필요한 DOM 유지, 성능 낭비
- 위젯별 독립 상태 관리: 각 위젯마다 순서 상태를 개별 관리 → 동기화 복잡도 증가
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2026-06-06 — CSS Grid 컬럼 아키텍처: 3열 → 12열로 마이그레이션
**결정:** PC 레이아웃의 CSS Grid 구조를 `grid-template-columns:repeat(3,1fr)`에서 `repeat(12,1fr)`로 변경하고, `.card-hero`의 스팬을 `span 3`에서 `span 12`로 업데이트. 동시에 레이아웃 편집 기능을 위한 28개 새로운 CSS 클래스를 추가:
- 편집 버튼: `.layout-edit-btn`
- 편집 툴바: `.layout-toolbar`, `.layout-toolbar-tip`, `.layout-toolbar-actions`, `.layout-btn-save`, `.layout-btn-cancel`
- 편집 중인 카드 표시: `.layout-editing-card`
- 드래그 오버레이: `.layout-edit-overlay`, `.layout-drag-handle` (grab 커서)
- 크기 버튼 (S/M/L): `.layout-size-btns`, `.layout-size-btn`, `.layout-size-btn.active`
**이유:** (1) 12열 그리드는 UI 컴포넌트 라이브러리(Bootstrap, TailwindCSS)의 사실상 표준으로, 향후 유지보수와 디자인 확장성 증대. (2) 3열 그리드에서는 각 카드가 고정 너비(1/3)여서 동적 크기 조절 불가능하나, 12열에서는 S(6열=50%), M(8열=67%), L(12열=100%) 같은 세분화된 크기 조절 가능. (3) 드래그 핸들, 오버레이, 크기 버튼 등의 편집 UI를 일관된 디자인 언어(색상: `--accent2`, 간격: 0.2rem~0.65rem, 반지름: 4~20px)로 구성하여 대시보드의 기존 스타일과 통일. (4) 편집 모드에서만 표시되는 CSS 클래스로 정적 마크업 변경 없이 JavaScrip으로 동적 토글 가능.
**대안:**
- CSS Grid 행(grid-template-rows)으로 크기 제어: 높이는 불변이므로 가로 크기 조절만 필요한 현 용도에 부적합
- Flexbox 기반 컬럼: 자식 요소의 flex-grow/flex-shrink로 동적 크기 가능하나, 여러 행에 걸쳐 배치할 때 복잡도 증가
- 하드코딩된 inline style: 동적 크기 토글 시마다 스타일 변경 필요, 유지보수 어려움
- CSS Variables로 스팬 값 동적 지정: JavaScript에서 `element.style.setProperty('--card-span', value)` 필요, 각 카드마다 변수 관리 필요
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\index.css

---
## 2026-06-06 — 반응형 미디어 쿼리 그리드 컬럼 업데이트: 태블릿 6컬럼, 데스크톱 12컬럼으로 정규화
**결정:** 기존 CSS 반응형 미디어 쿼리 구조를 리팩토링하여 태블릿(768px~959px) 구간의 `.main{grid-template-columns:repeat(2,1fr)}`를 `repeat(6,1fr)`로, 데스크톱(960px+) 구간의 `repeat(3,1fr)`를 `repeat(12,1fr)`로 변경. 동시에 태블릿 구간에서 `.layout-edit-btn`과 `.layout-toolbar` 숨김 규칙 추가하여 레이아웃 편집 버튼을 모바일/태블릿에서 비표시.
**이유:** (1) 12열 그리드는 Bootstrap/TailwindCSS 같은 현대적 UI 프레임워크의 표준으로, 향후 유지보수와 확장성 증대. (2) 기존 2열/3열 구조에서는 각 카드 너비가 고정되어 drag-and-drop으로 동적 크기 조절 불가능하나, 12열 시스템에서는 카드가 6칼럼(50%), 8칼럼(67%), 12칼럼(100%) 등 세분화된 크기 조절 가능. (3) 태블릿에서 6컬럼으로 설정하면 S(3칼럼), M(4칼럼) 크기 조절도 가능하면서도 레이아웃 편집 UI 복잡도를 줄이기 위해 명시적으로 편집 버튼/툴바 비표시. (4) 기존 고정 카드 스팬 규칙(`.card-hero span 2`, `.card-stock span 2` 등)을 제거하고 대신 마크업의 `style` 또는 `data-*` 속성으로 동적 스팬 값 제어 가능하도록 구조 단순화.
**대안:**
- 기존 2/3열 구조 유지: 카드 너비가 고정되어 사용자 맞춤 크기 조절 불가능, 레이아웃 편집 기능의 실질적 효과 미흡
- CSS Grid 행(row) 기반 높이 제어: 현 요구사항은 가로 크기 조절이므로 부적합, 불필요한 CSS 복잡화
- 각 해상도별 완전히 다른 컬럼 수 사용: 반응형 설계 원칙 위반, 미디어 쿼리 관리 복잡화
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\index.css
