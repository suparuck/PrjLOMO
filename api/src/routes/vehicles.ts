import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { one, rows, withTx } from '../db'
import { conflict, invalid, notFound } from '../errors'
import { checkVehicleFields } from '../lib/validators'
import { DRIVER_SELECT, VEHICLE_COLS } from '../services/queries'
import { estimateRangeKm } from '../services/ops'
import { loadConfig } from '../services/report'
import { PageQuery, envelope, likeTerm, pageArgs } from '../lib/paging'

import { sec } from '../security'
const IdParam = Type.Object({ id: Type.String() })

export const vehicleRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const mgr = requireRole(pool, 'manager')

    const SORTS = {
      id: 'v.id',
      'soc-asc': 'v.soc, v.id',
      'soc-desc': 'v.soc desc, v.id',
      'range-desc': 'v.range_km desc, v.id',
    } as const

    /** ภาพรวมทั้งกอง (ไม่ขึ้นกับตัวกรอง/หน้า) สำหรับ KPI และจำนวนบนชิปสถานะ */
    async function fleetSummary() {
      const r = await one<{ total: number; rangeKm: number; avgSoh: number; odometerKm: number; models: string[] }>(
        pool,
        `select count(*)::int as total, coalesce(sum(range_km), 0)::int as "rangeKm",
                coalesce(round(avg(soh)::numeric, 1), 0)::float8 as "avgSoh",
                coalesce(sum(odometer_km), 0)::float8 as "odometerKm",
                coalesce(array_agg(distinct model), '{}') as models
           from vehicles`,
      )
      const byStatus = await rows<{ status: string; n: number }>(pool, 'select status, count(*)::int as n from vehicles group by status')
      return { ...r!, byStatus: Object.fromEntries(byStatus.map((x) => [x.status, x.n])) }
    }

    app.get(
      '/vehicles',
      {
        preValidation: mgr,
        schema: {
          tags: ['vehicles'],
          summary: 'รายการรถ — ไม่ส่ง page = อาร์เรย์ทั้งหมด; ส่ง page = แบ่งหน้า (ค้นหา q กรองสถานะ เรียง) พร้อม summary ของรถทั้งกอง',
          security: sec,
          querystring: Type.Object({
            ...PageQuery,
            q: Type.Optional(Type.String({ maxLength: 100 })),
            status: Type.Optional(Type.Union([Type.Literal('driving'), Type.Literal('charging'), Type.Literal('parked'), Type.Literal('low'), Type.Literal('offline')])),
            sort: Type.Optional(Type.Union([Type.Literal('id'), Type.Literal('soc-asc'), Type.Literal('soc-desc'), Type.Literal('range-desc')], { default: 'id' })),
          }),
        },
      },
      async (req) => {
        const { q, status, sort } = req.query
        const pg = pageArgs(req.query)
        if (!pg.paged) return rows(pool, `select ${VEHICLE_COLS} from vehicles v order by v.id`)

        const where: string[] = []
        const args: unknown[] = []
        if (status) where.push(`v.status = $${args.push(status)}`)
        if (q?.trim()) {
          const p = `$${args.push(likeTerm(q))}`
          where.push(`(v.id ilike ${p} or v.model ilike ${p} or v.plate ilike ${p} or v.location_text ilike ${p} or d.name ilike ${p})`)
        }
        const cond = where.length ? `where ${where.join(' and ')}` : ''
        const from = 'from vehicles v left join drivers d on d.id = v.driver_id'
        const [list, total, summary] = await Promise.all([
          rows(pool, `select ${VEHICLE_COLS} ${from} ${cond} order by ${SORTS[sort ?? 'id']} limit ${pg.pageSize} offset ${pg.offset}`, args),
          one<{ n: number }>(pool, `select count(*)::int as n ${from} ${cond}`, args),
          fleetSummary(),
        ])
        return envelope(list, total!.n, pg.page, pg.pageSize, { summary })
      },
    )

    app.get(
      '/vehicles/:id',
      { preValidation: mgr, schema: { tags: ['vehicles'], summary: 'รายละเอียดรถ: คนขับ กราฟ SoC 24 ชม. ทริปล่าสุด การบำรุงรักษา', params: IdParam, security: sec } },
      async (req) => {
        const vehicle = await one(pool, `select ${VEHICLE_COLS} from vehicles v where v.id = $1`, [req.params.id])
        if (!vehicle) throw notFound('รถ')

        const [driver, series, trips, maintenance] = await Promise.all([
          vehicle.driverId ? one(pool, `${DRIVER_SELECT} where d.id = $1`, [vehicle.driverId]) : Promise.resolve(null),
          // ค่าล่าสุดของแต่ละชั่วโมงใน 24 ชม.ที่ผ่านมา
          rows<{ label: string; soc: number }>(
            pool,
            `select to_char(h, 'HH24:MI') as label, soc from (
               select distinct on (date_trunc('hour', ts)) date_trunc('hour', ts) as h, soc
                 from vehicle_telemetry
                where vehicle_id = $1 and ts >= now() - interval '24 hours'
                order by date_trunc('hour', ts), ts desc) x
              order by h`,
            [req.params.id],
          ),
          rows(
            pool,
            `select started_at as "startedAt", origin, destination, distance_km as "distanceKm",
                    round(extract(epoch from ended_at - started_at) / 60)::int as "durationMin",
                    energy_kwh as "energyKwh",
                    case when distance_km > 0 then round(energy_kwh / distance_km * 100, 1) else null end as efficiency,
                    end_soc as "endSoc"
               from trips where vehicle_id = $1 order by started_at desc limit 5`,
            [req.params.id],
          ),
          rows(
            pool,
            `select id, kind, title, detail, due_date as "dueDate", due_odometer_km as "dueOdometerKm"
               from maintenance_tasks where vehicle_id = $1 and completed_at is null
              order by due_date nulls last, id`,
            [req.params.id],
          ),
        ])
        return { vehicle, driver: driver ?? null, socSeries: { labels: series.map((s) => s.label), values: series.map((s) => s.soc) }, trips, maintenance }
      },
    )

    app.post(
      '/vehicles',
      {
        preValidation: mgr,
        schema: {
          tags: ['vehicles'],
          summary: 'เพิ่มรถ (สถานะเริ่มต้น = ออฟไลน์ จนกว่าอุปกรณ์จะส่งสัญญาณ)',
          security: sec,
          body: Type.Object({
            id: Type.String({ maxLength: 20 }),
            model: Type.String({ maxLength: 80 }),
            plate: Type.String({ maxLength: 30 }),
            driverId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
            batteryKwh: Type.Number({ minimum: 10, maximum: 200 }),
            soc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100, default: 100 })),
            odometerKm: Type.Optional(Type.Integer({ minimum: 0, maximum: 999999, default: 0 })),
          }),
        },
      },
      async (req, reply) => {
        const b = req.body
        const f = checkVehicleFields({ id: b.id, model: b.model, plate: b.plate })
        const cfg = await loadConfig(pool)

        const created = await withTx(pool, async (c) => {
          if (b.driverId) {
            const d = await one<{ taken: string | null }>(c, `select (select id from vehicles where driver_id = d.id) as taken from drivers d where d.id = $1`, [b.driverId])
            if (!d) throw invalid({ driverId: 'ไม่พบคนขับที่เลือก' })
            if (d.taken) throw invalid({ driverId: 'คนขับคนนี้มีรถประจำแล้ว' })
          }
          // รุ่นใหม่ที่ยังไม่เคยมี: ลงทะเบียนในตารางรุ่น (ยี่ห้อ = คำแรก, ยังไม่ทราบระยะวิ่งตามสเปก)
          await c.query(`insert into vehicle_models (model, brand) values ($1, regexp_replace(split_part($1, ' ', 1), '[0-9]+$', '')) on conflict do nothing`, [f.model])
          const center = await one<{ lat: number; lng: number }>(c, 'select center_lat as lat, center_lng as lng from app_settings where id = 1')
          const soc = b.soc ?? 100
          await c.query(
            `insert into vehicles (id, model, plate, driver_id, battery_kwh, soh, odometer_km, efficiency, soc, range_km, speed_kmh, status, location_text, lat, lng)
             values ($1, $2, $3, $4, $5, 100, $6, $7, $8, $9, 0, 'offline', 'ยังไม่มีสัญญาณ GPS', $10, $11)`,
            [f.id, f.model, f.plate, b.driverId ?? null, b.batteryKwh, b.odometerKm ?? 0, cfg.defaultEfficiency, soc, estimateRangeKm(soc, b.batteryKwh, cfg.defaultEfficiency), center!.lat, center!.lng],
          )
          return one(c, `select ${VEHICLE_COLS} from vehicles v where v.id = $1`, [f.id])
        })
        return reply.status(201).send(created)
      },
    )

    app.patch(
      '/vehicles/:id',
      {
        preValidation: mgr,
        schema: {
          tags: ['vehicles'],
          summary: 'แก้ไขข้อมูลรถ (ทะเบียน รุ่น คนขับประจำ ความจุแบต เลขไมล์)',
          params: IdParam,
          security: sec,
          body: Type.Object({
            plate: Type.Optional(Type.String({ maxLength: 30 })),
            model: Type.Optional(Type.String({ maxLength: 80 })),
            driverId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
            batteryKwh: Type.Optional(Type.Number({ minimum: 10, maximum: 200 })),
            odometerKm: Type.Optional(Type.Integer({ minimum: 0, maximum: 999999 })),
          }),
        },
      },
      async (req) => {
        const b = req.body
        const f = checkVehicleFields({ model: b.model, plate: b.plate }, true)
        return withTx(pool, async (c) => {
          const cur = await one<{ driverId: string | null }>(c, `select driver_id as "driverId" from vehicles where id = $1 for update`, [req.params.id])
          if (!cur) throw notFound('รถ')
          if (b.driverId && b.driverId !== cur.driverId) {
            const d = await one<{ taken: string | null }>(c, `select (select id from vehicles where driver_id = d.id) as taken from drivers d where d.id = $1`, [b.driverId])
            if (!d) throw invalid({ driverId: 'ไม่พบคนขับที่เลือก' })
            if (d.taken) throw conflict('คนขับคนนี้มีรถประจำแล้ว', { driverId: 'คนขับคนนี้มีรถประจำแล้ว' })
          }
          if (f.model) await c.query(`insert into vehicle_models (model, brand) values ($1, regexp_replace(split_part($1, ' ', 1), '[0-9]+$', '')) on conflict do nothing`, [f.model])
          await c.query(
            `update vehicles set
               plate = coalesce($2, plate), model = coalesce($3, model),
               driver_id = case when $4::boolean then $5 else driver_id end,
               battery_kwh = coalesce($6, battery_kwh), odometer_km = coalesce($7, odometer_km)
             where id = $1`,
            [req.params.id, f.plate ?? null, f.model ?? null, b.driverId !== undefined, b.driverId ?? null, b.batteryKwh ?? null, b.odometerKm ?? null],
          )
          return one(c, `select ${VEHICLE_COLS} from vehicles v where v.id = $1`, [req.params.id])
        })
      },
    )

    // ---- งานบำรุงรักษา ----
    app.post(
      '/vehicles/:id/maintenance',
      {
        preValidation: mgr,
        schema: {
          tags: ['maintenance'],
          summary: 'เพิ่มงานบำรุงรักษาของรถ',
          params: IdParam,
          security: sec,
          body: Type.Object({
            kind: Type.Union([Type.Literal('service'), Type.Literal('software'), Type.Literal('battery')]),
            title: Type.String({ minLength: 1, maxLength: 120 }),
            detail: Type.Optional(Type.String({ maxLength: 300 })),
            dueDate: Type.Optional(Type.String({ format: 'date' })),
            dueOdometerKm: Type.Optional(Type.Integer({ minimum: 0 })),
          }),
        },
      },
      async (req, reply) => {
        const b = req.body
        const exists = await one(pool, 'select 1 from vehicles where id = $1', [req.params.id])
        if (!exists) throw notFound('รถ')
        const created = await one(
          pool,
          `insert into maintenance_tasks (vehicle_id, kind, title, detail, due_date, due_odometer_km)
           values ($1, $2, $3, $4, $5, $6)
           returning id, kind, title, detail, due_date as "dueDate", due_odometer_km as "dueOdometerKm"`,
          [req.params.id, b.kind, b.title.trim(), b.detail ?? '', b.dueDate ?? null, b.dueOdometerKm ?? null],
        )
        return reply.status(201).send(created)
      },
    )

    app.post(
      '/maintenance/:id/complete',
      {
        preValidation: mgr,
        schema: { tags: ['maintenance'], summary: 'ทำเครื่องหมายงานบำรุงรักษาว่าเสร็จแล้ว', params: Type.Object({ id: Type.Integer() }), security: sec },
      },
      async (req) => {
        const r = await one(pool, `update maintenance_tasks set completed_at = coalesce(completed_at, now()) where id = $1 returning id, completed_at as "completedAt"`, [req.params.id])
        if (!r) throw notFound('งานบำรุงรักษา')
        return r
      },
    )
  }
