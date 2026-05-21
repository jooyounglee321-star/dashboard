# 프로젝트 결정 기록

---
## 2026-05-20 04:13 — DB 초기화: 모든 모델 명시적 import
**결정:** `main.py` 에서 `from models import DailyPortfolioSnapshot` (단일 import) → 모든 11개 모델을 명시적으로 import하는 형태로 변경. 각 모델마다 한 줄씩 나열하여 누락 방지.
**이유:** SQLAlchemy의 `Base.metadata.create_all()`이 테이블을 생성하려면 모든 모델 클래스가 메모리에 로드되어 있어야 함. 이전 배포에서 DB 연결 실패 시 서버가 lifespan 진입 전 크래시하면서 `create_all()`이 실행되지 않아 테이블이 생성되지 않는 문제 발생. 명시적 import로 임포트 누락 방지 및 코드 명확성 강화.
**대안:** (1) 동적 import 활용 - 복잡성 증가, 테이블 누락 위험성 유지; (2) 명시적 list 구성 후 동적 로드 - 중간 수준 명확성; (3) 명시적 일괄 import (선택된 접근) - 가장 명확하고 디버깅 용이
**파일:** C:\Users\Jason\Desktop\dashboard\main.py

---
## 2026-05-15 03:43 — API 스키마: 토큰 필드명 엄격화
**결정:** 프론트엔드에서 토큰 저장 시 `data.token || data.access_token || '__registered__'` 폴백 체인 제거, 백엔드 `AuthOut` 스키마의 정확한 필드명 `data.access_token` 직접 참조로 변경
**이유:** 백엔드가 `AuthOut` Pydantic 모델로 `access_token: str` 필드를 필수 반환하므로, 폴백 로직은 불필요. 스키마 엄격화로 타입 안정성 강화 및 코드 의도 명확화
**대안:** (1) 폴백 체인 유지 - 레거시 호환성은 증가하나 모호한 상태 처리; (2) 백엔드 응답 스키마 강화 후 프론트엔드 엄격화 (선택된 접근)
**파일:** C:\Users\Jason\Desktop\dashboard\static\register.html

