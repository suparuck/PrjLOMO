import type { Pool } from 'pg'
import { config } from '../config'
import { one, rows } from '../db'
import type { Mailer } from './mailer'

/** ส่งได้เฉพาะก่อนเวลานี้ของวัน (เวลาไทย) — ถ้า API หยุดช่วงเช้าแล้วกลับมาตอนบ่ายยังส่งตามหลังได้ แต่ไม่ส่งสรุป "ตอนเช้า" ตอนค่ำ */
const LATEST_HOUR_TH = 20
const LIST_MAX = 5

export interface DigestData {
  dateLabel: string
  vehicles: { total: number; byStatus: Record<string, number> }
  lowBattery: { id: string; soc: number }[]
  offline: { id: string; lastSeen: string | null }[]
  alerts: { critical: number; warning: number; info: number; openUnacked: number; openCritical: number }
  charging: { sessions: number; kwh: number; cost: number }
  maintenance: { overdue: number; dueSoon: number }
}

const STATUS_TH: Record<string, string> = { driving: 'กำลังวิ่ง', charging: 'กำลังชาร์จ', parked: 'จอดอยู่', low: 'แบตต่ำ', offline: 'ออฟไลน์' }
const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 1 })

const TODAY = `(now() at time zone 'Asia/Bangkok')::date`
// "เมื่อวาน" ตามเวลาไทย 00:00–24:00
const Y_START = `((${TODAY} - 1)::timestamp at time zone 'Asia/Bangkok')`
const Y_END = `(${TODAY}::timestamp at time zone 'Asia/Bangkok')`

/** อ่านตัวเลขของ "เมื่อวาน" (เวลาไทย) และสถานะกองยาน ณ ตอนนี้ */
export async function gatherDigest(pool: Pool): Promise<DigestData> {
  const day = await one<{ label: string }>(pool, `select to_char(${TODAY} - 1, 'DD/MM/YYYY') as label`)
  const byStatus = await rows<{ status: string; n: number }>(pool, `select status::text, count(*)::int as n from vehicles group by status`)
  const low = await rows<{ id: string; soc: number }>(pool, `select id, soc from vehicles where soc < 30 and status <> 'offline' order by soc, id limit ${LIST_MAX}`)
  const off = await rows<{ id: string; lastSeen: string | null }>(
    pool,
    `select id, to_char(last_seen_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI') as "lastSeen" from vehicles where status = 'offline' order by id limit ${LIST_MAX}`,
  )
  const al = await one<DigestData['alerts']>(
    pool,
    `select count(*) filter (where severity = 'critical' and created_at >= ${Y_START} and created_at < ${Y_END})::int as critical,
            count(*) filter (where severity = 'warning' and created_at >= ${Y_START} and created_at < ${Y_END})::int as warning,
            count(*) filter (where severity = 'info' and created_at >= ${Y_START} and created_at < ${Y_END})::int as info,
            count(*) filter (where acknowledged_at is null and severity in ('critical','warning'))::int as "openUnacked",
            count(*) filter (where acknowledged_at is null and severity = 'critical')::int as "openCritical"
       from alerts`,
  )
  const ch = await one<DigestData['charging']>(
    pool,
    `select count(*)::int as sessions, coalesce(sum(kwh), 0)::float as kwh, coalesce(sum(cost), 0)::float as cost
       from charging_sessions where started_at >= ${Y_START} and started_at < ${Y_END}`,
  )
  const mt = await one<DigestData['maintenance']>(
    pool,
    `select count(*) filter (where due_date < ${TODAY})::int as overdue,
            count(*) filter (where due_date >= ${TODAY} and due_date <= ${TODAY} + 7)::int as "dueSoon"
       from maintenance_tasks where completed_at is null and due_date is not null`,
  )
  return {
    dateLabel: day!.label,
    vehicles: { total: byStatus.reduce((s, r) => s + r.n, 0), byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) },
    lowBattery: low,
    offline: off,
    alerts: al!,
    charging: ch!,
    maintenance: mt!,
  }
}

