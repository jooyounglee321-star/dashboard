"""일별 결산 backfill 주말·공휴일 처리 단위 테스트.

DB / yfinance 의존 없이 핵심 알고리즘만 검증.
(Python 3.9 환경에서도 models import 충돌 없이 동작)
"""
from __future__ import annotations
from datetime import date, timedelta
from typing import Optional


# ── 검증 대상: 직전 거래일 종가 선택 알고리즘 ──────────────────────────────────
# portfolio.py _get_historical_prices_batch 내부 로직과 동일
def _pick_price(price_map: dict, target: date):
    """price_map(거래일→종가) 에서 target 이하 가장 최근 거래일 종가 반환."""
    candidates = [d for d in price_map if d <= target]
    if not candidates:
        return None
    return price_map[max(candidates)]


# ── 주말/공휴일 날짜 선택 로직 테스트 ──────────────────────────────────────────

class TestPickPriceAlgorithm:
    """직전 거래일 종가 선택 로직 검증."""

    def test_weekday_returns_own_price(self):
        """거래일이면 해당일 종가를 그대로 반환."""
        friday = date(2026, 7, 24)
        price_map = {friday: 150.0}
        assert _pick_price(price_map, friday) == 150.0

    def test_saturday_uses_friday_price(self):
        """토요일 → 금요일(직전 거래일) 종가 사용."""
        friday = date(2026, 7, 24)
        saturday = date(2026, 7, 25)
        price_map = {friday: 200.0}
        result = _pick_price(price_map, saturday)
        assert result == 200.0, f"토요일이 금요일 종가를 써야 하는데 {result}"

    def test_sunday_uses_friday_price(self):
        """일요일 → 금요일(직전 거래일) 종가 사용."""
        friday = date(2026, 7, 24)
        sunday = date(2026, 7, 26)
        price_map = {friday: 200.0}
        result = _pick_price(price_map, sunday)
        assert result == 200.0, f"일요일이 금요일 종가를 써야 하는데 {result}"

    def test_holiday_uses_last_trading_day(self):
        """공휴일(거래 없음) → 직전 거래일 종가 사용."""
        wednesday = date(2026, 7, 22)
        thursday_holiday = date(2026, 7, 23)  # 공휴일 → price_map에 없음
        price_map = {wednesday: 180.0}
        result = _pick_price(price_map, thursday_holiday)
        assert result == 180.0

    def test_multiple_trading_days_picks_closest(self):
        """여러 거래일 중 target과 가장 가까운(최근) 거래일 종가를 선택."""
        monday = date(2026, 7, 20)
        tuesday = date(2026, 7, 21)
        wednesday = date(2026, 7, 22)
        saturday = date(2026, 7, 25)
        price_map = {monday: 100.0, tuesday: 110.0, wednesday: 120.0}
        # 토요일 → 가장 최근 거래일(수요일) 종가 120
        result = _pick_price(price_map, saturday)
        assert result == 120.0

    def test_no_prior_trading_day_returns_none(self):
        """target 이전 거래일이 아예 없으면 None 반환."""
        future_date = date(2026, 8, 1)
        price_map = {future_date: 999.0}
        # price_map의 날짜가 target보다 미래에만 있으면 candidates 비어있음
        earlier_date = date(2026, 7, 1)
        result = _pick_price(price_map, earlier_date)
        assert result is None

    def test_exact_weekend_batch(self):
        """금·토·일 3일을 한 번에 처리 시 토·일 모두 금 종가와 동일."""
        friday = date(2026, 7, 24)
        saturday = date(2026, 7, 25)
        sunday = date(2026, 7, 26)
        price_map = {friday: 300.0}
        for target in [friday, saturday, sunday]:
            result = _pick_price(price_map, target)
            assert result == 300.0, f"{target} → 예상 300.0, 실제 {result}"


# ── latest 쿼리 수정 논리 검증 ────────────────────────────────────────────────

class TestLatestSnapshotLogic:
    """유효 레코드만 latest로 사용하는 로직 검증."""

    def _last_valid(self, snapshots: list) -> Optional[date]:
        """(snapshot_date, total_krw_equiv) 목록에서 유효 레코드의 최신 날짜 반환.
        portfolio.py latest 쿼리의 로직과 동일:
          WHERE total_krw_equiv IS NOT NULL AND total_krw_equiv > 0
        """
        valid = [d for d, v in snapshots if v is not None and v > 0]
        return max(valid) if valid else None

    def test_null_record_excluded(self):
        """null 레코드가 있어도 마지막 유효 날짜(7/24)를 반환."""
        july_24 = date(2026, 7, 24)
        july_25 = date(2026, 7, 25)
        snapshots = [(july_24, 5_000_000.0), (july_25, None)]
        assert self._last_valid(snapshots) == july_24

    def test_zero_record_excluded(self):
        """total_krw_equiv=0 레코드도 제외."""
        july_23 = date(2026, 7, 23)
        july_24 = date(2026, 7, 24)
        snapshots = [(july_23, 4_000_000.0), (july_24, 0.0)]
        assert self._last_valid(snapshots) == july_23

    def test_all_null_treated_as_new_user(self):
        """모든 레코드가 null이면 None 반환 → 신규 유저처럼 처리."""
        snapshots = [(date(2026, 7, 25), None), (date(2026, 7, 26), None)]
        assert self._last_valid(snapshots) is None

    def test_null_does_not_block_earlier_valid(self):
        """null 레코드(7/25)가 있어도 7/24가 start_date 기준이 돼야 함."""
        july_24 = date(2026, 7, 24)
        july_25 = date(2026, 7, 25)
        snapshots = [(july_24, 1_000_000.0), (july_25, None)]
        last_valid = self._last_valid(snapshots)
        # start_date = last_valid + 1 = 7/25 → 7/25가 missing 대상에 포함됨
        start_date = last_valid + timedelta(days=1)
        assert start_date == july_25, "7/25(null 레코드)가 재계산 대상에 포함되어야 함"
