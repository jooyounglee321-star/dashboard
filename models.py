from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    """SaaS 회원 테이블.

    - provider: 'local' | 'google' | 'facebook' 등 가입 경로
    - provider_id: 소셜 로그인 시 외부 서비스의 고유 ID (local 가입은 NULL)
    - hashed_password: local 가입 시에만 사용 (소셜 가입은 NULL)
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="Member")
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="local")
    provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # 슈퍼어드민 확장 컬럼
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    plan_expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_payment: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    primary_device: Mapped[str | None] = mapped_column(String(20), nullable=True)
    admin_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    widget_config: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    # 식단 분석용 신체정보
    birth_year: Mapped[int | None]   = mapped_column(Integer, nullable=True)
    gender:     Mapped[str | None]   = mapped_column(String(10), nullable=True)   # 'male'|'female'|'other'
    height_cm:  Mapped[float | None] = mapped_column(Float, nullable=True)        # 항상 cm 저장
    weight_kg:  Mapped[float | None] = mapped_column(Float, nullable=True)        # 항상 kg 저장


class ExpenseCategory(Base):
    """가계부 카테고리 (대분류 / 소분류).

    - parent_id = NULL  → 대분류
    - parent_id = 상위ID → 소분류
    - user_id   = NULL  → 시스템 기본 카테고리 (모든 사용자 공유)
    - user_id   = INT   → 사용자 커스텀 카테고리
    """
    __tablename__ = "expense_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)       # 이모지 또는 아이콘 코드
    code: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)  # 'REGULAR','SALARY' 등
    category_type: Mapped[str] = mapped_column(String(10), nullable=False, default="expense")  # 'expense'|'income'
    order_num: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))       # 레거시 텍스트 카테고리
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # ── 가계부 Phase 1 신규 컬럼 ────────────────────────────────────────────
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    subcategory_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    converted_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)  # USD 환산액
    exchange_rate: Mapped[float | None] = mapped_column(Numeric(14, 6), nullable=True)     # 적용 환율
    # ── 가계부 Phase 2 — 수입/지출 구분 ─────────────────────────────────────
    type: Mapped[str] = mapped_column(String(10), nullable=False, default="expense")       # 'expense' | 'income'


class ExpenseBudget(Base):
    """사용자별 카테고리별 예산 설정.

    - category_id = NULL  → 전체 예산 (카테고리 미분류)
    - month       = NULL  → 연간 예산
    - month       = 1~12  → 월별 예산
    """
    __tablename__ = "expense_budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)         # NULL = 연간, 1~12 = 월별
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ExchangeRate(Base):
    """통화 환율 테이블. base_currency → target_currency 환율.

    기본 시드: USD 기준 9개 통화 (서버 시작 시 존재하지 않는 쌍만 삽입).
    """
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("base_currency", "target_currency", name="uq_exchange_rate_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    base_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD", index=True)
    target_currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    rate: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Diet(Base):
    __tablename__ = "diets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str | None] = mapped_column(String(50))
    content: Mapped[str | None] = mapped_column(Text)
    calories: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DietAnalysis(Base):
    """날짜별 AI 식단 분석 결과. (user_id, date) 당 1건 UPSERT."""
    __tablename__ = "diet_analyses"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_diet_analysis_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    nutrition_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON 배열 문자열
    warnings: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_meals: Mapped[str | None] = mapped_column(Text, nullable=True)         # 분석 당시 식단 스냅샷 JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Memo(Base):
    __tablename__ = "memos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Stock(Base):
    """보유 종목. 카테고리당 최대 10개."""
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200))
    quantity: Mapped[float | None] = mapped_column(Float)
    avg_price: Mapped[float | None] = mapped_column(Numeric(14, 4))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    price_history: Mapped[list["StockPriceHistory"]] = relationship(
        back_populates="stock", cascade="all, delete-orphan", order_by="StockPriceHistory.snapshot_date.desc()"
    )


class StockPriceHistory(Base):
    """일별 시세 스냅샷. 나중에 /api/stocks/snapshot 으로 저장 가능."""
    __tablename__ = "stock_price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    stock_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    current_price: Mapped[float | None] = mapped_column(Numeric(14, 4))
    prev_close: Mapped[float | None] = mapped_column(Numeric(14, 4))
    change_amount: Mapped[float | None] = mapped_column(Numeric(14, 4))
    change_percent: Mapped[float | None] = mapped_column(Numeric(8, 4))
    volume: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    stock: Mapped["Stock"] = relationship(back_populates="price_history")


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class YoutubeChannel(Base):
    __tablename__ = "youtube_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_name: Mapped[str] = mapped_column(String(200), nullable=False)
    channel_url: Mapped[str | None] = mapped_column(String(2000))
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TimezoneConfig(Base):
    """사용자별 시간대 설정 테이블. user_id 당 1행."""
    __tablename__ = "timezone_config"
    __table_args__ = (UniqueConstraint("user_id", name="uq_timezone_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="UTC")  # JSON 배열로 3개 시간대 저장
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class PortfolioGroups(Base):
    """사용자별 포트폴리오 그룹 데이터 (localStorage 미러 — user_id 당 1행 UPSERT).

    data 컬럼에 stock_groups_v2 JSON 전체를 저장한다.
    """
    __tablename__ = "portfolio_groups"
    __table_args__ = (UniqueConstraint("user_id", name="uq_portfolio_groups_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    data: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON array
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class RolePermission(Base):
    """레벨(role)별 권한 매핑 테이블.

    role: admin | premium | free | guest
    permission_name: superadmin_access | manage_users | manage_permissions |
                     dashboard_full | dashboard_basic | dashboard_view_only | own_settings
    """
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("role", "permission_name", name="uq_role_permission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    permission_name: Mapped[str] = mapped_column(String(50), nullable=False)
    is_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DailyPortfolioSnapshot(Base):
    """매일 23:59:59 포트폴리오 스냅샷. (user_id, 날짜) 당 1건 UPSERT.
    user_id=NULL 은 scheduler 자동 생성 플레이스홀더.
    """
    __tablename__ = "daily_portfolio_snapshot"
    __table_args__ = (UniqueConstraint("user_id", "snapshot_date", name="uq_user_snapshot_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    usd_krw: Mapped[float | None] = mapped_column(Float)          # 환율
    total_usd: Mapped[float | None] = mapped_column(Float)        # USD 그룹 합계
    total_krw: Mapped[float | None] = mapped_column(Float)        # KRW 그룹 합계
    total_krw_equiv: Mapped[float | None] = mapped_column(Float)  # 원화환산 전체 합계
    data: Mapped[str | None] = mapped_column(Text)                # JSON — 그룹/종목 상세
    realized_pl: Mapped[float | None] = mapped_column(Float, nullable=True)  # 실현 손익 합계
    saved_by: Mapped[str] = mapped_column(String(20), default="frontend")  # 'frontend' | 'scheduler'
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
