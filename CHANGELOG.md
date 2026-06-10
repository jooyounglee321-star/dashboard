# Changelog

모든 주요 변경사항을 날짜 기준 역순으로 기록합니다.

---

## [2026-06-10] — feat: StockCard 뉴스 영역 설정 여부에 따라 안내 문구 분기 처리

### 변경 내용
- **StockCard.jsx** `StockNewsRow` 로직 재설계
  - `news_config` 없음 → amber 색상 "뉴스 출처를 설정해주세요" + 클릭 시 내 주식 설정 모달 오픈
  - `news_config` 있음 → blue 색상 "클릭하면 최신 뉴스를 볼 수 있어요" + 클릭 시 fetch 실행
  - 로딩 중 / 성공(링크 클릭 새 탭) / 실패(재시도 클릭 초기화) 상태 분기
  - 5분 캐시 유지 (sessionStorage), 만료 시 재클릭으로 새로 fetch
- **locales/ko.json, en.json** `stockNewsSetup`, `stockNewsPrompt` 키 추가 및 `stockNewsError` 문구 수정

---

## [2026-06-10] — feat: 종목별 뉴스 자동 조회 구현 (Google/Naver RSS) + CLAUDE.md 예상시간 규칙 추가

### 변경 내용
- **routers/stocks.py** `GET /api/stocks/news` 엔드포인트 추가
  - Google News RSS 파싱 (feedparser, API 키 불필요)
  - Naver RSS 미지원 시 Google로 자동 폴백
  - 백엔드 5분 캐시 (`_news_cache`)
- **StockCard.jsx** `StockNewsRow` 컴포넌트 추가
  - `s.news_config` 있으면 뉴스 자동 fetch
  - 로딩/성공(클릭 링크)/실패 상태 표시
  - sessionStorage 5분 캐시
- **locales/ko.json, en.json** `stockNewsReady`, `stockNewsLoading`, `stockNewsError` i18n 키 추가
- **CLAUDE.md** 작업 시작 전 예상 소요 시간 안내 규칙 추가

---

## [2026-06-10] — feat: 종목별 뉴스 소스/검색어/언어 설정 UI 추가 (StockSettingsModal)

### 변경 내용
- **StockSettingsModal.jsx** 각 종목 행에 `[📰 뉴스 설정]` 버튼 추가
  - 클릭 시 인라인 패널 확장: 뉴스 소스(Google/Naver), 검색어, 언어(ko/en) 설정
  - Naver 선택 시 언어 자동 한국어 고정
  - 저장 시 `portfolio_groups` PUT API로 `news_config: { source, query, lang }` 반영
- **locales/ko.json, en.json** `stock.newsSettings` 등 i18n 키 6개 추가
- **DECISIONS.md** 종목별 뉴스 설정 저장 방식 결정 기록

---

## [2026-06-10] — design: StockCard 뉴스 placeholder 위치 종목 하단으로 이동

### 변경 내용
- **StockCard.jsx** 뉴스 placeholder 위치를 종목 정보 상단 → 하단으로 이동 (`marginBottom` → `marginTop`)

---

## [2026-06-10] — feat: 내 주식 설정 버튼 클릭 시 보유주식관리 모달 표시

### 변경 내용
- **StockSettingsModal.jsx** 신규 파일 생성 (frontend/src/pages/index/)
  - AdminPage의 보유주식 관리 UI 전체를 자체 state/로직 포함하는 독립 컴포넌트로 분리
  - `embedded=true` 시 오버레이 없이 내용만 렌더 (AdminPage 재사용), 기본값은 전체화면 모달
  - 포함: stockSummary, useStockSearch, StockDropdown, AddStockRow, StockDetailPanel, 그룹/종목 CRUD, 종목삭제 확인 모달
- **AdminPage.jsx** 기존 stock 인라인 섹션 → `<StockSettingsModal embedded lang={lang} />` 으로 교체
  - groups/totalMode/expanded/deleteModal state 제거
  - loadGroups, saveGroupsToDB, addGroup/delGroup/updateGroup, addStock, handleStockUpdate, confirmDelStock, doDelStock 함수 제거
  - 사용 안하는 TOTAL_MODE_KEY, GRP_COLORS, stockSummary, useStockSearch, StockDropdown, AddStockRow, StockDetailPanel 제거
- **IndexPage.jsx** placeholder 모달 → `<StockSettingsModal isOpen onClose lang>` 로 교체

---

## [2026-06-10] — fix: StockCard 헤더 빈 영역 cursor-pointer 제거

### 변경 내용
- **StockCard.jsx** wrapper에서 `stock-card-clickable` 클래스 제거 → 헤더 빈 영역 cursor 기본값(auto)으로 복원
- `hdr` 변수에서도 `stock-card-clickable` 제거 (모바일)
- "↗ 통계" / "⚙ 내 주식 설정" 버튼에만 `cursor:pointer` 유지 (btnStyle)

---

## [2026-06-10] — design: StockCard 종목 레이아웃 개편 (뉴스 placeholder, 종목명 말줄임, 금액 우측 정렬)

### 변경 내용
- **StockCard.jsx** PC 종목 아이템 레이아웃 2열 flex 구조로 개편
- 상단: 뉴스 placeholder 영역 추가 (`data-news-ticker` 속성, "📰 뉴스 준비 중..." 텍스트)
- 좌측: 종목명(최대 160px, truncate + title hover), 티커, 보유수량·평균단가
- 우측(text-right): 현재가+LIVE 배지, 평가금액, 평가손익(수익/손실 색상), 전일비
- 종목 카드 hover 배경 효과 + border-b 구분선 추가

---

## [2026-06-10] — feat: 보유주식 헤더 버튼 분리 (통계/내주식설정), 헤더 전체 클릭 제거

### 변경 내용
- **StockCard.jsx** 헤더 전체 클릭(onOpenStats) 제거, cursor:pointer 및 title 제거
- 헤더 좌측 타이틀 옆 버튼 2개 추가: "↗ 통계" (onOpenStats), "⚙ 내 주식 설정" (onOpenSettings)
- PC/모바일/loading/empty 모든 상태 헤더 통일 (isMobile 분기 제거, 항상 동일 버튼 표시)
- **IndexPage.jsx** `stockSettingsOpen` state 추가, 두 StockCard 인스턴스에 `onOpenSettings` prop 전달
- placeholder 주식 설정 모달 추가 (준비 중 메시지, ✕ 버튼으로 닫기)
- `stock.statsLink`, `stock.settings` i18n 키 추가 (ko/en)

---

## [2026-06-09] — fix: 현황 탭 공통 필터 적용 후 차트 빈 화면 버그 수정

### 변경 내용
- **StockStatsOverlay.jsx** JSX 조건부 렌더링 버그 수정: 라인/바차트 canvas를 전체 데이터(`lineDatasets?.length > 0`) 기준으로 렌더링 → 필터 적용 후 유효 데이터(`effectiveLineDatasets`, `effectiveStockEvals`, `effectivePieItems`) 기준으로 변경
- 파이/라인/바차트 각각: 필터 결과가 비어있을 때 "해당 조건에 데이터가 없습니다" 메시지 표시
- render body에서 `effectiveLineDatasets`, `effectiveStockEvals`, `effectivePieItems` 사전 계산 (기간 cutoff 포함)
- useEffect에 `console.log` 진단 코드 추가 — 필터 상태, 그룹별 lineDatasets/barEvals/pieStocks 필터링 결과 출력
- `stock.noData` i18n 키 추가 (ko: "해당 조건에 데이터가 없습니다", en: "No data for selected filters")

---

## [2026-06-09] — feat: Stats 오버레이 전체 섹션 공통 필터 바 통일 (그룹별/통화별/기간)

### 변경 내용
- **StockStatsOverlay.jsx** 현황 탭 최상단에 공통 필터 바 1개 추가: [그룹별 ▼] [통화별 ▼] [1개월|3개월|전체]
- 기존 summaryTab(그룹별/통화별 탭), barMode 버튼, barGroupFilter 드롭다운 제거 → 공통 필터로 통합
- **파이차트**: 그룹 선택 시 해당 그룹 내 종목별 비중으로 드릴다운, 전체 선택 시 그룹 비중 유지
- **라인차트**: 그룹 필터(특정 그룹 라인만 표시) + 기간 필터(cutoff date 적용)
- **바차트**: 그룹 필터(해당 그룹 종목만) + 통화 필터(KRW/USD 환산) 적용
- **요약 카드**: 그룹 선택 시 해당 그룹 카드만, 통화 선택 시 단위 변환
- `computeStockStats`에 `stockValues` 배열 추가 (종목별 evalAmt + groupName — 파이차트 드릴다운용)
- 히스토리 탭 필터 스타일을 `periodBtn` / `selStyle` 공통 변수로 통일

---

## [2026-06-09] — feat: 종목별 평가손익 차트 그룹별 필터 추가 및 히스토리 차트와 UI 통일

### 변경 내용
- **StockStatsOverlay.jsx** 바차트 상단에 그룹별 드롭다운 추가 — 히스토리 차트 필터와 동일한 스타일
- `computeStockStats` 반환값에 `groupTickers` (그룹명 → ticker[]) 맵 추가 — useEffect에서 `stockData` 직접 참조 없이 필터링 가능
- 그룹 선택 시 해당 그룹 ticker만 바차트에 표시, "전체" 선택 시 전체 종목 표시
- 기존 [₩ KRW 기준] [$ USD 기준] 통화 버튼 유지, 드롭다운 + 버튼 한 행으로 통일

---

## [2026-06-09] — fix: 현황 탭 차트 빈 화면 버그 수정 (mainTab 전환 후 차트 미생성)

### 변경 내용
- **StockStatsOverlay.jsx** 차트 생성 useEffect에 `mainTab` 의존성 추가 + `mainTab !== 'overview'` 조기 탈출 조건 추가
- **원인:** `overview` → `history` → `overview` 탭 전환 시 canvas 요소가 unmount/remount 되지만 useEffect 의존성 배열에 `mainTab`이 없어 effect가 재실행되지 않아 빈 canvas에 Chart.js가 연결되지 않던 버그

---

## [2026-06-09] — feat: 포트폴리오 히스토리 차트 그룹별/통화별 필터 및 기간 선택 추가

### 변경 내용
- **StockStatsOverlay.jsx** 히스토리 탭 총자산 라인차트 상단에 그룹별 드롭다운 + 통화별 드롭다운 필터 UI 추가
- 그룹별 필터: `portfolio_groups` 데이터에서 동적으로 그룹명 옵션 생성, 선택 시 `snapshot.data` JSON 파싱해서 해당 그룹의 total 추출 (USD 그룹은 usd_krw 환산)
- 통화별 필터: USD 선택 시 `total_usd` + 달러 단위 y축, KRW 선택 시 `total_krw` + 억/만 단위 y축
- 그룹별 선택 시 통화별 드롭다운 자동 비활성화 (그룹 선택 우선)
- y축 레이블/틱 단위 동적 전환 (USD: `$` + 달러 포맷 / KRW·전체: `₩` + 억/만 포맷)
- **ko.json, en.json** `stock.filterByGroup`, `stock.filterByCurrency`, `stock.allGroups`, `stock.allCurrencies` i18n 키 추가

---

## [2026-06-09] — fix: StockStatsOverlay 무한 렌더링 루프 버그 수정, DEBUG 로그 제거

### 변경 내용
- **StockStatsOverlay.jsx** `computeStockStats` 내 DEBUG console.log 4개 전부 제거
- **StockStatsOverlay.jsx** `useMemo` 의존성을 `stockData` 객체 참조 → `JSON.stringify(stockData)` 문자열 비교로 변경 — 부모 컴포넌트가 매 렌더링마다 새 객체 참조를 내려줄 때 computed가 매번 재계산되어 chart useEffect가 반복 실행되던 무한 루프 수정

---

## [2026-06-09] — fix: 백필 LIMIT 중복 SQL 에러 수정, 제약조건 중복 추가 에러 무시 처리

### 변경 내용
- **main.py** `_migrate_add_user_id`에서 `ADD CONSTRAINT uq_user_snapshot_date` → `ADD CONSTRAINT IF NOT EXISTS uq_user_snapshot_date`로 변경 — 서버 재시작 시 이미 존재하는 제약조건 추가 시도로 발생하는 에러/트랜잭션 오염 방지
- **main.py** 제약조건 추가 실패 시 명시적 `conn.rollback()` 추가
- 참고: `portfolio.py` 전체 스캔 결과 현재 코드에는 LIMIT 중복 구문 없음 (이전 배포 버전에서 발생한 에러로 추정)

---

## [2026-06-09] — fix: 백필 snapshot_date NULL 저장 버그 수정

### 변경 내용
- **routers/portfolio.py** `backfill_portfolio_snapshots`의 `latest` 쿼리 및 `existing` 쿼리에 `.isnot(None)` 필터 추가 — PostgreSQL에서 `ORDER BY snapshot_date DESC`는 NULL을 FIRST로 반환하므로 NULL 행이 있으면 `latest.snapshot_date + timedelta(1)` 에서 TypeError 크래시 발생하는 버그 수정
- **main.py** 서버 시작 시 `snapshot_date IS NULL` 행을 자동 정리하는 마이그레이션 함수 `_migrate_cleanup_null_snapshot_dates()` 추가

---

## [2026-06-09] — fix: 누적 투자금액 차트 globalDates를 연속 날짜 배열로 변경

### 변경 내용
- **StockStatsOverlay.jsx** `globalDates` 생성 로직을 purchases 날짜 수집 방식에서 `startDate`~오늘 연속 날짜 생성(`generateDateRange`)으로 변경
- 매수가 없는 날에도 carry-forward 값이 유지되어 차트가 연속적으로 표시됨

---

## [2026-06-09] — fix: 누적 투자금액 차트 x축 time scale 적용, date 없는 purchases startDate로 처리

### 변경 내용
- **StockStatsOverlay.jsx** 라인차트 x축을 `type: 'category'` → `type: 'time'`으로 변경
  - `chartjs-adapter-date-fns`, `date-fns` 패키지 설치 및 import 추가
  - `displayFormats: { day: 'yyyy-MM-dd' }`, `maxTicksLimit: 10` 설정
  - x축 날짜 역순 문제 해결 (Chart.js가 time scale에서 날짜를 올바르게 정렬)
- **date 없는 purchases 처리 수정**: 기존 완전 제외 → `startDate` 날짜로 귀속
  - `filter(p => !p.date || !startDate || p.date >= startDate)`
  - `const dateKey = p.date || startDate` — 누락된 날짜 매수금액이 시작일에 포함됨
  - KOR stock 우하향 문제 해결 (date 없는 매수가 누락되어 발생하던 버그)
- y축 단위 포맷 개선: 억/천만/M/K 단위 표시

---

## [2026-06-09] — fix: 누적 투자금액 차트 시작일을 MAX(최초매입일, 가입일)로 통일

### 변경 내용
- **StockStatsOverlay.jsx** `computeStockStats(stockData, userJoinDate)` — 두 번째 인자로 가입일 수신
- `startDate = MAX(minPurchaseDate, userJoinDate)` 계산 후 globalDates 및 dailyMap 모두 startDate 기준 필터링
- `userJoinDate` state 추가: localStorage `user.created_at` 우선 사용, 없으면 `GET /api/auth/me` 폴백
- `useMemo` deps에 `userJoinDate` 포함 → 가입일 로드 후 차트 자동 갱신

---

## [2026-06-09] — fix: 그룹별 누적 투자금액 추이 차트 전면 재작성 (날짜 정렬, 누적합 버그 수정)

### 변경 내용
- **StockStatsOverlay.jsx** `lineDatasets` 생성 로직 전면 재작성
  - 전체 그룹의 모든 매수 날짜를 수집 → 전역 오름차순 정렬된 공통 날짜 축 생성
  - 각 그룹은 공통 날짜 축 기준으로 누적합 계산 (carry-forward: 매수 없는 날은 이전 값 유지)
  - `date` 없는 매수 항목 완전 제외 (오류 원인 제거)
  - Chart.js `type: 'category'` 축이 모든 데이터셋에 걸쳐 일관된 순서 보장
- 수정 전 문제: 그룹마다 독립 날짜 배열 → 다른 날짜 레이블 병합 시 Chart.js가 순서 뒤섞음 → x축 역전, 급락 현상

---

## [2026-06-09] — feat: 주식 Stats 오버레이에 포트폴리오 히스토리 탭 추가

### 변경 내용
- **StockStatsOverlay.jsx** 상단에 `[현황]` / `[히스토리]` 메인 탭 추가 (기본값: 현황)
- **히스토리 탭 구성:**
  - 상단 요약 카드: 최고 자산 (날짜), 최저 자산 (날짜), 기간 수익률
  - 총자산 변화 라인차트: `GET /api/portfolio/history` 연동, `[1개월]` `[3개월]` `[전체]` 범위 선택, y축 억/만 단위 포맷
  - 일별 결산 테이블: 날짜·USD합계·KRW합계·원화환산전체·실현손익·저장방식 컬럼, 최신순, 20행 페이지네이션
  - 저장방식: `backfill`(파란 배지) / `frontend`(초록 배지) 구분 표시
- **ko.json / en.json** `stock.currentTab`, `stock.historyTab`, `stock.highestAsset`, `stock.lowestAsset`, `stock.periodReturn`, `stock.savedBy`, `stock.noHistory` i18n 키 추가

---

## [2026-06-09] — feat: 주식 통계 요약 섹션 그룹별/통화별 탭 전환 추가

