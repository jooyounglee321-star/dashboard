"""수입(Income) API — 카테고리 조회 + 수입 항목 CRUD.

라우터:
  income_router → prefix /income

Expense 테이블의 type='income' 행을 전담 처리.
필드 순서: type → category_code → subcategory_code → description → currency → amount → date
"""

import logging
from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseCategory, ExchangeRate, User
from routers.auth import get_current_user
from routers._shared import get_rate as _get_rate, cat_name as _cat_name

logger = logging.getLogger(__name__)

income_router = APIRouter(prefix="/income", tags=["income"])

# ── Pydantic 스키마 ──────────────────────────────────────────────────────────

class IncomeIn(BaseModel):
    """수입 생성 요청."""
    category_code:    str | None = None   # 'REGULAR' | 'IRREGULAR' | 'INVESTMENT' | 'TRANSFER'
    subcategory_code: str | None = None   # 'SALARY' | 'BONUS' | ... 등
    description:      str | None = None
    currency:         str        = "USD"
    amount:           float
    date:             Date

class IncomePatch(BaseModel):
    """수입 수정 요청 (부분 업데이트)."""
    category_code:    str | None = None
    subcategory_code: str | None = None
    description:      str | None = None
    currency:         str | None = None
    amount:           float | None = None
    date:             Date | None = None

# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def _resolve_category(code: str | None, db: Session) -> int | None:
    """code → expense_categories.id (income 타입만 검색)."""
    if not code:
        return None
    cat = db.query(ExpenseCategory).filter(
        ExpenseCategory.code == code,
        ExpenseCategory.category_type == "income",
        ExpenseCategory.is_active == True,   # noqa: E712
    ).first()
    return cat.id if cat else None

# ── 카테고리 조회 ─────────────────────────────────────────────────────────────

