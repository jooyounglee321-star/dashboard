import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import Base, DATABASE_URL, engine
from routers import bookmarks, diets, expenses, memos, stocks, timezone, youtube

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_type = "PostgreSQL" if not DATABASE_URL.startswith("sqlite") else "SQLite"
    logger.info("[DB] %s 연결: %s", db_type, DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    logger.info("[DB] 테이블 생성/확인 완료")
    yield


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


@app.get("/admin", include_in_schema=False)
def admin_page():
    return FileResponse("static/admin.html")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
