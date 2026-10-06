import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { one, rows, withTx } from '../db'
import { monthLabel, weekdayLabel } from '../lib/labels'
import { invalid, notFound } from '../errors'
import { checkIceFields, checkTco } from '../lib/validators'
import { computeElectrification, computeReport, loadConfig } from '../services/report'

import { sec } from '../security'
import { XLSX_TYPE, buildEsgXlsx, buildReportXlsx } from '../services/reportXlsx'
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d

export const reportRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const viewer = requireRole(pool, 'viewer')
    const mgr = requireRole(pool, 'manager')

    app.get(
      '/reports',
      {
        preValidation: viewer,
        schema: {
          tags: ['reports'],
          summary: 'รายงานพลังงาน คาร์บอน การใช้งาน — ตัวกรองมีผลกับทุกตัวเลขและกราฟ',
          security: sec,
          querystring: Type.Object({
            period: Type.Optional(Type.Union([Type.Literal('year'), Type.Literal('q3'), Type.Literal('sep')], { default: 'year' })),
            brand: Type.Optional(Type.String({ maxLength: 40, default: 'all' })),
          }),
        },
      },
      async (req) => computeReport(pool, req.query.period ?? 'year', req.query.brand ?? 'all'),
    )

    // ส่งออก Excel (ไฟล์เดียวกับที่แนบในอีเมลรายงานตามเวลา): report = รายงานเต็ม, esg = ข้อมูล ESG
    app.get(
      '/reports/export',
      {
        preValidation: viewer,
        schema: {
          tags: ['reports'],
          summary: 'ส่งออกรายงานเป็นไฟล์ Excel (.xlsx) ตามช่วงเวลา/ยี่ห้อ',
          security: sec,
          querystring: Type.Object({
            kind: Type.Optional(Type.Union([Type.Literal('report'), Type.Literal('esg')], { default: 'report' })),
            period: Type.Optional(Type.Union([Type.Literal('year'), Type.Literal('q3'), Type.Literal('sep')], { default: 'year' })),
            brand: Type.Optional(Type.String({ maxLength: 40, default: 'all' })),
          }),
        },
      },
      async (req, reply) => {
        const { kind = 'report', period = 'year', brand = 'all' } = req.query
        const buf = kind === 'esg' ? await buildEsgXlsx(pool, period, brand) : await buildReportXlsx(pool, period, brand)
        const name = `ev-monitor-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`
        return reply
          .header('Content-Type', XLSX_TYPE)
          .header('Content-Disposition', `attachment; filename="${name}"`)
          .header('Cache-Control', 'no-store')
          .send(buf)
      },
    )

    app.get('/reports/electrification', { preValidation: viewer, schema: { tags: ['reports'], summary: 'รายงานความพร้อมเปลี่ยนรถสันดาปเป็น EV และ TCO', security: sec } }, async () =>
      computeElectrification(pool),
    )

    // ---- ตัวเลขสำหรับแดชบอร์ด ----
    app.get('/energy/week', { preValidation: mgr, schema: { tags: ['dashboard'], summary: 'พลังงานรายวัน 7 วันล่าสุด', security: sec } }, async () => {
      const list = await rows<{ day: string; kwh: number; cost: number }>(
        pool,
        `select to_char(day, 'YYYY-MM-DD') as day, kwh, cost from energy_daily
          where day > (select max(day) from energy_daily) - 7 order by day`,
      )
      return { labels: list.map((r) => weekdayLabel(r.day)), days: list.map((r) => r.day), kwh: list.map((r) => r.kwh), cost: list.map((r) => r.cost) }
    })

    app.get('/energy/summary', { preValidation: mgr, schema: { tags: ['dashboard'], summary: 'สรุปพลังงานสัปดาห์นี้เทียบสัปดาห์ก่อน', security: sec } }, async () => {
      const cfg = await loadConfig(pool)
      const r = await one<{ cur_kwh: number | null; cur_cost: number | null; prev_kwh: number | null; eff: number }>(
        pool,
        `with m as (select max(day) as d from energy_daily)
         select (select sum(kwh) from energy_daily, m where day > m.d - 7) as cur_kwh,
                (select sum(cost) from energy_daily, m where day > m.d - 7) as cur_cost,
                (select sum(kwh) from energy_daily, m where day <= m.d - 7 and day > m.d - 14) as prev_kwh,
                (select coalesce(avg(efficiency), 0) from vehicles) as eff`,
      )
      const kwh = r?.cur_kwh ?? 0
      const cost = r?.cur_cost ?? 0
      return {
        totalKwh: kwh,
        kwhChangePct: r?.prev_kwh ? round((kwh / r.prev_kwh - 1) * 100, 1) : 0,
        totalCost: cost,
        avgPricePerKwh: kwh ? round(cost / kwh, 2) : 0,
        efficiency: round(r?.eff ?? 0, 1),
        efficiencyChangePct: cfg.efficiencyChangePct,
      }
    })

    app.get('/sustainability', { preValidation: mgr, schema: { tags: ['dashboard'], summary: 'ความยั่งยืนของปี (CO₂ ต้นไม้ ประหยัดน้ำมัน)', security: sec } }, async () => {
      const r = await computeReport(pool, 'year', 'all')
      const extra = await one<{ km: number; ready: number }>(
        pool,
        `select (select coalesce(sum(odometer_km), 0) from vehicles)::int as km,
                (select count(*) from ice_vehicles where readiness_score >= 80)::int as ready`,
      )
      return { co2Tons: r.carbon.avoidedTons, treesEquivalent: r.carbon.trees, fuelSavings: r.totals.fuelSavings, totalKm: extra?.km ?? 0, iceReadyCount: extra?.ready ?? 0 }
    })

    app.get('/battery/insights', { preValidation: mgr, schema: { tags: ['dashboard'], summary: 'แนวโน้ม SoH และระยะวิ่งตามรุ่น', security: sec } }, async () => {
      const cfg = await loadConfig(pool)
      const hist = await rows<{ month: string; soh: number }>(pool, `select to_char(month, 'YYYY-MM-DD') as month, avg_soh as soh from fleet_soh_monthly order by month`)
      const cur = await one<{ soh: number; month: string }>(pool, `select coalesce(round(avg(soh), 1), 0)::float8 as soh, to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as month from vehicles`)
      const values = [...hist.map((h) => h.soh), cur!.soh]
      const labels = [...hist.map((h) => monthLabel(h.month)), monthLabel(cur!.month)]
      // เทียบกับ 3 เดือนก่อนหน้า
      const ref = values.length >= 4 ? values[values.length - 4] : values[0]
      const models = await rows<{ model: string; spec: number }>(
        pool,
        `select v.model, vm.spec_range_km as spec from (select distinct model from vehicles) v
           join vehicle_models vm on vm.model = v.model where vm.spec_range_km is not null order by v.model`,
      )
      return {
        sohTrend: { labels, values },
        sohChange3m: round(ref - cur!.soh, 1),
        modelRanges: models.map((m) => ({ model: m.model, spec: m.spec, actual: Math.round(m.spec * cfg.actualRangeRatio) })),
      }
    })

    app.get('/ice-vehicles', { preValidation: viewer, schema: { tags: ['reports'], summary: 'รถสันดาปที่ยังเหลือในกองยาน', security: sec } }, async () =>
      rows(
        pool,
        `select id, model, km_per_day as "kmPerDay", max_km_per_day as "maxKmPerDay", fuel_per_month as "fuelPerMonth",
                readiness_score as "readinessScore", recommended_ev as "recommendedEv" from ice_vehicles order by id`,
      ),
    )

    // ---- จัดการรถสันดาปที่ยังเหลือ (manager ขึ้นไป) — ใช้ในรายงานความพร้อมเปลี่ยนเป็น EV ----
    const ICE_COLS = `id, model, km_per_day as "kmPerDay", max_km_per_day as "maxKmPerDay", fuel_per_month as "fuelPerMonth",
                      readiness_score as "readinessScore", recommended_ev as "recommendedEv"`
    const IceFields = {
      model: Type.String({ maxLength: 200 }),
      kmPerDay: Type.Integer({ minimum: 1, maximum: 2000 }),
      maxKmPerDay: Type.Integer({ minimum: 1, maximum: 3000 }),
      fuelPerMonth: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
      readinessScore: Type.Integer({ minimum: 0, maximum: 100 }),
      recommendedEv: Type.String({ maxLength: 200 }),
    }

    app.post(
      '/ice-vehicles',
      {
        preValidation: mgr,
        schema: { tags: ['reports'], summary: 'เพิ่มรถสันดาป (รหัสห้ามซ้ำ ไม่สนตัวพิมพ์)', body: Type.Object({ id: Type.String({ maxLength: 100 }), ...IceFields }), security: sec },
      },
      async (req, reply) => {
        const b = req.body
        const f = checkIceFields({ id: b.id, model: b.model, recommendedEv: b.recommendedEv, kmPerDay: b.kmPerDay, maxKmPerDay: b.maxKmPerDay })
        const row = await one(
          pool,
          `insert into ice_vehicles (id, model, km_per_day, max_km_per_day, fuel_per_month, readiness_score, recommended_ev)
           select $1, $2, $3, $4, $5, $6, $7 where not exists (select 1 from ice_vehicles where lower(id) = lower($1))
           returning ${ICE_COLS}`,
          [f.id, f.model, b.kmPerDay, b.maxKmPerDay, b.fuelPerMonth, b.readinessScore, f.recommendedEv],
        )
        if (!row) throw invalid({ id: 'รหัสรถนี้มีอยู่แล้ว' })
        return reply.status(201).send(row)
      },
    )

    app.patch(
      '/ice-vehicles/:id',
      {
        preValidation: mgr,
        schema: { tags: ['reports'], summary: 'แก้ไขรถสันดาป', params: Type.Object({ id: Type.String() }), body: Type.Partial(Type.Object(IceFields), { minProperties: 1 }), security: sec },
      },
      async (req) => {
        const b = req.body
        return withTx(pool, async (c) => {
          const cur = await one<{ kmPerDay: number; maxKmPerDay: number }>(c, 'select km_per_day as "kmPerDay", max_km_per_day as "maxKmPerDay" from ice_vehicles where id = $1 for update', [req.params.id])
          if (!cur) throw notFound('รถสันดาป')
          const f = checkIceFields({ model: b.model, recommendedEv: b.recommendedEv, kmPerDay: b.kmPerDay, maxKmPerDay: b.maxKmPerDay }, true, cur)
          return one(
            c,
            `update ice_vehicles set model = coalesce($2, model), km_per_day = coalesce($3, km_per_day), max_km_per_day = coalesce($4, max_km_per_day),
                    fuel_per_month = coalesce($5, fuel_per_month), readiness_score = coalesce($6, readiness_score), recommended_ev = coalesce($7, recommended_ev)
              where id = $1 returning ${ICE_COLS}`,
            [req.params.id, f.model ?? null, b.kmPerDay ?? null, b.maxKmPerDay ?? null, b.fuelPerMonth ?? null, b.readinessScore ?? null, f.recommendedEv ?? null],
          )
        })
      },
    )

    app.delete(
      '/ice-vehicles/:id',
      { preValidation: mgr, schema: { tags: ['reports'], summary: 'ลบรถสันดาป (เช่น เมื่อขายหรือเปลี่ยนเป็น EV แล้ว)', params: Type.Object({ id: Type.String() }), security: sec } },
      async (req) => {
        const r = await one(pool, 'delete from ice_vehicles where id = $1 returning id', [req.params.id])
        if (!r) throw notFound('รถสันดาป')
        return { deleted: true }
      },
    )

    // ---- ต้นทุนรวมตลอดอายุ (TCO) 5 ปี: รายการต้นทุนของรถสันดาปเทียบ EV ต่อคัน ----
    const tcoNames = async (c: Pick<Pool, 'query'>) => {
      const v = await one<{ value: { ice?: string; ev?: string } }>(c, "select value from report_config where key = 'tco_names'")
      return { iceName: v?.value.ice ?? 'รถสันดาป', evName: v?.value.ev ?? 'EV' }
    }

    app.get(
      '/tco',
      { preValidation: mgr, schema: { tags: ['reports'], summary: 'รายการต้นทุน TCO 5 ปี และชื่อรถที่ใช้เปรียบเทียบ', security: sec } },
      async () => ({
        ...(await tcoNames(pool)),
        items: await rows(pool, 'select label, ice_cost::float8 as "iceCost", ev_cost::float8 as "evCost" from tco_items order by sort'),
      }),
    )

    app.put(
      '/tco',
      {
        preValidation: mgr,
        schema: {
          tags: ['reports'],
          summary: 'บันทึกรายการ TCO ทั้งชุด (แทนที่ของเดิม) และชื่อรถที่เปรียบเทียบ',
          body: Type.Object({
            iceName: Type.String({ maxLength: 200 }),
            evName: Type.String({ maxLength: 200 }),
            items: Type.Array(
              Type.Object({ label: Type.String({ maxLength: 200 }), iceCost: Type.Number({ minimum: 0, maximum: 1_000_000_000 }), evCost: Type.Number({ minimum: 0, maximum: 1_000_000_000 }) }),
              { minItems: 1, maxItems: 12 },
            ),
          }),
          security: sec,
        },
      },
      async (req) => {
        const t = checkTco(req.body)
        await withTx(pool, async (c) => {
          await c.query('delete from tco_items')
          for (const [i, it] of t.items.entries()) {
            await c.query('insert into tco_items (sort, label, ice_cost, ev_cost) values ($1, $2, $3, $4)', [i + 1, it.label, it.iceCost, it.evCost])
          }
          await c.query(
            "insert into report_config (key, value, description) values ('tco_names', $1::jsonb, 'ชื่อรถที่ใช้เปรียบเทียบ TCO') on conflict (key) do update set value = excluded.value",
            [JSON.stringify({ ice: t.iceName, ev: t.evName })],
          )
        })
        return { saved: true, count: t.items.length }
      },
    )
  }