export function buildDigestEmail(d: DigestData) {
  const status = Object.keys(STATUS_TH)
    .filter((k) => d.vehicles.byStatus[k])
    .map((k) => `${STATUS_TH[k]} ${d.vehicles.byStatus[k]}`)
    .join(' · ')
  const lines = [`สรุปกองยานของวันที่ ${d.dateLabel}`, '', `■ สถานะรถตอนนี้ (${d.vehicles.total} คัน)`, `  ${status || '–'}`]
  if (d.lowBattery.length) lines.push(`  แบตต่ำกว่า 30%: ${d.lowBattery.map((v) => `${v.id} (${v.soc}%)`).join(', ')}`)
  if (d.offline.length) lines.push(`  ออฟไลน์: ${d.offline.map((v) => (v.lastSeen ? `${v.id} (เห็นล่าสุด ${v.lastSeen})` : v.id)).join(', ')}`)
  lines.push(
    '',
    '■ แจ้งเตือนเมื่อวาน',
    `  วิกฤต ${d.alerts.critical} · เตือน ${d.alerts.warning} · ข้อมูล ${d.alerts.info}`,
    `  ที่ยังไม่ได้รับทราบตอนนี้ (วิกฤต/เตือน): ${d.alerts.openUnacked}${d.alerts.openCritical ? ` — วิกฤต ${d.alerts.openCritical}` : ''}`,
    '',
    '■ การชาร์จเมื่อวาน',
    `  ${d.charging.sessions} เซสชัน · ${fmt(d.charging.kwh)} kWh · ฿${fmt(d.charging.cost)}`,
  )
  if (d.maintenance.overdue || d.maintenance.dueSoon) {
    lines.push('', '■ งานซ่อมบำรุง', `  เกินกำหนด ${d.maintenance.overdue} · ครบกำหนดใน 7 วัน ${d.maintenance.dueSoon}`)
  }
  lines.push('', `เปิดแดชบอร์ด: ${config.appBaseUrl}/dashboard`, '', 'ปิดการรับสรุปรายวันได้ที่ "บัญชีของฉัน" > การแจ้งเตือนทางอีเมล (ผู้ดูแลปิดทั้งระบบได้ที่ ตั้งค่า > เกณฑ์การแจ้งเตือน)')
  return {
    subject: `EV Monitor: สรุปกองยานประจำวันที่ ${d.dateLabel}${d.alerts.openCritical ? ` (วิกฤตค้าง ${d.alerts.openCritical})` : ''}`,
    text: lines.join('\n'),
  }
}

export type DigestResult = { sent: number; skipped?: 'mail-off' | 'disabled' | 'not-time' | 'already-sent' | 'no-vehicles' | 'no-recipients' | 'failed' }

/**
 * ส่งสรุปรายวัน (เรียกจากงานเบื้องหลังทุกนาที): เมื่อถึงชั่วโมง DIGEST_HOUR_TH (เวลาไทย, ค่าเริ่มต้น 08) และยังไม่เคยส่งวันนี้
 * - เคารพสวิตช์ notify.dailyDigest (ตั้งค่า) และตัวเลือกรายบุคคล (บัญชีของฉัน); ผู้รับ = admin/manager ที่ active
 * - จอง app_settings.digest_last_date แบบอะตอมมิก; ส่งไม่สำเร็จเลยสักคน → คืนการจอง (ลองใหม่รอบถัดไป)
 * - ไม่ส่งถ้ายังไม่มีรถ (ติดตั้งใหม่ว่างเปล่า) เพื่อไม่ให้ได้อีเมลว่าง ๆ
 */
export async function runDailyDigest(pool: Pool, mailer: Mailer, hour = config.digestHourTh, latestHour = LATEST_HOUR_TH): Promise<DigestResult> {
  if (mailer.mode === 'off') return { sent: 0, skipped: 'mail-off' }
  const gate = await one<{ on: boolean; hr: number; sent_today: boolean }>(
    pool,
    `select coalesce((notify->>'dailyDigest')::boolean, false) as "on",
            extract(hour from now() at time zone 'Asia/Bangkok')::int as hr,
            coalesce(digest_last_date >= ${TODAY}, false) as sent_today
       from app_settings where id = 1`,
  )
  if (!gate?.on) return { sent: 0, skipped: 'disabled' }
  if (gate.hr < hour || gate.hr >= latestHour) return { sent: 0, skipped: 'not-time' }
  if (gate.sent_today) return { sent: 0, skipped: 'already-sent' }

  const claimed = await one<{ d: string }>(
    pool,
    `update app_settings set digest_last_date = ${TODAY}
      where id = 1 and (digest_last_date is null or digest_last_date < ${TODAY}) returning digest_last_date::text as d`,
  )
  if (!claimed) return { sent: 0, skipped: 'already-sent' }
  const release = () => pool.query(`update app_settings set digest_last_date = digest_last_date - 1 where id = 1 and digest_last_date = $1::date`, [claimed.d])

  const to = (
    await rows<{ email: string }>(
      pool,
      `select email from users where status = 'active' and role in ('admin', 'manager') and coalesce((notify_prefs->>'dailyDigest')::boolean, true) order by email`,
    )
  ).map((u) => u.email)
  if (to.length === 0) return { sent: 0, skipped: 'no-recipients' }
  const data = await gatherDigest(pool)
  if (data.vehicles.total === 0) return { sent: 0, skipped: 'no-vehicles' }

  const mail = buildDigestEmail(data)
  let sent = 0
  for (const addr of to) {
    try {
      await mailer.send({ to: addr, ...mail })
      sent++
    } catch {
      /* ผู้รับรายนี้ส่งไม่ได้ — ไปคนถัดไป */
    }
  }
  if (sent === 0) {
    await release()
    return { sent: 0, skipped: 'failed' }
  }
  return { sent }
}
