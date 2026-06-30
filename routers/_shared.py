from __future__ import annotations
"""라우터 공통 유틸 — expense.py / income.py / admin.py 등 공유."""

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


def monthly_aggregate(db: Session, model, user_id: int, year: int) -> list:
    """연도별 전체 항목 조회 — 월별·연간 집계 공통 기반."""
    from sqlalchemy import extract
    return (
        db.query(model)
        .filter(model.user_id == user_id, extract("year", model.date) == year)
        .all()
    )


def resolve_yf_ticker(ticker: str, category: str | None) -> str:
    """카테고리에 따라 Yahoo Finance 조회용 티커를 반환합니다.

    - kor-etf / kor-stock: 접미사 없으면 .KS 자동 추가
    - 그 외: 입력된 티커 그대로 사용
    """
    if category in ("kor-stock", "kor-etf") and "." not in ticker:
        return ticker + ".KS"
    return ticker
