import type { Pool } from 'pg'
import { invalid } from '../errors'
import { withTx } from '../db'
import { loadConfig } from './report'

/** สมมติฐานของรายงานที่ผู้ใช้ปรับได้ (ตาราง report_config; ชื่อรถเปรียบเทียบ TCO แยกอยู่ที่ /tco) */
export interface ReportAssumptions {
  gridKgPerKwh: number
  treeKgPerYear: number
  oilCostPerKm: number
  kwhChangePct: number
  efficiencyChangePct: number
  actualRangeRatio: number
  defaultEfficiency: number
  co2GPerKm: { sedan: number; diesel: number; hybrid: number; evSolar: number }
  evEstimate: { workingDays: number; kwhPerKm: number; pricePerKwh: number }
}

/** ค่ามาตรฐานกลาง (ตรงกับ db/init/02_reference.sql) — ใช้ปุ่ม "คืนค่ามาตรฐาน" */
export const DEFAULT_ASSUMPTIONS: ReportAssumptions = {
  gridKgPerKwh: 0.4,
  treeKgPerYear: 22,
  oilCostPerKm: 2.48,
  kwhChangePct: 0,
  efficiencyChangePct: 0,
  actualRangeRatio: 0.86,
  defaultEfficiency: 15,
  co2GPerKm: { sedan: 165, diesel: 210, hybrid: 105, evSolar: 12 },
  evEstimate: { workingDays: 26, kwhPerKm: 0.15, pricePerKwh: 4.8 },
}

/** ช่วงที่ยอมรับและจำนวนทศนิยมสูงสุดของแต่ละค่า — ที่เดียวกันใช้ทั้ง schema ตรวจรับและข้อความผิดพลาด */
export const LIMITS = {
  gridKgPerKwh: { min: 0, max: 2, dp: 3, label: 'ค่าการปล่อย CO₂ ของไฟฟ้า (kgCO₂/kWh)' },
  treeKgPerYear: { min: 1, max: 200, dp: 1, label: 'CO₂ ที่ต้นไม้ดูดซับต่อปี (kg)' },
  oilCostPerKm: { min: 0, max: 50, dp: 2, label: 'ต้นทุนน้ำมันต่อกม. (บาท)' },
  kwhChangePct: { min: -100, max: 1000, dp: 1, label: 'พลังงานรวมเทียบปีก่อน (%)' },
  efficiencyChangePct: { min: -100, max: 100, dp: 1, label: 'ประสิทธิภาพดีขึ้นเทียบช่วงก่อน (%)' },
  actualRangeRatio: { min: 0.3, max: 1.2, dp: 2, label: 'สัดส่วนระยะวิ่งจริงเทียบสเปก' },
  defaultEfficiency: { min: 5, max: 60, dp: 1, label: 'ประสิทธิภาพตั้งต้นของรถใหม่ (kWh/100 กม.)' },
  'co2GPerKm.sedan': { min: 0, max: 1000, dp: 0, label: 'รถเก๋งน้ำมัน (gCO₂/กม.)' },
  'co2GPerKm.diesel': { min: 0, max: 1000, dp: 0, label: 'กระบะดีเซล (gCO₂/กม.)' },
  'co2GPerKm.hybrid': { min: 0, max: 1000, dp: 0, label: 'ไฮบริด (gCO₂/กม.)' },
  'co2GPerKm.evSolar': { min: 0, max: 1000, dp: 0, label: 'EV Solar Depot (gCO₂/กม.)' },
  'evEstimate.workingDays': { min: 1, max: 31, dp: 0, label: 'วันทำงานต่อเดือน' },
  'evEstimate.kwhPerKm': { min: 0.05, max: 1, dp: 3, label: 'พลังงาน EV ต่อกม. (kWh/กม.)' },
  'evEstimate.pricePerKwh': { min: 0, max: 99.99, dp: 2, label: 'ราคาไฟ (บาท/kWh)' },
} as const

const flat = (a: ReportAssumptions): Record<keyof typeof LIMITS, number> => ({
  gridKgPerKwh: a.gridKgPerKwh,
  treeKgPerYear: a.treeKgPerYear,
  oilCostPerKm: a.oilCostPerKm,
  kwhChangePct: a.kwhChangePct,
  efficiencyChangePct: a.efficiencyChangePct,
  actualRangeRatio: a.actualRangeRatio,
  defaultEfficiency: a.defaultEfficiency,
  'co2GPerKm.sedan': a.co2GPerKm.sedan,
  'co2GPerKm.diesel': a.co2GPerKm.diesel,
  'co2GPerKm.hybrid': a.co2GPerKm.hybrid,
  'co2GPerKm.evSolar': a.co2GPerKm.evSolar,
  'evEstimate.workingDays': a.evEstimate.workingDays,
  'evEstimate.kwhPerKm': a.evEstimate.kwhPerKm,
  'evEstimate.pricePerKwh': a.evEstimate.pricePerKwh,
})

