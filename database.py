import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

# .env 파일 로드 (로컬 개발용 — Railway에서는 환경변수가 자동 주입됨)
# load_dotenv()는 이미 설정된 환경변수를 덮어쓰지 않으므로 Railway 값이 우선됨
load_dotenv()

# ── Railway PostgreSQL 환경변수 탐색 (우선순위 순) ────────────────────────────
# Railway는 서비스 연결 방식에 따라 아래 변수명 중 하나를 자동 주입함:
#   DATABASE_URL          — 가장 일반적 (Railway 기본)
#   DATABASE_PRIVATE_URL  — Railway 내부 네트워크 전용 URL (2024+ 신규 프로젝트)
#   POSTGRES_URL          — 일부 플러그인/템플릿
#   POSTGRESQL_URL        — 대체 명칭
#   DATABASE_PUBLIC_URL   — 외부 접근용 퍼블릭 URL (마지막 수단)
_CANDIDATE_VARS = [
    "DATABASE_URL",
    "DATABASE_PRIVATE_URL",
    "POSTGRES_URL",
    "POSTGRESQL_URL",
    "DATABASE_PUBLIC_URL",
]

DATABASE_URL: str | None = None
_found_var: str | None = None

for _var in _CANDIDATE_VARS:
    _val = os.environ.get(_var, "").strip()
    if _val and not _val.startswith("sqlite"):
        DATABASE_URL = _val
        _found_var = _var
        break

if not DATABASE_URL:
    # 로컬 SQLite 폴백 (개발 환경)
    DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dashboard.db")
    _found_var = "fallback_sqlite"

# ── postgres:// → postgresql+psycopg2:// 변환 (SQLAlchemy 호환) ───────────────
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# 로그에 비밀번호 마스킹 처리
def _mask_url(url: str) -> str:
    """비밀번호 부분을 ***로 마스킹해 로그에 출력."""
    try:
        if "@" in url:
            scheme_creds, rest = url.split("@", 1)
            if ":" in scheme_creds.split("//")[-1]:
                scheme, creds = scheme_creds.split("//", 1)
                user = creds.split(":")[0]
                return f"{scheme}//{user}:***@{rest}"
    except Exception:
        pass
    return url[:30] + "..."

logger.info(
    "[DB] 환경변수 탐색 완료 — 변수: %s / URL: %s",
    _found_var,
    _mask_url(DATABASE_URL),
)

# ── SQLAlchemy 엔진 생성 ─────────────────────────────────────────────────────
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # SQLite 전용 옵션
    )
    logger.warning("[DB] SQLite 로컬 DB 사용 중 — Railway 환경변수가 설정됐는지 확인하세요.")
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # 유휴 연결 유효성 자동 확인
        pool_recycle=300,     # 5분마다 연결 재생성 (Railway 타임아웃 방지)
        pool_size=5,          # 기본 연결 풀 크기
        max_overflow=10,      # 풀 초과 시 최대 추가 연결 수
    )
    logger.info("[DB] PostgreSQL 엔진 생성 완료")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
