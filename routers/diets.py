from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Diet
from schemas import DietCreate, DietOut

router = APIRouter(prefix="/diets", tags=["diets"])


@router.get("", response_model=list[DietOut])
def get_diets(date: date | None = None, db: Session = Depends(get_db)):
    q = db.query(Diet)
    if date:
        q = q.filter(Diet.date == date)
    return q.order_by(Diet.date.asc(), Diet.created_at.asc()).all()


@router.post("", response_model=DietOut, status_code=201)
def create_diet(body: DietCreate, db: Session = Depends(get_db)):
    row = Diet(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{diet_id}", status_code=204)
def delete_diet(diet_id: int, db: Session = Depends(get_db)):
    row = db.get(Diet, diet_id)
    if not row:
        raise HTTPException(status_code=404, detail="Diet not found")
    db.delete(row)
    db.commit()
