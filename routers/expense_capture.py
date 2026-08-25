from __future__ import annotations
"""가계부 AI 캡처 — POST /api/expense/parse-transactions

은행/카드 명세서 이미지를 Claude Vision으로 파싱해 신규 내역만 반환.
중복 판정: date + amount + currency + description + type 전부 일치.
카테고리는 이름→id 느슨한 매칭(대소문자/공백 무시), 실패 시 null.
"""

import base64
import json
import logging
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, ExpenseCategory, User
from routers._shared import normalize_date_str as _normalize_date, require_premium_or_admin

logger = logging.getLogger(__name__)

capture_router = APIRouter(tags=["expense"])


# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def _match_name(target: str | None, rows: list[dict], *keys: str) -> int | None:
    """이름 느슨한 매칭(strip+lower) — 여러 키 중 하나라도 일치하면 id 반환."""
    if not target:
        return None
    t = target.strip().lower()
    for row in rows:
        for k in keys:
            if row.get(k, "").strip().lower() == t:
                return row["id"]
    return None


# ── 엔드포인트 ───────────────────────────────────────────────────────────────

@capture_router.post("/parse-transactions")
async def parse_budget_transactions(
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_premium_or_admin),
):
    """AI(Claude Vision)로 은행/카드 명세서 이미지를 파싱.

    반환:
      transactions  — 신규 내역 목록 (category_id 포함, null 가능)
      skipped_count — 중복으로 제외된 건수
      parse_errors  — 파일별 인식 오류 메시지
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    # ── 지출 카테고리 로드 (category_type = NULL or 'expense') ────────────
    expense_rows = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.is_active == True,   # noqa: E712
            (ExpenseCategory.category_type == None) |  # noqa: E711
            (ExpenseCategory.category_type == "expense"),
        )
        .order_by(ExpenseCategory.order_num, ExpenseCategory.id)
        .all()
    )
    exp_parents = [{"id": c.id, "name_ko": c.name_ko or "", "name_en": c.name_en or ""}
                   for c in expense_rows if c.parent_id is None]
    exp_subs    = [{"id": c.id, "name_ko": c.name_ko or "", "name_en": c.name_en or ""}
                   for c in expense_rows if c.parent_id is not None]

    # ── 수입 카테고리 로드 (category_type = 'income') ─────────────────────
    income_rows = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.category_type == "income",
            ExpenseCategory.is_active == True,   # noqa: E712
        )
        .all()
    )
    inc_parents = [{"id": c.id, "name_ko": c.name_ko or "", "name_en": c.name_en or ""}
                   for c in income_rows if c.parent_id is None]
    inc_subs    = [{"id": c.id, "name_ko": c.name_ko or "", "name_en": c.name_en or ""}
                   for c in income_rows if c.parent_id is not None]

    # ── 프롬프트에 카테고리 목록 주입 ─────────────────────────────────────
    def _cat_str(lst):
        return ", ".join(f"{r['name_ko']}({r['name_en']})" for r in lst) or "(없음)"

    PROMPT = (
        "이 이미지를 보고 아래 두 가지 타입 중 어느 쪽인지 먼저 판단하세요.\n\n"
        "=== 이미지 타입 판단 기준 ===\n"
        "A) 명세서형(Transaction History)\n"
        "   - 여러 날짜에 걸친 거래 내역이 표 형태로 나열됨\n"
        "   - 은행 입출금 내역, 카드 이용 내역 등\n"
        "   → 처리: 거래 행(row) 하나당 JSON 객체 하나. 빠짐없이 출력.\n\n"
        "B) 영수증형(Receipt)\n"
        "   - 하나의 매장에서 구매한 상품 목록이 나열됨\n"
        "   - 코스트코, 마트, 편의점, 레스토랑 등의 영수증\n"
        "   → 처리: 상품이 몇 개든 JSON 객체 딱 1개만 출력.\n"
        "     amount = 영수증 하단의 최종 합계(Total/합계/결제금액).\n"
        "     절대 상품 개별 금액을 합산하지 말 것. 영수증에 인쇄된 총액을 그대로 사용.\n"
        "     description = 매장명(예: '코스트코', '이마트').\n"
        "     category = 영수증 전체를 대표하는 카테고리 하나(가장 비중 큰 것 추정, 애매하면 null).\n\n"
        "=== 공통 규칙 ===\n"
        '1. type 판단: 출금/결제/이체 등 돈이 나가는 것 → "expense", '
        '입금/급여/이체받기 등 돈이 들어오는 것 → "income"\n'
        "2. 카테고리는 반드시 아래 목록에서만 선택. 목록에 없으면 null. 절대 지어내지 말 것.\n\n"
        f"[지출 대분류] {_cat_str(exp_parents)}\n"
        f"[지출 소분류] {_cat_str(exp_subs)}\n"
        f"[수입 대분류] {_cat_str(inc_parents)}\n"
        f"[수입 소분류] {_cat_str(inc_subs)}\n\n"
        "=== 출력 형식 (JSON 배열) ===\n"
        '{"type":"expense|income",'
        '"date":"YYYY-MM-DD(다른형식이면변환,모르면null)",'
        '"amount":숫자(절댓값,영수증이면반드시최종총액),'
        '"currency":"KRW|USD등(모르면KRW)",'
        '"description":"가맹점명또는적요",'
        '"category_name":"위목록의대분류이름그대로(모르면null)",'
        '"subcategory_name":"위목록의소분류이름그대로(모르면null)"}\n\n'
        "명세서형이면 거래 건수만큼, 영수증형이면 반드시 1개만 출력.\n"
        "JSON 배열만 출력. 설명 텍스트·마크다운 코드블록(```) 금지."
    )

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=api_key)

    ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    all_parsed: list[dict] = []
    parse_errors: list[str] = []

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
                max_tokens=4096,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
            )
            text = response.content[0].text.strip()
            # JSON 추출: 첫 [ 부터 마지막 ] 까지 — 코드블록·앞뒤 설명 텍스트 무관
            start = text.find("[")
            end   = text.rfind("]")
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(text[start:end + 1])
                if isinstance(parsed, list):
                    all_parsed.extend(parsed)
            else:
                parse_errors.append(f"{img.filename}: JSON 배열을 찾지 못했습니다")
        except json.JSONDecodeError:
            parse_errors.append(f"{img.filename}: AI 응답 파싱 실패")
        except Exception as exc:
            parse_errors.append(f"{img.filename}: {str(exc)[:120]}")

    # ── 기존 내역: 중복 체크용 집합 ──────────────────────────────────────
    existing = db.query(
        Expense.date, Expense.amount, Expense.currency,
        Expense.description, Expense.type,
    ).filter(Expense.user_id == current_user.id).all()

    existing_keys: set[tuple] = set()
    for row in existing:
        existing_keys.add((
            str(row.date),
            float(row.amount),
            (row.currency or "").upper(),
            (row.description or "").strip().lower(),
            row.type or "expense",
        ))

    # ── 파싱 결과 처리: 이름→id 매칭 + 중복 제거 ────────────────────────
    new_transactions: list[dict] = []
    skipped = 0
    seen_in_batch: set[tuple] = set()

    for tx in all_parsed:
        tx_type  = "income" if str(tx.get("type", "")).lower() == "income" else "expense"
        date_str = _normalize_date(tx.get("date"))
        amount   = float(tx.get("amount") or 0)
        currency = (tx.get("currency") or "KRW").upper()
        desc     = (tx.get("description") or "").strip()

        if amount <= 0:
            continue

        key = (date_str or "", amount, currency, desc.lower(), tx_type)
        if key in existing_keys or key in seen_in_batch:
            skipped += 1
            continue
        seen_in_batch.add(key)

        cat_name = tx.get("category_name")
        sub_name = tx.get("subcategory_name")

        if tx_type == "expense":
            cat_id = _match_name(cat_name, exp_parents, "name_ko", "name_en")
            sub_id = _match_name(sub_name, exp_subs,    "name_ko", "name_en")
        else:
            cat_id = _match_name(cat_name, inc_parents, "name_ko", "name_en")
            sub_id = _match_name(sub_name, inc_subs,    "name_ko", "name_en")

        new_transactions.append({
            "type":             tx_type,
            "date":             date_str,
            "amount":           amount,
            "currency":         currency,
            "description":      desc or None,
            "category_id":      cat_id,
            "subcategory_id":   sub_id,
            "category_name":    cat_name,
            "subcategory_name": sub_name,
        })

    logger.info(
        "[BUDGET-CAPTURE] user=%d 이미지=%d건, 신규=%d건, 중복=%d건, 오류=%d건",
        current_user.id, len(images), len(new_transactions), skipped, len(parse_errors),
    )

    return {
        "transactions":  new_transactions,
        "skipped_count": skipped,
        "parse_errors":  parse_errors,
    }