### 변경 내용
- **StockStatsOverlay.jsx** 전체 합계 요약 섹션에 `[그룹별]` / `[통화별]` 탭 버튼 추가 (기본값: 그룹별)
  - 그룹별 탭: portfolio_groups 각 그룹을 개별 카드로 표시 (그룹명 + 통화 + 총액) + 원화환산 전체 카드
  - 통화별 탭: 기존 USD 합계 / KRW 합계 / 원화환산 전체 카드 (기존 화면 유지)
  - 탭 스타일: 선택 탭 진한 배경(accent), 미선택 탭 연한 배경
- **ko.json / en.json** `stock.byGroup`, `stock.byCurrency` i18n 키 추가

---

## [2026-06-09] — feat: 종목별 평가손익 차트 USD/KRW 선택 버튼 추가 및 종목명 표시 수정

### 변경 내용
- **StockStatsOverlay.jsx** 바차트 상단에 `[₩ KRW 기준]` / `[$ USD 기준]` 토글 버튼 추가 (기본값: KRW)
  - KRW 선택 시: USD 종목 평가손익을 fxRate로 KRW 환산하여 통일된 y축으로 표시
  - USD 선택 시: KRW 종목 평가손익을 fxRate로 USD 환산하여 표시
  - y축 레이블도 선택 통화에 맞게 변경 (`₩` 또는 `$`)
- **StockStatsOverlay.jsx** 바차트 x축 레이블을 ticker → `s.name` (없으면 ticker 폴백)으로 변경
- **ko.json / en.json** `stock.displayKRW`, `stock.displayUSD` i18n 키 추가

---

## [2026-06-09] — fix: 주식 통계 차트 USD/KRW 판단을 그룹명 대신 currency 필드 기반으로 수정

### 변경 내용
- **StockStatsOverlay.jsx**: 파이차트·라인차트 USD/KRW 판단 로직이 이미 `g.currency` 필드 기반으로 구현되어 있음을 확인 (이전 커밋에서 완료)
- **routers/portfolio.py** `backfill_portfolio_snapshots()`: `ticker_history` 카테고리 결정 로직 명확화
  - `cat_by_currency = "us" if currency == "USD" else "kor-stock"` 변수로 currency 기반 판단을 명시적으로 분리
  - 기존 `_CAT_META` 그룹명("Robinhood", "KOR Stock" 등)이 있으면 우선 사용 (하위호환)
  - 사용자가 그룹명을 임의로 변경해도 currency 폴백으로 정확한 카테고리 결정 보장

---

## [2026-06-09] — fix: 주식 통계 차트 USD→KRW 환산 버그 수정

### 변경 내용
- **StockStatsOverlay.jsx** 파이차트: `g.total`을 USD/KRW 혼합 그대로 비율 계산하던 버그 수정
  - USD 그룹은 `g.total * (fxRate ?? 1)` 로 KRW 환산 후 비율 계산
  - USD 그룹이 0.0%로 표시되던 문제 해결
- **StockStatsOverlay.jsx** 누적 투자금액 라인차트: USD 그룹 `amt`에 `fxRate` 미적용 버그 수정
  - USD 그룹 매수금액을 KRW 단위로 환산하여 y축 스케일 통일
  - USD 라인이 0에 붙어 보이던 문제 해결

---

## [2026-06-09] — fix: 백필 시 소프트 딜리트 종목 제외

### 변경 내용
- **routers/portfolio.py** `backfill_portfolio_snapshots()`: `ticker_history` 구성 시 `is_deleted: true` 종목 건너뜀
- 소프트 딜리트된 종목이 백필 결산에 포함되는 버그 수정

---

## [2026-06-09] — feat: 종목 삭제 시 매수 이력 경고 추가

### 변경 내용
- **AdminPage.jsx** 종목 삭제 모달: 매수 이력이 있는 종목 삭제 시 황색 경고 박스 표시
  - "매수 이력이 있는 종목입니다. 삭제하면 과거 백필 결산에서 손익이 계산되지 않습니다. 매도 처리 후 삭제를 권장합니다."
- 소프트 딜리트(`is_deleted: true`) 는 기존에 이미 구현되어 있었음 — 데이터는 보존됨

---

## [2026-06-09] — feat: 같은 그룹 내 중복 종목 추가 방지

### 변경 내용
- **AdminPage.jsx** `addStock()`: 같은 그룹 내 동일 티커(대소문자 무관) 추가 시 에러 토스트 표시 후 중단
- 다른 그룹 간 동일 티커는 허용 (정상 케이스)

---

## [2026-06-09] — fix: 백필 호출을 App.jsx에서 IndexPage.jsx로 이동 — 로그인 직후에도 백필 실행

### 변경 내용
- **IndexPage.jsx**: `useEffect([], [])` 추가 — 홈 화면 마운트 시 토큰 있으면 백필 fire-and-forget 실행
- **App.jsx**: 백필 useEffect 제거 (App은 로그인 후 재마운트되지 않아 신규 로그인 시 미실행 버그)

### 이유
- App.jsx의 `useEffect([], [])` 는 앱 최초 로드 시 1회만 실행 — 로그인 전에 토큰이 없으면 바로 return
- 로그인 후 navigate('/')는 App을 재마운트하지 않아 useEffect가 재실행되지 않음
- IndexPage는 로그인 후 `/` 진입 시마다 마운트 → 신규 로그인 + 페이지 새로고침 모두 커버

---

## [2026-06-09] — fix: 백필 신규 유저 시작일 계산을 stocks 테이블 대신 portfolio_groups 기준으로 수정 — stocks 테이블 비어있어도 백필 진행

### 변경 내용
- **routers/portfolio.py** `backfill_portfolio_snapshots()` `is_new_user` 블록 수정:
  - 기존: `stocks.created_at` 최솟값 → 없으면 바로 종료
  - 변경: `portfolio_groups.data` JSON 파싱 → 종목 1개 이상 있어야 진행
  - 시작일 = `MIN(portfolio_groups.updated_at, users.created_at)` 중 이른 날짜, 단 `users.created_at` 하한선 유지
  - `stocks` 테이블은 보조 확인용으로만 유지 (없어도 백필 진행)

---

## [2026-06-09] — fix: 백필 호출을 LoginPage에서 App.jsx로 이동 — 자동 로그인 시에도 백필 실행되도록 수정

### 변경 내용
- **App.jsx**: 앱 초기화 시 `useEffect([], [])` 추가 — localStorage `'token'` 유효 시 `POST /api/portfolio/backfill` fire-and-forget 호출
- **LoginPage.jsx**: 기존 백필 호출 코드 제거 (중복 방지)

### 이유
- LoginPage를 통해 로그인하는 경우에만 백필이 실행되어, 자동 로그인(토큰 유지) 상태로 앱을 다시 열면 백필이 실행되지 않는 문제 수정
- App.jsx 최상위에서 1회 실행하면 로그인 방식과 무관하게 항상 백필 보장

---

## [2026-06-09] — fix: 백필 엣지케이스 수정 (avg=0.0 False 평가 버그, 전량 매도 시 빈 스냅샷 저장)

### 변경 내용
- **routers/portfolio.py** `backfill_portfolio_snapshots()`:
  - `if avg:` → `if avg is not None:` 변경 — avg=0.0일 때 Python falsy 평가로 실현손익 계산이 누락되는 버그 수정
  - `if not groups: continue` → `if not groups and total_realized_pl == 0.0: continue` 변경
    - 특정 날짜에 보유 종목이 없어도 realized_pl이 있으면 빈 스냅샷(groups=[]) 저장
    - 전량 매도 완료 후 날짜가 차트에서 공백으로 빠지는 버그 방지

---

## [2026-06-08] — fix: 주식 결산 프로세스 개선 — realized_pl 정확 계산 및 DB 컬럼 추가

### 변경 내용
- **models.py** `DailyPortfolioSnapshot`: `realized_pl FLOAT NULLABLE` 컬럼 추가
- **schemas.py** `PortfolioSnapshotOut`: `realized_pl: float | None = None` 필드 추가
- **main.py** `_migrate_add_realized_pl()`: 서버 시작 시 기존 DB에 컬럼 자동 추가 마이그레이션
- **routers/portfolio.py** `backfill_portfolio_snapshots()`:
  - `realized_pl` 계산을 `qty <= 0` 체크 이전으로 이동 → 전량 매도 종목도 실현손익 집계 반영
  - `total_realized_pl` 누계 변수로 날짜별 전체 실현 손익 합산
  - 종목별 `ticker_real_pl = sum((sell.price - avg) × sell.qty)` 계산 후 스냅샷 stocks 배열에 저장
  - UPSERT 시 `row.realized_pl = total_realized_pl` 저장
- **DB_SCHEMA.md**: `daily_portfolio_snapshot` 테이블 `realized_pl` 컬럼 문서화

### 수정된 문제
- **문제 2**: `is_new_user` 키 누락 — Task 7 리팩터링 시 이미 모든 반환 경로에 포함됨을 확인
- **문제 4**: `realized_pl: 0` 하드코딩 → 날짜 기준 매도 내역 기반 실제 값 계산으로 수정

---

## [2026-06-08] — fix: 주식 결산 프로세스 개선 — 프론트 hold_qty 날짜 기준 통일, 전량 매도 종목 과거 백필 포함

### 변경 내용
- **StockCard.jsx** `calcStock()`: purchases/sells 모두 `date <= today or no date` 필터 적용
  - `activePP`, `activeSL` 변수로 오늘 이전 거래만 합산 → holdQty, avgCost, realizedPL 모두 날짜 기준 통일
- **IndexPage.jsx** 스냅샷 저장 로직: 동일 필터 적용(`snapToday` 기준 activePP/activeSL)
  - 프론트 실시간 화면과 백필 결산이 동일한 날짜 기준 사용
- **routers/portfolio.py** `backfill_portfolio_snapshots()`: 종목 소스 전환
  - 기존: `stocks(quantity > 0)` → 변경: `portfolio_groups.data` 전체 종목
  - 그룹명 역방향 맵(`_name_to_cat`)으로 카테고리 추론
  - `stocks_map`: name/avg_price 보완용 보조 조회 (quantity 무관)
  - target_date 기준 hold_qty > 0인 경우만 해당 날짜 결산 포함
  - 전량 매도 종목도 매도 이전 날짜에는 정확히 포함됨

---

## [2026-06-08] — feat: 매수 내역에 date 필드 추가 및 매수일 직접 입력 UI 추가, 백필 시 날짜 기준 정확한 매수량/평균단가 계산 구현

### 변경 내용
- **AdminPage.jsx** `StockDetailPanel`:
  - `buyDate` 초기값을 `''` → 오늘 날짜(`new Date().toISOString().split('T')[0]`)로 변경
  - `newPurchase.date`: `buyDate || null` → `buyDate || 오늘날짜` (날짜 항상 보장)
- **routers/portfolio.py** `backfill_portfolio_snapshots()`: purchases 날짜 필터 추가
  - `valid_pp`: `purchase.date <= target_date` 또는 date 없는 것만 포함 (하위호환)
  - `buy_qty = sum(valid_pp.qty)` (날짜 기준 매수량)
  - `avg`: `valid_pp` 기준 가중평균 단가 계산 (날짜 기준 정확한 평균단가)
  - 평균단가 없으면 `stocks.avg_price` 폴백

---

## [2026-06-08] — feat: 매도 내역에 date 필드 추가, 백필 시 날짜 기준 정확한 보유량 계산 구현

### 변경 내용
- **AdminPage.jsx** `submitSell()`: 매도 항목 저장 시 `date` 필드 자동 보장
  - 기존: `date: sellDate || null` (날짜 미입력 시 null)
  - 변경: `date: sellDate || new Date().toISOString().split('T')[0]` (미입력 시 오늘 날짜 자동 삽입)
- **routers/portfolio.py** `backfill_portfolio_snapshots()`: 날짜 기준 보유량 계산 추가
  - `portfolio_groups.data` JSON 로드 → ticker별 `{purchases[], sells[]}` 매핑 구성
  - 각 target_date마다 `buy_qty - sell_qty(date <= target_date)` 로 보유량 계산
  - `sells[].date` 없는 기존 항목은 항상 차감 (하위호환 유지)
  - portfolio_groups에 없는 종목은 `stocks.quantity` 폴백

---

## [2026-06-08] — fix: 포트폴리오 백필 시작일을 가입일 기준으로 수정 (가입일 이전 결산 방지)

### 변경 내용
- **routers/portfolio.py** `backfill_portfolio_snapshots`: 신규 유저의 백필 시작일 계산 변경
  - 기존: `stocks.created_at` 최솟값 (최초 종목 등록일)
  - 변경: `MAX(stocks.created_at 최솟값, users.created_at)` — 둘 중 더 늦은 날짜
  - 효과: 매입일을 과거로 입력해도 회원가입일 이전 기간에 대한 스냅샷은 생성하지 않음

---

## [2026-06-08] — feat: 포트폴리오 자동 결산 APScheduler 제거 → 로그인 시 백필 방식으로 전환, 신규 유저 최초 매입일부터 365일 백필 지원

### 변경 내용
- **main.py**: APScheduler에서 `daily_snapshot_kr`, `daily_snapshot_us` 스케줄 작업 완전 제거
  - 관련 함수 제거: `_CAT_META`, `_KR_CATS`, `_US_CATS`, `_fetch_usd_krw`, `_snapshot_user_partial`, `_run_snapshot_job`, `_daily_snapshot_kr_job`, `_daily_snapshot_us_job`
  - 불필요해진 import 제거: `asyncio`, `json`, `datetime`, `ZoneInfo`, `CronTrigger`
  - 환율 갱신(30분 간격) 스케줄 및 APScheduler 자체는 유지
- **routers/portfolio.py**: `backfill_portfolio_snapshots` 신규 유저 처리 추가
  - 스냅샷 0건인 유저: `stocks.created_at` 최솟값부터 시작, 최대 365일 백필
  - 기존 유저: 마지막 snapshot_date 다음날부터, 최대 30일 (변경 없음)
  - 반환값에 `is_new_user: bool` 추가

---

## [2026-06-08] — feat: 로그인 시 포트폴리오 스냅샷 자동 백필

### 변경 내용
- **routers/portfolio.py**: `backfill_portfolio_snapshots(user_id, db)` 함수 추가
  - 최신 스냅샷 다음 날부터 오늘(KST) 하루 전까지 누락된 날짜 감지 (최대 30일)
  - yfinance 배치 조회로 티커별 API 호출 최소화 (날짜 범위 전체를 한 번에 요청)
  - 주말·공휴일: 해당일 이전 가장 최근 거래일 종가 사용
  - 시세 조회 실패 시 avg_price 폴백
  - `saved_by = "backfill"` 태그로 저장 소스 구분
  - stocks 테이블 기반 (APScheduler 스케줄러와 동일 소스)
- **routers/portfolio.py**: `POST /api/portfolio/backfill` 엔드포인트 추가
- **LoginPage.jsx**: 로그인 성공 후 `/api/portfolio/backfill` fire-and-forget 호출 (로그인 흐름 비차단)

---

## [2026-06-08] — design: 가계부/식단 카드 UI 통일 (날짜 입력 위치, DB저장 배지 제거, 한글 링크 번역 수정)

### 변경 내용
- **ExpenseCard.jsx**: 날짜 input을 TodayHeader(합계 옆)에서 분리 → card-body 최상단 단독 한 줄로 이동 (식단 카드 `diet-date-row/diet-date-inp` 동일 패턴)
- **ExpenseCard.jsx**: 데스크톱 헤더 "DB Saved" 배지 완전 제거
- **ko.json**: `expense.budgetLink` "↗ Budget" → "↗ 가계부", `diet.statsLink` "↗ Diet Stats" → "↗ 식단 통계"

---

## [2026-06-08] — design: 가계부/식단 카드 헤더 주식 카드 패턴으로 통일, 네비게이션 Budget 버튼 제거

### 변경 내용
- **IndexPage.jsx**: 상단 헤더에서 `📒 가계부(Budget)` 링크 버튼 제거
- **ExpenseCard.jsx**: 카드 헤더에 `↗ Budget` 링크 추가 (주식 `↗ Stats` 와 동일 스타일)
  - 데스크톱: 타이틀 옆 `fontSize: 0.65rem, color: var(--ink3)`, `/budget` 이동
  - 모바일: `↗` 기호만 표시 (`0.6rem`)
- **DietCard.jsx**: 카드 헤더에 `↗ Diet Stats` 링크 추가, 기존 하단 "식단 통계 보기" 링크 제거
  - 데스크톱: 타이틀 옆 `fontSize: 0.65rem, color: var(--ink3)`, `/diet-stats` 이동
  - 모바일: `↗` 기호만 표시 (`0.6rem`)
- **i18n**: `expense.budgetLink`, `diet.statsLink` 키 추가 (ko/en)

---

## [2026-06-08] — design: ExpenseCard 날짜 선택 및 Add 버튼 레이아웃 개선

### 변경 내용
- **TodayHeader**: "Today's Total" 레이블+금액(좌) / 날짜 input(우) flex justify-between 구조로 변경
- **ExpForm**: 통화 드롭다운 + 금액 입력 + Add 버튼을 한 줄(`exp-cur-row`)로 통합, 기존 `exp-date-row` 제거
- 통화 드롭다운 `width: 9rem` 고정 / 금액 입력 `flex: 1` / Add 버튼 `width: 5rem` 고정
- 데스크톱·모바일 레이아웃 모두 동일하게 적용

---

## [2026-06-08] — feat: 식단 분석 저장 기능 + 식단 통계 페이지 추가

### 변경 내용
- **models.py**: `diet_analyses` 테이블 추가 (id, user_id FK, date, nutrition_analysis, recommendations, warnings, raw_meals, created_at, updated_at, UNIQUE(user_id, date))
- **schemas.py**: `DietAnalysisCreate`, `DietAnalysisOut` 스키마 추가
- **routers/diets.py**: 3개 분석 엔드포인트 추가
  - `POST /api/diets/analysis` — 분석 결과 UPSERT 저장
  - `GET /api/diets/analysis?date=YYYY-MM-DD` — 특정 날짜 분석 조회
  - `GET /api/diets/analysis/history?year=YYYY&month=MM` — 월별 분석 이력 조회
