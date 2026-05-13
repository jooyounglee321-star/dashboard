from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel


# ── Expense ──────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    date: date
    amount: float
    category: str | None = None
    description: str | None = None


class ExpenseOut(ExpenseCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Diet ─────────────────────────────────────────────────────────────────────

class DietCreate(BaseModel):
    date: date
    meal_type: str | None = None
    content: str | None = None
    calories: int | None = None


class DietOut(DietCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Memo ─────────────────────────────────────────────────────────────────────

class MemoCreate(BaseModel):
    date: date
    title: str | None = None
    content: str | None = None


class MemoUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class MemoOut(MemoCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Stock ─────────────────────────────────────────────────────────────────────

class StockCategory(str, Enum):
    ROBINHOOD = "robinhood"
    US = "us"
    KOR_STOCK = "kor-stock"
    KOR_ETF = "kor-etf"


class StockCreate(BaseModel):
    category: StockCategory
    ticker: str
    name: str | None = None
    quantity: float | None = None
    avg_price: float | None = None


class StockUpdate(BaseModel):
    category: StockCategory | None = None
    ticker: str | None = None
    name: str | None = None
    quantity: float | None = None
    avg_price: float | None = None


class StockOut(StockCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Bookmark ──────────────────────────────────────────────────────────────────

class BookmarkCreate(BaseModel):
    title: str
    url: str
    category: str | None = None
    description: str | None = None


class BookmarkOut(BookmarkCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── YoutubeChannel ────────────────────────────────────────────────────────────

class YoutubeChannelCreate(BaseModel):
    channel_name: str
    channel_url: str | None = None
    category: str | None = None
    description: str | None = None


class YoutubeChannelOut(YoutubeChannelCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── StockPrice (Yahoo Finance 실시간) ─────────────────────────────────────────

class StockPrice(BaseModel):
    ticker: str
    current_price: float
    prev_close: float
    change_amount: float
    change_percent: float
    currency: str


class StockPriceHistoryOut(BaseModel):
    id: int
    stock_id: int
    snapshot_date: date
    current_price: float | None
    prev_close: float | None
    change_amount: float | None
    change_percent: float | None
    volume: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Timezone ──────────────────────────────────────────────────────────────────

class TimezoneUpdate(BaseModel):
    timezone: str


class TimezoneOut(BaseModel):
    id: int
    timezone: str
    updated_at: datetime

    model_config = {"from_attributes": True}
