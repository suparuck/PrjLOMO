import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { Pool } from 'pg'
import { one } from '../db'
import { computeReport, loadConfig } from '../services/report'

/** ข้อมูลสรุปแบบรวมเท่านั้น (ไม่มีรหัสรถ/คนขับ/ตำแหน่ง) สำหรับหน้า Landing และหน้า Login */
export const publicRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.get('/public/overview', { schema: { tags: ['public'], summary: 'สถิติรวมของกองยานสำหรับหน้าสาธารณะ (ไม่ต้องล็อกอิน มีเฉพาะตัวเลขรวม)' } }, async () => {
      const cfg = await loadConfig(pool)
      const [fleet, year, latestMonth] = await Promise.all([
        one<{ total: number; online: number; avg_soc: number | null; charging: number; eff: number | null; week_kwh: number | null }>(
          pool,
          `select count(*)::int as total,
                  count(*) filter (where status <> 'offline')::int as online,
                  round(avg(soc))::int as avg_soc,
                  count(*) filter (where status = 'charging')::int as charging,
                  round(avg(efficiency), 1)::float8 as eff,
                  (select sum(kwh) from energy_daily where day > (select max(day) from energy_daily) - 7) as week_kwh
             from vehicles`,
        ),
        computeReport(pool, 'year', 'all'),
        one<{ kwh: number; co2: number }>(
          pool,
          `select coalesce(sum(kwh_depot + kwh_public), 0)::float8 as kwh, coalesce(sum(co2_avoided_kg), 0)::float8 / 1000 as co2
             from energy_monthly
            where month = (select coalesce(max(month) filter (where month < date_trunc('month', now())), max(month)) from energy_monthly)`,
        ),
      ])
      return {
        vehicleCount: fleet?.total ?? 0,
        onlineCount: fleet?.online ?? 0,
        avgSoc: fleet?.avg_soc ?? 0,
        chargingCount: fleet?.charging ?? 0,
        efficiency: fleet?.eff ?? 0,
        weekKwh: fleet?.week_kwh ?? 0,
        latestMonthKwh: Math.round(latestMonth?.kwh ?? 0),
        latestMonthCo2Tons: Math.round((latestMonth?.co2 ?? 0) * 10) / 10,
        yearCo2Tons: year.carbon.avoidedTons,
        yearFuelSavings: year.totals.fuelSavings,
        gridKgPerKwh: cfg.gridKgPerKwh,
      }
    })
  }
