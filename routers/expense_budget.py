from __future__ import annotations
"""예산 API — /expense/budget"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseBudget, User
from routers._shared import get_rate as _get_rate
from routers.auth import get_current_user
from routers.expense_shared import BudgetIn, BudgetPatch, fetch_cat_map, budget_dict

budget_router = APIRouter(tags=["expense"])


@budget_router.get("/budget")
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

    cat_map = fetch_cat_map([b.category_id for b in budgets], db)

    result = []
    for b in budgets:
        brate      = rate_map.get(b.currency, 1.0)
        budget_usd = round(float(b.amount) / brate, 2)
        spent_usd  = actual.get(b.category_id, 0.0)
        d = budget_dict(b, cat_map, lang)
        d["budget_usd"]    = budget_usd
        d["spent_usd"]     = spent_usd
        d["remaining_usd"] = round(budget_usd - spent_usd, 2)
        result.append(d)
    return result


@budget_router.post("/budget", status_code=201)
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
    return budget_dict(b, fetch_cat_map([b.category_id], db))


@budget_router.put("/budget/{budget_id}")
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
    return budget_dict(b, fetch_cat_map([b.category_id], db))


@budget_router.delete("/budget/{budget_id}", status_code=204)
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
