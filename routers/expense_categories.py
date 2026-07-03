from __future__ import annotations
"""카테고리 CRUD + 드릴다운 API.

expense_router(prefix /expense)에 sub-router로 포함됨.
엔드포인트 경로는 /api/expense/... 그대로 유지.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseCategory, User
from routers._shared import cat_name as _cat_name
from routers.auth import get_current_user
from routers.expense_shared import (
    CategoryIn, CategoryPatch,
    cat_dict as _cat_dict, build_cat_map as _build_cat_map,
)

category_router = APIRouter(tags=["expense"])


# ════════════════════════════════════════════════════════════════════════════
# 카테고리 CRUD
# ════════════════════════════════════════════════════════════════════════════

@category_router.get("/categories")
def list_categories(
    lang: str = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기본값(user_id=NULL) + 내 카테고리를 대분류/소분류 계층으로 반환.
    category_type = 'expense' (또는 NULL, 구버전 호환) 인 카테고리만 반환.
    income 카테고리(category_type='income')는 완전히 제외."""
    cats = (
        db.query(ExpenseCategory)
        .filter(
            (ExpenseCategory.user_id == None) |  # noqa: E711
            (ExpenseCategory.user_id == current_user.id),
            ExpenseCategory.is_active == True,   # noqa: E712
            # ── 지출 카테고리만 반환 — income 카테고리 완전 격리 ──
            (ExpenseCategory.category_type == None) |         # noqa: E711  NULL = 구버전 expense
            (ExpenseCategory.category_type == 'expense'),
        )
        .order_by(ExpenseCategory.order_num, ExpenseCategory.id)
        .all()
    )

    parents = {c.id: c for c in cats if c.parent_id is None}
    subs_map: dict[int, list] = {pid: [] for pid in parents}
    for c in cats:
        if c.parent_id is not None and c.parent_id in subs_map:
            subs_map[c.parent_id].append(_cat_dict(c, lang, []))

    return [
        _cat_dict(p, lang, subs_map.get(p.id, []))
        for p in sorted(parents.values(), key=lambda x: (x.order_num, x.id))
    ]


