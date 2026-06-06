"""가계부 Phase 3 — 카테고리·지출·통계·예산·환율 API.

라우터 두 개:
  expense_router  → prefix /expense
  exchange_router → prefix /exchange-rates
"""

import logging
import time as _time
from datetime import date as Date
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseBudget, ExpenseCategory, ExchangeRate, User
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

expense_router  = APIRouter(prefix="/expense",        tags=["expense"])
exchange_router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


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
    description:    str | None = None
    lang:           str = "ko"
    type:           str = "expense"   # 'expense' | 'income'


class ExpensePatch(BaseModel):
    date:           Date | None = None
    amount:         float | None = None
    currency:       str | None = None
    category_id:    int | None = None
    subcategory_id: int | None = None
    description:    str | None = None
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


# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def _get_rate(currency: str, db: Session) -> float:
    """DB에서 USD 기준 환율 조회. 없거나 USD면 1.0."""
    if currency == "USD":
        return 1.0
    row = db.query(ExchangeRate).filter_by(
        base_currency="USD", target_currency=currency
    ).first()
    return float(row.rate) if row else 1.0


def _to_usd(amount: float, currency: str, db: Session) -> tuple[float, float]:
    """금액을 USD로 환산. (converted_usd, applied_rate) 반환."""
    rate = _get_rate(currency, db)
    return round(amount / rate, 2), rate


def _cat_name(cat: ExpenseCategory, lang: str) -> str:
    return cat.name_en if lang == "en" else cat.name_ko


def _cat_dict(cat: ExpenseCategory, lang: str, subs: list[dict]) -> dict:
    return {
        "id":        cat.id,
        "user_id":   cat.user_id,
        "parent_id": cat.parent_id,
        "name":      _cat_name(cat, lang),
        "name_en":   cat.name_en,
        "name_ko":   cat.name_ko,
        "icon":      cat.icon,
        "order_num": cat.order_num,
        "is_default": cat.is_default,
        "is_active": cat.is_active,
        "subs":      subs,
    }


def _expense_dict(e: Expense, db: Session, lang: str = "ko") -> dict:
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


def _split_income_expense(rows: list) -> tuple:
    """rows 를 수입/지출로 분리해 (total_income, total_expense, net) 반환."""
    inc = exp = 0.0
    for e in rows:
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        if getattr(e, "type", "expense") == "income":
            inc += usd
        else:
            exp += usd
    return round(inc, 2), round(exp, 2), round(inc - exp, 2)


def _group_by_category(
    rows: list[Expense], db: Session, lang: str, expense_type: str | None = None
) -> list[dict]:
    """지출 목록을 카테고리별로 집계. total_usd 내림차순.

    expense_type='expense' 이면 지출 행만, 'income' 이면 수입 행만 집계.
    None 이면 전체(하위 호환).
    """
    totals: dict[int | None, dict[str, Any]] = {}
    for e in rows:
        if expense_type is not None and getattr(e, "type", "expense") != expense_type:
            continue
        cat = db.get(ExpenseCategory, e.category_id) if e.category_id else None
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


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


# ════════════════════════════════════════════════════════════════════════════
# 카테고리 API
# ════════════════════════════════════════════════════════════════════════════

@expense_router.get("/categories")
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


@expense_router.post("/categories", status_code=201)
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


@expense_router.put("/categories/{cat_id}")
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


@expense_router.delete("/categories/{cat_id}", status_code=204)
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
# 통계 / 요약 API  (구체 경로를 /{id} 보다 먼저 정의)
# ════════════════════════════════════════════════════════════════════════════

