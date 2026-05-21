# 프로젝트 결정 기록

---
## 2026-05-21 — React + Vite SPA 전환 아키텍처
**결정:** Vanilla JS 6개 HTML 파일을 React 18 + Vite 5 + React Router v6 SPA로 전환했습니다.
**이유:** 컴포넌트 재사용성, 상태 관리 단순화, 코드 분리가 가능해집니다. 기존 FastAPI 백엔드와 API 엔드포인트는 동일하게 유지하므로 백엔드 변경이 없습니다.
**대안:** (1) Next.js — SSR이 필요 없는 SPA이므로 불필요한 복잡성; (2) 기존 HTML 유지 — 코드 중복 증가, 컴포넌트 재사용 불가
**파일:** frontend/src/App.jsx, frontend/vite.config.js

---
## 2026-05-21 — IndexPage 서브컴포넌트 분리 전략
**결정:** index.html을 11개 독립 컴포넌트로 분리했습니다 (HeroSection, StockCard, StockStatsOverlay, ExpenseCard, DietCard, MemoCard, NewsCard, YoutubeCard, SitesCard, ScheduleCard).
**이유:** 각 카드는 독립된 상태와 API를 가지므로 분리하면 유지보수성이 높아집니다. PC/모바일 공유 컴포넌트로 isMobile prop을 사용해 CSS 클래스만 다르게 렌더링합니다.
**대안:** 단일 거대 컴포넌트 — 가독성 저하, 리렌더링 최적화 어려움
**파일:** frontend/src/pages/index/

---
## 2026-05-21 — FastAPI SPA 폴백 전략
**결정:** 개별 HTML 라우트를 제거하고 `/{full_path:path}` 단일 catch-all 라우트로 교체했습니다. `frontend/dist/` 파일 우선, 없으면 `index.html` 서빙.
**이유:** React Router BrowserRouter는 서버가 모든 경로에서 `index.html`을 반환해야 클라이언트 라우팅이 작동합니다. API 라우트(`/api/...`)는 먼저 등록되어 catch-all보다 우선합니다.
**대안:** StaticFiles(html=True) 마운트 — 제한적 폴백 동작, 커스텀 로직 추가 어려움
**파일:** main.py

---
## 2026-05-22 — SPA 구조로 마이그레이션 (멀티 라우트 → 캐치올)

**결정:** 기존의 URL별 정적 HTML 파일 제공 방식에서 React SPA 패턴으로 변경. 단일 캐치올 라우트 핸들러로 모든 요청을 처리하고, 라우팅은 클라이언트 측 React Router에 위임.

**이유:** 프론트엔드를 Vite 번들러로 빌드하면서 React Router 기반 SPA 아키텍처로 전환. 개발 중에는 기존 static/ 폴더 지원, 프로덕션에는 frontend/dist/ 정적 자산 사용.

**대안:** 
- 기존 방식 유지: 각 페이지별 @app.get 라우트 유지 (스케일링 어려움, 라우트 추가마다 서버 코드 수정)
- StaticFiles 마운트만 사용: 더 단순하지만 폴백 로직 부족, 프론트엔드 미빌드 시 동작 안 함

**파일:** C:\Users\Jason\Desktop\dashboard\main.py
