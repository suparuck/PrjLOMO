import type { FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { config } from '../config'
import { one, rows } from '../db'
import { recordAudit } from './audit'
import type { Mailer } from './mailer'

/** ผิดกี่ครั้งใน WINDOW_MIN นาทีถึงแจ้งเจ้าของบัญชี (รหัสผ่านผิด / รหัส 2FA ผิดหลังรหัสผ่านถูก — อย่างหลังร้ายแรงกว่าจึงเกณฑ์ต่ำกว่า) */
export const PASSWORD_FAILS = 5
export const TWO_FACTOR_FAILS = 3
export const WINDOW_MIN = 15
/** แจ้งบัญชีเดียวได้ไม่เกินหนึ่งฉบับต่อช่วงนี้ — ผู้โจมตีจึงใช้การลองรหัสสแปมกล่องจดหมายเจ้าของไม่ได้ */
export const COOLDOWN_MIN = 60

const THAI_TIME = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * หลังบันทึกความล้มเหลวหนึ่งครั้ง (ต้องเรียกหลัง recordAudit) — ถ้าถึงเกณฑ์และยังไม่เคยแจ้งในช่วงพัก ส่งอีเมลหาเจ้าของบัญชี
 * เรียกในพื้นหลังเสมอ (mail.track) และทำเฉพาะบัญชีที่มีอยู่จริง: เวลาตอบของ /auth/login จึงไม่บอกว่ามีอีเมลนี้หรือไม่ และผู้โจมตีไม่ได้อะไรกลับมา
 * ไม่ส่งถ้าไม่ได้ตั้ง SMTP (ไม่กินช่วงพัก) — ยังเห็นเหตุการณ์ใน audit log
 */
export async function alertOnFailedLogins(
  pool: Pool,
  mailer: Mailer,
  req: Pick<FastifyRequest, 'ip' | 'log'>,
  who: { email?: string; userId?: string },
  kind: 'password' | '2fa',
): Promise<void> {
  if (mailer.mode === 'off') return
  const u = await one<{ id: string; email: string; name: string }>(
    pool,
    who.userId
      ? `select id, email, name from users where id = $1 and status = 'active'`
      : `select id, email, name from users where lower(email) = lower($1) and status = 'active'`,
    [who.userId ?? who.email],
  )
  if (!u) return
  const action = kind === 'password' ? 'auth.login_failed' : 'auth.2fa_failed'
  const threshold = kind === 'password' ? PASSWORD_FAILS : TWO_FACTOR_FAILS
  const recent = await rows<{ at: Date; ip: string | null }>(
    pool,
    `select at, ip from audit_log where action = $1 and (actor_id = $2 or lower(actor_email) = lower($3)) and at > now() - ($4::int * interval '1 minute') order by at desc`,
    [action, u.id, u.email, WINDOW_MIN],
  )
  if (recent.length < threshold) return
  // จองสิทธิ์ส่งแบบอะตอมมิก (หลายคำขอพร้อมกัน/หลาย API อินสแตนซ์ → ส่งฉบับเดียว)
  const claimed = await one(
    pool,
    `update users set login_alert_at = now() where id = $1 and (login_alert_at is null or login_alert_at < now() - ($2::int * interval '1 minute')) returning 1`,
    [u.id, COOLDOWN_MIN],
  )
  if (!claimed) return

  const ips = [...new Set(recent.map((r) => r.ip).filter((x): x is string => !!x))].slice(0, 5)
  const base =
    `สวัสดี ${u.name}\n\n` +
    (kind === 'password'
      ? `มีการพยายามเข้าสู่ระบบ EV Monitor ด้วยบัญชี ${u.email} โดยใช้รหัสผ่านผิด ${recent.length} ครั้งใน ${WINDOW_MIN} นาที\n`
      : `มีผู้ที่กรอกรหัสผ่านของบัญชี ${u.email} ถูกต้อง แต่กรอกรหัสยืนยัน 2FA ผิด ${recent.length} ครั้งใน ${WINDOW_MIN} นาที — แปลว่าอาจมีคนอื่นรู้รหัสผ่านของคุณ\n`) +
    `ครั้งล่าสุด: ${THAI_TIME.format(recent[0].at)} น.${ips.length ? `\nที่อยู่ IP: ${ips.join(', ')}` : ''}\n\n`
  const advice =
    kind === 'password'
      ? `หากเป็นคุณที่จำรหัสผ่านไม่ได้ ใช้ "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ: ${config.appBaseUrl}/forgot-password\n` +
        `หากไม่ใช่คุณ รหัสผ่านของคุณยังไม่ถูกเปิดเผย (ระบบบล็อกการเดาให้อยู่แล้ว) แต่ควรเปลี่ยนรหัสผ่านและเปิดใช้ 2FA ที่ ${config.appBaseUrl}/account`
      : `โปรดเปลี่ยนรหัสผ่านทันทีที่ ${config.appBaseUrl}/account แล้วแจ้งผู้ดูแลระบบ (การเปลี่ยนรหัสผ่านจะออกจากระบบทุกเครื่อง)`
  await mailer.send({
    to: u.email,
    subject: kind === 'password' ? 'มีการพยายามเข้าสู่ระบบด้วยรหัสผ่านผิด — EV Monitor' : 'เตือน: รหัสผ่านของคุณอาจรั่ว (ยืนยัน 2FA ผิดซ้ำ) — EV Monitor',
    text: base + advice + `\n\nอีเมลนี้ส่งอัตโนมัติ ไม่เกิน 1 ฉบับต่อชั่วโมง`,
  })
  await recordAudit(pool, req, { action: 'auth.login_alert_sent', actorId: u.id, actorEmail: u.email, detail: { kind, failures: recent.length } })
}
