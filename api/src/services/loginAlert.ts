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

/* ---------- ล็อกอินสำเร็จจากเครือข่ายใหม่ ---------- */
/** ดูย้อนหลังกี่วันว่าเคยเข้าจากเครือข่ายนี้หรือไม่ */
export const KNOWN_IP_DAYS = 90

/**
 * เครือข่ายของ IP: IPv4 → 3 ส่วนแรก (/24), IPv6 → 4 ส่วนแรก (/64) — มือถือ/อินเทอร์เน็ตบ้านที่ IP เปลี่ยนในเครือข่ายเดิมจึงไม่ถือว่าใหม่ (ลดอีเมลรบกวน)
 * คืน null ถ้าไม่มี/อ่านไม่ได้ (ข้ามการตรวจ)
 */
export function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`
  if (!ip.includes(':')) return null
  const [head, tail] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail === undefined ? [] : tail ? tail.split(':') : []
  const full = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  if (full.length !== 8) return null
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':')
}

/**
 * เรียกเมื่อเข้าสู่ระบบสำเร็จครบทุกขั้น: บันทึก audit แล้วถ้า "เคยเข้าสำเร็จมาก่อนแต่ไม่เคยจากเครือข่ายนี้ใน KNOWN_IP_DAYS วัน" ส่งอีเมลเตือนเจ้าของบัญชี
 * - ครั้งแรกสุดของบัญชี (ยังไม่มีประวัติ) ไม่เตือน — ไม่มีอะไรให้เทียบ
 * - ต้องตรวจก่อนบันทึกแถวของครั้งนี้ ไม่เช่นนั้นจะนับตัวเองเป็น "เคยเห็น"
 * - อีเมลส่งในพื้นหลัง (ผู้เรียกใช้ mail.track) และไม่ส่งถ้าไม่ตั้ง SMTP
 */
export async function recordLoginAndMaybeAlert(
  pool: Pool,
  mailer: Mailer,
  track: (p: Promise<unknown>) => void,
  req: Pick<FastifyRequest, 'ip' | 'log' | 'headers'>,
  user: { id: string; email: string; name: string },
  detail: Record<string, unknown> = {},
): Promise<void> {
  const prefix = ipPrefix(req.ip)
  let isNew = false
  if (prefix) {
    const seen = await rows<{ ip: string | null }>(
      pool,
      `select distinct ip from audit_log where action = 'auth.login' and actor_id = $1 and at > now() - ($2::int * interval '1 day')`,
      [user.id, KNOWN_IP_DAYS],
    )
    isNew = seen.length > 0 && !seen.some((r) => ipPrefix(r.ip) === prefix)
  }
  await recordAudit(pool, req, { action: 'auth.login', actorId: user.id, actorEmail: user.email, detail: { ...detail, ...(isNew ? { newNetwork: true } : {}) } })
  if (!isNew || mailer.mode === 'off') return
  track(
    (async () => {
      const ua = String(req.headers['user-agent'] ?? '').slice(0, 150)
      await mailer.send({
        to: user.email,
        subject: 'เข้าสู่ระบบจากเครือข่ายใหม่ — EV Monitor',
        text:
          `สวัสดี ${user.name}\n\n` +
          `บัญชี ${user.email} เพิ่งเข้าสู่ระบบ EV Monitor จากเครือข่ายที่ไม่เคยใช้ใน ${KNOWN_IP_DAYS} วันที่ผ่านมา\n\n` +
          `เวลา: ${THAI_TIME.format(new Date())} น.\nที่อยู่ IP: ${req.ip}${ua ? `\nอุปกรณ์/เบราว์เซอร์: ${ua}` : ''}\n\n` +
          `หากเป็นคุณ ไม่ต้องทำอะไร (ระบบจะจำเครือข่ายนี้ไว้ ไม่แจ้งซ้ำ)\n` +
          `หากไม่ใช่คุณ เปลี่ยนรหัสผ่านทันทีที่ ${config.appBaseUrl}/account (ทุกเครื่องจะถูกออกจากระบบ) และเปิดใช้ 2FA แล้วแจ้งผู้ดูแลระบบ`,
      })
      await recordAudit(pool, req, { action: 'auth.new_network_alert_sent', actorId: user.id, actorEmail: user.email })
    })().catch((err) => req.log.error({ err }, 'new network alert failed')),
  )
}