@income_router.get("/categories")
def list_income_categories(
    lang: str = Query("ko", pattern="^(ko|en)$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """수입 대분류 + 소분류 목록 반환."""
    # 한 번의 쿼리로 전체 로드 후 Python에서 계층 구성 (N+1 방지)
    all_cats = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.category_type == "income",
            ExpenseCategory.is_active == True,    # noqa: E712
        )
        .order_by(ExpenseCategory.order_num)
        .all()
    )
    parents = {c.id: c for c in all_cats if c.parent_id is None}
    subs_map: dict[int, list] = {pid: [] for pid in parents}
    for c in all_cats:
        if c.parent_id is not None and c.parent_id in subs_map:
            subs_map[c.parent_id].append({
                "id":      c.id,
                "code":    c.code,
                "name":    _cat_name(c, lang),
                "name_ko": c.name_ko,
                "name_en": c.name_en,
                "icon":    c.icon,
            })
    return [
        {
            "id":      p.id,
            "code":    p.code,
            "name":    _cat_name(p, lang),
            "name_ko": p.name_ko,
            "name_en": p.name_en,
            "icon":    p.icon,
            "subs":    subs_map.get(p.id, []),
        }
        for p in sorted(parents.values(), key=lambda x: (x.order_num, x.id))
    ]

# ── 수입 CRUD ────────────────────────────────────────────────────────────────

@income_router.get("")
def list_incomes(
    date:  Date | None = None,
    year:  int  | None = None,
    month: int  | None = None,
    lang:  str         = Query("ko", pattern="^(ko|en)$"),
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """수입 목록 (date / year+month / year 필터)."""
    q = db.query(Expense).filter(
        Expense.user_id == current_user.id,
        Expense.type    == "income",
    )
    if date:
        q = q.filter(Expense.date == date)
    elif year and month:
        from sqlalchemy import extract
        q = q.filter(
            extract("year",  Expense.date) == year,
            extract("month", Expense.date) == month,
        )
    elif year:
        from sqlalchemy import extract
        q = q.filter(extract("year", Expense.date) == year)

    rows = q.order_by(Expense.date.desc(), Expense.created_at.desc()).all()

    # 배치 조회: 루프 내 N+1 방지
    cat_ids = {e.category_id for e in rows if e.category_id} | \
              {e.subcategory_id for e in rows if e.subcategory_id}
    cat_map: dict[int, ExpenseCategory] = {}
    if cat_ids:
        cat_map = {
            c.id: c
            for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(cat_ids)).all()
        }

    def _cat_info(cat_id):
        if not cat_id:
            return None, None, None
        c = cat_map.get(cat_id)
        if not c:
            return None, None, None
        return c.id, c.code, _cat_name(c, lang)

    return [
        {
            "id":               e.id,
            "type":             "income",
            "category_id":      e.category_id,
            "category_code":    _cat_info(e.category_id)[1],
            "category_name":    _cat_info(e.category_id)[2],
            "subcategory_id":   e.subcategory_id,
            "subcategory_code": _cat_info(e.subcategory_id)[1],
            "subcategory_name": _cat_info(e.subcategory_id)[2],
            "description":      e.description,
            "currency":         e.currency,
            "amount":           float(e.amount),
            "converted_amount": float(e.converted_amount) if e.converted_amount else None,
            "exchange_rate":    float(e.exchange_rate)    if e.exchange_rate    else None,
            "date":             e.date.isoformat(),
            "created_at":       e.created_at.isoformat(),
        }
        for e in rows
    ]


@income_router.post("", status_code=201)
def create_income(
    body: IncomeIn,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """수입 항목 생성."""
    rate  = _get_rate(body.currency, db)
    usd   = round(body.amount / rate, 2)

    entry = Expense(
        user_id          = current_user.id,
        type             = "income",
        category_id      = _resolve_category(body.category_code,    db),
        subcategory_id   = _resolve_category(body.subcategory_code,  db),
        description      = body.description,
        currency         = body.currency,
        amount           = body.amount,
        converted_amount = usd,
        exchange_rate    = rate,
        date             = body.date,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "message": "created"}


@income_router.get("/summary/monthly")
def income_monthly_summary(
    year:  int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """월별 수입 합계 (USD 환산 기준)."""
    from sqlalchemy import extract, func as sqlfunc
    rows = (
        db.query(
            ExpenseCategory.code.label("category_code"),
            ExpenseCategory.name_ko.label("name_ko"),
            ExpenseCategory.name_en.label("name_en"),
            sqlfunc.sum(Expense.converted_amount).label("total_usd"),
        )
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id, isouter=True)
        .filter(
            Expense.user_id == current_user.id,
            Expense.type    == "income",
            extract("year",  Expense.date) == year,
            extract("month", Expense.date) == month,
        )
        .group_by(ExpenseCategory.id)
        .all()
    )
    total = sum(float(r.total_usd or 0) for r in rows)
    return {
        "year":  year,
        "month": month,
        "total_usd": round(total, 2),
        "by_category": [
            {
                "category_code": r.category_code,
                "name_ko":       r.name_ko,
                "name_en":       r.name_en,
                "total_usd":     round(float(r.total_usd or 0), 2),
            }
            for r in rows
        ],
    }


@income_router.put("/{income_id}")
def update_income(
    income_id: int,
    body: IncomePatch,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """수입 항목 수정 (부분 업데이트)."""
    entry = db.query(Expense).filter(
        Expense.id      == income_id,
        Expense.user_id == current_user.id,
        Expense.type    == "income",
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Income not found")

    if body.category_code    is not None: entry.category_id    = _resolve_category(body.category_code,    db)
    if body.subcategory_code is not None: entry.subcategory_id = _resolve_category(body.subcategory_code, db)
    if body.description      is not None: entry.description    = body.description
    if body.currency         is not None: entry.currency       = body.currency
    if body.amount           is not None: entry.amount         = body.amount
    if body.date             is not None: entry.date           = body.date

    # 금액 또는 통화 변경 시 USD 환산 재계산
    if body.amount is not None or body.currency is not None:
        cur  = entry.currency
        rate = _get_rate(cur, db)
        entry.converted_amount = round(float(entry.amount) / rate, 2)
        entry.exchange_rate    = rate

    db.commit()
    return {"id": entry.id, "message": "updated"}


@income_router.delete("/{income_id}", status_code=204)
def delete_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
):
    """수입 항목 삭제."""
    entry = db.query(Expense).filter(
        Expense.id      == income_id,
        Expense.user_id == current_user.id,
        Expense.type    == "income",
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Income not found")
    db.delete(entry)
    db.commit()
