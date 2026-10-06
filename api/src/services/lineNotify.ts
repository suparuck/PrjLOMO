import type { Pool } from 'pg'
import { config } from '../config'
import { one, rows } from '../db'
import type { LineClient } from './line'

const SEV_TH: Record<string, string> = { critical: 'วิกฤต', warning: 'เตือน', info: 'ข้อมูล' }
/** เฉพาะระดับที่ต้องรีบรู้ (ข้อมูลทั่วไปไม่ส่ง เพื่อประหยัดโควตาข้อความของ LINE) */
const NOTIFY_SEVERITIES = ['critical', 'warning']
/** ส่งเฉพาะแจ้งเตือนที่เกิดไม่เกินช่วงนี้ — ลองใหม่ได้ในช่วงนี้ แต่ไม่ส่งของเก่าที่ค้างตอนเปิดระบบ */
const MAX_AGE_MIN = 10
const MAX_PER_MESSAGE = 8

interface Row {
  id: number
  severity: string
  title: string
  text: string
}

export function formatLineMessage(list: Row[]): string {
  const lines = list.slice(0, MAX_PER_MESSAGE).map((a) => `• [${SEV_TH[a.severity] ?? a.severity}] ${a.title} — ${a.text}`)
  const more = list.length > MAX_PER_MESSAGE ? `\nและอีก ${list.length - MAX_PER_MESSAGE} รายการ` : ''
  return `EV Monitor แจ้งเตือนใหม่ ${list.length} รายการ\n${lines.join('\n')}${more}\n\nดูรายละเอียด: ${config.appBaseUrl}/alerts`
}

/**
 * ส่งแจ้งเตือนใหม่เข้า LINE เป็นข้อความเดียวต่อรอบ
 * - เปิดอ่านจากตาราง alerts จึงไม่ต้องแก้จุดที่สร้างแจ้งเตือนหลายแห่ง และไม่ส่งระหว่างทรานแซกชัน
 * - "จอง" แถวด้วย line_notified_at แบบอะตอมมิก (หลาย API อินสแตนซ์ไม่ส่งซ้ำ); ส่งไม่สำเร็จแบบลองใหม่ได้ → คืนการจอง
 * - floorId: ไม่แตะแจ้งเตือนที่มีอยู่ก่อนระบบเริ่มทำงาน (กันยิงข้อมูลเดโม/ของค้างเข้า LINE จริง)
 * - เคารพสวิตช์ LINE ในหน้าตั้งค่า (notify.line)
 */
export async function runLineNotify(pool: Pool, line: LineClient, floorId: number): Promise<{ sent: number; skipped?: 'not-configured' | 'disabled' | 'failed' }> {
  if (!line.configured) return { sent: 0, skipped: 'not-configured' }
  const s = await one<{ on: boolean }>(pool, `select coalesce((notify->>'line')::boolean, false) as "on" from app_settings where id = 1`)
  if (!s?.on) return { sent: 0, skipped: 'disabled' }

  const claimed = await rows<Row>(
    pool,
    `update alerts set line_notified_at = now()
      where id in (select id from alerts
                    where line_notified_at is null and id > $1 and severity = any($2::alert_severity[])
                      and created_at > now() - ($3::int * interval '1 minute')
                    order by id limit 50)
      returning id, severity::text as severity, title, text`,
    [floorId, NOTIFY_SEVERITIES, MAX_AGE_MIN],
  )
  if (claimed.length === 0) return { sent: 0 }
  claimed.sort((a, b) => a.id - b.id)

  const r = await line.push(formatLineMessage(claimed))
  if (r.ok) return { sent: claimed.length }
  if (r.retryable) await pool.query('update alerts set line_notified_at = null where id = any($1::bigint[])', [claimed.map((a) => a.id)])
  console.error(`[line] ส่งไม่สำเร็จ${r.retryable ? ' (จะลองใหม่)' : ''}: ${r.error}`)
  return { sent: 0, skipped: 'failed' }
}

/** รหัสแจ้งเตือนล่าสุด ณ ตอนเริ่มระบบ — ใช้เป็น floorId */
export async function currentAlertFloor(pool: Pool): Promise<number> {
  const r = await one<{ id: number | null }>(pool, 'select max(id)::int as id from alerts')
  return r?.id ?? 0
}
