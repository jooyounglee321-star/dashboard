from __future__ import annotations
"""정기지출 API — /expense/recurring"""

import calendar as _cal
from datetime import date as Date, datetime as DateTime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, RecurringExpense, User
from routers.auth import get_current_user
from routers.expense_shared import (
    RecurringExpenseIn, RecurringExpensePatch,
    fetch_cat_map, recurring_dict as _recurring_dict, to_usd as _to_usd,
)

recurring_router = APIRouter(tags=["expense"])


@recurring_router.get("/recurring")
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
    cat_map = fetch_cat_map(cat_ids, db)
    return [_recurring_dict(r, cat_map, lang) for r in rows]


@recurring_router.post("/recurring")
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
        return _recurring_dict(existing, fetch_cat_map([existing.category_id, existing.subcategory_id], db), lang)
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
    return _recurring_dict(r, fetch_cat_map([r.category_id, r.subcategory_id], db), lang)


@recurring_router.put("/recurring/{rid}")
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
    return _recurring_dict(r, fetch_cat_map([r.category_id, r.subcategory_id], db), lang)


@recurring_router.delete("/recurring/{rid}", status_code=204)
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


@recurring_router.post("/recurring/apply")
def apply_recurring(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """로그인 시 호출 — 이번 달 정기지출 항목을 자동 등록. 중복 방지."""
    today = DateTime.now(timezone.utc).date()
    year  = today.year
    month = today.month

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

    for rec in actives:
        dom = rec.day_of_month if rec.day_of_month is not None else 1
        # day_of_month=0 → 말일, 그 외는 월말 클램핑
        last_day   = _cal.monthrange(year, month)[1]
        target_day  = last_day if dom == 0 else min(dom, last_day)
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

    return {"year": year, "month": month, "created": created, "skipped": skipped}
