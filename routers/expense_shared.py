from __future__ import annotations
"""가계부 공통 유틸 — schemas + 내부 helper 함수.

expense.py 리팩토링 준비용 공유 모듈.
expense.py 는 이 파일에서 alias import 해 기존 내부 호출(_func)을 그대로 유지.
"""

from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import date as Date

from models import Expense, ExpenseBudget, ExpenseCategory, RecurringExpense
from routers._shared import get_rate as _get_rate, cat_name as _cat_name


# ── Pydantic 요청 스키마 ──────────────────────────────────────────────────────

class CategoryIn(BaseModel):
    parent_id:  int | None = None
    name_en:    str
    name_ko:    str
    icon:       str | None = None
    order_num:  int = 0


class CategoryPatch(BaseModel):
    name_en:   str | None = None
    name_ko:   str | None = None
    icon:      str | None = None
    order_num: int | None = None
    is_active: bool | None = None


class ExpenseIn(BaseModel):
    date:           Date
    amount:         float
    currency:       str = "USD"
    category_id:    int | None = None
    subcategory_id: int | None = None
    description:    str | None = Field(default=None, max_length=2000)
    lang:           str = "ko"
    type:           str = "expense"   # 'expense' | 'income'


class ExpensePatch(BaseModel):
    date:           Date | None = None
    amount:         float | None = None
    currency:       str | None = None
    category_id:    int | None = None
    subcategory_id: int | None = None
    description:    str | None = Field(default=None, max_length=2000)
    lang:           str = "ko"
    type:           str | None = None  # 'expense' | 'income'


class BudgetIn(BaseModel):
    category_id: int | None = None
    year:        int
    month:       int | None = None
    amount:      float
    currency:    str = "USD"


class BudgetPatch(BaseModel):
    amount:      float | None = None
    currency:    str | None = None
    year:        int | None = None
    month:       int | None = None
    category_id: int | None = None


class RecurringExpenseIn(BaseModel):
    day_of_month:   int = 1
    type:           str = "expense"   # 'expense' | 'income'
    category_id:    int | None = None
    subcategory_id: int | None = None
    amount:         float
    currency:       str = "USD"
    memo:           str | None = None
    frequency:      str = "monthly"   # 'monthly' | 'semi-monthly' | 'weekly' | 'biweekly'
    day_of_week:    int | None = None  # 0=월 ~ 6=일
    day_of_month_2: int | None = None  # semi-monthly 두 번째 날짜 (0=말일, 1~31)


class RecurringExpensePatch(BaseModel):
    day_of_month:   int | None = None
    type:           str | None = None
    category_id:    int | None = None
    subcategory_id: int | None = None
    amount:         float | None = None
    currency:       str | None = None
    memo:           str | None = None
    is_active:      bool | None = None
    frequency:      str | None = None
    day_of_week:    int | None = None
    day_of_month_2: int | None = None


# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def to_usd(amount: float, currency: str, db: Session) -> tuple[float, float]:
    """금액을 USD로 환산. (converted_usd, applied_rate) 반환."""
    rate = _get_rate(currency, db)
    return round(float(amount) / rate, 2), rate


def cat_dict(cat: ExpenseCategory, lang: str, subs: list[dict]) -> dict:
    return {
        "id":         cat.id,
        "user_id":    cat.user_id,
        "parent_id":  cat.parent_id,
        "name":       _cat_name(cat, lang),
        "name_en":    cat.name_en,
        "name_ko":    cat.name_ko,
        "icon":       cat.icon,
        "order_num":  cat.order_num,
        "is_default": cat.is_default,
        "is_active":  cat.is_active,
        "subs":       subs,
    }


def build_cat_map(rows: list, db: Session) -> dict:
    """rows의 모든 category_id/subcategory_id를 단일 배치 쿼리로 조회."""
    ids = {e.category_id for e in rows if e.category_id} | \
          {e.subcategory_id for e in rows if e.subcategory_id}
    if not ids:
        return {}
    return {c.id: c for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(ids)).all()}


def fetch_cat_map(ids, db: Session) -> dict:
    """ID 집합으로 직접 카테고리 배치 조회 (rows 없이 id만 있는 경우)."""
    ids_set = {i for i in ids if i}
    if not ids_set:
        return {}
    return {c.id: c for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(ids_set)).all()}


