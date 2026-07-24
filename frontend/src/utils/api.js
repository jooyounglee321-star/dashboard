// HttpOnly Cookie 방식으로 전환 — fetch 시 credentials: 'include' 사용
export const credOpts  = () => ({ credentials: 'include' })
export const credOptsJ = () => ({ credentials: 'include', headers: { 'Content-Type': 'application/json' } })
