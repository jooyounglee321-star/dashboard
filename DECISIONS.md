# 프로젝트 결정 기록

---
## 2026-05-26 — i18n 시스템 중앙화: 단일 src/i18n.js + locales/*.json
**결정:** 기존 `pages/index/i18n.js`에 인라인으로 분산되어 있던 번역 문자열을 `src/locales/en.json`, `src/locales/ko.json`으로 추출하고, 중앙 `src/i18n.js` 모듈에서 점 표기법 네스팅(`auth.loginBtn`)과 flat 키를 모두 지원하는 `t(lang, key)` 함수를 제공합니다. `pages/index/i18n.js`는 shim으로 교체하여 기존 위젯 컴포넌트와의 하위 호환성을 유지합니다.

**이유:** 페이지가 늘어남에 따라 번역 키가 여러 파일에 산재할 경우 유지보수가 어렵습니다. JSON 중앙화로 새 페이지 추가 시 키만 JSON에 추가하면 되고, 번역 누락 여부를 한 곳에서 확인할 수 있습니다. 네임스페이스(`auth`, `profile`, `admin` 등)로 키 충돌 방지 및 구조적 가독성을 확보합니다.

**대안:** 1) 각 페이지마다 별도 i18n 파일 유지 (번역 중복/불일치 위험), 2) i18next 등 외부 라이브러리 도입 (의존성 증가, 현재 규모에 과도), 3) 서버 사이드 번역 (SSR 없는 구조에서 부적합)

**파일:** `frontend/src/i18n.js`, `frontend/src/locales/en.json`, `frontend/src/locales/ko.json`, `frontend/src/pages/index/i18n.js`

---
## 2026-05-26 — adminLink 키 도입: JSON 네임스페이스 충돌 해결
**결정:** IndexPage의 네비게이션 링크 텍스트에 사용하던 `"admin"` flat 키를 `"adminLink"`로 이름 변경합니다.

**이유:** JSON 객체는 같은 키에 문자열 값과 객체 값을 동시에 가질 수 없습니다. `"admin": "⚙ 관리자"` (IndexPage용 flat 키)와 `"admin": { "title": "관리자 설정", ... }` (AdminPage용 네스팅) 사이에 충돌이 발생합니다. `adminLink`로 이름을 변경하여 충돌을 해소합니다.

**파일:** `frontend/src/locales/en.json`, `frontend/src/locales/ko.json`, `frontend/src/pages/index/IndexPage.jsx`

---
## 2026-05-25 — 회원관리 페이지 통합: AdminUsersPage 삭제, SuperadminPage로 완전 대체
**결정:** 별도로 존재하던 `/admin_users` 라우트와 `AdminUsersPage.jsx` 컴포넌트를 삭제하고, 회원관리 기능을 `/superadmin` 라우트의 `SuperadminPage.jsx`로 완전히 통합합니다. 레거시 북마크 대응을 위해 `/admin_users` → `/superadmin`로 리다이렉트합니다.

**이유:** 두 페이지가 모두 관리자용 회원 목록을 표시하는 중복된 기능을 가지고 있었습니다. SuperadminPage가 더 풍부한 기능(역할 관리, 권한 관리, 상세 모달)을 제공하므로, AdminUsersPage는 불필요한 코드 중복입니다. 통합하면 유지보수 부담을 줄이고, 사용자는 하나의 일관된 관리 인터페이스에서 모든 회원 관리 작업을 수행할 수 있습니다.

