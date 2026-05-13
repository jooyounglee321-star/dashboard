import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Stock
from schemas import StockCategory, StockCreate, StockOut, StockPrice, StockUpdate

router = APIRouter(prefix="/stocks", tags=["stocks"])

MAX_PER_CATEGORY = 10

CATEGORIES = [
    {"key": StockCategory.ROBINHOOD, "label": "Robinhood"},
    {"key": StockCategory.US,        "label": "US"},
    {"key": StockCategory.KOR_STOCK, "label": "KOR Stock"},
    {"key": StockCategory.KOR_ETF,   "label": "KOR ETF"},
]

# ── 가격 캐시 (60초 TTL) ────────────────────────────────────────────────────
_price_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 60
_executor = ThreadPoolExecutor(max_workers=10)


def _fetch_price(ticker: str) -> dict:
    """Yahoo Finance에서 현재가·전날 종가·등락 정보를 가져옵니다."""
    cached, ts = _price_cache.get(ticker, (None, 0))
    if cached and (time.time() - ts) < _CACHE_TTL:
        return cached

    t = yf.Ticker(ticker)
    fi = t.fast_info

    current = fi.last_price
    prev = fi.previous_close

    # fast_info 실패 시 history 기반 폴백
    if current is None or prev is None:
        hist = t.history(period="5d")
        if len(hist) >= 2:
            current = current if current is not None else float(hist["Close"].iloc[-1])
            prev    = prev    if prev    is not None else float(hist["Close"].iloc[-2])
        elif len(hist) == 1:
            current = current if current is not None else float(hist["Close"].iloc[-1])
            prev    = prev    if prev    is not None else current

    if current is None:
        raise ValueError(f"'{ticker}' 시세를 가져올 수 없습니다. 티커를 확인해 주세요.")

    prev = prev or current
    change_amount  = current - prev
    change_percent = (change_amount / prev * 100) if prev else 0.0

    result = {
        "ticker":         ticker.upper(),
        "current_price":  round(float(current),        4),
        "prev_close":     round(float(prev),            4),
        "change_amount":  round(float(change_amount),   4),
        "change_percent": round(float(change_percent),  4),
        "currency":       getattr(fi, "currency", None) or "USD",
    }
    _price_cache[ticker] = (result, time.time())
    return result


# ── GET /api/stocks/summary ─────────────────────────────────────────────────
@router.get("/summary")
def get_stock_summary(db: Session = Depends(get_db)):
    """카테고리별 평균단가 기준 평가금액 합계 (실시간 가격 미적용)."""
    stocks = db.query(Stock).all()
    categories = {}
    grand_total = 0.0

    for cat in CATEGORIES:
        key = cat["key"].value
        cat_stocks = [s for s in stocks if s.category == key]
        cat_total  = sum((s.quantity or 0) * float(s.avg_price or 0) for s in cat_stocks)
        categories[key] = {
            "label": cat["label"],
            "count": len(cat_stocks),
            "total": round(cat_total, 2),
        }
        grand_total += cat_total

    return {"categories": categories, "grand_total": round(grand_total, 2)}


# ── GET /api/stocks/price/{ticker} ──────────────────────────────────────────
@router.get("/price/{ticker}", response_model=StockPrice)
async def get_stock_price(ticker: str):
    """Yahoo Finance 실시간 시세 (60초 캐시)."""
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(_executor, _fetch_price, ticker.upper())
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── GET /api/stocks ─────────────────────────────────────────────────────────
@router.get("", response_model=list[StockOut])
def get_stocks(category: StockCategory | None = None, db: Session = Depends(get_db)):
    q = db.query(Stock)
    if category:
        q = q.filter(Stock.category == category.value)
    return q.order_by(Stock.category.asc(), Stock.ticker.asc()).all()


# ── POST /api/stocks ─────────────────────────────────────────────────────────
@router.post("", response_model=StockOut, status_code=201)
def create_stock(body: StockCreate, db: Session = Depends(get_db)):
    count = db.query(Stock).filter(Stock.category == body.category.value).count()
    if count >= MAX_PER_CATEGORY:
        raise HTTPException(
            status_code=400,
            detail=f"카테고리당 최대 {MAX_PER_CATEGORY}개까지 등록할 수 있습니다.",
        )
    data = body.model_dump()
    data["category"] = data["category"].value
    row = Stock(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── PUT /api/stocks/{id} ─────────────────────────────────────────────────────
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


# ── DELETE /api/stocks/{id} ──────────────────────────────────────────────────
@router.delete("/{stock_id}", status_code=204)
def delete_stock(stock_id: int, db: Session = Depends(get_db)):
    row = db.get(Stock, stock_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stock not found")
    db.delete(row)
    db.commit()