- **main.py**: `DietAnalysis` 모델 import + `_migrate_create_diet_analyses()` 마이그레이션 함수 추가
- **DietCard.jsx**: 저장 기능 및 UI 개선
  - 날짜 변경 시 저장된 분석 자동 로드 (`loadSavedAnalysis`)
  - 저장된 결과에 "📋 저장된 분석 결과" 배지 표시
  - 분석 완료 후 "✅ 분석 저장" 초록 버튼 표시 (저장 후 숨김)
  - "📈 식단 통계 보기" 링크 하단 추가
- **DietStatsPage.jsx**: 신규 식단 통계 페이지 (`/diet-stats`)
  - 년/월 내비게이터 (← YYYY년 MM월 →)
  - 날짜별 그룹화: 날짜 헤더 + 끼니별 식단 목록
  - 분석 결과 펼치기/접기 토글 (영양 분석, 메뉴 추천, 주의사항)
  - 분석 없는 날에 "분석 없음" 배지
- **App.jsx**: `/diet-stats` 라우트 추가 (AuthGuard 적용)
- **i18n**: `diet.saveAnalysis`, `diet.savedAnalysis`, `diet.saveSuccess`, `diet.statsTitle`, `diet.noAnalysis`, `diet.viewStats`, `diet.mealsOfDay`, `diet.analysisOfDay` 8개 키 추가 (ko/en)
- **DB_SCHEMA.md**: `diet_analyses` 테이블 문서화

---

## [2026-06-08] — feat: DietCard AI 식단 분석 UI 추가 (API 연동 전 더미 데이터)

### 변경 내용
- 식단 1개 이상 입력 시 "🤖 AI 식단 분석" 버튼 표시 (보라색)
- 버튼 클릭 → 2초 로딩(스피너) 후 더미 결과 카드 토글 표시
- 결과 카드 3섹션: 📊 영양 균형 분석 / 🍽️ 메뉴 추천 / ⚠️ 주의사항(노란 배경)
- 상태 관리: `isAnalyzing`, `analysisResult`, `showAnalysis`
- i18n: `diet.analyzeBtn`, `diet.analyzing`, `diet.nutritionAnalysis`, `diet.menuRecommendation`, `diet.warning` 추가

---

## [2026-06-08] — feat: 유저 프로필 식단 분석용 신체정보(출생년도/성별/키/몸무게) 추가

### 변경 내용
- **models.py**: User 테이블에 `birth_year`, `gender`, `height_cm`, `weight_kg` 컬럼 추가
- **schemas.py**: `ProfileOut`, `ProfileUpdate`에 4개 필드 추가
- **routers/auth.py**: `PUT /api/auth/me`에 신체정보 필드 저장 로직 추가
- **main.py**: `_migrate_user_columns()`에 4개 컬럼 마이그레이션 포함
- **ProfilePage.jsx**: 식단 관리 정보 섹션 추가 (출생년도/성별/키/몸무게 + cm↔ft, kg↔lb 토글)
- **DietCard.jsx**: 신체정보 미입력 시 `/profile`로 이동하는 안내 배너 표시
- **i18n**: `profile.dietSectionTitle/Desc/birthYear/gender/male/female/other/height/weight/dietAIPrompt` 추가
- **DB_SCHEMA.md**: users 테이블 컬럼 4개 추가 문서화

---

## [2026-06-08] — feat: DietCard 날짜 선택 및 식단 조회 기능 추가

### 변경 내용
- 날짜 선택 input 추가 (기본값: 오늘, 변경 시 해당 날짜 식단 자동 재조회)
- 끼니별 그룹 헤더 이모지 표시 (🌅 아침 / ☀️ 점심 / 🌙 저녁 / 🍎 간식)
- 각 식단 항목 카드 표시 (내용 + 칼로리 + 개별 삭제 버튼)
- 칼로리 입력 필드 추가 (optional, 숫자)
- 날짜 기반 addMeal — 선택된 날짜로 저장
- i18n: `dietCaloriesPlaceholder` 키 추가 (ko/en)

---

## [2026-06-07] — fix: 삭제 버튼 버그 수정 (페이지 이동 방지, 토스트 알림, 낙관적 업데이트)

### 변경 내용
- **ExpenseCard.jsx**: `delExpense`에 `e.preventDefault()` 추가, 낙관적 삭제(즉시 목록에서 제거), 성공 시 토스트 알림, `type="button"` 명시
- **DietCard.jsx**: `delMeal`에 동일 패턴 적용 (낙관적 업데이트 + 토스트)
- **BudgetPage.jsx DailyTab**: `delItem`에 동일 패턴 적용
- **BudgetPage.jsx SettingTab**: `delBudget`, `delCat`에 동일 패턴 적용
- **공통**: `useToast` / `<Toast>` 컴포넌트 연결, 모든 삭제 버튼에 `type="button"` 명시
- **i18n**: `common.deleteSuccess` 키 추가 (ko: "삭제되었습니다", en: "Deleted successfully")

---

## [2026-06-07] — feat: 카테고리 추가 이모지 피커 구현 (카테고리별 탭, 외부라이브러리 없음)

### 프론트엔드 (BudgetPage.jsx, BudgetPage.css)
- `EmojiPicker` 컴포넌트 순수 React로 구현 (외부 패키지 없음)
  - 현재 선택 이모지 버튼 클릭 시 팝업 표시
  - 카테고리 탭 9개: 얼굴/감정, 음식/음료, 교통/여행, 집/생활, 돈/쇼핑, 취미/엔터, 건강/운동, 교육/업무, 기타
  - 탭별 이모지 30개씩 그리드 표시
  - 이모지 클릭 시 선택 + 팝업 자동 닫힘
  - 팝업 외부 클릭 시 닫힘 (`mousedown` 이벤트)
  - 선택된 이모지 하이라이트 표시
  - 열림 애니메이션 적용
- `EMOJI_TABS` 상수: 카테고리별 이모지 목록 정의
- SettingTab 대분류·소분류 폼의 `bp-inp-icon` 텍스트 입력 → `EmojiPicker` 컴포넌트로 교체
- 모바일 반응형: 260px 너비, 5열 그리드

---

## [2026-06-07] — fix: 커스텀 카테고리 아이콘 DB 컬럼 누락 마이그레이션 추가

### 백엔드 (main.py)
- **근본 원인 수정**: `expense_categories.icon` 컬럼이 구버전 DB에 존재하지 않아 아이콘이 항상 NULL로 저장되던 문제
- `_migrate_add_category_icon()` 마이그레이션 함수 추가 — icon 컬럼 없으면 `VARCHAR(100)`으로 자동 추가
- 서버 시작 시 `_migrate_add_category_icon()` 자동 실행되도록 등록

---

## [2026-06-07] — fix: 커스텀 카테고리 추가 시 이모지 아이콘 누락 버그 수정

### 프론트엔드 (BudgetPage.jsx — SettingTab)
- **소분류(addSubCat) icon state 누락 수정**: `newSub` 초기 state에 `icon: ''` 필드 추가
- **소분류 POST body icon 하드코딩 수정**: 기존 `icon: null` 고정값 → `newSub.icon` state 값 사용
- **소분류 폼 icon 입력 필드 추가**: 대분류와 동일하게 `bp-inp-icon` 입력 필드 렌더링
- **소분류 리셋 시 icon 초기화**: `setNewSub` 리셋에 `icon: ''` 포함
- **대분류 icon `.trim()` 추가**: 공백만 입력된 경우 null로 처리하는 방어 로직 적용

---

## [2026-06-06] — feat: 가계부 결산 수입/지출 분리 집계 및 UI 개편

### 백엔드 (routers/expense.py)
- `_split_income_expense(rows)` 헬퍼 추가 — `(total_income, total_expense, net)` 반환
- `_group_by_category()` — `expense_type` 파라미터 추가, 지출/수입 단독 집계 가능
- `GET /summary/daily` — `total_income`, `total_expense`, `net` 필드 추가; `by_category`·`total_usd` 지출만
- `GET /summary/monthly` — 동일 분리; 일별 집계(`daily`)·카테고리도 지출만
- `GET /summary/yearly` — 월별 객체에 `total_income`/`total_expense`/`net` 추가; YoY 비교도 지출 기준
- `GET /stats` — `by_category`·`over_budget`·`daily_trend` 지출만; 수입/지출/순수지 응답 추가
- 기존 `total_usd` 필드는 지출 합계로 재정의해 다른 탭 하위 호환 유지

### 프론트엔드 (BudgetPage.jsx + BudgetPage.css)
- `SummaryTab` 상단에 **수입(녹색) / 지출(빨간색) / 순수지(파란색·조건부)** 3카드 추가
- 최근 12개월 표: 1열(지출 합계) → 3열(수입 / 지출 / 순수지)로 개편
- `history` 상태에 `total_income`, `total_expense`, `net` 포함
- 예산 초과·TOP 5 는 지출 전용(백엔드에서 보장)
- `.bp-summary-cards` / `.bp-summary-card` 등 3카드 전용 CSS 추가

### i18n
- `budget.totalIncome` / `budget.net` 키 추가 (ko.json, en.json)

---

## [2026-06-06] — feat: APScheduler 이중 타임존 스냅샷 (한국 23:59 KST / 미국 23:59 ET)

### 배경
- 서버(Railway)는 UTC로 동작하므로 단일 23:59 KST 스케줄로는 미국 주식 종가 확정 전 조회
- 한국 장: KST 15:30 마감 → 23:59 KST 조회 시 종가 확정 ✓
- 미국 장: ET 16:00 마감 → 23:59 KST(≈09:59 ET)는 장 중 → 종가 미확정 ✗

### 변경 내용
- `_daily_snapshot_job` + `_snapshot_user` 제거
- 신규 함수 5개 도입:
  - `_KR_CATS` / `_US_CATS` — 시장별 카테고리 집합 상수
  - `_fetch_usd_krw(db, loop)` — 환율 조회 공통 헬퍼
  - `_snapshot_user_partial(db, loop, uid, today, categories, usd_krw)` — MERGE-UPSERT 핵심 로직
  - `_run_snapshot_job(today, categories, label)` — 사용자 순회 공통 로직
  - `_daily_snapshot_kr_job()` — 23:59 KST 진입점 (KR 그룹)
  - `_daily_snapshot_us_job()` — 23:59 ET 진입점 (US 그룹)
- APScheduler `add_job` 2개로 분리:
  - `id="daily_snapshot_kr"` — `CronTrigger(timezone="Asia/Seoul")`
  - `id="daily_snapshot_us"` — `CronTrigger(timezone="America/New_York")`
- MERGE 전략: 같은 날짜 행이 있으면 상대 시장 그룹은 보존, 이 job 담당 그룹만 갱신
- 날짜 기준: `datetime.now(ZoneInfo("America/New_York")).date()` — 양쪽 job 모두 ET 날짜 통일

---

## [2026-06-06] — fix: APScheduler daily_portfolio_snapshot 실제 데이터 저장으로 전면 개선

### 변경 전
- `_daily_snapshot_job`이 `user_id=NULL` 빈 플레이스홀더만 저장 (모든 값 NULL)
- Yahoo Finance 호출 없음, 사용자 루프 없음

### 변경 후
- `asyncio` + `asyncio.gather`로 종목별 현재가 **동시 조회** (Yahoo Finance `_fetch_price` 재사용)
- USD/KRW 환율: Yahoo Finance → DB 폴백 순으로 안전하게 처리
- 종목별 시세 조회 실패 시 `avg_price` 폴백 → 부분 저장 보장
- 모든 사용자(`stock` 테이블 `user_id distinct`)를 순회하여 1인당 1행 UPSERT
- 저장 필드: `usd_krw`, `total_usd`, `total_krw`, `total_krw_equiv`, `data`(JSON 그룹/종목 상세)
- `_CAT_META` 상수 추가 (카테고리 → 그룹명·통화 매핑)
- `_snapshot_user()` 헬퍼 분리

---

## [2026-06-06] — fix: 가계부 및 식단 입력 폼에 미래 날짜 선택 제한(max) 적용

- `ExpenseCard.jsx` 추가 폼 날짜 입력: `max={todayStr()}` 추가 → 오늘 이후 미래 날짜 선택 불가
- `ExpenseCard.jsx` 수정 모달 날짜 입력: 동일하게 `max={todayStr()}` 추가
- `BudgetPage.jsx` DailyTab 날짜 선택기: `max={todayStr()}` 추가
- 단, SettingTab(예산 설정) · 일정(Schedule) 등 미래 계획용 입력은 제한 없이 유지
- `todayStr()` 함수(로컬 타임존 기준) 재사용 → UTC 파싱 오프셋 문제 없음

---

## [2026-06-06] — fix: 수입/지출 토글에 따른 대분류 드롭다운 항목 동적 필터링 버그 수정

### 버그 원인
- `GET /api/expense/categories` 엔드포인트에 `category_type` 필터가 없어 수입 카테고리(`category_type='income'`)가 지출 드롭다운에 혼재 노출
- `BudgetPage.jsx` DailyTab 수정 모달에서 `editDisplayCats` 변수 미정의 → 런타임 에러

### 수정 내용
- **`routers/expense.py`** `list_categories()`: 쿼리 필터에 `category_type = 'expense' OR NULL` 조건 추가 — income 카테고리 완전 격리
- **`BudgetPage.jsx`** 수정 모달: `editDisplayCats` (undefined) 제거 → income/expense 조건 분기로 교체
  - income 모드: `INCOME_CATEGORIES` 대분류 + `editIncomeSubs` 소분류 드롭다운 표시
  - expense 모드: `cats` (지출 전용) 대분류 + `editSubs` 소분류 드롭다운 표시
- **`BudgetPage.jsx`** 수정 모달 토글 핸들러: expense↔income 전환 시 `income_main_code` / `income_sub_code` / `category_id` / `subcategory_id` 동시 초기화 → 상태 꼬임 방지

---

## [2026-06-03] — feat: 전체 페이지 반응형(Responsive Web) UI 개선

- `globals.css`: 모바일(~767px) / 태블릿(768~1023px) 미디어 쿼리 추가 — 헤더, 인증 카드, 필터바, 테이블, 모달, 칩 반응형 적용
- `index.css`: 모바일 브레이크포인트 640px → 767px 조정, 태블릿 2열 그리드(768~1023px) 추가. 모바일에서 `.mobile-view` + `.mobile-nav` 자동 표시
- `BudgetPage.css`: 브레이크포인트 640px → 767px 상향, 탭바 가로 스크롤, 폼 세로 스택, 테이블 가로 스크롤, 그리드 1열 변환 추가
- Tailwind 미설치 → 기존 Custom CSS + 미디어 쿼리 방식 채택, 인증/API 로직 무변경

---

## [2026-06-05] — feat: 가계부 수입(Income) 기능 도입 — Phase 2 백엔드 스키마 및 API 확장

- `models.py` `Expense`: `type VARCHAR(10) DEFAULT 'expense'` 컬럼 추가 (`'expense'`|`'income'`)
- `main.py` `_migrate_expense_type_column()`: 기존 배포 DB에 `type` 컬럼 자동 ALTER TABLE, 시작 시퀀스에 등록
- `routers/expense.py` `ExpenseIn` / `ExpensePatch`: `type` 필드 추가 (기본값 `'expense'`)
- `routers/expense.py` `_expense_dict()`: 응답에 `type` 포함
- `routers/expense.py` `list_expenses()`: `?type=expense|income` 쿼리 필터 지원
- `routers/expense.py` `create_expense()`: `type` DB 저장
- `routers/expense.py` `update_expense()`: `type` 수정 지원 (값 검증 포함)
- `DB_SCHEMA.md` 업데이트

---

## [2026-06-03] — fix: DailyTab 날짜 변경 시 이전 날짜 데이터가 유지되는 race condition 수정

- `loadGenRef` (`useRef`) 세대 카운터 도입: `load()` 호출마다 세대 번호 증가
- fetch `.then()` / `.catch()` / `.finally()` 에서 현재 세대와 불일치 시 결과 버림
- 효과: 날짜 빠르게 변경해도 항상 마지막으로 선택한 날짜의 데이터만 화면에 반영

---

## [2026-06-03] — feat: 각 지출 카테고리에 Other/기타 소분류 추가

- `_DEFAULT_CATEGORIES`: Utilities·Food·Housing·Transportation·Health·Education·Activities·Travel·Shopping 9개 카테고리 subs에 `{'name_en': 'Other', 'name_ko': '기타', 'icon': '📌', 'order_num': 99}` 추가
- `_migrate_add_other_subcategory()` 신설: 이미 배포된 Railway DB에 소분류가 없으면 자동 INSERT (서버 시작 시 1회 실행, 중복 방지)
- 'Other' 최상위 카테고리는 이미 기타 성격이므로 대상에서 제외

---

## [2026-06-03] — fix: ExpenseCard 위젯 날짜 UTC 버그 수정 (PDT 오후 5시 이후 내일 날짜 표시)

- `ExpenseCard.jsx` `todayStr()`: `new Date().toISOString().slice(0,10)` (UTC 기준) → `getFullYear/getMonth/getDate` (로컬 기준)으로 교체
- PDT(UTC-7) 오후 5시 이후 새로고침 시 내일 날짜(예: 6월 4일)로 초기화되던 버그 수정
- 동일 버그 BudgetPage.jsx는 이전 커밋에서 수정 완료, 이번에 ExpenseCard.jsx 동일 패턴 적용

---

## [2026-06-03] — fix: 가계부 달력 선택 시 타임존 시차 왜곡 버그 완벽 수정

