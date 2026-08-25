from __future__ import annotations
"""가계부 메인 라우터 — 지출 CRUD + 환율 API.

라우터 두 개:
  expense_router  → prefix /expense
  exchange_router → prefix /exchange-rates

통계/카테고리/예산/정기지출은 각각 별도 파일로 분리:
  expense_categories.py, expense_stats.py, expense_budget.py, expense_recurring.py
"""

import logging
import time as _time
from datetime import date as Date
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExchangeRate, User
from routers._shared import require_admin
from routers.auth import get_current_user
from routers.expense_shared import (
    ExpenseIn, ExpensePatch,
    to_usd as _to_usd, build_cat_map as _build_cat_map,
    expense_dict as _expense_dict,
)
from routers.expense_categories import category_router
from routers.expense_stats import stats_router
from routers.expense_budget import budget_router
from routers.expense_recurring import recurring_router
from routers.expense_capture import capture_router

logger = logging.getLogger(__name__)

expense_router  = APIRouter(prefix="/expense",        tags=["expense"])
exchange_router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])
expense_router.include_router(category_router)
expense_router.include_router(stats_router)
expense_router.include_router(budget_router)
expense_router.include_router(recurring_router)
expense_router.include_router(capture_router)


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

    _rate_cache["data"] = None
    _rate_cache["ts"]   = 0.0

    logger.info("[RATE] 환율 갱신 완료 — 성공: %s / 실패: %s", updated, failed)
    return {"updated": updated, "failed": failed}
