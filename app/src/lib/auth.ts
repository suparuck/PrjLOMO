/**
 * Auth แบบ mock สำหรับช่วงพัฒนา — ใช้ได้ทั้ง Edge (middleware) และ Node (route handlers)
 * Session = โทเคนที่เซ็นด้วย HMAC-SHA256 เก็บใน cookie แบบ httpOnly
 * เมื่อมี backend จริง ให้แทนที่ MOCK_USER และ verifyCredentials ด้วยการเรียก API
 */
export const SESSION_COOKIE = 'ev_session'

/** ผู้ใช้เดโม (ค่าเดียวกับต้นแบบ) — ห้ามใช้เป็นบัญชีจริง */
export const MOCK_USER = { email: 'admin@evmonitor.co.th', password: 'demo1234' }

export function verifyCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === MOCK_USER.email && password === MOCK_USER.password
}

const enc = new TextEncoder()

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') throw new Error('ต้องตั้งค่า AUTH_SECRET ใน production')
  return 'dev-only-secret-do-not-use-in-production'
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))))
}

/** สร้างโทเคน `<email>|<หมดอายุ(วินาที)>.<ลายเซ็น>` */
export async function createToken(email: string, ttlSeconds: number): Promise<string> {
  const payload = b64url(enc.encode(`${email}|${Math.floor(Date.now() / 1000) + ttlSeconds}`))
  return `${payload}.${await sign(payload)}`
}

/** คืนอีเมลถ้าโทเคนถูกต้องและยังไม่หมดอายุ ไม่เช่นนั้นคืน null */
export async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = await sign(payload)
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const raw = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const [email, exp] = raw.split('|')
    return Number(exp) > Date.now() / 1000 ? email : null
  } catch {
    return null
  }
}

/** กัน open redirect: อนุญาตเฉพาะ path ภายในเว็บ */
export function safeNext(next: string | null | undefined, fallback = '/dashboard') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}