- `onChange`: `e.target.value.split('-')`으로 연/월/일 분해 후 재조합 — `new Date()` 변환 경로 원천 차단
- `displayItems` 클라이언트 안전 필터 추가: `items.filter(it => it.date.substring(0,10) === date)` — 서버 응답 date 필드가 "YYYY-MM-DD HH:MM:SS" 형태여도 앞 10자리로 정확히 매칭
- catMap 집계 및 리스트 렌더링 모두 `displayItems` 기준으로 통일
- PDT(UTC-7) 등 어느 타임존에서 접속해도 로컬 날짜 기준 100% 일치 보장

---

## [2026-06-03] — fix: 유저 로컬 타임존 시차 방어 및 날짜 변경 시 실시간 재조회 완공

- `toLocalDateStr()` 헬퍼 신설: `<input type="date">` e.target.value를 `new Date()` 변환 없이 "YYYY-MM-DD" 문자열 그대로 사용 → UTC 파싱으로 인한 타임존 오프셋(하루 어긋남) 완전 차단
- 날짜 picker onChange에 `toLocalDateStr()` 적용: 브라우저가 한국·미국·유럽 등 어느 타임존이든 로컬 날짜 문자열 그대로 상태에 저장
- `todayStr()` 주석 강화: UTC 기반 toISOString() 사용 금지 이유 명시

---

## [2026-06-03] — fix: 가계부 날짜 변경 시 해당일 데이터 실시간 재조회 useEffect 연동 완공

- `DailyTab` useEffect 의존성 배열을 `[load]` 간접 참조에서 `[date, lang]` 직접 명시로 변경
- `useCallback → useEffect[load]` 2단계 간접 연결의 엣지케이스(React 배치 업데이트 시 load 참조 변경 미감지) 제거
- 날짜 picker `onChange`에 명시적 코멘트 추가로 의도 명확화
- 저장/수정/삭제 후 수동 호출되는 `load()` 함수는 그대로 유지

---

## [2026-06-03] — fix: 가계부 저장 후 목록 조회 날짜 싱크 매칭 및 화면 렌더링 버그 수정

- `todayStr()` UTC→로컬 날짜로 수정: `toISOString()` 사용 시 한국 오전 9시 이전에 어제 UTC 날짜 반환하던 버그 제거. `new Date()`의 `.getFullYear()/.getMonth()/.getDate()` 로컬 기준으로 교체
- `load()` catch 블록에서 `setItems([])` 제거: 네트워크 오류/인증 오류로 GET 실패 시 기존 items(optimistic update 포함)가 지워지던 버그 수정. 실패 시 현재 상태 유지 + `console.error` 로깅으로 대체
- 백엔드 `_expense_dict`: `e.date.isoformat()` → "YYYY-MM-DD" 문자열 직렬화 정상 확인, 수정 없음
- `GET /api/expense`: `Expense.user_id == current_user.id` + `date` 필터 정상 확인, 수정 없음

---

## [2026-06-03] — feat: 가계부 저장 성공 시 화면 데이터 실시간 리프레시 연동 완공

- `addExpense()` 내 POST 응답 객체(`saved`)를 즉시 `setItems(prev => [saved, ...prev])`로 목록 맨 앞에 추가 → 네트워크 지연 없이 화면 즉시 반영
- 이후 `load()` 병렬 호출로 서버 전체 목록 완전 동기화(카테고리·환산금액 정합성 보장)
- 저장 후 선택 날짜(`date` state) 유지 / 금액·메모·소분류만 초기화 재확인

---

## [2026-06-03] — fix: 가계부 API 요청 시 JWT 인증 토큰 헤더 누락 버그 전면 수정

- `BudgetPage.jsx`: `getToken()` 헬퍼 신설 — `localStorage.getItem('token')`이 `null` / `'null'` / `'undefined'` / 빈 문자열이면 `/login`으로 강제 리다이렉트
- `apiGet` / `apiReq`: `getToken()` 경유로 검증된 토큰만 `Authorization: Bearer ...` 헤더에 주입 (기존: `"Bearer null"` 전송 가능성 있었음)
- `apiGet` / `apiReq`: HTTP 401 응답 시 즉시 `/login` 리다이렉트 추가 (토큰 만료 처리)
- `LoginPage.jsx`: `data.access_token || data.token` 폴백으로 서버 응답 키 이름 변동에 대응, jwt 빈값 시 저장 차단
- `RegisterPage.jsx`: 동일 보강

---

## [2026-06-03] — fix: 가계부 저장 시 amount 필수값 누락(422) 버그 수정

- 원인: `Number(newForm.amount)` 인라인 변환 시 비정상 입력값이 `NaN`이 되고, `JSON.stringify({amount: NaN})` → `{amount: null}` 으로 직렬화되어 Pydantic이 "field required" 422 반환
- 수정: `parseFloat()` + `isNaN()` 사전 검증으로 NaN/음수/0 전부 차단 후 검증된 값만 body에 포함
- `saveEdit`(수정 저장)도 동일한 패턴으로 보강
- `catch {}` 무음 처리 → `console.error` + `alert` 로 에러 피드백 추가
- 저장 성공 후 날짜 유지 + `load()` 즉시 호출로 목록 실시간 갱신 재확인

---

## [2026-06-03] — feat: 가계부 일별탭 등록 폼 추가 및 날짜 고정 실시간 반영

- `BudgetPage.jsx` DailyTab에 지출 등록 폼(카테고리·소분류·금액·통화·메모) 신규 추가
- 저장 성공 후 선택된 날짜(`date` state) 초기화 없이 유지 — 금액·메모·소분류만 리셋
- 저장 성공 즉시 `load()` 호출 → 해당 날짜 목록 실시간 갱신
- Enter 키로 등록 트리거 지원
- 백엔드 POST `/api/expense` 검증: date·amount·currency·category_id·subcategory_id·description 전 필드 정상 INSERT 확인, 수정 없음
- `BudgetPage.css` `.bp-add-form` 스타일 추가

---

## [2026-06-03] — fix: 가계부 인풋 필드 글자 입력 시 커서 튕김 버그 수정

- 원인: `ExpenseCard.jsx` 내부에 `ExpForm`, `ExpItem`, `TodayHeader`, `EmptyMsg` 4개 서브컴포넌트가 메인 컴포넌트 함수 내부에 선언되어, state 변경(글자 입력)마다 함수 재생성 → React가 DOM 파괴 후 재마운트 → 포커스 소멸
- 수정: 4개 서브컴포넌트를 모두 `ExpenseCard` 함수 바깥으로 이동, 필요한 값을 props로 전달하는 구조로 변경
- 영향 범위: 금액 입력(`exp-amt-inp`), 메모 입력(`exp-desc-inp`), 수정 모드 금액/메모 인풋 — 포커스 안정화
- 백엔드 API 로직 및 데이터 흐름 변경 없음

---

## [2026-06-05] — feat: 드래그 앤 드롭 레이아웃 편집 기능 추가 (순서 변경 + 카드 크기 선택)

- `frontend/src/pages/index/LayoutEditor.jsx` 신규 생성
  - `SortableCard` 컴포넌트: @dnd-kit/sortable 기반 드래그 핸들(⠿) + S/M/L 크기 버튼
  - `DEFAULT_LAYOUT_ITEMS`: 기본 레이아웃 (12컬럼 기준, hero·stock·expense=100%, 나머지=50%)
- `IndexPage.jsx`: 레이아웃 편집 상태·함수 추가
  - 헤더 우상단 "⊞ 레이아웃 편집" 버튼 (모바일 숨김)
  - 편집 모드 진입 시 sticky 툴바 (저장/취소)
  - DndContext + SortableContext로 드래그 순서 변경
  - 크기 저장: PUT /api/auth/widget-config (widget_config.layout.items)
- `index.css`: PC 그리드 3컬럼 → 12컬럼으로 변경, 레이아웃 편집 스타일 추가

---

## [2026-06-05] — fix: 메인 대시보드 카드 너비 통일 및 동적 레이아웃 개선

- `index.css`: `.card-expense` 기본값 `span 2` → `span 3` (StockCard와 동일 전체 너비)
- 태블릿(768~959px): `.card-expense` span 1 목록에서 제거 → span 2 그룹으로 이동 (full width)
- 960px+: `.card-hero,.card-stock,.card-expense` 모두 span 3으로 통일
- `grid-auto-flow: row dense` 기존 유지로 카드 토글 시 빈 공간 자동 채움

---

## [2026-06-05] — design: ExpenseCard 입력 필드 여백 및 반응형 레이아웃 개선

- `index.css`: `.card-header` / `.card-body` CSS 정의 추가 (기존 미정의로 padding=0 문제 해결)
- `.exp-new-form`: `gap` 0.32rem → 0.55rem으로 확대
- 모든 input/select: `padding` py-2 px-3(0.5rem 0.75rem), `border-radius` rounded-lg(0.5rem) 통일
- `.exp-sel-pair`: grid → flex + gap-0.65rem, 각 자식 flex:1 (대/소분류 나란히)
- `.exp-cur-sel`: 고정 너비 130px (통화 선택), 금액 flex-1
- `.exp-date-row`: gap 확대, 날짜 flex-1 유지
- focus 상태: accent 색상 + box-shadow 추가

---

## [2026-06-05] — feat: 수입(Income) 카테고리 구조 신설 및 API 구현

### DB 변경
- `expense_categories` 테이블에 `code VARCHAR(30)`, `category_type VARCHAR(10)` 컬럼 추가
- 수입 대분류 4개(REGULAR/IRREGULAR/INVESTMENT/TRANSFER) + 소분류 14개 시드 데이터 추가

### 백엔드
- `routers/income.py` 신규 생성 — `GET/POST/PUT/DELETE /api/income` + `/api/income/categories` + `/api/income/summary/monthly`
- `main.py`: `_migrate_add_category_code_fields()`, `_seed_income_categories()` 추가

### 프론트엔드
- `frontend/src/data/incomeCategories.js` 생성 — 대분류→소분류 동적 드롭다운 상수 데이터 (ko/en 다국어)
- `getSubcategories(mainCode)`, `getCategoryName(code, lang)`, `INCOME_CATEGORIES_FLAT` 헬퍼 포함

---

## [2026-06-03] — fix: Python 3.14 PEP 649 + Pydantic v2 타입 어노테이션 충돌 수정

- 원인: `routers/expense.py`에서 필드명 `date`와 타입명 `date`(datetime.date)의 이름 충돌
- Python 3.14 PEP 649의 지연 어노테이션 평가 시 클래스 네임스페이스에서 `date`를 필드 기본값 `None`으로 잘못 해석 → `None | None → TypeError`
- 수정: `from datetime import date as Date` 알리아싱 후 타입 어노테이션 3곳 `date → Date` 교체 (필드명/API 변경 없음)
- 추가: `from __future__ import annotations` 제거 (expense.py, schemas.py) — Pydantic v2와 충돌 유발

---

## [2026-06-02] — feat: Inter + Noto Sans KR 전역 폰트 적용

- `frontend/index.html`: Google Fonts 링크를 Inter(400/500/600/700) + Noto Sans KR(400/500/700)로 교체
- `frontend/src/styles/globals.css`: body font-family를 `'Inter', 'Noto Sans KR', sans-serif`로 변경, font-weight 300 → 400 조정
- `CLAUDE.md`: 폰트 규칙 섹션 추가 (Inter/Noto Sans KR 사용 기준, 굵기 규칙)
- `frontend/dist/` 빌드 포함

---

## [2026-06-02] — Fix: Python 3.13 타입 힌트 런타임 평가 오류 수정

- `routers/expense.py` 맨 위에 `from __future__ import annotations` 추가
- `schemas.py` 맨 위에 `from __future__ import annotations` 추가
- Python 3.13에서 타입 힌트를 런타임에 즉시 평가하지 않고 지연 평가(PEP 563)하도록 설정하여 순환 참조 및 런타임 타입 오류 방지

---

## [2026-06-02] — 가계부 Phase 7 최종 점검 및 CHF 환율 추가

### 점검 결과 (전체 OK)
| 항목 | 결과 |
|------|------|
| DB: expense_categories 테이블 | ✅ |
| DB: expenses 신규 컬럼 (category_id, subcategory_id, description, currency, converted_amount, exchange_rate) | ✅ |
| DB: expense_budgets 테이블 | ✅ |
| DB: exchange_rates 테이블 | ✅ |
| API: GET/POST/PUT/DELETE /api/expense | ✅ |
| API: GET /api/expense/categories | ✅ |
| API: GET /api/expense/summary/daily | ✅ |
| API: GET /api/expense/summary/monthly | ✅ |
| API: GET /api/expense/summary/yearly | ✅ |
| API: GET /api/expense/stats | ✅ |
| API: GET/POST/PUT/DELETE /api/expense/budget | ✅ |
| API: GET /api/exchange-rates | ✅ |
| 환율 30분 자동 갱신 스케줄러 | ✅ |
| ExpenseCard 대분류/소분류 드롭다운 | ✅ |
| ExpenseCard 통화 선택 | ✅ |
| BudgetPage.jsx 파일 존재 | ✅ |
| /budget 라우트 등록 | ✅ |
| 헤더 Budget 링크 | ✅ |
| 5개 탭 (Daily/Monthly/Yearly/Summary/Budget Setting) | ✅ |
| Chart.js 차트 (파이/라인/바) | ✅ |
| CSV 내보내기 | ✅ |
| 언어 지원 t() 함수 | ✅ |

### 수정
- **`main.py`** — `_DEFAULT_EXCHANGE_RATES`에 CHF (0.89) 추가 (BudgetPage 통화 목록에 있었으나 시드 누락)
- **`routers/expense.py`** — `_RATE_TICKERS`에 `"CHF": "USDCHF=X"` 추가 (Yahoo Finance 30분 갱신 대상)
- **`frontend/dist/`** — 빌드 결과물 갱신

### 가계부 전체 기능 요약 (Phase 1~7)
- **가계부 전용 페이지** (`/budget`) — 5탭 구조 (일별/월별/연도별/결산/예산설정)
- **대분류/소분류 카테고리 시스템** — 10개 기본 대분류 + 42개 소분류, 사용자 커스텀 가능
- **다중 통화 지원** — USD/KRW/EUR/JPY/GBP/CNY/CAD/AUD/CHF/HKD/SGD
- **실시간 환율 자동 연동** — Yahoo Finance 30분 갱신, 인메모리 30분 캐시
- **예산 설정 기능** — 카테고리별/전체 월간 예산 CRUD
- **일별/월별/연도별 통계** — 카테고리별 합계, 예산 대비 실지출, 전년 대비 비교
- **차트 시각화** — 파이(도넛)·라인·바 차트 (Chart.js 4.x raw)
- **CSV 내보내기** — BOM 포함 (Excel 한글 호환)
- **영어/한국어 완전 지원** — 중첩 t() 키 (budget.*/chart.*/currency.*/category.*)

---

## [2026-06-02] — 가계부 Phase 6 i18n 완전 지원 (BudgetPage + ExpenseCard)

### 변경
- **`frontend/src/locales/en.json` / `ko.json`** — 중첩 키 섹션 추가
  - `budget.*` (28개): `budget.daily`, `budget.monthly`, `budget.yearly`, `budget.summary`, `budget.budgetSetting`, `budget.totalExpense`, `budget.actual`, `budget.remaining`, `budget.over`, `budget.exportCSV`, `budget.setBudget`, `budget.saveBudget`, `budget.top5`, `budget.vsLastYear`, `budget.noExpense`, `budget.category`, `budget.subcategory`, `budget.description`, `budget.amount`, `budget.currency`, `budget.date`, `budget.budget`
  - `category.*` (40개): 식비·교통·주거 등 지출 카테고리 40종 en/ko 번역
  - `currency.*` (10개+1): USD·KRW·EUR·JPY·GBP·CNY·CAD·AUD·CHF·HKD·SGD 통화명 en/ko
  - `chart.*` (4개): `chart.pieTitle`, `chart.lineTitle`, `chart.barTitle`, `chart.monthlyTitle`
- **`frontend/src/pages/BudgetPage.jsx`** — 모든 하드코딩 텍스트를 t() 함수로 교체
  - 탭명: `budgetTabDaily` → `budget.daily`, 차트제목: `budgetPieTitle` → `chart.pieTitle` 등 ~60개 키 교체
  - 헤더 통화 드롭다운: `{SYM[c]} {c}` → `{SYM[c]} {t(lang, 'currency.' + c.toLowerCase())}`
  - 연별 테이블 `<strong>Total</strong>` → `<strong>{t(lang, 'budget.totalExpense')}</strong>`
  - DailyTab 수정저장: `budgetSave` → `common.save` / SettingTab 예산저장: `budgetSave` → `budget.saveBudget`
- **`frontend/src/pages/index/ExpenseCard.jsx`** — 통화 드롭다운 레이블 i18n 적용
  - `{c.label}` (하드코딩 `'$ USD'` 형태) → `{c.symbol} {t(lang, 'currency.' + c.code.toLowerCase())}`
  - 신규 폼 및 수정 폼 두 곳 모두 적용
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-06-02] — 가계부 Phase 5 BudgetPage(/budget) 전용 페이지

### 추가
- **`frontend/src/pages/BudgetPage.jsx`** — `/budget` URL 전용 가계부 분석 페이지
  - **Tab 1 (일별)**: 날짜 선택, 지출 목록(인라인 수정·삭제), 카테고리 소계 칩, CSV 내보내기
  - **Tab 2 (월별)**: 카테고리별 예산/실지출/잔여/% 테이블 + 파이차트·일별 추이 라인차트·예산vs실지출 바차트 (Chart.js 4.x raw, react-chartjs-2 미사용)
  - **Tab 3 (연별)**: 전년 대비 YoY 바차트 + 월별 테이블(▲▼) + 카테고리 연간 집계
  - **Tab 4 (요약)**: TOP 5 카테고리, 예산초과 목록, 최근 12개월 이력 테이블
  - **Tab 5 (예산설정)**: 예산 CRUD(카테고리별·전체), 기본/사용자 카테고리 관리(대분류·소분류 추가·삭제)
  - 헤더 통화 토글(10종), 모든 금액 USD→선택통화 실시간 변환, 모바일 반응형
