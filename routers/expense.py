from __future__ import annotations
"""가계부 Phase 3 — 카테고리·지출·통계·예산·환율 API.

라우터 두 개:
  expense_router  → prefix /expense
  exchange_router → prefix /exchange-rates
"""

import logging
import time as _time
from datetime import date as Date, datetime as DateTime, timezone
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseBudget, ExpenseCategory, ExchangeRate, RecurringExpense, User
from routers._shared import get_rate as _get_rate, cat_name as _cat_name, require_admin
from routers.expense_shared import (
    ExpenseIn, ExpensePatch, BudgetIn, BudgetPatch,
    RecurringExpenseIn, RecurringExpensePatch,
    to_usd as _to_usd, build_cat_map as _build_cat_map,
    expense_dict as _expense_dict, split_income_expense as _split_income_expense,
    group_by_category as _group_by_category, budget_dict as _budget_dict,
    recurring_dict as _recurring_dict,
)
from routers.expense_categories import category_router
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

expense_router  = APIRouter(prefix="/expense",        tags=["expense"])
exchange_router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])
expense_router.include_router(category_router)





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
    cat_map = _build_cat_map(rows, db)
    return {
        "date":           date.isoformat(),
        "total_usd":      total_expense,           # 하위 호환: 지출 합계
        "total_income":   total_income,
        "total_expense":  total_expense,
        "net":            net,
        "items":          [_expense_dict(e, db, lang, cat_map=cat_map) for e in rows],
        "by_category":    _group_by_category(rows, db, lang, expense_type="expense", cat_map=cat_map),
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
    cat_map = _build_cat_map(rows, db)

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
    by_cat = _group_by_category(rows, db, lang, expense_type="expense", cat_map=cat_map)
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
        "by_category":         _group_by_category(rows, db, lang, expense_type="expense", cat_map=_build_cat_map(rows, db)),
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
    cat_map = _build_cat_map(rows, db)

    # 카테고리별 집계 — 지출만
    by_cat    = _group_by_category(rows, db, lang, expense_type="expense", cat_map=cat_map)
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
# 일별 수입/지출 비교 API  (Grouped Bar Chart용)
# ════════════════════════════════════════════════════════════════════════════

@expense_router.get("/daily-compare")
def daily_compare(
    year:  int = Query(...),
    month: int = Query(...),
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """날짜별 수입 합계 / 지출 합계 반환 — Grouped Bar Chart 전용."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id == current_user.id,
            sqlfunc.extract("year",  Expense.date) == year,
            sqlfunc.extract("month", Expense.date) == month,
        )
        .all()
    )

    income_map:  dict[str, float] = {}
    expense_map: dict[str, float] = {}
    count_map:   dict[str, int]   = {}
    desc_map:    dict[str, list]  = {}

    for e in rows:
        date_str = e.date.isoformat()
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        count_map[date_str] = count_map.get(date_str, 0) + 1
        if getattr(e, "type", "expense") == "income":
            income_map[date_str]  = round(income_map.get(date_str,  0.0) + usd, 2)
        else:
            expense_map[date_str] = round(expense_map.get(date_str, 0.0) + usd, 2)
        if e.description:
            desc_map.setdefault(date_str, [])
            if len(desc_map[date_str]) < 3:
                desc_map[date_str].append(e.description)

    all_dates = sorted(set(income_map.keys()) | set(expense_map.keys()))
    return [
        {
            "date":         d,
            "income":       income_map.get(d,  0.0),
            "expense":      expense_map.get(d, 0.0),
            "count":        count_map.get(d,   0),
            "descriptions": desc_map.get(d, []),
        }
        for d in all_dates
    ]


# ════════════════════════════════════════════════════════════════════════════
# 예산 API
# ════════════════════════════════════════════════════════════════════════════

def _fetch_cat_map(ids, db: Session) -> dict:
    ids_set = {i for i in ids if i}
    if not ids_set:
        return {}
    return {c.id: c for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(ids_set)).all()}




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

    currencies = {b.currency for b in budgets}
    rate_map   = {c: _get_rate(c, db) for c in currencies}

    cat_map = _fetch_cat_map([b.category_id for b in budgets], db)

    result = []
    for b in budgets:
        brate      = rate_map.get(b.currency, 1.0)
        budget_usd = round(float(b.amount) / brate, 2)
        spent_usd  = actual.get(b.category_id, 0.0)
        d = _budget_dict(b, cat_map, lang)
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
    return _budget_dict(b, _fetch_cat_map([b.category_id], db))


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
    return _budget_dict(b, _fetch_cat_map([b.category_id], db))


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
    cat_map = _build_cat_map(rows, db)
    return [_expense_dict(e, db, lang, cat_map=cat_map) for e in rows]


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
    return _expense_dict(e, db, body.lang, cat_map=_build_cat_map([e], db))


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
    return _expense_dict(e, db, lang, cat_map=_build_cat_map([e], db))


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
def list_rates(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
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
def get_rate(currency: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
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
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("[RATE] DB 커밋 실패: %s", exc)

    # 인메모리 캐시 무효화
    _rate_cache["data"] = None
    _rate_cache["ts"]   = 0.0

    logger.info("[RATE] 환율 갱신 완료 — 성공: %s / 실패: %s", updated, failed)
    return {"updated": updated, "failed": failed}


# ════════════════════════════════════════════════════════════════════════════
# 정기지출 API  /expense/recurring
# ════════════════════════════════════════════════════════════════════════════


@expense_router.get("/recurring")
def list_recurring(
    lang: str = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(RecurringExpense)
        .filter(RecurringExpense.user_id == current_user.id)
        .order_by(RecurringExpense.day_of_month)
        .all()
    )
    cat_ids = [i for r in rows for i in (r.category_id, r.subcategory_id)]
    cat_map = _fetch_cat_map(cat_ids, db)
    return [_recurring_dict(r, cat_map, lang) for r in rows]


@expense_router.post("/recurring")
def create_recurring(
    body: RecurringExpenseIn,
    response: Response,
    lang: str = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    freq = body.frequency or "monthly"
    if freq not in ("monthly", "semi-monthly", "weekly", "biweekly"):
        raise HTTPException(status_code=422, detail="frequency must be monthly|semi-monthly|weekly|biweekly")
    if freq == "monthly":
        if not (0 <= body.day_of_month <= 31):
            raise HTTPException(status_code=422, detail="day_of_month must be 0-31 (0=last day)")
    elif freq == "semi-monthly":
        if not (0 <= body.day_of_month <= 31):
            raise HTTPException(status_code=422, detail="day_of_month must be 0-31")
        if body.day_of_month_2 is None or not (0 <= body.day_of_month_2 <= 31):
            raise HTTPException(status_code=422, detail="day_of_month_2 must be 0-31 for semi-monthly")
        if body.day_of_month == body.day_of_month_2:
            raise HTTPException(status_code=422, detail="day_of_month and day_of_month_2 must differ")
    elif freq in ("weekly", "biweekly"):
        if body.day_of_week is None or not (0 <= body.day_of_week <= 6):
            raise HTTPException(status_code=422, detail="day_of_week must be 0-6 for weekly/biweekly")
    existing = (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.user_id        == current_user.id,
            RecurringExpense.day_of_month   == body.day_of_month,
            RecurringExpense.category_id    == body.category_id,
            RecurringExpense.subcategory_id == body.subcategory_id,
            RecurringExpense.amount         == body.amount,
            RecurringExpense.currency       == body.currency,
        )
        .first()
    )
    if existing:
        response.status_code = 200
        return _recurring_dict(existing, _fetch_cat_map([existing.category_id, existing.subcategory_id], db), lang)
    r = RecurringExpense(
        user_id        = current_user.id,
        day_of_month   = body.day_of_month,
        type           = body.type,
        category_id    = body.category_id,
        subcategory_id = body.subcategory_id,
        amount         = body.amount,
        currency       = body.currency,
        memo           = body.memo,
        is_active      = True,
        frequency      = freq,
        day_of_week    = body.day_of_week,
        day_of_month_2 = body.day_of_month_2,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    response.status_code = 201
    return _recurring_dict(r, _fetch_cat_map([r.category_id, r.subcategory_id], db), lang)


@expense_router.put("/recurring/{rid}")
def update_recurring(
    rid:  int,
    body: RecurringExpensePatch,
    lang: str = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.get(RecurringExpense, rid)
    if not r or r.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    updates = body.model_dump(exclude_unset=True)
    freq = updates.get("frequency", r.frequency or "monthly")
    if "frequency" in updates and freq not in ("monthly", "semi-monthly", "weekly", "biweekly"):
        raise HTTPException(status_code=422, detail="frequency must be monthly|semi-monthly|weekly|biweekly")
    for field, val in updates.items():
        if field == "day_of_month" and val is not None and not (0 <= val <= 31):
            raise HTTPException(status_code=422, detail="day_of_month must be 0-31 (0=last day)")
        if field == "day_of_month_2" and val is not None and not (0 <= val <= 31):
            raise HTTPException(status_code=422, detail="day_of_month_2 must be 0-31")
        if field == "day_of_week" and val is not None and not (0 <= val <= 6):
            raise HTTPException(status_code=422, detail="day_of_week must be 0-6")
        setattr(r, field, val)
    db.commit()
    db.refresh(r)
    return _recurring_dict(r, _fetch_cat_map([r.category_id, r.subcategory_id], db), lang)


@expense_router.delete("/recurring/{rid}", status_code=204)
def delete_recurring(
    rid: int,
    db:  Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.get(RecurringExpense, rid)
    if not r or r.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()


@expense_router.post("/recurring/apply")
def apply_recurring(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """로그인 시 호출 — 이번 달 정기지출 항목을 자동 등록. 중복 방지."""
    today   = DateTime.now(timezone.utc).date()
    year    = today.year
    month   = today.month

    actives = (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.user_id   == current_user.id,
            RecurringExpense.is_active == True,   # noqa: E712
        )
        .all()
    )

    created = []
    skipped = []

    import calendar as _cal
    for rec in actives:
        dom = rec.day_of_month if rec.day_of_month is not None else 1
        # day_of_month=0 → 말일, 그 외는 월말 클램핑
        last_day = _cal.monthrange(year, month)[1]
        target_day = last_day if dom == 0 else min(dom, last_day)
        target_date = Date(year, month, target_day)

        # 중복 체크: recurring_id 메모 패턴으로 검사
        tag = f"[R#{rec.id}]"
        already = (
            db.query(Expense)
            .filter(
                Expense.user_id     == current_user.id,
                Expense.description.contains(tag),
                Expense.date        >= Date(year, month, 1),
                Expense.date        <= Date(year, month, last_day),
            )
            .first()
        )
        if already:
            skipped.append(rec.id)
            continue

        converted, rate = _to_usd(rec.amount, rec.currency, db)
        memo_text = (rec.memo or "").strip()
        full_desc = f"{tag} {memo_text}".strip() if memo_text else tag

        rec_type = getattr(rec, "type", "expense") or "expense"
        e = Expense(
            user_id          = current_user.id,
            date             = target_date,
            amount           = rec.amount,
            currency         = rec.currency,
            converted_amount = converted,
            exchange_rate    = rate,
            category_id      = rec.category_id,
            subcategory_id   = rec.subcategory_id,
            description      = full_desc,
            type             = rec_type,
        )
        db.add(e)
        created.append(rec.id)

    if created:
        db.commit()

    return {
        "year":    year,
        "month":   month,
        "created": created,
        "skipped": skipped,
    }
