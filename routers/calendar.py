"""Google Calendar 연동 라우터.

로그인(auth.py)과 완전히 분리된 캘린더 전용 OAuth 흐름.
내부적으로 google_service_tokens 테이블의 service_type='calendar' 행을 사용.

- GET  /api/calendar/connect      : Google OAuth 인증 시작 (팝업으로 열림)
- GET  /api/calendar/callback     : Google 콜백 처리 → 토큰 저장
- GET  /api/calendar/status       : 연동 여부 확인
- GET  /api/calendar/today        : 오늘 일정 조회 (토큰 만료 시 자동 갱신)
- DEL  /api/calendar/disconnect   : 연동 해제
"""
from __future__ import annotations

import logging
import os
import urllib.parse
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from routers._google_oauth import (
    GOOGLE_AUTH_URL,
    delete_service_token,
    exchange_code,
    get_google_email,
    get_service_status,
    get_valid_token,
    refresh_access_token,
    sign_state,
    upsert_token,
    verify_state,
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])

BASE_URL = os.getenv("BASE_URL", "https://dashboard-production-4a18.up.railway.app")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

GCAL_REDIRECT_URI = f"{BASE_URL}/api/calendar/callback"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
SERVICE = "calendar"
LOG = "[GCAL]"


# ── GET /api/calendar/connect ─────────────────────────────────────────────────

@router.get("/connect", summary="Google Calendar 연동 시작")
def calendar_connect(current_user=Depends(get_current_user)):
    """캘린더 연동용 Google OAuth 인증 페이지로 리디렉트.
    로그인과 별개로 calendar.readonly 권한만 요청.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth가 설정되지 않았습니다.")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
        "redirect_uri": GCAL_REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent",
        "state": sign_state(current_user.id, SERVICE),
    }
    return RedirectResponse(GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params))


# ── GET /api/calendar/callback ────────────────────────────────────────────────

@router.get("/callback", summary="Google OAuth 콜백 — 토큰 저장")
def calendar_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error or not code or not state:
        return RedirectResponse("/auth/calendar-callback?status=error")

    result = verify_state(state, expected_service=SERVICE)
    if result is None:
        logger.warning("%s 유효하지 않은 state: %s", LOG, state)
        return RedirectResponse("/auth/calendar-callback?status=error")
    user_id, _ = result

    data = exchange_code(code, GCAL_REDIRECT_URI)
    if not data:
        return RedirectResponse("/auth/calendar-callback?status=error")

    from datetime import timedelta
    upsert_token(
        db=db,
        user_id=user_id,
        service_type=SERVICE,
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600)),
        google_email=get_google_email(data["access_token"]),
    )
    logger.info("%s user_id=%s 캘린더 연동 완료", LOG, user_id)
    return RedirectResponse("/auth/calendar-callback?status=connected")


# ── GET /api/calendar/status ──────────────────────────────────────────────────

@router.get("/status", summary="Google Calendar 연동 여부 확인")
def calendar_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_service_status(current_user.id, SERVICE, db)


# ── GET /api/calendar/today ───────────────────────────────────────────────────

@router.get("/today", summary="오늘 Google Calendar 일정 조회")
def calendar_today(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = get_valid_token(current_user.id, SERVICE, db, LOG)
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
        logger.error("%s 일정 조회 요청 실패: %s", LOG, e)
        raise HTTPException(status_code=503, detail="Google Calendar 조회에 실패했습니다.")

    if res.status_code == 401:
        if refresh_access_token(token, db, LOG):
            return calendar_today(current_user=current_user, db=db)
        raise HTTPException(status_code=401, detail="인증이 만료됐습니다. 다시 연동해 주세요.")

    if res.status_code != 200:
        logger.error("%s Calendar API 오류 %s: %s", LOG, res.status_code, res.text)
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
    delete_service_token(current_user.id, SERVICE, db)
    return {"message": "Google Calendar 연동이 해제됐습니다."}