- **`frontend/src/pages/BudgetPage.css`** — 다크 테마 전용 스타일 (~300줄)
- **`frontend/src/App.jsx`** — `/budget` 라우트 추가 (AuthGuard)
- **`frontend/src/pages/index/IndexPage.jsx`** — 데스크톱 헤더 Budget 링크 + 모바일 하단 네비 링크
- **`en.json` / `ko.json`** — `budget*` i18n 키 49개 추가
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-27] — 가계부 Phase 4 ExpenseCard 위젯 재작성

### 변경
- **`ExpenseCard.jsx`** 완전 재작성
  - **입력 폼**: 대분류/소분류 드롭다운(API), 10개 통화 선택, 메모, 날짜
  - **대분류 → 소분류 자동 필터**: `category_id` 변경 시 소분류 목록 즉시 갱신
  - **인라인 수정**: 항목별 ✎ 버튼 → 행 확장 인라인 편집 폼
  - **지출 목록**: 대분류 아이콘 › 소분류 표시, 원래금액 + USD 환산액
  - **오늘 합계**: USD 기준, 이번달 예산 대비 % 바 (초과 시 빨간색)
  - **자정 자동 리셋**: 60초마다 날짜 변경 감지, 목록 재로드 (DB 보존)
  - **데이터 로드**: localStorage 캐시 폐기 → 모두 API 호출
    - `GET /api/expense?date=오늘`
    - `GET /api/expense/categories?lang=`
    - `GET /api/expense/summary/monthly` + `GET /api/expense/budget` (예산 비교)
  - **언어 지원**: `lang` prop에 따라 카테고리 이름 en/ko 전환, 전체 UI 반응
- **`index.css`** — 지출 섹션 전면 교체
  - `.exp-new-form`, `.exp-sel-pair`, `.exp-cur-row`, `.exp-desc-inp`, `.exp-date-row` 신규
  - `.exp-item-info`, `.exp-item-path`, `.exp-item-desc`, `.exp-item-right`, `.exp-item-amounts`
  - `.exp-converted` — USD 환산 표시 (입력통화 ≠ USD일 때)
  - `.exp-budget-block`, `.exp-budget-bar`, `.exp-budget-fill`, `.exp-budget-pct.over`
  - `.exp-edit-row`, `.exp-edit-grid`, `.exp-edit-btns`, `.btn-edit`, `.btn-sm--ghost`
- **`en.json` / `ko.json`** — 5개 키 추가: `expenseCatPh`, `expenseSubcatPh`, `expenseDescPh`, `expenseThisMonth`, `expenseOverBudget`, `expenseEditing`
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-27] — 가계부 Phase 3 백엔드 API (백엔드 전용)

### 신규
- **`routers/expense.py`** 신규 생성 — 19개 엔드포인트

#### 카테고리 API (`/api/expense/categories`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/expense/categories?lang=ko` | 기본값+내 카테고리 대분류/소분류 계층 반환 |
| POST | `/api/expense/categories` | 새 카테고리 추가 |
| PUT | `/api/expense/categories/{id}` | 내 카테고리 수정 |
| DELETE | `/api/expense/categories/{id}` | 내 카테고리 삭제 (기본값 불가) |

#### 지출 API (`/api/expense`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/expense?date=&year=&month=` | 지출 목록 (카테고리 정보 포함) |
| POST | `/api/expense` | 지출 추가 (자동 USD 환산) |
| PUT | `/api/expense/{id}` | 지출 수정 (amount/currency 변경 시 환산 재계산) |
| DELETE | `/api/expense/{id}` | 지출 삭제 |

#### 통계/요약 API
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/expense/summary/daily?date=` | 일별 목록+카테고리 합계+총합(USD) |
| GET | `/api/expense/summary/monthly?year=&month=` | 월별 카테고리 합계+예산대비+일별배열 |
| GET | `/api/expense/summary/yearly?year=` | 연간 월별합계+카테고리+전년대비 |
| GET | `/api/expense/stats?year=&month=` | 파이차트용 비율+최다지출+예산초과+일별추이 |

#### 예산 API (`/api/expense/budget`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/expense/budget?year=&month=` | 예산 목록+실지출+잔여 |
| POST | `/api/expense/budget` | 예산 설정 |
| PUT | `/api/expense/budget/{id}` | 예산 수정 |
| DELETE | `/api/expense/budget/{id}` | 예산 삭제 |

#### 환율 API (`/api/exchange-rates`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/exchange-rates` | 전체 환율 (30분 인메모리 캐시) |
| GET | `/api/exchange-rates/{currency}` | 특정 통화 환율 |
| POST | `/api/exchange-rates/refresh` | Yahoo Finance 강제 갱신 (admin 전용) |

### 백엔드 변경
- **`routers/expense.py`**
  - `expense_router` (`/expense`) + `exchange_router` (`/exchange-rates`) 두 라우터
  - 인라인 Pydantic 스키마: `CategoryIn`, `CategoryPatch`, `ExpenseIn`, `ExpensePatch`, `BudgetIn`, `BudgetPatch`
  - `_get_rate()` / `_to_usd()` — DB 환율 조회·환산 유틸
  - `_group_by_category()` — 카테고리별 집계 공용 함수
  - `do_refresh_rates()` — Yahoo Finance 환율 갱신 (APScheduler + admin API 공유)
  - 30분 인메모리 캐시 (`_rate_cache`, `_CACHE_TTL=1800`)
- **`main.py`**
  - `from routers.expense import expense_router, exchange_router, do_refresh_rates`
  - `_refresh_rates_job()` — async 래퍼 (SessionLocal 생성 후 do_refresh_rates 호출)
  - APScheduler `IntervalTrigger(minutes=30)` 환율 갱신 잡 등록
  - `expense_router`, `exchange_router` 라우터 등록

---

## [2026-05-27] — 가계부 Phase 2 기본 카테고리 시드 (백엔드 전용)

### 신규
- **`_seed_expense_categories()`** — 서버 시작 시 기본 카테고리 자동 생성
  - `user_id=NULL`, `is_default=True` 로 저장 (시스템 공용)
  - 이미 존재하면 전체 스킵 (중복 방지)
  - `db.flush()` 로 parent.id 확보 후 소분류 연결

### 기본 카테고리 데이터 (10대분류 / 44소분류)

| # | 대분류 (EN/KO) | 소분류 수 |
|---|---------------|---------|
| 1 | Utilities / 공과금 🏠 | 6 (전기·수도·가스·인터넷·전화·구독) |
| 2 | Food / 식비 🍽️ | 4 (장보기·외식·카페·배달) |
| 3 | Housing / 주거 🏡 | 4 (임대료·유지보수·가구·생활용품) |
| 4 | Transportation / 교통 🚗 | 5 (주유·보험·주차·대중교통·차량정비) |
| 5 | Health / 의료 🏥 | 5 (진료·치과·약국·헬스·안과) |
| 6 | Education / 교육 📚 | 4 (학비·교재·학용품·온라인강의) |
| 7 | Activities / 활동 🎯 | 4 (운동·엔터·취미·음악) |
| 8 | Travel / 여행 ✈️ | 5 (항공·숙박·식비·활동·교통) |
| 9 | Shopping / 쇼핑 🛍️ | 4 (의류·전자기기·선물·악세서리) |
| 10 | Other / 기타 📦 | 3 (기타·기부·저축) |

### 백엔드 변경
- **`main.py`** — `_DEFAULT_CATEGORIES` 데이터 상수 + `_seed_expense_categories()` 추가, lifespan 호출 등록

---

## [2026-05-27] — 가계부 Phase 1 DB 설계 (백엔드 전용)

### 신규
- **`expense_categories` 테이블** — 대분류/소분류 자기참조 구조
  - `user_id=NULL` = 시스템 기본 카테고리, `user_id=INT` = 사용자 커스텀
  - `parent_id=NULL` = 대분류, `parent_id=INT` = 소분류 (2단계 계층)
  - 이중언어 이름 (`name_ko`, `name_en`), 이모지 아이콘, 정렬 순서
- **`expense_budgets` 테이블** — 사용자별 카테고리별 예산
  - `month=NULL` = 연간 예산, `month=1~12` = 월별 예산
  - 통화 코드 지원 (DEFAULT `'USD'`)
- **`exchange_rates` 테이블** — USD 기준 환율 캐싱
  - UNIQUE `(base_currency, target_currency)` 제약
  - 서버 시작 시 USD 기준 9개 통화 기본값 자동 시드
- **`expenses` 테이블 확장** — Phase 1 신규 컬럼 5개 추가
  - `category_id`, `subcategory_id` (→ `expense_categories`, SET NULL)
  - `currency` DEFAULT `'USD'`
  - `converted_amount` NUMERIC(14,2) (USD 환산액)
  - `exchange_rate` NUMERIC(14,6) (적용 환율)

### 백엔드 변경
- **`models.py`** — `ExpenseCategory`, `ExpenseBudget`, `ExchangeRate` 모델 추가 / `Expense` 모델 확장
- **`main.py`**
  - 3개 신규 모델 import 추가
  - `_migrate_expense_columns()` — 기존 `expenses` 테이블에 신규 컬럼 안전 추가
  - `_seed_exchange_rates()` — USD 기준 환율 9쌍 초기 시드
  - `lifespan`에 두 함수 호출 추가
- **`DB_SCHEMA.md`** — 전체 스키마 문서 업데이트 (신규 테이블 4개 + FK 관계도 + 시작 작업 표)

---

## [2026-05-27] — 히어로 섹션 아날로그 시계 추가 및 동적 그리드 (HeroSection)

### 신규
- **`AnalogClock` SVG 컴포넌트** — 시침·분침·초침 포함, 매 1초 갱신
  - 12개 눈금 (3·6·9·12시 강조)
  - 초침 #e05c3a 색상, 중심 이중 원
- **동적 그리드 레이아웃** — clockCount에 따라 공란 없이 꽉 채움
  - 1개: `2fr 1fr` (시계 크게, 날씨 우측)
  - 2개: `1fr 1fr 0.85fr`
  - 3개: `1fr 1fr 1fr 0.85fr`

### 변경
- **`HeroSection.jsx`**
  - `tick(10s)` → `now(1s)` state로 교체 — 아날로그·디지털 동기화
  - `formatTZ` — `now` 인수 추가
  - 각 지역 셀: 지역명 → 아날로그시계 → 디지털시간 → 날짜 → TZ 순
  - 아날로그 크기: 1개=118px, 2개=90px, 3개=74px
  - 데스크톱 className `hero-inner--{n}` 으로 그리드 분기
- **`index.css`**
  - `.hero-inner` 고정 컬럼 제거 → `.hero-inner--1/2/3` 클래스 분기
  - `.time-zone` center 정렬 (align-items:center, text-align:center)
  - `.tz-analog` 새 클래스 추가
  - 디지털 시간 폰트 크기 소폭 조정 (아날로그와 균형)
  - 960px 미디어쿼리: 2컬럼 고정 + 3번째 시계 숨김
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-27] — 한글 주식 자동완성 드롭다운 수정 (AdminPage)

### 버그
- `StockDropdown`이 `position: fixed`임에도 `window.scrollY`/`window.scrollX`를 좌표에 더함
- `getBoundingClientRect()`는 이미 viewport 기준 좌표이므로, scroll 값을 더하면 드롭다운이 뷰포트 하단 밖으로 밀려나 보이지 않음
- 페이지 상단에서는 `scrollY ≈ 0`이라 정상처럼 보였지만, 주식 섹션으로 스크롤하면 드롭다운이 화면 밖으로 사라짐

### 수정
- **`frontend/src/pages/AdminPage.jsx`**
  - `StockDropdown` 포지셔닝에서 `window.scrollY`, `window.scrollX` 제거
  - `top: rect.bottom + 2`, `left: rect.left` (viewport 기준 좌표만 사용)
- **`frontend/dist/`** — 빌드 결과물 갱신

### 영향
- 한글 검색(`삼성전자` 등) 드롭다운 정상 표시
- 영어 티커 검색 드롭다운도 스크롤 시 올바른 위치에 표시

---

## [2026-05-27] — 시간대 설정 섹션 다국어 지원 (AdminPage)

### 변경
- **`frontend/src/locales/en.json`** — `admin` 섹션에 timezone 번역 키 22개 추가
  - `tzTitle`, `tzDesc`, `tzZone1~3`, `tzPlaceholder1~3`
  - 도시 이름 12개: `tzSeoul`, `tzTokyo`, `tzNY`, `tzLA`, `tzLondon`, `tzParis`, `tzSydney`, `tzDubai`, `tzSingapore`, `tzChicago`, `tzHK`, `tzBerlin`
- **`frontend/src/locales/ko.json`** — 동일 키 한국어 번역 추가
- **`frontend/src/pages/AdminPage.jsx`**
  - `ALL_TZ` 배열: `label` (하드코딩 한국어) → `labelKey` (번역 키)
  - 섹션 제목, 설명, 저장 버튼 → `t(lang, 'admin.tz...')` 사용
  - 지역 레이블 배열 → `t(lang, 'admin.tzZone1~3')`
  - 드롭다운 옵션 → `t(lang, 'admin.' + tz.labelKey)` (루프 변수 `t` → `tz` 충돌 해결)
  - placeholder → `t(lang, 'admin.tzPlaceholder${i+1}')` (지역별 예시 도시명)
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-27] — 언어 전환 실시간 반영 버그 수정 (LoginPage, RegisterPage, SuperadminPage)

### 문제
- 3개 페이지에서 `lang` 상수가 모듈 로드 시 IIFE로 1회만 평가되어, 언어를 바꿔도 새로고침 전까지 반영 안 됨

### 수정
- **`frontend/src/pages/LoginPage.jsx`**
  - `useEffect` import 추가
  - 모듈 레벨 `const lang = (() => ...)()` IIFE 제거
  - `const [lang, setLang] = useState(...)` (lazy initializer) 컴포넌트 내부로 이동
  - `window.addEventListener('languageChanged', ...)` + cleanup useEffect 추가
- **`frontend/src/pages/RegisterPage.jsx`** — LoginPage와 동일한 방식으로 수정
- **`frontend/src/pages/SuperadminPage.jsx`**
  - 모듈 레벨 IIFE 제거
  - `fmtDate(iso, lang)` — `lang` 파라미터 추가 (모듈 레벨 함수에서 클로저 의존성 제거)
  - `lang` state + languageChanged useEffect 컴포넌트 내부 추가
  - `fmtDate` 호출 3곳에 `lang` 인수 전달
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-26] — 전체 i18n 시스템 완전 재구축 (6개 페이지 + 중앙 번역 모듈)

### 신규 파일
- **`frontend/src/locales/ko.json`** — 중앙 한국어 번역 파일 (220줄)
  - 네임스페이스: `common`, `auth`, `profile`, `admin`, `superadmin`
  - 하위 호환 flat 키 포함 (위젯 컴포넌트용)
- **`frontend/src/locales/en.json`** — 중앙 영어 번역 파일 (동일 구조)
- **`frontend/src/i18n.js`** — 중앙 i18n 모듈
  - 점 표기법 네스팅 지원: `t(lang, 'auth.loginBtn')`
  - flat 키 하위 호환: `t(lang, 'stockTitle')`
  - `T` export: `T[lang]?.expenseCats` 직접 접근
  - 언어 없을 시 ko → 키명 순서로 폴백

### 변경
- **`frontend/src/pages/index/i18n.js`** → shim으로 교체 (`export { t, T } from '../../i18n'`)
- **`frontend/src/pages/index/IndexPage.jsx`** — `t(lang, 'admin')` → `t(lang, 'adminLink')` (JSON 키 충돌 해결)
- **`frontend/src/pages/AdminPage.jsx`** — 모든 flat `adminXxx` 키 → nested `admin.xxx` 키로 마이그레이션
- **`frontend/src/pages/LoginPage.jsx`** — i18n 완전 적용 (auth.xxx 네임스페이스)
- **`frontend/src/pages/RegisterPage.jsx`** — i18n 완전 적용 (auth.xxx 네임스페이스)
- **`frontend/src/pages/ProfilePage.jsx`** — i18n 완전 적용 (profile.xxx 네임스페이스), import 경로 수정
- **`frontend/src/pages/SuperadminPage.jsx`** — i18n 완전 적용 (superadmin.xxx + common.xxx)
- **`CLAUDE.md`** — 다국어(i18n) 규칙 섹션 추가
- **`frontend/dist/`** — 빌드 결과물 갱신

---

## [2026-05-26] — AdminPage.jsx 전체 i18n 적용 (한국어/영어)

### 변경
- **`i18n.js`** — AdminPage 번역 키 추가 (ko + en 동시)
  - 섹션 제목: `adminTitle`, `adminWidgetSettings`, `adminStockMgmt`, `adminSave`, `adminToDashboard`, `adminSaveAll`
  - 위젯 이름: `adminWHero` ~ `adminWSites` (9개)
  - 위젯 세부: `adminClockLabel`, `adminTempLabel`, `adminMax`, `adminMaxUnit`
  - 통화 옵션: `adminKRWOnly`, `adminUSDOnly`, `adminBothFull`
  - 주식 관리: `adminTotalDisplay`, `adminStockHint`, `adminNewGroup`, `adminDelGroup`, `adminDelStock`, `adminAddGroup`
