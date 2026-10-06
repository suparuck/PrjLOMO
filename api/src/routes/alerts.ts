import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { one, rows } from '../db'
import { notFound } from '../errors'
import { ALERT_COLS } from '../services/queries'
import { PageQuery, envelope, pageArgs } from '../lib/paging'

import { sec } from '../security'

export const alertRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const mgr = requireRole(pool, 'manager')

    app.get(
      '/alerts',
      {
        preValidation: mgr,
        schema: {
          tags: ['alerts'],
          summary: 'รายการแจ้งเตือน (ใหม่ → เก่า)',
          security: sec,
          querystring: Type.Object({
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 200 })),
            ...PageQuery,
            severity: Type.Optional(Type.Union([Type.Literal('critical'), Type.Literal('warning'), Type.Literal('info')])),
            type: Type.Optional(Type.Union([Type.Literal('battery'), Type.Literal('charging'), Type.Literal('device'), Type.Literal('maint'), Type.Literal('driving'), Type.Literal('geofence')])),
          }),
        },
      },
      async (req) => {
        const pg = pageArgs(req.query)
        // ไม่ส่ง page: พฤติกรรมเดิม (ล่าสุด N รายการ ใช้กับตัวเลขบนเมนู)
        if (!pg.paged) return rows(pool, `select ${ALERT_COLS} from alerts a order by a.created_at desc, a.id desc limit $1`, [req.query.limit ?? 200])

        const where: string[] = []
        const args: unknown[] = []
        if (req.query.severity) where.push(`a.severity = $${args.push(req.query.severity)}`)
        if (req.query.type) where.push(`a.type = $${args.push(req.query.type)}`)
        const cond = where.length ? `where ${where.join(' and ')}` : ''
        const [list, total, counts] = await Promise.all([
          rows(pool, `select ${ALERT_COLS} from alerts a ${cond} order by a.created_at desc, a.id desc limit ${pg.pageSize} offset ${pg.offset}`, args),
          one<{ n: number }>(pool, `select count(*)::int as n from alerts a ${cond}`, args),
          // จำนวนทั้งหมด/ที่ยังไม่รับทราบแยกตามระดับ (ไม่ขึ้นกับตัวกรอง) สำหรับชิปและ KPI
          rows<{ severity: string; total: number; open: number }>(
            pool,
            'select severity, count(*)::int as total, count(*) filter (where acknowledged_at is null)::int as open from alerts group by severity',
          ),
        ])
        return envelope(list, total!.n, pg.page, pg.pageSize, { summary: { bySeverity: Object.fromEntries(counts.map((c) => [c.severity, { total: c.total, open: c.open }])) } })
      },
    )

    // เวลาตอบสนองเฉลี่ย (นาที) จากแจ้งเตือนที่รับทราบแล้วใน 30 วัน
    app.get('/alerts/stats', { preValidation: mgr, schema: { tags: ['alerts'], summary: 'สถิติการแจ้งเตือน', security: sec } }, async () => {
      const r = await one<{ avg: number | null; open: number }>(
        pool,
        `select round((avg(extract(epoch from acknowledged_at - created_at)) / 60)::numeric, 1)::float8 as avg,
                (select count(*)::int from alerts where acknowledged_at is null) as open
           from alerts where acknowledged_at is not null and created_at >= now() - interval '30 days'`,
      )
      return { avgResponseMinutes: r?.avg ?? null, openCount: r?.open ?? 0 }
    })

    app.post(
      '/alerts/ack-all',
      { preValidation: mgr, schema: { tags: ['alerts'], summary: 'รับทราบทั้งหมด', security: sec } },
      async (req) => {
        const r = await pool.query(`update alerts set acknowledged_at = now(), acknowledged_by = $1 where acknowledged_at is null`, [req.user!.id])
        return { acknowledged: r.rowCount ?? 0 }
      },
    )

    app.post(
      '/alerts/:id/ack',
      { preValidation: mgr, schema: { tags: ['alerts'], summary: 'รับทราบการแจ้งเตือน (รับทราบซ้ำได้ ไม่เปลี่ยนเวลาเดิม)', params: Type.Object({ id: Type.Integer() }), security: sec } },
      async (req) => {
        // UPDATE ก่อน แล้ว SELECT ใหม่ (SELECT ใน CTE เดียวกันจะมองไม่เห็นผลของ UPDATE)
        await pool.query('update alerts set acknowledged_at = now(), acknowledged_by = $2 where id = $1 and acknowledged_at is null', [req.params.id, req.user!.id])
        const a = await one(pool, `select ${ALERT_COLS} from alerts a where a.id = $1`, [req.params.id])
        if (!a) throw notFound('การแจ้งเตือน')
        return a
      },
    )

    // ---- กฎการแจ้งเตือน / ช่องทาง ----
    app.get('/alert-rules', { preValidation: mgr, schema: { tags: ['alerts'], summary: 'กฎการแจ้งเตือน', security: sec } }, async () =>
      rows(pool, 'select key, title, text, enabled from alert_rules order by sort'),
    )

    app.patch(
      '/alert-rules/:key',
      {
        preValidation: mgr,
        schema: { tags: ['alerts'], summary: 'เปิด/ปิดกฎการแจ้งเตือน', params: Type.Object({ key: Type.String() }), body: Type.Object({ enabled: Type.Boolean() }), security: sec },
      },
      async (req) => {
        const r = await one(pool, 'update alert_rules set enabled = $2 where key = $1 returning key, title, text, enabled', [req.params.key, req.body.enabled])
        if (!r) throw notFound('กฎการแจ้งเตือน')
        return r
      },
    )

    app.get('/notification-channels', { preValidation: mgr, schema: { tags: ['alerts'], summary: 'ช่องทางแจ้งเตือน', security: sec } }, async () =>
      rows(pool, 'select key, name, detail, icon, tone, enabled from notification_channels order by sort'),
    )
  }