**대안:** 1) 두 페이지 병행 (코드 중복 증가, 동기화 문제), 2) AdminUsersPage에 역할/권한 관리 기능 추가 (라우트 구조 복잡화), 3) 별도의 AdminPage처럼 특화된 기능 유지 (기능 산재)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx, C:\Users\Jason\Desktop\dashboard\frontend\src\pages\SuperadminPage.jsx

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
## 2026-05-26 — AdminPage.jsx 다국어(i18n) 구현: 위젯 라벨 분리 및 localStorage 캐싱
**결정:** AdminPage에 i18n 번역 키를 추가하고, `WIDGET_LABELS`를 `WIDGET_ICONS`와 `WIDGET_LABEL_KEYS`로 분리하여 렌더 시점에 `t(lang, key)` 함수로 동적 번역을 수행합니다. 또한 `localStorage.getItem('dashboard_lang')`으로 언어 설정을 초기화 시 로드하여 API 응답 대기 없이 즉시 적용합니다.

**이유:** 위젯 라벨을 아이콘과 분리하면 가시성 토글과 번역이 독립적으로 작동하고, 렌더 시점 번역(runtime translation)은 언어 변경 시 컴포넌트 재렌더링만으로 모든 문자열이 즉시 업데이트되므로 추가 상태 관리가 불필요합니다. localStorage 캐싱은 백엔드 API 로드 지연 중에도 사용자 선호 언어를 즉시 표시하여 UX를 개선합니다.

**대안:** 1) 모든 번역 키를 사전에 정의하지 않고 하드코딩된 한국어 유지 (확장성 부족), 2) 렌더 시점이 아닌 상태 초기화 시에만 번역 (언어 변경 시 수동 상태 업데이트 필요), 3) localStorage 캐싱 없이 API 응답만 신뢰 (느린 초기 로드), 4) `WIDGET_LABELS`에 { icon, label, labelKey } 객체로 통합 (아이콘 구조 복잡화)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\i18n.js, C:\Users\Jason\Desktop\dashboard\frontend\src\pages\AdminPage.jsx

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

---
## 2026-05-23 — 언어 변경 시 위젯 설정 자동 동기화 (비대칭 정책)
**결정:** AdminPage에 `handleLangChange(newLang)` 함수를 추가하여 언어 선택 시 위젯 설정을 조건부로 자동 동기화합니다. 온도 단위는 사용자가 수동 설정하지 않았을 때만 자동 변경(en → F, 그 외 → C)하고, 통화는 항상 동기화합니다(en → USD, 그 외 → KRW).

**이유:** 사용자 경험과 의도 존중의 균형을 맞추기 위해 비대칭 정책을 적용했습니다. 온도 단위는 과학 커뮤니티나 특정 선호도가 있을 수 있으므로 수동 설정 여부(`temp_unit_manual` 플래그)를 확인합니다. 반면 통화는 언어 변경만으로도 명확하게 지역이 결정되므로 항상 동기화합니다. 이는 불필요한 사용자 개입을 줄이면서도 의도를 무시하지 않습니다.

**대안:** 1) 언어 변경 시 모든 설정 자동 동기화 (사용자 수동 설정 무시), 2) 언어 변경 시 아무것도 동기화하지 않음 (사용자가 매번 수정 필요), 3) 동기화 전 사용자 확인 대화상자 (UX 마찰 증가), 4) 별도의 국가/지역 선택 필드 추가 (복잡도 증가)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\AdminPage.jsx

---
## 2026-05-23 — 온도 단위 수동 선택 추적: temp_unit_manual 플래그 도입
**결정:** AdminPage 온도 단위 선택 버튼의 onClick 핸들러에서 `setWidgetCfg(prev => ({ ...prev, hero: { ...prev.hero, temp_unit: u, temp_unit_manual: true } }))`로 변경하여, 사용자가 수동으로 온도 단위를 선택할 때마다 `temp_unit_manual` 플래그를 true로 설정합니다.

**이유:** 언어 변경 시 자동 동기화 정책(handleLangChange)에서 온도 단위의 자동 변경 여부를 결정하기 위해서입니다. 사용자가 한 번 온도 단위를 수동 선택하면 `temp_unit_manual=true`가 되어, 이후 언어를 변경해도 온도 단위는 자동으로 바뀌지 않습니다. 반대로 수동 설정 없이 언어만 변경하면 온도 단위가 자동으로 동기화됩니다(en→F, 그 외→C).

