import asyncio
import datetime as dt
import logging
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import feedparser
import requests
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from database import get_db
from models import Stock, User
from routers.auth import get_current_user
from routers._shared import resolve_yf_ticker as _resolve_yf_ticker
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




def _query_yf(yf_ticker: str) -> tuple[float | None, float | None, object]:
    """yfinance에서 현재가·전일종가·fast_info를 반환합니다."""
    t  = yf.Ticker(yf_ticker)
    fi = t.fast_info
    current = fi.last_price
    prev    = fi.previous_close

    # fast_info 실패 시 history 기반 폴백
    if current is None or prev is None:
        hist = t.history(period="5d")
        if len(hist) >= 2:
            current = current if current is not None else float(hist["Close"].iloc[-1])
            prev    = prev    if prev    is not None else float(hist["Close"].iloc[-2])
        elif len(hist) == 1:
            current = current if current is not None else float(hist["Close"].iloc[-1])
            prev    = prev    if prev    is not None else current

    return current, prev, fi


def _fetch_price(ticker: str, category: str | None = None) -> dict:
    """Yahoo Finance에서 현재가·전날 종가·등락 정보를 가져옵니다."""
    yf_ticker = _resolve_yf_ticker(ticker, category)
    cache_key = yf_ticker

    cached, ts = _price_cache.get(cache_key, (None, 0))
    if cached and (time.time() - ts) < _CACHE_TTL:
        logger.info("[STOCK CACHE] %s (cached)", cache_key)
        return cached

    logger.info("[STOCK FETCH] ticker=%s → yf=%s (category=%s)", ticker, yf_ticker, category)
    current, prev, fi = _query_yf(yf_ticker)

    # kor-stock .KS 실패 시 .KQ (코스닥) 재시도
    if current is None and category == "kor-stock" and yf_ticker.endswith(".KS"):
        yf_ticker_kq = ticker + ".KQ"
        logger.info("[STOCK RETRY] .KS 실패 → .KQ 재시도: %s", yf_ticker_kq)
        current2, prev2, fi2 = _query_yf(yf_ticker_kq)
        if current2 is not None:
            current, prev, fi = current2, prev2, fi2
            cache_key = yf_ticker_kq

    if current is None:
        logger.warning("[STOCK FAIL] '%s' 시세 조회 실패 (yf=%s)", ticker, yf_ticker)
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
    logger.info(
        "[STOCK OK] %s → %s %.4f (%+.2f%%)",
        yf_ticker, result["currency"], result["current_price"], result["change_percent"]
    )
    _price_cache[cache_key] = (result, time.time())
    return result


