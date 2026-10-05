import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool, PoolClient } from 'pg'
import { requireApiKey } from '../auth'
import { one, withTx } from '../db'
import { AppError, invalid, notFound } from '../errors'
import { SESSION_COLS } from '../services/queries'
import { createAlert, deriveStatus, enabledRules, estimateRangeKm, hasOpenAlert, loadThresholds, refreshVehicleStatus } from '../services/ops'

import { keySec as sec } from '../security'
const Iso = Type.String({ format: 'date-time' })
const Day = Type.String({ format: 'date' })
const VehicleParam = Type.Object({ vehicleId: Type.String() })

const Reading = Type.Object({
  vehicleId: Type.String({ maxLength: 20 }),
  ts: Type.Optional(Iso),
  soc: Type.Integer({ minimum: 0, maximum: 100 }),
  speedKmh: Type.Optional(Type.Number({ minimum: 0, maximum: 300, default: 0 })),
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
  odometerKm: Type.Optional(Type.Integer({ minimum: 0 })),
  batteryTempC: Type.Optional(Type.Number({ minimum: -40, maximum: 120 })),
  location: Type.Optional(Type.String({ maxLength: 120 })),
})

async function sessionByVehicle(c: PoolClient | Pool, vehicleId: string, status?: string) {
  return one(
    c,
    `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id
      where s.vehicle_id = $1 ${status ? 'and s.status = $2' : ''} order by s.started_at desc limit 1`,
    status ? [vehicleId, status] : [vehicleId],
  )
}

/**
 * Endpoint สำหรับอุปกรณ์/ระบบภายนอกส่งข้อมูลเข้ามาอัปเดต — ยืนยันตัวตนด้วย X-API-Key
 * ข้อมูลที่ส่งมาแต่ละชนิดจะอัปเดตทั้งตารางหลักและผลต่อเนื่อง (สถานะรถ แจ้งเตือนอัตโนมัติ)
 */
