"""YouTube 계정 연동 라우터.

캘린더 연동과 완전히 분리된 별도의 OAuth 흐름.
내부적으로 google_service_tokens 테이블의 service_type='youtube' 행을 사용.

- GET  /api/youtube/connect        : YouTube OAuth 인증 시작 (팝업으로 열림)
- GET  /api/youtube/callback       : Google 콜백 처리 → 토큰 저장
- GET  /api/youtube/status         : 연동 여부 확인
- GET  /api/youtube/subscriptions  : 구독 채널 목록
- GET  /api/youtube/playlists      : 재생목록 목록
- DEL  /api/youtube/disconnect     : 연동 해제
"""
from __future__ import annotations

import logging
import os
import urllib.parse
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from models import GoogleServiceToken
from routers._google_oauth import (
    GOOGLE_AUTH_URL,
    get_google_email,
    get_valid_token,
    refresh_access_token,
    sign_state,
    upsert_token,
    verify_state,
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/youtube", tags=["youtube-oauth"])

BASE_URL = os.getenv("BASE_URL", "https://dashboard-production-4a18.up.railway.app")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

YT_REDIRECT_URI = f"{BASE_URL}/api/youtube/callback"
YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
SERVICE = "youtube"
LOG = "[YT]"


# ── GET /api/youtube/connect ──────────────────────────────────────────────────

@router.get("/connect", summary="YouTube 계정 연동 시작")
def youtube_connect(current_user=Depends(get_current_user)):
    """유튜브 연동용 Google OAuth 인증 페이지로 리디렉트.
    youtube.readonly 권한만 요청 (캘린더 연동과 완전히 별개).
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth가 설정되지 않았습니다.")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/youtube.readonly",
        "redirect_uri": YT_REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent",
        "state": sign_state(current_user.id, SERVICE),
    }
    return RedirectResponse(GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params))


# ── GET /api/youtube/callback ─────────────────────────────────────────────────

@router.get("/callback", summary="YouTube OAuth 콜백 — 토큰 저장")
def youtube_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    logger.info("%s callback 수신 — error=%s code_exists=%s state_exists=%s",
                LOG, error, bool(code), bool(state))
    if error or not code or not state:
        logger.warning("%s OAuth 오류 또는 파라미터 누락 — error=%s", LOG, error)
        return RedirectResponse("/auth/youtube-callback?status=error")

    result = verify_state(state, expected_service=SERVICE)
    if result is None:
        logger.warning("%s 유효하지 않은 state: %s", LOG, state)
        return RedirectResponse("/auth/youtube-callback?status=error")
    user_id, _ = result

    try:
        token_res = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": YT_REDIRECT_URI,
            "grant_type": "authorization_code",
        }, timeout=10)
    except Exception as e:
        logger.error("%s 토큰 교환 실패: %s", LOG, e)
        return RedirectResponse("/auth/youtube-callback?status=error")

    if token_res.status_code != 200:
        logger.error("%s 토큰 교환 응답 오류 %s: %s", LOG, token_res.status_code, token_res.text)
        return RedirectResponse("/auth/youtube-callback?status=error")

    data = token_res.json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))

    upsert_token(
        db=db,
        user_id=user_id,
        service_type=SERVICE,
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_at=expires_at,
        google_email=get_google_email(data["access_token"]),
    )
    logger.info("%s user_id=%s YouTube 연동 완료", LOG, user_id)
    return RedirectResponse("/auth/youtube-callback?status=connected")


# ── GET /api/youtube/status ───────────────────────────────────────────────────

@router.get("/status", summary="YouTube 연동 여부 확인")
def youtube_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleServiceToken).filter(
        GoogleServiceToken.user_id == current_user.id,
        GoogleServiceToken.service_type == SERVICE,
    ).first()
    if not token:
        return {"connected": False}
    return {"connected": True, "google_email": token.google_email}


# ── GET /api/youtube/subscriptions ───────────────────────────────────────────

@router.get("/subscriptions", summary="구독 채널 목록 조회")
def youtube_subscriptions(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """연동된 YouTube 계정의 구독 채널 목록을 최대 50개 반환."""
    token = get_valid_token(current_user.id, SERVICE, db, LOG)
    if not token:
        raise HTTPException(status_code=401, detail="YouTube가 연동되지 않았습니다.")

    try:
        res = httpx.get(
            f"{YOUTUBE_API}/subscriptions",
            headers={"Authorization": f"Bearer {token.access_token}"},
            params={
                "part": "snippet",
                "mine": "true",
                "maxResults": 50,
                "order": "alphabetical",
            },
            timeout=15,
        )
    except Exception as e:
        logger.error("%s 구독 채널 조회 실패: %s", LOG, e)
        raise HTTPException(status_code=503, detail="YouTube 구독 채널 조회에 실패했습니다.")

    if res.status_code == 401:
        if refresh_access_token(token, db, LOG):
            return youtube_subscriptions(current_user=current_user, db=db)
        raise HTTPException(status_code=401, detail="인증이 만료됐습니다. 다시 연동해 주세요.")

    if res.status_code != 200:
        logger.error("%s YouTube API 오류 %s: %s", LOG, res.status_code, res.text)
        raise HTTPException(status_code=502, detail="YouTube API 오류가 발생했습니다.")

    raw = res.json()
    items = raw.get("items", [])
    logger.warning("%s subscriptions raw: totalResults=%s items=%d nextPageToken=%s",
                   LOG, raw.get("pageInfo", {}).get("totalResults"), len(items), bool(raw.get("nextPageToken")))
    channels = []
    for item in items:
        snippet = item.get("snippet", {})
        resource_id = snippet.get("resourceId", {})
        channel_id = resource_id.get("channelId", "")
        thumbnails = snippet.get("thumbnails", {})
        thumb = (
            thumbnails.get("default", {}).get("url")
            or thumbnails.get("medium", {}).get("url")
            or ""
        )
        channels.append({
            "channel_id": channel_id,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", "")[:100],
            "thumbnail": thumb,
            "url": f"https://www.youtube.com/channel/{channel_id}" if channel_id else "",
        })

    return {"channels": channels, "total": len(channels)}


# ── GET /api/youtube/playlists ────────────────────────────────────────────────

@router.get("/playlists", summary="재생목록 조회")
def youtube_playlists(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """연동된 YouTube 계정의 재생목록을 반환.

    mine=true (사용자 생성 재생목록) + 특수 재생목록 (좋아요/나중에 볼) 병합.
    특수 재생목록은 channels.list contentDetails.relatedPlaylists 에서 실제 ID를 가져온 뒤
    playlists.list 로 메타데이터를 조회한다.
    """
    token = get_valid_token(current_user.id, SERVICE, db, LOG)
    if not token:
        raise HTTPException(status_code=401, detail="YouTube가 연동되지 않았습니다.")

    headers = {"Authorization": f"Bearer {token.access_token}"}

    def _fetch(params: dict) -> list:
        try:
            r = httpx.get(f"{YOUTUBE_API}/playlists", headers=headers, params=params, timeout=15)
        except Exception as e:
            logger.error("%s 재생목록 조회 실패: %s", LOG, e)
            return []
        if r.status_code == 401:
            if refresh_access_token(token, db, LOG):
                try:
                    r = httpx.get(f"{YOUTUBE_API}/playlists", headers=headers, params=params, timeout=15)
                except Exception:
                    return []
            else:
                raise HTTPException(status_code=401, detail="인증이 만료됐습니다. 다시 연동해 주세요.")
        if r.status_code != 200:
            logger.error("%s YouTube playlists API 오류 %s: %s", LOG, r.status_code, r.text)
            return []
        return r.json().get("items", [])

    # 1) 사용자 생성 재생목록
    mine_items = _fetch({"part": "snippet,contentDetails", "mine": "true", "maxResults": 50})

    # 2) 특수 재생목록 실제 ID 조회 (channels.list → relatedPlaylists)
    special_items: list = []
    try:
        ch_res = httpx.get(
            f"{YOUTUBE_API}/channels",
            headers=headers,
            params={"part": "contentDetails", "mine": "true"},
            timeout=10,
        )
        if ch_res.status_code == 200:
            related = (
                ch_res.json()
                .get("items", [{}])[0]
                .get("contentDetails", {})
                .get("relatedPlaylists", {})
            )
            special_ids = [v for v in [related.get("likes"), related.get("watchLater")] if v]
            if special_ids:
                special_items = _fetch({
                    "part": "snippet,contentDetails",
                    "id": ",".join(special_ids),
                    "maxResults": len(special_ids),
                })
    except Exception as e:
        logger.warning("%s 특수 재생목록 ID 조회 실패 (무시): %s", LOG, e)

    # 3) 병합 — 사용자 생성 우선, 특수는 뒤에 (중복 제거)
    seen_ids: set = set()
    all_items = mine_items + special_items
    playlists = []
    for item in all_items:
        pid = item.get("id", "")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)
        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumb = (
            thumbnails.get("medium", {}).get("url")
            or thumbnails.get("default", {}).get("url")
            or ""
        )
        playlists.append({
            "playlist_id": pid,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", "")[:100],
            "thumbnail": thumb,
            "item_count": item.get("contentDetails", {}).get("itemCount", 0),
            "url": f"https://www.youtube.com/playlist?list={pid}",
        })

    logger.warning("%s playlists 최종: mine=%d special=%d total=%d",
                   LOG, len(mine_items), len(special_items), len(playlists))
    return {"playlists": playlists, "total": len(playlists)}


# ── DELETE /api/youtube/disconnect ────────────────────────────────────────────

@router.delete("/disconnect", summary="YouTube 연동 해제")
def youtube_disconnect(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleServiceToken).filter(
        GoogleServiceToken.user_id == current_user.id,
        GoogleServiceToken.service_type == SERVICE,
    ).first()
    if token:
        db.delete(token)
        db.commit()
    return {"message": "YouTube 연동이 해제됐습니다."}
