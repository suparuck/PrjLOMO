import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { config } from './config'
import { one } from './db'
import { forbidden, unauthorized } from './errors'
import { USER_ROLE_RANK, type UserRole } from './lib/validators'

/* ---------- JWT (HS256) — โครงเดียวกับที่ middleware ของเว็บตรวจ ---------- */
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
}

/** ข้อมูลใน token: sv = session_version ของผู้ใช้ตอนออก token (เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว token เดิมใช้ไม่ได้) */
export interface TokenClaims extends SessionUser {
  sv: number
}

export function signToken(user: TokenClaims, ttlSeconds: number): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64u(JSON.stringify({ sub: user.id, email: user.email, name: user.name, role: user.role, sv: user.sv, iat: now, exp: now + ttlSeconds }))
  const sig = createHmac('sha256', config.authSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyToken(token: string | undefined): TokenClaims | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  try {
    // รับเฉพาะ HS256 เท่านั้น (กัน alg=none / สลับอัลกอริทึม)
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null
    const expected = createHmac('sha256', config.authSecret).update(`${header}.${payload}`).digest()
    const given = Buffer.from(sig, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null
    if (!p.sub || !p.email || !(p.role in USER_ROLE_RANK) || !Number.isInteger(p.sv)) return null
    return { id: p.sub, email: p.email, name: p.name ?? p.email, role: p.role, sv: p.sv }
  } catch {
    return null
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser
    apiKey?: { id: string; name: string; scopes: string[] }
  }
}

function tokenFrom(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return req.cookies?.[config.sessionCookie]
}

/**
 * ต้องล็อกอิน และมีบทบาทอย่างน้อย minRole (viewer < manager < admin)
 * ตรวจ token แล้วอ่านผู้ใช้จากฐานข้อมูลทุก request: บทบาท/ชื่อมาจากฐานข้อมูล (ไม่เชื่อค่าใน token),
 * ผู้ใช้ที่ถูกลบ/ไม่ active หรือ session_version ไม่ตรง (เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว) → 401
 */
export function requireRole(pool: Pool, minRole: UserRole) {
  return async function guard(req: FastifyRequest, _reply: FastifyReply) {
    const claims = verifyToken(tokenFrom(req))
    if (!claims) throw unauthorized()
    const u = await one<{ id: string; email: string; name: string; role: UserRole; sv: number }>(
      pool,
      `select id, email, name, role, session_version as sv from users where id = $1 and status = 'active'`,
      [claims.id],
    )
    if (!u || u.sv !== claims.sv) throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
    if (USER_ROLE_RANK[u.role] < USER_ROLE_RANK[minRole]) throw forbidden()
    req.user = { id: u.id, email: u.email, name: u.name, role: u.role }
  }
}

/* ---------- โทเคนระหว่างล็อกอินสองขั้นตอน ---------- */
const CHALLENGE_TTL_SECONDS = 5 * 60

/** ออกให้หลังรหัสผ่านถูกต้องของบัญชีที่เปิด 2FA — อายุ 5 นาที ใช้ได้กับ /auth/login/2fa เท่านั้น (ไม่มี role/sv จึงเป็น session ไม่ได้) */
export function signChallenge(userId: string, remember: boolean): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64u(JSON.stringify({ typ: '2fa', sub: userId, rem: remember, iat: now, exp: now + CHALLENGE_TTL_SECONDS }))
  const sig = createHmac('sha256', config.authSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyChallenge(token: string): { userId: string; remember: boolean } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  try {
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null
    const expected = createHmac('sha256', config.authSecret).update(`${header}.${payload}`).digest()
    const given = Buffer.from(sig, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (p.typ !== '2fa' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000 || typeof p.sub !== 'string') return null
    return { userId: p.sub, remember: !!p.rem }
  } catch {
    return null
  }
}

/* ---------- API key สำหรับอุปกรณ์/ระบบภายนอก ---------- */
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

export function generateApiKey() {
  const key = `evm_${randomBytes(24).toString('base64url')}`
  return { key, prefix: key.slice(0, 8), hash: hashKey(key) }
}

export function requireApiKey(pool: Pool, scope = 'ingest') {
  return async function guard(req: FastifyRequest, _reply: FastifyReply) {
    const raw = req.headers['x-api-key']
    const key = Array.isArray(raw) ? raw[0] : raw
    if (!key) throw unauthorized('ต้องแนบ API key ในส่วนหัว X-API-Key')
    const row = await one<{ id: string; name: string; scopes: string[] }>(
      pool,
      `update api_keys set last_used_at = now()
        where key_hash = $1 and revoked_at is null
        returning id, name, scopes`,
      [hashKey(key)],
    )
    if (!row) throw unauthorized('API key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว')
    if (!row.scopes.includes(scope)) throw forbidden('API key นี้ไม่มีสิทธิ์ส่งข้อมูลเข้าระบบ')
    req.apiKey = row
  }
}
