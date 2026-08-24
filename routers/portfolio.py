from __future__ import annotations
"""포트폴리오 데일리 스냅샷 API."""
import json
import logging
import random
import re
import string
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import yfinance as yf
import base64
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import DailyPortfolioSnapshot, DividendHistory, ExchangeRate, PortfolioGroups, Stock, User
from routers.auth import get_current_user
from routers._shared import require_premium_or_admin, resolve_yf_ticker as _backfill_resolve_ticker
from schemas import PortfolioSnapshotCreate, PortfolioSnapshotOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _normalize_date_str(raw) -> str | None:
    """날짜 문자열을 항상 YYYY-MM-DD로 정규화.

    지원 형식:
      YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD  (연도 앞)
      MM/DD/YYYY / MM-DD-YYYY / MM.DD.YYYY  (미국식, 연도 뒤)
    유효하지 않으면 None 반환.
    """
    if not raw:
        return None
    s = str(raw).strip()

    # 연도-월-일 (앞자리가 4자리 연도)
    m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        # 월/일/연도 (미국식, 뒷자리가 4자리 연도)
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
        if m:
            mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            return None

    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


# 카테고리 → (그룹명, 통화)
_CAT_META: dict[str, tuple[str, str]] = {
    "robinhood": ("Robinhood", "USD"),
    "us":        ("US",        "USD"),
    "kor-stock": ("KOR Stock", "KRW"),
    "kor-etf":   ("KOR ETF",   "KRW"),
}



def _get_historical_prices_batch(
    ticker: str, category: str | None, dates: list[date]
) -> dict[date, float]:
    """여러 날짜의 종가를 한 번의 yfinance 호출로 조회.
    주말·공휴일은 해당일 이전의 가장 최근 거래일 종가를 사용.
    """
    if not dates:
        return {}

    yf_ticker = _backfill_resolve_ticker(ticker, category)
    start = min(dates) - timedelta(days=7)  # 주말/공휴일 여유
    end   = max(dates) + timedelta(days=1)

    try:
        hist = yf.Ticker(yf_ticker).history(
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
        )
        # .KS 실패 → .KQ 재시도 (kor-stock)
        if hist.empty and category == "kor-stock" and yf_ticker.endswith(".KS"):
            kq = ticker + ".KQ"
            hist = yf.Ticker(kq).history(
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
            )
        if hist.empty:
            return {}

        # timestamp index → date: close price 매핑
        price_map: dict[date, float] = {}
        for ts, row in hist.iterrows():
            d = ts.date() if hasattr(ts, "date") else ts
            price_map[d] = float(row["Close"])

        sorted_trading = sorted(price_map.keys())

        result: dict[date, float] = {}
        for target in dates:
            # target 이전 가장 최근 거래일
            candidates = [d for d in sorted_trading if d <= target]
            if candidates:
                result[target] = price_map[max(candidates)]

        return result

    except Exception as exc:
        logger.warning("[BACKFILL] %s 배치 시세 조회 실패: %s", ticker, exc)
        return {}


