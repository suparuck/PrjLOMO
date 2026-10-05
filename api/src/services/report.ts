import type { Db } from '../db'
import { one, rows } from '../db'
import { monthLabel } from '../lib/labels'

export type ReportPeriod = 'year' | 'q3' | 'sep'

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d

/** อ่านค่าสมมติฐานของรายงานจากตาราง report_config */
export async function loadConfig(db: Db) {
  const list = await rows<{ key: string; value: unknown }>(db, 'select key, value from report_config')
  const c = Object.fromEntries(list.map((r) => [r.key, r.value])) as Record<string, any>
  return {
    gridKgPerKwh: Number(c.grid_kg_per_kwh),
    treeKgPerYear: Number(c.tree_kg_per_year),
    oilCostPerKm: Number(c.oil_cost_per_km),
    kwhChangePct: Number(c.kwh_change_vs_last_year_pct),
    efficiencyChangePct: Number(c.efficiency_change_pct),
    actualRangeRatio: Number(c.actual_range_ratio),
    co2PerKm: c.co2_g_per_km as { sedan: number; diesel: number; hybrid: number; evSolar: number },
    evEstimate: c.ev_estimate as { workingDays: number; kwhPerKm: number; pricePerKwh: number },
    tcoNames: c.tco_names as { ice: string; ev: string },
    defaultEfficiency: Number(c.default_efficiency),
  }
}

/** เดือนที่ใช้ตามช่วงเวลา: ปี = ม.ค.–เดือนล่าสุดที่มีข้อมูล, ไตรมาส 3 = ก.ค.–ก.ย., ก.ย. = เดือนเดียว (ของปีล่าสุดที่มีข้อมูล) */
async function periodMonths(db: Db, period: ReportPeriod) {
  const latest = await one<{ y: number; m: number }>(
    db,
    `select extract(year from max(month))::int as y, extract(month from max(month))::int as m from energy_monthly`,
  )
  if (!latest?.y) return { year: new Date().getFullYear(), months: [] as number[] }
  const months = period === 'year' ? Array.from({ length: latest.m }, (_, i) => i + 1) : period === 'q3' ? [7, 8, 9] : [9]
  return { year: latest.y, months }
}

