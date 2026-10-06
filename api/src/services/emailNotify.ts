import type { Pool } from 'pg'
import { config } from '../config'
import { one, rows } from '../db'
import type { Mailer } from './mailer'

const SEV_TH: Record<string, string> = { critical: 'วิกฤต', warning: 'เตือน', info: 'ข้อมูล' }
/** เฉพาะระดับที่ต้องรีบรู้ (เหมือนการส่งเข้า LINE) */
const NOTIFY_SEVERITIES = ['critical', 'warning']
/** ส่งเฉพาะแจ้งเตือนที่เกิดไม่เกินช่วงนี้ — ลองใหม่ได้ในช่วงนี้ แต่ไม่ส่งของเก่าที่ค้างตอนเปิดระบบ */
const MAX_AGE_MIN = 10
const MAX_PER_MAIL = 20

interface Row {
  id: number
  severity: string
  type: string
  title: string
  text: string
}

export function buildAlertEmail(list: Row[]) {
  const critical = list.filter((a) => a.severity === 'critical').length
  const lines = list.slice(0, MAX_PER_MAIL).map((a) => `• [${SEV_TH[a.severity] ?? a.severity}] ${a.title}\n  ${a.text}`)
  const more = list.length > MAX_PER_MAIL ? `\nและอีก ${list.length - MAX_PER_MAIL} รายการ` : ''
  return {
    subject: `EV Monitor: แจ้งเตือนใหม่ ${list.length} รายการ${critical ? ` (วิกฤต ${critical})` : ''}`,
    text:
      `มีการแจ้งเตือนใหม่ในระบบ EV Monitor\n\n${lines.join('\n\n')}${more}\n\n` +
      `ดูรายละเอียดและรับทราบ: ${config.appBaseUrl}/alerts\n\n` +
      'ปิดการแจ้งเตือนทางอีเมลได้ที่ ตั้งค่า > เกณฑ์การแจ้งเตือน (สวิตช์ "แจ้งเตือนทางอีเมล")',
  }
}

/**
 * ส่งอีเมลแจ้งเตือนใหม่ให้ผู้ดูแลและผู้จัดการที่ใช้งานอยู่ — หนึ่งฉบับต่อผู้รับต่อรอบ (รวมหลายรายการ)
 * - อ่านจากตาราง alerts จึงไม่ต้องแก้จุดที่สร้างแจ้งเตือน และไม่ส่งระหว่างทรานแซกชัน
 * - "จอง" แถวด้วย email_notified_at แบบอะตอมมิก (หลาย API อินสแตนซ์ไม่ส่งซ้ำ); ส่งไม่ถึงใครเลว → คืนการจอง
 * - floorId: ไม่แตะแจ้งเตือนที่มีอยู่ก่อนระบบเริ่มทำงาน · เคารพสวิตช์ notify.email ในหน้าตั้งค่า
 * - ผู้รับ: admin/manager ที่ status = active (ผู้ดูรายงาน viewer ไม่ได้รับ)
 */
export async function runEmailNotify(
  pool: Pool,
  mailer: Mailer,
  floorId: number,
): Promise<{ sent: number; recipients?: number; skipped?: 'mail-off' | 'disabled' | 'no-recipients' | 'failed' }> {
  if (mailer.mode === 'off') return { sent: 0, skipped: 'mail-off' }
  const s = await one<{ on: boolean }>(pool, `select coalesce((notify->>'email')::boolean, false) as "on" from app_settings where id = 1`)
  if (!s?.on) return { sent: 0, skipped: 'disabled' }

  const to = (await rows<{ email: string }>(pool, `select email from users where status = 'active' and role in ('admin', 'manager') and coalesce((notify_prefs->>'alertEmail')::boolean, true) order by email`)).map((u) => u.email)
  if (to.length === 0) return { sent: 0, skipped: 'no-recipients' }

  const claimed = await rows<Row>(
    pool,
    `update alerts set email_notified_at = now()
      where id in (select id from alerts
                    where email_notified_at is null and id > $1 and severity = any($2::alert_severity[])
                      and created_at > now() - ($3::int * interval '1 minute')
                    order by id limit 100)
      returning id, severity::text as severity, type::text as type, title, text`,
    [floorId, NOTIFY_SEVERITIES, MAX_AGE_MIN],
  )
  if (claimed.length === 0) return { sent: 0 }
  claimed.sort((a, b) => a.id - b.id)

  const mail = buildAlertEmail(claimed)
  let delivered = 0
  for (const addr of to) {
    try {
      await mailer.send({ to: addr, ...mail })
      delivered++
    } catch (err) {
      console.error(`[email] ส่งแจ้งเตือนไป ${addr} ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`)
    }
  }
  if (delivered === 0) {
    await pool.query('update alerts set email_notified_at = null where id = any($1::bigint[])', [claimed.map((a) => a.id)])
    return { sent: 0, skipped: 'failed' }
  }
  return { sent: claimed.length, recipients: delivered }
}
