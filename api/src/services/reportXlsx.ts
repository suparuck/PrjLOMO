import ExcelJS from 'exceljs'
import type { Pool } from 'pg'
import { computeElectrification, computeReport, type ReportPeriod } from './report'

export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  year: 'ปี 2026 (ม.ค. – ต.ค.)',
  q3: 'ไตรมาส 3/2026',
  sep: 'เดือน ก.ย. 2026',
}
export const brandLabel = (b: string) => (b === 'all' ? 'รถทุกคัน' : `เฉพาะ ${b}`)

const READY = { ready: 'พร้อม', consider: 'พิจารณา', not: 'ยังไม่แนะนำ' } as const

type Cell = string | number
type Report = Awaited<ReturnType<typeof computeReport>>

/** เพิ่มชีตตาราง: หัวตารางตัวหนา แถวหัวค้างไว้ ปรับความกว้างคอลัมน์ตามเนื้อหา */
function addTable(wb: ExcelJS.Workbook, name: string, head: string[], body: Cell[][], numFmt = '#,##0.##') {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(head).font = { bold: true }
  body.forEach((r) => ws.addRow(r))
  ws.columns.forEach((col, i) => {
    const longest = Math.max(head[i].length, ...body.map((r) => String(r[i] ?? '').length))
    col.width = Math.min(48, Math.max(12, longest + 4))
    if (i > 0) col.numFmt = numFmt
  })
}

function addSummary(wb: ExcelJS.Workbook, period: ReportPeriod, brand: string, title: string, extra: [string, Cell][]) {
  const ws = wb.addWorksheet('สรุป')
  ws.addRow([title]).font = { bold: true, size: 14 }
  ws.addRow(['ช่วงเวลา', PERIOD_LABEL[period]])
  ws.addRow(['ตัวกรองรถ', brandLabel(brand)])
  ws.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })])
  ws.addRow([])
  extra.forEach(([k, v]) => ws.addRow([k, v]))
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 28
  ws.getColumn(2).alignment = { horizontal: 'left' }
}

const toBuffer = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer())

/** รายงานทั้งหมดตามช่วงเวลา/ยี่ห้อที่เลือก (หลายชีต) */
export async function buildReportXlsx(pool: Pool, period: ReportPeriod, brand: string): Promise<Buffer> {
  const [r, e] = await Promise.all([computeReport(pool, period, brand), computeElectrification(pool)])
  const wb = new ExcelJS.Workbook()
  const t = r.totals
  addSummary(wb, period, brand, 'รายงานกองยาน EV — EV Monitor', [
    ['พลังงานที่ใช้ (kWh)', t.kwh],
    ['เปลี่ยนแปลงจากช่วงก่อน (%)', t.kwhChangePct],
    ['ค่าไฟรวม (บาท)', t.cost],
    ['ราคาเฉลี่ย (บาท/kWh)', t.avgPricePerKwh],
    ['ระยะทางรวม (กม.)', t.km],
    ['ต้นทุนต่อกม. (บาท)', t.costPerKm],
    ['ต้นทุนน้ำมันต่อกม. เทียบเท่า (บาท)', t.oilCostPerKm],
    ['ประหยัดค่าเชื้อเพลิง (บาท)', t.fuelSavings],
    ['จำนวนรถ', t.vehicleCount],
    ['CO₂ ที่ลดได้ (ตัน)', r.carbon.avoidedTons],
  ])
  addTable(
    wb,
    'พลังงานรายเดือน',
    ['เดือน', 'kWh Depot', 'kWh สาธารณะ', 'kWh รวม', 'CO₂ ที่ลดได้ (ตัน)'],
    r.labels.map((l, i) => [l, r.kwhDepot[i], r.kwhPublic[i], r.kwhDepot[i] + r.kwhPublic[i], r.co2[i]]),
  )
  addTable(wb, 'สัดส่วนค่าใช้จ่าย', ['ประเภท', 'สัดส่วน (%)'], r.costMix.map((m) => [m.label, m.pct]))
  addTable(wb, 'การใช้งานรถ', ['รถ', 'อัตราการใช้งาน (%)', 'kWh/100 กม.'], r.usage.map((u) => [u.id, u.utilization, u.efficiency]))
  addTable(wb, 'ปล่อยต่อกม.', ['ประเภทรถ', 'gCO₂/กม.'], r.perKm.map((p) => [p.label, p.grams]))
  addTable(
    wb,
    'ความพร้อมเปลี่ยนเป็น EV',
    ['รถสันดาป', 'รุ่น', 'ระยะเฉลี่ย/วัน (กม.)', 'ระยะสูงสุด/วัน (กม.)', 'ค่าน้ำมัน/เดือน (บาท)', 'ค่าไฟ EV คาดการณ์/เดือน (บาท)', 'คะแนนความพร้อม', 'ผลประเมิน', 'รุ่น EV ที่แนะนำ'],
    e.rows.map(({ ice: i, evMonthlyCost, readiness }) => [i.id, i.model, i.kmPerDay, i.maxKmPerDay, i.fuelPerMonth, evMonthlyCost, i.readinessScore, READY[readiness as keyof typeof READY], i.recommendedEv]),
  )
  return toBuffer(wb)
}

/** ข้อมูลสำหรับรายงานความยั่งยืน (ESG): การปล่อยจากไฟฟ้า (Scope 2) และการปล่อยที่หลีกเลี่ยงได้ */
export async function buildEsgXlsx(pool: Pool, period: ReportPeriod, brand: string): Promise<Buffer> {
  const r: Report = await computeReport(pool, period, brand)
  const k = r.carbon
  const wb = new ExcelJS.Workbook()
  addSummary(wb, period, brand, 'ข้อมูลรายงานความยั่งยืน (ESG) — EV Monitor', [
    ['Scope 2: การปล่อยจากไฟฟ้าที่ชาร์จ (ตัน CO₂e)', k.gridTons],
    ['ค่าการปล่อยของกริด (kgCO₂/kWh)', k.gridFactor],
    ['พลังงานไฟฟ้าที่ชาร์จ (kWh)', r.totals.kwh],
    ['การปล่อยที่หลีกเลี่ยงได้เทียบรถน้ำมัน (ตัน CO₂e)', k.avoidedTons],
    ['เทียบเท่าการปลูกต้นไม้ (ต้น)', k.trees],
    ['จำนวน EV / รถทั้งกอง (คัน)', `${k.evCount} / ${k.fleetCount}`],
    ['ความคืบหน้า Net Zero ของกองยาน (%)', k.netZeroPct],
    ['หมายเหตุ Scope 1', 'ระบบยังไม่เก็บปริมาณเชื้อเพลิงของรถสันดาป จึงไม่คำนวณ Scope 1'],
  ])
  addTable(
    wb,
    'รายเดือน',
    ['เดือน', 'kWh รวม', 'Scope 2 (ตัน CO₂e)', 'หลีกเลี่ยงได้ (ตัน CO₂e)'],
    r.labels.map((l, i) => {
      const kwh = r.kwhDepot[i] + r.kwhPublic[i]
      return [l, kwh, Math.round(((kwh * k.gridFactor) / 1000) * 100) / 100, r.co2[i]]
    }),
  )
  addTable(wb, 'ปล่อยต่อกม.', ['ประเภทรถ', 'gCO₂/กม.'], r.perKm.map((p) => [p.label, p.grams]))
  return toBuffer(wb)
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
