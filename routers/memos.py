from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Memo, User
from routers.auth import get_current_user
from schemas import MemoCreate, MemoOut, MemoUpdate

router = APIRouter(prefix="/memos", tags=["memos"])


@router.get("", response_model=list[MemoOut])
def get_memos(
    date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Memo).filter(Memo.user_id == current_user.id)
    if date:
        q = q.filter(Memo.date == date)
    return q.order_by(Memo.date.desc(), Memo.created_at.desc()).all()


@router.post("", response_model=MemoOut, status_code=201)
def create_memo(
    body: MemoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = Memo(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{memo_id}", response_model=MemoOut)
def update_memo(
    memo_id: int,
    body: MemoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Memo, memo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Memo not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{memo_id}", status_code=204)
def delete_memo(
    memo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Memo, memo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Memo not found")
    db.delete(row)
    db.commit()
