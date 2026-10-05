/**
 * ตรวจ session ของเว็บ — ใช้ใน middleware (Edge runtime) เท่านั้น
 * โทเคนออกโดย API (POST /api/v1/auth/login → cookie ev_session) เป็น JWT แบบ HS256 ที่เซ็นด้วย AUTH_SECRET เดียวกัน
 * เว็บแค่ตรวจลายเซ็นและวันหมดอายุเพื่อกันเข้าหน้า สิทธิ์ตามบทบาทจริงถูกบังคับที่ API ทุก request
 */
export const SESSION_COOKIE = 'ev_session'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'viewer'
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function fromB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  const secret = process.env.AUTH_SECRET
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, sig] = parts
  try {
    if (JSON.parse(dec.decode(fromB64u(h))).alg !== 'HS256') return null // กัน alg=none / สลับอัลกอริทึม
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    // verify() ของ WebCrypto เทียบแบบ constant-time
    const ok = await crypto.subtle.verify('HMAC', key, fromB64u(sig) as BufferSource, enc.encode(`${h}.${p}`))
    if (!ok) return null
    const payload = JSON.parse(dec.decode(fromB64u(p)))
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null
    if (!payload.sub || !['admin', 'manager', 'viewer'].includes(payload.role)) return null
    return { id: payload.sub, email: payload.email, name: payload.name ?? payload.email, role: payload.role }
  } catch {
    return null
  }
}

/** กัน open redirect: อนุญาตเฉพาะ path ภายในเว็บ */
export function safeNext(next: string | null | undefined, fallback = '/dashboard') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}
