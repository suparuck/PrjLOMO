import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool, PoolClient } from 'pg'
import { requireRole } from '../auth'
import { one, rows, withTx } from '../db'
import { invalid, notFound } from '../errors'
import { checkDriverFields } from '../lib/validators'
import { EVENT_LABELS, EVENT_ORDER } from '../lib/labels'
import { DRIVER_SELECT } from '../services/queries'

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

    app.get('/drivers', { preValidation: mgr, schema: { tags: ['drivers'], summary: 'รายชื่อคนขับพร้อมสถิติ 30 วัน', security: sec } }, async () =>
      rows(pool, `${DRIVER_SELECT} order by d.id`),
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
