# 프로젝트 결정 기록

---
## 2026-06-11 22:23 — PinnedMemoCard: 중앙 집중식 상태에서 컴포넌트 로컬 상태로 전환

**결정:** 접힘 상태(collapsed) 관리를 부모 컴포넌트의 중앙 집중식 객체 `{ [id]: bool }` 에서 각 `MemoCardItem` 컴포넌트의 독립적인 로컬 상태로 변경

**이유:** 각 카드가 독립적으로 상태를 소유함으로써 (1) 부모 컴포넌트 복잡도 감소, (2) 카드 간 상태 간섭 제거, (3) 재사용 가능한 MemoCardItem 컴포넌트 추출, (4) 로컬스토리지 동기화 로직 단순화 가능

**대안:**
- 부모 중앙 관리 (기존): 부모에서 모든 카드 상태 객체 관리 → 복잡성 증가, 부모 리렌더링 시 모든 자식 영향
- 글로벌 Context 사용: 불필요한 오버헤드, 이 기능은 지역적 범위
- 선택한 방식: MemoCardItem 컴포넌트 추출 + 로컬 state → 응집도 높음, 확장성 좋음

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\PinnedMemoCard.jsx

---
## 2026-06-11 — PinnedMemoCard 접기 구현: 조건부 렌더링 vs CSS max-height 트랜지션

**결정:** 접힌 카드 처리를 `{!isCollapsed && ...}` 조건부 JSX 렌더링에서 CSS `max-height: 0` 트랜지션 + 클래스 기반 방식으로 전환

**이유:** 조건부 렌더링은 DOM 노드를 완전히 제거하므로 애니메이션 없이 즉시 접혀서 사용자 경험이 떨어짐. CSS max-height 트랜지션은 평탄한 내용 높이에서 0으로 축소되면서 자연스러운 닫힘 애니메이션을 제공하며, 포스트잇 UI에 어울림.

**대안:**
- 기존 방식: 조건부 렌더링 `{!isCollapsed && ...}` → 애니메이션 없음, DOM 재생성 오버헤드
- clip-path/opacity: 높이 변화가 없어 레이아웃 이동이 자연스럽지 않음
- 선택한 방식: CSS max-height transition (0 → auto) → 매끄러운 높이 변화, 성능 효율적

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\PinnedMemoCard.jsx

---
## 2025-01-20 — Todo 모델에 start_date 컬럼 추가

**결정:** Todo 테이블의 단순 마감일(due_date만) 구조에서 start_date를 추가하여 날짜 범위 기반 표시 체계로 전환

**이유:** 할 일이 특정 기간 동안만 표시되어야 하는 경우(예: 프로젝트 기간, 이벤트 기간)가 있으므로, start_date~due_date 범위 내에서만 할 일을 표시하는 것이 더 유연한 사용 경험을 제공함

**대안:**
- JSON 컬럼에 start_date 저장 (복잡성 증가, 쿼리 어려움)
- 별도 TodoSchedule 테이블 생성 (정규화되지만 조인 오버헤드 증가)
- 선택한 방식: 기존 Todo 테이블에 컬럼 추가 (간단하고 효율적)

**파일:** C:\Users\Jason\Desktop\dashboard\models.py

**Null 의미론:**
- start_date = NULL: 생성일(created_at)을 기준으로 표시
- due_date = NULL: 영구 표시 (종료 없음)

---
## 2026-06-13 — 디버그 모드 토글: 환경변수 기반에서 localStorage 기반으로 전환

**결정:** DebugPanel의 활성화 여부를 빌드타임 환경변수 `import.meta.env.VITE_DEBUG_MODE`에서 런타임 localStorage `dashboard_debug_mode`로 변경하고, SuperadminPage에서 토글 가능하도록 구현

**이유:** 환경변수 방식은 빌드 후 토글이 불가능하여 Railway 재배포가 필수이고 개발 효율이 낮음. localStorage 기반은 슈퍼어드민이 런타임에 즉시 디버그 모드를 on/off할 수 있으며, 재배포 없이 동작하므로 빠른 피드백과 유연한 운영이 가능. 커스텀 이벤트 `dashboard_debug_toggle`로 같은 탭 내 App.jsx가 즉시 상태를 감지하고, `storage` 이벤트로 다른 탭의 변경도 자동 동기화됨.

**대안:**
- 환경변수 기반 (기존): 빌드타임에 고정, 런타임 변경 불가 → Railway 재배포 필요, 개발 느림
- 서버 API 플래그: 토글할 수 있지만 API 왕복 오버헤드 증가, localStorage가 더 빠름
- 선택한 방식: localStorage + 커스텀 이벤트 → 즉각적, 재배포 불필요, 다중 탭 동기화 자동

**파일:** 
- C:\Users\Jason\Desktop\dashboard\frontend\src\pages\SuperadminPage.jsx (토글 UI)
- C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx (상태 감지)
- C:\Users\Jason\Desktop\dashboard\frontend\src\DebugPanel.jsx (로컬스토리지 체크)

---
## 2026-06-14 — CalendarView 달력 "오늘" 표시: 클라이언트 로컬 시간 vs 고정 KST

**결정:** CalendarView 컴포넌트에서 "오늘" 날짜 계산을 `new Date().toISOString().slice(0, 10)`(클라이언트 로컬 시간)에서 UTC+9 고정(한국 표준시)으로 변경

**이유:** 사용자가 다양한 시간대에 있을 때 달력 UI에서 "오늘" 표시가 서버의 데이터 기준(KST)과 일치하도록 하기 위함. 식단 데이터가 KST 기반으로 저장되므로, 클라이언트 시간대와 상관없이 동일한 "오늘"을 표시하여 사용자 혼동 방지

**대안:**
- 클라이언트 로컬 시간대 사용 (기존): 사용자 기기 시간 기준 → 서버 데이터와 시간대 불일치 가능
- 서버에서 시간대 정보 함께 전송: 추가 API 호출, 복잡도 증가
- 선택한 방식: 클라이언트에서 UTC+9로 수동 계산 → 간단하고 빠르며, KST 데이터와 일관성 유지

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\DietStatsPage.jsx

---
## 2026-06-14 — Todo 모델에 todo_type 컬럼 추가: 반복/일회성 구분

**결정:** Todo 테이블에 `todo_type` 컬럼(String, 기본값 "repeat")을 추가하여 할 일을 '반복(repeat)' 또는 '일회성(once)' 두 가지 유형으로 구분

**이유:** 반복되는 할 일(매일, 매주 청소)과 일회성 할 일(프로젝트 완료, 서류 제출)의 동작 방식이 다르므로, 모델 레벨에서 이를 명시적으로 구분하면 (1) 클라이언트 UI에서 타입별 렌더링 로직 단순화, (2) 백엔드 비즈니스 로직에서 반복 처리/완료 처리 규칙 적용 용이, (3) 향후 반복 일정(cron) 자동화 구현 시 확장성 확보

**대안:**
- is_repeating 불린 컬럼: 이진 구조로 충분할 수 있지만, 향후 '월간', '분기별' 등 추가 타입 필요 시 확장성 부족
- 별도 TodoType 테이블 + FK: 정규화되지만 조인 오버헤드 증가, 기본값 처리 복잡
- JSON 필드에 metadata 저장: 쿼리 어려움, 타입 검증 약함
- 선택한 방식: 문자열 enum 컬럼 → 간단하고 확장 가능하며, 쿼리와 인덱싱 용이

**파일:** C:\Users\Jason\Desktop\dashboard\models.py

---
## 2026-06-14 — TodoList UI: 일회성(once) 할 일의 즉시 제거 vs 보이기
**결정:** TodoList 컴포넌트에서 toggleCheck() 시 'once' 타입 할 일이 완료되면 즉시 목록에서 제거하는 방식으로 구현. 반복(repeat) 타입은 기존대로 체크 표시만 유지

