import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool, PoolClient } from 'pg'
import { requireRole } from '../auth'
import { one, rows, withTx } from '../db'
import { invalid, notFound } from '../errors'
import { checkDriverFields } from '../lib/validators'
import { EVENT_LABELS, EVENT_ORDER } from '../lib/labels'
import { DRIVER_SELECT } from '../services/queries'
import { PageQuery, envelope, likeTerm, pageArgs } from '../lib/paging'

import { sec } from '../security'

/** มอบหมายรถประจำให้คนขับ: รถต้องมีอยู่และต้องยังไม่มีคนขับประจำ (หรือเป็นของคนขับคนนี้อยู่แล้ว) */
async function assignVehicle(c: PoolClient, driverId: string, vehicleId: string) {
  const v = await one<{ driver_id: string | null }>(c, 'select driver_id from vehicles where id = $1 for update', [vehicleId])
  if (!v) throw invalid({ vehicleId: 'ไม่พบรถที่เลือก' })
  if (v.driver_id && v.driver_id !== driverId) throw invalid({ vehicleId: 'รถคันนี้มีคนขับประจำแล้ว' })
  await c.query('update vehicles set driver_id = null where driver_id = $1 and id <> $2', [driverId, vehicleId]) // ย้ายจากรถคันเดิม
  await c.query('update vehicles set driver_id = $1 where id = $2', [driverId, vehicleId])
}

export const driverRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const mgr = requireRole(pool, 'manager')

    app.get(
      '/drivers',
      {
        preValidation: mgr,
        schema: {
          tags: ['drivers'],
          summary: 'รายชื่อคนขับพร้อมสถิติ 30 วัน — ไม่ส่ง page = อาร์เรย์ทั้งหมด; ส่ง page = แบ่งหน้าตามอันดับคะแนน (ค้นหา q) พร้อมรถประจำ อันดับ และ summary ทั้งหมด',
          security: sec,
          querystring: Type.Object({ ...PageQuery, q: Type.Optional(Type.String({ maxLength: 100 })) }),
        },
      },
      async (req) => {
        const pg = pageArgs(req.query)
        if (!pg.paged) return rows(pool, `${DRIVER_SELECT} order by d.id`)

        // อันดับคำนวณจากคนขับทั้งหมดก่อนกรองด้วยคำค้น (คนที่ยังไม่มีคะแนนไม่มีอันดับและอยู่ท้ายตาราง)
        const ranked = `with ranked as (
            select d.id, d.name, d.phone, d.score, s.km_30d::float8 as "km30d", s.trips_30d as "trips30d", s.events_30d as "events30d",
                   v.id as "vehicleId", v.model as "vehicleModel", v.efficiency as "vehicleEfficiency", v.status as "vehicleStatus",
                   case when d.score is not null then row_number() over (order by d.score desc nulls last, d.id) end::int as rank
              from drivers d join v_driver_stats s on s.driver_id = d.id left join vehicles v on v.driver_id = d.id)`
        const args: unknown[] = []
        const cond = req.query.q?.trim() ? `where name ilike $${args.push(likeTerm(req.query.q))} or phone ilike $1` : ''
        const [list, total, summary] = await Promise.all([
          rows(pool, `${ranked} select * from ranked ${cond} order by rank nulls last, id limit ${pg.pageSize} offset ${pg.offset}`, args),
          one<{ n: number }>(pool, `${ranked} select count(*)::int as n from ranked ${cond}`, args),
          // ภาพรวมคนขับทั้งหมด (ไม่ขึ้นกับคำค้น/หน้า) สำหรับ KPI
          one(
            pool,
            `${ranked} select count(*)::int as total, count(score)::int as scored,
                   coalesce(round(avg(score))::int, 0) as "avgScore", (count(*) filter (where score >= 85))::int as good,
                   coalesce(sum("km30d"), 0)::float8 as "totalKm", coalesce(sum("events30d"), 0)::int as events,
                   (count(*) filter (where "vehicleId" is not null and "vehicleStatus" <> 'offline'))::int as working
              from ranked`,
          ),
        ])
        return envelope(list, total!.n, pg.page, pg.pageSize, { summary })
      },
    )

    // เหตุการณ์การขับขี่ 30 วัน แยกตามประเภท (กราฟโดนัท)
    app.get('/drivers/events', { preValidation: mgr, schema: { tags: ['drivers'], summary: 'จำนวนเหตุการณ์การขับขี่ 30 วัน แยกประเภท', security: sec } }, async () => {
      const list = await rows<{ type: string; count: number }>(
        pool,
        `select type::text as type, count(*)::int as count from driving_events where occurred_at >= now() - interval '30 days' group by type`,
      )
      const m = new Map(list.map((r) => [r.type, r.count]))
      return EVENT_ORDER.map((t) => ({ type: t, label: EVENT_LABELS[t], count: m.get(t) ?? 0 }))
    })

    app.post(
      '/drivers',
      {
        preValidation: mgr,
        schema: {
          tags: ['drivers'],
          summary: 'เพิ่มคนขับ (ยังไม่มีคะแนนจนกว่าจะมีทริป)',
          security: sec,
          body: Type.Object({
            name: Type.String({ maxLength: 100 }),
            phone: Type.String({ maxLength: 30 }),
            vehicleId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
          }),
        },
      },
      async (req, reply) => {
        const f = checkDriverFields({ name: req.body.name, phone: req.body.phone })
        const created = await withTx(pool, async (c) => {
          const d = await one<{ id: string }>(c, 'insert into drivers (name, phone) values ($1, $2) returning id', [f.name, f.phone])
          if (req.body.vehicleId) await assignVehicle(c, d!.id, req.body.vehicleId)
          return one(c, `${DRIVER_SELECT} where d.id = $1`, [d!.id])
        })
        return reply.status(201).send(created)
      },
    )

    app.patch(
      '/drivers/:id',
      {
        preValidation: mgr,
        schema: {
          tags: ['drivers'],
          summary: 'แก้ไขคนขับ (ชื่อ เบอร์โทร รถประจำ — vehicleId เป็น null เพื่อยกเลิกการมอบหมาย)',
          params: Type.Object({ id: Type.String() }),
          security: sec,
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 100 })),
            phone: Type.Optional(Type.String({ maxLength: 30 })),
            vehicleId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
          }),
        },
      },
      async (req) => {
        const f = checkDriverFields({ name: req.body.name, phone: req.body.phone }, true)
        return withTx(pool, async (c) => {
          const cur = await one(c, 'select 1 from drivers where id = $1 for update', [req.params.id])
          if (!cur) throw notFound('คนขับ')
          await c.query('update drivers set name = coalesce($2, name), phone = coalesce($3, phone) where id = $1', [req.params.id, f.name ?? null, f.phone ?? null])
          if (req.body.vehicleId === null) await c.query('update vehicles set driver_id = null where driver_id = $1', [req.params.id])
          else if (req.body.vehicleId) await assignVehicle(c, req.params.id, req.body.vehicleId)
          return one(c, `${DRIVER_SELECT} where d.id = $1`, [req.params.id])
        })
      },
    )
  }
