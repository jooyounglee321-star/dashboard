import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import inspect, text, tuple_

from database import Base, DATABASE_URL, engine, SessionLocal

# ── 모든 모델을 명시적으로 import ─────────────────────────────────────────────
# Base.metadata.create_all()이 테이블을 생성하려면 모델 클래스가 메모리에
# 올라와 있어야 한다. 하나라도 누락되면 해당 테이블이 DB에 만들어지지 않음.
from models import (  # noqa: F401  (import side-effect 목적)
    User,
    ExpenseCategory,
    Expense,
    ExpenseBudget,
    ExchangeRate,
    RecurringExpense,
    Diet,
    DietAnalysis,
    Memo,
    PinnedMemo,
    Todo,
    Stock,
    StockPriceHistory,
    Bookmark,
    YoutubeChannel,
    TimezoneConfig,
    PortfolioGroups,
    DailyPortfolioSnapshot,
    RolePermission,
)

from routers import auth as auth_router
from routers import bookmarks, diets, expenses, memos, pinned_memos, stocks, timezone, todos, youtube
from routers import portfolio as portfolio_router
from routers import admin as admin_router
from routers.expense import expense_router, exchange_router, do_refresh_rates
from routers.income import income_router

logger = logging.getLogger(__name__)

# ── DEBUG 모드 설정 ───────────────────────────────────────────────────────────
DEBUG_MODE = os.environ.get("DEBUG_MODE", "false").lower() == "true"
if DEBUG_MODE:
    logger.warning("[DEBUG] DEBUG_MODE=true — 요청/응답 로깅 활성화")

_SENSITIVE_KEYS = {"password", "token", "access_token", "secret", "authorization"}


def _mask_body(body: dict) -> dict:
    """민감 필드를 마스킹한 dict 반환."""
    return {
        k: "***" if k.lower() in _SENSITIVE_KEYS else v
        for k, v in body.items()
    }


_scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def _refresh_rates_job():
    """30분마다 Yahoo Finance에서 환율 자동 갱신."""
    db = SessionLocal()
    try:
        do_refresh_rates(db)
    except Exception as e:
        logger.error("[SCHEDULER] 환율 갱신 오류: %s", e)
    finally:
        db.close()


def _migrate_user_columns():
    """users 테이블에 없는 신규 컬럼을 안전하게 추가."""
    new_cols = [
        ("name",            "VARCHAR(100)"),
        ("plan",            "VARCHAR(20) DEFAULT 'free'"),
        ("plan_expires_at", "DATE"),
        ("status",          "VARCHAR(20) DEFAULT 'active'"),
        ("last_login_at",   "TIMESTAMP"),
        ("login_count",     "INTEGER DEFAULT 0"),
        ("auto_login_count", "INTEGER DEFAULT 0"),
        ("total_payment",   "NUMERIC(12,2) DEFAULT 0"),
        ("primary_device",  "VARCHAR(20)"),
        ("admin_memo",      "TEXT"),
        ("widget_config",   "TEXT"),
        ("birth_year",      "INTEGER"),
        ("gender",          "VARCHAR(10)"),
        ("height_cm",       "FLOAT"),
        ("weight_kg",       "FLOAT"),
    ]
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("users")}
        except Exception:
            return
        for col_name, col_def in new_cols:
            if col_name not in existing:
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    logger.info("[MIGRATE] users.%s 컬럼 추가", col_name)
                except Exception as e:
                    logger.warning("[MIGRATE] %s 컬럼 추가 실패: %s", col_name, e)


def _migrate_add_user_id():
    """user_id 컬럼이 없는 데이터 테이블에 추가하고 기존 데이터를 user_id=1(admin)로 설정.

    - expenses / diets / memos / stocks / bookmarks / youtube_channels /
      timezone_config / portfolio_groups : NOT NULL DEFAULT 1
    - daily_portfolio_snapshot : NULL 허용 (scheduler 플레이스홀더용)
    기존 unique 제약 uq_snapshot_date 를 uq_user_snapshot_date 로 교체.
    """
    tables_not_null = [
        "expenses", "diets", "memos", "stocks",
        "bookmarks", "youtube_channels", "timezone_config", "portfolio_groups",
    ]
    with engine.connect() as conn:
        try:
            insp = inspect(conn)
            existing_tables = set(insp.get_table_names())
        except Exception:
            return

        # ── NOT NULL DEFAULT 1 테이블 ──────────────────────────────────────
        for table in tables_not_null:
            if table not in existing_tables:
                continue
            try:
                existing_cols = {c["name"] for c in insp.get_columns(table)}
            except Exception:
                continue
            if "user_id" not in existing_cols:
                try:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"
                    ))
                    conn.commit()
                    logger.info("[MIGRATE] %s.user_id 컬럼 추가 (DEFAULT 1)", table)
                except Exception as e:
                    logger.warning("[MIGRATE] %s.user_id 추가 실패: %s", table, e)

        # ── daily_portfolio_snapshot (nullable) ───────────────────────────
        snap = "daily_portfolio_snapshot"
        if snap in existing_tables:
            try:
                snap_cols = {c["name"] for c in insp.get_columns(snap)}
            except Exception:
                snap_cols = set()
            if "user_id" not in snap_cols:
                try:
                    conn.execute(text(
                        f"ALTER TABLE {snap} ADD COLUMN user_id INTEGER"
                    ))
                    conn.commit()
                    logger.info("[MIGRATE] %s.user_id 컬럼 추가 (nullable)", snap)
                    # 기존 rows → user_id=1 (admin 소유로 마이그레이션)
                    conn.execute(text(
                        f"UPDATE {snap} SET user_id = 1 WHERE user_id IS NULL"
                    ))
                    conn.commit()
                    logger.info("[MIGRATE] %s 기존 rows user_id=1 설정", snap)
                except Exception as e:
                    logger.warning("[MIGRATE] %s.user_id 추가 실패: %s", snap, e)

            # 기존 unique 제약 uq_snapshot_date 제거 후 uq_user_snapshot_date 추가
            try:
                conn.execute(text(
                    f"ALTER TABLE {snap} DROP CONSTRAINT IF EXISTS uq_snapshot_date"
                ))
                conn.commit()
                logger.info("[MIGRATE] uq_snapshot_date 제약 삭제")
            except Exception as e:
                logger.warning("[MIGRATE] uq_snapshot_date 삭제 실패: %s", e)
            try:
                conn.execute(text(
                    f"ALTER TABLE {snap} ADD CONSTRAINT IF NOT EXISTS uq_user_snapshot_date "
                    f"UNIQUE (user_id, snapshot_date)"
                ))
                conn.commit()
                logger.info("[MIGRATE] uq_user_snapshot_date 제약 추가 (이미 있으면 무시)")
            except Exception as e:
                logger.warning("[MIGRATE] uq_user_snapshot_date 추가 실패: %s", e)
                try:
                    conn.rollback()
                except Exception:
                    pass