- **`AdminPage.jsx`**
  - `import { t, T } from './index/i18n'` 추가
  - `WIDGET_LABELS` → `WIDGET_ICONS` + `WIDGET_LABEL_KEYS` 분리 (렌더 시 `t(lang, key)` 호출)
  - `widgetCfg` 초기화에 `localStorage.getItem('dashboard_lang')` 캐시 적용
  - `const lang = widgetCfg?.language ?? 'ko'` 파생
  - 헤더, 위젯 설정, 주식 관리 섹션의 모든 하드코딩 한국어 문자열 → `t(lang, key)`
  - 식단 끼니 표시: `T[lang]?.dietMeals[m]` (DB 키는 한국어 유지)
  - 뉴스 탭: `t(lang, 'newsKr')`, `t(lang, 'newsUs')`
  - `addGroup()` 새 그룹명: `t(lang, 'adminNewGroup')`
- **`frontend/dist/`** — 빌드 결과물 갱신 (`index-rFujoztq.js`)

---

## [2026-05-26] — frontend/dist 빌드 결과물 커밋 포함 (Railway 배포 반영)

### 수정
- `frontend/dist/` 최신 빌드 파일을 git에 포함 (i18n 적용 버전)
  - 추가: `index-3s16AGe_.js` (i18n 전체 적용)
  - 제거: `index-DBizcD0d.js` (구버전, i18n 없음)
- `CLAUDE.md` — 프론트엔드 빌드 규칙 추가:
  React 소스 수정 시 `npm run build` 실행 후 `frontend/dist/` 포함 커밋

### 원인
- Railway는 Python 앱으로 감지하여 `npm run build` 를 자동 실행하지 않음
- `main.py`가 커밋된 `frontend/dist/` 를 직접 서빙하므로
  dist가 미포함이면 소스 변경이 배포에 반영되지 않음

---

## [2026-05-26] — i18n 보완: 슈퍼어드민 버튼·ProfilePage 메시지 번역, 실시간 언어 전환

### 변경
- **`i18n.js`** — 3개 키 추가: `superadminBtn`, `langSaved`, `langSavingMsg`
- **`IndexPage.jsx`**
  - 슈퍼어드민 버튼 텍스트 `t(lang, 'superadminBtn')` 으로 번역 적용
  - `window.addEventListener('languageChanged', ...)` 추가 — ProfilePage에서 언어 저장 시 `widgetCfg.language` 즉시 업데이트 (같은 탭 내 실시간 반영)
- **`ProfilePage.jsx`**
  - `import { t } from './index/i18n'` 추가
  - `lang = widgetCfg?.language ?? 'ko'` 파생
  - 성공 메시지 `t(newLang, 'langSaved')` 번역 적용
  - "저장 중…" 스피너 `t(lang, 'langSavingMsg')` 번역 적용
  - localStorage 저장 직후 `window.dispatchEvent(new Event('languageChanged'))` 발생

---

## [2026-05-26] — 전체 UI 다국어(i18n) 적용 (한국어/영어)

### 추가
- **`frontend/src/pages/index/i18n.js`** — 신규 번역 파일 생성
  - `T` 객체: `ko` / `en` 두 언어, 헤더·위젯 제목·버튼·레이블 등 전체 UI 문자열 포함
  - `t(lang, key)` 헬퍼 함수 (ko 폴백 적용)

### 변경
- **`HeroSection.jsx`** — 날씨 코드(`WC`) 구조 재설계: 이모지 분리 + `W_DESC.ko/en` 맵으로 언어 즉시 전환, 새로고침 버튼·로딩 메시지 번역, 기본 시간대 지역명(내 위치/뉴욕/런던 ↔ My Location/New York/London)
- **`ScheduleCard.jsx`** — 제목·Google 계정 연동 버튼·새로고침 번역, `lang` prop 추가
- **`YoutubeCard.jsx`** — 제목·계정 레이블·빈 상태 메시지 번역, `lang` prop 추가
- **`StockCard.jsx`** — 제목·평균가 배지·평가손익·실현손익·전일比·합계 레이블 번역, `lang` prop 추가
- **`StockStatsOverlay.jsx`** — 뒤로 버튼·통계 제목·차트 축 레이블 번역, `lang` prop 추가
- **`ExpenseCard.jsx`** — 제목·합계·카테고리(식비→Food 등)·버튼 번역, `lang` prop 추가 (DB 저장값은 한국어 키 유지)
- **`DietCard.jsx`** — 제목·식단 유형(아침→Breakfast 등)·버튼 번역, `lang` prop 추가 (DB 저장값은 한국어 키 유지)
- **`MemoCard.jsx`** — 제목·플레이스홀더·수정/저장 버튼·저장 시각 포맷(시분 ↔ HH:MM) 번역, `lang` prop 추가
- **`NewsCard.jsx`** — 제목·탭(한국/미국 ↔ Korea/US) 번역, `lang` prop 추가
- **`SitesCard.jsx`** — 제목·빈 상태 메시지 번역, `lang` prop 추가
- **`IndexPage.jsx`** — `lang = widgetCfg?.language ?? 'ko'` 파생, 헤더(나의 하루·관리자·로그아웃)·서버 배너·모바일 네비 레이블 번역, 모든 위젯에 `lang={lang}` 전달

---

## [2026-05-25] — 언어 설정 저장/적용 버그 수정

### 버그
- `handleLangChange`에서 `fetch`는 HTTP 4xx/5xx에 throw하지 않음
  → PUT 실패해도 "저장되었습니다" 표시 (silent failure)
- IndexPage 초기 `widgetCfg = null` → API 응답 전까지 `language ?? 'ko'`로 한국어 표시

### 수정
- **`ProfilePage.jsx`** — `r.ok` 체크 추가: 4xx/5xx 시 실제 에러 메시지 표시,
  성공 시 `localStorage.setItem('dashboard_lang', newLang)` 캐시
- **`IndexPage.jsx`** — `widgetCfg` 초기값을 localStorage 캐시에서 읽어 즉시 언어 반영,
  `headerLangRef`, `headerDate` 초기값도 캐시 언어로 설정

---

## [2026-05-25] — 언어 설정 위치 이동 (대시보드 설정 → 프로필)

### 변경
- **언어 설정 UI를 `AdminPage` → `ProfilePage`로 이동**
- 프로필 페이지 "계정 정보" 섹션 아래 "언어 / Language" 섹션 추가
- 언어 선택 즉시 저장 (저장 버튼 없이 클릭하면 바로 API 저장)

### 언어 변경 자동 연동 (ProfilePage 동일하게 유지)
- 한국어 → °C, ₩ KRW, 한국어 날짜 형식
- English → °F, $ USD, 영어 날짜 형식
- 온도·통화를 위젯 설정에서 수동 변경한 경우 수동 설정 우선

### 파일 변경
- `AdminPage.jsx` — `handleLangChange()` 함수 및 언어 UI 블록 제거
- `ProfilePage.jsx` — `widgetCfg` / `langSaving` 상태 추가, 위젯 설정 로드 useEffect 추가, `handleLangChange()` 추가, 언어 선택 UI 추가

---

## [2026-05-25] — 헤더 슈퍼어드민 버튼 빨간색 스타일 적용

### 변경
- **`IndexPage.jsx`** — 슈퍼어드민 버튼 색상을 골드(admin-link)에서 빨간색 계열로 변경
  - `color: #c0392b`, `border: 1px solid rgba(192,57,43,0.45)`
  - role === 'admin' 조건부 표시는 기존 동일

---

## [2026-05-25] — admin_users 페이지 삭제 및 superadmin으로 통합

### 변경
- **`AdminUsersPage.jsx` 삭제** — superadmin 페이지로 완전 대체
- **`/admin_users` 라우트** → `/superadmin` 으로 리다이렉트 (기존 북마크 대응)
- **SuperadminPage 헤더 nav** — `회원관리(구)` 링크 제거

### 파일 변경
- `frontend/src/pages/AdminUsersPage.jsx` 삭제
- `App.jsx` — import 제거, `/admin_users` 라우트를 `<Navigate to="/superadmin" replace />` 로 교체
- `SuperadminPage.jsx` — 헤더 nav에서 `/admin_users` 링크 제거

---

## [2026-05-25] — 슈퍼어드민 회원 목록 역할 컬럼 추가

### 신규 기능
- **회원 목록 테이블 "역할" 컬럼 추가** — 플랜 컬럼 옆에 위치
  - admin: 빨간색 배지 (`badge-role-admin`)
  - premium: 골드 배지 (`badge-role-premium`)
  - free: 회색 배지 (`badge-role-free`)
  - guest: 연한 회색 배지 (`badge-role-guest`)
- 백엔드 `UserAdminOut`에 `role` 필드 이미 포함 — 백엔드 변경 없음

### 프론트엔드 변경
- **`SuperadminPage.jsx`** — `roleLabel()` 함수 추가, 테이블 헤더/바디에 역할 컬럼 추가, colSpan 11→12, 역할 배지 CSS 4종 추가

---

## [2026-05-25] — 슈퍼어드민 버튼 및 접근 제한 추가

### 신규 기능
- **헤더 슈퍼어드민 버튼** — `role === 'admin'`인 사용자에게만 표시, 클릭 시 `/superadmin` 이동
- **`/superadmin` 접근 제한** — `role !== 'admin'`이면 대시보드(`/`)로 리다이렉트

### 백엔드 변경
- **`routers/auth.py`** — `_create_token()`에 `role` 파라미터 추가, JWT payload에 `"role"` 포함
  - `register`, `login` 엔드포인트 모두 `user.role` 전달하도록 수정

### 프론트엔드 변경
- **`App.jsx`** — `getStoredRole()` 헬퍼 추가, `AdminRoleGuard` 컴포넌트 추가, `/superadmin` 라우트에 적용
- **`IndexPage.jsx`** — `userRole` 상태 추가, `/api/auth/me` + localStorage 캐시에서 role 읽기, 헤더에 슈퍼어드민 버튼 조건부 렌더링

---

## [2026-05-22] — 작업 요약

### 완료
- React 빌드 파일과 static HTML 충돌 문제 해결
- 불필요한 static 파일 정리 (login.html 제외)
- 위젯 동적 레이아웃 추가 (grid-auto-flow:row dense, 9개 위젯 span 적용)
- 언어 설정 기능 추가 (users.widget_config JSON에 language 저장)
- °C/°F 온도 단위 설정 기능 추가 (HeroSection.jsx tempUnit prop)

### 참고
- user_widget_settings 별도 테이블 없음 → users.widget_config JSON 블롭으로 통합 구현
- users.language 별도 컬럼 없음 → widget_config JSON 안에 language 포함

---

## [2026-05-22] — 대시보드 위젯 그리드 레이아웃 동적화

### 문제
- 위젯 숨기면 빈 공간이 그대로 남아 있었음
- `.card-stock{grid-column:3/4;grid-row:2/5}` 고정 위치가 레이아웃 깨뜨림

### 해결 (index.css 단독 변경)
- `grid-auto-flow: row dense` 적용 — 빈 자리에 다른 위젯이 자동으로 채움
- `align-items: start` 추가 — 카드 높이를 내용 기준으로 맞춤
- 모든 위젯 절대 위치(`1/2`, `3/4`, `grid-row:2/5`) → `span N` 방식으로 교체
  - 큰 위젯 (span 3): 시계/날씨(hero), 주식(stock)
  - 중간 위젯 (span 2): 지출, 식단, 유튜브, 즐겨찾기
  - 작은 위젯 (span 1): 일정, 메모, 뉴스
- 위젯 등장 애니메이션 추가 (`widget-in` keyframe: translateY + opacity 0.25s)
- 반응형 재정비:
  - PC (>960px): 3열 그리드
  - 태블릿 (640~960px): 2열, 대형 위젯 span 2, 중간 위젯 span 1로 자동 재배치
  - 모바일 (<640px): 기존 모바일 레이아웃 유지 (변경 없음)
- 불필요한 1100px 브레이크포인트 제거

---

## [2026-05-22] — 언어 설정 추가 (ko/en 자동 연동)

### 신규 기능
- **언어 선택** (🇰🇷 한국어 / 🇺🇸 English) — 관리자 위젯 설정 최상단에 추가
- **언어 변경 시 자동 연동:**
  - 온도 단위: ko → °C, en → °F (단, 수동 설정 시 수동 값 우선)
  - 날짜 형식: ko → `2026년 5월 22일 (목)`, en → `May 22, 2026 (Thu)`
  - 통화 표시: ko → ₩ 원화 우선, en → $ 달러 우선
- **수동 override**: °C/°F 버튼 클릭 시 `temp_unit_manual = true` 저장 → 이후 언어 변경에도 온도 단위 고정

### 백엔드 변경
- **`schemas.py`** — `DEFAULT_WIDGET_CONFIG`에 `"language": "ko"`, `"temp_unit_manual": False` 추가

### 프론트엔드 변경
- **`HeroSection.jsx`** — `lang` prop 추가; `formatTZ` locale 파라미터화; 날짜 문자열 언어별 분기
- **`AdminPage.jsx`** — `language` 필드 추가, `handleLangChange()` 함수 추가, °C/°F 버튼 클릭 시 `temp_unit_manual: true` 저장
- **`IndexPage.jsx`** — `useRef` 추가, `getHeaderDate(lang)` 파라미터화, 헤더 날짜 언어 동기화 useEffect 추가

---

## [2026-05-22] — 위젯 세부 옵션 추가 구현

### 신규 기능 (위젯별 상세 옵션)
- **시계/날씨** — 온도 단위 °C / °F 선택, 모바일 clockCount 버그 수정 (1개 시 보조 시계 미표시)
- **유튜브** — 최대 표시 채널 수 설정 (1~20개, 기본 10개)
- **주식** — 합계 표시 통화 선택 (₩ 원화만 / $ 달러만 / $ + ₩ 둘 다), 위젯 설정 → props 전달로 localStorage 우선순위 대체
- **식단** — 표시할 끼니 선택 (아침/점심/저녁/간식 개별 on/off)
- **뉴스** — 기본 탭 설정 (🇰🇷 한국 / 🇺🇸 미국)

### 백엔드 변경
- **`schemas.py`** — `DEFAULT_WIDGET_CONFIG`에 `temp_unit`, `max_count`, `currency_display`, `meals`, `default_tab` 필드 추가

### 프론트엔드 변경
- **`HeroSection.jsx`** — `tempUnit` prop 추가, Celsius↔Fahrenheit 변환, 모바일 clockCount 버그 수정
- **`DietCard.jsx`** — `mealConfig` prop 추가, 숨김 끼니 필터링
- **`NewsCard.jsx`** — `defaultTab` prop 추가, useEffect로 탭 동기화
- **`YoutubeCard.jsx`** — `maxCount` prop 추가, `channels.slice(0, maxCount)` 렌더링
- **`StockCard.jsx`** — `currencyDisplay` prop 추가, localStorage 폴백 유지
- **`IndexPage.jsx`** — 모든 컴포넌트에 widgetCfg 기반 신규 props 전달 (PC + 모바일)
- **`AdminPage.jsx`** — 위젯 설정 UI에 5개 옵션 컨트롤 추가 (°C/°F 버튼, 최대개수 입력, 통화 셀렉트, 끼니 체크박스, 뉴스탭 버튼)

---

## [2026-05-22] — 사용자별 위젯 설정 기능 추가

### 신규 기능
- **사용자마다 대시보드 위젯 on/off 독립 설정** 가능
- **시계 위젯: 표시 개수 1 / 2 / 3개 선택** 가능
- 설정은 DB(`users.widget_config`)에 저장되어 다른 기기에서 로그인해도 유지

### 백엔드 변경
- **`models.py`** — `User.widget_config TEXT` 컬럼 추가
- **`main.py`** — `_migrate_user_columns`에 `widget_config` 자동 마이그레이션 추가
- **`schemas.py`** — `DEFAULT_WIDGET_CONFIG`, `WidgetConfigUpdate`, `WidgetConfigOut` 추가
- **`routers/auth.py`** — `GET /api/auth/widget-config`, `PUT /api/auth/widget-config` 엔드포인트 추가

### 프론트엔드 변경
- **`HeroSection.jsx`** — `clockCount` prop 추가 (1·2·3개 지원)
- **`IndexPage.jsx`** — 위젯 설정 API 로드 + 9개 위젯 조건부 렌더링
- **`AdminPage.jsx`** — `① 위젯 설정` 섹션 추가 (토글 스위치 + 시계 개수 버튼)

### 지원 위젯
시계/날씨, 일정, 유튜브, 주식, 가계부, 식단, 메모, 뉴스, 즐겨찾기 (총 9개)

---

## [2026-05-22] — 불필요한 static 파일 정리 (login.html 제외)

### 삭제
React로 완전히 대체된 static 파일 7개 삭제. `login.html`은 `main.py` 마지막 폴백으로 참조 중이므로 유지.

| 삭제 파일 | React 대체 |
|-----------|-----------|
| `static/index.html` | `IndexPage.jsx` (route: `/`) |
| `static/admin.html` | `AdminPage.jsx` (route: `/admin`) |
| `static/admin_users.html` | `AdminUsersPage.jsx` (route: `/admin_users`) |
| `static/profile.html` | `ProfilePage.jsx` (route: `/profile`) |
| `static/register.html` | `RegisterPage.jsx` (route: `/register`) |
| `static/superadmin.html` | `SuperadminPage.jsx` (route: `/superadmin`) |
| `static/kr_stocks.json` | `frontend/public/kr_stocks.json` (빌드 시 dist로 복사) |

### 유지
- `static/login.html` — `main.py` line 410 마지막 폴백으로 명시적 참조 중, 삭제 금지

---

## [2026-05-22] — React 프론트엔드 전체 JWT Authorization 헤더 추가 (401 근본 수정)

