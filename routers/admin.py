import secrets
import string
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import AdminMemoUpdate, PlanUpdate, StatusUpdate, UserAdminOut

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALLOWED_SORT = {"created_at", "last_login_at", "login_count", "total_payment", "email", "name"}


@router.get("/users", response_model=list[UserAdminOut])
def list_admin_users(
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        term = f"%{search}%"
        q = q.filter(User.email.ilike(term) | User.name.ilike(term))
    if plan:
        q = q.filter(User.plan == plan)
    if status:
        q = q.filter(User.status == status)

    if sort_by not in ALLOWED_SORT:
        sort_by = "created_at"
    col = getattr(User, sort_by)
    q = q.order_by(col.asc() if order == "asc" else col.desc())
    return q.all()


@router.get("/stats")
def get_admin_stats(db: Session = Depends(get_db)):
    today = date.today()
    month_start = datetime(today.year, today.month, 1)

    total = db.query(func.count(User.id)).scalar() or 0
    today_new = db.query(func.count(User.id)).filter(
        func.date(User.created_at) == today
    ).scalar() or 0
    premium = db.query(func.count(User.id)).filter(User.plan == "premium").scalar() or 0
    month_new = db.query(func.count(User.id)).filter(
        User.created_at >= month_start
    ).scalar() or 0
    month_payment = db.query(func.sum(User.total_payment)).filter(
        User.created_at >= month_start
    ).scalar() or 0

    return {
        "total": total,
        "today_new": today_new,
        "premium": premium,
        "month_new": month_new,
        "month_payment": float(month_payment),
    }


@router.get("/users/{user_id}", response_model=UserAdminOut)
def get_admin_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


@router.put("/users/{user_id}/plan")
def update_plan(user_id: int, body: PlanUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.plan = body.plan
    user.plan_expires_at = body.plan_expires_at
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/status")
def update_status(user_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if body.status not in ("active", "inactive", "suspended"):
        raise HTTPException(status_code=400, detail="올바르지 않은 상태값입니다.")
    user.status = body.status
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/memo")
def update_memo(user_id: int, body: AdminMemoUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.admin_memo = body.admin_memo
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.provider != "local":
        raise HTTPException(status_code=400, detail="소셜 로그인 계정은 비밀번호 초기화를 지원하지 않습니다.")
    alphabet = string.ascii_letters + string.digits
    new_pw = "".join(secrets.choice(alphabet) for _ in range(12))
    user.hashed_password = pwd_context.hash(new_pw)
    db.commit()
    return {"ok": True, "new_password": new_pw}