**이유:** 일회성 할 일은 한 번 완료되면 더 이상 사용자가 볼 필요가 없으므로 UI에서 즉시 제거함으로써 (1) 시각적 피드백이 명확함 (완료 후 사라짐), (2) 목록 클러터 감소, (3) 반복 할 일(매일 해야 하는 것)과 일회성(한 번만 하면 됨)의 차별화된 UX 제공

**대안:**
- 'once' 타입도 반복(repeat)처럼 체크 표시만 유지: 시각적 피드백이 약함, 목록이 완료된 항목으로 복잡해짐
- 서버에서 자동 삭제: 클라이언트 상태 관리 복잡도 증가, 동기화 이슈 발생 가능
- 선택한 방식: 클라이언트에서 즉시 제거 → 빠른 피드백, 상태 관리 간단, 사용자 의도 명확

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\TodoList.jsx

---
## 2026-06-14 — 포트폴리오 백필: 영값(0원) 스냅샷 재계산 대상 처리

**결정:** `backfill_portfolio_snapshots()` 함수의 "이미 존재하는 날짜" 쿼리에 `total_krw_equiv > 0` 필터링 조건을 추가. 이전에는 `snapshot_date`만 조회했으나, 이제는 `total_krw_equiv` 필드를 함께 조회하여 영값 스냅샷을 "존재하지 않음"으로 취급하고 재계산 대상에 포함

**이유:** 포트폴리오 평가액이 0원인 날짜는 불완전한 데이터일 가능성이 높으므로(예: 환율 조회 실패, 시세 데이터 부재), 이를 "스킵 대상"이 아닌 "재계산 필요"로 취급하면 데이터 품질 문제를 자동으로 복구할 수 있음. 특히 환율(`usd_krw`) 없이 USD 자산만 있는 경우 `total_krw_equiv`이 None이 되므로, 이를 명시적으로 필터링하여 백필 시 재조회하도록 강제

**대안:**
- 영값 스냅샷도 기존 것으로 간주: 불완전한 데이터가 그대로 유지되어 차트에 공백 또는 오류 표시 가능
- 데이터 삭제 후 재계산: 기존 기록을 제거하는 것이 부담스럽고, 사용자가 저장한 데이터 손실 우려
- 선택한 방식: 필터링을 통해 자동 재계산 → 데이터 무결성 보장, 기존 기록 보존, 점진적 복구

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-01-XX — 포트폴리오 백필: 카테고리별 사용자 그룹명 맵핑 구조 도입

**결정:** `backfill_portfolio_snapshots()` 함수에 `cat_to_user_name` 사전을 추가하여 category → user's group name 맵핑을 구축. 동일 카테고리에 여러 그룹이 있을 경우 첫 번째 그룹명을 우선 사용

**이유:** 백필된 스냅샷 데이터 JSON에 사용자가 정의한 그룹명(예: "My US Stocks", "한국 주식")을 보존하기 위한 인프라. 내부 category 코드("us", "kor-stock")만으로는 사용자 의도가 명확하지 않으므로, 원본 그룹명을 메타데이터로 저장하면 향후 스냅샷 UI 렌더링 시 사용자 친화적인 그룹명 표시 가능. 또한 복수 그룹이 같은 카테고리에 속할 경우(예: 같은 "us" 카테고리의 "Robinhood"와 "Interactive Brokers") 첫 번째를 선택함으로써 일관성 유지

**대안:**
- category 코드만 사용: 간단하지만 UI에서 사용자 그룹명을 재조회해야 하고, 그룹명 변경 시 과거 스냅샷과 일관성 문제 발생
- 각 category별로 모든 그룹명 목록 저장: 데이터 구조가 복잡해지고, 스냅샷 JSON 크기 증가
- 선택한 방식: category-to-user_name 단순 매핑 → 최소 메타데이터로 역사적 일관성 확보, 백필 시 정확한 그룹명 보존

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-01-XX — 포트폴리오 백필: 그룹명 결정 우선순위 변경 (사용자명 우선)

**결정:** `backfill_portfolio_snapshots()` 함수의 그룹명 결정 로직을 변경. 스냅샷 저장 시 `grp_name`을 `_CAT_META[category][0]` (하드코딩된 기본명)에서 `cat_to_user_name.get(category, meta[0])` (사용자 정의명 우선 사용)로 변경하여, 사용자가 정의한 그룹명을 스냅샷 JSON에 반영

**이유:** portfolio_groups에 저장된 사용자 실제 그룹명(예: "내 미국 주식", "한국 주식")을 백필 스냅샷에도 반영함으로써 (1) 그룹명 변경 후 백필 데이터와의 일관성 유지, (2) 차트/히스토리 UI에서 사용자 정의 그룹명으로 표시 가능 (하드코딩된 "KOR Stock" 대신 "내 한국 포트폴리오"), (3) 사용자 친화적인 스냅샷 데이터 저장

**대안:**
- 항상 하드코딩된 기본명 사용 (기존): 간단하지만, 그룹명 사용자 정의 기능이 백필 데이터에는 반영되지 않음 → UI 불일치
- 그룹명 변경 시 과거 스냅샷 모두 업데이트: 비용 많이 듦, 복잡한 마이그레이션 필요
- 선택한 방식: 백필 시점에 현재 cat_to_user_name 맵 적용 → 간단하고 효율적, 향후 백필은 최신 사용자명 반영

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-14 — StockStatsOverlay 히스토리 차트: 그룹명 불일치 시 currency 폴백

**결정:** 히스토리 라인차트의 `getValue()` 함수에서 그룹 매칭 로직을 2단계로 구현. 1단계는 정확한 그룹명 매칭(대소문자 무시), 2단계는 그룹명이 없을 때 같은 currency로 폴백 검색.

**이유:** 구형 backfill 스냅샷 데이터는 그룹명이 현재 사용자 정의명과 맞지 않을 수 있음. (예: 과거 "US Stock"이 지금 "내 미국 주식"으로 이름 변경됨) 정확한 이름 매칭만 하면 차트에 공백이 생기므로, currency를 안정적인 그룹 식별자로 사용하여 과거 데이터도 복구 가능하게 설계. 이는 그룹 이름 변경 후에도 히스토리 차트 연속성을 보장.

**대안:**
- 정확한 그룹명 매칭만 사용 (기존): 구형 스냅샷은 차트에 표시 안 됨, 역사 데이터 손실
- 과거 스냅샷의 그룹명을 모두 현재명으로 마이그레이션: 데이터 수정 비용 높음, 기존 기록 변경 우려
- 선택한 방식: 2단계 폴백 (정확명 → currency) → 비용 없이 호환성 확보, 모든 구형 데이터 활용 가능, 그룹명 변경에 강건

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx

---
## 2026-06-15 — 포트폴리오 백필: 스냅샷 데이터 구조 단순화 (상세 → 집계)

**결정:** `backfill_portfolio_snapshots()` 함수의 스냅샷 저장 형식을 변경. 기존의 카테고리(`category`)별로 개별 종목별 상세 정보(`"stocks": [{ticker, name, current_price, hold_qty, eval_amount, avg_buy_price, eval_pl, realized_pl}]`)를 저장하던 방식에서, 그룹ID(`group_id`)별로 집계 총액만 저장(`"total"`)하는 방식으로 전환. 동시에 `eval_pl`(미실현손익) 계산도 제거됨.

**이유:** (1) 스냅샷 JSON 데이터 크기 대폭 감소 → DB 저장소 효율화, (2) 그룹명 변경 시 개별 종목명 동기화 문제 제거, (3) 백필 목적(집계 평가액 기록)에 충실하면서 불필요한 상세 정보 제거. 단, 이는 스냅샷의 역사적 용도를 "시계열 차트용 집계값"으로 명시화함을 의미함.

