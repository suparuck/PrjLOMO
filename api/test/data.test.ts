import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('อ่านข้อมูล: ตรงกับ mockup เดิม', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let h: Record<string, string>
  const get = async (url: string) => {
    const res = await t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: h })
    assert.equal(res.statusCode, 200, `${url} → ${res.statusCode} ${res.body.slice(0, 200)}`)
    return json(res)
  }
  before(async () => {
    t = await startApp()
    h = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('รถ 12 คัน สถานะตรงกับเดิม', async () => {
    const v = await get('/vehicles')
    assert.equal(v.length, 12)
    const by = (s: string) => v.filter((x: any) => x.status === s).length
    assert.deepEqual([by('driving'), by('charging'), by('parked'), by('low'), by('offline')], [4, 2, 3, 2, 1])
    const ev3 = v.find((x: any) => x.id === 'EV-003')
    assert.equal(ev3.soc, 18)
    assert.equal(ev3.driverId, 'D03')
    assert.equal(ev3.batteryTempC, 28 + (18 % 9))
  })

  it('รายละเอียดรถ: คนขับ กราฟ SoC ~24 ชม. ทริป 5 รายการ งานบำรุงรักษา 3 รายการ', async () => {
    const d = await get('/vehicles/EV-003')
    assert.equal(d.vehicle.id, 'EV-003')
    assert.equal(d.driver.name, 'วิชัย คำแสน')
    assert.ok(d.socSeries.values.length >= 23 && d.socSeries.values.length <= 25)
    assert.equal(d.socSeries.labels.length, d.socSeries.values.length)
    assert.equal(d.socSeries.values.at(-1), 18, 'จุดล่าสุดคือระดับแบตปัจจุบัน')
    assert.equal(d.trips.length, 5)
    assert.ok(d.trips[0].startedAt > d.trips[1].startedAt, 'เรียงใหม่ → เก่า')
    assert.equal(d.maintenance.length, 3)
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/v1/vehicles/EV-999', headers: h })).statusCode, 404)
  })

  it('คนขับ: สถิติ 30 วันคำนวณจากทริป/เหตุการณ์จริง ตรงกับเดิม', async () => {
    const d = await get('/drivers')
    assert.equal(d.length, 12)
    const sum = (k: string) => d.reduce((s: number, x: any) => s + x[k], 0)
    assert.equal(Math.round(sum('km30d')), 21050)
    assert.equal(sum('trips30d'), 733)
    assert.equal(sum('events30d'), 67)
    const d08 = d.find((x: any) => x.id === 'D08')
    assert.deepEqual([d08.score, d08.km30d, d08.trips30d, d08.events30d, d08.vehicleId], [67, 2390, 75, 15, 'EV-008'])

    const ev = await get('/drivers/events')
    assert.deepEqual(ev.map((e: any) => e.count), [26, 19, 15, 7])
    assert.deepEqual(ev.map((e: any) => e.label), ['เบรกแรง', 'ขับเร็วเกินกำหนด', 'เร่งแรง', 'จอดติดเครื่องนาน'])
  })

  it('สถานี เซสชันที่กำลังชาร์จ ประวัติ และโหลดรายชั่วโมง', async () => {
    const st = await get('/stations')
    assert.equal(st.length, 6)
    assert.deepEqual(st.find((s: any) => s.id === 'S3'), { id: 'S3', name: 'PEA VOLTA สารภี', type: 'public', network: 'PEA VOLTA', lat: 18.71, lng: 99.04, ports: 4, busyPorts: 3, power: 'DC 120 kW', pricePerKwh: 7.5 })

    const s = await get('/charging/sessions')
    assert.deepEqual(s.map((x: any) => [x.vehicleId, x.nowSoc, x.targetSoc, x.kw, x.etaMinutes]), [['EV-004', 78, 90, 60, 18], ['EV-008', 33, 80, 112, 21]])

    const hist = await get('/charging/history')
    assert.equal(hist.length, 6)
    assert.ok(hist.every((x: any) => x.status === 'completed' && x.endedAt))
    assert.equal(hist[0].vehicleId, 'EV-005')
    assert.equal((await get('/charging/history?hours=6')).length, 2, 'กรองตามช่วงเวลา')

    const load = await get('/charging/load')
    assert.equal(load.kw.length, 24)
    assert.equal(load.kw[10], 172)
    assert.deepEqual([load.peakStart, load.peakEnd], [9, 22])
  })

  it('แจ้งเตือน: ยังไม่รับทราบ 5, เวลาตอบสนองเฉลี่ย 6.4 นาที, กฎ 5 ข้อ, ช่องทาง 3 ช่อง', async () => {
    const a = await get('/alerts')
    assert.equal(a.length, 8)
    assert.equal(a.filter((x: any) => !x.acknowledgedAt).length, 5)
    assert.equal(a[0].title, 'แบตเตอรี่ต่ำมาก', 'ใหม่สุดอยู่บนสุด')
    assert.deepEqual(await get('/alerts/stats'), { avgResponseMinutes: 6.4, openCount: 5 })
    const rules = await get('/alert-rules')
    assert.deepEqual(rules.map((r: any) => r.enabled), [true, true, true, true, false])
    assert.equal((await get('/notification-channels')).length, 3)
  })

  it('รายงานปี: พลังงาน 44,440 kWh, ค่าไฟ 214,201, CO₂ 30.1 ตัน, ต้นทุน/กม. ฿0.70', async () => {
    const r = await get('/reports?period=year')
    assert.equal(r.labels.length, 10)
    assert.equal(r.labels[0], 'ม.ค.')
    assert.equal(r.totals.kwh, 44440)
    assert.equal(r.totals.cost, 214201)
    assert.equal(r.totals.avgPricePerKwh, 4.82)
    assert.equal(r.totals.costPerKm, 0.7)
    assert.equal(r.totals.vehicleCount, 12)
    assert.equal(r.carbon.avoidedTons, 30.1)
    assert.equal(r.carbon.gridTons, 17.8)
    assert.equal(r.carbon.netZeroPct, 71)
    assert.deepEqual(r.carbon.treeKgPerYear, 22)
    assert.deepEqual(r.costMix.map((m: any) => m.pct), [38, 14, 41, 7])
    assert.equal(r.perKm[3].grams, 58)
    assert.equal(r.usage.length, 12)
    assert.equal(r.kwhDepot.length, 10)
  })

  it('ตัวกรองรายงานมีผลจริง: ไตรมาส 3, เดือน ก.ย., ยี่ห้อ BYD/MG', async () => {
    const q3 = await get('/reports?period=q3')
    assert.deepEqual(q3.labels, ['ก.ค.', 'ส.ค.', 'ก.ย.'])
    assert.equal(q3.totals.kwh, 5340 + 5410 + 5280)
    const sep = await get('/reports?period=sep')
    assert.equal(sep.totals.kwh, 5280)
    const byd = await get('/reports?period=sep&brand=BYD')
    assert.equal(byd.totals.vehicleCount, 5)
    assert.equal(byd.totals.kwh, 2200)
    const mg = await get('/reports?period=sep&brand=MG')
    assert.equal(mg.totals.vehicleCount, 2)
    const none = await get('/reports?period=sep&brand=Nope')
    assert.equal(none.totals.kwh, 0)
    assert.equal(none.totals.costPerKm, 0)
  })

  it('ความพร้อมเปลี่ยนเป็น EV: 3 คันพร้อม ประหยัด ~฿220K/ปี, TCO รวมถูกต้อง', async () => {
    const e = await get('/reports/electrification')
    assert.equal(e.readyCount, 3)
    assert.equal(e.laterCount, 2)
    assert.equal(e.rows[0].ice.id, 'ICE-22', 'เรียงตามคะแนน')
    assert.equal(e.rows[0].evMonthlyCost, Math.round(74 * 26 * 0.15 * 4.8))
    assert.equal(e.annualSavings, (9800 - 1797 + 6100 - 1385 + 7900 - 2246) * 12)
    assert.equal(e.tco.ice.at(-1), 559000 + 372000 + 68000 + 95000)
    assert.equal(e.tco.ev.at(-1), 569900 + 104000 + 30000 + 72000)
  })

  it('ตัวเลขแดชบอร์ด: พลังงานสัปดาห์ 1,248 kWh (+8.4%) ฿6,010, ความยั่งยืน, SoH, ระยะวิ่งตามรุ่น', async () => {
    const w = await get('/energy/week')
    assert.equal(w.kwh.length, 7)
    assert.equal(w.kwh.reduce((a: number, b: number) => a + b, 0), 1248)
    const s = await get('/energy/summary')
    assert.deepEqual([s.totalKwh, s.kwhChangePct, s.totalCost, s.avgPricePerKwh], [1248, 8.4, 6010, 4.82])
    const su = await get('/sustainability')
    assert.deepEqual([su.co2Tons, su.treesEquivalent, su.totalKm, su.iceReadyCount], [30.1, 1368, 232650, 3])
    const b = await get('/battery/insights')
    assert.equal(b.sohTrend.values.length, 12)
    assert.equal(b.sohTrend.labels.length, 12)
    assert.equal(b.sohTrend.values.at(-1), 95.8)
    assert.equal(b.modelRanges.length, 8)
    assert.deepEqual(b.modelRanges.find((m: any) => m.model === 'BYD Seal'), { model: 'BYD Seal', spec: 510, actual: Math.round(510 * 0.86) })
  })

  it('ตั้งค่า องค์กร ผู้ใช้ การเชื่อมต่อ', async () => {
    const s = await get('/settings')
    assert.deepEqual(s.thresholds, { lowBattery: 30, criticalBattery: 20, maxSpeed: 100, offlineMinutes: 30 })
    assert.equal(s.charging.offPeak, '2.60')
    const org = await get('/org')
    assert.equal(org.city, 'เชียงใหม่')
    assert.deepEqual(org.center, [18.7883, 98.9853])
    const users = await get('/users')
    assert.equal(users.length, 3)
    assert.equal(users[0].role, 'admin', 'admin อยู่บนสุด')
    assert.ok(!('password_hash' in users[0]) && !('passwordHash' in users[0]), 'ห้ามส่ง hash ออกมา')
    const ig = await get('/integrations')
    assert.equal(ig.length, 6)
    // LINE แสดงตามการตั้งค่า token จริง (ไม่ตั้ง = ไม่เชื่อมต่อ) จึงเหลือ 2: Telematics และ PEA
    assert.equal(ig.filter((i: any) => i.connected).length, 2)
    assert.equal(ig.find((i: any) => i.key === 'line').connected, false)
  })

  it('หน้าสาธารณะ: มีเฉพาะตัวเลขรวม ไม่ต้องล็อกอิน และไม่รั่วรายคัน', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/public/overview' })
    assert.equal(res.statusCode, 200)
    const o = json(res)
    assert.deepEqual([o.vehicleCount, o.onlineCount, o.chargingCount, o.yearCo2Tons, o.latestMonthKwh], [12, 11, 2, 30.1, 5280])
    assert.ok(!/EV-0\d\d/.test(res.body), 'ไม่มีรหัสรถ')
  })
})
