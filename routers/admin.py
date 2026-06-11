import os
import re
import secrets
import string
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import RolePermission, User
from routers.auth import get_current_user
from schemas import (
    AdminMemoUpdate, PermissionBulkUpdate, PlanUpdate,
    RoleUpdate, StatusUpdate, UserAdminOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")
    return current_user

ALLOWED_SORT  = {"created_at", "last_login_at", "login_count", "total_payment", "email", "name"}
ALLOWED_ROLES = {"admin", "premium", "free", "guest"}
ALL_PERMS     = [
    "superadmin_access", "manage_users", "manage_permissions",
    "dashboard_full", "dashboard_basic", "dashboard_view_only", "own_settings",
]


@router.get("/users", response_model=list[UserAdminOut])
def list_admin_users(
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
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
def get_admin_stats(db: Session = Depends(get_db), _: User = Depends(_require_admin)):
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
def get_admin_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


@router.put("/users/{user_id}/plan")
def update_plan(user_id: int, body: PlanUpdate, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.plan = body.plan
    user.plan_expires_at = body.plan_expires_at
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/status")
def update_status(user_id: int, body: StatusUpdate, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if body.status not in ("active", "inactive", "suspended"):
        raise HTTPException(status_code=400, detail="올바르지 않은 상태값입니다.")
    user.status = body.status
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/memo")
def update_memo(user_id: int, body: AdminMemoUpdate, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.admin_memo = body.admin_memo
    db.commit()
    return {"ok": True}


# ── PUT /api/admin/users/{id}/role ───────────────────────────────────────────

@router.put("/users/{user_id}/role", summary="회원 레벨 변경")
def update_role(user_id: int, body: RoleUpdate, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"올바르지 않은 레벨입니다. 허용: {', '.join(sorted(ALLOWED_ROLES))}",
        )
    user.role = body.role
    db.commit()
    return {"ok": True}


# ── GET /api/admin/permissions ────────────────────────────────────────────────

@router.get("/permissions", summary="레벨별 권한 목록 조회")
def get_permissions(db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    """역할별 권한 맵 반환: {role: {permission_name: is_allowed, ...}, ...}"""
    rows = db.query(RolePermission).order_by(RolePermission.role, RolePermission.permission_name).all()
    result: dict[str, dict[str, bool]] = {}
    for r in rows:
        result.setdefault(r.role, {})[r.permission_name] = r.is_allowed
    return {"permissions": result}


# ── PUT /api/admin/permissions ────────────────────────────────────────────────

@router.put("/permissions", summary="레벨별 권한 일괄 수정")
def update_permissions(body: PermissionBulkUpdate, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
    for item in body.permissions:
        if item.role not in ALLOWED_ROLES:
            continue
        row = (
            db.query(RolePermission)
            .filter(
                RolePermission.role == item.role,
                RolePermission.permission_name == item.permission_name,
            )
            .first()
        )
        if row:
            row.is_allowed = item.is_allowed
        else:
            db.add(RolePermission(
                role=item.role,
                permission_name=item.permission_name,
                is_allowed=item.is_allowed,
            ))
    db.commit()
    return {"ok": True}


# ── POST /api/admin/users/{id}/reset-password ─────────────────────────────────

@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, db: Session = Depends(get_db), _: User = Depends(_require_admin)):
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


# ── GET /api/superadmin/changelog ─────────────────────────────────────────────

_CHANGELOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "CHANGELOG.md")

@router.get("/superadmin/changelog")
def get_changelog(_: User = Depends(_require_admin)):
    try:
        with open(_CHANGELOG_PATH, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        return []

    entries = []
    current_date = None
    current_title = None
    current_items: list[str] = []

    for line in text.splitlines():
        # ## [YYYY-MM-DD] — 제목
        m = re.match(r"^## \[(\d{4}-\d{2}-\d{2})\]\s*[—-]\s*(.+)$", line)
        if m:
            if current_date:
                entries.append({"date": current_date, "title": current_title, "items": current_items})
            current_date = m.group(1)
            current_title = m.group(2).strip()
            current_items = []
            continue
        # bullet items
        if current_date and re.match(r"^\s*[-*]\s+", line):
            current_items.append(re.sub(r"^\s*[-*]\s+", "", line))

    if current_date:
        entries.append({"date": current_date, "title": current_title, "items": current_items})

    entries.sort(key=lambda e: e["date"], reverse=True)
    return entries
