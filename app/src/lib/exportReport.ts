import type { ElectrificationReport, Report, ReportBrand, ReportPeriod } from '@/types'

export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  year: 'ปี 2026 (ม.ค. – ต.ค.)',
  q3: 'ไตรมาส 3/2026',
  sep: 'เดือน ก.ย. 2026',
}
export const brandLabel = (b: ReportBrand) => (b === 'all' ? 'รถทุกคัน' : `เฉพาะ ${b}`)

const READY = { ready: 'พร้อม', consider: 'พิจารณา', not: 'ยังไม่แนะนำ' } as const

interface Ctx {
  report: Report
  electrify: ElectrificationReport | null
  period: ReportPeriod
  brand: ReportBrand
}

type Cell = string | number
type Workbook = import('exceljs').Workbook

/** เพิ่มชีตตาราง: หัวตารางตัวหนา แถวหัวค้างไว้ ปรับความกว้างคอลัมน์ตามเนื้อหา */
function addTable(wb: Workbook, name: string, head: string[], body: Cell[][], numFmt = '#,##0.##') {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(head).font = { bold: true }
  body.forEach((r) => ws.addRow(r))
  ws.columns.forEach((col, i) => {
    const longest = Math.max(head[i].length, ...body.map((r) => String(r[i] ?? '').length))
    col.width = Math.min(48, Math.max(12, longest + 4))
    if (i > 0) col.numFmt = numFmt
  })
  return ws
}

function addSummary(wb: Workbook, c: Ctx, title: string, extra: [string, Cell][]) {
  const ws = wb.addWorksheet('สรุป')
  ws.addRow([title]).font = { bold: true, size: 14 }
  ws.addRow(['ช่วงเวลา', PERIOD_LABEL[c.period]])
  ws.addRow(['ตัวกรองรถ', brandLabel(c.brand)])
  ws.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH')])
  ws.addRow([])
  extra.forEach(([k, v]) => ws.addRow([k, v]))
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 28
  ws.getColumn(2).alignment = { horizontal: 'left' }
}

function energySheets(wb: Workbook, { report: r }: Ctx) {
  addTable(
    wb,
    'พลังงานรายเดือน',
    ['เดือน', 'kWh Depot', 'kWh สาธารณะ', 'kWh รวม', 'CO₂ ที่ลดได้ (ตัน)'],
    r.labels.map((l, i) => [l, r.kwhDepot[i], r.kwhPublic[i], r.kwhDepot[i] + r.kwhPublic[i], r.co2[i]]),
  )
  addTable(wb, 'สัดส่วนค่าใช้จ่าย', ['ประเภท', 'สัดส่วน (%)'], r.costMix.map((m) => [m.label, m.pct]))
  addTable(wb, 'การใช้งานรถ', ['รถ', 'อัตราการใช้งาน (%)', 'kWh/100 กม.'], r.usage.map((u) => [u.id, u.utilization, u.efficiency]))
  addTable(wb, 'ปล่อยต่อกม.', ['ประเภทรถ', 'gCO₂/กม.'], r.perKm.map((p) => [p.label, p.grams]))
}

async function download(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

/** รายงานทั้งหมดตามตัวกรองที่เลือก (หลายชีต) */
export async function exportReportXlsx(c: Ctx) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const t = c.report.totals
  addSummary(wb, c, 'รายงานกองยาน EV — EV Monitor', [
    ['พลังงานที่ใช้ (kWh)', t.kwh],
    ['เปลี่ยนแปลงจากช่วงก่อน (%)', t.kwhChangePct],
    ['ค่าไฟรวม (บาท)', t.cost],
    ['ราคาเฉลี่ย (บาท/kWh)', t.avgPricePerKwh],
    ['ระยะทางรวม (กม.)', t.km],
    ['ต้นทุนต่อกม. (บาท)', t.costPerKm],
    ['ต้นทุนน้ำมันต่อกม. เทียบเท่า (บาท)', t.oilCostPerKm],
    ['ประหยัดค่าเชื้อเพลิง (บาท)', t.fuelSavings],
    ['จำนวนรถ', t.vehicleCount],
    ['CO₂ ที่ลดได้ (ตัน)', c.report.carbon.avoidedTons],
  ])
  energySheets(wb, c)
  if (c.electrify) {
    addTable(
      wb,
      'ความพร้อมเปลี่ยนเป็น EV',
      ['รถสันดาป', 'รุ่น', 'ระยะเฉลี่ย/วัน (กม.)', 'ระยะสูงสุด/วัน (กม.)', 'ค่าน้ำมัน/เดือน (บาท)', 'ค่าไฟ EV คาดการณ์/เดือน (บาท)', 'คะแนนความพร้อม', 'ผลประเมิน', 'รุ่น EV ที่แนะนำ'],
      c.electrify.rows.map(({ ice: i, evMonthlyCost, readiness }) => [i.id, i.model, i.kmPerDay, i.maxKmPerDay, i.fuelPerMonth, evMonthlyCost, i.readinessScore, READY[readiness], i.recommendedEv]),
    )
  }
  await download(wb, `ev-monitor-report-${stamp()}.xlsx`)
}

/** ข้อมูลสำหรับรายงานความยั่งยืน (ESG): การปล่อยจากไฟฟ้า (Scope 2) และการปล่อยที่หลีกเลี่ยงได้ */
export async function exportEsgXlsx(c: Ctx) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const k = c.report.carbon
  addSummary(wb, c, 'ข้อมูลรายงานความยั่งยืน (ESG) — EV Monitor', [
    ['Scope 2: การปล่อยจากไฟฟ้าที่ชาร์จ (ตัน CO₂e)', k.gridTons],
    ['ค่าการปล่อยของกริด (kgCO₂/kWh)', k.gridFactor],
    ['พลังงานไฟฟ้าที่ชาร์จ (kWh)', c.report.totals.kwh],
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
    c.report.labels.map((l, i) => {
      const kwh = c.report.kwhDepot[i] + c.report.kwhPublic[i]
      return [l, kwh, Math.round(((kwh * k.gridFactor) / 1000) * 100) / 100, c.report.co2[i]]
    }),
  )
  addTable(wb, 'ปล่อยต่อกม.', ['ประเภทรถ', 'gCO₂/กม.'], c.report.perKm.map((p) => [p.label, p.grams]))
  await download(wb, `ev-monitor-esg-${stamp()}.xlsx`)
}
