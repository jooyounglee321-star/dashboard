import logging
from contextlib import asynccontextmanager
from datetime import date as dt_date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import Base, DATABASE_URL, engine, SessionLocal
from models import DailyPortfolioSnapshot
from routers import bookmarks, diets, expenses, memos, stocks, timezone, youtube
from routers import portfolio as portfolio_router

logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def _daily_snapshot_job():
    """매일 23:59:00 KST 실행 — 당일 스냅샷이 없으면 플레이스홀더 저장."""
    today = dt_date.today()
    db = SessionLocal()
    try:
        existing = db.query(DailyPortfolioSnapshot).filter(
            DailyPortfolioSnapshot.snapshot_date == today
        ).first()
        if existing:
            logger.info("[SCHEDULER] %s 스냅샷 이미 존재 (saved_by=%s)", today, existing.saved_by)
            return
        # 프런트엔드 스냅샷 미수신 → 빈 플레이스홀더 저장
        row = DailyPortfolioSnapshot(
            snapshot_date=today,
            saved_by="scheduler",
        )
        db.add(row)
        db.commit()
        logger.info("[SCHEDULER] %s 플레이스홀더 스냅샷 저장 (프런트 미수신)", today)
    except Exception as e:
        logger.error("[SCHEDULER] 스냅샷 저장 오류: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_type = "PostgreSQL" if not DATABASE_URL.startswith("sqlite") else "SQLite"
    logger.info("[DB] %s 연결: %s", db_type, DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
    Base.metadata.create_all(bind=engine)
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

app.include_router(expenses.router, prefix="/api")
app.include_router(diets.router, prefix="/api")
app.include_router(memos.router, prefix="/api")
app.include_router(stocks.router, prefix="/api")
app.include_router(bookmarks.router, prefix="/api")
app.include_router(youtube.router, prefix="/api")
app.include_router(timezone.router, prefix="/api")
app.include_router(portfolio_router.router, prefix="/api")


@app.get("/api/health")
def health_check():
    """서버 + DB 상태 확인."""
    try:
        db = SessionLocal()
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db.close()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
    return {"status": "ok", "db": db_status}


@app.get("/admin", include_in_schema=False)
def admin_page():
    return FileResponse("static/admin.html")


@app.get("/register", include_in_schema=False)
def register_page():
    return FileResponse("static/register.html")


@app.get("/admin_users", include_in_schema=False)
def admin_users_page():
    return FileResponse("static/admin_users.html")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
