"""slowapi Limiter 단일 인스턴스 — auth.py / main.py 공유.

Railway 로드밸런서는 request.client.host를 매번 다른 내부 IP(100.64.x.x)로
설정하므로, X-Forwarded-For 헤더에서 실제 클라이언트 IP를 추출해야 한다.
"""
from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=_get_real_ip)
