# 프로젝트 결정 기록

---
## 2026-05-15 03:43 — API 스키마: 토큰 필드명 엄격화
**결정:** 프론트엔드에서 토큰 저장 시 `data.token || data.access_token || '__registered__'` 폴백 체인 제거, 백엔드 `AuthOut` 스키마의 정확한 필드명 `data.access_token` 직접 참조로 변경
**이유:** 백엔드가 `AuthOut` Pydantic 모델로 `access_token: str` 필드를 필수 반환하므로, 폴백 로직은 불필요. 스키마 엄격화로 타입 안정성 강화 및 코드 의도 명확화
**대안:** (1) 폴백 체인 유지 - 레거시 호환성은 증가하나 모호한 상태 처리; (2) 백엔드 응답 스키마 강화 후 프론트엔드 엄격화 (선택된 접근)
**파일:** C:\Users\Jason\Desktop\dashboard\static\register.html

