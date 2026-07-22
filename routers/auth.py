from __future__ import annotations
import json
import logging
import os
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    AuthOut, ProfileOut, ProfileUpdate, UserLogin, UserOut, UserRegister,
    WidgetConfigOut, WidgetConfigUpdate, DEFAULT_WIDGET_CONFIG,
)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_RE   = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")   # 이 이메일로 가입하면 자동 admin
if not ADMIN_EMAIL:
    logger.warning("[AUTH] ADMIN_EMAIL 환경변수가 설정되지 않았습니다. 자동 admin 부여가 비활성화됩니다.")

# Google OAuth 설정
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = "https://dashboard-production-4a18.up.railway.app/api/auth/google/callback"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# JWT 설정
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("[AUTH] SECRET_KEY 환경변수가 설정되지 않았습니다. Railway Variables에서 SECRET_KEY를 반드시 설정하세요.")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


def _hash(password: str) -> str:
    return pwd_context.hash(password)


def _verify(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(user_id: int, email: str, role: str = "free") -> str:
    """30일 유효 JWT 생성."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
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
@limiter.limit("5/minute")
def register(request: Request, body: UserRegister, db: Session = Depends(get_db)):
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
    if not re.search(r'\d', body.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="비밀번호에 숫자를 포함해야 합니다.",
        )
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', body.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="비밀번호에 특수문자를 포함해야 합니다.",
        )
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다.",
        )

    auto_role = "admin" if body.email.lower() == ADMIN_EMAIL else "free"
    user = User(
        email=body.email,
        hashed_password=_hash(body.password),
        role=auto_role,
        provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _create_token(user.id, user.email, user.role)
    return AuthOut(access_token=token, user=UserOut.model_validate(user))


# ── POST /api/auth/login ──────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=AuthOut,
    summary="이메일 로그인",
)
@limiter.limit("10/minute")
def login(request: Request, body: UserLogin, db: Session = Depends(get_db)):
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

    token = _create_token(user.id, user.email, user.role)
    return AuthOut(access_token=token, user=UserOut.model_validate(user))


# ── JWT 인증 의존성 ───────────────────────────────────────────────────────────

def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """Authorization: Bearer <token> 헤더에서 현재 로그인 사용자를 추출."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise credentials_exc
    token = authorization[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise credentials_exc
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    return user


# ── POST /api/auth/session-ping ──────────────────────────────────────────────

@router.post("/session-ping", summary="세션 자동 로그인 카운트")
def session_ping(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """앱 최초 로드 시 세션당 한 번 호출 — auto_login_count 증가."""
    current_user.auto_login_count = (current_user.auto_login_count or 0) + 1
    db.commit()
    return {"ok": True}


# ── GET /api/auth/me ──────────────────────────────────────────────────────────

@router.get("/me", response_model=ProfileOut, summary="내 프로필 조회")
def get_me(current_user: User = Depends(get_current_user)):
    """현재 로그인된 사용자의 프로필을 반환합니다."""
    return current_user


# ── PUT /api/auth/me ──────────────────────────────────────────────────────────

@router.put("/me", response_model=ProfileOut, summary="내 프로필 수정")
def update_me(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """닉네임 변경 및 비밀번호 변경을 처리합니다."""
    # 닉네임 수정
    if body.name is not None:
        current_user.name = body.name.strip() or None

    # 식단 분석용 신체정보 수정
    if body.birth_year is not None:
        current_user.birth_year = body.birth_year
    if body.gender is not None:
        current_user.gender = body.gender
    if body.height_cm is not None:
        current_user.height_cm = body.height_cm
    if body.weight_kg is not None:
        current_user.weight_kg = body.weight_kg

    # 비밀번호 변경 (new_password 입력 시)
    if body.new_password is not None:
        if len(body.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="새 비밀번호는 8자 이상이어야 합니다.",
            )
        if not re.search(r'\d', body.new_password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="비밀번호에 숫자를 포함해야 합니다.",
            )
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', body.new_password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="비밀번호에 특수문자를 포함해야 합니다.",
            )
        if body.current_password is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="현재 비밀번호를 입력해주세요.",
            )
        if not _verify(body.current_password, current_user.hashed_password or ""):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="현재 비밀번호가 올바르지 않습니다.",
            )
        current_user.hashed_password = _hash(body.new_password)

    db.commit()
    db.refresh(current_user)
    return current_user


# ── GET /api/auth/google/login ───────────────────────────────────────────────

@router.get("/google/login", summary="구글 소셜 로그인 시작")
def google_login():
    """구글 OAuth2 인증 페이지로 리디렉트합니다."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth가 설정되지 않았습니다.")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "access_type": "offline",
    }
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)


# ── GET /api/auth/google/callback ────────────────────────────────────────────

@router.get("/google/callback", summary="구글 OAuth2 콜백 처리")
def google_callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    """구글 인증 후 콜백 — JWT 발급 후 프론트엔드로 리디렉트."""
    if error or not code:
        return RedirectResponse("/login?error=google_cancelled")

    # 코드 → 액세스 토큰 교환
    try:
        token_res = httpx.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }, timeout=10)
    except Exception:
        return RedirectResponse("/login?error=google_token_failed")

    if token_res.status_code != 200:
        return RedirectResponse("/login?error=google_token_failed")

    access_token = token_res.json().get("access_token")

    # 구글 유저 정보 조회
    try:
        userinfo_res = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
    except Exception:
        return RedirectResponse("/login?error=google_userinfo_failed")

    if userinfo_res.status_code != 200:
        return RedirectResponse("/login?error=google_userinfo_failed")

    userinfo = userinfo_res.json()
    email = userinfo.get("email")
    google_id = userinfo.get("id")
    name = userinfo.get("name")

    if not email:
        return RedirectResponse("/login?error=no_email")

    # 기존 유저 조회 또는 자동 회원가입
    user = db.query(User).filter(User.email == email).first()
    if not user:
        auto_role = "admin" if email.lower() == ADMIN_EMAIL else "free"
        user = User(
            email=email,
            provider="google",
            provider_id=google_id,
            name=name,
            role=auto_role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 로그인 통계 업데이트
    user.last_login_at = datetime.now(timezone.utc)
    user.login_count = (user.login_count or 0) + 1
    db.commit()
    db.refresh(user)

    jwt_token = _create_token(user.id, user.email, user.role)
    return RedirectResponse(f"/login?token={jwt_token}")


# ── POST /api/auth/logout ────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_200_OK, summary="로그아웃")
def logout(current_user: User = Depends(get_current_user)):
    """로그아웃 처리.

    JWT는 무상태(stateless)이므로 서버에서 토큰을 강제 무효화하려면 블랙리스트 DB가 필요합니다.
    현재는 클라이언트 측에서 토큰을 삭제하는 방식으로 로그아웃을 처리합니다.
    """
    return {"message": "로그아웃 되었습니다."}


# ── GET /api/auth/widget-config ──────────────────────────────────────────────

@router.get("/widget-config", response_model=WidgetConfigOut, summary="위젯 설정 조회")
def get_widget_config(current_user: User = Depends(get_current_user)):
    """현재 사용자의 위젯 설정을 반환합니다. 저장된 값이 없으면 기본값을 반환합니다."""
    if not current_user.widget_config:
        return WidgetConfigOut(config=DEFAULT_WIDGET_CONFIG)
    try:
        cfg = json.loads(current_user.widget_config)
        # 새로 추가된 위젯 키가 빠져 있으면 기본값으로 채움
        for key, default in DEFAULT_WIDGET_CONFIG.items():
            if key not in cfg:
                cfg[key] = default
        return WidgetConfigOut(config=cfg)
    except (json.JSONDecodeError, TypeError):
        return WidgetConfigOut(config=DEFAULT_WIDGET_CONFIG)


# ── PUT /api/auth/widget-config ───────────────────────────────────────────────

@router.put("/widget-config", response_model=WidgetConfigOut, summary="위젯 설정 저장")
def update_widget_config(
    body: WidgetConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """현재 사용자의 위젯 설정을 저장합니다."""
    current_user.widget_config = json.dumps(body.config, ensure_ascii=False)
    db.commit()
    return WidgetConfigOut(config=body.config)


# ── GET /api/auth/users ───────────────────────────────────────────────────────

@router.get(
    "/users",
    response_model=list[UserOut],
    summary="회원 목록 조회 (관리자용)",
)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """가입된 전체 회원 목록을 반환합니다. (관리자 전용)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")
    return db.query(User).order_by(User.created_at.desc()).all()