@expense_router.get("/summary/daily")
def summary_daily(
    date: Date = Query(...),
    lang: str   = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """해당일 지출 목록 + 카테고리별 합계 + 총합계(USD 환산)."""
    rows = (
        db.query(Expense)
        .filter(Expense.user_id == current_user.id, Expense.date == date)
        .order_by(Expense.created_at.desc())
        .all()
    )
    total_income, total_expense, net = _split_income_expense(rows)
    return {
        "date":           date.isoformat(),
        "total_usd":      total_expense,           # 하위 호환: 지출 합계
        "total_income":   total_income,
        "total_expense":  total_expense,
        "net":            net,
        "items":          [_expense_dict(e, db, lang) for e in rows],
        "by_category":    _group_by_category(rows, db, lang, expense_type="expense"),
    }


@expense_router.get("/summary/monthly")
def summary_monthly(
    year:  int = Query(...),
    month: int = Query(...),
    lang:  str = Query("ko", pattern="^(ko|en)$"),
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 카테고리 합계 + 예산 대비 실지출 + 일별 합계 배열(차트용)."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id == current_user.id,
            sqlfunc.extract("year",  Expense.date) == year,
            sqlfunc.extract("month", Expense.date) == month,
        )
        .all()
    )

    total_income, total_expense, net = _split_income_expense(rows)

    # 일별 합계 (지출만 — 차트용)
    daily_map: dict[int, float] = {}
    for e in rows:
        if getattr(e, "type", "expense") == "income":
            continue
        d = e.date.day
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        daily_map[d] = round(daily_map.get(d, 0.0) + usd, 2)
    daily_list = [{"day": d, "total_usd": daily_map[d]} for d in sorted(daily_map)]

    # 카테고리 합계 + 예산 매핑 (지출만)
    by_cat = _group_by_category(rows, db, lang, expense_type="expense")
    budgets = (
        db.query(ExpenseBudget)
        .filter(
            ExpenseBudget.user_id == current_user.id,
            ExpenseBudget.year  == year,
            ExpenseBudget.month == month,
        )
        .all()
    )
    budget_map = {b.category_id: b for b in budgets}
    for c in by_cat:
        b = budget_map.get(c["category_id"])
        if b:
            brate      = _get_rate(b.currency, db)
            budget_usd = round(float(b.amount) / brate, 2)
            c["budget_usd"]    = budget_usd
            c["remaining_usd"] = round(budget_usd - c["total_usd"], 2)
        else:
            c["budget_usd"]    = None
            c["remaining_usd"] = None

    return {
        "year": year, "month": month,
        "total_usd":      total_expense,           # 하위 호환: 지출 합계
        "total_income":   total_income,
        "total_expense":  total_expense,
        "net":            net,
        "by_category":    by_cat,
        "daily":          daily_list,
    }


@expense_router.get("/summary/yearly")
def summary_yearly(
    year: int = Query(...),
    lang: str  = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """연간 월별 합계 + 카테고리별 합계 + 전년 대비 비교."""
    def _fetch(y: int) -> list[Expense]:
        return (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                sqlfunc.extract("year", Expense.date) == y,
            )
            .all()
        )

    rows      = _fetch(year)
    prev_rows = _fetch(year - 1)

    def _monthly_totals(expense_rows: list[Expense]) -> list[dict]:
        inc_map: dict[int, float] = {}
        exp_map: dict[int, float] = {}
        for e in expense_rows:
            usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
            m   = e.date.month
            if getattr(e, "type", "expense") == "income":
                inc_map[m] = round(inc_map.get(m, 0.0) + usd, 2)
            else:
                exp_map[m] = round(exp_map.get(m, 0.0) + usd, 2)
        return [{
            "month":         m,
            "total_usd":     exp_map.get(m, 0.0),    # 하위 호환
            "total_income":  inc_map.get(m, 0.0),
            "total_expense": exp_map.get(m, 0.0),
            "net":           round(inc_map.get(m, 0.0) - exp_map.get(m, 0.0), 2),
        } for m in range(1, 13)]

    total_income, total_expense, net         = _split_income_expense(rows)
    prev_income,  prev_expense,  prev_net    = _split_income_expense(prev_rows)
    yoy_pct = round((total_expense - prev_expense) / prev_expense * 100, 1) if prev_expense else None

    return {
        "year":                year,
        "total_usd":           total_expense,         # 하위 호환: 지출 합계
        "total_income":        total_income,
        "total_expense":       total_expense,
        "net":                 net,
        "prev_year_total_usd": prev_expense,
        "prev_year_income":    prev_income,
        "prev_year_expense":   prev_expense,
        "yoy_change_pct":      yoy_pct,
        "monthly":             _monthly_totals(rows),
        "prev_monthly":        _monthly_totals(prev_rows),
        "by_category":         _group_by_category(rows, db, lang, expense_type="expense"),
    }