def _migrate_add_realized_pl():
    """daily_portfolio_snapshot 테이블에 realized_pl 컬럼 추가 (없을 경우에만)."""
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("daily_portfolio_snapshot")}
        except Exception:
            return
        if "realized_pl" not in existing:
            try:
                conn.execute(text(
                    "ALTER TABLE daily_portfolio_snapshot ADD COLUMN realized_pl FLOAT"
                ))
                conn.commit()
                logger.info("[MIGRATE] daily_portfolio_snapshot.realized_pl 컬럼 추가")
            except Exception as e:
                logger.warning("[MIGRATE] realized_pl 컬럼 추가 실패: %s", e)
        else:
            logger.info("[MIGRATE] daily_portfolio_snapshot.realized_pl — 이미 존재, 건너뜀")


def _migrate_cleanup_null_snapshot_dates():
    """daily_portfolio_snapshot에서 snapshot_date IS NULL인 행 삭제.
    NULL 행이 있으면 ORDER BY snapshot_date DESC 쿼리가 NULL을 FIRST로 반환해
    백필 시작일 계산이 TypeError로 크래시되는 버그 방지.
    """
    with engine.connect() as conn:
        try:
            result = conn.execute(
                text("DELETE FROM daily_portfolio_snapshot WHERE snapshot_date IS NULL")
            )
            conn.commit()
            if result.rowcount:
                logger.info("[MIGRATE] snapshot_date IS NULL 행 %d건 삭제", result.rowcount)
        except Exception as e:
            logger.warning("[MIGRATE] NULL snapshot_date 정리 실패: %s", e)


_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")


def _migrate_user_roles():
    """users.role 컬럼의 레거시 'Member' 값을 'free'로 일괄 변환."""
    db = SessionLocal()
    try:
        updated = db.query(User).filter(User.role == "Member").update({"role": "free"})
        if updated:
            db.commit()
            logger.info("[MIGRATE] users.role 'Member' → 'free' %d건 변환", updated)
    except Exception as e:
        logger.warning("[MIGRATE] role 변환 실패: %s", e)
    finally:
        db.close()


def _seed_admin_email():
    """지정된 이메일 계정이 존재하면 role을 'admin'으로 설정."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == _ADMIN_EMAIL).first()
        if user and user.role != "admin":
            user.role = "admin"
            db.commit()
            logger.info("[SEED] %s → role=admin 설정 완료", _ADMIN_EMAIL)
    except Exception as e:
        logger.warning("[SEED] admin 설정 실패: %s", e)
    finally:
        db.close()


_ALL_PERMS = [
    "superadmin_access", "manage_users", "manage_permissions",
    "dashboard_full", "dashboard_basic", "dashboard_view_only", "own_settings",
]
_DEFAULT_ALLOWED: dict[str, list[str]] = {
    "admin":   _ALL_PERMS,
    "premium": ["dashboard_full", "dashboard_basic", "dashboard_view_only", "own_settings"],
    "free":    ["dashboard_basic", "dashboard_view_only", "own_settings"],
    "guest":   ["dashboard_view_only"],
}


def _migrate_create_diet_analyses():
    """diet_analyses 테이블이 없으면 생성 (CREATE TABLE IF NOT EXISTS).

    Base.metadata.create_all()이 이미 처리하지만, 기존 DB에서 모델 임포트
    타이밍 문제 방어용으로 명시적 DDL 도 추가한다.
    """
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS diet_analyses (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    date DATE NOT NULL,
                    nutrition_analysis TEXT,
                    recommendations TEXT,
                    warnings TEXT,
                    raw_meals TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_diet_analysis_user_date UNIQUE (user_id, date)
                )
            """))
            conn.commit()
            logger.info("[MIGRATE] diet_analyses 테이블 확인/생성 완료")
        except Exception as e:
            logger.warning("[MIGRATE] diet_analyses 생성 실패(이미 존재할 수 있음): %s", e)


