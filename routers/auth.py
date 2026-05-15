import re

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])

# bcrypt 해싱 컨텍스트
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash(password: str) -> str:
    return pwd_context.hash(password)


# ── POST /api/auth/register ───────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="이메일 회원가입",
)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """이메일·비밀번호로 신규 회원을 등록합니다.

    - 이메일 형식 검증
    - 비밀번호 최소 8자 검증
    - 중복 이메일 거부 (409)
    - 비밀번호 bcrypt 해싱 후 저장
    """
    # 이메일 형식 검증
    if not EMAIL_RE.match(body.email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="올바른 이메일 형식이 아닙니다.",
        )

    # 비밀번호 길이 검증
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="비밀번호는 8자 이상이어야 합니다.",
        )

    # 중복 이메일 확인
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다.",
        )

    # 저장
    user = User(
        email=body.email,
        hashed_password=_hash(body.password),
        role="Member",
        provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── GET /api/auth/users ───────────────────────────────────────────────────────

@router.get(
    "/users",
    response_model=list[UserOut],
    summary="회원 목록 조회 (관리자용)",
)
def list_users(db: Session = Depends(get_db)):
    """가입된 전체 회원 목록을 반환합니다."""
    return db.query(User).order_by(User.created_at.desc()).all()
