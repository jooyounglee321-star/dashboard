from __future__ import annotations
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
from routers._shared import require_admin as _require_admin
from schemas import (
    AdminMemoUpdate, PermissionBulkUpdate, PlanUpdate,
    RoleUpdate, StatusUpdate, UserAdminOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

# 위젯/페이지명 키워드 (순서 중요: 더 긴 이름 먼저)
_WIDGET_KEYWORDS = [
    "StockSettingsModal", "StockStatsOverlay", "PinnedMemoCard",
    "SuperadminPage", "ScheduleCard", "HeroSection", "LayoutEditor",
    "BookmarkCard", "StockCard", "BudgetPage", "MemoCard", "DietCard",
    "ExpenseCard", "IndexPage", "AdminPage", "TodoList", "ProfilePage",
    "LoginPage", "RegisterPage",
]
_WIDGET_RE = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in _WIDGET_KEYWORDS) + r")\b"
)
_TYPE_RE = re.compile(r"^(feat|fix|refactor|design|perf|docs|chore|style|test)\b", re.I)


def _parse_item(raw: str, block_type: str) -> dict:
    """bullet 텍스트 → {type, widget, desc} 딕셔너리."""
    # **Widget.jsx**: 또는 **Widget**: 으로 시작하는 패턴 제거 후 desc 추출
    prefix_m = re.match(r"^\*\*([^*]+)\*\*[:\s]*(.*)$", raw)
    if prefix_m:
        prefix_text = prefix_m.group(1)
        desc = prefix_m.group(2).strip(" :–—-")
        # prefix 안에서 위젯명 찾기
        wm = _WIDGET_RE.search(prefix_text)
        widget = wm.group(1) if wm else None
    else:
        desc = raw
        wm = _WIDGET_RE.search(raw)
        widget = wm.group(1) if wm else None

    # desc가 비어 있으면 raw 전체 사용
    if not desc:
        desc = raw

    return {"type": block_type, "widget": widget, "desc": desc}


@router.get("/superadmin/changelog")
def get_changelog(_: User = Depends(_require_admin)):
    try:
        with open(_CHANGELOG_PATH, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        return []

    # date → list[item] (같은 날짜 여러 블록 병합)
    date_map: dict[str, list[dict]] = {}
    date_order: list[str] = []
    current_date: str | None = None
    current_type: str = "feat"

    for line in text.splitlines():
        # ## [YYYY-MM-DD] — type: 제목
        m = re.match(r"^## \[(\d{4}-\d{2}-\d{2})\]\s*[—-]\s*(.+)$", line)
        if m:
            current_date = m.group(1)
            title_rest = m.group(2).strip()
            tm = _TYPE_RE.match(title_rest)
            current_type = tm.group(1).lower() if tm else "feat"
            if current_date not in date_map:
                date_map[current_date] = []
                date_order.append(current_date)
            continue
        # 최상위 bullet (들여쓰기 없는 - 또는 *)
        if current_date and re.match(r"^[-*]\s+", line):
            raw = re.sub(r"^[-*]\s+", "", line)
            date_map[current_date].append(_parse_item(raw, current_type))

    date_order.sort(reverse=True)
    return [{"date": d, "items": date_map[d]} for d in date_order]