def expense_dict(e: Expense, db: Session, lang: str = "ko", cat_map: dict | None = None) -> dict:
    if cat_map is not None:
        cat = cat_map.get(e.category_id)    if e.category_id    else None
        sub = cat_map.get(e.subcategory_id) if e.subcategory_id else None
    else:
        cat = db.get(ExpenseCategory, e.category_id)    if e.category_id    else None
        sub = db.get(ExpenseCategory, e.subcategory_id) if e.subcategory_id else None
    return {
        "id":               e.id,
        "date":             e.date.isoformat(),
        "amount":           float(e.amount),
        "currency":         e.currency or "USD",
        "converted_amount": float(e.converted_amount) if e.converted_amount is not None else None,
        "exchange_rate":    float(e.exchange_rate)    if e.exchange_rate    is not None else None,
        "category_id":      e.category_id,
        "subcategory_id":   e.subcategory_id,
        "category_name":    _cat_name(cat, lang) if cat else (e.category or None),
        "subcategory_name": _cat_name(sub, lang) if sub else None,
        "category_icon":    cat.icon if cat else None,
        "subcategory_icon": sub.icon if sub else None,
        "description":      e.description,
        "created_at":       e.created_at.isoformat(),
        "type":             getattr(e, "type", "expense") or "expense",
    }


def split_income_expense(rows: list) -> tuple:
    """rows 를 수입/지출로 분리해 (total_income, total_expense, net) 반환."""
    inc = exp = 0.0
    for e in rows:
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        if getattr(e, "type", "expense") == "income":
            inc += usd
        else:
            exp += usd
    return round(inc, 2), round(exp, 2), round(inc - exp, 2)


def group_by_category(
    rows: list[Expense], db: Session, lang: str, expense_type: str | None = None,
    cat_map: dict | None = None,
) -> list[dict]:
    """지출 목록을 카테고리별로 집계. total_usd 내림차순.

    expense_type='expense' 이면 지출 행만, 'income' 이면 수입 행만 집계.
    None 이면 전체(하위 호환).
    """
    if cat_map is None:
        cat_map = build_cat_map(rows, db)
    totals: dict[int | None, dict[str, Any]] = {}
    for e in rows:
        if expense_type is not None and getattr(e, "type", "expense") != expense_type:
            continue
        cat = cat_map.get(e.category_id) if e.category_id else None
        key  = e.category_id
        name = _cat_name(cat, lang) if cat else (e.category or ("Other" if lang == "en" else "기타"))
        icon = cat.icon if cat else "📦"
        usd  = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        if key not in totals:
            totals[key] = {
                "category_id":   key,
                "category_name": name,
                "category_icon": icon,
                "total_usd":     0.0,
                "count":         0,
            }
        totals[key]["total_usd"] = round(totals[key]["total_usd"] + usd, 2)
        totals[key]["count"] += 1
    return sorted(totals.values(), key=lambda x: x["total_usd"], reverse=True)


def budget_dict(b: ExpenseBudget, cat_map: dict, lang: str = "ko") -> dict:
    cat = cat_map.get(b.category_id) if b.category_id else None
    return {
        "id":            b.id,
        "category_id":   b.category_id,
        "category_name": _cat_name(cat, lang) if cat else None,
        "category_icon": cat.icon if cat else None,
        "year":          b.year,
        "month":         b.month,
        "amount":        float(b.amount),
        "currency":      b.currency,
        "updated_at":    b.updated_at.isoformat(),
    }


def recurring_dict(r: RecurringExpense, cat_map: dict, lang: str = "ko") -> dict:
    cat = cat_map.get(r.category_id)    if r.category_id    else None
    sub = cat_map.get(r.subcategory_id) if r.subcategory_id else None
    return {
        "id":               r.id,
        "day_of_month":     r.day_of_month,
        "type":             getattr(r, "type", "expense"),
        "category_id":      r.category_id,
        "subcategory_id":   r.subcategory_id,
        "category_name":    _cat_name(cat, lang) if cat else None,
        "subcategory_name": _cat_name(sub, lang) if sub else None,
        "category_icon":    cat.icon if cat else None,
        "amount":           float(r.amount),
        "currency":         r.currency,
        "memo":             r.memo,
        "is_active":        r.is_active,
        "created_at":       r.created_at.isoformat(),
        "frequency":        getattr(r, "frequency", "monthly") or "monthly",
        "day_of_week":      getattr(r, "day_of_week", None),
        "day_of_month_2":   getattr(r, "day_of_month_2", None),
    }