**대안:** 1) temp_unit_manual 플래그 없음 (언어 변경 시 항상 온도도 자동 변경, 사용자 의도 무시), 2) 수동 선택 후 별도 "자동 동기화" 체크박스 (UI 복잡도 증가), 3) 마지막 수동 설정 시점 저장 후 시간 경과로 판단 (구현 복잡, 시간 기반 휴리스틱)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\AdminPage.jsx

---
## 2026-05-23 — 클라이언트 기반 역할 기반 접근 제어(RBAC): AdminRoleGuard 도입
**결정:** App.jsx에 `getStoredRole()` 유틸리티 함수와 `AdminRoleGuard` 컴포넌트를 추가하여, localStorage에 저장된 사용자 역할 정보를 파싱하고, admin 역할이 아닌 경우 홈(/)으로 리다이렉트하는 클라이언트 측 보호 메커니즘을 구현했습니다.

**이유:** 어드민 페이지에 대한 초기 접근 제어를 클라이언트에서 수행하여 UX를 개선(불필요한 페이지 로드 방지)하고, 라우팅 계층에서 역할 검증을 명시적으로 처리합니다. localStorage에 저장된 사용자 객체(JSON)에서 role 필드를 안전하게 추출하되, 파싱 실패 시 기본값('free')으로 폴백합니다. 이는 인증 검증(AuthGuard)과 동일한 패턴으로 보호된 경로를 구현합니다.

**대안:** 1) 서버에서만 역할 검증 (클라이언트가 어드민 페이지를 먼저 로드하므로 지연), 2) URL 기반 숨김만 적용 (기술적 보호 부족), 3) 서버에서 403 응답 (이미 보호된 엔드포인트와 중복), 4) 전역 상태 관리자(Redux/Context)에 역할 저장 (추가 복잡도)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

---
## 2026-05-25 — ProfilePage에서 언어 변경 시 위젯 설정 자동 동기화 기능 추가
**결정:** ProfilePage에 `useEffect`로 widgetCfg를 로드하고, `handleLangChange(newLang)` 함수를 추가하여 사용자가 언어를 변경할 때 온도 단위와 통화를 조건부로 자동 동기화합니다. 온도 단위는 `temp_unit_manual` 플래그가 false일 때만 자동 변경(en→F, 그 외→C)하고, 통화는 항상 동기화합니다(en→USD, 그 외→KRW). 변경 후 즉시 PUT 요청으로 백엔드에 저장합니다.

**이유:** 프로필 페이지가 사용자의 주요 설정 진입점이므로, AdminPage뿐만 아니라 ProfilePage에서도 언어 설정 시 관련 위젯 옵션을 자동으로 동기화하는 것이 사용자 경험을 향상시킵니다. 비대칭 정책(온도는 수동 설정 존중, 통화는 자동 동기화)은 AdminPage의 handleLangChange와 동일한 로직을 유지하여 일관성을 보장합니다.

**대안:** 1) 언어만 변경하고 동기화하지 않음 (사용자가 매번 설정 수정 필요), 2) 모든 관련 설정 항상 동기화 (사용자 수동 선택 무시), 3) 동기화 전 확인 대화상자 (UX 마찰 증가), 4) AdminPage에만 기능 제한 (프로필 페이지에서는 설정 변경 불가)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\ProfilePage.jsx