/** ตรวจช่วงค่าและจำนวนทศนิยม — ข้อผิดพลาดรายฟิลด์ (คีย์แบบจุด เช่น co2GPerKm.sedan) */
export function checkAssumptions(a: ReportAssumptions): ReportAssumptions {
  const errors: Record<string, string> = {}
  for (const [k, v] of Object.entries(flat(a)) as [keyof typeof LIMITS, number][]) {
    const l = LIMITS[k]
    if (!Number.isFinite(v) || v < l.min || v > l.max) errors[k] = `${l.label} ต้องอยู่ระหว่าง ${l.min} ถึง ${l.max}`
    else if (Math.round(v * 10 ** l.dp) / 10 ** l.dp !== v) errors[k] = l.dp === 0 ? `${l.label} ต้องเป็นจำนวนเต็ม` : `${l.label} ใส่ทศนิยมได้ไม่เกิน ${l.dp} ตำแหน่ง`
  }
  if (Object.keys(errors).length) throw invalid(errors)
  return a
}

export async function readAssumptions(db: Pool): Promise<ReportAssumptions> {
  const c = await loadConfig(db)
  return {
    gridKgPerKwh: c.gridKgPerKwh,
    treeKgPerYear: c.treeKgPerYear,
    oilCostPerKm: c.oilCostPerKm,
    kwhChangePct: c.kwhChangePct,
    efficiencyChangePct: c.efficiencyChangePct,
    actualRangeRatio: c.actualRangeRatio,
    defaultEfficiency: c.defaultEfficiency,
    co2GPerKm: c.co2PerKm,
    evEstimate: c.evEstimate,
  }
}

const DESCRIPTIONS: Record<string, string> = {
  grid_kg_per_kwh: 'ค่าการปล่อย CO₂ ของไฟฟ้ากริดไทย (kgCO₂/kWh)',
  tree_kg_per_year: 'CO₂ ที่ต้นไม้ 1 ต้นดูดซับต่อปี (kg)',
  oil_cost_per_km: 'ต้นทุนน้ำมันเทียบเท่าต่อกิโลเมตร (บาท)',
  kwh_change_vs_last_year_pct: 'พลังงานรวมเทียบปีก่อน (%) — จนกว่าจะมีข้อมูลปีก่อน',
  efficiency_change_pct: 'ประสิทธิภาพ kWh/100กม. ดีขึ้นเทียบช่วงก่อน (%) — จนกว่าจะมีข้อมูลช่วงก่อน',
  actual_range_ratio: 'สัดส่วนระยะวิ่งใช้งานจริงเทียบสเปก',
  default_efficiency: 'ประสิทธิภาพตั้งต้นของรถใหม่ (kWh/100กม.)',
  co2_g_per_km: 'การปล่อย CO₂ ต่อกม. ของรถแต่ละประเภท (g)',
  ev_estimate: 'สูตรประมาณค่าไฟ EV ต่อเดือนของรถสันดาปที่ยังเหลือ',
}

/** บันทึกทั้งชุดในทรานแซกชันเดียว (ไม่มีสถานะที่ค่าครึ่งใหม่ครึ่งเก่า) */
export async function writeAssumptions(pool: Pool, a: ReportAssumptions) {
  const entries: [string, unknown][] = [
    ['grid_kg_per_kwh', a.gridKgPerKwh],
    ['tree_kg_per_year', a.treeKgPerYear],
    ['oil_cost_per_km', a.oilCostPerKm],
    ['kwh_change_vs_last_year_pct', a.kwhChangePct],
    ['efficiency_change_pct', a.efficiencyChangePct],
    ['actual_range_ratio', a.actualRangeRatio],
    ['default_efficiency', a.defaultEfficiency],
    ['co2_g_per_km', a.co2GPerKm],
    ['ev_estimate', a.evEstimate],
  ]
  await withTx(pool, async (c) => {
    for (const [key, value] of entries) {
      await c.query(
        `insert into report_config (key, value, description) values ($1, $2::jsonb, $3)
         on conflict (key) do update set value = excluded.value`,
        [key, JSON.stringify(value), DESCRIPTIONS[key]],
      )
    }
  })
}
