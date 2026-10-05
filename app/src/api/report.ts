import * as db from './mockData'
import type { ElectrificationReport, Report, ReportFilters } from '../types'

// ค่าสมมติฐานของรายงาน (ปรับได้เมื่อมีข้อมูล/สูตรจริงจาก backend)
const GRID_KG_PER_KWH = 0.4 // ค่าการปล่อยกริดไทย
const TREE_KG_PER_YEAR = 22
const AVG_PRICE_PER_KWH = 4.82
const OIL_COST_PER_KM = 2.48
const DEPOT_SHARE = 0.62
const ICE_G_PER_KM = { sedan: 165, diesel: 210, hybrid: 105, evSolar: 12 }
const KWH_CHANGE_VS_LAST_YEAR = 12 // ยังไม่มีข้อมูลปีก่อน

const PERIOD_MONTHS = { year: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], q3: [6, 7, 8], sep: [8] } as const
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d

/** คำนวณรายงานทั้งหมดจากข้อมูลดิบ — ตัวกรองมีผลกับกราฟ ตัวเลขสรุป และตารางการใช้งาน */
export function computeReport(f: ReportFilters): Report {
  const idx = PERIOD_MONTHS[f.period]
  const vs = db.vehicles.filter((v) => f.brand === 'all' || v.model.startsWith(f.brand))
  const share = vs.length / db.vehicles.length
  const Y = db.energyYear

  const kwhMonthly = idx.map((i) => Y.kwh[i] * share)
  const kwhDepot = kwhMonthly.map((k) => Math.round(k * DEPOT_SHARE))
  const kwhPublic = kwhMonthly.map((k) => Math.round(k * (1 - DEPOT_SHARE)))
  const co2 = idx.map((i) => round(Y.co2[i] * share, 2))

  const kwh = sum(kwhDepot) + sum(kwhPublic)
  const avgEff = vs.length ? sum(vs.map((v) => v.efficiency)) / vs.length : 0
  const km = avgEff ? Math.round((kwh * 100) / avgEff) : 0
  const cost = Math.round(kwh * AVG_PRICE_PER_KWH)
  const costPerKm = km ? cost / km : 0
  const avoidedTons = round(sum(co2), 1)
  const fleetCount = db.vehicles.length + db.iceVehicles.length

  return {
    labels: idx.map((i) => Y.labels[i]),
    kwhDepot,
    kwhPublic,
    co2,
    totals: {
      kwh,
      kwhChangePct: KWH_CHANGE_VS_LAST_YEAR,
      cost,
      avgPricePerKwh: AVG_PRICE_PER_KWH,
      km,
      costPerKm: round(costPerKm, 2),
      oilCostPerKm: OIL_COST_PER_KM,
      vehicleCount: vs.length,
      fuelSavings: Math.round((OIL_COST_PER_KM - costPerKm) * km),
    },
    costMix: db.costMix,
    carbon: {
      avoidedTons,
      gridTons: round((kwh * GRID_KG_PER_KWH) / 1000, 1),
      gridFactor: GRID_KG_PER_KWH,
      trees: Math.round((avoidedTons * 1000) / TREE_KG_PER_YEAR),
      treeKgPerYear: TREE_KG_PER_YEAR,
      netZeroPct: Math.round((db.vehicles.length / fleetCount) * 100),
      evCount: db.vehicles.length,
      fleetCount,
    },
    perKm: [
      { label: 'รถเก๋งน้ำมัน', grams: ICE_G_PER_KM.sedan },
      { label: 'กระบะดีเซล', grams: ICE_G_PER_KM.diesel },
      { label: 'ไฮบริด', grams: ICE_G_PER_KM.hybrid },
      { label: 'EV (กริดไทย)', grams: Math.round(avgEff * GRID_KG_PER_KWH * 10) },
      { label: 'EV (Solar Depot)', grams: ICE_G_PER_KM.evSolar },
    ],
    // อัตราการใช้งานประมาณจากเลขไมล์ (สูตรเดียวกับต้นแบบ รอข้อมูลเวลาทำงานจริง)
    usage: vs.map((v) => ({ id: v.id, utilization: Math.min(92, Math.round(v.odometer / 500 + 20)), efficiency: v.efficiency })),
  }
}

export function computeElectrification(): ElectrificationReport {
  const rows = [...db.iceVehicles]
    .sort((a, b) => b.readinessScore - a.readinessScore)
    .map((ice) => ({
      ice,
      evMonthlyCost: Math.round(ice.kmPerDay * 26 * 0.15 * 4.8),
      readiness: ice.readinessScore >= 80 ? ('ready' as const) : ice.readinessScore >= 60 ? ('consider' as const) : ('not' as const),
    }))
  const ready = rows.filter((r) => r.readiness === 'ready')
  const t = db.tco
  return {
    rows,
    readyCount: ready.length,
    laterCount: rows.length - ready.length,
    annualSavings: sum(ready.map((r) => (r.ice.fuelPerMonth - r.evMonthlyCost) * 12)),
    tco: {
      labels: ['ราคารถ', 'พลังงาน 5 ปี', 'บำรุงรักษา 5 ปี', 'ภาษี/ประกัน 5 ปี', 'รวม TCO'],
      ice: [...t.ice, sum(t.ice)],
      ev: [...t.ev, sum(t.ev)],
      iceName: t.iceName,
      evName: t.evName,
    },
  }
}
