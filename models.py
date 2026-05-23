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


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Diet(Base):
    __tablename__ = "diets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str | None] = mapped_column(String(50))
    content: Mapped[str | None] = mapped_column(Text)
    calories: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


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
    saved_by: Mapped[str] = mapped_column(String(20), default="frontend")  # 'frontend' | 'scheduler'
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