export async function computeReport(db: Db, period: ReportPeriod, brand: string) {
  const cfg = await loadConfig(db)
  const { year, months } = await periodMonths(db, period)
  const monthKeys = months.map((m) => `${year}-${String(m).padStart(2, '0')}-01`)

  const vehicles = await rows<{ id: string; efficiency: number; odometerKm: number }>(
    db,
    `select v.id, v.efficiency, v.odometer_km as "odometerKm"
       from vehicles v left join vehicle_models vm on vm.model = v.model
      where $1 = 'all' or coalesce(vm.brand, split_part(v.model, ' ', 1)) = $1
      order by v.id`,
    [brand],
  )

  const monthly = await rows<{ month: string; kd: number; kp: number; co2: number; c1: number; c2: number; c3: number; c4: number }>(
    db,
    `select to_char(em.month, 'YYYY-MM-DD') as month,
            sum(kwh_depot) as kd, sum(kwh_public) as kp, sum(co2_avoided_kg) as co2,
            sum(cost_depot_offpeak) as c1, sum(cost_depot_onpeak) as c2, sum(cost_public_dc) as c3, sum(cost_public_ac) as c4
       from energy_monthly em
       join vehicles v on v.id = em.vehicle_id
       left join vehicle_models vm on vm.model = v.model
      where em.month = any($1::date[])
        and ($2 = 'all' or coalesce(vm.brand, split_part(v.model, ' ', 1)) = $2)
      group by em.month`,
    [monthKeys, brand],
  )
  const byMonth = new Map(monthly.map((r) => [r.month, r]))
  const series = monthKeys.map((k) => byMonth.get(k) ?? { month: k, kd: 0, kp: 0, co2: 0, c1: 0, c2: 0, c3: 0, c4: 0 })

  const kwhDepot = series.map((r) => Math.round(r.kd))
  const kwhPublic = series.map((r) => Math.round(r.kp))
  const kwh = sum(kwhDepot) + sum(kwhPublic)
  const costParts = [sum(series.map((r) => r.c1)), sum(series.map((r) => r.c2)), sum(series.map((r) => r.c3)), sum(series.map((r) => r.c4))]
  const cost = Math.round(sum(costParts))
  const avgEff = vehicles.length ? sum(vehicles.map((v) => v.efficiency)) / vehicles.length : 0
  const km = avgEff ? Math.round((kwh * 100) / avgEff) : 0
  const costPerKm = km ? cost / km : 0
  const avoidedTons = round(sum(series.map((r) => r.co2)) / 1000, 1)

  const fleet = await one<{ ev: number; ice: number }>(
    db,
    `select (select count(*) from vehicles)::int as ev, (select count(*) from ice_vehicles)::int as ice`,
  )
  const mixLabels = ['Depot (TOU Off-Peak)', 'Depot (On-Peak)', 'สาธารณะ DC', 'สาธารณะ AC']
  const costTotal = sum(costParts)

  return {
    labels: monthKeys.map(monthLabel),
    kwhDepot,
    kwhPublic,
    co2: series.map((r) => round(r.co2 / 1000, 2)),
    totals: {
      kwh,
      kwhChangePct: cfg.kwhChangePct,
      cost,
      avgPricePerKwh: kwh ? round(cost / kwh, 2) : 0,
      km,
      costPerKm: round(costPerKm, 2),
      oilCostPerKm: cfg.oilCostPerKm,
      vehicleCount: vehicles.length,
      fuelSavings: Math.round((cfg.oilCostPerKm - costPerKm) * km),
    },
    costMix: mixLabels.map((label, i) => ({ label, pct: costTotal ? round((costParts[i] / costTotal) * 100, 1) : 0 })),
    carbon: {
      avoidedTons,
      gridTons: round((kwh * cfg.gridKgPerKwh) / 1000, 1),
      gridFactor: cfg.gridKgPerKwh,
      trees: Math.round((avoidedTons * 1000) / cfg.treeKgPerYear),
      treeKgPerYear: cfg.treeKgPerYear,
      netZeroPct: fleet && fleet.ev + fleet.ice ? Math.round((fleet.ev / (fleet.ev + fleet.ice)) * 100) : 0,
      evCount: fleet?.ev ?? 0,
      fleetCount: (fleet?.ev ?? 0) + (fleet?.ice ?? 0),
    },
    perKm: [
      { label: 'รถเก๋งน้ำมัน', grams: cfg.co2PerKm.sedan },
      { label: 'กระบะดีเซล', grams: cfg.co2PerKm.diesel },
      { label: 'ไฮบริด', grams: cfg.co2PerKm.hybrid },
      { label: 'EV (กริดไทย)', grams: Math.round(avgEff * cfg.gridKgPerKwh * 10) },
      { label: 'EV (Solar Depot)', grams: cfg.co2PerKm.evSolar },
    ],
    // อัตราการใช้งาน: ประมาณจากเลขไมล์ (ยังไม่มีข้อมูลเวลาทำงานจริง) — เปลี่ยนเป็นข้อมูลจริงเมื่อมี
    usage: vehicles.map((v) => ({ id: v.id, utilization: Math.min(92, Math.round(v.odometerKm / 500 + 20)), efficiency: v.efficiency })),
  }
}

export async function computeElectrification(db: Db) {
  const cfg = await loadConfig(db)
  const ice = await rows<{
    id: string; model: string; kmPerDay: number; maxKmPerDay: number; fuelPerMonth: number; readinessScore: number; recommendedEv: string
  }>(
    db,
    `select id, model, km_per_day as "kmPerDay", max_km_per_day as "maxKmPerDay", fuel_per_month as "fuelPerMonth",
            readiness_score as "readinessScore", recommended_ev as "recommendedEv"
       from ice_vehicles order by readiness_score desc, id`,
  )
  const est = cfg.evEstimate
  const list = ice.map((v) => ({
    ice: v,
    evMonthlyCost: Math.round(v.kmPerDay * est.workingDays * est.kwhPerKm * est.pricePerKwh),
    readiness: v.readinessScore >= 80 ? 'ready' : v.readinessScore >= 60 ? 'consider' : 'not',
  }))
  const ready = list.filter((r) => r.readiness === 'ready')
  const tco = await rows<{ label: string; ice: number; ev: number }>(db, `select label, ice_cost as ice, ev_cost as ev from tco_items order by sort`)
  return {
    rows: list,
    readyCount: ready.length,
    laterCount: list.length - ready.length,
    annualSavings: sum(ready.map((r) => (r.ice.fuelPerMonth - r.evMonthlyCost) * 12)),
    tco: {
      labels: [...tco.map((t) => t.label), 'รวม TCO'],
      ice: [...tco.map((t) => t.ice), sum(tco.map((t) => t.ice))],
      ev: [...tco.map((t) => t.ev), sum(tco.map((t) => t.ev))],
      iceName: cfg.tcoNames.ice,
      evName: cfg.tcoNames.ev,
    },
  }
}
