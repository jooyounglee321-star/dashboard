from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Bookmark, User
from routers.auth import get_current_user
from schemas import BookmarkCreate, BookmarkOut

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.get("", response_model=list[BookmarkOut])
def get_bookmarks(
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Bookmark).filter(Bookmark.user_id == current_user.id)
    if category:
        q = q.filter(Bookmark.category == category)
    return q.order_by(Bookmark.category.asc(), Bookmark.title.asc()).all()


@router.post("", response_model=BookmarkOut, status_code=201)
def create_bookmark(
    body: BookmarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = Bookmark(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{bookmark_id}", status_code=204)
def delete_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Bookmark, bookmark_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(row)
    db.commit()
