"""Google Calendar 연동 라우터.

로그인(auth.py)과 완전히 분리된 캘린더 전용 OAuth 흐름.
- /api/calendar/connect   : Google OAuth 인증 시작 (팝업으로 열림)
- /api/calendar/callback  : Google 콜백 처리 → 토큰 저장
- /api/calendar/status    : 연동 여부 확인
- /api/calendar/today     : 오늘 일정 조회 (토큰 만료 시 자동 갱신)
- DELETE /api/calendar/disconnect : 연동 해제
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import urllib.parse
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from models import GoogleCalendarToken
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])

BASE_URL = os.getenv("BASE_URL", "https://dashboard-production-4a18.up.railway.app")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SECRET_KEY = os.getenv("SECRET_KEY", "")

GCAL_REDIRECT_URI = f"{BASE_URL}/api/calendar/callback"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


# ── HMAC 서명된 state — CSRF 방지 ──────────────────────────────────────────────

def _sign_state(user_id: int) -> str:
    msg = str(user_id).encode()
    sig = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()[:16]
    return f"{user_id}.{sig}"


def _verify_state(state: str) -> int | None:
    try:
        user_id_str, sig = state.rsplit(".", 1)
        user_id = int(user_id_str)
        expected = hmac.new(SECRET_KEY.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()[:16]
        if hmac.compare_digest(sig, expected):
            return user_id
        return None
    except Exception:
        return None


# ── 토큰 만료 판정 ────────────────────────────────────────────────────────────

def _is_token_expired(token: GoogleCalendarToken) -> bool:
    """만료 5분 전부터 미리 갱신 대상으로 판정."""
    if not token.expires_at:
        return True
    now = datetime.now(timezone.utc)
    exp = token.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp - now < timedelta(minutes=5)


def _refresh_access_token(token: GoogleCalendarToken, db: Session) -> bool:
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
        logger.error("[GCAL] 토큰 갱신 요청 실패: %s", e)
        return False

    if res.status_code != 200:
        logger.error("[GCAL] 토큰 갱신 실패 %s: %s", res.status_code, res.text)
        return False

    data = res.json()
    token.access_token = data["access_token"]
    expires_in = data.get("expires_in", 3600)
    token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    db.commit()
    logger.info("[GCAL] user_id=%s 토큰 자동 갱신 완료", token.user_id)
    return True


def _get_valid_token(user_id: int, db: Session) -> GoogleCalendarToken | None:
    """유효한 토큰 반환. 만료 시 자동 갱신. 없거나 갱신 실패 시 None."""
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == user_id
    ).first()
    if not token:
        return None
    if _is_token_expired(token):
        if not _refresh_access_token(token, db):
            return None
    return token


# ── GET /api/calendar/connect ─────────────────────────────────────────────────

@router.get("/connect", summary="Google Calendar 연동 시작")
def calendar_connect(current_user=Depends(get_current_user)):
    """캘린더 연동용 Google OAuth 인증 페이지로 리디렉트.
    로그인과 별개로 calendar.readonly 권한만 요청.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth가 설정되지 않았습니다.")

    state = _sign_state(current_user.id)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.readonly",
        "redirect_uri": GCAL_REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent",  # refresh_token을 항상 발급받기 위해 동의 화면 강제
        "state": state,
    }
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)


# ── GET /api/calendar/callback ────────────────────────────────────────────────

@router.get("/callback", summary="Google OAuth 콜백 — 토큰 저장")
def calendar_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Google 인증 후 콜백. state의 HMAC을 검증해 user_id를 복원하고 토큰을 저장."""
    if error or not code or not state:
        return RedirectResponse("/auth/calendar-callback?status=error")

    user_id = _verify_state(state)
    if user_id is None:
        logger.warning("[GCAL] 유효하지 않은 state: %s", state)
        return RedirectResponse("/auth/calendar-callback?status=error")

    # code → access_token + refresh_token
    try:
        token_res = httpx.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GCAL_REDIRECT_URI,
            "grant_type": "authorization_code",
        }, timeout=10)
    except Exception as e:
        logger.error("[GCAL] 토큰 교환 요청 실패: %s", e)
        return RedirectResponse("/auth/calendar-callback?status=error")

    if token_res.status_code != 200:
        logger.error("[GCAL] 토큰 교환 응답 오류 %s: %s", token_res.status_code, token_res.text)
        return RedirectResponse("/auth/calendar-callback?status=error")

    token_data = token_res.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # 연동된 구글 계정 이메일 조회
    google_email = None
    try:
        me_res = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if me_res.status_code == 200:
            google_email = me_res.json().get("email")
    except Exception:
        pass

    # 기존 토큰이 있으면 업데이트, 없으면 신규 생성
    existing = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == user_id
    ).first()

    if existing:
        existing.access_token = access_token
        if refresh_token:
            existing.refresh_token = refresh_token
        existing.expires_at = expires_at
        existing.google_email = google_email
    else:
        db.add(GoogleCalendarToken(
            user_id=user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            google_email=google_email,
        ))

    db.commit()
    logger.info("[GCAL] user_id=%s 캘린더 연동 완료 (google_email=%s)", user_id, google_email)
    return RedirectResponse("/auth/calendar-callback?status=connected")


# ── GET /api/calendar/status ──────────────────────────────────────────────────

@router.get("/status", summary="Google Calendar 연동 여부 확인")
def calendar_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        return {"connected": False}
    return {"connected": True, "google_email": token.google_email}


# ── GET /api/calendar/today ───────────────────────────────────────────────────

@router.get("/today", summary="오늘 Google Calendar 일정 조회")
def calendar_today(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """오늘 날짜 기준 일정 목록 반환. access_token 만료 시 자동 갱신."""
    token = _get_valid_token(current_user.id, db)
    if not token:
        raise HTTPException(status_code=401, detail="Google Calendar가 연동되지 않았습니다.")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

    try:
        res = httpx.get(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            headers={"Authorization": f"Bearer {token.access_token}"},
            params={
                "timeMin": today_start,
                "timeMax": today_end,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 20,
            },
            timeout=10,
        )
    except Exception as e:
        logger.error("[GCAL] 일정 조회 요청 실패: %s", e)
        raise HTTPException(status_code=503, detail="Google Calendar 조회에 실패했습니다.")

    if res.status_code == 401:
        if _refresh_access_token(token, db):
            return calendar_today(current_user=current_user, db=db)
        raise HTTPException(status_code=401, detail="인증이 만료됐습니다. 다시 연동해 주세요.")

    if res.status_code != 200:
        logger.error("[GCAL] Calendar API 오류 %s: %s", res.status_code, res.text)
        raise HTTPException(status_code=502, detail="Google Calendar API 오류가 발생했습니다.")

    items = res.json().get("items", [])
    events = []
    for item in items:
        start = item.get("start", {})
        time_str = start.get("dateTime", start.get("date", ""))
        if "T" in time_str:
            time_part = time_str.split("T")[1][:5]
            is_all_day = False
        else:
            time_part = "allday"
            is_all_day = True
        events.append({
            "id": item.get("id"),
            "summary": item.get("summary", "(제목 없음)"),
            "time": time_part,
            "location": item.get("location"),
            "is_all_day": is_all_day,
        })

    return {"events": events, "date": now.strftime("%Y-%m-%d")}


# ── DELETE /api/calendar/disconnect ──────────────────────────────────────────

@router.delete("/disconnect", summary="Google Calendar 연동 해제")
def calendar_disconnect(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).first()
    if token:
        db.delete(token)
        db.commit()
    return {"message": "Google Calendar 연동이 해제됐습니다."}
