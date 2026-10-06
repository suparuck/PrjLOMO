import type { Pool } from 'pg'
import { rows, withTx, one } from '../db'
import { publishChange } from './events'
import type { Mailer } from './mailer'
import { runDueSchedules } from './reportMail'
import type { LineClient } from './line'
import { currentAlertFloor, runLineNotify } from './lineNotify'
import { createAlert, enabledRules, hasOpenAlert, loadThresholds } from './ops'

/** ล็อกระดับฐานข้อมูล: ถ้ามี API หลายอินสแตนซ์ จะมีเพียงหนึ่งตัวที่ตรวจในแต่ละรอบ */
const OFFLINE_LOCK = 727401

/**
 * ตรวจรถที่เงียบ: รถที่ไม่เคยส่งข้อมูลนานกว่าเกณฑ์ `offlineMinutes` (ตั้งค่า) → สถานะ "ออฟไลน์"
 * และสร้างแจ้งเตือนครั้งเดียวต่อเหตุการณ์ (ตามกฎ "รถออฟไลน์" ที่เปิดอยู่ ไม่แจ้งซ้ำถ้ามีของเดิมที่ยังไม่รับทราบ)
 * รถที่ยังไม่เคยส่งข้อมูลเลย (last_seen_at ว่าง) ไม่ถูกแตะ — ส่งข้อมูลกลับมาเมื่อไหร่ สถานะคำนวณใหม่เองใน /ingest/telemetry
 */
export async function runOfflineCheck(pool: Pool): Promise<{ marked: string[]; skipped: boolean }> {
  return withTx(pool, async (c) => {
    const lock = await one<{ ok: boolean }>(c, 'select pg_try_advisory_xact_lock($1) as ok', [OFFLINE_LOCK])
    if (!lock?.ok) return { marked: [], skipped: true }

    const t = await loadThresholds(c)
    const rules = await enabledRules(c)
    const gone = await rows<{ id: string }>(
      c,
      `update vehicles set status = 'offline'
        where status <> 'offline' and last_seen_at is not null
          and last_seen_at < now() - ($1::int * interval '1 minute')
        returning id`,
      [t.offlineMinutes],
    )
    for (const v of gone) {
      if (!rules.has('offline')) continue
      if (await hasOpenAlert(c, v.id, 'device', 'warning')) continue
      await createAlert(c, { severity: 'warning', type: 'device', title: 'รถออฟไลน์', text: `${v.id} ไม่ส่งข้อมูลมากกว่า ${t.offlineMinutes} นาที`, vehicleId: v.id })
    }
    return { marked: gone.map((v) => v.id).sort(), skipped: false }
  })
}

interface Logger {
  info: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

/** เริ่ม job ตามเวลา — คืนฟังก์ชันหยุด (intervalSeconds <= 0 = ปิด) */
export function startJobs(pool: Pool, log: Logger, intervalSeconds: number, mailer?: Mailer, line?: LineClient): () => void {
  if (intervalSeconds <= 0) {
    log.info({}, 'background jobs disabled (OFFLINE_CHECK_INTERVAL_SECONDS=0)')
    return () => undefined
  }
  const tick = async () => {
    try {
      if (mailer) {
        const s = await runDueSchedules(pool, mailer)
        if (s.sent.length || s.failed.length) log.info(s, 'report schedules: ran due schedules')
      }
      const r = await runOfflineCheck(pool)
      if (r.marked.length) {
        log.info({ marked: r.marked }, 'offline check: vehicles marked offline')
        publishChange()
      }
    } catch (err) {
      log.error({ err }, 'offline check failed')
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalSeconds * 1000)
  timer.unref() // ไม่ให้ timer ค้าง process ตอนปิดระบบ

  // ส่งแจ้งเตือนใหม่เข้า LINE: ตรวจถี่กว่า (15 วินาที) เพื่อให้ถึงมือเร็ว; ไม่แตะแจ้งเตือนที่มีอยู่ก่อนเริ่มระบบ
  let lineTimer: ReturnType<typeof setInterval> | undefined
  if (line?.configured) {
    void currentAlertFloor(pool).then((floor) => {
      lineTimer = setInterval(() => {
        runLineNotify(pool, line, floor).catch((err) => log.error({ err }, 'line notify failed'))
      }, 15_000)
      lineTimer.unref()
    })
  }
  return () => {
    clearInterval(timer)
    if (lineTimer) clearInterval(lineTimer)
  }
}
