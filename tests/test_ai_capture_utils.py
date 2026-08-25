"""AI 캡처 유틸 단위 테스트 — DB/네트워크 없이 순수 함수만 검증."""
from __future__ import annotations
import re
from datetime import date as _Date


# ── normalize_date_str 인라인 복사 (DB 임포트 충돌 방지) ─────────────────────
def normalize_date_str(raw) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
        if m:
            mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            return None
    try:
        return _Date(y, mo, d).isoformat()
    except ValueError:
        return None


# ── _match_name 인라인 복사 ───────────────────────────────────────────────────
def _match_name(target, rows, *keys):
    if not target:
        return None
    t = target.strip().lower()
    for row in rows:
        for k in keys:
            if row.get(k, "").strip().lower() == t:
                return row["id"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# normalize_date_str 테스트
# ─────────────────────────────────────────────────────────────────────────────

def test_normalize_date_iso():
    assert normalize_date_str("2025-08-15") == "2025-08-15"


def test_normalize_date_slash_ymd():
    assert normalize_date_str("2025/08/05") == "2025-08-05"


def test_normalize_date_dot_ymd():
    assert normalize_date_str("2025.01.31") == "2025-01-31"


def test_normalize_date_us_slash():
    assert normalize_date_str("08/15/2025") == "2025-08-15"


def test_normalize_date_us_dot():
    assert normalize_date_str("1.5.2024") == "2024-01-05"


def test_normalize_date_none():
    assert normalize_date_str(None) is None


def test_normalize_date_empty():
    assert normalize_date_str("") is None


def test_normalize_date_invalid_date():
    assert normalize_date_str("2025-13-01") is None


def test_normalize_date_nonsense():
    assert normalize_date_str("abc") is None


def test_normalize_date_single_digit_month_day():
    assert normalize_date_str("2024-1-5") == "2024-01-05"


# ─────────────────────────────────────────────────────────────────────────────
# _match_name 테스트
# ─────────────────────────────────────────────────────────────────────────────

CATS = [
    {"id": 1, "name_ko": "식비", "name_en": "Food"},
    {"id": 2, "name_ko": "교통", "name_en": "Transport"},
    {"id": 3, "name_ko": "의류", "name_en": "Clothing"},
]


def test_match_name_ko_exact():
    assert _match_name("식비", CATS, "name_ko", "name_en") == 1


def test_match_name_en_exact():
    assert _match_name("Transport", CATS, "name_ko", "name_en") == 2


def test_match_name_case_insensitive():
    assert _match_name("FOOD", CATS, "name_ko", "name_en") == 1


def test_match_name_strip_whitespace():
    assert _match_name("  의류  ", CATS, "name_ko", "name_en") == 3


def test_match_name_not_found():
    assert _match_name("의료비", CATS, "name_ko", "name_en") is None


def test_match_name_none_target():
    assert _match_name(None, CATS, "name_ko", "name_en") is None


def test_match_name_empty_rows():
    assert _match_name("식비", [], "name_ko", "name_en") is None
