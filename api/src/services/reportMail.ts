import type { Pool } from 'pg'
import { config } from '../config'
import { one, rows } from '../db'
import { nextRun, type Frequency } from '../lib/schedule'
import type { Mailer } from './mailer'
import { computeReport, type ReportPeriod } from './report'
import { PERIOD_LABEL, XLSX_TYPE, buildReportXlsx } from './reportXlsx'

export interface ScheduleRow {
  id: string
  frequency: Frequency
  weekday: number | null
  month_day: number | null
  send_hour: number
  recipients: string[]
  period: ReportPeriod
  brand: string
  next_run_at: Date
}

const th = (n: number, d = 0) => n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })

/** อีเมลสรุปรายงาน (ข้อความล้วน) + ลิงก์ไปหน้ารายงานเพื่อดูกราฟและส่งออก Excel */
export async function buildReportEmail(pool: Pool, s: Pick<ScheduleRow, 'period' | 'brand'>) {
  const r = await computeReport(pool, s.period, s.brand)
  const t = r.totals
  const scope = s.brand === 'all' ? 'รถทุกคัน' : `เฉพาะ ${s.brand}`
  const text = [
    `รายงานกองยาน EV — ${PERIOD_LABEL[s.period]} (${scope})`,
    '',
    `พลังงานที่ใช้       ${th(t.kwh)} kWh (${t.kwhChangePct >= 0 ? '+' : ''}${t.kwhChangePct}% จากช่วงก่อน)`,
    `ค่าไฟรวม            ${th(t.cost)} บาท (เฉลี่ย ${th(t.avgPricePerKwh, 2)} บาท/kWh)`,
    `ระยะทางรวม          ${th(t.km)} กม. · ต้นทุน ${th(t.costPerKm, 2)} บาท/กม. (น้ำมัน ${th(t.oilCostPerKm, 2)} บาท/กม.)`,
    `ประหยัดเชื้อเพลิง    ${th(t.fuelSavings)} บาท`,
    `CO₂ ที่ลดได้         ${th(r.carbon.avoidedTons, 1)} ตัน (การปล่อยจากไฟฟ้า ${th(r.carbon.gridTons, 1)} ตัน)`,
    `จำนวนรถ             ${t.vehicleCount} คัน`,
    '',
    `ไฟล์ Excel ฉบับเต็มแนบมากับอีเมลนี้ · ดูกราฟและรายงานออนไลน์: ${config.appBaseUrl}/reports`,
    '',
    'อีเมลนี้ส่งตามเวลาที่ตั้งไว้ในหน้ารายงาน > ตั้งเวลาส่งรายงาน',
  ].join('\n')
  return { subject: `รายงานกองยาน EV — ${PERIOD_LABEL[s.period]}`, text }
}

async function deliver(pool: Pool, mailer: Mailer, s: ScheduleRow): Promise<{ ok: boolean; error?: string }> {
  if (mailer.mode === 'off') return { ok: false, error: 'ยังไม่ได้ตั้งค่าอีเมลของระบบ (SMTP_URL)' }
  try {
    const mail = await buildReportEmail(pool, s)
    // แนบ Excel ฉบับเต็ม — สร้างไม่ได้ก็ยังส่งอีเมลสรุปตามปกติ (ผู้รับยังเข้าลิงก์ในอีเมลได้)
    let attachments: NonNullable<Parameters<Mailer['send']>[0]['attachments']> | undefined
    try {
      const date = new Date().toISOString().slice(0, 10)
      attachments = [{ filename: `ev-monitor-report-${date}.xlsx`, content: await buildReportXlsx(pool, s.period, s.brand), contentType: XLSX_TYPE }]
    } catch (err) {
      console.error('[report] สร้างไฟล์ Excel แนบไม่สำเร็จ:', err instanceof Error ? err.message : err)
    }
    // ส่งทีละผู้รับ: ที่อยู่หนึ่งเสียไม่ทำให้คนอื่นไม่ได้รับ และผู้รับไม่เห็นรายชื่อของกันและกัน
    const failed: string[] = []
    for (const to of s.recipients) {
      try {
        await mailer.send({ to, ...mail, attachments })
      } catch {
        failed.push(to)
      }
    }
    return failed.length ? { ok: false, error: `ส่งไม่สำเร็จ: ${failed.join(', ')}` } : { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'สร้างรายงานไม่สำเร็จ' }
  }
}

/** ส่งทันทีเพื่อทดสอบ (ไม่เปลี่ยนเวลาส่งถัดไป) */
export async function sendScheduleNow(pool: Pool, mailer: Mailer, id: string) {
  const s = await one<ScheduleRow>(pool, 'select * from report_schedules where id = $1', [id])
  if (!s) return null
  const r = await deliver(pool, mailer, s)
  await pool.query('update report_schedules set last_run_at = now(), last_status = $2, last_error = $3 where id = $1', [id, r.ok ? 'sent' : 'failed', r.error ?? null])
  return r
}

/**
 * ส่งรายงานที่ถึงเวลา — "จอง" ก่อนส่งด้วยการเลื่อน next_run_at ไปอนาคตแบบอะตอมมิก (where next_run_at <= now(); ไม่เทียบค่าเดิมเพราะ JS ตัดไมโครวินาทีของ timestamptz)
 * ถ้ามีหลาย API อินสแตนซ์ จะมีตัวเดียวที่จองสำเร็จ จึงไม่ส่งซ้ำ · ถ้าระบบหยุดไปนาน ส่งครั้งเดียวแล้วนับต่อจากตอนนี้
 */
export async function runDueSchedules(pool: Pool, mailer: Mailer): Promise<{ sent: string[]; failed: string[] }> {
  const due = await rows<ScheduleRow>(pool, `select * from report_schedules where enabled and next_run_at <= now() order by next_run_at limit 20`)
  const out = { sent: [] as string[], failed: [] as string[] }
  for (const s of due) {
    const next = nextRun({ frequency: s.frequency, weekday: s.weekday, monthDay: s.month_day, hour: s.send_hour }, new Date())
    const claimed = await one(pool, 'update report_schedules set next_run_at = $2 where id = $1 and enabled and next_run_at <= now() returning id', [s.id, next])
    if (!claimed) continue
    const r = await deliver(pool, mailer, s)
    await pool.query('update report_schedules set last_run_at = now(), last_status = $2, last_error = $3 where id = $1', [s.id, r.ok ? 'sent' : 'failed', r.error ?? null])
    ;(r.ok ? out.sent : out.failed).push(s.id)
  }
  return out
}
