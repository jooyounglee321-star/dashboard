from __future__ import annotations
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


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


class DietAnalysisCreate(BaseModel):
    date: date
    nutrition_analysis: str | None = None
    recommendations: str | None = None   # JSON 배열 문자열
    warnings: str | None = None
    raw_meals: str | None = None          # 분석 당시 식단 스냅샷 JSON


class DietAnalysisOut(DietAnalysisCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Memo ─────────────────────────────────────────────────────────────────────

class MemoCreate(BaseModel):
    date: date
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=2000)


class MemoUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=2000)


class MemoOut(MemoCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── PinnedMemo ───────────────────────────────────────────────────────────────

class PinnedMemoCreate(BaseModel):
    title: str | None = None
    content: str | None = None
    color: str = "yellow"


class PinnedMemoUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    color: str | None = None


class PinnedMemoOut(BaseModel):
    id: int
    title: str | None
    content: str | None
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Todo ──────────────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    title: str
    todo_type: str = "repeat"   # 'repeat' | 'once'
    start_date: date | None = None
    due_date: date | None = None


class TodoCheckToggle(BaseModel):
    date: str   # "YYYY-MM-DD"
    checked: bool


class TodoOut(BaseModel):
    id: int
    title: str
    todo_type: str = "repeat"
    start_date: date | None
    due_date: date | None
    is_done_dates: list[str]
    created_at: datetime

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
    id: str | None = None   # portfolio_groups의 그룹 ID
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
    realized_pl: float | None = None  # 실현 손익 합계
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


class UserLogin(BaseModel):
    """로그인 요청 바디."""
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


class AuthOut(BaseModel):
    """로그인/가입 성공 응답 — JWT 토큰 + 회원 정보."""
    access_token: str
    token_type: str = "bearer"
    user: UserOut


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


class RoleUpdate(BaseModel):
    """회원 레벨 변경 요청."""
    role: str  # admin | premium | free | guest


class PermissionUpdateItem(BaseModel):
    role: str
    permission_name: str
    is_allowed: bool


class PermissionBulkUpdate(BaseModel):
    """권한 일괄 수정 요청."""
    permissions: list[PermissionUpdateItem]


# ── Profile (내 계정) ─────────────────────────────────────────────────────────

class ProfileOut(BaseModel):
    """내 프로필 응답 (GET /api/auth/me)."""
    id: int
    email: str
    name: str | None = None
    role: str
    plan: str
    created_at: datetime
    # 식단 분석용 신체정보
    birth_year: int | None = None
    gender:     str | None = None
    height_cm:  float | None = None
    weight_kg:  float | None = None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    """프로필 수정 요청 (PUT /api/auth/me)."""
    name: str | None = None
    current_password: str | None = None   # 비밀번호 변경 시 필수
    new_password: str | None = None
    # 식단 분석용 신체정보
    birth_year: int | None = None
    gender:     str | None = None
    height_cm:  float | None = None
    weight_kg:  float | None = None


# ── Widget Config ─────────────────────────────────────────────────────────────

DEFAULT_WIDGET_CONFIG: dict = {
    "language": "ko",
    "hero":     {"enabled": True, "clock_count": 3, "temp_unit": "C", "temp_unit_manual": False},
    "schedule": {"enabled": True},
    "youtube":  {"enabled": True, "max_count": 10},
    "stock":    {"enabled": True, "currency_display": "KRW"},
    "expense":  {"enabled": True},
    "diet":     {"enabled": True, "meals": {"아침": True, "점심": True, "저녁": True, "간식": True}},
    "memo":         {"enabled": True},
    "news":         {"enabled": True, "default_tab": "kr"},
    "sites":        {"enabled": True},
}


class WidgetConfigUpdate(BaseModel):
    """위젯 설정 저장 요청."""
    config: dict


class WidgetConfigOut(BaseModel):
    """위젯 설정 응답."""
    config: dict


# ── Timezone ──────────────────────────────────────────────────────────────────

class TimezoneUpdate(BaseModel):
    timezone: str


class TimezoneOut(BaseModel):
    id: int
    timezone: str
    updated_at: datetime

    model_config = {"from_attributes": True}
