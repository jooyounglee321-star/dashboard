import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract
from sqlalchemy.orm import Session

from database import get_db
from models import Diet, DietAnalysis, User
from routers.auth import get_current_user
from schemas import DietCreate, DietOut, DietAnalysisCreate, DietAnalysisOut

router = APIRouter(prefix="/diets", tags=["diets"])


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
