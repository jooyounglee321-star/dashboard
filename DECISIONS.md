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