@category_router.post("/categories", status_code=201)
def create_category(
    body: CategoryIn,
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """새 카테고리 추가 (대분류 또는 소분류)."""
    cat = ExpenseCategory(
        user_id    = current_user.id,
        parent_id  = body.parent_id,
        name_en    = body.name_en,
        name_ko    = body.name_ko,
        icon       = body.icon,
        order_num  = body.order_num,
        is_default = False,
        is_active  = True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _cat_dict(cat, "ko", [])


@category_router.put("/categories/{cat_id}")
def update_category(
    cat_id: int,
    body:   CategoryPatch,
    db:     Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카테고리 수정 (내 카테고리만 가능)."""
    cat = db.get(ExpenseCategory, cat_id)
    if not cat or cat.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found or no permission")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(cat, field, val)
    db.commit()
    db.refresh(cat)
    return _cat_dict(cat, "ko", [])


@category_router.delete("/categories/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    db:     Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카테고리 삭제 (내 카테고리만, 기본값(is_default) 삭제 불가)."""
    cat = db.get(ExpenseCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_default or cat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete default or others' category")
    db.delete(cat)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# 카테고리 드릴다운 API
# ════════════════════════════════════════════════════════════════════════════

@category_router.get("/category-detail")
def category_detail(
    year:        int = Query(...),
    month:       int = Query(...),
    category_id: int = Query(...),
    lang:        str = Query("ko", pattern="^(ko|en)$"),
    db:          Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """특정 대분류의 소분류별 집계 + 개별 지출 내역 반환."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id     == current_user.id,
            Expense.category_id == category_id,
            sqlfunc.extract("year",  Expense.date) == year,
            sqlfunc.extract("month", Expense.date) == month,
        )
        .all()
    )
    expense_rows = [e for e in rows if getattr(e, "type", "expense") == "expense"]

    cat_map = _build_cat_map(rows, db)
    cat = db.get(ExpenseCategory, category_id)

    # 소분류별 집계
    sub_totals: dict[Any, dict] = {}
    for e in expense_rows:
        key  = e.subcategory_id
        sub  = cat_map.get(key) if key else None
        name = _cat_name(sub, lang) if sub else ("기타" if lang == "ko" else "Other")
        icon = sub.icon if sub else None
        usd  = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        if key not in sub_totals:
            sub_totals[key] = {
                "subcategory_id":   key,
                "subcategory_name": name,
                "subcategory_icon": icon,
                "total_usd": 0.0,
                "count":     0,
            }
        sub_totals[key]["total_usd"] = round(sub_totals[key]["total_usd"] + usd, 2)
        sub_totals[key]["count"] += 1

    by_subcategory = sorted(sub_totals.values(), key=lambda x: x["total_usd"], reverse=True)

    # 개별 내역 (날짜 역순)
    items = []
    for e in sorted(expense_rows, key=lambda x: x.date, reverse=True):
        sub = cat_map.get(e.subcategory_id) if e.subcategory_id else None
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        items.append({
            "id":               e.id,
            "date":             str(e.date),
            "subcategory_name": _cat_name(sub, lang) if sub else None,
            "subcategory_icon": sub.icon if sub else None,
            "description":      e.description,
            "amount":           float(e.amount),
            "currency":         e.currency,
            "total_usd":        usd,
        })

    return {
        "category_id":    category_id,
        "category_name":  _cat_name(cat, lang) if cat else ("기타" if lang == "ko" else "Other"),
        "category_icon":  cat.icon if cat else "📦",
        "by_subcategory": by_subcategory,
        "items":          items,
        "total_usd":      round(sum(c["total_usd"] for c in by_subcategory), 2),
    }


@category_router.get("/category-yearly-detail")
def category_yearly_detail(
    year:        int = Query(...),
    category_id: int = Query(...),
    lang:        str = Query("ko", pattern="^(ko|en)$"),
    db:          Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """특정 대분류의 연간 전체 소분류별 집계 + 개별 지출 내역 반환."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id     == current_user.id,
            Expense.category_id == category_id,
            sqlfunc.extract("year", Expense.date) == year,
        )
        .all()
    )
    expense_rows = [e for e in rows if getattr(e, "type", "expense") == "expense"]

    cat_map = _build_cat_map(rows, db)
    cat = db.get(ExpenseCategory, category_id)

    sub_totals: dict[Any, dict] = {}
    for e in expense_rows:
        key  = e.subcategory_id
        sub  = cat_map.get(key) if key else None
        name = _cat_name(sub, lang) if sub else ("기타" if lang == "ko" else "Other")
        icon = sub.icon if sub else None
        usd  = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        if key not in sub_totals:
            sub_totals[key] = {
                "subcategory_id":   key,
                "subcategory_name": name,
                "subcategory_icon": icon,
                "total_usd": 0.0,
                "count":     0,
            }
        sub_totals[key]["total_usd"] = round(sub_totals[key]["total_usd"] + usd, 2)
        sub_totals[key]["count"] += 1

    by_subcategory = sorted(sub_totals.values(), key=lambda x: x["total_usd"], reverse=True)

    items = []
    for e in sorted(expense_rows, key=lambda x: x.date, reverse=True):
        sub = cat_map.get(e.subcategory_id) if e.subcategory_id else None
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        items.append({
            "id":               e.id,
            "date":             str(e.date),
            "subcategory_name": _cat_name(sub, lang) if sub else None,
            "subcategory_icon": sub.icon if sub else None,
            "description":      e.description,
            "amount":           float(e.amount),
            "currency":         e.currency,
            "total_usd":        usd,
        })

    return {
        "category_id":    category_id,
        "category_name":  _cat_name(cat, lang) if cat else ("기타" if lang == "ko" else "Other"),
        "category_icon":  cat.icon if cat else "📦",
        "by_subcategory": by_subcategory,
        "items":          items,
        "total_usd":      round(sum(c["total_usd"] for c in by_subcategory), 2),
    }