export const ingestRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const key = requireApiKey(pool)

    // ---------------- telemetry ----------------
    app.post(
      '/ingest/telemetry',
      {
        preValidation: key,
        config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
        schema: {
          tags: ['ingest'],
          summary: 'ส่งข้อมูล telemetry ของรถ (ระดับแบต ความเร็ว ตำแหน่ง ฯลฯ) ครั้งละไม่เกิน 500 รายการ',
          description:
            'บันทึกประวัติทุกรายการ และอัปเดตสถานะล่าสุดของรถเมื่อเวลาใหม่กว่าที่มีอยู่ — คำนวณสถานะ (ชาร์จ/แบตต่ำ/ขับ/จอด) และระยะวิ่งคงเหลือใหม่ ' +
            'พร้อมสร้างแจ้งเตือนอัตโนมัติเมื่อแบตข้ามเกณฑ์ต่ำ/วิกฤต หรือความเร็วเกินกำหนด (ตามกฎที่เปิดอยู่) รายการที่ไม่ถูกต้องจะถูกข้ามและรายงานใน `rejected`',
          security: sec,
          body: Type.Object({ readings: Type.Array(Reading, { minItems: 1, maxItems: 500 }) }),
        },
      },
      async (req) => {
        const rejected: { index: number; vehicleId: string; reason: string }[] = []
        let accepted = 0
        await withTx(pool, async (c) => {
          const t = await loadThresholds(c)
          const rules = await enabledRules(c)
          for (const [index, r] of req.body.readings.entries()) {
            const v = await one<{ id: string; soc: number; speed_kmh: number; battery_kwh: number; efficiency: number; last_seen_at: Date | null; driver_id: string | null; location_text: string }>(
              c,
              'select id, soc, speed_kmh, battery_kwh, efficiency, last_seen_at, driver_id, location_text from vehicles where id = $1 for update',
              [r.vehicleId],
            )
            if (!v) {
              rejected.push({ index, vehicleId: r.vehicleId, reason: 'ไม่พบรถ' })
              continue
            }
            const ts = r.ts ? new Date(r.ts) : new Date()
            if (ts.getTime() > Date.now() + 5 * 60_000) {
              rejected.push({ index, vehicleId: r.vehicleId, reason: 'เวลาอยู่ในอนาคตเกิน 5 นาที' })
              continue
            }
            const speed = Math.round(r.speedKmh ?? 0)
            const charging = !!(await one(c, `select 1 from charging_sessions where vehicle_id = $1 and status = 'active'`, [v.id]))
            await c.query(
              `insert into vehicle_telemetry (vehicle_id, ts, soc, speed_kmh, lat, lng, odometer_km, battery_temp_c, charging) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [v.id, ts, r.soc, speed, r.lat, r.lng, r.odometerKm ?? null, r.batteryTempC ?? null, charging],
            )
            accepted++

            // ข้อมูลเก่ากว่าสถานะล่าสุด (มาช้า/ส่งซ้ำ): เก็บประวัติอย่างเดียว ไม่ย้อนสถานะ
            if (v.last_seen_at && ts < v.last_seen_at) continue

            const range = estimateRangeKm(r.soc, v.battery_kwh, v.efficiency)
            await c.query(
              `update vehicles set soc = $2, speed_kmh = $3, lat = $4, lng = $5,
                      odometer_km = greatest(odometer_km, coalesce($6, odometer_km)),
                      battery_temp_c = coalesce($7, battery_temp_c), last_seen_at = $8, range_km = $9,
                      location_text = coalesce($10, location_text),
                      status = $11
                where id = $1`,
              [v.id, r.soc, speed, r.lat, r.lng, r.odometerKm ?? null, r.batteryTempC ?? null, ts, range, r.location ?? null,
               deriveStatus({ charging, soc: r.soc, speedKmh: speed, lowBattery: t.lowBattery })],
            )

            // แจ้งเตือนอัตโนมัติเมื่อ "ข้ามเกณฑ์" (ไม่แจ้งซ้ำถ้ามีแจ้งเตือนเดิมที่ยังไม่รับทราบ)
            if (rules.has('low')) {
              if (v.soc >= t.criticalBattery && r.soc < t.criticalBattery) {
                if (!(await hasOpenAlert(c, v.id, 'battery', 'critical')))
                  await createAlert(c, { severity: 'critical', type: 'battery', title: 'แบตเตอรี่ต่ำมาก', text: `${v.id} แบตเตอรี่เหลือ ${r.soc}% ระยะวิ่งประมาณ ${range} กม.`, vehicleId: v.id })
              } else if (v.soc >= t.lowBattery && r.soc < t.lowBattery && r.soc >= t.criticalBattery) {
                if (!(await hasOpenAlert(c, v.id, 'battery', 'warning')))
                  await createAlert(c, { severity: 'warning', type: 'battery', title: 'แบตเตอรี่ต่ำ', text: `${v.id} แบตเตอรี่ต่ำกว่า ${t.lowBattery}% ระหว่างการเดินทาง`, vehicleId: v.id })
              }
            }
            if (rules.has('speed') && v.speed_kmh <= t.maxSpeed && speed > t.maxSpeed) {
              await createAlert(c, { severity: 'warning', type: 'driving', title: 'ขับเร็วเกินกำหนด', text: `${v.id} ความเร็ว ${speed} กม./ชม.`, vehicleId: v.id })
              await c.query(`insert into driving_events (driver_id, vehicle_id, type, occurred_at) values ($1, $2, 'speeding', $3)`, [v.driver_id, v.id, ts])
            }
          }
        })
        return { accepted, rejected }
      },
    )

    // ---------------- การชาร์จ ----------------
    app.post(
      '/ingest/charging/sessions',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'เริ่มเซสชันการชาร์จ (รถหนึ่งคันมีเซสชันที่กำลังชาร์จได้ครั้งละหนึ่งเซสชัน)',
          security: sec,
          body: Type.Object({
            vehicleId: Type.String(),
            stationId: Type.String(),
            fromSoc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
            targetSoc: Type.Integer({ minimum: 1, maximum: 100 }),
            kw: Type.Optional(Type.Number({ minimum: 0 })),
            startedAt: Type.Optional(Iso),
          }),
        },
      },
      async (req, reply) => {
        const b = req.body
        const out = await withTx(pool, async (c) => {
          const v = await one<{ soc: number }>(c, 'select soc from vehicles where id = $1 for update', [b.vehicleId])
          if (!v) throw invalid({ vehicleId: 'ไม่พบรถ' })
          const st = await one<{ name: string }>(c, 'select name from stations where id = $1', [b.stationId])
          if (!st) throw invalid({ stationId: 'ไม่พบสถานี' })
          const from = b.fromSoc ?? v.soc
          if (b.targetSoc < from) throw invalid({ targetSoc: 'เป้าหมายต้องไม่ต่ำกว่าระดับแบตเริ่มต้น' })
          await c.query(
            `insert into charging_sessions (vehicle_id, station_id, started_at, from_soc, now_soc, target_soc, kw) values ($1,$2,coalesce($3, now()),$4,$4,$5,$6)`,
            [b.vehicleId, b.stationId, b.startedAt ?? null, from, b.targetSoc, b.kw ?? 0],
          )
          await refreshVehicleStatus(c, b.vehicleId)
          if ((await enabledRules(c)).has('charge')) {
            await createAlert(c, { severity: 'info', type: 'charging', title: 'เริ่มชาร์จ', text: `${b.vehicleId} เริ่มชาร์จที่ ${st.name}${b.kw ? ` (${b.kw} kW)` : ''}`, vehicleId: b.vehicleId })
          }
          return sessionByVehicle(c, b.vehicleId, 'active')
        })
        return reply.status(201).send(out)
      },
    )

    app.patch(
      '/ingest/charging/sessions/:vehicleId',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'อัปเดตความคืบหน้าของเซสชันที่กำลังชาร์จ (ระดับแบต พลังงาน ค่าใช้จ่าย กำลังไฟ เวลาที่เหลือ)',
          params: VehicleParam,
          security: sec,
          body: Type.Object({
            nowSoc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
            targetSoc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
            kwh: Type.Optional(Type.Number({ minimum: 0 })),
            cost: Type.Optional(Type.Number({ minimum: 0 })),
            kw: Type.Optional(Type.Number({ minimum: 0 })),
            etaMinutes: Type.Optional(Type.Integer({ minimum: 0 })),
          }),
        },
      },
      async (req) =>
        withTx(pool, async (c) => {
          const b = req.body
          const cur = await one<{ now_soc: number; target_soc: number }>(c, `select now_soc, target_soc from charging_sessions where vehicle_id = $1 and status = 'active' for update`, [req.params.vehicleId])
          if (!cur) throw new AppError(404, 'not_found', 'ไม่มีเซสชันที่กำลังชาร์จของรถคันนี้')
          const now = b.nowSoc ?? cur.now_soc
          const target = b.targetSoc ?? cur.target_soc
          if (target < now) throw invalid({ targetSoc: 'เป้าหมายต้องไม่ต่ำกว่าระดับแบตปัจจุบัน' })
          await c.query(
            `update charging_sessions set now_soc = $2, target_soc = $3,
                    kwh = coalesce($4, kwh), cost = coalesce($5, cost), kw = coalesce($6, kw), eta_minutes = coalesce($7, eta_minutes)
              where vehicle_id = $1 and status = 'active'`,
            [req.params.vehicleId, now, target, b.kwh ?? null, b.cost ?? null, b.kw ?? null, b.etaMinutes ?? null],
          )
          if (b.nowSoc !== undefined) {
            await c.query(
              `update vehicles set soc = $2::smallint, range_km = round($2::numeric / 100.0 * battery_kwh / (efficiency / 100)) where id = $1`,
              [req.params.vehicleId, now],
            )
          }
          return sessionByVehicle(c, req.params.vehicleId, 'active')
        }),
    )

    app.post(
      '/ingest/charging/sessions/:vehicleId/complete',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'จบเซสชันการชาร์จ (completed) และคำนวณสถานะรถใหม่',
          params: VehicleParam,
          security: sec,
          body: Type.Object({ toSoc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })), endedAt: Type.Optional(Iso) }),
        },
      },
      async (req) =>
        withTx(pool, async (c) => {
          const s = await one<{ id: number; now_soc: number; station: string }>(
            c,
            `update charging_sessions s set status = 'completed', ended_at = coalesce($2, now()),
                    to_soc = coalesce($3, s.now_soc), now_soc = coalesce($3, s.now_soc), eta_minutes = null
              from stations st
              where s.vehicle_id = $1 and s.status = 'active' and st.id = s.station_id
              returning s.id, s.now_soc, st.name as station`,
            [req.params.vehicleId, req.body.endedAt ?? null, req.body.toSoc ?? null],
          )
          if (!s) throw new AppError(404, 'not_found', 'ไม่มีเซสชันที่กำลังชาร์จของรถคันนี้')
          await c.query(`update vehicles set soc = $2::smallint, range_km = round($2::numeric / 100.0 * battery_kwh / (efficiency / 100)) where id = $1`, [req.params.vehicleId, s.now_soc])
          await refreshVehicleStatus(c, req.params.vehicleId)
          if ((await enabledRules(c)).has('charge')) {
            await createAlert(c, { severity: 'info', type: 'charging', title: 'ชาร์จเสร็จสิ้น', text: `${req.params.vehicleId} ชาร์จถึง ${s.now_soc}% ที่ ${s.station}`, vehicleId: req.params.vehicleId })
          }
          return one(c, `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id where s.id = $1`, [s.id])
        }),
    )

    app.put(
      '/ingest/stations/:id/occupancy',
      {
        preValidation: key,
        schema: { tags: ['ingest'], summary: 'อัปเดตจำนวนช่องชาร์จที่ถูกใช้ของสถานี', params: Type.Object({ id: Type.String() }), security: sec, body: Type.Object({ busyPorts: Type.Integer({ minimum: 0 }) }) },
      },
      async (req) => {
        const s = await one<{ ports: number }>(pool, 'select ports from stations where id = $1', [req.params.id])
        if (!s) throw notFound('สถานี')
        if (req.body.busyPorts > s.ports) throw invalid({ busyPorts: `สถานีนี้มีช่องชาร์จ ${s.ports} ช่อง` })
        return one(pool, `update stations set busy_ports = $2 where id = $1 returning id, ports, busy_ports as "busyPorts"`, [req.params.id, req.body.busyPorts])
      },
    )

    app.put(
      '/ingest/charging/load',
      {
        preValidation: key,
        schema: { tags: ['ingest'], summary: 'ค่าโหลดการชาร์จรายชั่วโมง (kW)', security: sec, body: Type.Object({ day: Day, hour: Type.Integer({ minimum: 0, maximum: 23 }), kw: Type.Number({ minimum: 0 }) }) },
      },
      async (req) => one(pool, `insert into charging_load (day, hour, kw) values ($1, $2, $3) on conflict (day, hour) do update set kw = excluded.kw returning to_char(day, 'YYYY-MM-DD') as day, hour, kw`, [req.body.day, req.body.hour, req.body.kw]),
    )

    // ---------------- ทริปและพฤติกรรมการขับ ----------------
    app.post(
      '/ingest/trips',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'บันทึกทริปที่จบแล้ว (คนขับเริ่มต้น = คนขับประจำรถ)',
          security: sec,
          body: Type.Object({
            vehicleId: Type.String(),
            driverId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
            startedAt: Iso,
            endedAt: Iso,
            origin: Type.String({ minLength: 1, maxLength: 120 }),
            destination: Type.String({ minLength: 1, maxLength: 120 }),
            distanceKm: Type.Number({ minimum: 0 }),
            energyKwh: Type.Number({ minimum: 0 }),
            endSoc: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
          }),
        },
      },
      async (req, reply) => {
        const b = req.body
        if (new Date(b.endedAt) < new Date(b.startedAt)) throw invalid({ endedAt: 'เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม' })
        const v = await one<{ driver_id: string | null }>(pool, 'select driver_id from vehicles where id = $1', [b.vehicleId])
        if (!v) throw invalid({ vehicleId: 'ไม่พบรถ' })
        const created = await one(
          pool,
          `insert into trips (vehicle_id, driver_id, started_at, ended_at, origin, destination, distance_km, energy_kwh, end_soc)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [b.vehicleId, b.driverId === undefined ? v.driver_id : b.driverId, b.startedAt, b.endedAt, b.origin, b.destination, b.distanceKm, b.energyKwh, b.endSoc ?? null],
        )
        return reply.status(201).send(created)
      },
    )

    app.post(
      '/ingest/driving-events',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'บันทึกเหตุการณ์การขับขี่ (เบรกแรง ขับเร็ว เร่งแรง จอดติดเครื่องนาน)',
          security: sec,
          body: Type.Object({
            events: Type.Array(
              Type.Object({
                vehicleId: Type.String(),
                driverId: Type.Optional(Type.String()),
                type: Type.Union([Type.Literal('harsh_brake'), Type.Literal('speeding'), Type.Literal('harsh_accel'), Type.Literal('long_idle')]),
                occurredAt: Type.Optional(Iso),
              }),
              { minItems: 1, maxItems: 500 },
            ),
          }),
        },
      },
      async (req) => {
        const rejected: { index: number; reason: string }[] = []
        let accepted = 0
        await withTx(pool, async (c) => {
          for (const [index, e] of req.body.events.entries()) {
            const v = await one<{ driver_id: string | null }>(c, 'select driver_id from vehicles where id = $1', [e.vehicleId])
            if (!v) {
              rejected.push({ index, reason: 'ไม่พบรถ' })
              continue
            }
            const driver = e.driverId ?? v.driver_id
            if (driver && !(await one(c, 'select 1 from drivers where id = $1', [driver]))) {
              rejected.push({ index, reason: 'ไม่พบคนขับ' })
              continue
            }
            await c.query(`insert into driving_events (driver_id, vehicle_id, type, occurred_at) values ($1,$2,$3,coalesce($4, now()))`, [driver, e.vehicleId, e.type, e.occurredAt ?? null])
            accepted++
          }
        })
        return { accepted, rejected }
      },
    )

    app.put(
      '/ingest/drivers/:id/score',
      {
        preValidation: key,
        schema: { tags: ['ingest'], summary: 'อัปเดตคะแนนการขับ (Eco-Driving) ที่คำนวณโดยระบบภายนอก', params: Type.Object({ id: Type.String() }), security: sec, body: Type.Object({ score: Type.Integer({ minimum: 0, maximum: 100 }) }) },
      },
      async (req) => {
        const r = await one(pool, 'update drivers set score = $2 where id = $1 returning id, score', [req.params.id, req.body.score])
        if (!r) throw notFound('คนขับ')
        return r
      },
    )

    // ---------------- สุขภาพรถ / พลังงาน / แจ้งเตือน ----------------
    app.patch(
      '/ingest/vehicles/:id',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'อัปเดตสุขภาพแบต (SoH) หรือเลขไมล์ของรถ',
          params: Type.Object({ id: Type.String() }),
          security: sec,
          body: Type.Object({ soh: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })), odometerKm: Type.Optional(Type.Integer({ minimum: 0 })) }),
        },
      },
      async (req) => {
        const r = await one(
          pool,
          `update vehicles set soh = coalesce($2, soh), odometer_km = coalesce($3, odometer_km) where id = $1 returning id, soh, odometer_km as "odometerKm"`,
          [req.params.id, req.body.soh ?? null, req.body.odometerKm ?? null],
        )
        if (!r) throw notFound('รถ')
        return r
      },
    )

    app.put(
      '/ingest/energy/daily',
      {
        preValidation: key,
        schema: { tags: ['ingest'], summary: 'พลังงานและค่าใช้จ่ายรายวันของกองยาน (แทนที่ค่าเดิมของวันนั้น)', security: sec, body: Type.Object({ day: Day, kwh: Type.Number({ minimum: 0 }), cost: Type.Number({ minimum: 0 }) }) },
      },
      async (req) =>
        one(pool, `insert into energy_daily (day, kwh, cost) values ($1,$2,$3) on conflict (day) do update set kwh = excluded.kwh, cost = excluded.cost returning to_char(day, 'YYYY-MM-DD') as day, kwh, cost`, [req.body.day, req.body.kwh, req.body.cost]),
    )

    app.put(
      '/ingest/energy/monthly',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'พลังงานรายเดือนรายคัน สำหรับรายงาน (วันที่ใดก็ได้ในเดือน — ระบบปัดเป็นวันที่ 1)',
          security: sec,
          body: Type.Object({
            month: Day,
            vehicleId: Type.String(),
            kwhDepot: Type.Number({ minimum: 0 }),
            kwhPublic: Type.Number({ minimum: 0 }),
            costDepotOffpeak: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
            costDepotOnpeak: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
            costPublicDc: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
            costPublicAc: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
            co2AvoidedKg: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
          }),
        },
      },
      async (req) => {
        const b = req.body
        if (!(await one(pool, 'select 1 from vehicles where id = $1', [b.vehicleId]))) throw invalid({ vehicleId: 'ไม่พบรถ' })
        return one(
          pool,
          `insert into energy_monthly (month, vehicle_id, kwh_depot, kwh_public, cost_depot_offpeak, cost_depot_onpeak, cost_public_dc, cost_public_ac, co2_avoided_kg)
           values (date_trunc('month', $1::date)::date, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (month, vehicle_id) do update set kwh_depot = excluded.kwh_depot, kwh_public = excluded.kwh_public,
             cost_depot_offpeak = excluded.cost_depot_offpeak, cost_depot_onpeak = excluded.cost_depot_onpeak,
             cost_public_dc = excluded.cost_public_dc, cost_public_ac = excluded.cost_public_ac, co2_avoided_kg = excluded.co2_avoided_kg
           returning to_char(month, 'YYYY-MM-DD') as month, vehicle_id as "vehicleId"`,
          [b.month, b.vehicleId, b.kwhDepot, b.kwhPublic, b.costDepotOffpeak ?? 0, b.costDepotOnpeak ?? 0, b.costPublicDc ?? 0, b.costPublicAc ?? 0, b.co2AvoidedKg ?? 0],
        )
      },
    )

    app.post(
      '/ingest/alerts',
      {
        preValidation: key,
        schema: {
          tags: ['ingest'],
          summary: 'สร้างแจ้งเตือนจากระบบภายนอก (เช่น อุปกรณ์ออฟไลน์ ออกนอกพื้นที่ ถึงกำหนดบำรุงรักษา)',
          security: sec,
          body: Type.Object({
            severity: Type.Union([Type.Literal('critical'), Type.Literal('warning'), Type.Literal('info')]),
            type: Type.Union([Type.Literal('battery'), Type.Literal('charging'), Type.Literal('device'), Type.Literal('maint'), Type.Literal('driving'), Type.Literal('geofence')]),
            title: Type.String({ minLength: 1, maxLength: 120 }),
            text: Type.String({ minLength: 1, maxLength: 500 }),
            vehicleId: Type.Optional(Type.String()),
          }),
        },
      },
      async (req, reply) => {
        const b = req.body
        if (b.vehicleId && !(await one(pool, 'select 1 from vehicles where id = $1', [b.vehicleId]))) throw invalid({ vehicleId: 'ไม่พบรถ' })
        const a = await createAlert(pool, { severity: b.severity, type: b.type, title: b.title.trim(), text: b.text.trim(), vehicleId: b.vehicleId })
        return reply.status(201).send(a)
      },
    )
  }
