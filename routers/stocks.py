from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Stock
from schemas import StockCategory, StockCreate, StockOut, StockUpdate

router = APIRouter(prefix="/stocks", tags=["stocks"])


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
