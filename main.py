import logging
from contextlib import asynccontextmanager
from datetime import date as dt_date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pathlib import Path

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
    Expense,
    Diet,
    Memo,
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
from routers import bookmarks, diets, expenses, memos, stocks, timezone, youtube
from routers import portfolio as portfolio_router
from routers import admin as admin_router

logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def _daily_snapshot_job():
    """매일 23:59:00 KST 실행 — 당일 scheduler 플레이스홀더(user_id=NULL)가 없으면 저장."""
    today = dt_date.today()
    db = SessionLocal()
    try:
        # user_id IS NULL 인 scheduler 전용 플레이스홀더만 확인
        existing = db.query(DailyPortfolioSnapshot).filter(
            DailyPortfolioSnapshot.snapshot_date == today,
            DailyPortfolioSnapshot.user_id == None,  # noqa: E711
        ).first()
        if existing:
            logger.info("[SCHEDULER] %s 스냅샷 이미 존재 (saved_by=%s)", today, existing.saved_by)
            return
        # 프런트엔드 스냅샷 미수신 → 빈 플레이스홀더 저장 (user_id=NULL)
        row = DailyPortfolioSnapshot(
            snapshot_date=today,
            saved_by="scheduler",
            user_id=None,
        )
        db.add(row)
        db.commit()
        logger.info("[SCHEDULER] %s 플레이스홀더 스냅샷 저장 (프런트 미수신)", today)
    except Exception as e:
        logger.error("[SCHEDULER] 스냅샷 저장 오류: %s", e)
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
                    f"ALTER TABLE {snap} ADD CONSTRAINT uq_user_snapshot_date "
                    f"UNIQUE (user_id, snapshot_date)"
                ))
                conn.commit()
                logger.info("[MIGRATE] uq_user_snapshot_date 제약 추가")
            except Exception as e:
                logger.warning("[MIGRATE] uq_user_snapshot_date 추가 실패: %s", e)


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
    _migrate_user_roles()
    _seed_admin_email()
    _seed_default_permissions()
    logger.info("[DB] 테이블 생성/확인 완료")

    # APScheduler: 매일 23:59:00 KST
    _scheduler.add_job(
        _daily_snapshot_job,
        CronTrigger(hour=23, minute=59, second=0),
        id="daily_portfolio_snapshot",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[SCHEDULER] APScheduler 시작 — 매일 23:59 KST 스냅샷 예약")

    yield

    _scheduler.shutdown(wait=False)
    logger.info("[SCHEDULER] APScheduler 종료")


app = FastAPI(title="Dashboard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(diets.router, prefix="/api")
app.include_router(memos.router, prefix="/api")
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
