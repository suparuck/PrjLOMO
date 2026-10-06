import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { one, rows, withTx } from '../db'
import { AppError, invalid } from '../errors'
import { SESSION_COLS } from '../services/queries'
import { enabledRules, createAlert, refreshVehicleStatus } from '../services/ops'

import { sec } from '../security'
const VehicleParam = Type.Object({ vehicleId: Type.String() })

// ช่วง On-Peak ตามอัตรา TOU (09:00–22:00)
const PEAK = { peakStart: 9, peakEnd: 22 }

export const chargingRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const mgr = requireRole(pool, 'manager')

    app.get('/stations', { preValidation: mgr, schema: { tags: ['charging'], summary: 'สถานีชาร์จ (Depot และสาธารณะ)', security: sec } }, async () =>
      rows(
        pool,
        `select id, name, type, network, lat, lng, ports, busy_ports as "busyPorts", power_label as power, price_per_kwh as "pricePerKwh"
           from stations order by id`,
      ),
    )

    app.get('/charging/sessions', { preValidation: mgr, schema: { tags: ['charging'], summary: 'เซสชันที่กำลังชาร์จ', security: sec } }, async () =>
      rows(pool, `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id where s.status = 'active' order by s.started_at`),
    )

    app.get(
      '/charging/history',
      {
        preValidation: mgr,
        schema: {
          tags: ['charging'],
          summary: 'ประวัติการชาร์จ (เสร็จสิ้น/หยุดแล้ว) ภายใน N ชั่วโมงล่าสุด',
          security: sec,
          querystring: Type.Object({
            hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 * 365, default: 72 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
          }),
        },
      },
      async (req) =>
        rows(
          pool,
          `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id
            where s.status <> 'active' and s.started_at >= now() - ($1::int * interval '1 hour')
            order by s.started_at desc limit $2`,
          [req.query.hours ?? 72, req.query.limit ?? 50],
        ),
    )

    // โหลดการชาร์จรายชั่วโมงของวันล่าสุดที่มีข้อมูล
    app.get('/charging/load', { preValidation: mgr, schema: { tags: ['charging'], summary: 'โหลดการชาร์จรายชั่วโมง (kW) ของวันล่าสุด', security: sec } }, async () => {
      const list = await rows<{ day: string; hour: number; kw: number }>(
        pool,
        `select to_char(day, 'YYYY-MM-DD') as day, hour, kw from charging_load where day = (select max(day) from charging_load) order by hour`,
      )
      const byHour = new Map(list.map((r) => [r.hour, r.kw]))
      return {
        day: list[0]?.day ?? null,
        hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
        kw: Array.from({ length: 24 }, (_, i) => byHour.get(i) ?? 0),
        ...PEAK,
      }
    })

    // ปรับเป้าหมายชาร์จ: เวลาที่เหลือปรับตามสัดส่วนของ % ที่ต้องชาร์จเพิ่ม
    app.patch(
      '/charging/sessions/:vehicleId/target',
      {
        preValidation: mgr,
        schema: {
          tags: ['charging'],
          summary: 'ปรับเป้าหมายแบตของเซสชันที่กำลังชาร์จ (ไม่ต่ำกว่าระดับปัจจุบัน ไม่เกิน 100%)',
          params: VehicleParam,
          security: sec,
          body: Type.Object({ targetSoc: Type.Integer({ minimum: 0, maximum: 100 }) }),
        },
      },
      async (req) =>
        withTx(pool, async (c) => {
          const s = await one<{ now_soc: number; target_soc: number; eta_minutes: number | null; kw: number; battery_kwh: number }>(
            c,
            `select s.now_soc, s.target_soc, s.eta_minutes, s.kw, v.battery_kwh
               from charging_sessions s join vehicles v on v.id = s.vehicle_id
              where s.vehicle_id = $1 and s.status = 'active' for update of s`,
            [req.params.vehicleId],
          )
          if (!s) throw new AppError(404, 'not_found', 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)', { _: 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)' })
          const target = req.body.targetSoc
          if (target < s.now_soc) throw invalid({ targetSoc: `เป้าหมายต้องไม่ต่ำกว่าระดับแบตปัจจุบัน (${s.now_soc}%)` })

          const oldRemain = s.target_soc - s.now_soc
          const newRemain = target - s.now_soc
          let eta: number
          if (newRemain === 0) eta = 0
          else if (oldRemain > 0 && s.eta_minutes !== null) eta = Math.max(1, Math.round((s.eta_minutes * newRemain) / oldRemain))
          else eta = s.kw > 0 ? Math.max(1, Math.round((((newRemain / 100) * s.battery_kwh) / s.kw) * 60)) : 0
          await c.query(`update charging_sessions set target_soc = $2, eta_minutes = $3 where vehicle_id = $1 and status = 'active'`, [req.params.vehicleId, target, eta])
          return one(c, `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id where s.vehicle_id = $1 and s.status = 'active'`, [req.params.vehicleId])
        }),
    )

    // หยุดชาร์จ: เซสชันกลายเป็นประวัติ (stopped) และสถานะรถถูกคำนวณใหม่
    app.post(
      '/charging/sessions/:vehicleId/stop',
      { preValidation: mgr, schema: { tags: ['charging'], summary: 'หยุดชาร์จ (บันทึกเป็นประวัติ)', params: VehicleParam, security: sec } },
      async (req) =>
        withTx(pool, async (c) => {
          const s = await one<{ id: number; now_soc: number }>(
            c,
            `update charging_sessions set status = 'stopped', ended_at = now(), to_soc = now_soc, eta_minutes = null
              where vehicle_id = $1 and status = 'active' returning id, now_soc`,
            [req.params.vehicleId],
          )
          if (!s) throw new AppError(404, 'not_found', 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)', { _: 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)' })
          await refreshVehicleStatus(c, req.params.vehicleId)
          if ((await enabledRules(c)).has('charge')) {
            await createAlert(c, { severity: 'info', type: 'charging', title: 'หยุดชาร์จ', text: `${req.params.vehicleId} ถูกสั่งหยุดชาร์จที่แบต ${s.now_soc}%`, vehicleId: req.params.vehicleId })
          }
          return one(c, `select ${SESSION_COLS} from charging_sessions s join stations st on st.id = s.station_id where s.id = $1`, [s.id])
        }),
    )

  }