def backfill_portfolio_snapshots(user_id: int, db: Session, force_start_date=None, override_max_days: int | None = None) -> dict:
    """누락된 날짜의 포트폴리오 스냅샷을 해당일 종가로 백필.

    신규 유저 (스냅샷 0건):
      - stocks.created_at 최솟값 날짜부터 오늘(KST) 하루 전까지
      - 최대 365일 제한

    기존 유저 (스냅샷 1건 이상):
      - 마지막 snapshot_date 다음 날부터 오늘(KST) 하루 전까지
      - 최대 30일 제한

    Returns: {"backfilled": N, "dates": [...ISO strings...], "is_new_user": bool}
    """
    today_kst = datetime.now(ZoneInfo("Asia/Seoul")).date()

    # ① 스냅샷 존재 여부 확인 — 유효 데이터(total_krw_equiv > 0)가 있는 마지막 날짜만 참조.
    # null/0 값 레코드를 "최신"으로 잡으면 그 이전 날짜가 재계산 대상에서 영원히 빠지는 버그 방지.
    latest = (
        db.query(DailyPortfolioSnapshot.snapshot_date)
        .filter(
            DailyPortfolioSnapshot.user_id == user_id,
            DailyPortfolioSnapshot.snapshot_date.isnot(None),
            DailyPortfolioSnapshot.total_krw_equiv.isnot(None),
            DailyPortfolioSnapshot.total_krw_equiv > 0,
        )
        .order_by(DailyPortfolioSnapshot.snapshot_date.desc())
        .first()
    )
    is_new_user = latest is None

    if is_new_user:
        # 신규 유저: portfolio_groups.data에 종목이 1개 이상 있어야 백필 진행
        # stocks 테이블이 비어있어도 portfolio_groups에 데이터 있으면 계속 진행
        pg_check = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == user_id).first()
        pg_has_stocks = False
        if pg_check and pg_check.data:
            try:
                pg_check_data = json.loads(pg_check.data)
                pg_has_stocks = any(
                    len(grp.get("stocks") or []) > 0
                    for grp in pg_check_data
                )
            except Exception:
                pg_has_stocks = False

        if not pg_has_stocks:
            return {"backfilled": 0, "dates": [], "is_new_user": True}

        # 시작일: portfolio JSON의 실제 최초 매입일 기준 (가입일 하한선 없음)
        user_row = db.query(User).filter(User.id == user_id).first()
        user_created = user_row.created_at if user_row and user_row.created_at else None
        user_date = (
            (user_created.date() if hasattr(user_created, "date") else user_created)
            if user_created else None
        )

        pg_updated = pg_check.updated_at if pg_check and pg_check.updated_at else None
        pg_date = (
            (pg_updated.date() if hasattr(pg_updated, "date") else pg_updated)
            if pg_updated else None
        )

        if force_start_date:
            # backfill-full 등에서 실제 매입일을 직접 전달한 경우
            start_date = force_start_date
        else:
            # portfolio JSON에서 실제 최초 매입일 추출 (backfill-full과 동일 로직)
            all_purchase_dates = []
            try:
                for g in pg_check_data:
                    for s in g.get("stocks", []):
                        for p in s.get("purchases", []):
                            d = p.get("date")
                            if d:
                                all_purchase_dates.append(d)
            except Exception:
                pass

            if all_purchase_dates:
                start_date = date.fromisoformat(min(all_purchase_dates))
            elif pg_date and user_date:
                start_date = min(pg_date, user_date)
            elif user_date:
                start_date = user_date
            else:
                start_date = today_kst - timedelta(days=365)  # 최후 폴백

            # stocks 테이블은 보조 확인용 (없어도 진행)
            from sqlalchemy import func as sa_func
            oldest_stock = (
                db.query(sa_func.min(Stock.created_at))
                .filter(Stock.user_id == user_id)
                .scalar()
            )
            if oldest_stock is not None:
                stock_date = oldest_stock.date() if hasattr(oldest_stock, "date") else oldest_stock
                start_date = min(start_date, stock_date)

        max_days = 365
    else:
        start_date = latest.snapshot_date + timedelta(days=1)
        max_days = 30

    if override_max_days is not None:
        max_days = override_max_days

    # ② 이미 존재하는 날짜 집합 (범위 내 한 번에 조회, NULL 제외)
    # total_krw_equiv == 0인 날짜는 제외 → 0원짜리 스냅샷은 재계산 대상으로 취급
    existing = {
        r.snapshot_date
        for r in db.query(
            DailyPortfolioSnapshot.snapshot_date,
            DailyPortfolioSnapshot.total_krw_equiv,
        )
        .filter(
            DailyPortfolioSnapshot.user_id == user_id,
            DailyPortfolioSnapshot.snapshot_date.isnot(None),
            DailyPortfolioSnapshot.snapshot_date >= start_date,
            DailyPortfolioSnapshot.snapshot_date < today_kst,
        )
        .all()
        if r.total_krw_equiv and r.total_krw_equiv > 0
    }

    # ③ 누락 날짜 목록 (오늘 제외)
    missing: list[date] = []
    d = start_date
    while d < today_kst:
        if d not in existing:
            missing.append(d)
        d += timedelta(days=1)

    if not missing:
        return {"backfilled": 0, "dates": [], "is_new_user": is_new_user}

    if max_days > 0 and len(missing) > max_days:
        missing = missing[-max_days:]  # 가장 최근 N일만

    # ④ portfolio_groups.data를 1차 소스 — 전량 매도 포함 모든 종목 처리
    pg_row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == user_id).first()
    pg_data: list = []
    if pg_row and pg_row.data:
        try:
            pg_data = json.loads(pg_row.data)
        except Exception:
            pg_data = []

    # 그룹명 → 카테고리 역방향 맵 (기존 _CAT_META 그룹명 하위호환용)
    _name_to_cat = {v[0]: k for k, v in _CAT_META.items()}

    # ticker → {group_id, group_name, purchases, sells, category, currency} 매핑
    # group_id: portfolio_groups의 g.id (genId() 생성 문자열), 없으면 그룹명을 대체 키로 사용
    ticker_history: dict[str, dict] = {}
    for grp in pg_data:
        grp_id   = grp.get("id") or ""
        grp_name = grp.get("name", "")
        currency = grp.get("currency", "USD")
        cat_by_currency = "us" if currency == "USD" else "kor-stock"
        cat = _name_to_cat.get(grp_name, cat_by_currency)
        for st in grp.get("stocks", []):
            if st.get("is_deleted"):  # 소프트 딜리트 종목 제외
                continue
            t = st.get("ticker", "")
            if t:
                ticker_history[t] = {
                    "group_id":   grp_id or grp_name,  # id 없으면 이름을 대체 키로 사용
                    "group_name": grp_name,
                    "purchases":  st.get("purchases") or [],
                    "sells":      st.get("sells")     or [],
                    "category":   cat,
                    "currency":   currency,
                }

    if not ticker_history:
        return {"backfilled": 0, "dates": [], "is_new_user": is_new_user}

    # ── 그룹별 현금 추적 사전 계산 ──
    # group_first_sell_date: 매도일 없으면 None (납입금 없는 그룹용 — 첫 매도일 이후 매수비용만 차감)
    # group_contribs: 납입금 목록 (있을 경우 정확한 현금 잔고 계산에 사용)
    group_first_sell_date: dict[str, str] = {}
    group_contribs: dict[str, list] = {}
    for grp in pg_data:
        gid = grp.get("id") or grp.get("name", "")
        group_contribs[gid] = grp.get("contributions") or []
        for st in grp.get("stocks", []):
            if st.get("is_deleted"):
                continue
            for sv in (st.get("sells") or []):
                d = sv.get("date")
                if d:
                    if gid not in group_first_sell_date or d < group_first_sell_date[gid]:
                        group_first_sell_date[gid] = d

    # ④-b stocks 테이블 — name/avg_price 보완용 (quantity 무관 전체 조회)
    stocks_map: dict[str, "Stock"] = {
        s.ticker: s
        for s in db.query(Stock).filter(Stock.user_id == user_id).all()
    }

    # ⑤ USD/KRW 환율
    fx_row = db.query(ExchangeRate).filter_by(
        base_currency="USD", target_currency="KRW"
    ).first()
    usd_krw = float(fx_row.rate) if fx_row else None

    # ⑥ 티커별 배치 시세 조회 (yfinance 호출 최소화)
    price_cache: dict[str, dict[date, float]] = {}
    for ticker, hist in ticker_history.items():
        key = f"{ticker}_{hist['category']}"
        if key not in price_cache:
            price_cache[key] = _get_historical_prices_batch(ticker, hist["category"], missing)

    backfilled_dates: list[str] = []

    for target_date in missing:
        try:
            groups: dict[str, dict] = {}
            total_realized_pl: float = 0.0  # 이 날짜의 전체 실현 손익 누계

            for ticker, hist in ticker_history.items():
                category   = hist["category"]
                currency   = hist["currency"]
                group_id   = hist["group_id"]
                group_name = hist["group_name"]

                # purchases: date 없으면 항상 포함(하위호환), date 있으면 target_date 이하만
                valid_pp = [
                    p for p in hist["purchases"]
                    if not p.get("date") or p["date"] <= str(target_date)
                ]
                buy_qty = sum(float(p.get("qty", 0)) for p in valid_pp)
                # sells: date 없으면 항상 차감(하위호환), date 있으면 target_date 이하만
                valid_sells = [
                    sv for sv in hist["sells"]
                    if not sv.get("date") or sv["date"] <= str(target_date)
                ]
                sell_qty = sum(float(sv.get("qty", 0)) for sv in valid_sells)
                qty = max(0.0, buy_qty - sell_qty)

                # 날짜 기준 가중평균 매수가 (qty 체크 전에 계산 — realized_pl에도 필요)
                priced = [p for p in valid_pp if (p.get("price") or 0) > 0]
                ws  = sum(float(p["price"]) * float(p.get("qty", 0)) for p in priced)
                vqt = sum(float(p.get("qty", 0)) for p in priced)
                s_row = stocks_map.get(ticker)
                avg = (
                    round(ws / vqt, 4) if vqt > 0
                    else (float(s_row.avg_price) if s_row and s_row.avg_price else None)
                )

                # 실현 손익: target_date 이전 매도 기준 (전량 매도 종목도 포함)
                # avg is not None 체크 — avg=0.0 이어도 계산 수행 (if avg: 는 0.0을 False로 평가)
                ticker_real_pl = 0.0
                if avg is not None:
                    ticker_real_pl = sum(
                        (float(sv.get("price", 0)) - avg) * float(sv.get("qty", 0))
                        for sv in valid_sells
                    )
                total_realized_pl = round(total_realized_pl + ticker_real_pl, 2)

                if qty <= 0:
                    continue  # 해당 날짜에 보유 없음 → 평가액 그룹에서 제외

                key = f"{ticker}_{category}"
                price = price_cache.get(key, {}).get(target_date)
                if price is None:
                    price = avg  # 시세 없으면 avg_price 폴백
                if price is None:
                    continue

                eval_amt = round(qty * price, 2)

                if group_id not in groups:
                    groups[group_id] = {
                        "name":     group_name,
                        "currency": currency,
                        "total":    0.0,
                    }
                groups[group_id]["total"] = round(
                    groups[group_id]["total"] + eval_amt, 2
                )

            # ── 그룹별 현금 잔고 계산 → 매도 후 차트 급락 방지 ──
            # 납입금 있는 그룹: 그룹 내 전체 매수/매도를 합산해 1회 계산 (티커별 반복 시 납입금 중복 집계 방지)
            # 납입금 없는 그룹: 티커별 (매도수익 - 첫매도일 이후 재매수비용) 합산
            group_cash: dict[str, float] = {}
            td_str = str(target_date)

            # 납입금 있는 그룹: 그룹별 총 매수비용·매도수익 사전 집계
            group_total_buys: dict[str, float] = {}
            group_total_sells: dict[str, float] = {}
            for ticker, hist in ticker_history.items():
                gid = hist["group_id"]
                if not group_contribs.get(gid):
                    continue
                buy_cost = sum(
                    float(p.get("price", 0)) * float(p.get("qty", 0))
                    for p in hist["purchases"]
                    if not p.get("date") or p["date"] <= td_str
                )
                sell_proc = sum(
                    float(sv.get("price", 0)) * float(sv.get("qty", 0))
                    for sv in hist["sells"]
                    if sv.get("date") and sv["date"] <= td_str
                )
                group_total_buys[gid]  = group_total_buys.get(gid, 0.0)  + buy_cost
                group_total_sells[gid] = group_total_sells.get(gid, 0.0) + sell_proc

            # 납입금 있는 그룹: 그룹 단위로 1회 현금 계산
            for gid, contribs in group_contribs.items():
                if not contribs:
                    continue
                contrib_total = sum(
                    float(c.get("amount", 0))
                    for c in contribs
                    if not c.get("date") or c["date"] <= td_str
                )
                cash = contrib_total - group_total_buys.get(gid, 0.0) + group_total_sells.get(gid, 0.0)
                group_cash[gid] = round(cash, 2)

            # 납입금 없는 그룹: 티커별 매도→재매수 현금 계산 (기존 로직)
            for ticker, hist in ticker_history.items():
                gid        = hist["group_id"]
                if group_contribs.get(gid):
                    continue  # 납입금 있는 그룹은 이미 처리됨
                first_sell = group_first_sell_date.get(gid)
                sell_proceeds = sum(
                    float(sv.get("price", 0)) * float(sv.get("qty", 0))
                    for sv in hist["sells"]
                    if sv.get("date") and sv["date"] <= td_str
                )
                if first_sell and sell_proceeds > 0:
                    buy_after = sum(
                        float(p.get("price", 0)) * float(p.get("qty", 0))
                        for p in hist["purchases"]
                        if p.get("date") and first_sell <= p["date"] <= td_str
                    )
                    cash = sell_proceeds - buy_after
                    group_cash[gid] = round(group_cash.get(gid, 0.0) + cash, 2)

            for gid, cash in group_cash.items():
                if cash <= 0:
                    continue
                if gid in groups:
                    groups[gid]["total"] = round(groups[gid]["total"] + cash, 2)
                else:
                    # 전량 매도 후 현금만 남은 그룹
                    g_name = next((h["group_name"] for h in ticker_history.values() if h["group_id"] == gid), gid)
                    g_cur  = next((h["currency"]   for h in ticker_history.values() if h["group_id"] == gid), "USD")
                    groups[gid] = {"name": g_name, "currency": g_cur, "total": round(cash, 2)}

            # 보유 종목 없어도 realized_pl이나 현금이 있으면 빈 스냅샷 저장
            # (전량 매도 완료일 이후 날짜가 차트에서 공백으로 빠지는 버그 방지)
            if not groups and total_realized_pl == 0.0:
                continue

            groups_vals = list(groups.values())
            total_usd = sum(g["total"] for g in groups_vals if g["currency"] == "USD")
            total_krw = sum(g["total"] for g in groups_vals if g["currency"] == "KRW")
            if usd_krw:
                total_krw_equiv = round(total_usd * usd_krw + total_krw, 2)
            elif total_usd == 0:
                total_krw_equiv = round(total_krw, 2)
            else:
                total_krw_equiv = None
            data_json = json.dumps({
                "groups":      {gid: {"total": g["total"], "currency": g["currency"]} for gid, g in groups.items()},
                "group_names": {gid: g["name"] for gid, g in groups.items()},
            }, ensure_ascii=False)

            # 유효성 검사: 실제 0원이면 건너뜀 (포트폴리오 없는 날)
            if total_krw_equiv is not None and total_krw_equiv == 0:
                logger.info("[BACKFILL] user=%d %s total_krw_equiv=0, 저장 건너뜀", user_id, target_date)
                continue
            # USD 보유 종목이 있는데 환율이 없으면 null 레코드가 생성되어 '—' 버그 발생.
            # 이 경우 저장을 보류하고 다음 backfill 때 환율이 복구되면 정상 저장.
            if total_krw_equiv is None and total_usd > 0:
                logger.warning("[BACKFILL] user=%d %s 환율 미조회(USD 보유), 저장 보류", user_id, target_date)
                continue

            # UPSERT
            row = db.query(DailyPortfolioSnapshot).filter(
                DailyPortfolioSnapshot.user_id == user_id,
                DailyPortfolioSnapshot.snapshot_date == target_date,
            ).first()

            if row:
                row.usd_krw         = usd_krw
                row.total_usd       = round(total_usd, 2)
                row.total_krw       = round(total_krw, 2)
                row.total_krw_equiv = total_krw_equiv
                row.realized_pl     = total_realized_pl
                row.data            = data_json
                row.saved_by        = "backfill"
            else:
                row = DailyPortfolioSnapshot(
                    user_id         = user_id,
                    snapshot_date   = target_date,
                    usd_krw         = usd_krw,
                    total_usd       = round(total_usd, 2),
                    total_krw       = round(total_krw, 2),
                    total_krw_equiv = total_krw_equiv,
                    realized_pl     = total_realized_pl,
                    data            = data_json,
                    saved_by        = "backfill",
                )
                db.add(row)

            backfilled_dates.append(str(target_date))

        except Exception as exc:
            logger.error("[BACKFILL] user=%d %s 처리 오류: %s", user_id, target_date, exc)
            continue

    if backfilled_dates:
        try:
            db.commit()
            logger.info("[BACKFILL] user=%d %d개 스냅샷 일괄 저장 완료", user_id, len(backfilled_dates))
        except Exception as exc:
            logger.error("[BACKFILL] user=%d 일괄 커밋 실패: %s", user_id, exc)
            db.rollback()
            backfilled_dates.clear()

    return {"backfilled": len(backfilled_dates), "dates": backfilled_dates, "is_new_user": is_new_user}