# ── GET /api/stocks/summary ─────────────────────────────────────────────────
@router.get("/summary")
def get_stock_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카테고리별 평균단가 기준 평가금액 합계 (실시간 가격 미적용)."""
    stocks = db.query(Stock).filter(Stock.user_id == current_user.id).all()
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
async def get_stock_price(ticker: str, category: str | None = None, _: User = Depends(get_current_user)):
    """Yahoo Finance 실시간 시세 (60초 캐시).
    category 파라미터로 kor-stock / kor-etf 전달 시 .KS/.KQ 접미사를 자동 처리합니다."""
    try:
        loop   = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _executor, _fetch_price, ticker.upper(), category
        )
        return result
    except Exception:
        raise HTTPException(status_code=404, detail="시세를 가져올 수 없습니다. 티커를 확인해 주세요.")


# ── GET /api/stocks/exchange-rate ───────────────────────────────────────────
@router.get("/exchange-rate")
async def get_exchange_rate(_: User = Depends(get_current_user)):
    """USD/KRW 환율 (Yahoo Finance KRW=X, 60초 캐시). 1 USD = X KRW."""
    try:
        loop   = asyncio.get_running_loop()
        result = await loop.run_in_executor(_executor, _fetch_price, "KRW=X", None)
        return {
            "ticker":         "KRW=X",
            "usd_krw":        result["current_price"],
            "change_percent": result["change_percent"],
        }
    except Exception:
        raise HTTPException(status_code=503, detail="환율 정보를 가져올 수 없습니다.")


# ── GET /api/stocks ─────────────────────────────────────────────────────────
@router.get("", response_model=list[StockOut])
def get_stocks(
    category: StockCategory | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Stock).filter(Stock.user_id == current_user.id)
    if category:
        q = q.filter(Stock.category == category.value)
    return q.order_by(Stock.category.asc(), Stock.ticker.asc()).all()


# ── POST /api/stocks ─────────────────────────────────────────────────────────
@router.post("", response_model=StockOut, status_code=201)
def create_stock(
    body: StockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(Stock).filter(
        Stock.user_id == current_user.id,
        Stock.category == body.category.value,
    ).count()
    if count >= MAX_PER_CATEGORY:
        raise HTTPException(
            status_code=400,
            detail=f"카테고리당 최대 {MAX_PER_CATEGORY}개까지 등록할 수 있습니다.",
        )
    data = body.model_dump()
    data["category"] = data["category"].value
    data["user_id"] = current_user.id
    row = Stock(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── PUT /api/stocks/{id} ─────────────────────────────────────────────────────
@router.put("/{stock_id}", response_model=StockOut)
def update_stock(
    stock_id: int,
    body: StockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Stock, stock_id)
    if not row or row.user_id != current_user.id:
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
def delete_stock(
    stock_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Stock, stock_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Stock not found")
    db.delete(row)
    db.commit()


# ── GET /api/stocks/search?q=... ─────────────────────────────────────────────
_SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


@router.get("/search")
def search_stocks(q: str = Query(..., min_length=1), _: User = Depends(get_current_user)):
    """Yahoo Finance 종목 검색 (티커 또는 회사명으로 조회).
    Returns: [{ticker, name, exchange, type}]
    """
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": q, "quotesCount": 8, "newsCount": 0, "enableFuzzyQuery": False}
        resp = requests.get(url, params=params, headers=_SEARCH_HEADERS, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        quotes = data.get("quotes", [])
        results = []
        for item in quotes:
            ticker = item.get("symbol", "")
            name = item.get("longname") or item.get("shortname") or ""
            exchange = item.get("exchange", "")
            q_type = item.get("quoteType", "")
            if ticker and name:
                results.append({
                    "ticker": ticker,
                    "name": name,
                    "exchange": exchange,
                    "type": q_type,
                })
        return {"results": results}
    except Exception as e:
        logger.warning("[STOCK SEARCH] 검색 실패: q=%s, err=%s", q, e)
        raise HTTPException(status_code=503, detail=f"검색 서비스 오류: {e}")


# ── GET /api/stocks/history/{ticker}?date=YYYY-MM-DD ─────────────────────────
@router.get("/history/{ticker}")
async def get_stock_history(
    ticker: str,
    date: str = Query(..., description="YYYY-MM-DD 형식"),
    category: str | None = None,
    _: User = Depends(get_current_user),
):
    """특정 날짜의 종가 조회 (매입 내역 자동완성용).
    주말·공휴일이면 이후 첫 거래일 종가를 반환합니다."""
    try:
        date_obj = dt.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).")

    end_date = (date_obj + dt.timedelta(days=7)).isoformat()

    def _fetch_hist():
        yf_ticker = _resolve_yf_ticker(ticker, category)
        t = yf.Ticker(yf_ticker)
        hist = t.history(start=date, end=end_date)
        # kor-stock .KS 실패 시 .KQ 재시도
        if hist.empty and category == "kor-stock" and yf_ticker.endswith(".KS"):
            t2 = yf.Ticker(ticker + ".KQ")
            hist = t2.history(start=date, end=end_date)
        return hist

    try:
        loop = asyncio.get_running_loop()
        hist = await loop.run_in_executor(_executor, _fetch_hist)
        if hist.empty:
            raise HTTPException(
                status_code=404,
                detail=f"'{ticker}' {date} 이후 거래 데이터를 찾을 수 없습니다.",
            )
        close = round(float(hist["Close"].iloc[0]), 4)
        actual_date = hist.index[0].strftime("%Y-%m-%d")
        logger.info("[STOCK HISTORY] %s %s → %.4f (실제: %s)", ticker, date, close, actual_date)
        return {"ticker": ticker, "requested_date": date, "date": actual_date, "close": close}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[STOCK HISTORY] 조회 실패: ticker=%s, date=%s, err=%s", ticker, date, e)
        raise HTTPException(status_code=503, detail="히스토리 데이터를 가져올 수 없습니다.")


def _fetch_google_rss(query: str, lang: str, count: int = 5) -> list[dict]:
    if lang == "ko":
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=ko&gl=KR&ceid=KR:ko"
    else:
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en&gl=US&ceid=US:en"
    feed = feedparser.parse(url)
    results = []
    for e in feed.entries[:count]:
        pub = ""
        if hasattr(e, "published_parsed") and e.published_parsed:
            pub = dt.date(*e.published_parsed[:3]).isoformat()
        results.append({"title": e.get("title", ""), "url": e.get("link", ""), "published": pub, "source": "Google News"})
    return results


@router.get("/news")
async def get_stock_news(
    query: str = Query(..., description="검색어"),
    source: str = Query("google", description="google 또는 naver"),
    lang: str = Query("ko", description="ko 또는 en"),
    count: int = Query(5, ge=1, le=10, description="반환할 뉴스 수"),
    _: User = Depends(get_current_user),
):
    """종목 관련 최신 뉴스를 반환합니다 (Google RSS, 최대 10건)."""
    def _fetch():
        effective_lang = "ko" if source == "naver" else lang
        return _fetch_google_rss(query, effective_lang, count)

    try:
        loop = asyncio.get_running_loop()
        items = await loop.run_in_executor(_executor, _fetch)
        if not items:
            raise HTTPException(status_code=404, detail="뉴스를 찾을 수 없습니다")
        return items
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[STOCK NEWS] 조회 실패: query=%s, err=%s", query, e)
        raise HTTPException(status_code=503, detail="뉴스를 가져올 수 없습니다.")
