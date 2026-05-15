import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# .env 파일 로드 (로컬 개발용 — Railway에서는 환경변수가 자동 주입됨)
load_dotenv()

# Railway DATABASE_URL 환경변수 우선 사용, 없으면 로컬 SQLite 폴백
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dashboard.db")

# Railway는 "postgres://" 형식으로 제공 → SQLAlchemy 호환 형식으로 변환
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# SQLite vs PostgreSQL 엔진 설정 분리
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # SQLite 전용 옵션
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # 유휴 연결 유효성 자동 확인
        pool_recycle=300,     # 5분마다 연결 재생성 (Railway 타임아웃 방지)
        pool_size=5,          # 기본 연결 풀 크기
        max_overflow=10,      # 풀 초과 시 최대 추가 연결 수
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
