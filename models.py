from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Diet(Base):
    __tablename__ = "diets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str | None] = mapped_column(String(50))
    content: Mapped[str | None] = mapped_column(Text)
    calories: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Memo(Base):
    __tablename__ = "memos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Stock(Base):
    """보유 종목. 카테고리당 최대 10개."""
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
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
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class YoutubeChannel(Base):
    __tablename__ = "youtube_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_name: Mapped[str] = mapped_column(String(200), nullable=False)
    channel_url: Mapped[str | None] = mapped_column(String(2000))
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TimezoneConfig(Base):
    __tablename__ = "timezone_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timezone: Mapped[str] = mapped_column(String(100), nullable=False, default="UTC")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