@expense_router.get("/stats")
def expense_stats(
    year:  int = Query(...),
    month: int = Query(...),
    lang:  str = Query("ko", pattern="^(ko|en)$"),
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카테고리별 % 비율(파이차트) + 최다지출 + 예산초과 + 일별추이(라인차트)."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id == current_user.id,
            sqlfunc.extract("year",  Expense.date) == year,
            sqlfunc.extract("month", Expense.date) == month,
        )
        .all()
    )
    total_income, total_expense, net = _split_income_expense(rows)

    # 카테고리별 집계 — 지출만
    by_cat    = _group_by_category(rows, db, lang, expense_type="expense")
    total_cat = sum(c["total_usd"] for c in by_cat)

    for c in by_cat:
        c["pct"] = round(c["total_usd"] / total_cat * 100, 1) if total_cat else 0.0

    # 예산 초과 (지출만 비교)
    budgets = (
        db.query(ExpenseBudget)
        .filter(
            ExpenseBudget.user_id == current_user.id,
            ExpenseBudget.year  == year,
            ExpenseBudget.month == month,
        )
        .all()
    )
    budget_map = {b.category_id: b for b in budgets}
    over_budget = []
    for c in by_cat:
        b = budget_map.get(c["category_id"])
        if b:
            brate      = _get_rate(b.currency, db)
            budget_usd = float(b.amount) / brate
            if c["total_usd"] > budget_usd:
                over_budget.append({
                    **c,
                    "budget_usd":  round(budget_usd, 2),
                    "over_by_usd": round(c["total_usd"] - budget_usd, 2),
                })

    # 일별 추이 (지출만 — 차트용)
    daily_map: dict[int, float] = {}
    for e in rows:
        if getattr(e, "type", "expense") == "income":
            continue
        d   = e.date.day
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        daily_map[d] = round(daily_map.get(d, 0.0) + usd, 2)
    daily_trend = [{"day": d, "total_usd": daily_map[d]} for d in sorted(daily_map)]

    return {
        "year": year, "month": month,
        "total_usd":      total_expense,           # 하위 호환: 지출 합계
        "total_income":   total_income,
        "total_expense":  total_expense,
        "net":            net,
        "by_category":    by_cat,
        "top_category":   by_cat[0] if by_cat else None,
        "over_budget":    over_budget,
        "daily_trend":    daily_trend,
    }


# ════════════════════════════════════════════════════════════════════════════
# 예산 API
# ════════════════════════════════════════════════════════════════════════════

def _budget_dict(b: ExpenseBudget, db: Session, lang: str = "ko") -> dict:
    cat = db.get(ExpenseCategory, b.category_id) if b.category_id else None
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


@expense_router.get("/budget")
def list_budgets(
    year:  int          = Query(...),
    month: int | None   = None,
    lang:  str          = Query("ko", pattern="^(ko|en)$"),
    db:    Session      = Depends(get_db),
    current_user: User  = Depends(get_current_user),
):
    """해당 기간 예산 목록 + 카테고리별 실지출/잔여 포함."""
    q = db.query(ExpenseBudget).filter(
        ExpenseBudget.user_id == current_user.id,
        ExpenseBudget.year == year,
    )
    if month is not None:
        q = q.filter(ExpenseBudget.month == month)
    budgets = q.all()

    # 해당 기간 실지출
    eq = db.query(Expense).filter(
        Expense.user_id == current_user.id,
        sqlfunc.extract("year", Expense.date) == year,
    )
    if month is not None:
        eq = eq.filter(sqlfunc.extract("month", Expense.date) == month)
    actual: dict[int | None, float] = {}
    for e in eq.all():
        k   = e.category_id
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        actual[k] = round(actual.get(k, 0.0) + usd, 2)

    result = []
    for b in budgets:
        brate      = _get_rate(b.currency, db)
        budget_usd = round(float(b.amount) / brate, 2)
        spent_usd  = actual.get(b.category_id, 0.0)
        d = _budget_dict(b, db, lang)
        d["budget_usd"]    = budget_usd
        d["spent_usd"]     = spent_usd
        d["remaining_usd"] = round(budget_usd - spent_usd, 2)
        result.append(d)
    return result


