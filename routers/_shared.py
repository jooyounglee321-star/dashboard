"""라우터 공통 유틸 — expense.py / income.py 양쪽에서 사용."""

from sqlalchemy.orm import Session

from models import ExchangeRate, ExpenseCategory


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
