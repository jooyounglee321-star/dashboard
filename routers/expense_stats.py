from __future__ import annotations
"""통계/요약 API — /expense/summary/* /expense/stats /expense/daily-compare

expense_router(prefix /expense)에 sub-router로 포함됨.
카테고리 드릴다운(/category-detail, /category-yearly-detail)은 expense_categories.py에 있음.
"""

from datetime import date as Date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseBudget, ExpenseCategory, User
from routers._shared import get_rate as _get_rate
from routers.auth import get_current_user
from routers.expense_shared import (
    build_cat_map as _build_cat_map,
    expense_dict as _expense_dict,
    split_income_expense as _split_income_expense,
    group_by_category as _group_by_category,
)

stats_router = APIRouter(tags=["expense"])


# ════════════════════════════════════════════════════════════════════════════
# 통계 / 요약 API  (구체 경로를 /{id} 보다 먼저 정의)
# ════════════════════════════════════════════════════════════════════════════

@stats_router.get("/summary/daily")
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


@stats_router.get("/summary/monthly")
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


@stats_router.get("/summary/yearly")
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

    total_income, total_expense, net      = _split_income_expense(rows)
    prev_income,  prev_expense,  prev_net = _split_income_expense(prev_rows)
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


@stats_router.get("/summary/yearly-matrix")
def summary_yearly_matrix(
    year: int = Query(...),
    lang: str  = Query("ko", pattern="^(ko|en)$"),
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카테고리 × 월별 매트릭스 — 대분류(소계) + 소분류 드릴다운용."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id == current_user.id,
            sqlfunc.extract("year", Expense.date) == year,
        )
        .all()
    )

    # 카테고리 맵 (id → ExpenseCategory)
    cat_ids = {e.category_id for e in rows if e.category_id} | \
              {e.subcategory_id for e in rows if e.subcategory_id}
    cat_map: dict[int, ExpenseCategory] = {}
    if cat_ids:
        cat_map = {c.id: c for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(cat_ids)).all()}

    # 대분류 집계: { cat_id → { month → usd } }
    # 소분류 집계: { cat_id → { sub_id → { month → usd } } }
    def _name(c: ExpenseCategory) -> str:
        return c.name_ko if lang == "ko" else c.name_en

    OTHER_KEY = "__other__"
    cat_monthly: dict = {}        # cat_key → [0.0]*12
    sub_monthly: dict = {}        # cat_key → { sub_key → [0.0]*12 }
    cat_meta: dict = {}           # cat_key → {name, icon}
    sub_meta: dict = {}           # (cat_key, sub_key) → {name, icon}
    income_monthly = [0.0] * 12

    for e in rows:
        usd = float(e.converted_amount) if e.converted_amount is not None else float(e.amount)
        m   = e.date.month - 1  # 0-indexed
        if getattr(e, "type", "expense") == "income":
            income_monthly[m] = round(income_monthly[m] + usd, 2)
            continue
        cat = cat_map.get(e.category_id) if e.category_id else None
        sub = cat_map.get(e.subcategory_id) if e.subcategory_id else None
        cat_key = e.category_id if cat else OTHER_KEY
        sub_key = e.subcategory_id if sub else None

        if cat_key not in cat_monthly:
            cat_monthly[cat_key] = [0.0] * 12
            sub_monthly[cat_key] = {}
            if cat:
                cat_meta[cat_key] = {"category_name": _name(cat), "category_icon": cat.icon or "📦"}
            else:
                cat_meta[cat_key] = {"category_name": "기타" if lang == "ko" else "Other", "category_icon": "📦"}

        cat_monthly[cat_key][m] = round(cat_monthly[cat_key][m] + usd, 2)

        if sub_key is not None:
            if sub_key not in sub_monthly[cat_key]:
                sub_monthly[cat_key][sub_key] = [0.0] * 12
                sub_meta[(cat_key, sub_key)] = {"subcategory_name": _name(sub), "subcategory_icon": sub.icon or ""}
            sub_monthly[cat_key][sub_key][m] = round(sub_monthly[cat_key][sub_key][m] + usd, 2)
        else:
            # 소분류 없는 항목은 "기타소분류" 버킷
            none_key = None
            if none_key not in sub_monthly[cat_key]:
                sub_monthly[cat_key][none_key] = [0.0] * 12
                sub_meta[(cat_key, none_key)] = {
                    "subcategory_name": "기타" if lang == "ko" else "Other",
                    "subcategory_icon": "",
                }
            sub_monthly[cat_key][none_key][m] = round(sub_monthly[cat_key][none_key][m] + usd, 2)

    # 지출 총합
    grand_monthly = [0.0] * 12
    for monthly in cat_monthly.values():
        for i in range(12):
            grand_monthly[i] = round(grand_monthly[i] + monthly[i], 2)

    categories = []
    for cat_key, monthly in sorted(cat_monthly.items(), key=lambda x: -sum(x[1])):
        subs = []
        for sub_key, s_monthly in sorted(sub_monthly[cat_key].items(), key=lambda x: -sum(x[1])):
            meta = sub_meta.get((cat_key, sub_key), {})
            subs.append({
                "subcategory_id":   sub_key,
                "subcategory_name": meta.get("subcategory_name", ""),
                "subcategory_icon": meta.get("subcategory_icon", ""),
                "monthly":          s_monthly,
                "total_usd":        round(sum(s_monthly), 2),
            })
        meta = cat_meta.get(cat_key, {})
        categories.append({
            "category_id":   cat_key if cat_key != OTHER_KEY else None,
            "category_name": meta.get("category_name", ""),
            "category_icon": meta.get("category_icon", "📦"),
            "monthly":       monthly,
            "total_usd":     round(sum(monthly), 2),
            "subcategories": subs,
        })

    return {
        "year":                year,
        "categories":          categories,
        "grand_total_monthly": grand_monthly,
        "grand_total_usd":     round(sum(grand_monthly), 2),
        "income_monthly":      income_monthly,
        "income_total_usd":    round(sum(income_monthly), 2),
    }


@stats_router.get("/stats")
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

@stats_router.get("/daily-compare")
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
