"""Google OAuth 공통 유틸리티.

calendar.py, youtube_oauth.py 등에서 공유하는
HMAC state 서명/검증 및 토큰 관리 헬퍼 함수.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from models import GoogleServiceToken

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SECRET_KEY = os.getenv("SECRET_KEY", "")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


# ── HMAC 서명된 state — CSRF 방지 ──────────────────────────────────────────────
# state 형식: "{user_id}.{service}.{hmac_sig}"
# service 값이 포함되므로 캘린더 state로 유튜브 콜백을 위조할 수 없음.

def sign_state(user_id: int, service: str) -> str:
    msg = f"{user_id}:{service}".encode()
    sig = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()[:16]
    return f"{user_id}.{service}.{sig}"


def verify_state(state: str, expected_service: str | None = None) -> tuple[int, str] | None:
    """state 검증 → (user_id, service) 반환. 실패 시 None.
    expected_service 지정 시 service 불일치면 None 반환.
    """
    try:
        parts = state.split(".", 2)
        if len(parts) != 3:
            return None
        user_id_str, service, sig = parts
        user_id = int(user_id_str)
        expected = hmac.new(
            SECRET_KEY.encode(),
            f"{user_id}:{service}".encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        if expected_service and service != expected_service:
            return None
        return user_id, service
    except Exception:
        return None


# ── 토큰 만료 판정 & 갱신 ─────────────────────────────────────────────────────

def is_token_expired(token: GoogleServiceToken) -> bool:
    """만료 5분 전부터 갱신 대상으로 판정."""
    if not token.expires_at:
        return True
    now = datetime.now(timezone.utc)
    exp = token.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp - now < timedelta(minutes=5)


def refresh_access_token(
    token: GoogleServiceToken,
    db: Session,
    log_prefix: str = "[GTOKEN]",
) -> bool:
    """refresh_token으로 access_token 갱신. 성공하면 True."""
    if not token.refresh_token:
        return False
    try:
        res = httpx.post(GOOGLE_TOKEN_URL, data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": token.refresh_token,
            "grant_type": "refresh_token",
        }, timeout=10)
    except Exception as e:
        logger.error("%s 토큰 갱신 요청 실패: %s", log_prefix, e)
        return False

    if res.status_code != 200:
        logger.error("%s 토큰 갱신 실패 %s: %s", log_prefix, res.status_code, res.text)
        return False

    data = res.json()
    token.access_token = data["access_token"]
    token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    db.commit()
    logger.info("%s user_id=%s 토큰 자동 갱신 완료", log_prefix, token.user_id)
    return True


def get_valid_token(
    user_id: int,
    service_type: str,
    db: Session,
    log_prefix: str = "[GTOKEN]",
) -> GoogleServiceToken | None:
    """유효한 토큰 반환. 만료 시 자동 갱신. 없거나 갱신 실패 시 None."""
    token = db.query(GoogleServiceToken).filter(
        GoogleServiceToken.user_id == user_id,
        GoogleServiceToken.service_type == service_type,
    ).first()
    if not token:
        return None
    if is_token_expired(token):
        if not refresh_access_token(token, db, log_prefix):
            return None
    return token


def upsert_token(
    db: Session,
    user_id: int,
    service_type: str,
    access_token: str,
    refresh_token: str | None,
    expires_at: datetime,
    google_email: str | None,
) -> None:
    """토큰 저장 — 있으면 업데이트, 없으면 신규 생성."""
    existing = db.query(GoogleServiceToken).filter(
        GoogleServiceToken.user_id == user_id,
        GoogleServiceToken.service_type == service_type,
    ).first()

    if existing:
        existing.access_token = access_token
        if refresh_token:
            existing.refresh_token = refresh_token
        existing.expires_at = expires_at
        existing.google_email = google_email
    else:
        db.add(GoogleServiceToken(
            user_id=user_id,
            service_type=service_type,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            google_email=google_email,
        ))
    db.commit()


def get_google_email(access_token: str) -> str | None:
    """access_token으로 구글 계정 이메일 조회."""
    try:
        res = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if res.status_code == 200:
            return res.json().get("email")
    except Exception:
        pass
    return None
