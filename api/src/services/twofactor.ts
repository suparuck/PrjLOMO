import { randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import { hashKey } from '../auth'
import { one, withTx } from '../db'
import { AppError, conflict, invalid, notFound } from '../errors'
import { open, seal } from '../lib/seal'
import { generateSecret, otpauthUri, stepAt, verifyTotp } from '../lib/totp'

export const ISSUER = 'EV Monitor'
const PENDING_TTL_MS = 10 * 60_000
const RECOVERY_COUNT = 8
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** รหัสสำรอง 10 ตัวอักษร (50 บิต) รูปแบบ XXXXX-XXXXX — ใช้ได้ครั้งเดียว เก็บเฉพาะ sha256 */
function newRecoveryCode(): string {
  const b = randomBytes(10)
  const s = Array.from(b, (x) => B32[x % 32]).join('')
  return `${s.slice(0, 5)}-${s.slice(5)}`
}
const normalizeRecovery = (s: string) => s.replace(/[\s-]/g, '').toUpperCase()
const recoveryHash = (code: string) => hashKey(normalizeRecovery(code))

async function storeRecoveryCodes(c: Pick<Pool, 'query'>, userId: string): Promise<string[]> {
  await c.query('delete from user_recovery_codes where user_id = $1', [userId])
  const codes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode)
  for (const code of codes) await c.query('insert into user_recovery_codes (user_id, code_hash) values ($1, $2)', [userId, recoveryHash(code)])
  return codes
}

/** ตรวจรหัสผ่านปัจจุบัน (ยืนยันตัวตนซ้ำก่อนเปลี่ยนค่าความปลอดภัย) */
export async function passwordMatches(pool: Pool, userId: string, password: string): Promise<boolean> {
  const r = await one(pool, `select 1 from users where id = $1 and status = 'active' and password_hash = crypt($2, password_hash)`, [userId, password])
  return !!r
}

/** เริ่มตั้งค่า: สร้างความลับใหม่ (ยังไม่เก็บลงฐานข้อมูล) คืน URI สำหรับ QR และโทเคนที่ปิดผนึกไว้ให้ส่งกลับตอนยืนยันรหัสแรก */
export async function beginSetup(pool: Pool, user: { id: string; email: string }) {
  const u = await one<{ enabled: boolean }>(pool, 'select totp_enabled_at is not null as enabled from users where id = $1', [user.id])
  if (!u) throw notFound('ผู้ใช้')
  if (u.enabled) throw conflict('บัญชีนี้เปิดใช้การยืนยันตัวตนสองขั้นตอนอยู่แล้ว — ปิดก่อนหากต้องการตั้งใหม่')
  const secret = generateSecret()
  const pending = seal(JSON.stringify({ u: user.id, s: secret, exp: Date.now() + PENDING_TTL_MS }), '2fa-pending')
  return { secret, uri: otpauthUri(ISSUER, user.email, secret), pending }
}

/** ยืนยันรหัสแรกจากแอป → เปิดใช้ 2FA, ออกรหัสสำรอง (แสดงครั้งเดียว), เพิกถอน session อื่นทั้งหมด (คืนเวอร์ชันใหม่ให้ออก cookie) */
export async function enable(pool: Pool, userId: string, pending: string, code: string, now = Date.now()) {
  const raw = open(pending, '2fa-pending')
  let p: { u: string; s: string; exp: number } | null = null
  try {
    p = raw ? JSON.parse(raw) : null
  } catch {
    p = null
  }
  if (!p || p.u !== userId || p.exp < now) throw new AppError(410, 'expired_setup', 'การตั้งค่าหมดอายุ กรุณาเริ่มใหม่')
  const step = verifyTotp(p.s, code, now)
  if (step === null) throw invalid({ code: 'รหัสไม่ถูกต้อง — ตรวจว่านาฬิกาของมือถือตรงเวลา แล้วกรอกรหัสปัจจุบันจากแอป' })
  return withTx(pool, async (c) => {
    const r = await one<{ sv: number }>(
      c,
      `update users set totp_secret_enc = $2, totp_enabled_at = now(), totp_last_step = $3, session_version = session_version + 1
        where id = $1 and totp_enabled_at is null returning session_version as sv`,
      [userId, seal(p!.s, '2fa-secret'), step],
    )
    if (!r) throw conflict('บัญชีนี้เปิดใช้การยืนยันตัวตนสองขั้นตอนอยู่แล้ว')
    return { recoveryCodes: await storeRecoveryCodes(c, userId), sv: r.sv }
  })
}

/**
 * ตรวจรหัสตอนเข้าสู่ระบบ/ยืนยันก่อนแก้ไขค่า: รหัส 6 หลักจากแอป (ใช้ช่วงเวลาเดิมซ้ำไม่ได้) หรือรหัสสำรอง (ใช้ได้ครั้งเดียว)
 * ใช้การอัปเดตแบบมีเงื่อนไขในฐานข้อมูล จึงกันการใช้ซ้ำแม้ส่งคำขอพร้อมกัน
 */
export async function verifyCode(pool: Pool, userId: string, input: string, now = Date.now()): Promise<boolean> {
  const u = await one<{ secret: string | null; last: string }>(pool, 'select totp_secret_enc as secret, totp_last_step::text as last from users where id = $1 and totp_enabled_at is not null', [userId])
  if (!u?.secret) return false
  const trimmed = input.trim()
  if (/^\d[\d\s]*$/.test(trimmed)) {
    const secret = open(u.secret, '2fa-secret')
    if (!secret) return false // กุญแจเปลี่ยน (AUTH_SECRET) หรือข้อมูลเสีย — ต้องรีเซ็ต 2FA
    const step = verifyTotp(secret, trimmed, now, Number(u.last))
    if (step === null) return false
    const r = await one(pool, 'update users set totp_last_step = $2 where id = $1 and totp_last_step < $2 returning 1', [userId, step])
    return !!r
  }
  if (normalizeRecovery(trimmed).length === 10) {
    const r = await one(pool, 'update user_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning 1', [userId, recoveryHash(trimmed)])
    return !!r
  }
  return false
}

/** ปิด 2FA ของบัญชี (เจ้าของปิดเอง / ผู้ดูแลรีเซ็ตเมื่อเครื่องหาย / CLI) — ทุก session เดิมหลุด คืนเวอร์ชันใหม่ */
export async function disable(pool: Pool, userId: string): Promise<{ wasEnabled: boolean; sv: number } | null> {
  return withTx(pool, async (c) => {
    const cur = await one<{ was: boolean }>(c, 'select totp_enabled_at is not null as was from users where id = $1 for update', [userId])
    if (!cur) return null
    const r = await one<{ sv: number }>(
      c,
      'update users set totp_secret_enc = null, totp_enabled_at = null, totp_last_step = 0, session_version = session_version + 1 where id = $1 returning session_version as sv',
      [userId],
    )
    await c.query('delete from user_recovery_codes where user_id = $1', [userId])
    return { wasEnabled: cur.was, sv: r!.sv }
  })
}

export async function regenerateRecoveryCodes(pool: Pool, userId: string): Promise<string[]> {
  return withTx(pool, (c) => storeRecoveryCodes(c, userId))
}

export async function remainingRecoveryCodes(pool: Pool, userId: string): Promise<number> {
  const r = await one<{ n: number }>(pool, 'select count(*)::int as n from user_recovery_codes where user_id = $1 and used_at is null', [userId])
  return r?.n ?? 0
}

export { stepAt }
