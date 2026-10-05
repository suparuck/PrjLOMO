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

export function signToken(user: SessionUser, ttlSeconds: number): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64u(JSON.stringify({ sub: user.id, email: user.email, name: user.name, role: user.role, iat: now, exp: now + ttlSeconds }))
  const sig = createHmac('sha256', config.authSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyToken(token: string | undefined): SessionUser | null {
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
    if (!p.sub || !p.email || !(p.role in USER_ROLE_RANK)) return null
    return { id: p.sub, email: p.email, name: p.name ?? p.email, role: p.role }
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

/** ต้องล็อกอิน และมีบทบาทอย่างน้อย minRole (viewer < manager < admin) */
export function requireRole(minRole: UserRole) {
  return async function guard(req: FastifyRequest, _reply: FastifyReply) {
    const user = verifyToken(tokenFrom(req))
    if (!user) throw unauthorized()
    if (USER_ROLE_RANK[user.role] < USER_ROLE_RANK[minRole]) throw forbidden()
    req.user = user
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