**대안:**
- 기존 방식 유지 (상세 정보 모두 저장): 종목별 이력 추적 가능하지만 DB 크기 증가, 그룹명/종목명 변경 시 일관성 유지 어려움, 스냅샷 JSON 구조 복잡
- 별도 SnapshotDetail 테이블 정규화: 조인 오버헤드 증가, 쿼리 복잡도 증가
- 선택한 방식: 스냅샷은 순수 집계 데이터만 저장 → 경량화, 일관성 유지, 차트 렌더링 성능 향상

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-15 — 포트폴리오 백필: 스냅샷 JSON 구조 변경 (배열 → 객체 + 별도 그룹명 맵)

**결정:** `backfill_portfolio_snapshots()` 함수에서 스냅샷 JSON 저장 형식을 변경. 기존의 단순 리스트 구조(`[{name, currency, total}, ...]`)에서 그룹ID 기반 객체 구조로 전환:
```python
# 기존
{"groups": [{name, currency, total}, ...]}  # → list

# 변경
{
  "groups":      {gid: {total, currency}, ...},
  "group_names": {gid: name, ...}
}
```

**이유:** (1) 그룹ID를 직접 키로 사용함으로써 프런트엔드에서 그룹별 조회 O(1) 성능 달성, (2) 그룹명을 별도 맵으로 분리하면 그룹명 변경 시 메타데이터만 업데이트 가능 (집계값은 영향 없음), (3) 그룹명과 집계값의 관심사 분리로 향후 그룹 관리 로직 단순화

**대안:**
- 기존 배열 구조 유지: 간단하지만 프런트엔드에서 배열 순회로 O(n) 조회 필요, 그룹명과 총액이 혼재하여 변경 관리 어려움
- 정규화된 SnapshotGroup 테이블 생성: 일관성 높지만 조인 오버헤드 증가, 마이그레이션 복잡
- 선택한 방식: 단일 JSON 컬럼 내에서 객체 구조 + 별도 맵 → 성능과 유지보수성 균형, 기존 단일 행 UPSERT 구조 유지

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-15 — 포트폴리오 그룹명 변경: 스냅샷 동기화 전략 (동기식 캐스케이드)

**결정:** `save_groups()` 엔드포인트에 그룹명 변경 감지 및 스냅샷 cascade 로직을 추가. 사용자가 그룹명을 변경하면 (1) 변경된 group_id → new_name 맵을 구성, (2) 해당 사용자의 모든 `DailyPortfolioSnapshot` 레코드를 조회하여 (3) 각 스냅샷의 `data.group_names` 필드를 일괄 업데이트하는 방식으로 구현.

**이유:** 그룹명이 변경되면 과거 스냅샷(히스토리 차트)에 스냅샷을 생성할 당시의 그룹명이 남아있어 현재 그룹명과 불일치하는 데이터 일관성 문제 발생 가능. 동기식 cascade(write 시점에 즉시 업데이트)를 선택하면 (1) 데이터 일관성 보장, (2) 읽기 시점에 추가 변환 로직 불필요, (3) 그룹명 변경 직후 모든 차트/히스토리 UI가 즉시 최신 그룹명 반영. 또한 JSON 컬럼이므로 정규화 없이 동일 트랜잭션 내에서 처리 가능.

**대안:**
- 레이지(lazy) 동기화 — 읽기 시점에 그룹명 매칭/변환: 구현은 간단하지만, 쿼리마다 변환 로직 필요, 일관성 보장 약함, 성능상 읽기 오버헤드 증가
- 스냅샷 그룹명 유지 (동기화 안 함): 과거 데이터 불변성 확보 가능하지만, 현재 그룹명과 역사 데이터 시각적 불일치 (사용자 혼동 가능), currency 폴백에 의존해야 함
- 이벤트 기반 비동기 처리 (MQ/Celery): 분산 시스템에서는 유용하지만 현 규모에서 불필요한 복잡도 증가
- 선택한 방식: 동기식 cascade (write 트랜잭션 내) → 즉시 일관성, 구현 간단, 현 규모에 최적

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-15 — StockStatsOverlay 히스토리 차트: 스냅샷 JSON 구조 단순화 (배열 → 객체 기반 조회)

**결정:** 히스토리 라인차트의 `getValue()` 함수를 수정하여 스냅샷 JSON 파싱 방식을 변경. 기존에는 `r.data`를 배열(`[]`)로 파싱하고 2단계 폴백 로직(정확명 → currency)으로 그룹을 찾았으나, 이제는 `r.data`를 객체로 파싱하고 `parsed.groups[histGroupFilter]`로 단일 O(1) 조회 방식으로 전환. 동시에 구형 스냅샷 폴백 로직(`selectedGrpCurrency`)을 제거.

**이유:** (1) 스냅샷 JSON 구조가 배열 기반에서 객체(dictionary) 기반으로 변경되었으므로(결정 ID: "2026-06-15 — 포트폴리오 백필: 스냅샷 JSON 구조 변경"), 프런트엔드도 이를 따라야 함. (2) 객체 기반 조회(`groups[groupId]`)는 배열 순회(`.find()`)보다 성능이 우수하고 코드가 명확함. (3) 그룹ID → 그룹명 맵이 별도 필드로 분리되므로 이전의 currency 폴백 로직이 불필요해짐.

**대안:**
- 기존 배열 파싱 + 2단계 폴백 유지: 스냅샷 구조 변경과 프런트엔드 로직이 불일치하여 미래 데이터(객체 구조)는 제대로 읽히지 않음
- 양쪽 형식 모두 지원하는 호환성 계층 추가: 복잡도 증가, 장기적으로 유지보수 어려움
- 선택한 방식: 새 구조에 맞춘 단순한 O(1) 조회 → 성능 향상, 코드 간결, 백엔드 스냅샷 설계와 일관성 확보

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx

---
## 2026-06-15 — StockStatsOverlay 히스토리 차트: 스냅샷 데이터 형식 호환성 계층 (신형/구형 폴백)

**결정:** 히스토리 라인차트의 `getValue()` 함수에 신형/구형 스냅샷 데이터 형식을 모두 지원하는 폴백 로직을 추가. 1단계에서 신형 형식(`parsed.groups[histGroupFilter]`)으로 그룹 ID 키 직접 조회를 시도하고, 실패 시 2단계에서 구형 형식(배열 또는 객체 키로 그룹명 저장)을 폴백 검색하는 방식으로 구현.

**이유:** 백엔드 스냅샷 JSON 구조 변경(결정 ID: "2026-06-15 — 포트폴리오 백필: 스냅샷 JSON 구조 변경")으로 신형은 그룹ID 기반 객체 구조(`{groups: {gid: {total, currency}, ...}}`)이지만, 구형 백필 데이터(및 사용자가 수동으로 저장한 과거 스냅샷)는 배열 또는 객체 키 기반 구조(`[{name, currency, total}]` 또는 `{name: {currency, total}}`)일 수 있음. 호환성 계층을 추가하면 (1) 기존 모든 스냅샷 데이터가 유효하게 렌더링, (2) 데이터 마이그레이션 없이 점진적 전환 가능, (3) 사용자가 저장한 오래된 스냅샷도 계속 조회 가능.

**대안:**
- 신형 형식만 지원: 구현 간단하지만 기존 모든 구형 스냅샷 데이터가 차트에 표시 안 됨, 사용자 기존 기록 손실
- 기존 배열 형식 유지: 새 ID 기반 구조의 이점(O(1) 조회, 그룹명 변경 시 메타데이터 분리) 포기
- 구형 데이터 마이그레이션 배치: 한 번에 정리 가능하지만 비용 높음, 기존 기록 변경 우려, 마이그레이션 검증 복잡
- 선택한 방식: 폴백 호환성 계층 → 기존 데이터 무결성 보존, 점진적 전환, 사용자 영향 최소화, 신형/구형 혼재 지원 가능

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx

---
## 2026-06-15 — StockStatsOverlay 히스토리 탭: 그룹 필터링 식별자 변경 (이름 → ID)

