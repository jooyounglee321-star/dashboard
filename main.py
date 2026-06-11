import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

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


_ADMIN_EMAIL = "jooyounglee321123@gmail.com"


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
        inserted = 0
        for base, target, rate in _DEFAULT_EXCHANGE_RATES:
            exists = db.query(ExchangeRate).filter(
                ExchangeRate.base_currency == base,
                ExchangeRate.target_currency == target,
            ).first()
            if not exists:
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
    _seed_admin_email()
    _seed_default_permissions()
    _seed_exchange_rates()
    _seed_expense_categories()
    _migrate_add_other_subcategory()
    _migrate_add_realized_pl()
    _migrate_cleanup_null_snapshot_dates()
    _seed_income_categories()
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

_cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """서버 + DB 상태 확인 (Railway 디버깅 포함)."""
    import os
    from database import DATABASE_URL, _found_var, _mask_url

    # 어떤 환경변수가 잡혔는지 응답에 포함 (비밀번호 마스킹)
    db_var  = _found_var or "none"
    db_url  = _mask_url(DATABASE_URL)
    db_type = "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql"

    # Railway 환경변수 탐색 결과 (설정 여부만 확인, 값은 노출 안 함)
    env_found = {
        v: ("set" if os.environ.get(v) else "not_set")
        for v in ["DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL",
                  "POSTGRESQL_URL", "DATABASE_PUBLIC_URL"]
    }

    try:
        from sqlalchemy import inspect as sa_inspect, text as sa_text
        db = SessionLocal()
        db.execute(sa_text("SELECT 1"))
        # 실제 DB에 존재하는 테이블 목록 조회
        actual_tables = sorted(sa_inspect(engine).get_table_names())
        db.close()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
        actual_tables = []

    # Base.metadata가 알고 있는 모델 테이블 (코드 기준)
    expected_tables = sorted(Base.metadata.tables.keys())

    return {
        "status": "ok",
        "db": db_status,
        "db_type": db_type,
        "db_var_used": db_var,
        "db_url_masked": db_url,
        "env_vars": env_found,
        "tables_expected": expected_tables,   # 코드에 정의된 테이블
        "tables_actual": actual_tables,        # DB에 실제 존재하는 테이블
    }


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
