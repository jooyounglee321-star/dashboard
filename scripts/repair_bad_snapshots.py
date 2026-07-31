"""과거 null/0 스냅샷 일괄 수리 스크립트.

실행 방법:
  cd /path/to/dashboard
  python scripts/repair_bad_snapshots.py

주말·공휴일 날짜는 직전 거래일 종가를 그대로 사용하여 재계산한다.
전체 삭제 없이 불량 레코드만 UPSERT로 덮어쓴다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SECRET_KEY", "repair-script-key")

from database import SessionLocal
from models import DailyPortfolioSnapshot, User
from routers.portfolio import backfill_portfolio_snapshots


def repair_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"전체 사용자: {len(users)}명")

        total_repaired = 0
        for user in users:
            # 이 유저의 불량 스냅샷(null 또는 0) 중 가장 이른 날짜 탐색
            bad_rows = (
                db.query(DailyPortfolioSnapshot.snapshot_date)
                .filter(
                    DailyPortfolioSnapshot.user_id == user.id,
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
                print(f"  user={user.id} ({user.email}): 불량 없음, 건너뜀")
                continue

            earliest_bad = bad_rows[0].snapshot_date
            print(f"  user={user.id} ({user.email}): 불량 {len(bad_rows)}건, 최초={earliest_bad} → 재계산 시작")

            result = backfill_portfolio_snapshots(
                user.id, db,
                force_start_date=earliest_bad,
                override_max_days=0,
            )
            repaired = result.get("backfilled", 0)
            total_repaired += repaired
            print(f"    → 수리 완료: {repaired}건 {result.get('dates', [])}")

        print(f"\n전체 수리 완료: {total_repaired}건")

    finally:
        db.close()


if __name__ == "__main__":
    repair_all_users()