**결정:** 히스토리 탭의 그룹 필터 select 요소가 저장/사용하는 값을 그룹 이름에서 그룹 ID로 변경. 이에 따라:
- `histGroupOptions` 구조: `{id, name}` 객체 배열로 변환
- select의 key와 value: `name`(문자열)에서 `id`(정수)로 변경
- option 렌더링: `histGroupOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)`로 수정

**이유:** 그룹명은 사용자에 의해 변경될 수 있는 불안정한 식별자이나, 그룹 ID는 데이터베이스 수준의 고유한 안정적 식별자. ID를 선택함으로써 (1) 그룹명 변경 후 필터 상태가 깨지지 않음, (2) 스냅샷 JSON 구조(백엔드에서 group_id 기반으로 변경, 결정 ID: "2026-06-15 — 포트폴리오 백필: 스냅샷 JSON 구조 변경")와 프런트엔드 필터링 로직이 일치, (3) `getValue()` 함수의 그룹 조회 로직(`parsed.groups[histGroupFilter]`)이 더 명확하고 안정적 (키로 직접 사용 가능)

**대안:**
- 그룹명 사용 유지 (기존): 간단하지만 그룹명 변경 시 필터 상태 깨짐, 백엔드 그룹ID 기반 JSON 구조와 불일치
- 이름 기반 폴백 로직 추가: 호환성은 있지만 복잡도 증가, 장기적 유지보수 어려움
- 선택한 방식: 그룹 ID 기반 필터링 → 안정성 확보, 백엔드 구조와 일관성, 코드 명확

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockStatsOverlay.jsx

---
## 2026-06-15 — 환경 설정 보안 강화: SECRET_KEY 필수 요구 및 ADMIN_EMAIL 외부화

**결정:** `routers/auth.py`의 보안 설정을 강화하여 (1) `ADMIN_EMAIL`을 하드코딩된 값에서 `os.getenv("ADMIN_EMAIL", "")` 환경변수로 변경 (누락 시 경고), (2) `SECRET_KEY`를 선택적(dev fallback)에서 필수로 변경 (누락 시 `SystemExit` 발생)

**이유:** (1) 하드코딩된 관리자 이메일과 기본 시크릿 키는 보안 위험 (프로덕션 배포 시 우발적 노출 가능). (2) SECRET_KEY를 필수 환경변수로 강제하면 프로덕션 배포 전에 강력한 키 설정을 반드시 수행하도록 강제하는 fail-fast 메커니즘 구현 가능. (3) 12-factor app 원칙에 따라 환경별 설정을 환경변수로 외부화하면 같은 코드베이스로 개발/스테이징/프로덕션 환경 관리 용이.

**대안:**
- 기존 방식 (dev 기본값): 구현 간단하지만, 프로덕션 배포 시 강력한 키 설정을 깜빡할 수 있음. 실제 보안 사건 사례 많음 (기본값이 그대로 프로덕션에 노출)
- 배포 전 체크리스트 문서: 휴먼 에러에 취약, 누락 위험 높음
- 컨테이너 오케스트레이션 (Docker/K8s)에만 의존: 로컬 개발 환경에서 환경변수 설정 복잡, 컨테이너 없이 실행 불가능
- 선택한 방식: 애플리케이션 시작 시점에 필수 환경변수 검증 → 배포 시 즉시 실패로 알림, 개발/배포 환경 모두 동일한 보안 정책 적용, 개발 편의성 유지

**파일:** C:\Users\Jason\Desktop\dashboard\routers\auth.py

---
## 2026-06-15 — 월별 수입 집계 엔드포인트: GET /income/summary/monthly 추가 (SQLAlchemy 집계 쿼리)

**결정:** 수입(Income) 라우터에 새로운 GET 엔드포인트 `@income_router.get("/summary/monthly")`를 추가하여 연월(year/month) 기준으로 수입을 카테고리별로 집계하고 USD 환산 기준의 월별 합계를 반환하는 엔드포인트 구현.

**이유:** 사용자가 특정 월의 수입을 카테고리별 상세 분석이 필요한 경우, 개별 항목 나열 `/income` 엔드포인트와는 별도로 집계된 데이터를 빠르게 조회할 수 있도록 전문 엔드포인트 제공. SQLAlchemy의 `.join()`, `.group_by()`, `sqlfunc.sum()`을 활용한 DB 레벨 집계로 (1) 큰 데이터셋에서도 성능 우수, (2) 네트워크 트래픽 감소, (3) 클라이언트 메모리 오버헤드 제거.

**대안:**
- 클라이언트 측 집계: `/income` 엔드포인트로 전체 월별 데이터를 받아 JS에서 `Array.reduce()` 등으로 카테고리별 합산 → 데이터셋 크고 자주 집계하는 경우 성능 저하, 네트워크 비효율
- 기존 단순 합계만 반환: 카테고리별 분해 없이 월 전체 수입액만 제공 → 사용자가 카테고리 구성을 알 수 없음, 대시보드 분석 기능 제약
- 별도 Aggregate 테이블 정규화: 사전 계산된 요약을 별도 테이블에 저장 → 조회 속도는 빠르지만 수입 생성/수정 시마다 동기화 로직 필요, 복잡도 증가
- 선택한 방식: 전문 GET 엔드포인트 + SQL 집계 쿼리 → 요청 시 즉시 계산, 데이터 신선도 보장, 기존 Expense 테이블과 동기화 불필요, 간단한 구현

**파일:** C:\Users\Jason\Desktop\dashboard\routers\income.py

---
## 2026-06-12 — CORS 정책 강화: 기본값 permissive → strict (명시적 설정 필수)
**결정:** CORS 설정을 변경하여 `CORS_ALLOWED_ORIGINS` 환경변수가 없을 때의 기본 동작을 `allow_origins=["*"]`(모든 출처 허용)에서 `allow_origins=[]`(모든 출처 차단)으로 전환. 동시에 `allow_credentials=True` 파라미터를 추가하여 쿠키/인증 헤더가 필요한 요청을 명시적으로 지원.

**이유:** (1) 기본값이 permissive(`["*"]`)면 프로덕션 배포 시 의도치 않게 모든 출처에서 접근 가능해지는 보안 위험 (CSRF, 무단 API 호출), (2) 환경변수 누락 시 명확한 경고 로그를 출력하여 배포 시 누락을 감지할 수 있도록 fail-fast 메커니즘 구현, (3) `allow_credentials=True` 추가로 쿠키 기반 세션(로그인)이 필요한 엔드포인트를 안전하게 지원할 수 있도록 설계.

**대안:**
- 기존 permissive 기본값 유지(`["*"]`): 개발 초기에는 편리하지만 프로덕션 배포 시 환경변수 설정을 깜빡하면 보안 위험 (실제 보안 사고 사례 많음)
- 하드코딩된 화이트리스트: 환경마다 코드 수정 필요, 배포 파이프라인 복잡도 증가
- 동적 도메인 화이트리스트 (regex): 구현 복잡, 오류 가능성 높음
- 선택한 방식: 명시적 환경변수 필수 + 경고 로그 + 기본값 strict → 보안 강화, fail-fast, 배포 시 즉시 실패로 감지

**파일:** C:\Users\Jason\Desktop\dashboard\main.py
---
---
## 2026-06-15 (수정) — SECRET_KEY 필수 정책 철회: 개발 환경 편의성을 위해 기본값 도입

**결정:** 이전의 "SECRET_KEY 필수 환경변수" 정책(2026-06-15 결정)을 철회하고, 개발 친화적 모델로 전환. `_DEFAULT_SECRET = "dashboard-dev-secret-change-in-production"`를 도입하여 환경변수 미설정 시 기본값 사용. 단, 기본값 사용 시 `logger.warning()`으로 경고하여 프로덕션 배포 전 반드시 설정하도록 유도.