def _migrate_expense_columns():
    """expenses 테이블에 가계부 Phase 1 신규 컬럼 추가 (이미 존재하는 컬럼은 건너뜀)."""
    new_cols = [
        ("category_id",      "INTEGER"),
        ("subcategory_id",   "INTEGER"),
        ("currency",         "VARCHAR(10) DEFAULT 'USD'"),
        ("converted_amount", "NUMERIC(14,2)"),
        ("exchange_rate",    "NUMERIC(14,6)"),
    ]
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("expenses")}
        except Exception:
            return
        for col_name, col_def in new_cols:
            if col_name not in existing:
                try:
                    conn.execute(text(f"ALTER TABLE expenses ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    logger.info("[MIGRATE] expenses.%s 컬럼 추가", col_name)
                except Exception as e:
                    logger.warning("[MIGRATE] expenses.%s 컬럼 추가 실패: %s", col_name, e)


def _migrate_expense_type_column():
    """expenses 테이블에 type 컬럼 추가 — Phase 2 수입/지출 구분.

    'expense' | 'income' 값을 가지며, 기존 레코드는 모두 'expense'로 초기화.
    SQLite / PostgreSQL 모두 지원.
    """
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("expenses")}
        except Exception:
            return
        if "type" not in existing:
            try:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN type VARCHAR(10) DEFAULT 'expense'"))
                conn.commit()
                logger.info("[MIGRATE] expenses.type 컬럼 추가 완료 (Phase 2 수입/지출 구분)")
            except Exception as e:
                logger.warning("[MIGRATE] expenses.type 컬럼 추가 실패: %s", e)
        else:
            logger.info("[MIGRATE] expenses.type 컬럼 — 이미 존재, 건너뜀")


_DEFAULT_EXCHANGE_RATES = [
    ("USD", "KRW", 1350),
    ("USD", "EUR", 0.92),
    ("USD", "JPY", 149),
    ("USD", "GBP", 0.79),
    ("USD", "CAD", 1.36),
    ("USD", "AUD", 1.53),
    ("USD", "CNY", 7.24),
    ("USD", "HKD", 7.82),
    ("USD", "SGD", 1.34),
    ("USD", "CHF", 0.89),
]


def _seed_exchange_rates():
    """exchange_rates 테이블에 기본 환율 시드 (존재하지 않는 쌍만 삽입)."""
    db = SessionLocal()
    try:
        pairs = [(b, t) for b, t, _ in _DEFAULT_EXCHANGE_RATES]
        existing = {
            (r.base_currency, r.target_currency)
            for r in db.query(ExchangeRate.base_currency, ExchangeRate.target_currency)
            .filter(
                tuple_(ExchangeRate.base_currency, ExchangeRate.target_currency).in_(pairs)
            ).all()
        }
        inserted = 0
        for base, target, rate in _DEFAULT_EXCHANGE_RATES:
            if (base, target) not in existing:
                db.add(ExchangeRate(base_currency=base, target_currency=target, rate=rate))
                inserted += 1
        if inserted:
            db.commit()
            logger.info("[SEED] 기본 환율 시드 완료 (%d건)", inserted)
        else:
            logger.info("[SEED] 환율 시드 — 이미 모두 존재, 건너뜀")
    except Exception as e:
        logger.warning("[SEED] 환율 시드 실패: %s", e)
    finally:
        db.close()


_DEFAULT_CATEGORIES = [
    {
        'name_en': 'Utilities',      'name_ko': '공과금',  'icon': '🏠', 'order_num': 1,
        'subs': [
            {'name_en': 'Electricity',  'name_ko': '전기',   'icon': '⚡', 'order_num': 1},
            {'name_en': 'Water',        'name_ko': '수도',   'icon': '💧', 'order_num': 2},
            {'name_en': 'Gas',          'name_ko': '가스',   'icon': '🔥', 'order_num': 3},
            {'name_en': 'Internet',     'name_ko': '인터넷', 'icon': '🌐', 'order_num': 4},
            {'name_en': 'Phone',        'name_ko': '전화',   'icon': '📱', 'order_num': 5},
            {'name_en': 'Streaming',    'name_ko': '구독',   'icon': '📺', 'order_num': 6},
            {'name_en': 'Other',        'name_ko': '기타',   'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Food',           'name_ko': '식비',    'icon': '🍽️', 'order_num': 2,
        'subs': [
            {'name_en': 'Grocery',      'name_ko': '장보기', 'icon': '🛒', 'order_num': 1},
            {'name_en': 'Restaurant',   'name_ko': '외식',   'icon': '🍜', 'order_num': 2},
            {'name_en': 'Coffee',       'name_ko': '카페',   'icon': '☕', 'order_num': 3},
            {'name_en': 'Delivery',     'name_ko': '배달',   'icon': '🛵', 'order_num': 4},
            {'name_en': 'Other',        'name_ko': '기타',   'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Housing',        'name_ko': '주거',    'icon': '🏡', 'order_num': 3,
        'subs': [
            {'name_en': 'Rent',         'name_ko': '임대료',   'icon': '🔑', 'order_num': 1},
            {'name_en': 'Maintenance',  'name_ko': '유지보수', 'icon': '🔧', 'order_num': 2},
            {'name_en': 'Furniture',    'name_ko': '가구',     'icon': '🛋️', 'order_num': 3},
            {'name_en': 'Supplies',     'name_ko': '생활용품', 'icon': '🧹', 'order_num': 4},
            {'name_en': 'Other',        'name_ko': '기타',     'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Transportation', 'name_ko': '교통',    'icon': '🚗', 'order_num': 4,
        'subs': [
            {'name_en': 'Gas',           'name_ko': '주유',     'icon': '⛽', 'order_num': 1},
            {'name_en': 'Insurance',     'name_ko': '보험',     'icon': '🛡️', 'order_num': 2},
            {'name_en': 'Parking',       'name_ko': '주차',     'icon': '🅿️', 'order_num': 3},
            {'name_en': 'Public Transit','name_ko': '대중교통', 'icon': '🚌', 'order_num': 4},
            {'name_en': 'Maintenance',   'name_ko': '차량정비', 'icon': '🔧', 'order_num': 5},
            {'name_en': 'Other',         'name_ko': '기타',     'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Health',         'name_ko': '의료',    'icon': '🏥', 'order_num': 5,
        'subs': [
            {'name_en': 'Doctor',       'name_ko': '진료', 'icon': '👨‍⚕️', 'order_num': 1},
            {'name_en': 'Dentist',      'name_ko': '치과', 'icon': '🦷',   'order_num': 2},
            {'name_en': 'Pharmacy',     'name_ko': '약국', 'icon': '💊',   'order_num': 3},
            {'name_en': 'Gym',          'name_ko': '헬스', 'icon': '💪',   'order_num': 4},
            {'name_en': 'Vision',       'name_ko': '안과', 'icon': '👁️',  'order_num': 5},
            {'name_en': 'Other',        'name_ko': '기타', 'icon': '📌',   'order_num': 99},
        ],
    },
    {
        'name_en': 'Education',      'name_ko': '교육',    'icon': '📚', 'order_num': 6,
        'subs': [
            {'name_en': 'Tuition',       'name_ko': '학비',       'icon': '🎓', 'order_num': 1},
            {'name_en': 'Books',         'name_ko': '교재',       'icon': '📖', 'order_num': 2},
            {'name_en': 'Supplies',      'name_ko': '학용품',     'icon': '✏️', 'order_num': 3},
            {'name_en': 'Online Course', 'name_ko': '온라인강의', 'icon': '💻', 'order_num': 4},
            {'name_en': 'Other',         'name_ko': '기타',       'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Activities',     'name_ko': '활동',    'icon': '🎯', 'order_num': 7,
        'subs': [
            {'name_en': 'Sports',        'name_ko': '운동',   'icon': '⚽', 'order_num': 1},
            {'name_en': 'Entertainment', 'name_ko': '엔터',   'icon': '🎬', 'order_num': 2},
            {'name_en': 'Hobbies',       'name_ko': '취미',   'icon': '🎨', 'order_num': 3},
            {'name_en': 'Music',         'name_ko': '음악',   'icon': '🎵', 'order_num': 4},
            {'name_en': 'Other',         'name_ko': '기타',   'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Travel',         'name_ko': '여행',    'icon': '✈️', 'order_num': 8,
        'subs': [
            {'name_en': 'Flight',       'name_ko': '항공', 'icon': '🛫', 'order_num': 1},
            {'name_en': 'Hotel',        'name_ko': '숙박', 'icon': '🏨', 'order_num': 2},
            {'name_en': 'Food',         'name_ko': '식비', 'icon': '🍽️', 'order_num': 3},
            {'name_en': 'Activities',   'name_ko': '활동', 'icon': '🎡', 'order_num': 4},
            {'name_en': 'Transport',    'name_ko': '교통', 'icon': '🚕', 'order_num': 5},
            {'name_en': 'Other',        'name_ko': '기타', 'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Shopping',       'name_ko': '쇼핑',    'icon': '🛍️', 'order_num': 9,
        'subs': [
            {'name_en': 'Clothes',      'name_ko': '의류',     'icon': '👕', 'order_num': 1},
            {'name_en': 'Electronics',  'name_ko': '전자기기', 'icon': '📱', 'order_num': 2},
            {'name_en': 'Gifts',        'name_ko': '선물',     'icon': '🎁', 'order_num': 3},
            {'name_en': 'Accessories',  'name_ko': '악세서리', 'icon': '💍', 'order_num': 4},
            {'name_en': 'Other',        'name_ko': '기타',     'icon': '📌', 'order_num': 99},
        ],
    },
    {
        'name_en': 'Other',          'name_ko': '기타',    'icon': '📦', 'order_num': 10,
        'subs': [
            {'name_en': 'Miscellaneous','name_ko': '기타', 'icon': '📌', 'order_num': 1},
            {'name_en': 'Donation',     'name_ko': '기부', 'icon': '🤝', 'order_num': 2},
            {'name_en': 'Savings',      'name_ko': '저축', 'icon': '💰', 'order_num': 3},
        ],
    },
]


def _seed_expense_categories():
    """expense_categories 테이블에 기본 카테고리 시드.

    user_id=NULL, is_default=True 로 저장.
    이미 기본 카테고리가 존재하면 전체 스킵 (중복 방지).
    """
    db = SessionLocal()
    try:
        already = db.query(ExpenseCategory).filter(
            ExpenseCategory.user_id == None,   # noqa: E711
            ExpenseCategory.is_default == True,  # noqa: E712
        ).count()
        if already > 0:
            logger.info("[SEED] 기본 카테고리 — 이미 존재(%d개), 건너뜀", already)
            return

        total_subs = 0
        for cat in _DEFAULT_CATEGORIES:
            parent = ExpenseCategory(
                user_id=None,
                parent_id=None,
                name_en=cat['name_en'],
                name_ko=cat['name_ko'],
                icon=cat['icon'],
                order_num=cat['order_num'],
                is_default=True,
                is_active=True,
            )
            db.add(parent)
            db.flush()  # parent.id 확보

            for sub in cat.get('subs', []):
                db.add(ExpenseCategory(
                    user_id=None,
                    parent_id=parent.id,
                    name_en=sub['name_en'],
                    name_ko=sub['name_ko'],
                    icon=sub['icon'],
                    order_num=sub['order_num'],
                    is_default=True,
                    is_active=True,
                ))
                total_subs += 1

        db.commit()
        logger.info(
            "[SEED] 기본 카테고리 시드 완료 — 대분류 %d개, 소분류 %d개",
            len(_DEFAULT_CATEGORIES), total_subs,
        )
    except Exception as e:
        logger.warning("[SEED] 카테고리 시드 실패: %s", e)
        db.rollback()
    finally:
        db.close()


def _migrate_add_other_subcategory():
    """각 기본 대분류 카테고리에 'Other/기타' 소분류가 없으면 추가.

    _seed_expense_categories()는 기존 카테고리가 있으면 전체 스킵하므로,
    이미 배포된 DB에 신규 소분류를 추가하려면 별도 마이그레이션이 필요.
    """
    db = SessionLocal()
    try:
        parents = db.query(ExpenseCategory).filter(
            ExpenseCategory.parent_id == None,   # noqa: E711
            ExpenseCategory.is_default == True,  # noqa: E712
            ExpenseCategory.is_active == True,   # noqa: E712
        ).all()

        added = 0
        for parent in parents:
            # '기타(Other)' 대분류 자체는 소분류 추가 대상에서 제외
            if parent.name_en == 'Other':
                continue
            exists = db.query(ExpenseCategory).filter(
                ExpenseCategory.parent_id == parent.id,
                ExpenseCategory.name_en == 'Other',
                ExpenseCategory.is_default == True,  # noqa: E712
            ).first()
            if not exists:
                db.add(ExpenseCategory(
                    user_id=None,
                    parent_id=parent.id,
                    name_en='Other',
                    name_ko='기타',
                    icon='📌',
                    order_num=99,
                    is_default=True,
                    is_active=True,
                ))
                added += 1

        if added:
            db.commit()
            logger.info("[MIGRATE] 각 카테고리에 '기타(Other)' 소분류 추가 완료 (%d개)", added)
        else:
            logger.info("[MIGRATE] '기타' 소분류 — 이미 모두 존재, 건너뜀")
    except Exception as e:
        logger.warning("[MIGRATE] '기타' 소분류 추가 실패: %s", e)
        db.rollback()
    finally:
        db.close()


def _migrate_add_category_icon():
    """expense_categories 테이블에 icon 컬럼이 없으면 추가.

    create_all()은 기존 테이블을 변경하지 않으므로, 구버전 DB에는
    icon 컬럼이 누락될 수 있음. 이 마이그레이션으로 안전하게 추가.
    """
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("expense_categories")}
        except Exception:
            return
        if "icon" not in existing:
            try:
                conn.execute(text("ALTER TABLE expense_categories ADD COLUMN icon VARCHAR(100)"))
                conn.commit()
                logger.info("[MIGRATE] expense_categories.icon 컬럼 추가 완료")
            except Exception as e:
                logger.warning("[MIGRATE] expense_categories.icon 추가 실패: %s", e)
        else:
            logger.info("[MIGRATE] expense_categories.icon — 이미 존재, 건너뜀")


def _migrate_add_category_code_fields():
    """expense_categories 테이블에 code, category_type 컬럼 추가 — 수입 카테고리 코드 지원."""
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("expense_categories")}
        except Exception:
            return
        for col_name, col_def in [
            ("code",          "VARCHAR(30)"),
            ("category_type", "VARCHAR(10) DEFAULT 'expense'"),
        ]:
            if col_name not in existing:
                try:
                    conn.execute(text(f"ALTER TABLE expense_categories ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    logger.info("[MIGRATE] expense_categories.%s 컬럼 추가", col_name)
                except Exception as e:
                    logger.warning("[MIGRATE] expense_categories.%s 컬럼 추가 실패: %s", col_name, e)
            else:
                logger.info("[MIGRATE] expense_categories.%s — 이미 존재, 건너뜀", col_name)


def _migrate_todos_start_date():
    """todos 테이블에 start_date 컬럼 추가 (nullable DATE)."""
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("todos")}
        except Exception:
            return
        if "start_date" not in existing:
            try:
                conn.execute(text("ALTER TABLE todos ADD COLUMN start_date DATE"))
                conn.commit()
                logger.info("[MIGRATE] todos.start_date 컬럼 추가")
            except Exception as e:
                logger.warning("[MIGRATE] todos.start_date 컬럼 추가 실패: %s", e)
        else:
            logger.info("[MIGRATE] todos.start_date — 이미 존재, 건너뜀")


def _migrate_todos_todo_type():
    """todos 테이블에 todo_type 컬럼 추가 (VARCHAR, 기본값 'repeat')."""
    with engine.connect() as conn:
        try:
            existing = {c["name"] for c in inspect(conn).get_columns("todos")}
        except Exception:
            return
        if "todo_type" not in existing:
            try:
                conn.execute(text("ALTER TABLE todos ADD COLUMN todo_type VARCHAR(20) NOT NULL DEFAULT 'repeat'"))
                conn.commit()
                logger.info("[MIGRATE] todos.todo_type 컬럼 추가")
            except Exception as e:
                logger.warning("[MIGRATE] todos.todo_type 컬럼 추가 실패: %s", e)
        else:
            logger.info("[MIGRATE] todos.todo_type — 이미 존재, 건너뜀")


def _migrate_snapshot_data_to_group_id():
    """daily_portfolio_snapshot.data를 배열 형식 → group_id 키 dict 형식으로 변환.

    구형: [{"name": "KOR Stock", "currency": "KRW", "total": 123, "stocks": [...]}]
    신형: {"groups": {"abc123": {"total": 123, "currency": "KRW"}},
           "group_names": {"abc123": "KOR Stock"}}

    portfolio_groups.data의 그룹 id를 키로 사용. 이름 매칭(대소문자 무시) → currency 매칭 순으로 시도.
    매칭 실패 시 그룹명을 임시 키로 사용(차트에서는 표시되지 않지만 데이터 보존).
    """
    import json as _json
    db = SessionLocal()
    try:
        try:
            rows = db.execute(
                text("SELECT DISTINCT user_id FROM daily_portfolio_snapshot WHERE data IS NOT NULL AND user_id IS NOT NULL")
            ).fetchall()
        except Exception as e:
            logger.warning("[MIGRATE_SNAPSHOT] 사용자 조회 실패: %s", e)
            return

        total_migrated = 0
        for (user_id,) in rows:
            # 사용자 그룹 로드 → 이름/currency 기반 id 매핑
            name_to_id: dict[str, tuple[str, str]] = {}   # lower(name) → (id, name)
            currency_to_id: dict[str, tuple[str, str]] = {}  # currency → (id, name) 첫 번째만
            try:
                pg = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == user_id).first()
                if pg and pg.data:
                    for g in _json.loads(pg.data):
                        gid = g.get("id", "")
                        gname = g.get("name", "")
                        gcur = g.get("currency", "USD")
                        if gid and gname:
                            name_to_id[gname.lower()] = (gid, gname)
                        if gid and gcur and gcur not in currency_to_id:
                            currency_to_id[gcur] = (gid, gname)
            except Exception:
                pass

            snapshots = db.query(DailyPortfolioSnapshot).filter(
                DailyPortfolioSnapshot.user_id == user_id,
                DailyPortfolioSnapshot.data.isnot(None),
            ).all()

            migrated = 0
            for snap in snapshots:
                try:
                    parsed = _json.loads(snap.data)
                    if isinstance(parsed, dict) and "groups" in parsed:
                        continue  # 이미 변환됨
                    if not isinstance(parsed, list):
                        continue

                    new_groups: dict = {}
                    new_group_names: dict = {}
                    for g in parsed:
                        gname = g.get("name", "")
                        gcur = g.get("currency", "USD")
                        gtotal = g.get("total", 0)

                        match = name_to_id.get(gname.lower()) or currency_to_id.get(gcur)
                        if not match:
                            logger.warning("[MIGRATE_SNAPSHOT] user=%d 그룹명 매칭 실패: %s - 원본 유지", user_id, gname)
                            continue
                        gid, actual_name = match

                        new_groups[gid] = {"total": gtotal, "currency": gcur}
                        new_group_names[gid] = actual_name

                    snap.data = _json.dumps({"groups": new_groups, "group_names": new_group_names}, ensure_ascii=False)
                    migrated += 1
                except Exception as e:
                    logger.warning("[MIGRATE_SNAPSHOT] user=%d snap=%s 실패: %s", user_id, snap.snapshot_date, e)

            if migrated:
                db.commit()
                total_migrated += migrated
                logger.info("[MIGRATE_SNAPSHOT] user=%d %d개 스냅샷 변환 완료", user_id, migrated)

        if total_migrated:
            logger.info("[MIGRATE_SNAPSHOT] 전체 %d개 스냅샷 변환 완료", total_migrated)
        else:
            logger.info("[MIGRATE_SNAPSHOT] 변환 대상 없음 (이미 최신 형식)")
    finally:
        db.close()


_DEFAULT_INCOME_CATEGORIES = [
    {
        'code': 'REGULAR', 'name_en': 'Regular Income', 'name_ko': '주수입 (정기)',
        'icon': '💰', 'order_num': 1,
        'subs': [
            {'code': 'SALARY',   'name_en': 'Base Salary / Paycheck',   'name_ko': '급여 / 월급',     'icon': '🏦', 'order_num': 1},
            {'code': 'BONUS',    'name_en': 'Bonus / Incentives',       'name_ko': '상여금 / 성과급', 'icon': '🎁', 'order_num': 2},
            {'code': 'SIDE_JOB', 'name_en': 'Side Hustle / Freelance',  'name_ko': '부업 / 외주 수익','icon': '💼', 'order_num': 3},
        ],
    },
    {
        'code': 'IRREGULAR', 'name_en': 'Irregular Income', 'name_ko': '부수입 (비정기)',
        'icon': '📦', 'order_num': 2,
        'subs': [
            {'code': 'SUBSIDY',   'name_en': 'Government Subsidy / Tax Refund', 'name_ko': '정부 보조금 / 환급금', 'icon': '🏛️', 'order_num': 1},
            {'code': 'GIFT',      'name_en': 'Pocket Money / Gift Cash',        'name_ko': '용돈 / 축의금',        'icon': '🎀', 'order_num': 2},
            {'code': 'USED_SALES','name_en': 'Used Items Sales',                'name_ko': '중고 판매 수익',       'icon': '♻️', 'order_num': 3},
            {'code': 'OTHER_INC', 'name_en': 'Other Miscellaneous Income',      'name_ko': '기타 부수입',          'icon': '📌', 'order_num': 4},
        ],
    },
    {
        'code': 'INVESTMENT', 'name_en': 'Investment Income', 'name_ko': '금융 / 투자',
        'icon': '📈', 'order_num': 3,
        'subs': [
            {'code': 'INTEREST',    'name_en': 'Interest Income',          'name_ko': '이자 수익',        'icon': '🏧', 'order_num': 1},
            {'code': 'DIVIDEND',    'name_en': 'Dividend / Distribution',  'name_ko': '배당금',           'icon': '💹', 'order_num': 2},
            {'code': 'CAPITAL_GAIN','name_en': 'Investment Capital Gains', 'name_ko': '투자 실현 익절',   'icon': '📊', 'order_num': 3},
            {'code': 'RENTAL_INC',  'name_en': 'Rental Income',            'name_ko': '부동산 임대료',    'icon': '🏠', 'order_num': 4},
        ],
    },
    {
        'code': 'TRANSFER', 'name_en': 'Asset Transfer', 'name_ko': '자산 이동',
        'icon': '🔄', 'order_num': 4,
        'subs': [
            {'code': 'INSURANCE', 'name_en': 'Insurance Payout',       'name_ko': '보험금 수령',            'icon': '🛡️', 'order_num': 1},
            {'code': 'LOAN',      'name_en': 'Borrowed Money / Loan',  'name_ko': '빌린 돈 / 대출금',       'icon': '🏦', 'order_num': 2},
            {'code': 'REFUND',    'name_en': 'Card Refund',            'name_ko': '카드 대금 환급 / 취소',  'icon': '↩️', 'order_num': 3},
        ],
    },
]


def _seed_income_categories():
    """수입 카테고리 시드 — category_type='income', code 포함.

    이미 income 카테고리가 존재하면 스킵.
    """
    db = SessionLocal()
    try:
        already = db.query(ExpenseCategory).filter(
            ExpenseCategory.category_type == "income",
            ExpenseCategory.is_default == True,   # noqa: E712
        ).count()
        if already > 0:
            logger.info("[SEED] 수입 카테고리 — 이미 존재(%d개), 건너뜀", already)
            return

        total_subs = 0
        for cat in _DEFAULT_INCOME_CATEGORIES:
            parent = ExpenseCategory(
                user_id=None,
                parent_id=None,
                code=cat['code'],
                category_type="income",
                name_en=cat['name_en'],
                name_ko=cat['name_ko'],
                icon=cat['icon'],
                order_num=cat['order_num'],
                is_default=True,
                is_active=True,
            )
            db.add(parent)
            db.flush()
            for sub in cat.get('subs', []):
                db.add(ExpenseCategory(
                    user_id=None,
                    parent_id=parent.id,
                    code=sub['code'],
                    category_type="income",
                    name_en=sub['name_en'],
                    name_ko=sub['name_ko'],
                    icon=sub['icon'],
                    order_num=sub['order_num'],
                    is_default=True,
                    is_active=True,
                ))
                total_subs += 1
        db.commit()
        logger.info("[SEED] 수입 카테고리 시드 완료 — 대분류 4개, 소분류 %d개", total_subs)
    except Exception as e:
        logger.warning("[SEED] 수입 카테고리 시드 실패: %s", e)
        db.rollback()
    finally:
        db.close()


def _migrate_recurring_expenses_table():
    """recurring_expenses 테이블이 없으면 생성."""
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS recurring_expenses (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    day_of_month INTEGER NOT NULL,
                    category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
                    subcategory_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
                    amount NUMERIC(14,2) NOT NULL,
                    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                    memo VARCHAR(500),
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.commit()
            logger.info("[MIGRATE] recurring_expenses 테이블 확인/생성 완료")
        except Exception as e:
            logger.warning("[MIGRATE] recurring_expenses 생성 실패(이미 존재할 수 있음): %s", e)
            try:
                conn.rollback()
            except Exception:
                pass


def _migrate_recurring_type_column():
    """recurring_expenses에 type 컬럼 추가 (없는 경우)."""
    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'expense'"
            ))
            conn.commit()
            logger.info("[MIGRATE] recurring_expenses.type 컬럼 확인/추가 완료")
        except Exception as e:
            logger.warning("[MIGRATE] recurring_expenses.type 추가 실패(이미 존재할 수 있음): %s", e)
            try:
                conn.rollback()
            except Exception:
                pass


def _migrate_recurring_frequency_columns():
    """recurring_expenses에 frequency, day_of_week, day_of_month_2 컬럼 추가 (없는 경우)."""
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'",
            "ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS day_of_week INTEGER NULL",
            "ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS day_of_month_2 INTEGER NULL",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                logger.warning("[MIGRATE] recurring_expenses 컬럼 추가 실패(이미 존재할 수 있음): %s", e)
                try:
                    conn.rollback()
                except Exception:
                    pass
    logger.info("[MIGRATE] recurring_expenses frequency/day_of_week/day_of_month_2 확인/추가 완료")


def _seed_default_permissions():
    """permissions 테이블이 비어 있을 때 기본 권한을 시드."""
    db = SessionLocal()
    try:
        if db.query(RolePermission).count() > 0:
            return  # 이미 시드됨
        for role, allowed in _DEFAULT_ALLOWED.items():
            for perm in _ALL_PERMS:
                db.add(RolePermission(
                    role=role,
                    permission_name=perm,
                    is_allowed=(perm in allowed),
                ))
        db.commit()
        logger.info("[SEED] 기본 권한 시드 완료 (%d개)", len(_ALL_PERMS) * len(_DEFAULT_ALLOWED))
    except Exception as e:
        logger.warning("[SEED] 권한 시드 실패: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_type = "PostgreSQL" if not DATABASE_URL.startswith("sqlite") else "SQLite"
    logger.info("[DB] %s 연결: %s", db_type, DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)

    # ── 테이블 자동 생성 ──────────────────────────────────────────────────────
    # Base.metadata는 위에서 import한 모든 모델 클래스를 알고 있음
    expected = set(Base.metadata.tables.keys())
    logger.info("[DB] 생성 예정 테이블 %d개: %s", len(expected), sorted(expected))
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("[DB] create_all 완료 — 테이블 %d개 확인", len(expected))
    except Exception as e:
        logger.error("[DB] create_all 실패: %s", e)
        raise  # DB 없이 서버 기동은 의미 없으므로 재크래시 허용

    _migrate_user_columns()
    _migrate_add_user_id()
    _migrate_create_diet_analyses()
    _migrate_expense_columns()
    _migrate_expense_type_column()
    _migrate_user_roles()
    _migrate_add_category_icon()           # expense_categories.icon 누락 컬럼 추가
    _migrate_add_category_code_fields()
    _migrate_todos_start_date()
    _migrate_todos_todo_type()
    _migrate_snapshot_data_to_group_id()
    _seed_admin_email()
    _seed_default_permissions()
    _seed_exchange_rates()
    _seed_expense_categories()
    _migrate_add_other_subcategory()
    _migrate_add_realized_pl()
    _migrate_cleanup_null_snapshot_dates()
    _seed_income_categories()
    _migrate_recurring_expenses_table()
    _migrate_recurring_type_column()
    _migrate_recurring_frequency_columns()
    logger.info("[DB] 테이블 생성/확인 완료")

    # APScheduler: 30분마다 환율 자동 갱신
    from apscheduler.triggers.interval import IntervalTrigger
    _scheduler.add_job(
        _refresh_rates_job,
        IntervalTrigger(minutes=30),
        id="refresh_exchange_rates",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[SCHEDULER] APScheduler 시작 — 30분마다 환율 갱신")

    yield

    _scheduler.shutdown(wait=False)
    logger.info("[SCHEDULER] APScheduler 종료")


app = FastAPI(title="Dashboard API", version="1.0.0", lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
if not _cors_origins:
    logger.warning(
        "[CORS] CORS_ALLOWED_ORIGINS 환경변수가 설정되지 않았습니다. "
        "모든 출처를 차단합니다. 필요 시 CORS_ALLOWED_ORIGINS=https://yourdomain.com 으로 설정하세요."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if DEBUG_MODE:
    import time as _time
    import json as _json_mod

    @app.middleware("http")
    async def debug_logging_middleware(request: Request, call_next):
        t0 = _time.monotonic()
        # 요청 바디 읽기 (스트림 소비 후 재주입)
        body_bytes = await request.body()
        req_summary = ""
        if body_bytes:
            try:
                parsed = _json_mod.loads(body_bytes)
                if isinstance(parsed, dict):
                    parsed = _mask_body(parsed)
                req_summary = str(parsed)[:200]
            except Exception:
                req_summary = body_bytes[:200].decode("utf-8", errors="replace")

        async def receive():
            return {"type": "http.request", "body": body_bytes}

        request = Request(request.scope, receive)
        response = await call_next(request)
        elapsed = (_time.monotonic() - t0) * 1000
        logger.info(
            "[DEBUG] %s %s → %d | %.0fms | body: %s",
            request.method, request.url.path, response.status_code, elapsed,
            req_summary or "(none)",
        )
        return response

app.include_router(auth_router.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")       # 레거시 /api/expenses
app.include_router(expense_router,   prefix="/api")       # 신규 /api/expense
app.include_router(exchange_router,  prefix="/api")       # 신규 /api/exchange-rates
app.include_router(income_router,    prefix="/api")       # 신규 /api/income
app.include_router(diets.router, prefix="/api")
app.include_router(memos.router, prefix="/api")
app.include_router(pinned_memos.router, prefix="/api")
app.include_router(todos.router, prefix="/api")
app.include_router(stocks.router, prefix="/api")
app.include_router(bookmarks.router, prefix="/api")
app.include_router(youtube.router, prefix="/api")
app.include_router(timezone.router, prefix="/api")
app.include_router(portfolio_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


_DIST   = Path("frontend/dist")
_STATIC = Path("static")          # legacy fallback during development

# ── Vite 빌드 에셋 (/assets/* — JS/CSS 해시 파일) ────────────────────────────
# StaticFiles를 사용하면 올바른 MIME 타입(application/javascript, text/css) +
# ETag + Last-Modified 캐싱 헤더를 Starlette가 자동으로 처리해줍니다.
# 빌드가 아직 없는 환경(로컬 첫 실행)에서는 조용히 건너뜁니다.
_DIST_ASSETS = _DIST / "assets"
if _DIST_ASSETS.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=str(_DIST_ASSETS)),
        name="vite-assets",
    )


@app.get("/superadmin", include_in_schema=False)
async def serve_superadmin():
    """/superadmin — static/superadmin.html을 직접 서빙.
    HTML 내부 JS가 /api/auth/me로 admin role 여부를 확인하고,
    admin이 아니면 / 로 리다이렉트합니다.
    """
    p = _STATIC / "superadmin.html"
    if p.exists():
        return FileResponse(p)
    # 빌드된 SPA가 있으면 React 라우터에 위임
    dist_index = _DIST / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
    return FileResponse(_STATIC / "index.html")


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """SPA catch-all: React 정적 파일 서빙 + React Router 폴백.

    우선순위:
    1. frontend/dist/ 내 실제 파일   (kr_stocks.json 등)
    2. React SPA index.html          (/login, /admin, /register … 모두 React Router 처리)
    3. 레거시 static/ 폴백            (빌드 전 개발 모드용)
    """
    # 1) dist/ 내 실제 파일
    candidate = _DIST / full_path
    if candidate.is_file():
        return FileResponse(candidate)

    # 2) React SPA — index.html 반환 (클라이언트 라우팅)
    dist_index = _DIST / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)

    # 3) 레거시: npm build 전 개발 단계에서 static/ 사용
    legacy = _STATIC / (full_path or "index.html")
    if legacy.is_file():
        return FileResponse(legacy)
    legacy_index = _STATIC / "index.html"
    if legacy_index.exists():
        return FileResponse(legacy_index)

    return FileResponse(_STATIC / "login.html")
