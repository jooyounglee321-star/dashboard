# 프로젝트 결정 기록

---
## 2025-05-15 — 사용자 정보 표시: 로컬캐시 우선 + API 동기화 전략

**결정:** IndexPage에서 사용자 이름과 아바타를 로드할 때 localStorage 캐시를 우선 표시한 후 API에서 최신 데이터를 가져오는 두 단계 방식 구현

**이유:** 사용자 경험 최적화. localStorage 캐시를 먼저 표시하면 API 응답 대기 없이 빠른 초기 렌더링이 가능하고, 백그라운드에서 API 호출로 최신 정보를 동기화할 수 있음

**대안:** 
- API 직접 호출만 사용 (초기 로드 지연)
- localStorage 캐시만 사용 (오래된 데이터 문제)
- 서버 세션 기반 인증 (다른 아키텍처)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\IndexPage.jsx

---
## 2025-05-15 — 인증 가드 패턴: 양방향 라우트 보호

**결정:** 로그인/회원가입 페이지를 LoginGuard로 보호하고, 유효한 토큰이 있으면 인덱스 페이지로 리다이렉트하는 새로운 가드 컴포넌트 도입

**이유:** 인증 상태 기반 라우팅을 완전히 관리하기 위해. AuthGuard (보호된 경로용)와 LoginGuard (공개 경로용)를 함께 사용하면 이미 로그인한 사용자가 /login이나 /register에 접근할 수 없도록 방지할 수 있음. hasValidToken() 함수 추출로 토큰 검증 로직을 한 곳에서 관리

**대안:**
- 클라이언트 사이드 검증 없이 백엔드에만 의존 (선택 후 리다이렉트 지연)
- AuthGuard만 사용하여 보호된 경로 관리 (로그인 페이지 재방문 방지 불가)
- 각 페이지에서 개별 토큰 검증 (중복 코드, 유지보수 어려움)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\App.jsx

---
## 2026-05-21 — 프로필 페이지 및 /api/auth/me 설계

**결정:** 프로필 수정을 위한 `GET/PUT /api/auth/me` 엔드포인트를 `routers/auth.py`에 추가하고, `get_current_user` JWT 의존성을 공유 함수로 정의했습니다.
**이유:** 닉네임 표시(헤더)와 프로필 편집 모두 동일 엔드포인트를 사용해 코드 중복을 방지합니다. Bearer 토큰 기반 인증으로 기존 JWT 체계를 재사용합니다.
**대안:** 소셜 로그인 등 대형 auth 라이브러리 도입 — 현 규모에서 과도한 복잡성
**파일:** routers/auth.py, schemas.py

---
## 2026-05-21 — 프로필 사진을 localStorage에 저장

**결정:** 프로필 사진은 서버 업로드 없이 base64로 localStorage에 저장합니다.
**이유:** DB 컬럼 추가, 파일 스토리지(S3 등) 설정 없이 즉시 구현 가능합니다. 개인 대시보드 특성상 기기별 저장으로 충분합니다.
**대안:** S3 + `users.avatar_url` 컬럼 — 다기기 동기화 필요 시 전환 고려
**파일:** static/profile.html, frontend/src/pages/ProfilePage.jsx