**이유:** (1) 로컬 개발 환경에서 SECRET_KEY 환경변수를 설정하기 위한 초기 셋업이 번거로움 → 개발자 온보딩 시마다 문서 참조 필요. (2) 기본값으로 앱을 "부팅"할 수 있으면 초기 개발 속도 향상, 테스트 환경 구성 간단. (3) 로깅 경고로 프로덕션 배포 체크리스트 강화 → 개발 편의성 + 배포 안전성 균형. (4) 기본값 자체가 "change-in-production" 메시지를 포함하여 자명하게 개발용임을 표시 → 의도치 않은 프로덕션 노출 가능성 낮춤.

**대안:**
- 이전 정책 유지 (필수 환경변수): 배포 안전성이 더 강하지만 로컬 개발 초기 셋업 비용 높음
- 하드코딩된 고정 키: 구현 간단하지만 보안 위험 극대화
- 런타임 임의 키 생성: 기본값이 안 되므로 토큰 검증 불가능, 실용적 불가능
- 선택한 방식: 명확한 기본값 + 경고 로그 → 개발 편의성 향상, 배포 단계 경고로 안전성 보장

**파일:** C:\Users\Jason\Desktop\dashboard\routers\auth.py

---
## 2026-06-12 — 인증 엔드포인트 Rate Limiting: slowapi 라이브러리 선택

**결정:** 로그인/회원가입 엔드포인트의 brute-force 공격 방어를 위해 rate limiting을 도입하기로 결정. 구현 라이브러리로 FastAPI 전용 미들웨어인 `slowapi`를 선택하여 `routers/auth.py` 및 `main.py`에 임포트 추가

**이유:** (1) 보안 리뷰(2026-06-12) 결과 "SEC-03: 인증 미적용 엔드포인트 + Rate limiting 미구현"이 High 심각도 이슈로 식별됨. (2) slowapi는 FastAPI에 최적화된 데코레이터 기반 rate limiting 라이브러리로, 엔드포인트별 미들웨어 추가 없이 `@limiter.limit()` 데코레이터로 선택적 적용 가능. (3) 클라이언트 IP 기반 제한(`get_remote_address`)으로 분산 brute-force 공격도 어느 정도 방어 가능.

**대안:**
- 직접 구현 (in-memory dict): 구현 간단하지만 분산 시스템에서 동기화 어려움, 재시작 시 상태 소실
- `python-ratelimit` 라이브러리: 범용 라이브러리지만 FastAPI 통합이 덜 직관적, 데코레이터 스타일 부자연스러움
- Redis 기반 커스텀: 강력하지만 의존성 증가, 현 규모(단일 서버)에서 과도
- 선택한 방식: slowapi (FastAPI 최적화) → 데코레이터로 선택적 적용, 간단한 설정, FastAPI 생태계 자연스러운 통합

**파일:** 
- C:\Users\Jason\Desktop\dashboard\routers\auth.py (imports)
- C:\Users\Jason\Desktop\dashboard\main.py (Limiter 초기화 및 exception handler)

---
## 2026-06-12 — AdminRoleGuard 인증: 클라이언트 캐시 검증 → 서버 재검증 (async fetch)

**결정:** `AdminRoleGuard` 컴포넌트의 권한 검증 방식을 변경. 기존의 동기 클라이언트 측 검증(`getStoredRole() !== 'admin'`, localStorage에서 직접 조회)에서 서버 재검증 방식(useEffect에서 `/api/auth/me` async fetch)으로 전환. 동시에 권한 검증 상태를 3가지(`pending | allowed | denied`)로 관리하는 React state를 추가.

**이유:** (1) localStorage에 저장된 role은 클라이언트에서 임의로 수정 가능한 불안정한 데이터 → 심각한 보안 취약점. (2) 컴포넌트 마운트 시 서버에서 /api/auth/me를 호출하여 서버 상태 기반 role 재검증 → 클라이언트 조작 방지. (3) async fetch 동안 `state === 'pending'`일 때 `null` 반환으로 플래시(flash) 없는 부드러운 로딩 경험 제공. (4) AbortController로 언마운트 시 pending 요청 취소 → 메모리 누수 방지.

**대안:**
- 기존 방식 (localStorage만 신뢰): 구현 간단하지만 보안 위험 (클라이언트에서 role 위조 가능), 실제 서버 권한과 불일치 가능
- 쿠키 기반 세션 (HttpOnly 쿠키): 보안은 더 강하지만 CSRF 토큰 추가 필요, SameSite 정책 복잡
- 매 라우팅마다 fetch: 보안은 강하지만 매번 API 호출로 성능 저하, 불필요한 네트워크 요청 증가
- 선택한 방식: useEffect에서 단 1회 fetch + state 관리 → 보안과 성능의 균형, 컴포넌트 로딩 시점에만 재검증, 토큰 유효성 + 역할 권한 이중 검증

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

---
## 2026-06-12 07:10 — 수입 카테고리 조회: N+1 쿼리 → 단일 쿼리 + Python 계층 구성
**결정:** `list_income_categories()` 엔드포인트의 데이터베이스 쿼리 패턴을 변경. 기존의 N+1 쿼리 방식(대분류 1회 쿼리 + 대분류별 소분류 반복 쿼리)에서 단일 쿼리로 모든 카테고리를 로드한 후 Python 메모리에서 계층 구조를 조립하는 방식으로 전환.

**이유:** (1) N+1 쿼리는 카테고리가 많을수록 지수적 성능 저하 발생 (부모 100개 → 총 101회 쿼리). (2) 단일 쿼리 + Python 조립은 데이터베이스 왕복을 1회로 최소화하여 IO 비용 급감. (3) ExpenseCategory 데이터는 비교적 정적이므로 메모리 오버헤드 무시할 수 있음. (4) 계층 구조 조립 로직(사전/리스트 컴프리헨션)이 간단하고 명확.

**대안:**
- 기존 N+1 쿼리 유지: 구현 간단하지만 카테고리 증가 시 성능 악화, DB 연결 풀 고갈 위험
- SQL JOIN + window function: DB 레벨에서 계층 처리 → 복잡한 SQL 쿼리, 가독성 저하, SQLAlchemy ORM 매핑 어려움
- Redis 캐시 도입: 성능 향상하지만 캐시 무효화/동기화 로직 추가, 의존성 증가 (현 규모에 과도)
- 선택한 방식: 단일 쿼리 + Python 조립 → 최소한의 코드 변경, 명확한 로직, 즉각적 성능 개선, 추가 인프라 불필요

**파일:** C:\Users\Jason\Desktop\dashboard\routers\income.py

---
## 2026-06-12 — 포트폴리오 백필: 트랜잭션 전략 변경 (행별 커밋 → 배치 커밋)

**결정:** `backfill_portfolio_snapshots()` 함수의 데이터베이스 트랜잭션 패턴을 변경. 기존의 각 대상 날짜마다 `db.commit()`과 `db.rollback()`을 수행하는 행별(per-row) 커밋 방식에서, 모든 날짜 처리 완료 후 1회만 일괄 커밋하는 배치(batch) 커밋 방식으로 전환. 동시에 각 반복마다 `continue`로 진행하던 예외 처리에서 배치 커밋 시점에만 한번에 롤백하도록 변경.

**이유:** (1) 데이터베이스 트랜잭션 오버헤드 감소: 행별 커밋은 각 날짜마다 DB 왕복과 잠금/언락이 발생하므로, 대량 데이터 처리 시(신규 유저 백필 최대 365일) 불필요한 IO 비용 증가. 배치 커밋은 단 1회의 커밋으로 모든 변경을 반영하므로 성능 향상. (2) 트랜잭션 일관성 개선: 행별 커밋 시 일부 날짜는 저장되고 일부는 실패하면 부분적 상태 남음 → 불완전한 백필 결과. 배치 커밋은 성공/실패가 모두-또는-없음(all-or-nothing)으로 명확. (3) 에러 추적 용이: 배치 커밋 실패 시 전체 백필 결과를 clear하고 명확한 에러 로그 기록 가능.