# ── POST /api/portfolio/backfill ────────────────────────────────────────────
@router.post("/backfill")
def run_backfill(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """로그인 시 누락된 날짜의 포트폴리오 스냅샷을 자동 백필.
    프런트엔드에서 fire-and-forget으로 호출.
    """
    result = backfill_portfolio_snapshots(current_user.id, db)
    logger.info("[BACKFILL] user=%d 완료: %s", current_user.id, result)
    return result


# ── POST /api/portfolio/backfill-full ──────────────────────────────────────────
@router.post("/backfill-full")
def run_full_backfill(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기존 스냅샷 전체 삭제 후 최초 매입일부터 재백필.
    유저가 수동으로 히스토리 초기화 시 사용.
    """
    user_id = current_user.id

    # 기존 스냅샷 전부 삭제
    deleted = db.query(DailyPortfolioSnapshot).filter(
        DailyPortfolioSnapshot.user_id == user_id
    ).delete()
    db.commit()
    logger.info("[FULL BACKFILL] user=%d 기존 스냅샷 %d건 삭제", user_id, deleted)

    # 최초 매입일을 찾아 start_date 직접 설정
    pg_row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == user_id).first()
    earliest_purchase_date = None
    if pg_row and pg_row.data:
        try:
            from datetime import date as _date
            pg_data = json.loads(pg_row.data)
            all_dates = []
            for grp in pg_data:
                for st in grp.get("stocks", []):
                    for p in st.get("purchases", []):
                        d = p.get("date")
                        if d:
                            try:
                                all_dates.append(_date.fromisoformat(str(d)))
                            except Exception:
                                pass
            if all_dates:
                earliest_purchase_date = min(all_dates)
        except Exception:
            pass

    # 전체 재계산: 날짜 제한 없이 최초 매입일부터 전부 계산 (override_max_days=0)
    result = backfill_portfolio_snapshots(user_id, db, force_start_date=earliest_purchase_date, override_max_days=0)

    result["deleted"] = deleted
    result["earliest_purchase_date"] = str(earliest_purchase_date) if earliest_purchase_date else None
    logger.info("[FULL BACKFILL] user=%d 완료: %s", user_id, result)
    return result


# ── POST /api/portfolio/repair ──────────────────────────────────────────────
@router.post("/repair")
def repair_bad_snapshots(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """null/0 값으로 저장된 불량 스냅샷을 찾아 재계산.
    전체 삭제 없이 불량 레코드만 덮어씀. 주말·공휴일은 직전 거래일 종가 사용.
    """
    user_id = current_user.id

    # 불량 스냅샷(total_krw_equiv가 null 또는 0)의 가장 이른 날짜 탐색
    bad_rows = (
        db.query(DailyPortfolioSnapshot.snapshot_date)
        .filter(
            DailyPortfolioSnapshot.user_id == user_id,
            DailyPortfolioSnapshot.snapshot_date.isnot(None),
            (
                DailyPortfolioSnapshot.total_krw_equiv.is_(None) |
                (DailyPortfolioSnapshot.total_krw_equiv == 0)
            ),
        )
        .order_by(DailyPortfolioSnapshot.snapshot_date.asc())
        .all()
    )

    if not bad_rows:
        return {"repaired": 0, "message": "불량 스냅샷 없음"}

    earliest_bad = bad_rows[0].snapshot_date
    logger.info("[REPAIR] user=%d 불량 스냅샷 %d건, 최초=%s", user_id, len(bad_rows), earliest_bad)

    # 최초 불량 날짜부터 날짜 제한 없이 재계산 (UPSERT이므로 기존 데이터 안전)
    result = backfill_portfolio_snapshots(
        user_id, db,
        force_start_date=earliest_bad,
        override_max_days=0,
    )
    result["bad_count"] = len(bad_rows)
    result["earliest_bad"] = str(earliest_bad)
    logger.info("[REPAIR] user=%d 완료: %s", user_id, result)
    return result


# ── GET /api/portfolio/groups ────────────────────────────────────────────────
@router.get("/groups")
def get_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 포트폴리오 그룹 전체 조회 (localStorage 미러)."""
    row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    if not row:
        return {"data": []}
    try:
        return {"data": json.loads(row.data)}
    except Exception:
        return {"data": []}


# ── POST /api/portfolio/groups ───────────────────────────────────────────────
@router.post("/groups")
def save_groups(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 포트폴리오 그룹 전체 저장 (user_id 단일 행 UPSERT).

    body: { "data": [...groups array...] }
    그룹 이름 변경 시 daily_portfolio_snapshot.data.group_names도 일괄 동기화.
    """
    groups = body.get("data", [])

    # id 없는 그룹·종목에 자동 생성 (UI 외부에서 직접 삽입된 데이터 방어)
    def _gen_id() -> str:
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))

    for g in groups:
        if not g.get("id"):
            g["id"] = _gen_id()
        for s in g.get("stocks", []):
            if not s.get("id"):
                s["id"] = _gen_id()
            for r in s.get("purchases", []):
                if not r.get("id"):
                    r["id"] = _gen_id()
            for r in s.get("sells", []):
                if not r.get("id"):
                    r["id"] = _gen_id()

    # 이름 변경된 그룹 감지
    renamed: dict[str, str] = {}  # group_id → new_name
    row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    if row and row.data:
        try:
            old_by_id = {g.get("id", ""): g.get("name", "") for g in json.loads(row.data)}
            for g in groups:
                gid = g.get("id", "")
                new_name = g.get("name", "")
                old_name = old_by_id.get(gid, "")
                if gid and old_name and new_name != old_name:
                    renamed[gid] = new_name
        except Exception:
            pass

    data_json = json.dumps(groups, ensure_ascii=False)
    if row:
        row.data = data_json
    else:
        row = PortfolioGroups(user_id=current_user.id, data=data_json)
        db.add(row)

    # 이름 변경된 그룹의 group_names를 스냅샷에도 반영
    if renamed:
        snapshots = db.query(DailyPortfolioSnapshot).filter(
            DailyPortfolioSnapshot.user_id == current_user.id,
            DailyPortfolioSnapshot.data.isnot(None),
        ).all()
        for snap in snapshots:
            try:
                parsed = json.loads(snap.data)
                if not isinstance(parsed, dict) or "group_names" not in parsed:
                    continue
                changed = False
                for gid, new_name in renamed.items():
                    if parsed["group_names"].get(gid) != new_name:
                        parsed["group_names"][gid] = new_name
                        changed = True
                if changed:
                    snap.data = json.dumps(parsed, ensure_ascii=False)
            except Exception:
                pass
        logger.info("[PORTFOLIO GROUPS] 이름 변경 스냅샷 동기화 (user=%d, %d개 그룹)", current_user.id, len(renamed))

    db.commit()
    logger.info("[PORTFOLIO GROUPS] 저장 완료 (user=%d, 그룹 수: %d)", current_user.id, len(groups))
    return {"ok": True, "groups": len(groups)}


# ── POST /api/portfolio/snapshot ────────────────────────────────────────────
@router.post("/snapshot", response_model=PortfolioSnapshotOut)
def save_snapshot(
    body: PortfolioSnapshotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """프런트엔드가 전송하는 데일리 포트폴리오 스냅샷을 저장(user_id+날짜별 UPSERT)."""
    data_json = json.dumps({
        "groups":      {(g.id or g.name): {"total": g.total, "currency": g.currency} for g in body.groups},
        "group_names": {(g.id or g.name): g.name for g in body.groups},
    }, ensure_ascii=False)
    row = db.query(DailyPortfolioSnapshot).filter(
        DailyPortfolioSnapshot.user_id == current_user.id,
        DailyPortfolioSnapshot.snapshot_date == body.snapshot_date,
    ).first()

    if row:
        # 이미 당일 스냅샷 존재 → 업데이트
        row.usd_krw        = body.usd_krw
        row.total_usd      = body.total_usd
        row.total_krw      = body.total_krw
        row.total_krw_equiv = body.total_krw_equiv
        row.data           = data_json
        row.saved_by       = "frontend"
        logger.info("[SNAPSHOT] %s 업데이트 완료 (user=%d)", body.snapshot_date, current_user.id)
    else:
        row = DailyPortfolioSnapshot(
            user_id         = current_user.id,
            snapshot_date   = body.snapshot_date,
            usd_krw         = body.usd_krw,
            total_usd       = body.total_usd,
            total_krw       = body.total_krw,
            total_krw_equiv = body.total_krw_equiv,
            data            = data_json,
            saved_by        = "frontend",
        )
        db.add(row)
        logger.info("[SNAPSHOT] %s 신규 저장 완료 (user=%d)", body.snapshot_date, current_user.id)

    db.commit()
    db.refresh(row)
    return row


# ── GET /api/portfolio/history ───────────────────────────────────────────────
@router.get("/history", response_model=list[PortfolioSnapshotOut])
def get_history(
    days: int       = Query(365, ge=1, le=3650),
    db: Session     = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 스냅샷 목록 (최신순). days로 조회 기간 제한, 기본 365일."""
    cutoff = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyPortfolioSnapshot)
        .filter(
            DailyPortfolioSnapshot.user_id == current_user.id,
            DailyPortfolioSnapshot.snapshot_date >= cutoff,
        )
        .order_by(DailyPortfolioSnapshot.snapshot_date.desc())
        .all()
    )
    return rows


# ── GET /api/portfolio/history/{date} ───────────────────────────────────────
@router.get("/period-pl")
def get_period_pl(
    from_date: date = Query(..., alias="from"),
    db: Session     = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기간 시작일 종가 기준 보유 종목별 시장손익 반환.
    P&L = (현재가 - from_date 종가) × 보유수량
    """
    pg = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    if not pg or not pg.data:
        return []

    raw = json.loads(pg.data) if isinstance(pg.data, str) else pg.data
    groups = raw if isinstance(raw, list) else [raw]

    # 보유 종목 수집
    holdings: list[dict] = []
    for g in groups:
        currency = g.get("currency", "USD")
        category = g.get("category")
        for s in g.get("stocks", []):
            if s.get("is_deleted"):
                continue
            purchases = s.get("purchases", [])
            sells     = s.get("sells", [])
            total_buy = sum(p.get("qty", 0) for p in purchases)
            total_sell= sum(p.get("qty", 0) for p in sells)
            total_hq  = max(0.0, total_buy - total_sell)
            if total_hq <= 0:
                continue
            all_valid = [p for p in purchases if (p.get("price") or 0) > 0 and (p.get("qty") or 0) > 0]
            ws  = sum(p["price"] * p["qty"] for p in all_valid)
            vqt = sum(p["qty"] for p in all_valid)
            holdings.append({
                "ticker":   s.get("ticker", ""),
                "name":     s.get("name") or s.get("ticker", ""),
                "qty":      total_hq,
                "avg_cost": ws / vqt if vqt > 0 else 0,
                "currency": currency,
                "category": category,
                "group":    g.get("name", ""),
            })

    if not holdings:
        return []

    # 현재가 조회 (fast_info)
    from routers.stocks import _fetch_price
    import concurrent.futures, time

    def fetch_current(h):
        try:
            result = _fetch_price(h["ticker"], h.get("category"))
            return h["ticker"], result.get("current_price")
        except Exception:
            return h["ticker"], None

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        cur_results = dict(ex.map(fetch_current, holdings))

    # 기간 시작가 조회 (yfinance history)
    unique_tickers = list({h["ticker"] for h in holdings})
    start_prices: dict[str, float] = {}
    for ticker in unique_tickers:
        cat = next((h.get("category") for h in holdings if h["ticker"] == ticker), None)
        pm = _get_historical_prices_batch(ticker, cat, [from_date])
        if pm:
            start_prices[ticker] = list(pm.values())[0]

    result_list = []
    for h in holdings:
        ticker = h["ticker"]
        cur = cur_results.get(ticker)
        start = start_prices.get(ticker)
        if cur is None or start is None or start == 0:
            continue
        pl = (cur - start) * h["qty"]
        pl_pct = (cur - start) / start * 100
        result_list.append({
            "ticker":     ticker,
            "name":       h["name"],
            "group":      h["group"],
            "qty":        h["qty"],
            "avg_cost":   h["avg_cost"],
            "price_start":start,
            "price_now":  cur,
            "pl":         pl,
            "pl_pct":     pl_pct,
            "currency":   h["currency"],
        })

    result_list.sort(key=lambda x: x["pl"], reverse=True)
    return result_list


@router.get("/benchmark")
def get_benchmark(
    tickers: str = Query("SPY,QQQ"),
    from_date: str = Query(None, alias="from"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """벤치마크 지수 시세 조회 (yfinance). 시작점=100 정규화."""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    start = from_date or (date.today() - timedelta(days=365)).isoformat()

    result: dict = {}
    for ticker in ticker_list:
        try:
            hist = yf.Ticker(ticker).history(start=start, end=date.today().isoformat())
            if hist.empty:
                continue
            closes = []
            dates_out = []
            for ts, row in hist.iterrows():
                d = ts.date() if hasattr(ts, "date") else ts
                dates_out.append(d.isoformat())
                closes.append(round(float(row["Close"]), 4))
            if not closes:
                continue
            base = closes[0]
            normalized = [round(c / base * 100, 4) for c in closes] if base else closes
            result[ticker] = {"dates": dates_out, "closes": closes, "normalized": normalized}
        except Exception as exc:
            logger.warning("[BENCHMARK] %s 조회 실패: %s", ticker, exc)

    return result


@router.get("/realized-pl")
def get_realized_pl(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """실현 손익 내역. 취득단가 = 종목 전체 매입의 가중평균 (단순 AVCO)."""
    pg = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    if not pg or not pg.data:
        return {"total": 0, "items": []}

    raw = json.loads(pg.data) if isinstance(pg.data, str) else pg.data
    groups = raw if isinstance(raw, list) else [raw]

    items = []
    total_pl = 0.0

    for g in groups:
        currency = g.get("currency", "USD")
        group_name = g.get("name", "")
        for s in g.get("stocks", []):
            ticker = s.get("ticker", "")
            sells = s.get("sells", []) or []
            if not sells:
                continue
            purchases = s.get("purchases", []) or []
            # 전체 가중평균 단가
            all_valid = [p for p in purchases if (p.get("price") or 0) > 0 and (p.get("qty") or 0) > 0]
            ws = sum(p["price"] * p["qty"] for p in all_valid)
            vqt = sum(p["qty"] for p in all_valid)
            avg_cost = ws / vqt if vqt > 0 else 0

            for sell in sells:
                sell_date = sell.get("date", "")
                sell_qty = sell.get("qty", 0) or 0
                sell_price = sell.get("price", 0) or 0
                if sell_qty <= 0 or avg_cost <= 0:
                    continue
                pl = (sell_price - avg_cost) * sell_qty
                pl_pct = (sell_price - avg_cost) / avg_cost * 100
                total_pl += pl
                items.append({
                    "ticker": ticker,
                    "group": group_name,
                    "date": sell_date,
                    "qty": sell_qty,
                    "sell_price": sell_price,
                    "avg_cost": round(avg_cost, 4),
                    "pl": round(pl, 4),
                    "pl_pct": round(pl_pct, 2),
                    "currency": currency,
                })

    items.sort(key=lambda x: x["date"] or "", reverse=True)
    return {"total": round(total_pl, 4), "items": items}


@router.get("/history/{snapshot_date}", response_model=PortfolioSnapshotOut)
def get_history_by_date(
    snapshot_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 특정 날짜 스냅샷 조회."""
    row = db.query(DailyPortfolioSnapshot).filter(
        DailyPortfolioSnapshot.user_id == current_user.id,
        DailyPortfolioSnapshot.snapshot_date == snapshot_date,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"{snapshot_date} 스냅샷 없음")
    return row


# ── POST /api/portfolio/parse-transactions ───────────────────────────────────
@router.post("/parse-transactions")
async def parse_transactions_from_images(
    group_id: str = Form(...),
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_premium_or_admin),
):
    """AI(Claude Vision)로 매매 캡처 이미지를 파싱해 신규 거래 내역만 반환.

    중복 판정: ticker + date + type + qty + price 5개 필드 전부 일치 시 중복으로 간주.
    신규 종목(그룹에 없는 ticker)은 별도 플래그 new_stock=True로 표시.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    # 현재 유저의 포트폴리오 로드
    pg_row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    pg_data: list = []
    if pg_row and pg_row.data:
        try:
            pg_data = json.loads(pg_row.data)
        except Exception:
            pg_data = []

    # 대상 그룹 찾기
    target_group = next((g for g in pg_data if g.get("id") == group_id), None)
    if target_group is None:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")

    # 기존 거래 내역을 중복 체크용 집합으로 변환
    # key: (ticker_upper, date_str, type_str, qty_float, price_float)
    existing_keys: set[tuple] = set()
    existing_tickers: set[str] = set()
    for st in target_group.get("stocks", []):
        if st.get("is_deleted"):
            continue
        ticker_up = (st.get("ticker") or "").upper()
        existing_tickers.add(ticker_up)
        for p in st.get("purchases") or []:
            existing_keys.add((
                ticker_up, str(p.get("date") or ""), "buy",
                float(p.get("qty") or 0), float(p.get("price") or 0),
            ))
        for s in st.get("sells") or []:
            existing_keys.add((
                ticker_up, str(s.get("date") or ""), "sell",
                float(s.get("qty") or 0), float(s.get("price") or 0),
            ))

    PROMPT = (
        "이 이미지는 주식 매매 내역 캡처입니다. 모든 매매 내역을 JSON 배열로만 출력해주세요.\n"
        "각 항목 형식: {\"ticker\": \"종목코드\", \"name\": \"종목명\", \"type\": \"buy\" 또는 \"sell\", "
        "\"date\": \"YYYY-MM-DD\", \"qty\": 숫자, \"price\": 숫자}\n"
        "규칙:\n"
        "- ticker: 티커 심볼 대문자. 한국 주식이면 6자리숫자.KS 형태(예: 005930.KS)\n"
        "- date: 반드시 YYYY-MM-DD 형식으로 변환해서 출력. "
        "이미지에 MM/DD/YYYY, MM-DD-YYYY, YYYY.MM.DD 등 다른 형식으로 표기돼 있어도 "
        "YYYY-MM-DD로 변환할 것. 날짜를 알 수 없으면 null\n"
        "- qty: 수량(소수 가능). 알 수 없으면 null\n"
        "- price: 단가(소수 가능). 알 수 없으면 null\n"
        "- type: 매입/매수이면 \"buy\", 매도이면 \"sell\"\n"
        "JSON 배열만 출력. 다른 텍스트, 마크다운 코드블록 금지."
    )

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=api_key)

    all_parsed: list[dict] = []
    parse_errors: list[str] = []

    ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/gif", "image/webp"}

    for img in images:
        media_type = img.content_type or "image/jpeg"
        if media_type not in ALLOWED_MEDIA:
            parse_errors.append(f"{img.filename}: 지원하지 않는 형식 ({media_type})")
            continue
        try:
            raw = await img.read()
            b64 = base64.standard_b64encode(raw).decode("utf-8")
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
            )
            text = response.content[0].text.strip()
            # JSON 배열 추출 (코드블록 래핑 방어)
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            parsed = json.loads(text)
            if isinstance(parsed, list):
                all_parsed.extend(parsed)
        except json.JSONDecodeError:
            parse_errors.append(f"{img.filename}: AI 응답 파싱 실패")
        except Exception as exc:
            parse_errors.append(f"{img.filename}: {str(exc)[:120]}")

    # 중복 제거 + 신규 종목 플래그
    new_transactions: list[dict] = []
    skipped = 0
    seen_in_batch: set[tuple] = set()  # 이번 업로드 내 중복 방지

    for tx in all_parsed:
        ticker = (tx.get("ticker") or "").upper().strip()
        if not ticker:
            continue
        tx_type = (tx.get("type") or "buy").lower()
        date_str = _normalize_date_str(tx.get("date")) or ""
        qty = float(tx.get("qty") or 0)
        price = float(tx.get("price") or 0)

        key = (ticker, date_str, tx_type, qty, price)
        if key in existing_keys or key in seen_in_batch:
            skipped += 1
            continue

        seen_in_batch.add(key)
        new_transactions.append({
            "ticker": ticker,
            "name": tx.get("name") or "",
            "type": tx_type,
            "date": date_str or None,
            "qty": qty,
            "price": price,
            "new_stock": ticker not in existing_tickers,
        })

    logger.info(
        "[PARSE-TX] user=%d group=%s 이미지=%d건, 신규=%d건, 중복=%d건, 오류=%d건",
        current_user.id, group_id, len(images), len(new_transactions), skipped, len(parse_errors),
    )

    return {
        "new_transactions": new_transactions,
        "skipped_count": skipped,
        "parse_errors": parse_errors,
    }


# ── GET /api/portfolio/dividends ─────────────────────────────────────────────
@router.get("/dividends")
def get_dividends(
    from_date: str = Query(None, alias="from"),
    to_date:   str = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """배당금 내역 조회. from/to(YYYY-MM-DD)로 기간 필터."""
    q = db.query(DividendHistory).filter(DividendHistory.user_id == current_user.id)
    if from_date:
        q = q.filter(DividendHistory.date >= from_date)
    if to_date:
        q = q.filter(DividendHistory.date <= to_date)
    rows = q.order_by(DividendHistory.date).all()
    return [
        {"id": r.id, "date": str(r.date), "ticker": r.ticker,
         "amount": float(r.amount), "currency": r.currency}
        for r in rows
    ]


# ── POST /api/portfolio/dividends ────────────────────────────────────────────
@router.post("/dividends")
def add_dividend(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """배당금 단건 추가."""
    row = DividendHistory(
        user_id  = current_user.id,
        date     = body["date"],
        ticker   = body["ticker"].upper(),
        amount   = body["amount"],
        currency = body.get("currency", "USD"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "date": str(row.date), "ticker": row.ticker,
            "amount": float(row.amount), "currency": row.currency}


# ── DELETE /api/portfolio/dividends/{id} ─────────────────────────────────────
@router.delete("/dividends/{div_id}")
def delete_dividend(
    div_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """배당금 단건 삭제."""
    row = db.query(DividendHistory).filter(
        DividendHistory.id == div_id,
        DividendHistory.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="배당 내역 없음")
    db.delete(row)
    db.commit()
    return {"deleted": div_id}
