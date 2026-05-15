"""포트폴리오 데일리 스냅샷 API."""
import json
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DailyPortfolioSnapshot, PortfolioGroups
from schemas import PortfolioSnapshotCreate, PortfolioSnapshotOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


# ── GET /api/portfolio/groups ────────────────────────────────────────────────
@router.get("/groups")
def get_groups(db: Session = Depends(get_db)):
    """admin.html 포트폴리오 그룹 전체 조회 (localStorage 미러)."""
    row = db.get(PortfolioGroups, 1)
    if not row:
        return {"data": []}
    try:
        return {"data": json.loads(row.data)}
    except Exception:
        return {"data": []}


# ── POST /api/portfolio/groups ───────────────────────────────────────────────
@router.post("/groups")
def save_groups(body: dict, db: Session = Depends(get_db)):
    """admin.html 포트폴리오 그룹 전체 저장 (id=1 단일 행 UPSERT).

    body: { "data": [...groups array...] }
    """
    groups = body.get("data", [])
    data_json = json.dumps(groups, ensure_ascii=False)

    row = db.get(PortfolioGroups, 1)
    if row:
        row.data = data_json
    else:
        row = PortfolioGroups(id=1, data=data_json)
        db.add(row)

    db.commit()
    logger.info("[PORTFOLIO GROUPS] 저장 완료 (그룹 수: %d)", len(groups))
    return {"ok": True, "groups": len(groups)}


# ── POST /api/portfolio/snapshot ────────────────────────────────────────────
@router.post("/snapshot", response_model=PortfolioSnapshotOut)
def save_snapshot(body: PortfolioSnapshotCreate, db: Session = Depends(get_db)):
    """프런트엔드가 전송하는 데일리 포트폴리오 스냅샷을 저장(날짜별 UPSERT)."""
    data_json = json.dumps(
        [g.model_dump() for g in body.groups],
        ensure_ascii=False,
    )
    row = db.query(DailyPortfolioSnapshot).filter(
        DailyPortfolioSnapshot.snapshot_date == body.snapshot_date
    ).first()

    if row:
        # 이미 당일 스냅샷 존재 → 업데이트
        row.usd_krw        = body.usd_krw
        row.total_usd      = body.total_usd
        row.total_krw      = body.total_krw
        row.total_krw_equiv = body.total_krw_equiv
        row.data           = data_json
        row.saved_by       = "frontend"
        logger.info("[SNAPSHOT] %s 업데이트 완료", body.snapshot_date)
    else:
        row = DailyPortfolioSnapshot(
            snapshot_date   = body.snapshot_date,
            usd_krw         = body.usd_krw,
            total_usd       = body.total_usd,
            total_krw       = body.total_krw,
            total_krw_equiv = body.total_krw_equiv,
            data            = data_json,
            saved_by        = "frontend",
        )
        db.add(row)
        logger.info("[SNAPSHOT] %s 신규 저장 완료", body.snapshot_date)

    db.commit()
    db.refresh(row)
    return row


# ── GET /api/portfolio/history ───────────────────────────────────────────────
@router.get("/history", response_model=list[PortfolioSnapshotOut])
def get_history(db: Session = Depends(get_db)):
    """전체 스냅샷 목록 (최신순)."""
    rows = (
        db.query(DailyPortfolioSnapshot)
        .order_by(DailyPortfolioSnapshot.snapshot_date.desc())
        .all()
    )
    return rows


# ── GET /api/portfolio/history/{date} ───────────────────────────────────────
@router.get("/history/{snapshot_date}", response_model=PortfolioSnapshotOut)
def get_history_by_date(snapshot_date: date, db: Session = Depends(get_db)):
    """특정 날짜 스냅샷 조회."""
    row = db.query(DailyPortfolioSnapshot).filter(
        DailyPortfolioSnapshot.snapshot_date == snapshot_date
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"{snapshot_date} 스냅샷 없음")
    return row
