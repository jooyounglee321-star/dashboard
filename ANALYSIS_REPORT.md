# 코드베이스 분석 보고서
생성일: 2026-06-11

## 요약
- 총 분석 파일 수: 36개 (백엔드 14개, 프론트엔드 22개)
- 발견된 문제 수: 47건 (높음 14건 / 중간 22건 / 낮음 11건)
- 예상 전체 수정 소요 시간: 약 10시간 25분

---

## 1. 예외처리 누락 (14건)

### [HIGH-1] /api/auth/users 엔드포인트 인증 없음
- **파일**: `routers/auth.py`
- **위치**: L249-256
- **내용**: GET /api/auth/users (전체 회원 목록 반환)에 get_current_user 의존성 없음. 누구든 토큰 없이 전체 회원 이메일 조회 가능
- **코드**: `def list_users(db: Session = Depends(get_db)):` — admin 체크 없음
- **심각도**: 높음
- **예상 수정 시간**: 5분

### [HIGH-2] admin 라우터 전체 인증 없음
- **파일**: `routers/admin.py`
- **위치**: L29-190 전체
- **내용**: /api/admin/* 엔드포인트 전체(회원 조회/수정/권한 변경/비밀번호 초기화)에 get_current_user 의존성 없음. 누구든 호출 가능
- **코드**: `def list_admin_users(... db: Session = Depends(get_db)):` — 인증 없음
- **심각도**: 높음
- **예상 수정 시간**: 15분

### [HIGH-3] income 카테고리 조회 인증 없음
- **파일**: `routers/income.py`
- **위치**: L71-117
- **내용**: GET /api/income/categories 엔드포인트에 get_current_user 의존성 없음
- **코드**: `def list_income_categories(lang: str = ..., db: Session = Depends(get_db)):`
- **심각도**: 높음
- **예상 수정 시간**: 5분

### [HIGH-4] ExpenseCard — addExpense fetch에 catch 없음
- **파일**: `frontend/src/pages/index/ExpenseCard.jsx`
- **위치**: L416-463
- **내용**: addExpense() 함수에서 수입/지출 등록 fetch 호출 후 에러 처리 없음. finally만 있고 catch가 없어 실패 시 사용자에게 오류 안내 불가
- **코드**: `await fetch('/api/income', {...})` — catch 없음
- **심각도**: 높음
- **예상 수정 시간**: 10분

### [HIGH-5] ExpenseCard — saveEdit fetch에 catch 없음
- **파일**: `frontend/src/pages/index/ExpenseCard.jsx`
- **위치**: L491-508
- **내용**: saveEdit() 함수에서 PUT 요청 후 에러 핸들링 없음. 저장 실패해도 UI는 editId=null로 복귀
- **코드**: `await fetch('/api/expense/' + editId, {...})` — catch 없음
- **심각도**: 높음
- **예상 수정 시간**: 5분

### [HIGH-6] IndexPage — 백필 fetch response.ok 체크 없음
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L100-107
- **내용**: 포트폴리오 백필 POST 요청에서 r.json() 전에 r.ok 체크 없음. 에러 응답도 파싱 시도
- **코드**: `.then(r => r.json())` — r.ok 체크 없음
- **심각도**: 높음
- **예상 수정 시간**: 5분

### [HIGH-7] do_refresh_rates 부분 commit 위험
- **파일**: `routers/expense.py`
- **위치**: L862-893
- **내용**: do_refresh_rates()에서 루프 내 개별 통화 실패는 failed 목록에 추가하지만, 성공한 통화만 db.commit()하는 구조. 루프 중간 DB 연결 오류 시 부분 commit 후 예외 전파되어 불일치 상태 발생 가능
- **심각도**: 높음
- **예상 수정 시간**: 15분

### [HIGH-8] DB 트랜잭션 롤백 누락 — backfill 함수 외부
- **파일**: `routers/portfolio.py`
- **위치**: L382-388
- **내용**: backfill_portfolio_snapshots 내 루프에서 개별 날짜 처리 실패 시 db.rollback()은 있지만, 루프 외부 최초 조회/처리 단계 예외 시 롤백 없음
- **심각도**: 높음
- **예상 수정 시간**: 10분

### [HIGH-9] BudgetPage — DailyTab useEffect 의존성 누락 stale closure
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L257
- **내용**: useEffect(() => { load() }, [date, lang])에 eslint-disable-next-line으로 load가 의존성에서 제외됨. load가 stale closure 참조 가능
- **심각도**: 높음
- **예상 수정 시간**: 15분

### [HIGH-10] localStorage 접근 try/catch 누락 — IndexPage 다수 위치
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L98, L136, L141, L163
- **내용**: localStorage.getItem('token'), localStorage.getItem('user') 등이 try/catch 없이 직접 호출됨. Safari Private 모드 등에서 localStorage 접근 불가 시 앱 크래시
- **코드**: `const token = localStorage.getItem('token')` — try/catch 없음
- **심각도**: 높음
- **예상 수정 시간**: 20분

### [MEDIUM-11] AdminPage — WRITE 작업 response.ok 체크 없음
- **파일**: `frontend/src/pages/AdminPage.jsx`
- **위치**: L115-145
- **내용**: addYT, addSite, quickSite, delYT, delSite 등 WRITE 작업에서 응답 상태 코드 확인 없이 다음 단계 진행
- **코드**: `await fetch('/api/youtube-channels', {...})` — r.ok 체크 없음
- **심각도**: 중간
- **예상 수정 시간**: 20분

### [MEDIUM-12] income.py — db.query().get() deprecated 사용
- **파일**: `routers/income.py`
- **위치**: L152
- **내용**: db.query(ExpenseCategory).get(cat_id)는 SQLAlchemy 2.0에서 deprecated. db.get(ExpenseCategory, cat_id)로 교체 필요
- **코드**: `c = db.query(ExpenseCategory).get(cat_id)`
- **심각도**: 중간
- **예상 수정 시간**: 5분

### [MEDIUM-13] portfolio.py — yfinance 배치 조회 실패 시 빈 dict 반환으로 스냅샷 0원 저장
- **파일**: `routers/portfolio.py`
- **위치**: L80-83
- **내용**: _get_historical_prices_batch에서 예외 발생 시 logger.warning 후 빈 dict 반환. 해당 티커 가격 없음으로 처리되어 스냅샷이 0원으로 저장될 수 있음
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [LOW-14] database.py — get_db() 함수에서 명시적 rollback 없음
- **파일**: `database.py`
- **위치**: L106-111
- **내용**: get_db() 의존성 함수가 finally: db.close()만 있고 요청 도중 예외 발생 시 db.rollback()을 명시적으로 호출하지 않음
- **심각도**: 낮음
- **예상 수정 시간**: 5분

---

## 2. 중복 코드 (12건)

### [MED-15] authH() 패턴 다수 파일 중복 정의
- **파일**: `frontend/src/pages/AdminPage.jsx` L11, `frontend/src/pages/index/ExpenseCard.jsx` L356
- **위치**: 각 파일 상단
- **내용**: `const authH = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })` 가 적어도 2개 파일에 별도 정의. IndexPage 등에서도 인라인으로 중복 작성
- **심각도**: 중간
- **예상 수정 시간**: 20분

### [MED-16] todayStr() / pad2() 함수 중복 정의
- **파일**: `frontend/src/pages/BudgetPage.jsx` L35-44, `frontend/src/pages/index/ExpenseCard.jsx` L24-30
- **위치**: 각 파일 상단
- **내용**: todayStr(), pad2() 함수가 두 파일에 각각 별도로 정의됨
- **심각도**: 중간
- **예상 수정 시간**: 15분

### [MED-17] _get_rate() 함수 두 라우터에 복사
- **파일**: `routers/expense.py` L87-94, `routers/income.py` L47-53
- **위치**: 각 파일 유틸 섹션
- **내용**: 동일한 _get_rate(currency, db) 함수가 두 라우터에 완전히 동일하게 복사됨
- **심각도**: 중간
- **예상 수정 시간**: 15분

### [MED-18] _cat_name() 함수 두 라우터에 중복
- **파일**: `routers/expense.py` L103-104, `routers/income.py` L66-67
- **위치**: 각 파일 유틸 섹션
- **내용**: def _cat_name(cat, lang) 함수가 두 파일에 동일하게 정의
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-19] 카테고리 목록 fetch — ExpenseCard와 BudgetPage 각각 별도 호출
- **파일**: `frontend/src/pages/index/ExpenseCard.jsx` L360-364, `frontend/src/pages/BudgetPage.jsx` L219-228
- **위치**: loadCategories 함수
- **내용**: /api/expense/categories를 ExpenseCard, BudgetPage/DailyTab이 각각 독립적으로 fetch함. 공유 context나 캐시 없음
- **심각도**: 중간
- **예상 수정 시간**: 30분

### [MED-20] 환율 목록 fetch — BudgetPage와 IndexPage 각각 별도 호출
- **파일**: `frontend/src/pages/BudgetPage.jsx` L128-133, `frontend/src/pages/index/IndexPage.jsx` L248
- **위치**: useEffect 내부
- **내용**: /api/exchange-rates와 /api/stocks/exchange-rate가 여러 컴포넌트에서 각각 별도 fetch됨
- **심각도**: 중간
- **예상 수정 시간**: 30분

### [MED-21] calcStock 로직 — IndexPage와 StockCard에 중복 구현
- **파일**: `frontend/src/pages/index/IndexPage.jsx` L310-329, `frontend/src/pages/index/StockCard.jsx` L17-39
- **위치**: 주식 평가액 계산 로직
- **내용**: 매수/매도 수량 계산, 가중평균 매수가, 평가손익 계산 로직이 IndexPage 스냅샷 부분과 StockCard calcStock에 거의 동일하게 중복
- **심각도**: 중간
- **예상 수정 시간**: 30분

### [LOW-22] i18n flat 키와 namespace 키 혼재
- **파일**: `frontend/src/locales/ko.json`, `frontend/src/locales/en.json`
- **위치**: 최상단 flat 키들
- **내용**: admin.wMemo 같은 namespace 키 외에 레거시 flat 키가 일부 혼재. 번역 키 체계 불일치
- **심각도**: 낮음
- **예상 수정 시간**: 30분

### [LOW-23] CURRENCIES 배열 — BudgetPage와 ExpenseCard에 각각 정의
- **파일**: `frontend/src/pages/BudgetPage.jsx` L13, `frontend/src/pages/index/ExpenseCard.jsx` L9-20
- **위치**: 파일 상단 상수
- **내용**: CURRENCIES 상수 배열이 두 파일에 각각 별도 정의됨 (형태도 약간 다름)
- **심각도**: 낮음
- **예상 수정 시간**: 15분

### [LOW-24] IndexPage — tickerCatMap 빌드 코드 2회 복사
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L237-239 (loadStocks), L286-290 (23:59 스냅샷)
- **내용**: tickerCatMap 빌드 코드가 loadStocks와 23:59 스냅샷 intervalHandler에 완전히 동일하게 2회 복사
- **심각도**: 낮음
- **예상 수정 시간**: 15분

### [LOW-25] SYM 통화 심볼 맵 — BudgetPage에서만 별도 정의
- **파일**: `frontend/src/pages/BudgetPage.jsx` L14
- **위치**: 파일 상단
- **내용**: `const SYM = { USD: '$', KRW: '₩', ... }` 이 BudgetPage에서 별도 정의됨
- **심각도**: 낮음
- **예상 수정 시간**: 10분

### [LOW-26] 월 이름 배열 — BudgetPage ML과 IndexPage MON/MON_EN 이원화
- **파일**: `frontend/src/pages/BudgetPage.jsx` L16-19, `frontend/src/pages/index/IndexPage.jsx` L25-26
- **위치**: 파일 상단 상수
- **내용**: 월 이름 배열이 BudgetPage의 ML 객체와 IndexPage의 MON/MON_EN 배열로 이원화
- **심각도**: 낮음
- **예상 수정 시간**: 10분

---

## 3. 비효율적인 로직 (12건)

### [HIGH-27] income.py — list_incomes의 행당 4회 DB 쿼리 (N+1 최심각)
- **파일**: `routers/income.py`
- **위치**: L148-176
- **내용**: 각 expense 행마다 _cat_info(e.category_id)를 2번, _cat_info(e.subcategory_id)를 2번 호출 → 한 행당 4회 DB 쿼리. 100건 조회 시 400회 추가 쿼리 발생
- **코드**: `"category_code": _cat_info(e.category_id)[1], "category_name": _cat_info(e.category_id)[2]` — 동일 id 2회 조회
- **심각도**: 높음
- **예상 수정 시간**: 20분

### [HIGH-28] expense.py — _group_by_category 함수 내 N+1 쿼리
- **파일**: `routers/expense.py`
- **위치**: L169
- **내용**: _group_by_category 함수가 summary_daily, summary_monthly, summary_yearly, expense_stats 등에서 호출되며 내부에서 db.get(ExpenseCategory, e.category_id)를 각 지출 항목마다 호출
- **코드**: `cat = db.get(ExpenseCategory, e.category_id) if e.category_id else None`
- **심각도**: 높음
- **예상 수정 시간**: 30분

### [MED-29] expense.py — _expense_dict 함수 내 N+1 쿼리
- **파일**: `routers/expense.py`
- **위치**: L124-125
- **내용**: _expense_dict 함수 내에서 db.get(ExpenseCategory, e.category_id)와 db.get(ExpenseCategory, e.subcategory_id) 호출. list_expenses, summary_daily 등에서 루프 내 호출됨
- **심각도**: 중간
- **예상 수정 시간**: 25분

### [MED-30] portfolio.py — 스냅샷 히스토리 전체 반환 (페이지네이션 없음)
- **파일**: `routers/portfolio.py`
- **위치**: L496-508
- **내용**: GET /api/portfolio/history가 사용자의 전체 스냅샷을 페이지네이션 없이 반환. 1년 이상 사용 시 365건+ 전체 반환
- **코드**: `db.query(DailyPortfolioSnapshot).filter(...).all()`
- **심각도**: 중간
- **예상 수정 시간**: 20분

### [MED-31] ExpenseCard — useEffect 의존성 배열 누락 (eslint-disable 주석)
- **파일**: `frontend/src/pages/index/ExpenseCard.jsx`
- **위치**: L389-412
- **내용**: useEffect 훅 3개에서 eslint-disable-line 주석으로 의존성 경고를 무시. 잠재적 stale closure 버그
- **코드**: `}, [lang]) // eslint-disable-line`
- **심각도**: 중간
- **예상 수정 시간**: 20분

### [MED-32] BudgetPage — SummaryTab에서 최근 12개월 데이터를 12번 개별 fetch
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L1270-1284
- **내용**: SummaryTab의 load() 함수에서 Promise.all로 12개월 데이터를 /api/expense/summary/monthly에 12번 개별 호출. 서버 연도별 집계 엔드포인트(/api/expense/summary/yearly)를 활용하면 2회로 줄일 수 있음
- **심각도**: 중간
- **예상 수정 시간**: 30분

### [MED-33] IndexPage — 23:59 스냅샷 핸들러에서 loadStocks 로직 재구현
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L273-358
- **내용**: 23:59 스냅샷 저장 로직이 loadStocks와 거의 동일한 코드를 독립적으로 재구현. loadStocks 결과를 재활용하거나 공용 함수 추출 필요
- **심각도**: 중간
- **예상 수정 시간**: 30분

### [MED-34] AdminPage — saveAll()이 widgetCfg 저장 누락
- **파일**: `frontend/src/pages/AdminPage.jsx`
- **위치**: L187-193
- **내용**: saveAll()이 saveTZ()만 호출하고 saveWidgetCfg()는 별도로 호출해야 함. 단일 저장 버튼이 불완전한 저장 동작을 함
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-35] expense.py — list_budgets 루프 내 _get_rate 호출
- **파일**: `routers/expense.py`
- **위치**: L614-615
- **내용**: list_budgets 루프 내에서 각 예산 항목마다 _get_rate(b.currency, db) 호출
- **심각도**: 중간
- **예상 수정 시간**: 15분

### [LOW-36] StockCard — calcStock 매 렌더마다 재계산 (useMemo 없음)
- **파일**: `frontend/src/pages/index/StockCard.jsx`
- **위치**: L17-39
- **내용**: calcStock(s, priceMap)이 useMemo 없이 매 렌더마다 호출됨. priceMap/groups 변경 없어도 불필요한 재계산
- **심각도**: 낮음
- **예상 수정 시간**: 15분

### [LOW-37] BudgetPage — 삭제 후 load() + 별도 daily-compare 중복 API 호출
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L729
- **내용**: 삭제 버튼 onClick에서 delItem() + 별도 apiGet('/api/expense/daily-compare...') 2번 호출. 이미 load() 내부에서 daily-compare를 포함하므로 중복 API 호출 발생 가능
- **심각도**: 낮음
- **예상 수정 시간**: 10분

### [LOW-38] BudgetPage — 차트 useEffect에서 destroyCharts() 중복 호출
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L787-924
- **내용**: 차트 생성 useEffect 첫 줄에서 destroyCharts() 호출 후 마지막에 return () => destroyCharts() 반환. 중복 소멸로 잠재적 Double-destroy 오류
- **심각도**: 낮음
- **예상 수정 시간**: 5분

---

## 4. 잠재적 버그 (9건)

### [HIGH-39] IndexPage — loadStocks race condition 가능성
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L223-267
- **내용**: loadStocks는 useCallback으로 정의되고 useEffect로 마운트 시 호출. 빠른 재마운트나 HMR 시 이전 비동기 fetch가 완료되기 전 새 fetch가 시작되어 priceMap 상태가 이전/최신 데이터 혼재될 수 있음. AbortController가 있으나 dbRes fetch에는 적용 안 됨
- **심각도**: 높음
- **예상 수정 시간**: 20분

### [MED-40] portfolio.py — usd_krw None 시 total_krw_equiv None으로 저장
- **파일**: `routers/portfolio.py`
- **위치**: L349-351
- **내용**: `total_krw_equiv = round(total_usd * usd_krw + total_krw, 2) if usd_krw else None` — usd_krw가 None이면 total_krw_equiv도 None으로 저장되어 차트에서 해당 날짜가 공백으로 표시될 수 있음
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-41] BudgetPage — monthly.by_category null 체크 불일치
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L901 및 각처
- **내용**: monthly.by_category?.filter(...) optional chaining 있는 곳과 없는 곳이 혼재. null 가능성 있는 값에 일관성 없는 방어 코드
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-42] BudgetPage — saveEdit 오류 발생 시 편집 내용 유실
- **파일**: `frontend/src/pages/BudgetPage.jsx`
- **위치**: L347-365
- **내용**: saveEdit()에서 apiReq 실패 시 catch에서 에러 로그만 출력하고 setEditId(null) + load() 진행. 사용자는 저장 실패를 인지 못하고 편집 내용 유실
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-43] income.py — 월별 요약 LEFT JOIN에서 null 합산 시 타입 오류 가능
- **파일**: `routers/income.py`
- **위치**: L280-299
- **내용**: income_monthly_summary에서 LEFT JOIN 결과의 total_usd가 None인 경우 float(r.total_usd or 0)으로 처리하지만, sqlfunc.sum()이 None 반환 시 Pydantic 직렬화 오류 가능
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [MED-44] IndexPage — 스냅샷 저장 중 5xx 오류 시 조용히 실패
- **파일**: `frontend/src/pages/index/IndexPage.jsx`
- **위치**: L344-351
- **내용**: 23:59 스냅샷 POST 요청에서 r.ok 체크 후 lastSnapshotDate = today 설정은 있으나, 서버 5xx 오류 응답 시 조용히 실패하고 다음 분에 재시도 없음
- **심각도**: 중간
- **예상 수정 시간**: 10분

### [LOW-45] auth.py — JWT SECRET_KEY 기본값 하드코딩
- **파일**: `routers/auth.py`
- **위치**: L25
- **내용**: SECRET_KEY = os.getenv("SECRET_KEY", "dashboard-dev-secret-change-in-production") — 프로덕션에서 환경변수 미설정 시 약한 키 사용. 경고 로그 없음
- **심각도**: 낮음
- **예상 수정 시간**: 10분

### [LOW-46] main.py — CORS allow_origins=["*"] 프로덕션 위험
- **파일**: `main.py`
- **위치**: L797-802
- **내용**: allow_origins=["*"]로 모든 도메인에서 API 접근 허용. 프로덕션 배포 시 특정 도메인으로 제한 필요
- **심각도**: 낮음
- **예상 수정 시간**: 5분

### [LOW-47] stocks.py — asyncio.get_event_loop() deprecated (Python 3.10+)
- **파일**: `routers/stocks.py`
- **위치**: L147, L162, L312
- **내용**: asyncio.get_event_loop()가 Python 3.10+에서 DeprecationWarning 발생. asyncio.get_running_loop()로 교체 권장
- **코드**: `loop = asyncio.get_event_loop()`
- **심각도**: 낮음
- **예상 수정 시간**: 10분

---

## 우선순위 정렬 (TOP 20)

| 순위 | ID | 파일 | 심각도 | 설명 | 수정시간 |
|------|-----|------|--------|------|---------|
| 1 | HIGH-2 | routers/admin.py | 높음 | admin 전체 라우터 인증 없음 | 15분 |
| 2 | HIGH-1 | routers/auth.py | 높음 | /api/auth/users 인증 없음 — 전체 회원 이메일 노출 | 5분 |
| 3 | HIGH-3 | routers/income.py | 높음 | /api/income/categories 인증 없음 | 5분 |
| 4 | HIGH-27 | routers/income.py | 높음 | list_incomes 행당 4회 DB 쿼리 (N+1 최심각) | 20분 |
| 5 | HIGH-28 | routers/expense.py | 높음 | _group_by_category N+1 쿼리 | 30분 |
| 6 | HIGH-10 | frontend/IndexPage.jsx | 높음 | localStorage 접근 try/catch 누락 | 20분 |
| 7 | HIGH-39 | frontend/IndexPage.jsx | 높음 | loadStocks race condition | 20분 |
| 8 | HIGH-4 | frontend/ExpenseCard.jsx | 높음 | addExpense fetch에 catch 없음 | 10분 |
| 9 | HIGH-5 | frontend/ExpenseCard.jsx | 높음 | saveEdit fetch에 catch 없음 | 5분 |
| 10 | HIGH-9 | frontend/BudgetPage.jsx | 높음 | useEffect 의존성 누락 stale closure | 15분 |
| 11 | HIGH-7 | routers/expense.py | 높음 | do_refresh_rates 부분 commit 위험 | 15분 |
| 12 | HIGH-6 | frontend/IndexPage.jsx | 높음 | 백필 fetch response.ok 체크 없음 | 5분 |
| 13 | MED-17 | routers/expense.py, income.py | 중간 | _get_rate 함수 중복 | 15분 |
| 14 | MED-15 | frontend 다수 | 중간 | authH 패턴 파일별 중복 정의 | 20분 |
| 15 | MED-30 | routers/portfolio.py | 중간 | 스냅샷 전체 반환 (페이지네이션 없음) | 20분 |
| 16 | MED-32 | frontend/BudgetPage.jsx | 중간 | SummaryTab 12번 개별 API 호출 | 30분 |
| 17 | MED-29 | routers/expense.py | 중간 | _expense_dict N+1 쿼리 | 25분 |
| 18 | MED-33 | frontend/IndexPage.jsx | 중간 | 23:59 스냅샷 핸들러 loadStocks 로직 재구현 | 30분 |
| 19 | MED-21 | frontend 다수 | 중간 | calcStock 로직 IndexPage+StockCard 중복 | 30분 |
| 20 | MED-19 | frontend 다수 | 중간 | 카테고리 목록 각 컴포넌트별 중복 fetch | 30분 |

---

## 수정 소요 시간 예측

| 카테고리 | 건수 | 예상 시간 |
|---------|------|----------|
| 예외처리 누락 | 14건 | 2시간 20분 |
| 중복 코드 | 12건 | 3시간 15분 |
| 비효율적인 로직 | 12건 | 2시간 50분 |
| 잠재적 버그 | 9건 | 2시간 0분 |
| **전체 합계** | **47건** | **약 10시간 25분** |

> 실제 수정 시 일부 항목이 연계 수정되어 실질 작업 시간은 더 줄어들 수 있습니다.
> 특히 HIGH-1~3 (인증 누락) 및 HIGH-27~28 (N+1 쿼리)는 즉시 우선 수정 권장.