---
## 2026-05-26 — React 빌드 결과물(frontend/dist) Git 커밋 포함 (Railway 배포 전략)
**결정:** Railway 배포 환경에서 Python 앱으로만 인식되어 `npm run build`가 자동 실행되지 않으므로, `frontend/dist/` 폴더를 git에 포함하고 React 소스 수정 시 항상 빌드 후 커밋하도록 프로세스화했다.
**이유:** Railway는 프로젝트 루트에 `main.py`가 있으면 Python 앱으로 판단하여 Node.js 빌드 단계를 실행하지 않는다. `main.py`가 `frontend/dist/` 디렉토리를 직접 서빙하므로, 빌드 결과물이 없으면 React 소스 변경이 배포 환경에 전혀 반영되지 않는 문제가 발생한다.
**대안:** Railway buildpack 설정으로 강제 멀티빌드 구성 (복잡, 빌드 시간 증가), 배포 후 SSH로 수동 빌드 (휴먼 에러 위험), GitHub Actions로 자동 빌드 후 푸시 (추가 CI/CD 인프라)
**파일:** C:\Users\Jason\Desktop\dashboard\CHANGELOG.md

---
## 2026-05-26 15:00 — ProfilePage 언어 변경 이벤트 발생 메커니즘 추가
**결정:** ProfilePage의 언어 저장 핸들러에서 localStorage 저장 후 window 커스텀 이벤트('languageChanged')를 발생시켜, 대시보드의 즉시 반영을 보장하도록 구현했다.
**이유:** localStorage만으로는 같은 탭 내에서 다른 컴포넌트가 변경을 감지하기 어려우므로, 명시적 이벤트 발생으로 IndexPage 등 다른 페이지가 즉시 반응할 수 있게 했다. 또한 성공 메시지를 t(newLang, 'langSaved')로 변경하여 다국어 지원을 완전히 구현했다.
**대안:** Storage 이벤트 (크로스탭 통신만 지원), MutationObserver (복잡도 높음), 컴포넌트 상태 끌어올리기 (라우터 구조상 불가능)
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\ProfilePage.jsx

---
## 2026-05-26 — AdminPage i18n: WIDGET_LABELS를 WIDGET_ICONS + WIDGET_LABEL_KEYS로 분리
**결정:** AdminPage의 `WIDGET_LABELS` 객체(icon+label 혼합)를 `WIDGET_ICONS`(아이콘만)와 `WIDGET_LABEL_KEYS`(i18n 번역 키)로 분리하고, `t(lang, WIDGET_LABEL_KEYS[key])`로 렌더 시점에 언어별 라벨을 조회한다.
**이유:** i18n 적용 시 정적 한국어 문자열을 컴포넌트 외부 상수에 두면 언어 변경에 반응할 수 없으므로, 렌더 시점에 번역 함수를 호출하는 구조로 변경했다. 아이콘은 언어와 무관하므로 분리 유지한다.
**대안:** 함수형 WIDGET_LABELS (언어 파라미터 받아 객체 반환) — 호출 방식 변경 필요, 현재 구조 대비 장점 미미
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\AdminPage.jsx

---
## 2026-05-26 — RegisterPage 다국어화(i18n): 함수 기반 번역 시스템 도입
**결정:** RegisterPage의 모든 하드코딩된 한국어 문자열을 `i18n.js`의 `t(lang, key)` 함수로 변경했다. localStorage에서 `dashboard_lang` 설정을 읽고(기본값 'ko'), 모든 UI 텍스트(에러 메시지, 버튼 라벨, 약관 텍스트 등)를 i18n 키로 관리한다.
**이유:** 사용자 인증 페이지(회원가입, 로그인)는 앱 진입 첫 관문이므로, 전 시스템과 일관된 다국어 지원이 필수다. localStorage 캐싱으로 API 로드 대기 없이 즉시 사용자 선호 언어를 적용할 수 있다. 함수 기반 번역(runtime translation)은 언어 변경 후 자동 재렌더링으로 모든 문자열이 즉시 업데이트된다.
**대안:** 1) 인증 페이지만 한국어 유지 (사용자 경험 단절), 2) i18next 라이브러리 도입 (외부 의존성 추가, 현재 시스템과 통합 필요), 3) 서버 측 i18n (초기 페이지 로드 지연), 4) 컴포넌트 상태로 언어 관리 (부모 컴포넌트의 상태 끌어올리기 필요)
**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\RegisterPage.jsx

