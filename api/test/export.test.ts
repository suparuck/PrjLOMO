import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

async function open(buf: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}
/** ค่าในชีต "สรุป": คอลัมน์ A = ชื่อ, B = ค่า */
const summary = (wb: ExcelJS.Workbook) => {
  const m = new Map<string, unknown>()
  wb.getWorksheet('สรุป')!.eachRow((r) => m.set(String(r.getCell(1).value), r.getCell(2).value))
  return m
}

describe('ส่งออก Excel ฝั่ง API และแนบในอีเมลรายงานตามเวลา', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const get = (url: string, headers?: Record<string, string>) => t.app.inject({ method: 'GET', url: `${P}${url}`, headers: headers ?? admin })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('GET /reports/export: ไฟล์ xlsx ที่เปิดได้ ครบทุกชีต ตัวเลขตรงกับ /reports', async () => {
    const res = await get('/reports/export?period=year&brand=all')
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-type'] as string, /spreadsheetml\.sheet/)
    assert.match(res.headers['content-disposition'] as string, /attachment; filename="ev-monitor-report-\d{4}-\d{2}-\d{2}\.xlsx"/)
    const wb = await open(res.rawPayload)
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['สรุป', 'พลังงานรายเดือน', 'สัดส่วนค่าใช้จ่าย', 'การใช้งานรถ', 'ปล่อยต่อกม.', 'ความพร้อมเปลี่ยนเป็น EV'])

    const api = json(await get('/reports?period=year&brand=all'))
    const s = summary(wb)
    assert.equal(s.get('พลังงานที่ใช้ (kWh)'), api.totals.kwh)
    assert.equal(s.get('ค่าไฟรวม (บาท)'), api.totals.cost)
    assert.equal(s.get('จำนวนรถ'), api.totals.vehicleCount)
    assert.equal(wb.getWorksheet('พลังงานรายเดือน')!.rowCount, api.labels.length + 1)
  })

  it('ตัวกรองมีผลกับไฟล์ (ยี่ห้อ/ช่วงเวลา) และ kind=esg ให้ไฟล์ ESG พร้อมหมายเหตุ Scope 1', async () => {
    const all = summary(await open((await get('/reports/export?period=year&brand=all')).rawPayload))
    const byd = summary(await open((await get('/reports/export?period=year&brand=BYD')).rawPayload))
    assert.ok((byd.get('จำนวนรถ') as number) < (all.get('จำนวนรถ') as number))
    assert.equal(byd.get('ตัวกรองรถ'), 'เฉพาะ BYD')
    const q3 = summary(await open((await get('/reports/export?period=q3&brand=all')).rawPayload))
    assert.equal(q3.get('ช่วงเวลา'), 'ไตรมาส 3/2026')

    const esg = await get('/reports/export?kind=esg&period=year')
    assert.match(esg.headers['content-disposition'] as string, /ev-monitor-esg-/)
    const wb = await open(esg.rawPayload)
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['สรุป', 'รายเดือน', 'ปล่อยต่อกม.'])
    const s = summary(wb)
    assert.ok(String(s.get('หมายเหตุ Scope 1')).includes('ไม่คำนวณ Scope 1'))
    const api = json(await get('/reports?period=year&brand=all'))
    assert.equal(s.get('Scope 2: การปล่อยจากไฟฟ้าที่ชาร์จ (ตัน CO₂e)'), api.carbon.gridTons)
  })

  it('สิทธิ์และพารามิเตอร์: ไม่ล็อกอิน 401, viewer ดาวน์โหลดได้ (เหมือนดูรายงาน), ค่าผิด 400', async () => {
    assert.equal((await get('/reports/export', {})).statusCode, 401)
    const inv = json(await t.app.inject({ method: 'POST', url: `${P}/users/invite`, headers: admin, payload: { email: 'xv@company.co.th', role: 'viewer' } }))
    await t.app.inject({ method: 'POST', url: `${P}/auth/invite/accept`, payload: { token: inv.inviteToken, password: 'Passw0rdOK' } })
    const viewer = await login(t.app, 'xv@company.co.th', 'Passw0rdOK')
    assert.equal((await get('/reports/export', viewer)).statusCode, 200)
    for (const qs of ['period=2030', 'kind=pdf']) assert.equal((await get(`/reports/export?${qs}`)).statusCode, 400, qs)
  })

  it('อีเมลรายงานตามเวลา (ส่งทดสอบ) แนบไฟล์ Excel ที่เปิดได้ และข้อความอ้างถึงไฟล์แนบ', async () => {
    const s = json(
      await t.app.inject({
        method: 'POST',
        url: `${P}/report-schedules`,
        headers: admin,
        payload: { frequency: 'daily', hour: 8, recipients: ['boss@company.co.th', 'cfo@company.co.th'], period: 'q3', brand: 'MG' },
      }),
    )
    t.mail.length = 0
    const res = await t.app.inject({ method: 'POST', url: `${P}/report-schedules/${s.id}/send-now`, headers: admin, payload: {} })
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(t.mail.length, 2)
    for (const m of t.mail as { text: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }[]) {
      assert.equal(m.attachments?.length, 1)
      const a = m.attachments![0]
      assert.match(a.filename, /^ev-monitor-report-\d{4}-\d{2}-\d{2}\.xlsx$/)
      assert.match(a.contentType ?? '', /spreadsheetml/)
      const wb = await open(a.content)
      const sm = summary(wb)
      assert.equal(sm.get('ช่วงเวลา'), 'ไตรมาส 3/2026', 'ไฟล์ตรงกับช่วงเวลา/ตัวกรองของตารางเวลา')
      assert.equal(sm.get('ตัวกรองรถ'), 'เฉพาะ MG')
      assert.match(m.text, /แนบมากับอีเมลนี้/)
    }
  })
})
