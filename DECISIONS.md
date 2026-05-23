# 프로젝트 결정 기록

---
## 2026-05-22 — 사용자 위젯 설정을 User 모델의 JSON 컬럼에 저장
**결정:** 위젯 설정(활성화/비활성화, 옵션)을 User 테이블의 `widget_config` 컬럼에 JSON 문자열로 직렬화하여 저장하고, GET/PUT 엔드포인트(/api/auth/widget-config)로 관리합니다.

**이유:** 위젯 설정은 사용자마다 다르고 자주 변경되지만, 별도 테이블을 만들기에는 단순하고 관계도 일대일입니다. JSON 컬럼에 저장하면 쿼리 단순성과 유연성을 동시에 확보할 수 있습니다. 엔드포인트의 스키마 진화 로직(DEFAULT_WIDGET_CONFIG와 merge)으로 기존 데이터에 새로운 위젯 키가 추가되어도 자동으로 기본값이 채워집니다.

**대안:** 1) 별도 WidgetConfig 테이블 (User와 일대일 관계, 과도한 정규화), 2) 캐시 저장소(Redis)에만 저장 (영속성 부족), 3) 다중 설정 컬럼으로 분산 저장 (쿼리 복잡도 증가)

**파일:** C:\Users\Jason\Desktop\dashboard\routers\auth.py

---
## 2026-05-23 — 프론트엔드 위젯 가시성 제어: 로딩 중 전체 표시, 로드 완료 후 설정별 필터링
**결정:** IndexPage에서 widgetCfg 상태로 각 위젯 가시성을 제어합니다. 로딩 중(null)에는 모든 위젯을 표시하고, 설정 로드 완료 후 enabled 플래그에 따라 선택적으로 표시합니다. 헬퍼함수 w(key)로 가시성 검사를 간소화합니다.

**이유:** null 초기값을 통해 설정 로드 지연 중에도 페이지가 즉시 렌더링되어 UX를 개선하고, 설정이 도착하면 자동으로 상태 업데이트로 재렌더링됩니다. 이는 스켈레톤 로더나 조건부 프리페칭보다 간단하고 명시적입니다.

**대안:** 1) 모든 위젯을 무조건 표시 (설정 로드 불가), 2) 스켈레톤 상태로 설정 로드 때까지 기다리기 (지연된 FCP), 3) 서버에서 초기 설정 프리페칭 (복잡한 세션 로직)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx
## 2026-05-22 15:14 — AdminPage에서 위젯 설정 로드/저장 함수 추가
**결정:** AdminPage의 useEffect에서 loadWidgetCfg()를 호출하여 백엔드에서 위젯 설정을 로드하고, saveWidgetCfg() 함수로 PUT 요청을 통해 저장하며, setWidget() 헬퍼로 상태 업데이트를 간소화합니다.

**이유:** 위젯 설정 관리를 AdminPage에 통합하여 다른 설정(시간대, YouTube 계정 등)과 함께 중앙 집중식 관리가 가능합니다. 백엔드 API 엔드포인트(/api/auth/widget-config)를 사용하여 데이터 일관성을 보장하고, 인증 헤더(authH())를 통해 사용자별 설정 격리를 유지합니다.

**대안:** 1) 별도 위젯 설정 페이지 (navigation 복잡도 증가), 2) localStorage만 사용 (로그인 후 설정 동기화 문제), 3) 실시간 양방향 바인딩(WebSocket - 불필요한 복잡도)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\AdminPage.jsx

---
## 2026-05-23 15:45 — HeroSection 온도 단위 변환 및 동적 모바일 존 렌더링
**결정:** HeroSection 컴포넌트에서 온도 단위 변환(섭씨↔화씨)을 위해 `dispTemp` 변수를 계산하고, 모바일 뷰에서 `clockCount` prop에 따라 동적으로 `mobileZones` 배열을 생성하여 시간대 표시를 제어합니다.

**이유:** 온도 변환은 `tempUnit === 'F'` 조건으로 분기하여 화씨 계산(C × 9/5 + 32)을 적용하고, `weather.temp === '--'`일 때 미리 로드된 상태를 반영합니다. 동적 `mobileZones` 배열은 `clockCount` 값에 따라 표시될 시간대를 결정하므로, 동일 컴포넌트로 2개 또는 3개 시간대 모드를 지원할 수 있습니다.

**대안:** 1) 온도 변환을 부모 컴포넌트에서 수행(prop drilling 증가), 2) 하드코딩된 3개 존 항상 표시(clockCount 무시), 3) 조건부 렌더링으로 z1/z2 직접 사용(`if (clockCount >= 2) render(<z1/>)` 반복)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\HeroSection.jsx

---
## 2026-05-23 — StockCard 컴포넌트: currencyDisplay 프롭으로 부모 제어 지원
**결정:** StockCard 컴포넌트에 `currencyDisplay` 프롭을 추가하고, `totalMode` 초기화 로직을 `currencyDisplay ?? fallback(localStorage)` 구조로 변경했습니다. 프롭 값이 존재하면 우선 사용하고, 없으면 localStorage에서 읽습니다.

**이유:** 부모 컴포넌트가 StockCard의 통화 표시 모드를 명시적으로 제어할 수 있도록 하기 위함입니다. 이는 상태 관리 도구(Redux 등), 서버 사이드 렌더링, 또는 높은 수준의 앱 상태 동기화에서 StockCard의 유연성을 높입니다. 동시에 localStorage 폴백을 유지하여 프롭이 전달되지 않을 때 기존 동작을 보장합니다.

**대안:** 1) 항상 localStorage 사용 (부모 제어 불가), 2) 프롭 필수로 강제 (기존 호출 지점 수정 필요), 3) 조건부 렌더링으로 두 가지 컴포넌트 분리 (코드 중복)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\StockCard.jsx

---
## 2026-05-23 — 온도 단위 설정을 widgetCfg에 통합
**결정:** IndexPage에서 HeroSection 컴포넌트에 `tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'}` prop을 전달하여, 온도 표시 단위(섭씨/화씨)를 사용자 위젯 설정에서 읽도록 변경했습니다.

**이유:** 온도 단위는 지역별 선호도가 다르므로(미국은 화씨, 대부분의 국가는 섭씨), 사용자가 선택 가능하도록 설정 시스템에 통합하는 것이 적절합니다. widgetCfg의 JSON 스키마에 `hero.temp_unit` 필드를 추가하여 AdminPage에서 사용자가 변경할 수 있도록 하고, 백엔드에서 User 모델의 widget_config 컬럼에 영속적으로 저장합니다.

**대안:** 1) 하드코딩된 기본값만 사용 (사용자 선호도 무시), 2) localStorage만 사용 (로그인 후 초기화됨), 3) 시스템 로케일 자동 감지 (사용자 의도 모호), 4) AdminPage 별도 섹션 추가 (이미 widgetCfg 시스템 존재하므로 불필요)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

