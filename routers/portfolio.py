"""포트폴리오 데일리 스냅샷 API."""
import json
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DailyPortfolioSnapshot, ExchangeRate, PortfolioGroups, Stock, User
from routers.auth import get_current_user
from schemas import PortfolioSnapshotCreate, PortfolioSnapshotOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

# 카테고리 → (그룹명, 통화)
_CAT_META: dict[str, tuple[str, str]] = {
    "robinhood": ("Robinhood", "USD"),
    "us":        ("US",        "USD"),
    "kor-stock": ("KOR Stock", "KRW"),
    "kor-etf":   ("KOR ETF",   "KRW"),
}


def _backfill_resolve_ticker(ticker: str, category: str | None) -> str:
    """백필용 Yahoo Finance 티커 변환 (.KS 자동 추가)."""
    if category in ("kor-stock", "kor-etf") and "." not in ticker:
        return ticker + ".KS"
    return ticker


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


def backfill_portfolio_snapshots(user_id: int, db: Session) -> dict:
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

    # ① 스냅샷 존재 여부 확인
    latest = (
        db.query(DailyPortfolioSnapshot.snapshot_date)
        .filter(DailyPortfolioSnapshot.user_id == user_id)
        .order_by(DailyPortfolioSnapshot.snapshot_date.desc())
        .first()
    )
    is_new_user = latest is None

    if is_new_user:
        # 신규 유저: MAX(최초 종목 등록일, 회원가입일) — 가입 전 이력은 결산 대상 제외
        from sqlalchemy import func as sa_func
        oldest_stock = (
            db.query(sa_func.min(Stock.created_at))
            .filter(Stock.user_id == user_id)
            .scalar()
        )
        if oldest_stock is None:
            return {"backfilled": 0, "dates": [], "is_new_user": True}
        user_row = db.query(User).filter(User.id == user_id).first()
        user_created = user_row.created_at if user_row and user_row.created_at else None

        stock_date = oldest_stock.date() if hasattr(oldest_stock, "date") else oldest_stock
        if user_created:
            user_date = user_created.date() if hasattr(user_created, "date") else user_created
            start_date = max(stock_date, user_date)
        else:
            start_date = stock_date
        max_days = 365
    else:
        start_date = latest.snapshot_date + timedelta(days=1)
        max_days = 30

    # ② 이미 존재하는 날짜 집합 (범위 내 한 번에 조회)
    existing = {
        r.snapshot_date
        for r in db.query(DailyPortfolioSnapshot.snapshot_date)
        .filter(
            DailyPortfolioSnapshot.user_id == user_id,
            DailyPortfolioSnapshot.snapshot_date >= start_date,
            DailyPortfolioSnapshot.snapshot_date < today_kst,
        )
        .all()
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

    if len(missing) > max_days:
        missing = missing[-max_days:]  # 가장 최근 N일만

    # ④ portfolio_groups.data를 1차 소스 — 전량 매도 포함 모든 종목 처리
    pg_row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == user_id).first()
    pg_data: list = []
    if pg_row and pg_row.data:
        try:
            pg_data = json.loads(pg_row.data)
        except Exception:
            pg_data = []

    # 그룹명 → 카테고리 역방향 맵 (portfolio_groups.name → _CAT_META 키)
    _name_to_cat = {v[0]: k for k, v in _CAT_META.items()}

    # ticker → {purchases, sells, category, currency} 매핑
    ticker_history: dict[str, dict] = {}
    for grp in pg_data:
        grp_name = grp.get("name", "")
        currency = grp.get("currency", "USD")
        cat = _name_to_cat.get(grp_name, "us" if currency == "USD" else "kor-stock")
        for st in grp.get("stocks", []):
            t = st.get("ticker", "")
            if t:
                ticker_history[t] = {
                    "purchases": st.get("purchases") or [],
                    "sells":     st.get("sells")     or [],
                    "category":  cat,
                    "currency":  currency,
                }

    if not ticker_history:
        return {"backfilled": 0, "dates": [], "is_new_user": is_new_user}

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
                category = hist["category"]
                currency = hist["currency"]

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

                meta = _CAT_META.get(category)
                if not meta:
                    continue
                grp_name, _ = meta

                eval_amt = round(qty * price, 2)
                eval_pl  = round((price - avg) * qty, 2) if avg else None

                if category not in groups:
                    groups[category] = {
                        "name":     grp_name,
                        "currency": currency,
                        "total":    0.0,
                        "stocks":   [],
                    }
                groups[category]["stocks"].append({
                    "ticker":        ticker,
                    "name":          s_row.name if s_row else ticker,
                    "current_price": price,
                    "hold_qty":      qty,
                    "eval_amount":   eval_amt,
                    "avg_buy_price": avg,
                    "eval_pl":       eval_pl,
                    "realized_pl":   round(ticker_real_pl, 2),
                })
                groups[category]["total"] = round(
                    groups[category]["total"] + eval_amt, 2
                )

            # 보유 종목 없어도 realized_pl이 있으면 빈 스냅샷 저장
            # (전량 매도 완료일 이후 날짜가 차트에서 공백으로 빠지는 버그 방지)
            if not groups and total_realized_pl == 0.0:
                continue

            groups_list = list(groups.values())
            total_usd = sum(g["total"] for g in groups_list if g["currency"] == "USD")
            total_krw = sum(g["total"] for g in groups_list if g["currency"] == "KRW")
            total_krw_equiv = (
                round(total_usd * usd_krw + total_krw, 2) if usd_krw else None
            )
            data_json = json.dumps(groups_list, ensure_ascii=False)

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

            db.commit()
            backfilled_dates.append(str(target_date))
            logger.info("[BACKFILL] user=%d %s 스냅샷 저장 완료", user_id, target_date)

        except Exception as exc:
            logger.error("[BACKFILL] user=%d %s 처리 오류: %s", user_id, target_date, exc)
            db.rollback()
            continue

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
    """
    groups = body.get("data", [])
    data_json = json.dumps(groups, ensure_ascii=False)

    row = db.query(PortfolioGroups).filter(PortfolioGroups.user_id == current_user.id).first()
    if row:
        row.data = data_json
    else:
        row = PortfolioGroups(user_id=current_user.id, data=data_json)
        db.add(row)

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
    data_json = json.dumps(
        [g.model_dump() for g in body.groups],
        ensure_ascii=False,
    )
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 전체 스냅샷 목록 (최신순)."""
    rows = (
        db.query(DailyPortfolioSnapshot)
        .filter(DailyPortfolioSnapshot.user_id == current_user.id)
        .order_by(DailyPortfolioSnapshot.snapshot_date.desc())
        .all()
    )
    return rows


# ── GET /api/portfolio/history/{date} ───────────────────────────────────────
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