### 배경
콘솔 로그 분석 결과 401 에러가 `static/index.html`·`admin.html`이 아닌 React 번들(`index-BeSkwyd0.js`)에서 발생함을 확인. React 소스 파일에 Authorization 헤더가 전혀 없었던 것이 근본 원인.

### 수정 (9개 파일, ~30개 fetch 호출)
- **`frontend/src/pages/index/IndexPage.jsx`** — `/api/timezone`, `/api/portfolio/groups` (×2), `/api/portfolio/snapshot` 에 Authorization 헤더 추가
- **`frontend/src/pages/index/ExpenseCard.jsx`** — GET·POST·DELETE `/api/expenses` 에 Authorization 헤더 추가, `authHeader()` 헬퍼 추가
- **`frontend/src/pages/index/DietCard.jsx`** — GET·POST·DELETE `/api/diets` 에 Authorization 헤더 추가, `authHeader()` 헬퍼 추가
- **`frontend/src/pages/index/MemoCard.jsx`** — GET(×2)·PUT·POST `/api/memos` 에 Authorization 헤더 추가, `authHeader()` 헬퍼 추가
- **`frontend/src/pages/index/SitesCard.jsx`** — GET `/api/bookmarks` 에 Authorization 헤더 추가
- **`frontend/src/pages/index/YoutubeCard.jsx`** — GET `/api/youtube-channels` 에 Authorization 헤더 추가
- **`frontend/src/pages/AdminPage.jsx`** — `authH()` 유틸 추가, `/api/portfolio/groups`(×4)·`/api/youtube-channels`(×3)·`/api/bookmarks`(×4)·`/api/timezone`(×2) 총 13개 호출에 Authorization 헤더 추가
- **`frontend/src/pages/AdminUsersPage.jsx`** — GET `/api/auth/users` 에 Authorization 헤더 추가
- **`frontend/src/pages/SuperadminPage.jsx`** — `/api/admin/users`·`/api/admin/stats` 등 8개 호출에 Authorization 헤더 추가

### 빌드
- `npm run build` 완료 → `frontend/dist/assets/index-Bq0xY0CZ.js` 생성

---

## [2026-05-22] — admin.html 주식 종목 저장 디버깅 로그 추가 (임시)

### 변경 (디버그 전용 — 확인 후 제거 예정)
- **`static/admin.html`** — 주식 종목 추가/저장 흐름 전체에 `console.log` 추가
  - `addStock()`: ticker·gid·토큰 값, 그룹 정보 출력
  - `saveGroups()`: 토큰 유효 여부, URL, 요청 헤더·body, 응답 status·body 전체 출력
  - `saveGroups()`을 async로 변경하여 응답 대기 후 로그 출력 가능하게 함
  - 브라우저 Console에서 `[addStock]`, `[saveGroups]` 그룹으로 확인

---

## [2026-05-22] — admin.html 네비게이션 가드 추가 (401 원인 수정)

### 수정
- **`static/admin.html`** — 페이지 상단에 로그인 토큰 체크 가드 추가
  - 토큰 없이 admin.html 직접 접근 시 `/login`으로 즉시 리다이렉트
  - `index.html`과 동일한 방식: `body{visibility:hidden}` → 인증 확인 후 표시
  - 원인: 가드 부재로 비로그인 상태 접근 시 `localStorage.getItem('token') = null` → `Authorization: Bearer null` → 서버 JWT decode 실패 → **401**

---

## [2026-05-22] — index.html · admin.html JWT Authorization 헤더 전면 추가

### 변경
- **`static/index.html`** — 모든 유저 데이터 API 호출에 `Authorization: Bearer <token>` 헤더 추가
  - `loadZones()` → `GET /api/timezone`
  - `renderYT()` → `GET /api/youtube-channels`
  - `renderStock()`, `_renderStatsContent()` → `GET /api/portfolio/groups`
  - `savePortfolioSnapshot()` → `POST /api/portfolio/snapshot`
  - `renderExp()`, `addExp()`, `delExp()` → expenses API
  - `renderMeal()`, `addMeal()`, `delMeal()` → diets API
  - `renderMemo()`, `memoEdit()`, `memoSave()` → memos API (GET/PUT/POST)
  - `renderSites()` → `GET /api/bookmarks`
- **`static/admin.html`** — 동일하게 유저 데이터 API 호출 전체 업데이트
  - `loadTZData()`, `saveTZ()` → timezone API (GET/PUT)
  - `loadYTChannels()`, `addYT()`, `delYT()` → youtube-channels API
  - `saveGroups()`, `initGroupsFromDB()` (초기로드 + 마이그레이션 저장) → portfolio/groups API
  - `loadSites()`, `addSite()`, `quickSite()`, `delSite()` → bookmarks API
- 공개 API(주식 시세·환율·검색·히스토리, `/api/health`)는 auth 헤더 미추가 (의도적)

---

## [2026-05-21] — 종합 요약

### 추가
- **회원 레벨 시스템** — `admin` / `premium` / `free` / `guest` 4단계 레벨 도입
  - `permissions` DB 테이블 신설 (role × permission_name × is_allowed, 28개 기본 시드)
  - `PUT /api/admin/users/{id}/role`, `GET /api/admin/permissions`, `PUT /api/admin/permissions` API
- **superadmin.html 권한 관리 탭** — 회원 목록 탭 / 권한 관리 탭 분리, 7권한 × 4레벨 토글 매트릭스
- **superadmin 접근 제한** — `jooyounglee321123@gmail.com` 이메일만 admin 자동 설정, 페이지 로드 시 role 검증 가드
- **헤더 로그아웃 버튼** — `static/index.html` 및 React `IndexPage.jsx` 헤더에 로그아웃 버튼 추가
- **`POST /api/auth/logout`** — 서버측 로그아웃 엔드포인트 추가
- **DB_SCHEMA.md** — 전체 12개 테이블 구조 최초 문서화

### 변경 (멀티유저 데이터 격리)
- **`models.py`** — `Expense`, `Diet`, `Memo`, `Stock`, `Bookmark`, `YoutubeChannel`, `DailyPortfolioSnapshot`에 `user_id FK` 추가
  - `TimezoneConfig`, `PortfolioGroups` — 단일 행 구조 → `user_id` 당 1행으로 재설계
  - `DailyPortfolioSnapshot` — UNIQUE `(snapshot_date)` → `(user_id, snapshot_date)` 변경
- **`main.py`** — `_migrate_add_user_id()` 자동 마이그레이션 추가 (기존 rows → user_id=1 백필)
- **모든 API 라우터** — JWT에서 `user_id` 추출 → 저장·조회 모두 로그인 사용자 데이터만 반환
  - `expenses`, `diets`, `memos`, `stocks`, `bookmarks`, `youtube_channels`, `timezone`, `portfolio` 전체 적용

---

## [2026-05-21] — 멀티유저 데이터 격리 (user_id FK 전면 도입)

### 변경
- **`models.py`**
  - `Expense`, `Diet`, `Memo`, `Stock`, `Bookmark`, `YoutubeChannel` — `user_id INTEGER NOT NULL FK → users.id CASCADE` 추가
  - `TimezoneConfig` — 단일 행 구조 폐기, `user_id` 추가 + `UNIQUE(user_id)` (`uq_timezone_user`)
  - `PortfolioGroups` — 단일 행 구조 폐기, `user_id` 추가 + `UNIQUE(user_id)` (`uq_portfolio_groups_user`)
  - `DailyPortfolioSnapshot` — `user_id INTEGER NULLABLE FK` 추가, UNIQUE 제약 `uq_snapshot_date` → `uq_user_snapshot_date(user_id, snapshot_date)` 변경
- **`main.py`**
  - `_migrate_add_user_id()` 함수 추가: 기존 테이블에 `user_id` 컬럼 자동 추가 + 기존 rows `user_id=1` 설정 + snapshot UNIQUE 제약 교체
  - `_daily_snapshot_job()`: scheduler 플레이스홀더 중복 방지를 위해 `user_id IS NULL` 조건 추가
- **`routers/expenses.py`, `diets.py`, `memos.py`, `stocks.py`, `bookmarks.py`, `youtube.py`**
  - 모든 CRUD 엔드포인트에 `get_current_user` 의존성 추가
  - 조회: `user_id == current_user.id` 필터, 생성: `user_id=current_user.id` 주입, 삭제: 소유권 확인
- **`routers/timezone.py`**
  - 단일 행 쿼리 → `user_id` 기준 UPSERT로 변경
- **`routers/portfolio.py`**
  - `get_groups`, `save_groups`, `save_snapshot`, `get_history`, `get_history_by_date` 모두 `user_id` 기준 격리
- **`DB_SCHEMA.md`** — 전체 테이블 스키마 업데이트 (user_id FK 관계 반영)

### 마이그레이션 전략
- 기존 데이터 `user_id = NULL` → `1` (admin 계정 소유로 이전)
- 서버 시작 시 `_migrate_add_user_id()` 자동 실행 (멱등성 보장)

---

## [2026-05-21] — DB 스키마 문서 추가

### 추가
- **`DB_SCHEMA.md`** — 전체 12개 테이블 구조 문서화
  - 테이블명, 컬럼명, 타입, 제약조건 상세 기록
  - Foreign Key 관계 요약 (`stock_price_history → stocks`)
  - 기본 권한 시드 매트릭스 (7권한 × 4레벨)
  - 서버 시작 시 자동 실행 작업 목록

---

## [2026-05-21] — superadmin 접근 제한 (admin 전용)

### 추가
- **`routers/auth.py`** — 가입 시 `jooyounglee321123@gmail.com` 이메일은 자동으로 `role = "admin"` 설정
- **`main.py`** — 서버 시작 시 `_seed_admin_email()`: 이미 가입된 경우에도 role을 admin으로 자동 업데이트
- **`main.py`** — `GET /superadmin` 전용 라우트 추가 (SPA catch-all 우선, `static/superadmin.html` 직접 서빙)
- **`static/superadmin.html`** — 페이지 로드 시 `/api/auth/me` role 검증 가드 추가: admin이 아니면 즉시 `/`로 리다이렉트

---

## [2026-05-21] — 회원 레벨 시스템 및 권한 관리 추가

### 추가
- **`models.py`** — `RolePermission` 모델 추가 (`permissions` 테이블: role × permission_name × is_allowed)
- **`schemas.py`** — `RoleUpdate`, `PermissionUpdateItem`, `PermissionBulkUpdate` 스키마 추가
- **`main.py`** — `_migrate_user_roles()` (레거시 'Member' → 'free' 변환), `_seed_default_permissions()` (기본 권한 시드)
- **`PUT /api/admin/users/{id}/role`** — 회원 레벨 변경 (admin/premium/free/guest)
- **`GET /api/admin/permissions`** — 레벨별 권한 목록 조회
- **`PUT /api/admin/permissions`** — 권한 일괄 수정

### 변경
- **`static/superadmin.html`**
  - 탭 구조 추가 (👥 회원 목록 / 🔒 권한 관리)
  - 회원 테이블에 "레벨" 컬럼 추가 (badge 표시)
  - 회원 모달에 "레벨 변경" 섹션 추가 (select + 저장 버튼)
  - 권한 관리 탭: 7개 권한 × 4개 레벨 토글 매트릭스 + 저장 버튼

---

## [2026-05-21] — 헤더 로그아웃 버튼 추가

### 추가
- **`static/index.html`** 헤더 — 프로필 아이콘 옆에 로그아웃 버튼 추가 (localStorage·sessionStorage 초기화 후 `/login` 이동)
- **`frontend/src/pages/index/IndexPage.jsx`** 헤더 — React 동일 로그아웃 버튼 추가 (`/api/auth/logout` 호출 후 navigate)
- **`POST /api/auth/logout`** — 서버측 로그아웃 엔드포인트 (JWT 무상태 특성상 클라이언트 삭제가 실질적 무효화)

---

## [2026-05-21] — 프로필 페이지 및 헤더 닉네임 기능 추가

### 추가
- **`static/profile.html`** — 프로필 페이지 (닉네임·이메일·플랜·가입일 표시, 닉네임 수정, 비밀번호 변경, 프로필 사진 업로드)
- **`frontend/src/pages/ProfilePage.jsx`** — React 프로필 페이지 (동일 기능, React SPA 라우팅)
- **`GET /api/auth/me`** — JWT 인증 기반 현재 사용자 프로필 조회 엔드포인트
- **`PUT /api/auth/me`** — 닉네임 변경 + 비밀번호 변경 엔드포인트
- **`schemas.py`** — `ProfileOut`, `ProfileUpdate` 스키마 추가
- **`routers/auth.py`** — `get_current_user` JWT 의존성 추가

### 변경
- **`static/index.html`** 헤더 — 로그인 시 "닉네임의 하루"로 표시, 우측에 프로필 아이콘(👤) 추가 → `/profile` 링크
- **`frontend/src/pages/index/IndexPage.jsx`** 헤더 — 동일 닉네임 표시 + 프로필 아이콘
- **`frontend/src/App.jsx`** — `/profile` 라우트 추가, `LoginGuard` 추가 (로그인 상태에서 `/login`·`/register` 접근 시 `/`로 리다이렉트), 미정의 경로 catch-all을 `/login`으로 수정

---

## [2026-05-21] — React + Vite 프론트엔드 전환 완료

