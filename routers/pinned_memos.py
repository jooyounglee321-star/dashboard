from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PinnedMemo, User
from routers.auth import get_current_user
from schemas import PinnedMemoCreate, PinnedMemoOut, PinnedMemoUpdate

router = APIRouter(prefix="/pinned-memos", tags=["pinned_memos"])


@router.get("", response_model=list[PinnedMemoOut])
def get_pinned_memos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PinnedMemo)
        .filter(PinnedMemo.user_id == current_user.id)
        .order_by(PinnedMemo.created_at.asc())
        .all()
    )


@router.post("", response_model=PinnedMemoOut, status_code=201)
def create_pinned_memo(
    body: PinnedMemoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = PinnedMemo(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{memo_id}", response_model=PinnedMemoOut)
def update_pinned_memo(
    memo_id: int,
    body: PinnedMemoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(PinnedMemo, memo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Pinned memo not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{memo_id}", status_code=204)
def delete_pinned_memo(
    memo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(PinnedMemo, memo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Pinned memo not found")
    db.delete(row)
    db.commit()