**대안:**
- 기존 행별 커밋: 간단하고 부분 성공이 가능하지만, (a) 대량 데이터 백필 시 성능 저하, (b) 부분 성공으로 인한 데이터 일관성 문제, (c) 재시도 로직 구현 어려움
- Savepoint 사용 (행별 롤백 격리): 각 행 실패 시만 롤백하고 다른 행은 계속 진행 → 성공/실패 혼합 결과 허용하지만, 구현 복잡도 높고 SQLAlchemy 지원 제한적
- 선택한 방식: 배치 커밋 + 배치 롤백 → 간단하고 명확한 all-or-nothing 의미론, 성능 향상, 데이터 무결성 보장

**파일:** C:\Users\Jason\Desktop\dashboard\routers\portfolio.py

---
## 2026-06-12 — IndexPage 초기화: 3개 useEffect 병렬 로드 → Promise.all() 통합

**결정:** IndexPage 컴포넌트의 초기화 로직을 변경. 기존의 3개 독립적인 `useEffect` 훅(auth/me, timezone, widget-config 각각)을 하나의 통합된 `useEffect`로 병합하고, 각 fetch를 순차가 아닌 `Promise.all()`을 사용한 병렬 요청으로 변경.

**이유:** (1) 네트워크 성능 개선: 3개 API 호출이 순차적으로 진행되면(A 완료 → B 시작 → B 완료 → C 시작) 총 소요 시간이 가장 긴 호출의 약 3배가 되나, 병렬 요청은 모든 호출이 동시에 진행되므로 최악의 경우 단일 호출 시간과 거의 동일. (2) 코드 응집도 향상: 3개 호출이 모두 IndexPage 마운트 시 필요한 "초기 상태 로드"라는 같은 목적이므로, 분산된 효과보다 단일 효과에서 함께 처리하는 것이 의도 명확. (3) 에러 처리 단순화: 통합된 catch 핸들러로 모든 호출 실패 관리, 개별 호출별 중복 catch 로직 제거. (4) abort 관리 효율화: 3개 AbortController → 1개로 감소, 언마운트 시 모든 pending 요청 일괄 취소 메커니즘 명확.

**대안:**
- 기존 방식 (3개 순차 useEffect): 간단하지만 네트워크 지연 누적, 페이지 초기 렌더링 느림 (특히 느린 네트워크 환경에서 사용성 저하)
- 단순 fetch 체이닝 (A.then(() => B).then(() => C)): 코드량 많고 에러 처리 복잡, 성능 이득 없음
- 각 호출을 별도 라우터/컴포넌트에 위임: 책임 분산되지만 데이터 의존성 증가, 각 컴포넌트가 개별 로딩 상태를 가져 UX 복잡
- 선택한 방식: Promise.all() + 단일 useEffect → 병렬 로드로 성능 향상, 코드 응집도 증가, 에러 처리 단순화, 의도 명확

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2026-06-15 — StockNewsRow 뉴스 캐싱: 클라이언트 메모리 TTL 기반 캐시 도입

**결정:** `StockNewsRow` 컴포넌트의 `fetchNews()` 함수에 클라이언트 메모리 기반 캐싱 메커니즘을 추가. 뉴스 API 응답을 `cacheRef.current`(컴포넌트 useRef)에 저장하고, 캐시 키는 `${query}|${source}|${nLang}` (조회 파라미터 조합)로 구성. 5분(5 * 60 * 1000ms) TTL로 설정하여 5분 내에 같은 조회 조건의 요청이 오면 캐시된 결과 즉시 반환, 이외에는 서버에서 새로 fetch.

**이유:** (1) 사용자가 주식 카드를 다시 열거나 새로고침했을 때 최근 뉴스를 다시 API 호출 없이 빠르게 표시 → UX 개선, API 호출 수 감소. (2) 5분 TTL은 뉴스 신선도와 성능의 합리적 균형 (뉴스는 시간 단위로 변화하므로 5분은 충분히 최신). (3) useRef 캐시는 컴포넌트 인스턴스에 국한되므로 메모리 누수 위험이 적으며, 컴포넌트 언마운트 시 자동으로 캐시 정리됨. (4) 캐시 키에 source와 lang을 포함하여 각 검색 조건별로 독립적인 캐시 유지, 혼동 방지.

**대안:**
- 캐싱 미적용 (기존): 매번 API 호출로 네트워크 비용 발생, 느린 네트워크에서 UX 저하, 서버 부하 증가
- localStorage 기반 영구 캐시: 메모리 부담 적지만 사용자 저장소 크기 제약, 브라우저 캐시 정책에 의존하여 신선도 관리 어려움, 브라우저 스토리지 용량 경쟁(다른 앱과 공유)
- Redux/Context 전역 캐시: 여러 컴포넌트가 뉴스를 공유 사용 시 유용하지만, 현재는 StockCard 내 StockNewsRow만 사용 → 글로벌 상태 관리는 과도, 보일러플레이트 증가
- 서버 레디스 캐시: 서버 인프라 추가 (Redis 의존성), 현 규모(단일 사용자)에서는 과도
- 선택한 방식: useRef 메모리 캐시 + TTL 기반 자동 만료 → 구현 간단, 메모리 효율적, TTL 관리로 신선도 보장, 추가 인프라 불필요

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockCard.jsx

---
## 2026-06-15 — Todo 조회: 완료된 일회성 항목 필터링 위치 변경 (Python → DB 쿼리)

**결정:** `list_todos()` 엔드포인트의 일회성(once) 타입 할 일 필터링을 애플리케이션 메모리(Python 반복문, 라인 60-62)에서 데이터베이스 쿼리 레벨(SQLAlchemy `.filter()`)로 이동. 추가된 필터: `not_(and_(Todo.todo_type == "once", Todo.is_done_dates != None, Todo.is_done_dates != "[]"))`.

**이유:** (1) DB 레벨 필터링으로 불필요한 행을 DB에서 걸러내면, 네트워크 전송 데이터량 감소 및 애플리케이션 메모리 오버헤드 절감. (2) 완료된 일회성 항목이 많을수록 Python 반복 비용이 증가하나, DB 필터링은 쿼리 최적화로 성능 향상. (3) 필터링 로직이 데이터 검색 단계에서부터 적용되므로, "날짜 이동 시 재표시 방지"(주석의 의도)를 DB 레벨에서 보장 → 애플리케이션 코드의 의도가 명확해짐. (4) 향후 스냅샷/캐싱 구현 시 쿼리 결과가 이미 정제되어 있어 캐시 구조 단순화.

**대안:**
- 기존 방식 (Python 필터링): 구현 간단하고 모든 행을 로드하여 유연성 높지만, (a) 완료된 항목이 많을 경우 불필요한 행 전송 및 메모리 사용, (b) 과거 애플리케이션 메모리에서의 필터링 시점에 따라 버그 우려 (날짜 변경 후 재조회 시 이미 로드된 데이터 사용 가능)
- 별도 View/Materialized Table: 성능은 좋지만 유지보수 복잡도 증가, 데이터 동기화 로직 필요
- Redis 캐시 + 무효화: 현 규모에서 불필요한 인프라 추가
- 선택한 방식: SQLAlchemy 쿼리 필터 추가 → 간단하고 성능 효율적, 데이터 일관성 DB 레벨에서 보장, 향후 확장성 확보

**파일:** C:\Users\Jason\Desktop\dashboard\routers\todos.py

---
## 2026-06-15 — 월별 수입 집계: SQL 집계 → Python 메모리 집계 패턴 일관성화