### 추가
- **frontend/** — React 18 + Vite 5 + React Router v6 프론트엔드 세팅
  - `package.json`, `vite.config.js`, `index.html` (Vite 엔트리)
  - `src/main.jsx` — React 18 createRoot
  - `src/App.jsx` — BrowserRouter + AuthGuard (토큰 검사), 6개 라우트
  - `src/styles/globals.css` — 공유 디자인 시스템 CSS 변수 + 컴포넌트
  - `src/components/Toast.jsx` — useToast 훅 + Toast 컴포넌트
- **pages/LoginPage.jsx** — login.html 완전 변환 (JWT 로그인, 소셜 버튼 UI)
- **pages/RegisterPage.jsx** — register.html 완전 변환 (회원가입, 비밀번호 확인)
- **pages/AdminUsersPage.jsx** — admin_users.html 완전 변환 (회원 목록, 클라이언트 필터·페이지네이션)
- **pages/SuperadminPage.jsx** — superadmin.html 완전 변환 (슈퍼어드민, 디바운스 검색, 회원 상세 모달)
- **pages/AdminPage.jsx** — admin.html 완전 변환 (포트폴리오 그룹 CRUD, 매입/매도, 유튜브·북마크·타임존 설정)
- **pages/index/IndexPage.jsx** — index.html 완전 변환 (메인 대시보드)
  - PC 3컬럼 그리드 + 모바일 4탭 바텀 네비게이션 레이아웃
  - `HeroSection.jsx` — 3개 시간대 10초 클락 + 날씨 (geolocation + open-meteo API)
  - `StockCard.jsx` — 포트폴리오 그룹 실시간 시세 표시 (LIVE/평균가 뱃지, 평가손익/실현손익)
  - `StockStatsOverlay.jsx` — 전체화면 주식 통계 (Chart.js 파이/라인/바 차트)
  - `ExpenseCard.jsx` — 오늘 지출 CRUD
  - `DietCard.jsx` — 오늘 식단 CRUD (식사 유형별 그룹핑)
  - `MemoCard.jsx` — 하루 마무리 메모 CRUD
  - `NewsCard.jsx` — 한국/미국 뉴스 탭 (하드코딩 링크)
  - `YoutubeCard.jsx` — 즐겨찾기 유튜브 채널
  - `SitesCard.jsx` — 단골 사이트 북마크 (파비콘 자동 조회)
  - `ScheduleCard.jsx` — Google Calendar 연동 플레이스홀더
  - `index.css` — 인덱스 페이지 전용 CSS (PC 그리드, 모바일 카드, 주식 통계 오버레이)
  - 서버 헬스 배너 (30초 폴링), 23:59 데일리 스냅샷 타이머
- **frontend/public/kr_stocks.json** — static/kr_stocks.json 복사 (Vite 정적 서빙)

### 변경
- **main.py** 개별 HTML 라우트 (`/admin`, `/login`, `/register`, `/admin_users`, `/superadmin`) 제거
- **main.py** `StaticFiles(directory="static")` 마운트 제거
- **main.py** SPA catch-all `/{full_path:path}` 라우트 추가
  - `frontend/dist/` 실제 파일 우선 서빙 (JS/CSS/JSON 등)
  - 파일 없으면 `frontend/dist/index.html` 서빙 (React Router SPA 폴백)
  - `frontend/dist/` 미빌드 상태 시 `static/` 레거시 폴백 (개발 편의)

---

## [2026-05-19] — Railway DB 테이블 자동 생성 보장

### 수정
- **main.py** `models.py`의 모든 모델 클래스를 명시적으로 import
  - 기존: `from models import DailyPortfolioSnapshot` (단 1개)
  - 변경: User, Expense, Diet, Memo, Stock, StockPriceHistory, Bookmark, YoutubeChannel, TimezoneConfig, PortfolioGroups, DailyPortfolioSnapshot 전체 명시 import
  - `Base.metadata.create_all()`은 메모리에 올라온 모델만 처리하므로, 누락 시 해당 테이블이 DB에 생성되지 않음
- **main.py** `lifespan` 내 `create_all` 실행 로직 강화
  - 생성 전 예정 테이블 목록 로그 출력
  - `create_all` 실패 시 에러 로그 + 재크래시 (DB 없이 서버 구동 방지)
- **main.py** `/api/health` 응답에 테이블 비교 정보 추가
  - `tables_expected`: 코드(모델)에 정의된 테이블 목록
  - `tables_actual`: DB에 실제 존재하는 테이블 목록

---

## [2026-05-19] — Railway PostgreSQL DATABASE_URL 환경변수 연결 수정

### 수정
- **database.py** Railway 환경변수 탐색 로직 강화
  - 단일 `DATABASE_URL` 의존 → 5개 변수명 우선순위 순서 폴백 체인으로 변경
  - 탐색 순서: `DATABASE_URL` → `DATABASE_PRIVATE_URL` → `POSTGRES_URL` → `POSTGRESQL_URL` → `DATABASE_PUBLIC_URL` → SQLite 폴백
  - 서버 시작 시 어느 변수가 실제로 잡혔는지 로그 출력 (비밀번호 마스킹)
  - SQLite 폴백 시 경고 로그 출력
- **main.py** `/api/health` 응답에 디버깅 정보 추가
  - `db_var_used`: 실제로 사용된 환경변수명
  - `db_url_masked`: 마스킹된 연결 URL
  - `env_vars`: 5개 후보 변수의 설정 여부(set/not_set)
  - Railway 크래시 발생 시 헬스체크 URL로 즉시 원인 파악 가능

---

## [2026-05-19] — JWT 로그인 시스템 구현

### 추가
- **static/login.html** 신규 생성 — `/login` URL, 이메일·비밀번호 로그인 페이지
  - register.html과 동일한 디자인 언어 (Playfair + Noto Sans KR, 베이지 카드 레이아웃)
  - 구글/페이스북 소셜 로그인 버튼 UI (기능 준비 중 표시)
  - 비밀번호 눈 토글, 폼 검증, 성공 후 `/` 자동 리다이렉트
  - 페이지 로드 즉시 `sessionStorage.auth_pending = '1'` 설정 (Navigation Guard 우회)
- **routers/auth.py** `POST /api/auth/login` 엔드포인트 추가
  - bcrypt 비밀번호 검증 → JWT(30일 유효) 발급 → `AuthOut` 반환
  - 로그인 시 `last_login_at`, `login_count` 자동 업데이트
- **routers/auth.py** `POST /api/auth/register` 응답을 `UserOut` → `AuthOut`으로 변경
  - 가입 직후 토큰 자동 발급 → 별도 로그인 단계 없이 바로 대시보드 진입

### 변경
- **schemas.py** `UserLogin`(email+password), `AuthOut`(access_token+token_type+user) 스키마 추가
- **requirements.txt** `python-jose[cryptography]` 추가 (JWT 서명/검증)
- **main.py** `/login` 라우트 추가 → `static/login.html` 서빙
- **static/register.html** 로그인 링크 `/` → `/login` 변경, 토큰 저장 로직을 `AuthOut.access_token` 직접 사용으로 수정
- **static/index.html** Navigation Guard 미인증 리다이렉트 대상 `/register` → `/login` 변경
- **.gitignore** `dashboard_.txt` 추가 (토큰 유출 방지)

---

## [2026-05-19] — 슈퍼어드민 회원관리 페이지 구현

### 추가
- **static/superadmin.html** 신규 생성 — `/superadmin` URL, 관리자 전용 회원관리 페이지
  - 상단 요약 카드 5개 (전체 회원, 오늘 가입자, 유료 회원, 이번달 신규, 이번달 결제)
  - 회원 목록 테이블 (11개 컬럼: 번호·이름·이메일·가입일·플랜·플랜 만료일·상태·마지막 접속·로그인 횟수·누적 결제·기기)
  - 이름/이메일 검색(디바운스), 플랜/상태별 필터, 6가지 정렬 옵션
  - 회원 클릭 → 상세 모달: 플랜 변경, 계정 상태 변경(활성/비활성/정지), 임시 비밀번호 발급, 관리자 메모 저장
- **routers/admin.py** 신규 생성 — 어드민 전용 API 라우터
  - `GET  /api/admin/users`            — 검색·필터·정렬 파라미터 지원 회원 목록
  - `GET  /api/admin/stats`            — 요약 통계 (전체/오늘/프리미엄/이번달 신규·결제)
  - `GET  /api/admin/users/{id}`       — 회원 상세
  - `PUT  /api/admin/users/{id}/plan`  — 플랜 변경
  - `PUT  /api/admin/users/{id}/status`— 계정 상태 변경
  - `PUT  /api/admin/users/{id}/memo`  — 관리자 메모 저장
  - `POST /api/admin/users/{id}/reset-password` — 임시 비밀번호 발급
- **models.py** `User` 테이블에 9개 컬럼 추가: `name`, `plan`, `plan_expires_at`, `status`, `last_login_at`, `login_count`, `total_payment`, `primary_device`, `admin_memo`
- **schemas.py** `UserAdminOut`, `PlanUpdate`, `StatusUpdate`, `AdminMemoUpdate` 스키마 추가
- **main.py** `admin_router` 등록, `/superadmin` 라우트 추가, `_migrate_user_columns()` 마이그레이션 함수 추가 (기존 DB에 컬럼 안전 추가)

---

## [2026-05-15] — 회원가입 백엔드 API 및 프론트엔드 연동

### 추가
- **routers/auth.py** 신규 생성
  - `POST /api/auth/register` — 이메일·비밀번호 회원가입, bcrypt 해싱, 중복 이메일 409 처리
  - `GET  /api/auth/users`    — 관리자용 회원 목록 조회
- **schemas.py** `UserRegister`, `UserOut` Pydantic 스키마 추가
- **main.py** `auth_router` 등록 (`app.include_router`)
- **requirements.txt** `passlib[bcrypt]` 추가

---

## [2026-05-15] — 회원가입 UX 개선 (비밀번호 토글)

### 변경
- **static/register.html** 비밀번호·비밀번호 확인 입력창에 눈 아이콘 토글 버튼 추가
  - 외부 라이브러리 없이 이모지(👁️ / 🙈) + 순수 CSS/JS 로 구현
  - 클릭 시 `type="password"` ↔ `type="text"` 전환, aria-label 동기화

---

## [2026-05-15] — SaaS 회원가입 기초 구현 (2차)

### 변경
- **models.py** `User` 테이블에 `provider`(기본값 'local'), `provider_id` 컬럼 추가, `hashed_password` nullable 처리 (소셜 가입 대응)
- **static/register.html** '구글로 시작하기' / '페이스북으로 시작하기' 소셜 버튼 UI 추가 (디자인 전용, API 미연결)
- **static/admin_users.html** 회원 목록에 '가입경로(provider)' 컬럼·뱃지 추가, 가입경로 필터 추가

---

## [2026-05-15] — SaaS 회원가입 기초 구현

### 추가
- **models.py** — `User` 테이블 추가 (id, email, hashed_password, role 기본값 'Member', created_at)
- **static/register.html** — 이메일·비밀번호 회원가입 화면 (클라이언트 유효성 검사 포함)
- **static/admin_users.html** — 회원 목록 관리 화면 (이메일 검색, 역할 필터, 페이지네이션)
- **main.py** — `/register`, `/admin_users` 라우트 추가
- DB 시작 시 `Base.metadata.create_all` 로 User 테이블 자동 생성 확인 (기존 lifespan 활용)

---

## [2026-05-15]

### 추가 — 프로젝트 문서 전면 작성
- **README.md** 신규 작성 — 프로젝트 소개, 기술 스택, 로컬 실행 방법, Railway 배포 방법, 환경변수 목록
- **ERD.md** 신규 작성 — 전체 DB 테이블 구조, 컬럼 타입·설명, 테이블 관계
- **API.md** 신규 작성 — 전체 API 엔드포인트 목록, Method·URL·Input·Output·예시
- **ARCHITECTURE.md** 신규 작성 — 전체 시스템 구조도, 프론트/백/DB 관계, 핵심 설계 결정, 향후 기능 로드맵
- **DECISIONS.md** 전면 업데이트 — 프로젝트 시작(2026-05-09)부터 현재까지 모든 결정 사항 기록

### 수정 — `index.html` JS 문법 오류 + 파싱 안정화 (CSS 화면 출력 버그)
- **근본 원인 1**: `<style>` 블록 내 stray `</style>` 태그 → CSS 블록 조기 종료 → 이후 모든 CSS가 body 텍스트로 렌더링
- **근본 원인 2**: 주식 통계 바차트(`Chart.js`) 초기화 코드에서 `options:{}` 객체의 닫는 중괄호(`}`) 누락 → JS SyntaxError로 전체 스크립트 실행 불가
- **근본 원인 3**: `<script>` 블록 내 JS 템플릿 리터럴 안에 HTML 주석(`<!-- -->`) 포함 → 일부 브라우저 HTML 파서가 script data escaped 상태에서 오동작 가능
- **수정 1**: stray `</style>` 태그 제거 (CSS 블록 조기 종료 해결)
- **수정 2**: `_renderStatsContent()` 바차트 options 객체 `}` 추가 (JS 문법 오류 해결)
- **수정 3**: `<script>` 내 모든 HTML 주석(`<!-- -->`) 제거, 조건부 렌더링 → 삼항+문자열 연결로 대체
- **수정 4**: `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` 등 no-cache 메타 태그 3개 추가 (브라우저 캐시로 인한 구버전 서빙 방지)
- **수정 5**: `.claude/launch.json` runtimeExecutable 경로 수정 (`uvicorn` → 풀 Python 경로 + `-m uvicorn`)
- **검증**: Node.js `--check`로 JS 문법 오류 없음 확인, HTML 구조 및 script 블록 내 주석 없음 확인

---

## [2026-05-14] (2차)

### 수정 — 포트폴리오 데이터 DB 연동 (`admin.html` + `routers/portfolio.py` + `models.py`)
- **근본 원인 파악**: `admin.html`의 모든 주식 CRUD(addStock, delStock 등)가 `localStorage`만 사용하고 DB API(`/api/stocks`)를 전혀 호출하지 않았음
- **`PortfolioGroups` 테이블 신설** (`models.py`) — `stock_groups_v2` localStorage 전체 JSON을 단일 행(id=1)으로 DB에 저장
- **`GET /api/portfolio/groups`** 엔드포인트 추가 — DB에서 포트폴리오 그룹 전체 조회
- **`POST /api/portfolio/groups`** 엔드포인트 추가 — id=1 행 UPSERT (그룹 추가/수정/삭제 시 항상 전체 덮어쓰기)
- **`saveGroups()` 수정** (`admin.html`) — localStorage 저장 후 DB에도 비동기 POST (실패 시 localStorage 우선 유지)
- **`initGroupsFromDB()` 추가** (`admin.html`) — 페이지 로드 시 DB에서 그룹 데이터 우선 로드 후 localStorage 동기화; DB가 비어 있으면 localStorage 데이터를 DB에 push
- DB = source of truth: 재접속·다른 기기에서도 같은 데이터 유지

---

## [2026-05-14]

### 추가
- **DECISIONS.md 자동 기록 hook** — `.claude/settings.json`에 PostToolUse agent hook 설정. 파일 Write/Edit 시 claude-haiku-4-5가 중요 결정 여부를 판단하여 DECISIONS.md에 자동 추가
- **CLAUDE.md 규칙** — 변경 이력·결정 기록 자동화 규칙 추가

### 추가 — 삭제 UX 개선 (`admin.html`)
- 종목 [삭제] 버튼 클릭 시 브라우저 `confirm()` 대신 커스텀 경고 모달 표시
  - 메시지: "이 종목의 모든 거래내역이 삭제됩니다. 정말 삭제하시겠습니까?"
  - 확인 클릭 → `is_deleted: true` 로 숨김 처리 (데이터 보존, 화면에서만 제거)
  - 취소 클릭 → 아무것도 안 함
- `index.html` 렌더링 시 `is_deleted` 종목 자동 필터링

### 추가 — 데일리 포트폴리오 스냅샷
- **DB 테이블** `daily_portfolio_snapshot` 신규 생성 (`models.py`)
  - 컬럼: `snapshot_date` (UNIQUE), `usd_krw`, `total_usd`, `total_krw`, `total_krw_equiv`, `data` (JSON), `saved_by`
- **APScheduler** 백엔드 스케줄러 추가 (`main.py`)
  - 매일 23:59:00 KST 자동 실행
  - 당일 스냅샷 없으면 플레이스홀더 저장 (프런트 미수신 대비)
- **API 엔드포인트** (`routers/portfolio.py`) 신규
  - `POST /api/portfolio/snapshot` — 스냅샷 저장 (날짜별 UPSERT)
  - `GET /api/portfolio/history` — 전체 조회 (최신순)
  - `GET /api/portfolio/history/{date}` — 특정 날짜 조회
- **프런트엔드 스냅샷 트리거** (`index.html`)
  - `_startSnapshotTimer()` — 1분마다 체크, 23:59 감지 시 포트폴리오 데이터 자동 전송
  - `savePortfolioSnapshot()` — 그룹·종목·평가금액·손익·환율 포함 POST
- **apscheduler** 패키지 설치

---

## [2026-05-13]

### 추가 — 매입/매도 기능 (`admin.html`, `index.html`)
- 종목 행에 **[+ 매입] [- 매도] [삭제]** 버튼 추가
- **추가매입 팝업 모달**
  - 매입일 (달력, 선택), 수량 (필수), 매입가 (선택)
  - 날짜 O + 매입가 X → Yahoo Finance 해당일 종가 자동 조회
- **추가매도 팝업 모달**
  - 매도일 (달력, 선택), 수량 (필수, 보유수량 초과 불가), 매도가 (선택)
  - 보유수량 실시간 표시
- **종목 클릭 → 매입/매도 통합 내역 패널**
  - 날짜순 정렬, 매입(파란 뱃지) / 매도(빨간 뱃지) 구분
  - 행별 [삭제] 버튼
- **데이터 구조 확장** (`stock_groups_v2`)
  - `sells: [{id, date, qty, price}]` 배열 추가
  - 기존 데이터 자동 마이그레이션 (sells[] 초기화)
- **`index.html` 수치 계산 업데이트**
  - `holdQty = totalBuyQty - totalSellQty`
  - `avgBuyPrice` — 매입 내역 기준 가중평균
  - `evalPL` (평가손익) = `(현재가 - 평균매입가) × holdQty`
  - `realizedPL` (실현손익) — 매도 내역 있을 때만 표시
  - 평가금액도 `holdQty` 기준으로 계산

### 추가 — 백엔드 과거 시세 API
- `GET /api/stocks/history/{ticker}?date=YYYY-MM-DD&category=` 엔드포인트
  - 주말·공휴일이면 이후 첫 거래일 종가 반환
  - `.KS → .KQ` 코스닥 자동 재시도

---

## [2026-05-12]

### 추가 — 한국 주식 검색 자동완성
- `kr_stocks.json` 생성 (코스피 300 + 코스닥 105, 총 405 종목)
  - 삼성전자, SK하이닉스, LG에너지솔루션 등 주요 종목 포함
- 관리자 페이지 종목 추가 입력 자동완성
  - 한글 입력 → `kr_stocks.json` 로컬 검색
  - 영문/티커 입력 → Yahoo Finance API 검색
  - 숫자만 입력 (한국 종목 번호) → 한국 주식으로 처리

### 추가 — 티커 ↔ 종목명 연동
- 티커 입력 시 Yahoo Finance에서 회사명 자동 조회 → 종목명 필드 자동 입력
- 종목명 입력 시 검색 드롭다운 표시 → 선택 시 티커 자동 입력

---

## [2026-05-11]

### 추가 — 매입 내역 관리 (`admin.html`)
- 종목 클릭 → 매입 내역 확장 패널 표시
- 매입 내역 추가: 날짜(달력), 수량(필수), 매입가(선택)
- 매입 내역 수정/삭제
- 날짜 O + 매입가 X → Yahoo Finance 종가 자동 조회

### 변경 — 포트폴리오 데이터 구조
- 종목별 `purchases: [{id, date, qty, price}]` 배열 도입
- 기존 `quantity` / `avgPrice` 단일 필드 → `purchases[]` 자동 마이그레이션
- 가중평균 계산: `sum(price × qty) / sum(qty)`

---

## [2026-05-10]

### 추가 — 보유주식 섹션 전면 개편
- **admin.html**: 그룹 기반 포트폴리오 관리
  - 최대 10개 그룹, 그룹당 최대 10개 종목
  - 그룹별 통화 설정 (KRW / USD)
  - 그룹 색상 자동 지정 (10가지)
- **index.html**: 실시간 시세 대시보드
  - Yahoo Finance 실시간 시세 (60초 캐시)
  - USD/KRW 환율 자동 조회 (KRW=X)
  - LIVE / 평균가 뱃지 표시
  - 수익률, 전일 대비 등락 표시
  - 전체 합계 표시 방식 선택 (KRW / USD / 분리)
  - `AbortController` 7초 타임아웃으로 무한 스피너 방지
- **데이터 저장**: `localStorage` (`stock_groups_v2` 키)

---

## [2026-05-09]

### 초기 설정
- FastAPI + SQLAlchemy + Uvicorn 기반 대시보드 프로젝트 구성
- `.claude/launch.json` 개발 서버 설정 저장
- `~/.claude/settings.json` 전역 Bash 자동 허용 설정
- `CLAUDE.md` 프로젝트 지침 파일 생성
- **DB 테이블 초기 생성**
  - `expenses` — 지출 내역
  - `diets` — 식단 기록
  - `memos` — 메모
  - `stocks` — 보유 종목 (카테고리별, 최대 10개)
  - `stock_price_history` — 일별 시세 스냅샷
  - `bookmarks` — 북마크
  - `youtube_channels` — 유튜브 채널
  - `timezone_config` — 시간대 설정
- **API 라우터 초기 구성**
  - GET/POST/DELETE 기본 CRUD (expenses, diets, memos, bookmarks, youtube-channels)
  - GET/POST/PUT/DELETE stocks + 실시간 시세, 환율, 검색
  - GET/PUT timezone
- SQLite(로컬) ↔ PostgreSQL(Railway) 자동 전환 구현 (`database.py`)
- `.env.example` 환경변수 예시 파일 생성
