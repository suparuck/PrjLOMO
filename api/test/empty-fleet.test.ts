import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { createAdmin } from '../src/services/accounts'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('ติดตั้งแบบกองยานว่างเปล่า (ไม่มีข้อมูลเดโม)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const get = (url: string, headers?: Record<string, string>) => t.app.inject({ method: 'GET', url: `${P}${url}`, headers: headers ?? admin })
  const count = async (table: string) => (await t.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number

  before(async () => {
    t = await startApp({ demo: false })
    // ฐานข้อมูลว่างไม่มีผู้ใช้ — สร้างผู้ดูแลคนแรกแบบเดียวกับ CLI
    await createAdmin(t.pool, { email: 'first@company.co.th', name: 'ผู้ดูแลคนแรก', password: 'First-Admin-1' })
    admin = await login(t.app, 'first@company.co.th', 'First-Admin-1')
  })
  after(async () => { await t.stop() })

  it('ข้อมูลตั้งต้น: มีเฉพาะค่าอ้างอิง ไม่มีผู้ใช้เดโม/รถ/คนขับ/สถานี/ประวัติ', async () => {
    for (const table of ['vehicles', 'drivers', 'stations', 'alerts', 'charging_sessions', 'trips', 'energy_daily', 'energy_monthly', 'ice_vehicles', 'tco_items', 'maintenance_tasks', 'driving_events']) {
      assert.equal(await count(table), 0, table)
    }
    assert.equal(await count('users'), 1, 'มีเฉพาะผู้ดูแลที่เพิ่งสร้าง')
    assert.ok((await count('app_settings')) === 1 && (await count('alert_rules')) > 0 && (await count('report_config')) > 0 && (await count('vehicle_models')) > 0)
    const s = json(await get('/settings'))
    assert.equal(s.org.name, 'องค์กรของคุณ', 'ชื่อกลาง ไม่ใช่ชื่อเดโม')
    assert.equal(json(await get('/org')).name, 'องค์กรของคุณ')
  })

  it('ไม่มีบัญชีรหัสตั้งต้นและไม่มีการ์ดการเชื่อมต่อที่แสดงว่า "เชื่อมต่อแล้ว" ทั้งที่ยังไม่ได้เชื่อม', async () => {
    assert.deepEqual(json(await get('/security/status')).defaultPasswordUsers, [])
    const ig = json(await get('/integrations'))
    assert.equal(ig.filter((i: { connected: boolean }) => i.connected).length, 0)
  })

  it('ทุก endpoint อ่านข้อมูลตอบ 200 และเป็นข้อมูลว่าง (ไม่ error ไม่ 500 จากการหารศูนย์)', async () => {
    const urls = [
      '/vehicles', '/vehicles?page=1&pageSize=10', '/drivers', '/drivers?page=1', '/drivers/events', '/alerts', '/alerts?page=1', '/alerts/stats', '/alert-rules',
      '/notification-channels', '/charging/sessions', '/charging/history', '/charging/history?page=1', '/charging/load', '/stations', '/energy/week', '/energy/summary',
      '/battery/insights', '/sustainability', '/ice-vehicles', '/users', '/users?page=1', '/settings', '/integrations', '/api-keys', '/report-schedules', '/org',
      '/public/overview', '/reports?period=year&brand=all', '/reports?period=q3&brand=BYD', '/reports?period=sep&brand=MG', '/reports/electrification',
    ]
    for (const u of urls) {
      const res = await get(u)
      assert.equal(res.statusCode, 200, `${u} → ${res.statusCode} ${res.body.slice(0, 160)}`)
    }
  })

  it('ตัวเลขสรุปเป็นศูนย์ที่ถูกต้อง ไม่มี null/NaN ในช่องตัวเลข', async () => {
    const v = json(await get('/vehicles?page=1'))
    assert.deepEqual([v.total, v.items.length, v.pages], [0, 0, 1])
    assert.deepEqual([v.summary.total, v.summary.rangeKm, v.summary.avgSoh, v.summary.odometerKm, v.summary.models.length], [0, 0, 0, 0, 0])

    const d = json(await get('/drivers?page=1'))
    assert.deepEqual(d.summary, { total: 0, scored: 0, avgScore: 0, good: 0, totalKm: 0, events: 0, working: 0 })

    const a = json(await get('/alerts?page=1'))
    assert.deepEqual([a.total, a.items.length], [0, 0])
    assert.equal(json(await get('/alerts/stats')).openCount, 0)

    const r = json(await get('/reports?period=year&brand=all'))
    assert.equal(r.totals.vehicleCount, 0)
    for (const k of ['kwh', 'cost', 'km', 'costPerKm', 'avgPricePerKwh', 'fuelSavings', 'kwhChangePct']) {
      assert.equal(typeof r.totals[k], 'number', k)
      assert.ok(Number.isFinite(r.totals[k]), `${k} = ${r.totals[k]}`)
    }
    assert.ok(Number.isFinite(r.carbon.avoidedTons) && Number.isFinite(r.carbon.netZeroPct) && Number.isFinite(r.carbon.trees))
    assert.equal(r.totals.kwhChangePct, 0, 'ไม่แสดงตัวเลขเปรียบเทียบปีก่อนปลอม')

    const e = json(await get('/reports/electrification'))
    assert.deepEqual([e.rows.length, e.readyCount, e.laterCount, e.annualSavings], [0, 0, 0, 0])
    assert.ok(e.tco.ice.every(Number.isFinite) && e.tco.ev.every(Number.isFinite))

    const s = json(await get('/energy/summary'))
    for (const k of Object.keys(s)) if (typeof s[k] === 'number') assert.ok(Number.isFinite(s[k]), `${k} = ${s[k]}`)
    const o = json(await get('/public/overview'))
    for (const k of Object.keys(o)) if (typeof o[k] === 'number') assert.ok(Number.isFinite(o[k]), `${k} = ${o[k]}`)
  })

  it('รายละเอียดรถที่ไม่มี → 404 · ส่งออก Excel ได้ไฟล์ที่เปิดได้ · ตารางเวลาส่งรายงานสร้างได้และส่งทดสอบได้', async () => {
    assert.equal((await get('/vehicles/EV-001')).statusCode, 404)
    const x = await get('/reports/export?period=year&brand=all')
    assert.equal(x.statusCode, 200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer)
    assert.ok(wb.worksheets.length >= 6)
    const esg = await get('/reports/export?kind=esg')
    assert.equal(esg.statusCode, 200)

    const c = await t.app.inject({
      method: 'POST', url: `${P}/report-schedules`, headers: admin,
      payload: { frequency: 'daily', hour: 8, recipients: ['boss@company.co.th'], period: 'year', brand: 'all' },
    })
    assert.equal(c.statusCode, 201)
    t.mail.length = 0
    const send = await t.app.inject({ method: 'POST', url: `${P}/report-schedules/${json(c).id}/send-now`, headers: admin, payload: {} })
    assert.equal(send.statusCode, 200, send.body)
    assert.equal(t.mail.length, 1)
  })

  it('เริ่มใช้งานจากศูนย์ได้จริง: เพิ่มรถ/คนขับ → รับ telemetry → แจ้งเตือนอัตโนมัติ → ตัวเลขเริ่มมี', async () => {
    const d = await t.app.inject({ method: 'POST', url: `${P}/drivers`, headers: admin, payload: { name: 'สมศรี ใจดี', phone: '081-111-2222' } })
    assert.equal(d.statusCode, 201, d.body)
    const v = await t.app.inject({
      method: 'POST', url: `${P}/vehicles`, headers: admin,
      payload: { id: 'EV-100', model: 'BYD Dolphin', plate: '1กข 9999', driverId: json(d).id, batteryKwh: 60, soc: 80, odometerKm: 1000 },
    })
    assert.equal(v.statusCode, 201, v.body)
    const tel = await t.app.inject({
      method: 'POST', url: `${P}/ingest/telemetry`, headers: { 'x-api-key': t.apiKey },
      payload: { readings: [{ vehicleId: 'EV-100', soc: 12, speedKmh: 0, lat: 13.75, lng: 100.5 }] },
    })
    assert.equal(tel.statusCode, 200, tel.body)
    assert.equal(json(await get('/vehicles?page=1')).summary.total, 1)
    assert.ok(json(await get('/alerts?page=1')).total >= 1, 'แบตต่ำสร้างแจ้งเตือน')
    assert.equal(json(await get('/drivers?page=1')).summary.total, 1)
    assert.equal((await get('/vehicles/EV-100')).statusCode, 200)
    assert.equal((await get('/reports?period=year&brand=all')).statusCode, 200)
  })
})
