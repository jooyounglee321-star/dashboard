# 프로젝트 결정 기록

---
## 2026-06-08 — diet_analyses (user_id, date) UniqueConstraint + UPSERT 방식 채택

**결정:** `diet_analyses` 테이블은 `(user_id, date)` 복합 UniqueConstraint를 적용하여 날짜당 1건만 허용. 재분석 시 INSERT 대신 기존 행을 UPDATE하는 UPSERT 패턴 사용.
**이유:** 같은 날짜에 여러 번 분석해도 최신 결과 1건만 유지하는 것이 자연스러운 UX. 날짜별 단일 분석 모델이 식단 통계 페이지 조회도 단순화함.
**대안:** 분석 이력을 모두 보존하는 append-only 방식 — 분석 횟수가 쌓일수록 조회 복잡도 증가, UX 상 불필요한 중복 제거 필요
**파일:** C:\Users\Jason\Desktop\dashboard\models.py, routers/diets.py

---
## 2026-06-08 — diet_analyses 테이블 추가

**결정:** AI 식단 분석 결과를 저장하는 별도의 `diet_analyses` 테이블을 신규 추가. user_id와 date 조합을 기준으로 UPSERT 패턴 적용.

**이유:** 사용자가 입력한 식단(`diets`)과 AI가 생성한 분석 결과를 분리하여 저장함으로써 데이터 구조를 명확히 하고, 같은 날짜에 다시 분석 요청이 오면 기존 분석을 덮어쓸 수 있도록 하기 위함.

**대안:** 
- `diets` 테이블에 분석 결과 컬럼 추가: 읽기/쓰기 패턴이 다르므로 정규화 부족
- JSON 컬럼에 분석 결과 저장: 검색·필터링 어려움

**파일:** C:\Users\Jason\Desktop\dashboard\DB_SCHEMA.md