**결정:** `income_monthly_summary()` 엔드포인트의 카테고리별 수입 집계 방식을 SQLAlchemy 레벨(`.join()`, `.group_by()`, `sqlfunc.sum()`)에서 Python 애플리케이션 레벨(단순 쿼리 후 Python 반복 집계)로 전환. 이에 따라 (1) `func as sqlfunc` 임포트 제거, (2) ExpenseCategory 조인 제거, (3) 배치 카테고리 로드(`cat_map`) 추가, (4) Python 루프를 통한 수동 합계 및 정렬 구현, (5) `lang` 파라미터 추가(expense.py 패턴 일관성).

**이유:** (1) expense.py의 `list_expenses()` 엔드포인트와 동일한 "단일 쿼리 + 배치 카테고리 로드 + Python 집계" 패턴을 도입하여 라우터 간 일관성 확보. (2) SQLAlchemy 조인과 group_by는 복잡한 쿼리이지만, 단순 쿼리 + Python 집계는 구조가 명확하고 수정/확장이 용이. (3) 데이터 크기가 작은 경우(월별 수입 항목 보통 수십 개 미만) SQL 최적화 이득이 미미하므로 코드 가독성/유지보수성을 우선. (4) 공통 패턴화로 향후 캐싱/스냅샷 구현 시 일관된 구조 활용 가능.

**대안:**
- SQLAlchemy 집계 유지: SQL 최적화로 이론상 성능이 좋지만, 쿼리 복잡도 높음, expense.py와 패턴 불일치
- 프로시저/뷰 정규화: DB 레벨에서 정제되지만 코드 분산, 마이그레이션 복잡
- Redis 캐시 추가: 성능 향상하지만 현 규모에서 불필요, 의존성 증가
- 선택한 방식: Python 메모리 집계 + expense.py 패턴 일관성 → 코드 유지보수 용이, 라우터 간 일관된 데이터 처리, 충분한 성능

**파일:** C:\Users\Jason\Desktop\dashboard\routers\income.py

---
## 2026-06-15 — 애플리케이션 시작 시 SECRET_KEY 조기 검증 (pre-import validation)

**결정:** `main.py` 최상단(다른 모듈 import 전)에 SECRET_KEY 환경변수 필수 검증 로직을 추가. 누락 시 stderr에 오류 메시지를 출력하고 `sys.exit(0)` (exit code 0)으로 즉시 종료하는 fail-fast 메커니즘 구현.

**이유:** (1) routers/auth.py 등 하위 모듈이 SECRET_KEY에 의존하므로, 이를 사용하기 전에 검증하면 불명확한 런타임 에러(KeyError, AttributeError)를 조기에 명확한 오류 메시지로 전환 가능. (2) uvicorn이 앱 기동 전에 Python 파일을 구문 파싱하면서 즉시 실패하므로, 이후 에러 처리 코드보다 훨씬 빠른 피드백 제공 (기동 시간 단축). (3) exit code 0 (성공)을 사용하면 Railway 등 PaaS 플랫폼이 실패 코드로 인식하지 않아 불필요한 재시작 루프 방지 (exit code 1은 Railway에서 자동 재시작 트리거). (4) 12-factor app 원칙에 따라 SECRET_KEY 같은 필수 설정값을 필수 환경변수로 강제함으로써 배포 시 의도치 않은 기본값 노출 방지.

**대안:**
- routers/auth.py 내에서 검증: 해당 모듈이 import될 때까지 오류 감지 지연, 여러 모듈에서 SECRET_KEY를 사용하면 중복 검증 필요
- 런타임 도중 try-catch로 처리: 앱이 이미 부분적으로 기동되어 혼동 가능, PaaS에서 헬스 체크 등으로 잘못 인식할 수 있음
- 배포 전 문서 체크리스트: 휴먼 에러 취약, 실제로 누락될 가능성 높음 (실제 보안 사고 사례 많음)
- logging/warnings 모듈로 경고만 출력: 애플리케이션이 계속 실행되어 곧 다른 곳에서 KeyError 발생, fail-fast 원칙 위배
- 선택한 방식: pre-import 조기 검증 + exit code 0 → 배포 즉시 명확한 실패, 재시작 루프 방지, 개발과 프로덕션 동일한 검증 정책 적용

**파일:** C:\Users\Jason\Desktop\dashboard\main.py

---
## 2026-06-15 — API fetch 유틸: 공통 인터셉터 패턴 (토큰 주입 + DEBUG 로깅 + 커스텀 에러)

**결정:** 프론트엔드 API 통신의 중앙화된 유틸 파일 `frontend/src/api.js` 생성. 모든 fetch 요청을 `apiFetch(url, options?)` 함수를 통해 라우팅하여 (1) localStorage 기반 JWT 토큰 자동 주입 (`Authorization: Bearer ${token}`), (2) `VITE_DEBUG_MODE` 환경변수 기반 console.group 로깅, (3) 비-2xx 상태 응답을 `.status`, `.data` 프로퍼티가 있는 커스텀 Error로 throw하는 중앙화된 요청/응답 처리 구현.

**이유:** (1) 토큰 관리 중앙화 — 모든 API 요청에 토큰을 자동 첨부하므로 각 호출마다 Authorization 헤더를 수동으로 구성할 필요 없음, 향후 토큰 갱신 로직도 한 곳에서만 구현하면 됨. (2) DEBUG 모드 로깅 — 개발 환경(`VITE_DEBUG_MODE=true`)에서만 상세 요청/응답을 console.group으로 출력하여 프로덕션 성능 영향 최소화. (3) apiLog 배열 제공 — DebugPanel 컴포넌트에서 최근 50건의 API 호출 메타데이터(url, method, status, ms)를 빠르게 조회 가능 (개발자 도구 역할). (4) 통일된 에러 처리 — 모든 에러가 `.status`, `.message`, `.data` 프로퍼티를 가져 호출자가 일관된 방식으로 처리 가능 (switch(status) 등). (5) 요청/응답 타이밍 측정 — `performance.now()` 기반으로 각 요청의 소요 시간(ms) 기록, 성능 모니터링용으로 활용 가능.

**대안:**
- axios 라이브러리 도입: 더 많은 기능(인터셉터, 취소 토큰 등)을 제공하지만, 번들 크기 증가, 학습곡선 필요, 이 프로젝트의 단순한 요구사항에 과도
- 각 컴포넌트에서 직접 fetch: 토큰 주입, 에러 처리, 로깅을 중복 구현, 버그 위험 높음, 향후 통일된 변경 어려움
- Context API 기반 API 클라이언트: React의 전역 상태로 공유 가능하지만, 이 프로젝트는 단순 함수 유틸로 충분함, Context 오버헤드 불필요
- Redux middleware (redux-thunk/redux-saga): 복잡한 비동기 로직에는 유용하지만, 현재는 간단한 fetch + 로깅 수준이므로 과도
- 선택한 방식: 단순 export 함수 + 클로저 기반 로그 배열 → 구현 간단, 번들 크기 최소, 모든 API 호출에 일관된 중앙화된 처리 적용 가능

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\api.js

---
## 2026-06-15 — DebugPanel 보이기/숨기기: 빌드타임 DEBUG 상수 → 런타임 localStorage 토글

**결정:** DebugPanel 컴포넌트의 조건부 렌더링 로직을 변경. 기존의 빌드타임 상수 `if (!DEBUG) return null`에서 런타임 localStorage 키 기반 방식 `if (localStorage.getItem('dashboard_debug_mode') !== 'true') return null`로 전환하여, 컴파일/재배포 없이 런타임에 디버그 패널 토글 가능하게 설계.

