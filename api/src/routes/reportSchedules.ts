import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type, type Static } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { one, rows } from '../db'
import { invalid, notFound } from '../errors'
import { checkEmail } from '../lib/validators'
import { nextRun } from '../lib/schedule'
import { sec } from '../security'
import type { Mailer } from '../services/mailer'
import { sendScheduleNow } from '../services/reportMail'

const COLS = `id, frequency, weekday, month_day as "monthDay", send_hour as hour, recipients, period, brand, enabled,
  next_run_at as "nextRunAt", last_run_at as "lastRunAt", last_status as "lastStatus", last_error as "lastError"`

const Body = Type.Object({
  frequency: Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')]),
  weekday: Type.Optional(Type.Integer({ minimum: 0, maximum: 6 })),
  monthDay: Type.Optional(Type.Integer({ minimum: 1, maximum: 28 })),
  hour: Type.Integer({ minimum: 0, maximum: 23 }),
  recipients: Type.Array(Type.String({ maxLength: 200 }), { minItems: 1, maxItems: 10 }),
  period: Type.Union([Type.Literal('year'), Type.Literal('q3'), Type.Literal('sep')]),
  brand: Type.Union([Type.Literal('all'), Type.Literal('BYD'), Type.Literal('MG')]),
  enabled: Type.Optional(Type.Boolean()),
})

const IdParam = Type.Object({ id: Type.String({ format: 'uuid' }) })

/** ตรวจกฎ → ค่าที่พร้อมบันทึก (weekday/monthDay ต้องตรงกับความถี่ ผู้รับไม่ซ้ำ) */
function normalize(b: Static<typeof Body>) {
  const errors: Record<string, string> = {}
  if (b.frequency === 'weekly' && b.weekday === undefined) errors.weekday = 'กรุณาเลือกวันในสัปดาห์'
  if (b.frequency === 'monthly' && b.monthDay === undefined) errors.monthDay = 'กรุณาเลือกวันที่ในเดือน (1–28)'
  const list: string[] = []
  for (const raw of b.recipients) {
    try {
      list.push(checkEmail(raw))
    } catch {
      errors.recipients = `อีเมลผู้รับไม่ถูกต้อง: ${raw.trim() || '(ว่าง)'}`
      break
    }
  }
  const unique = [...new Set(list)]
  if (!errors.recipients && unique.length === 0) errors.recipients = 'กรุณาระบุอีเมลผู้รับอย่างน้อย 1 ราย'
  if (Object.keys(errors).length) throw invalid(errors)
  const weekday = b.frequency === 'weekly' ? b.weekday! : null
  const monthDay = b.frequency === 'monthly' ? b.monthDay! : null
  return { weekday, monthDay, recipients: unique, next: nextRun({ frequency: b.frequency, weekday, monthDay, hour: b.hour }, new Date()) }
}

export const reportScheduleRoutes =
  (pool: Pool, mailer: Mailer): FastifyPluginAsyncTypebox =>
  async (app) => {
    const mgr = requireRole(pool, 'manager')

    app.get('/report-schedules', { preValidation: mgr, schema: { tags: ['reports'], summary: 'ตารางเวลาส่งรายงานทางอีเมล (พร้อมบอกว่าระบบตั้งค่าอีเมลแล้วหรือไม่)', security: sec } }, async () => ({
      mailEnabled: mailer.mode !== 'off',
      items: await rows(pool, `select ${COLS} from report_schedules order by created_at`),
    }))

    app.post(
      '/report-schedules',
      { preValidation: mgr, schema: { tags: ['reports'], summary: 'เพิ่มตารางเวลาส่งรายงาน', body: Body, security: sec } },
      async (req, reply) => {
        const b = req.body
        const n = normalize(b)
        const row = await one(
          pool,
          `insert into report_schedules (frequency, weekday, month_day, send_hour, recipients, period, brand, enabled, next_run_at, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${COLS}`,
          [b.frequency, n.weekday, n.monthDay, b.hour, n.recipients, b.period, b.brand, b.enabled ?? true, n.next, req.user!.id],
        )
        return reply.status(201).send(row)
      },
    )

    app.put(
      '/report-schedules/:id',
      { preValidation: mgr, schema: { tags: ['reports'], summary: 'แก้ตารางเวลาส่งรายงาน (คำนวณเวลาส่งถัดไปใหม่)', params: IdParam, body: Body, security: sec } },
      async (req) => {
        const b = req.body
        const n = normalize(b)
        const row = await one(
          pool,
          `update report_schedules set frequency = $2, weekday = $3, month_day = $4, send_hour = $5, recipients = $6, period = $7, brand = $8,
                  enabled = $9, next_run_at = $10
            where id = $1 returning ${COLS}`,
          [req.params.id, b.frequency, n.weekday, n.monthDay, b.hour, n.recipients, b.period, b.brand, b.enabled ?? true, n.next],
        )
        if (!row) throw notFound('ตารางเวลา')
        return row
      },
    )

    app.delete(
      '/report-schedules/:id',
      { preValidation: mgr, schema: { tags: ['reports'], summary: 'ลบตารางเวลาส่งรายงาน', params: IdParam, security: sec } },
      async (req) => {
        const r = await one(pool, 'delete from report_schedules where id = $1 returning id', [req.params.id])
        if (!r) throw notFound('ตารางเวลา')
        return { deleted: true }
      },
    )

    app.post(
      '/report-schedules/:id/send-now',
      {
        preValidation: mgr,
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: { tags: ['reports'], summary: 'ส่งรายงานทันทีเพื่อทดสอบ (ไม่เปลี่ยนเวลาส่งถัดไป)', params: IdParam, security: sec },
      },
      async (req) => {
        const r = await sendScheduleNow(pool, mailer, req.params.id)
        if (!r) throw notFound('ตารางเวลา')
        if (!r.ok) throw invalid({ _: r.error ?? 'ส่งไม่สำเร็จ' })
        return { sent: true }
      },
    )
  }