@expense_router.post("/budget", status_code=201)
def create_budget(
    body: BudgetIn,
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = ExpenseBudget(
        user_id     = current_user.id,
        category_id = body.category_id,
        year        = body.year,
        month       = body.month,
        amount      = body.amount,
        currency    = body.currency,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _budget_dict(b, db)


@expense_router.put("/budget/{budget_id}")
def update_budget(
    budget_id: int,
    body:      BudgetPatch,
    db:        Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = db.get(ExpenseBudget, budget_id)
    if not b or b.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(b, field, val)
    db.commit()
    db.refresh(b)
    return _budget_dict(b, db)


@expense_router.delete("/budget/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    db:        Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = db.get(ExpenseBudget, budget_id)
    if not b or b.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(b)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# 지출 CRUD  (/{id} 경로는 마지막에 정의)
# ════════════════════════════════════════════════════════════════════════════

@expense_router.get("")
def list_expenses(
    date:  Date | None = None,
    year:  int  | None = None,
    month: int  | None = None,
    type:  str  | None = Query(None, pattern="^(expense|income)$"),
    lang:  str         = Query("ko", pattern="^(ko|en)$"),
    db:    Session     = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """지출/수입 목록 (date / year+month / year / type 필터, 카테고리 정보 포함)."""
    q = db.query(Expense).filter(Expense.user_id == current_user.id)
    if date:
        q = q.filter(Expense.date == date)
    elif year and month:
        q = q.filter(
            sqlfunc.extract("year",  Expense.date) == year,
            sqlfunc.extract("month", Expense.date) == month,
        )
    elif year:
        q = q.filter(sqlfunc.extract("year", Expense.date) == year)
    # type 필터: expense | income (미지정 시 전체 반환)
    if type:
        q = q.filter(Expense.type == type)
    rows = q.order_by(Expense.date.desc(), Expense.created_at.desc()).all()
    return [_expense_dict(e, db, lang) for e in rows]


@expense_router.post("", status_code=201)
def create_expense(
    body: ExpenseIn,
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """지출/수입 추가. 현재 DB 환율로 converted_amount 자동 계산."""
    converted, rate = _to_usd(body.amount, body.currency, db)
    e = Expense(
        user_id          = current_user.id,
        date             = body.date,
        amount           = body.amount,
        currency         = body.currency,
        converted_amount = converted,
        exchange_rate    = rate,
        category_id      = body.category_id,
        subcategory_id   = body.subcategory_id,
        description      = body.description,
        type             = body.type if body.type in ("expense", "income") else "expense",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _expense_dict(e, db, body.lang)


@expense_router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    body:       ExpensePatch,
    db:         Session = Depends(get_db),
    current_user: User  = Depends(get_current_user),
):
    """지출 수정 (내 데이터만). amount/currency 변경 시 환산 재계산."""
    e = db.get(Expense, expense_id)
    if not e or e.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Expense not found")

    updates = body.model_dump(exclude_unset=True)
    lang    = updates.pop("lang", "ko")

    # amount / currency 변경이 있으면 환산 재계산
    new_amount   = updates.pop("amount",   None)
    new_currency = updates.pop("currency", None)
    if new_amount is not None or new_currency is not None:
        amount   = new_amount   if new_amount   is not None else float(e.amount)
        currency = new_currency if new_currency is not None else (e.currency or "USD")
        converted, rate = _to_usd(amount, currency, db)
        e.amount           = amount
        e.currency         = currency
        e.converted_amount = converted
        e.exchange_rate    = rate

    for field, val in updates.items():
        if field == "type":
            # type 값 검증: expense | income 만 허용
            if val in ("expense", "income"):
                e.type = val
        else:
            setattr(e, field, val)

    db.commit()
    db.refresh(e)
    return _expense_dict(e, db, lang)


@expense_router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db:         Session = Depends(get_db),
    current_user: User  = Depends(get_current_user),
):
    """지출 삭제 (내 데이터만)."""
    e = db.get(Expense, expense_id)
    if not e or e.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(e)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# 환율 API
# ════════════════════════════════════════════════════════════════════════════

_RATE_TICKERS: dict[str, str] = {
    "KRW": "USDKRW=X",
    "EUR": "USDEUR=X",
    "JPY": "USDJPY=X",
    "GBP": "USDGBP=X",
    "CAD": "USDCAD=X",
    "AUD": "USDAUD=X",
    "CNY": "USDCNY=X",
    "HKD": "USDHKD=X",
    "SGD": "USDSGD=X",
    "CHF": "USDCHF=X",
}

_rate_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 30 * 60  # 30분


@exchange_router.get("")
def list_rates(db: Session = Depends(get_db)):
    """전체 환율 목록 (30분 인메모리 캐시)."""
    now = _time.time()
    if _rate_cache["data"] is not None and now - _rate_cache["ts"] < _CACHE_TTL:
        return _rate_cache["data"]

    rows = db.query(ExchangeRate).order_by(ExchangeRate.target_currency).all()
    data = [
        {
            "base":       r.base_currency,
            "target":     r.target_currency,
            "rate":       float(r.rate),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    _rate_cache["data"] = data
    _rate_cache["ts"]   = now
    return data


@exchange_router.post("/refresh")
def refresh_rates(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(require_admin),
):
    """Yahoo Finance에서 환율 강제 갱신 (admin 전용)."""
    return do_refresh_rates(db)


@exchange_router.get("/{currency}")
def get_rate(currency: str, db: Session = Depends(get_db)):
    """특정 통화의 USD 기준 환율 반환 (예: /KRW)."""
    currency = currency.upper()
    row = db.query(ExchangeRate).filter_by(
        base_currency="USD", target_currency=currency
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Rate for {currency} not found")
    return {
        "base":       "USD",
        "target":     currency,
        "rate":       float(row.rate),
        "updated_at": row.updated_at.isoformat(),
    }


# ── 환율 갱신 공용 함수 (main.py APScheduler에서도 호출) ─────────────────────

def do_refresh_rates(db: Session) -> dict:
    """Yahoo Finance에서 실시간 환율 조회 후 DB 업데이트. 캐시 무효화."""
    updated: list[str] = []
    failed:  list[str] = []

    for target, ticker in _RATE_TICKERS.items():
        try:
            price = yf.Ticker(ticker).fast_info.last_price
            if price and price > 0:
                row = db.query(ExchangeRate).filter_by(
                    base_currency="USD", target_currency=target
                ).first()
                if row:
                    row.rate = round(float(price), 6)
                else:
                    db.add(ExchangeRate(
                        base_currency="USD",
                        target_currency=target,
                        rate=round(float(price), 6),
                    ))
                updated.append(target)
            else:
                failed.append(target)
        except Exception as exc:
            logger.warning("[RATE] %s 갱신 실패: %s", target, exc)
            failed.append(target)

    if updated:
        db.commit()

    # 인메모리 캐시 무효화
    _rate_cache["data"] = None
    _rate_cache["ts"]   = 0.0

    logger.info("[RATE] 환율 갱신 완료 — 성공: %s / 실패: %s", updated, failed)
    return {"updated": updated, "failed": failed}
