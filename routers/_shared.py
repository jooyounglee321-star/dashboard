from __future__ import annotations
"""라우터 공통 유틸 — expense.py / income.py / admin.py 등 공유."""

import re
from datetime import date as _Date

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from models import ExchangeRate, ExpenseCategory, User
from .auth import get_current_user


def get_rate(currency: str, db: Session) -> float:
    """DB에서 USD 기준 환율 조회. 없거나 USD면 1.0."""
    if currency == "USD":
        return 1.0
    row = db.query(ExchangeRate).filter_by(
        base_currency="USD", target_currency=currency
    ).first()
    return float(row.rate) if row else 1.0


def cat_name(cat: ExpenseCategory, lang: str) -> str:
    return cat.name_en if lang == "en" else cat.name_ko


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """admin role 검사 — 공통 Depends."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")
    return current_user


def require_premium_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """premium 또는 admin role 검사 — AI 캡처 등 유료 기능 Depends."""
    if current_user.role in ("admin", "premium"):
        return current_user
    raise HTTPException(status_code=403, detail="프리미엄 이상 멤버만 사용 가능합니다.")


def normalize_date_str(raw) -> str | None:
    """날짜 문자열을 YYYY-MM-DD로 정규화. 지원: YYYY-MM-DD, MM/DD/YYYY 등."""
    if not raw:
        return None
    s = str(raw).strip()
    m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
        if m:
            mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            return None
    try:
        return _Date(y, mo, d).isoformat()
    except ValueError:
        return None


def fifo_calc(purchases: list[dict], sells: list[dict]) -> dict:
    """FIFO(선입선출) 원가 계산 — 매도 시 가장 먼저 매수한 주식부터 처분된 것으로 간주.
    증권사(Vanguard 등)의 기본 cost-basis 방식과 동일한 계산.
    프론트엔드 frontend/src/utils/calcStock.js의 fifoCalc()와 로직 동일하게 유지할 것.

    반환: {"hold_qty", "avg_cost", "realized_pl", "sell_details"}
    - avg_cost: 현재 남은 보유분(lot)의 가중평균원가
    - sell_details: 매도 건별 {id, date, qty, sell_price, avg_cost, pl} —
      avg_cost는 그 매도 건이 소진한 lot들만의 가중평균원가 (건별로 다를 수 있음)
    """
    events = [
        {**p, "kind": "buy"} for p in (purchases or [])
    ] + [
        {**s, "kind": "sell"} for s in (sells or [])
    ]

    def _sort_key(ev):
        d = ev.get("date") or ""
        return (d, 0 if ev["kind"] == "buy" else 1)

    events.sort(key=_sort_key)

    lots: list[dict] = []  # FIFO 큐: {"qty", "price"}
    realized_pl = 0.0
    sell_details: list[dict] = []

    for ev in events:
        qty = float(ev.get("qty") or 0)
        if qty <= 0:
            continue
        if ev["kind"] == "buy":
            lots.append({"qty": qty, "price": float(ev.get("price") or 0)})
            continue
        remaining = qty
        sell_price = float(ev.get("price") or 0)
        consumed_cost = 0.0   # 이 매도가 소진한 lot들의 원가 합
        consumed_qty  = 0.0   # 원가가 있는(price>0) lot 중 소진된 수량
        while remaining > 1e-9 and lots:
            lot = lots[0]
            consume = min(lot["qty"], remaining)
            if lot["price"] > 0:
                realized_pl += (sell_price - lot["price"]) * consume
                consumed_cost += lot["price"] * consume
                consumed_qty += consume
            lot["qty"] -= consume
            remaining -= consume
            if lot["qty"] <= 1e-9:
                lots.pop(0)
        sell_avg_cost = (consumed_cost / consumed_qty) if consumed_qty > 0 else 0.0
        sell_pl = (sell_price - sell_avg_cost) * consumed_qty if sell_avg_cost > 0 else 0.0
        sell_details.append({
            "id":         ev.get("id"),
            "date":       ev.get("date"),
            "qty":        qty,
            "sell_price": sell_price,
            "avg_cost":   sell_avg_cost,
            "pl":         sell_pl,
        })

    hold_qty = round(sum(l["qty"] for l in lots), 8)
    priced_lots = [l for l in lots if l["price"] > 0]
    priced_qty = sum(l["qty"] for l in priced_lots)
    avg_cost = (sum(l["qty"] * l["price"] for l in priced_lots) / priced_qty) if priced_qty > 0 else 0.0

    return {"hold_qty": hold_qty, "avg_cost": avg_cost, "realized_pl": realized_pl, "sell_details": sell_details}


def resolve_yf_ticker(ticker: str, category: str | None) -> str:
    """카테고리에 따라 Yahoo Finance 조회용 티커를 반환합니다.

    - kor-etf / kor-stock: 접미사 없으면 .KS 자동 추가
    - 그 외: 입력된 티커 그대로 사용
    """
    if category in ("kor-stock", "kor-etf") and "." not in ticker:
        return ticker + ".KS"
    return ticker
