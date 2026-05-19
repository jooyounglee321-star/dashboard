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


# ── DailyPortfolioSnapshot ───────────────────────────────────────────────────

class SnapshotStockItem(BaseModel):
    ticker: str
    name: str | None = None
    current_price: float | None = None
    hold_qty: float = 0
    eval_amount: float = 0
    avg_buy_price: float | None = None
    eval_pl: float | None = None
    realized_pl: float = 0


class SnapshotGroup(BaseModel):
    name: str
    currency: str
    total: float = 0
    stocks: list[SnapshotStockItem] = []


class PortfolioSnapshotCreate(BaseModel):
    snapshot_date: date
    usd_krw: float | None = None
    total_usd: float = 0
    total_krw: float = 0
    total_krw_equiv: float | None = None
    groups: list[SnapshotGroup] = []


class PortfolioSnapshotOut(BaseModel):
    id: int
    snapshot_date: date
    usd_krw: float | None
    total_usd: float | None
    total_krw: float | None
    total_krw_equiv: float | None
    data: str | None          # raw JSON
    saved_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Auth ─────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    """회원가입 요청 바디."""
    email: str
    password: str


class UserOut(BaseModel):
    """회원 응답 (비밀번호 제외)."""
    id: int
    email: str
    role: str
    provider: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserAdminOut(BaseModel):
    """슈퍼어드민 회원 상세 응답."""
    id: int
    email: str
    name: str | None = None
    role: str
    provider: str
    provider_id: str | None = None
    plan: str = "free"
    plan_expires_at: date | None = None
    status: str = "active"
    created_at: datetime
    last_login_at: datetime | None = None
    login_count: int = 0
    total_payment: float = 0.0
    primary_device: str | None = None
    admin_memo: str | None = None

    model_config = {"from_attributes": True}


class PlanUpdate(BaseModel):
    plan: str
    plan_expires_at: date | None = None


class StatusUpdate(BaseModel):
    status: str


class AdminMemoUpdate(BaseModel):
    admin_memo: str | None = None


# ── Timezone ──────────────────────────────────────────────────────────────────

class TimezoneUpdate(BaseModel):
    timezone: str


class TimezoneOut(BaseModel):
    id: int
    timezone: str
    updated_at: datetime

    model_config = {"from_attributes": True}
