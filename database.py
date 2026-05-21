import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

# .env 파일 로드 (로컬 개발용)
# load_dotenv()는 이미 설정된 환경변수를 절대 덮어쓰지 않으므로
# Railway가 주입한 DATABASE_URL이 항상 최우선으로 사용됨
load_dotenv()

# ── Railway PostgreSQL 환경변수 탐색 (우선순위 순) ───────────────────────────
# Railway 프로젝트 설정 방식에 따라 아래 중 하나로 주입됨.
# Variables 탭에서 PostgreSQL 서비스 변수를 "Reference"로 연결해야 자동 주입됨.
_CANDIDATE_VARS = [
    "DATABASE_URL",           # Railway 기본 — 가장 일반적
    "DATABASE_PRIVATE_URL",   # Railway 내부 네트워크 전용 (2024+ 신규 프로젝트)
    "POSTGRES_URL",           # 일부 Railway 플러그인/템플릿
    "POSTGRESQL_URL",         # 대체 명칭
    "DATABASE_PUBLIC_URL",    # 외부 접근용 퍼블릭 URL
]

_raw_url: str = ""
_found_var: str = "fallback_sqlite"

for _var in _CANDIDATE_VARS:
    _val = os.environ.get(_var, "").strip()
    if _val and not _val.startswith("sqlite"):
        _raw_url = _val
        _found_var = _var
        break

if not _raw_url:
    # Railway에서 PostgreSQL 환경변수를 하나도 찾지 못한 경우 → 로컬 SQLite 폴백
    _raw_url = "sqlite:///./dashboard.db"
    logger.warning(
        "[DB] PostgreSQL 환경변수 없음 → SQLite 폴백. "
        "Railway 배포 시 Variables 탭에서 DATABASE_URL을 PostgreSQL 서비스 Reference로 연결하세요."
    )


# ── postgres:// → postgresql+psycopg2:// 변환 (SQLAlchemy 호환) ─────────────
DATABASE_URL: str = _raw_url

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
# postgresql+psycopg2:// 로 이미 시작하는 경우 그대로 사용


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
    return url[:40] + "..."


logger.info(
    "[DB] 환경변수 탐색 완료 — 사용 변수: %s / URL: %s",
    _found_var,
    _mask_url(DATABASE_URL),
)

# ── SQLAlchemy 엔진 생성 ────────────────────────────────────────────────────
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # Railway 내부 네트워크 주소(*.railway.internal)는 SSL 미사용
    # 외부/퍼블릭 주소는 SSL 필수
    _is_internal = ".railway.internal" in DATABASE_URL
    _ssl_mode = "disable" if _is_internal else "require"
    logger.info("[DB] 연결 유형: %s / sslmode=%s",
                "내부(internal)" if _is_internal else "외부(public)", _ssl_mode)

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,    # 유휴 연결 유효성 자동 확인
        pool_recycle=300,      # 5분마다 연결 재생성 (Railway 타임아웃 방지)
        pool_size=5,
        max_overflow=10,
        connect_args={"sslmode": _ssl_mode},
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
