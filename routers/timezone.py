from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import TimezoneConfig
from schemas import TimezoneOut, TimezoneUpdate

router = APIRouter(prefix="/timezone", tags=["timezone"])


@router.get("", response_model=TimezoneOut)
def get_timezone(db: Session = Depends(get_db)):
    row = db.query(TimezoneConfig).first()
    if not row:
        row = TimezoneConfig(timezone="UTC")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("", response_model=TimezoneOut)
def update_timezone(body: TimezoneUpdate, db: Session = Depends(get_db)):
    row = db.query(TimezoneConfig).first()
    if row:
        row.timezone = body.timezone
    else:
        row = TimezoneConfig(timezone=body.timezone)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
