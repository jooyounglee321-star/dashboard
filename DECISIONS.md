# 프로젝트 결정 기록

---
## 2026-05-29 — Phase 3 가계부 API 아키텍처: 인메모리 캐시 + 라우터 분리 + 인라인 스키마
**결정:** 환율 데이터를 30분 TTL의 인메모리 캐시로 관리하고, `expense_router`와 `exchange_router`를 분리하며, Pydantic 스키마를 `routers/expense.py` 내 인라인으로 정의하는 구조를 채택했습니다.
**이유:** (1) 인메모리 캐시는 Redis 없이도 빠른 환율 조회를 제공하면서 30분 간격 서버 리소드로 정확한 갱신 주기 보장, (2) 라우터 분리로 관심사 분리 및 향후 비지출 환율 사용처 확장 용이, (3) 인라인 스키마는 FastAPI 엔드포인트와 스키마의 강한 결합을 유지하며 모놀리식 스키마 파일 회피.
**대안:** (1) Redis 기반 캐시 → 배포 의존성 증가, (2) 단일 라우터 통합 → 코드 응집도 증가, (3) 중앙 `schemas.py` → 기존 14개 엔드포인트와 혼재로 파일 비대화
**파일:** C:\Users\Jason\Desktop\dashboard\routers\expense.py, C:\Users\Jason\Desktop\dashboard\main.py, C:\Users\Jason\Desktop\dashboard\CHANGELOG.md

---
## 2026-05-29 14:30 — APScheduler에 30분 환율 갱신 작업 추가
**결정:** APScheduler를 사용하여 매 30분마다 환율 데이터를 Yahoo Finance에서 자동 갱신하는 정기 작업을 추가했습니다.
**이유:** 사용자가 입력하는 다국 통화 거래에서 항상 최신 환율을 제공하기 위해, 이미 존재하는 `_refresh_rates_job()` 함수를 30분 주기로 자동 실행하도록 스케줄링했습니다. 일 1회 포트폴리오 스냅샷과 함께 단일 APScheduler 인스턴스로 통합 관리하는 구조입니다.
**대안:** (1) Celery + Redis를 별도 프로세스로 운영 → 배포 복잡성 증가, (2) 클라이언트 측 on-demand 갱신 → 환율 노후화 위험, (3) 캐시 TTL 방식 → 정확한 시간 제어 불가
**파일:** C:\Users\Jason\Desktop\dashboard\main.py

