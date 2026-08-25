from __future__ import annotations
import json
import logging
import os
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract
from sqlalchemy.orm import Session

from database import get_db
from models import Diet, DietAnalysis, User
from routers.auth import get_current_user
from schemas import DietCreate, DietOut, DietAnalysisCreate, DietAnalysisOut

router = APIRouter(prefix="/diets", tags=["diets"])

logger = logging.getLogger(__name__)


@router.get("", response_model=list[DietOut])
def get_diets(
    date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Diet).filter(Diet.user_id == current_user.id)
    if date:
        q = q.filter(Diet.date == date)
    return q.order_by(Diet.date.asc(), Diet.created_at.asc()).all()


@router.post("", response_model=DietOut, status_code=201)
def create_diet(
    body: DietCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = Diet(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{diet_id}", status_code=204)
def delete_diet(
    diet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Diet, diet_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Diet not found")
    db.delete(row)
    db.commit()


# ── 식단 분석 결과 저장/조회 ──────────────────────────────────────────────────

@router.get("/analysis/history", response_model=list[DietAnalysisOut])
def get_analysis_history(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 분석 이력 조회 (GET /api/diets/analysis/history?year=YYYY&month=MM)."""
    rows = (
        db.query(DietAnalysis)
        .filter(
            DietAnalysis.user_id == current_user.id,
            extract("year",  DietAnalysis.date) == year,
            extract("month", DietAnalysis.date) == month,
        )
        .order_by(DietAnalysis.date.asc())
        .all()
    )
    return rows


@router.get("/analysis", response_model=DietAnalysisOut | None)
def get_analysis(
    date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """특정 날짜 분석 조회 (GET /api/diets/analysis?date=YYYY-MM-DD)."""
    row = (
        db.query(DietAnalysis)
        .filter(DietAnalysis.user_id == current_user.id, DietAnalysis.date == date)
        .first()
    )
    return row  # None 이면 204 대신 200+null 반환 (프론트에서 null 체크)


@router.post("/analyze")
async def analyze_diet(
    date: date = Query(..., description="분석 날짜 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claude AI로 해당 날짜 식단을 분석 — 결과 반환만, DB 저장 없음.

    저장은 프론트에서 POST /api/diets/analysis 별도 호출.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    # ── 해당 날짜 식단 조회 ───────────────────────────────────────────────────
    meals = (
        db.query(Diet)
        .filter(Diet.user_id == current_user.id, Diet.date == date)
        .order_by(Diet.created_at.asc())
        .all()
    )
    if not meals:
        raise HTTPException(status_code=400, detail="분석할 식단이 없습니다.")

    # ── 사용자 신체 정보 ──────────────────────────────────────────────────────
    u = current_user
    age_str    = f"{datetime.now().year - u.birth_year}세" if u.birth_year else "정보 없음"
    gender_str = {"male": "남성", "female": "여성"}.get(u.gender or "", u.gender or "정보 없음")
    height_str = f"{u.height_cm}cm" if u.height_cm else "정보 없음"
    weight_str = f"{u.weight_kg}kg" if u.weight_kg else "정보 없음"

    # ── 식단 텍스트 구성 ──────────────────────────────────────────────────────
    MEAL_ORDER = ["아침", "점심", "저녁", "간식"]
    meal_groups: dict[str, list[str]] = {}
    for m in meals:
        entry = m.content or ""
        if m.calories:
            entry += f" ({m.calories}kcal)"
        meal_groups.setdefault(m.meal_type or "기타", []).append(entry)

    meal_lines = []
    for mt in MEAL_ORDER:
        if mt in meal_groups:
            meal_lines.append(f"- {mt}: {', '.join(meal_groups[mt])}")
    for mt, items in meal_groups.items():
        if mt not in MEAL_ORDER:
            meal_lines.append(f"- {mt}: {', '.join(items)}")
    meal_text = "\n".join(meal_lines)

    PROMPT = (
        "당신은 전문 영양사입니다. 사용자의 신체 정보와 오늘의 식단을 보고 영양 분석을 해주세요.\n\n"
        "[사용자 신체 정보]\n"
        f"- 나이: {age_str}\n"
        f"- 성별: {gender_str}\n"
        f"- 키: {height_str}\n"
        f"- 몸무게: {weight_str}\n"
        "※ '정보 없음' 항목은 일반 성인 기준으로 분석해주세요.\n\n"
        f"[오늘의 식단 ({date})]\n"
        f"{meal_text}\n\n"
        "아래 JSON 형식으로만 응답하세요. 설명 텍스트나 코드블록(```) 없이 JSON만 출력:\n"
        '{"nutrition_analysis":"영양 균형 분석 내용 (개인 신체 정보 반영, 2-3문장)",'
        '"recommendations":["개선 제안1","개선 제안2","개선 제안3"],'
        '"warnings":"주의사항 (나트륨/당류/칼로리 등, 없으면 특별한 주의사항 없음)"}'
    )

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": PROMPT}],
        )
        text = response.content[0].text.strip()
        # JSON 추출: 첫 { 부터 마지막 } 까지 — 코드블록·앞뒤 텍스트 무관
        start = text.find("{")
        end   = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise HTTPException(status_code=500, detail="AI 응답에서 JSON을 찾지 못했습니다.")
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI 응답 파싱 실패.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[DIET-ANALYZE] Claude API 오류: %s", exc)
        raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")

    recs = parsed.get("recommendations", [])
    if not isinstance(recs, list):
        recs = [str(recs)]

    logger.info("[DIET-ANALYZE] user=%d date=%s meals=%d", current_user.id, date, len(meals))
    return {
        "nutrition_analysis": parsed.get("nutrition_analysis", ""),
        "recommendations":    recs,
        "warnings":           parsed.get("warnings", ""),
    }


@router.post("/analysis", response_model=DietAnalysisOut, status_code=200)
def upsert_analysis(
    body: DietAnalysisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """분석 결과 저장 — (user_id, date) 기준 UPSERT (POST /api/diets/analysis)."""
    row = (
        db.query(DietAnalysis)
        .filter(DietAnalysis.user_id == current_user.id, DietAnalysis.date == body.date)
        .first()
    )
    if row:
        row.nutrition_analysis = body.nutrition_analysis
        row.recommendations    = body.recommendations
        row.warnings           = body.warnings
        row.raw_meals          = body.raw_meals
    else:
        row = DietAnalysis(
            user_id            = current_user.id,
            date               = body.date,
            nutrition_analysis = body.nutrition_analysis,
            recommendations    = body.recommendations,
            warnings           = body.warnings,
            raw_meals          = body.raw_meals,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
