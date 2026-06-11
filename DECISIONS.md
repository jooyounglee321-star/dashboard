# 프로젝트 결정 기록

---
## 2025-01-16 — 고정 메모 UI를 위젯 외부 최상단에 배치

**결정:** 고정 메모(Pinned Notes) 기능을 위젯 드래그-드롭 레이아웃 시스템 외부에 배치하고, 헤더 아래 최상단에 항상 표시되도록 구현했다.

**이유:** 고정 메모는 사용자가 항상 접근할 수 있어야 하는 중요한 정보이므로 위젯 순서 변경의 영향을 받지 않아야 하며, 레이아웃 편집 모드에서도 위젯과 함께 드래그되지 않도록 하기 위함. UI 상단에 고정된 위치는 사용자 주의를 집중시킬 수 있다.

**대안:** 
- 고정 메모를 일반 위젯으로 취급하여 레이아웃 시스템 내에 포함 → 사용자가 순서 변경 시 고정 메모의 위치가 변할 수 있음
- 모달 또는 사이드바로 표시 → 상시 접근성 저하

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2025-01-16 — 고정 메모 접기/펼치기 상태를 localStorage에 저장

**결정:** 고정 메모 UI의 펼침/접힘 상태를 localStorage에 저장하여 페이지 새로고침 후에도 유지하도록 구현했다.

**이유:** 사용자가 설정한 UI 상태를 기억함으로써 UX 연속성을 제공할 수 있으며, 데이터베이스 추가 쿼리 없이 가볍게 상태를 유지할 수 있다.

**대안:**
- 서버 데이터베이스에 저장 → 추가 API 호출 및 DB 쿼리 증가, 복잡도 상승
- 세션 스토리지 사용 → 탭 닫기 시 상태 소실
- 상태 유지 미구현 → 매 방문 시 초기화, UX 저하

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2025-01-16 — PinnedMemoCard를 forwardRef로 변경하여 부모 컴포넌트의 직접 제어 가능하게 함

**결정:** PinnedMemoCard 컴포넌트를 forwardRef와 useImperativeHandle을 사용하여 리팩토링하고, 부모 컴포넌트에서 ref를 통해 `openAdd()` 메서드를 직접 호출할 수 있도록 변경했다.

**이유:** 부모 컴포넌트(IndexPage)에서 고정 메모 추가 폼을 프로그래매틱하게 열 수 있어야 하는데, 콜백 props 대신 ref 기반 imperative 호출이 더 직관적이고 제어 흐름이 명확하다. 또한 컴포넌트의 내부 상태 노출을 최소화할 수 있다.

**대안:**
- onOpenAdd 콜백 props 사용 → 상태 관리가 부모에 분산되고, props drilling 가능성
- 전역 상태 관리(Context/Redux) 사용 → 간단한 기능에 과도한 복잡도

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\PinnedMemoCard.jsx

---
## 2026-06-11 08:55 — 회원 목록 조회 엔드포인트에 역할 기반 접근 제어(RBAC) 추가

**결정:** GET /api/auth/users 엔드포인트에 관리자 권한 검증을 추가했다. FastAPI의 Depends 의존성 주입을 사용하여 get_current_user를 매개변수로 받고, 현재 사용자의 역할이 "admin"이 아니면 HTTP 403 Forbidden 예외를 발생시키도록 구현했다.

**이유:** 회원 목록은 민감한 정보이므로 관리자만 접근할 수 있어야 한다. FastAPI의 Depends 패턴은 프레임워크 네이티브이고, 코드 가독성이 좋으며, 다른 엔드포인트에서도 같은 패턴을 재사용할 수 있어 일관성이 높다.

**대안:**
- 데코레이터 패턴 (@require_admin) → 추가 코드 필요하지만 보일러플레이트 감소 가능
- 미들웨어 기반 인증 → 모든 엔드포인트에 일괄 적용되므로 선택적 권한 검증 어려움
- 개별 로직 → 각 엔드포인트마다 권한 검증 코드를 복제하여 유지보수 부담 증가

**파일:** C:\Users\Jason\Desktop\dashboard\routers\auth.py
