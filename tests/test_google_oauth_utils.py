"""_google_oauth.py 단위 테스트.

외부 API(Google)나 DB 없이 순수 함수 로직만 검증.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# DB 연결 없이 모듈만 로드하기 위해 환경변수 설정
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")


# ── 모델/DB 모킹 (로컬 Python 3.9 호환성 우회) ───────────────────────────────
# SQLAlchemy Mapped 타입이 Python 3.9에서 오류를 일으키므로 models 모듈을 모킹.
mock_token_cls = MagicMock()
mock_models = MagicMock()
mock_models.GoogleServiceToken = mock_token_cls
sys.modules["models"] = mock_models
sys.modules["database"] = MagicMock()

# 이제 안전하게 import
from routers._google_oauth import (  # noqa: E402
    delete_service_token,
    exchange_code,
    get_service_status,
    is_token_expired,
    sign_state,
    upsert_token,
    verify_state,
)


# ══════════════════════════════════════════════════════════════════════════════
# sign_state / verify_state 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestSignVerifyState:
    def test_sign_and_verify_roundtrip(self):
        """서명 후 검증이 성공해야 한다."""
        state = sign_state(user_id=42, service="calendar")
        result = verify_state(state)
        assert result == (42, "calendar")

    def test_verify_correct_service(self):
        """expected_service가 일치하면 검증 성공."""
        state = sign_state(42, "youtube")
        assert verify_state(state, expected_service="youtube") == (42, "youtube")

    def test_verify_wrong_service_returns_none(self):
        """캘린더 state를 유튜브 콜백에 쓰면 None 반환 — CSRF 방지."""
        state = sign_state(42, "calendar")
        assert verify_state(state, expected_service="youtube") is None

    def test_verify_tampered_signature_returns_none(self):
        """서명 값을 위조하면 None 반환."""
        state = sign_state(42, "calendar")
        parts = state.split(".")
        tampered = f"{parts[0]}.{parts[1]}.fakesig12345678"
        assert verify_state(tampered) is None

    def test_verify_invalid_format_returns_none(self):
        """점(.) 구분자가 없는 잘못된 형식은 None 반환."""
        assert verify_state("notavalidstate") is None

    def test_different_users_get_different_states(self):
        """유저 ID가 다르면 state도 달라야 한다."""
        s1 = sign_state(1, "calendar")
        s2 = sign_state(2, "calendar")
        assert s1 != s2


# ══════════════════════════════════════════════════════════════════════════════
# is_token_expired 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestIsTokenExpired:
    def _make_token(self, expires_at):
        tok = MagicMock()
        tok.expires_at = expires_at
        return tok

    def test_expired_token(self):
        """만료된 토큰은 True."""
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        assert is_token_expired(self._make_token(past)) is True

    def test_valid_token(self):
        """충분히 남은 토큰은 False."""
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        assert is_token_expired(self._make_token(future)) is False

    def test_token_expiring_within_5_minutes(self):
        """만료 3분 전 → 갱신 대상(True)."""
        soon = datetime.now(timezone.utc) + timedelta(minutes=3)
        assert is_token_expired(self._make_token(soon)) is True

    def test_token_with_no_expires_at(self):
        """expires_at 없으면 만료로 간주(True)."""
        assert is_token_expired(self._make_token(None)) is True

    def test_naive_datetime_treated_as_utc(self):
        """timezone 정보 없는 datetime도 UTC로 처리한다."""
        future_naive = datetime.utcnow() + timedelta(hours=1)
        assert is_token_expired(self._make_token(future_naive)) is False


# ══════════════════════════════════════════════════════════════════════════════
# exchange_code 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestExchangeCode:
    @patch("routers._google_oauth.httpx.post")
    def test_success(self, mock_post):
        """구글이 200을 반환하면 토큰 dict 반환."""
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
        )
        result = exchange_code("auth_code", "https://example.com/callback")
        assert result["access_token"] == "at"
        assert result["refresh_token"] == "rt"

    @patch("routers._google_oauth.httpx.post")
    def test_google_error_returns_none(self, mock_post):
        """구글이 400을 반환하면 None."""
        mock_post.return_value = MagicMock(status_code=400, text="invalid_grant")
        assert exchange_code("bad_code", "https://example.com/callback") is None

    @patch("routers._google_oauth.httpx.post", side_effect=Exception("timeout"))
    def test_network_error_returns_none(self, _):
        """네트워크 오류 시 None (서버 크래시 방지)."""
        assert exchange_code("any_code", "https://example.com/callback") is None


# ══════════════════════════════════════════════════════════════════════════════
# get_service_status 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestGetServiceStatus:
    def _make_db(self, token):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = token
        return db

    def test_no_token_returns_not_connected(self):
        """DB에 토큰 없으면 connected=False."""
        db = self._make_db(None)
        result = get_service_status(1, "calendar", db)
        assert result == {"connected": False}

    def test_token_with_email(self):
        """이메일 있는 토큰 → connected=True, google_email 포함."""
        tok = MagicMock()
        tok.google_email = "user@gmail.com"
        tok.access_token = "at"
        db = self._make_db(tok)
        result = get_service_status(1, "calendar", db)
        assert result["connected"] is True
        assert result["google_email"] == "user@gmail.com"

    @patch("routers._google_oauth.get_google_email", return_value="fetched@gmail.com")
    def test_null_email_is_fetched_and_saved(self, mock_email):
        """이메일이 없으면 자동으로 가져와서 DB에 저장한다."""
        tok = MagicMock()
        tok.google_email = None
        tok.access_token = "at"
        db = self._make_db(tok)
        result = get_service_status(1, "youtube", db)
        assert result["google_email"] == "fetched@gmail.com"
        assert tok.google_email == "fetched@gmail.com"
        db.commit.assert_called_once()

    @patch("routers._google_oauth.get_google_email", return_value=None)
    def test_null_email_fetch_fails_gracefully(self, _):
        """이메일 가져오기 실패해도 에러 없이 None 반환."""
        tok = MagicMock()
        tok.google_email = None
        tok.access_token = "at"
        db = self._make_db(tok)
        result = get_service_status(1, "calendar", db)
        assert result["connected"] is True
        assert result["google_email"] is None


# ══════════════════════════════════════════════════════════════════════════════
# delete_service_token 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestDeleteServiceToken:
    def _make_db(self, token):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = token
        return db

    def test_deletes_existing_token(self):
        """토큰이 있으면 삭제하고 커밋한다."""
        tok = MagicMock()
        db = self._make_db(tok)
        delete_service_token(1, "calendar", db)
        db.delete.assert_called_once_with(tok)
        db.commit.assert_called_once()

    def test_no_token_does_nothing(self):
        """토큰이 없으면 삭제 호출 없이 조용히 통과한다."""
        db = self._make_db(None)
        delete_service_token(1, "youtube", db)
        db.delete.assert_not_called()
        db.commit.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# upsert_token 테스트
# ══════════════════════════════════════════════════════════════════════════════

class TestUpsertToken:
    def test_updates_existing_token(self):
        """이미 토큰이 있으면 UPDATE."""
        existing = MagicMock()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing
        exp = datetime.now(timezone.utc) + timedelta(hours=1)
        upsert_token(db, 1, "calendar", "new_at", "new_rt", exp, "u@g.com")
        assert existing.access_token == "new_at"
        assert existing.refresh_token == "new_rt"
        db.commit.assert_called_once()

    def test_creates_new_token(self):
        """토큰이 없으면 INSERT."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        exp = datetime.now(timezone.utc) + timedelta(hours=1)
        upsert_token(db, 1, "youtube", "at", "rt", exp, "u@g.com")
        db.add.assert_called_once()
        db.commit.assert_called_once()
