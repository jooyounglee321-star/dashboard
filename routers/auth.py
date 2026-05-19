import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import AuthOut, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# JWT 설정
SECRET_KEY = os.getenv("SECRET_KEY", "dashboard-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


def _hash(password: str) -> str:
    return pwd_context.hash(password)


def _verify(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(user_id: int, email: str) -> str:
    """30일 유효 JWT 생성."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── POST /api/auth/register ───────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=AuthOut,
    status_code=status.HTTP_201_CREATED,
    summary="이메일 회원가입",
)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """이메일·비밀번호로 신규 회원을 등록하고 JWT 토큰을 반환합니다."""
    if not EMAIL_RE.match(body.email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="올바른 이메일 형식이 아닙니다.",
        )
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="비밀번호는 8자 이상이어야 합니다.",
        )
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다.",
        )

    user = User(
        email=body.email,
        hashed_password=_hash(body.password),
        role="Member",
        provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _create_token(user.id, user.email)
    return AuthOut(access_token=token, user=UserOut.model_validate(user))


# ── POST /api/auth/login ──────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=AuthOut,
    summary="이메일 로그인",
)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """이메일·비밀번호로 로그인하고 JWT 토큰을 반환합니다."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or user.provider != "local" or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
    if not _verify(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    # 로그인 통계 업데이트
    user.last_login_at = datetime.now(timezone.utc)
    user.login_count = (user.login_count or 0) + 1
    db.commit()
    db.refresh(user)

    token = _create_token(user.id, user.email)
    return AuthOut(access_token=token, user=UserOut.model_validate(user))


# ── GET /api/auth/users ───────────────────────────────────────────────────────

@router.get(
    "/users",
    response_model=list[UserOut],
    summary="회원 목록 조회 (관리자용)",
)
def list_users(db: Session = Depends(get_db)):
    """가입된 전체 회원 목록을 반환합니다."""
    return db.query(User).order_by(User.created_at.desc()).all()