**이유:** (1) 빌드타임 DEBUG 상수는 컴파일 시점에 고정되므로 프로덕션 배포 후 디버그 패널을 켜려면 재컴파일/재배포 필요 → 비효율. (2) localStorage 기반 토글은 사용자 브라우저에서 `localStorage.setItem('dashboard_debug_mode', 'true')` 한 줄의 console 명령으로 즉시 활성화 가능 → 개발/QA/프로덕션 환경 모두에서 빠른 디버깅. (3) 실제 프로덕션 배포에서 문제 발생 시 사용자가 URL(예: 데이터 조회) 버튼을 클릭하면서 디버그 패널로 API 호출 상태 로깅 확인 가능 → 원격 지원/트러블슈팅 용이. (4) DebugPanel 컴포넌트는 이미 localStorage를 활용하고 있으므로(user, token, theme, lang 등 조회), 추가 의존성 없음.

**대안:**
- 빌드타임 DEBUG 상수 유지 (기존): 간단하지만 프로덕션에서 디버깅 불가능, 문제 해결 시 재배포 필요
- 환경변수 (process.env.VITE_DEBUG): 개발 환경에서는 유용하지만, 빌드 시 인라인되어 런타임 변경 불가능
- 전역 Context 기반 토글: 상태 관리 구조 추가, 보일러플레이트 증가 → 단순 토글에는 과도
- URL 쿼리 파라미터 (e.g., ?debug=true): URL에 노출되어 공유/링크 이슈 발생 가능, localStorage가 더 안전
- 선택한 방식: localStorage 키 기반 런타임 토글 → 즉시 활성화 가능, 재배포 불필요, 프로덕션 지원 용이, 추가 인프라 없음

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\DebugPanel.jsx

---
## 2026-06-13 12:36 — App 컴포넌트: DebugPanel 토글 상태 동기화 (static → reactive)

**결정:** App 컴포넌트에서 DebugPanel 조건부 렌더링을 변경. 기존의 단순 localStorage 읽기 기반 조건(`if (localStorage.getItem('dashboard_debug_mode') !== 'true')`)에서 React state 기반 반응형 방식으로 전환. (1) `debugMode` state를 localStorage 초기값으로 초기화, (2) useEffect 훅에서 `storage` 이벤트(다른 탭 변경 감지)와 커스텀 `dashboard_debug_toggle` 이벤트(같은 탭 변경 감지)를 리스닝하여 상태 자동 동기화, (3) 언마운트 시 이벤트 리스너 정리.

**이유:** (1) 반응형 상태 관리로 localStorage 값 변경 시 컴포넌트가 자동으로 리렌더링 → DebugPanel이 동적으로 나타났다 사라짐. (2) `storage` 이벤트로 다른 탭에서 localStorage 변경 시 현재 탭도 즉시 동기화 → 멀티 탭 환경에서 일관된 디버그 모드 상태 유지. (3) 커스텀 `dashboard_debug_toggle` 이벤트로 같은 탭 내에서 프로그래매틱 토글 가능 (예: DebugPanel 자체 UI 버튼) → 재로드 없이 런타임 토글. (4) 기존 "localStorage 읽기만" 패턴의 한계 극복 — 수동으로 localStorage 값을 변경해도 즉시 렌더링 반영.

**대안:**
- 기존 방식 (static localStorage 읽기): 구현 간단하지만 상태 변경 후 재로드 또는 수동 리렌더링 필요, 다른 탭/창에서의 변경 미감지
- setInterval 폴링 (주기적 확인): 불필요한 렌더링 루프, 성능 저하, 반응 지연
- localStorage change 이벤트만 (storage 없음): 같은 탭 내 변경은 storage 이벤트 미발생, 멀티 탭 동기화 불완전
- Context API 기반 전역 상태: 상태 관리 구조 추가, 보일러플레이트 증가 → 단순 토글에는 과도
- 선택한 방식: React state + 이중 이벤트 리스닝 (storage + 커스텀 이벤트) → 멀티 탭 동기화, 동적 토글, 최소한의 코드 복잡도

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

---
## 2026-06-15 — StockSettingsModal 총액 모드: localStorage 저장 방식 변경 (sv래퍼 제거 → 직접 저장)

**결정:** StockSettingsModal 컴포넌트의 `totalMode` select 필드 onChange 핸들러에서 localStorage 저장 방식을 변경. 기존의 `sv(TOTAL_MODE_KEY, e.target.value)` (JSON.stringify 래퍼 적용)에서 `localStorage.setItem(TOTAL_MODE_KEY, e.target.value)` (직접 저장)로 전환하여, 래퍼 함수를 거치지 않고 순수 문자열로 저장.

**이유:** (1) `TOTAL_MODE_KEY` 값(`TOTAL_MODE_KEY`)은 항상 문자열("KRW" | "USD" | "BOTH")이므로, JSON.stringify 래핑이 불필요한 오버헤드. (2) 직접 저장하면 localStorage 값이 순수 텍스트이므로 브라우저 개발자 도구에서 직관적으로 확인 가능. (3) 저장된 값이 문자열이므로 초기화 시 `localStorage.getItem(TOTAL_MODE_KEY) || 'KRW'` 형태의 단순 falsy 체크로 충분 (JSON.parse 불필요). (4) 선택값이 단순 열거형 문자열이므로 직렬화 이점이 없음.

**대안:**
- 기존 방식 (sv 래퍼 계속 사용): JSON.stringify로 "KRW"가 `"\"KRW\""` 형태로 저장되어 복잡함, 초기화/읽기 시 JSON.parse 필요, 단순 문자열 저장에는 오버헤드
- ConfigAPI 엔드포인트 추가: 서버 DB에 사용자 설정 저장 → 백엔드 의존성 증가, 다중 기기 동기화 가능하지만 현 기능에는 과도
- 선택한 방식: 직접 저장 (JSON 래퍼 제거) → 간결한 localStorage 값, 직관적 확인, 초기화/읽기 로직 단순화, 단순 열거형 값에 적합

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockSettingsModal.jsx

---
## 2026-06-15 — 세션당 한 번 자동 로그인 카운트: sessionStorage 기반 session-ping 메커니즘

**결정:** App 컴포넌트 마운트 시 실행되는 새로운 useEffect를 추가하여, 유효한 토큰이 있는 경우 `/api/auth/session-ping` 엔드포인트로 POST 요청을 보냄. 해당 세션이 이미 ping되었는지 `sessionStorage.getItem('session_pinged')`로 확인하고, 미처리 상태면 요청 후 `sessionStorage.setItem('session_pinged', '1')`로 표시하여 같은 세션 내에서는 한 번만 실행되도록 구현.

**이유:** (1) 사용자가 페이지를 새로고침하거나 재방문했을 때를 자동 로그인 카운트(세션 활성화) 이벤트로 감지하기 위함. (2) sessionStorage는 브라우저 탭/창 단위로 격리되므로, 같은 탭을 유지하는 동안 F5 새로고침 후에도 같은 세션으로 인식하되, 다른 탭을 열면 새 세션으로 취급 → 세션 단위 추적이 명확. (3) localStorage가 아닌 sessionStorage를 선택함으로써 브라우저 종료 후 재방문 시는 새로운 카운트로 기록되도록 설계 (영속 추적이 아닌 활성 세션 추적). (4) 토큰 존재 여부를 먼저 체크하여 로그인되지 않은 사용자는 ping 요청을 보내지 않음 (불필요한 API 호출 방지).

**대안:**
- API 엔드포인트 자동 호출 없음: 세션 활성화 이벤트를 서버에 알리지 않으므로 로그인 통계/감시 불가능
- localStorage 기반 추적: 브라우저 종료 후에도 플래그가 남아있어 같은 날 재방문 시 중복 카운트 안 됨 → 세션 단위 추적 의도와 불일치
- 매 라우팅/컴포넌트 마운트마다 ping: API 호출 폭증, 불필요한 네트워크 오버헤드
- 서버 쿠키 기반 세션 추적: 쿠키 생명주기 관리, CSRF 토큰 등 복잡도 증가
- 선택한 방식: sessionStorage + App 마운트 시 1회 ping → 세션당 정확히 1회 카운트, sessionStorage로 자동 수명 관리, 간단하고 명확

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

