from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Stock
from schemas import StockCategory, StockCreate, StockOut, StockUpdate

router = APIRouter(prefix="/stocks", tags=["stocks"])

CATEGORIES = [
    {"key": StockCategory.ROBINHOOD, "label": "Robinhood"},
    {"key": StockCategory.US,        "label": "US"},
    {"key": StockCategory.KOR_STOCK, "label": "KOR Stock"},
    {"key": StockCategory.KOR_ETF,   "label": "KOR ETF"},
]


@router.get("/summary")
def get_stock_summary(db: Session = Depends(get_db)):
    """카테고리별 합계 및 전체 합계 반환"""
    stocks = db.query(Stock).all()
    categories = {}
    grand_total = 0.0

    for cat in CATEGORIES:
        key = cat["key"].value
        cat_stocks = [s for s in stocks if s.category == key]
        cat_total = sum(
            (s.quantity or 0) * float(s.avg_price or 0) for s in cat_stocks
        )
        categories[key] = {
            "label": cat["label"],
            "count": len(cat_stocks),
            "total": round(cat_total, 2),
        }
        grand_total += cat_total

    return {"categories": categories, "grand_total": round(grand_total, 2)}


@router.get("", response_model=list[StockOut])
def get_stocks(category: StockCategory | None = None, db: Session = Depends(get_db)):
    q = db.query(Stock)
    if category:
        q = q.filter(Stock.category == category.value)
    return q.order_by(Stock.category.asc(), Stock.ticker.asc()).all()


@router.post("", response_model=StockOut, status_code=201)
def create_stock(body: StockCreate, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["category"] = data["category"].value
    row = Stock(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{stock_id}", response_model=StockOut)
def update_stock(stock_id: int, body: StockUpdate, db: Session = Depends(get_db)):
    row = db.get(Stock, stock_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stock not found")
    data = body.model_dump(exclude_unset=True)
    if "category" in data and data["category"] is not None:
        data["category"] = data["category"].value
    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{stock_id}", status_code=204)
def delete_stock(stock_id: int, db: Session = Depends(get_db)):
    row = db.get(Stock, stock_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stock not found")
    db.delete(row)
    db.commit()
