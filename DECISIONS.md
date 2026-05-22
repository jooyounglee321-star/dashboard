# 프로젝트 결정 기록

---
## 2026-05-14 — Bearer 토큰 기반 API 인증 도입
**결정:** /api/bookmarks 엔드포인트에 대한 요청에 localStorage에서 가져온 Bearer 토큰을 Authorization 헤더로 추가하여 토큰 기반 인증을 구현했습니다.

**이유:** 지금까지 인증되지 않은 공개 API 엔드포인트로 운영했으나, 사용자별 맞춤형 데이터를 제공하기 위해 인증이 필요하게 되었습니다. Bearer 토큰 방식은 REST API의 표준 인증 패턴이며, localStorage는 브라우저에서 토큰을 안전하게 저장할 수 있습니다.

**대안:** 1) 쿠키 기반 세션 인증 (자동 전송되지만 CSRF 취약점 존재), 2) API 키 방식 (공개 클라이언트용으로는 부적절), 3) Basic Auth (자격증명 노출 위험)

**파일:** C:\Users\Jason\Desktop\dashboard\frontend\src\pages\index\SitesCard.jsx
