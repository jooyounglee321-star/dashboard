export const getToken = () => { try { return localStorage.getItem('token') || '' } catch { return '' } }
export const authH    = () => ({ Authorization: 'Bearer ' + getToken() })
export const authHJ   = () => ({ ...authH(), 'Content-Type': 'application/json' })
