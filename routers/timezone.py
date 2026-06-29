from __future__ import annotations
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import TimezoneConfig, User
from routers.auth import get_current_user

router = APIRouter(prefix="/timezone", tags=["timezone"])

DEFAULT_ZONES = [
    {"region": "서울", "tz": "Asia/Seoul",       "label": "KST"},
    {"region": "뉴욕", "tz": "America/New_York", "label": "ET"},
    {"region": "런던", "tz": "Europe/London",    "label": "GMT"},
]


class TimezoneZone(BaseModel):
    region: str
    tz: str
    label: str = ""


class TimezoneZonesBody(BaseModel):
    zones: list[TimezoneZone]


def _load_zones(row: TimezoneConfig | None) -> list[dict]:
    if not row or row.timezone == "UTC":
        return DEFAULT_ZONES
    try:
        data = json.loads(row.timezone)
        if isinstance(data, list) and len(data) == 3:
            return data
    except Exception:
        pass
    return DEFAULT_ZONES


# ── GET /api/timezone ───────────────────────────────────────────────────────
@router.get("")
def get_timezone(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 3개 시간대 배열 반환."""
    row = db.query(TimezoneConfig).filter(TimezoneConfig.user_id == current_user.id).first()
    return {"zones": _load_zones(row)}


# ── PUT /api/timezone ───────────────────────────────────────────────────────
@router.put("")
def update_timezone(
    body: TimezoneZonesBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 3개 시간대 배열을 JSON 문자열로 저장."""
    zones_json = json.dumps(
        [z.model_dump() for z in body.zones], ensure_ascii=False
    )
    row = db.query(TimezoneConfig).filter(TimezoneConfig.user_id == current_user.id).first()
    if row:
        row.timezone = zones_json
    else:
        row = TimezoneConfig(user_id=current_user.id, timezone=zones_json)
        db.add(row)
    db.commit()
    return {"zones": body.zones}
