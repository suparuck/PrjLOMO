import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('ingest: ระบบภายนอกส่งข้อมูลเข้ามาอัปเดต', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let h: Record<string, string>
  const ingest = (method: 'POST' | 'PUT' | 'PATCH', url: string, payload: unknown, key = t.apiKey) =>
    t.app.inject({ method, url: `/api/v1/ingest${url}`, headers: { 'x-api-key': key }, payload: payload as any })
  const vehicle = async (id: string) => json(await t.app.inject({ method: 'GET', url: '/api/v1/vehicles', headers: h })).find((v: any) => v.id === id)
  const alerts = async () => json(await t.app.inject({ method: 'GET', url: '/api/v1/alerts', headers: h }))
  const isoAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

  before(async () => {
    t = await startApp()
    h = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('ต้องมี API key ที่ถูกต้อง: ไม่มี/ผิด → 401, session ผู้ใช้ใช้แทนไม่ได้', async () => {
    const body = { day: '2026-01-01', kwh: 1, cost: 1 }
    assert.equal((await t.app.inject({ method: 'PUT', url: '/api/v1/ingest/energy/daily', payload: body })).statusCode, 401)
    assert.equal((await ingest('PUT', '/energy/daily', body, 'evm_wrong')).statusCode, 401)
    assert.equal((await t.app.inject({ method: 'PUT', url: '/api/v1/ingest/energy/daily', headers: h, payload: body })).statusCode, 401)
    assert.equal((await ingest('PUT', '/energy/daily', body)).statusCode, 200)
  })

  describe('telemetry', () => {
    it('อัปเดตสถานะล่าสุด: ระดับแบต ตำแหน่ง ระยะวิ่งคงเหลือ และบันทึกประวัติ', async () => {
      const histBefore = (await t.pool.query(`select count(*)::int as n from vehicle_telemetry where vehicle_id = 'EV-002'`)).rows[0].n
      const res = await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-002', soc: 55, speedKmh: 0, lat: 18.69, lng: 98.93, odometerKm: 24200, batteryTempC: 31.5, location: 'หางดง ตลาด' }] })
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(json(res), { accepted: 1, rejected: [] })
      const v = await vehicle('EV-002')
      assert.deepEqual([v.soc, v.status, v.lat, v.odometerKm, v.batteryTempC, v.location], [55, 'parked', 18.69, 24200, 31.5, 'หางดง ตลาด'])
      assert.equal(v.rangeKm, Math.round((0.55 * 51) / 0.152))
      assert.equal((await t.pool.query(`select count(*)::int as n from vehicle_telemetry where vehicle_id = 'EV-002'`)).rows[0].n, histBefore + 1)
    })

    it('คำนวณสถานะ: ความเร็ว>0 = กำลังขับ, ต่ำกว่าเกณฑ์ = แบตต่ำ (ชนะกำลังขับ), กลับมาออนไลน์จาก offline', async () => {
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-002', soc: 55, speedKmh: 40, lat: 18.7, lng: 98.9 }] })
      assert.equal((await vehicle('EV-002')).status, 'driving')
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-009', soc: 71, speedKmh: 0, lat: 18.85, lng: 99.04 }] })
      assert.equal((await vehicle('EV-009')).status, 'parked', 'EV-009 เคยออฟไลน์ ส่งข้อมูลแล้วออนไลน์')
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-002', soc: 25, speedKmh: 40, lat: 18.7, lng: 98.9 }] })
      assert.equal((await vehicle('EV-002')).status, 'low')
    })

    it('แจ้งเตือนอัตโนมัติเมื่อแบตข้ามเกณฑ์ลง (ไม่แจ้งซ้ำถ้ายังไม่รับทราบ)', async () => {
      const before = (await alerts()).length
      // EV-002: 55 → 25 ข้ามเกณฑ์ต่ำ 30 แล้วในขั้นตอนก่อนหน้า
      const a = (await alerts()).filter((x: any) => x.vehicleId === 'EV-002' && x.type === 'battery')
      assert.equal(a.length, 1)
      assert.deepEqual([a[0].severity, a[0].title], ['warning', 'แบตเตอรี่ต่ำ'])
      assert.match(a[0].text, /EV-002 แบตเตอรี่ต่ำกว่า 30%/)

      // 25 → 15 ข้ามเกณฑ์วิกฤต 20
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-002', soc: 15, speedKmh: 0, lat: 18.7, lng: 98.9 }] })
      const crit = (await alerts()).filter((x: any) => x.vehicleId === 'EV-002' && x.severity === 'critical')
      assert.equal(crit.length, 1)
      assert.match(crit[0].text, /เหลือ 15%/)
      // ส่ง 15 → 14 ซ้ำ ไม่ข้ามเกณฑ์ใหม่ → ไม่เพิ่มแจ้งเตือน
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-002', soc: 14, speedKmh: 0, lat: 18.7, lng: 98.9 }] })
      assert.equal((await alerts()).length, before + 1)
    })

    it('ข้ามหลายระดับในครั้งเดียว (60 → 10) ได้แจ้งเตือนวิกฤตเพียงรายการเดียว', async () => {
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-007', soc: 60, speedKmh: 0, lat: 18.8, lng: 99.0 }] })
      const n = (await alerts()).length
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-007', soc: 10, speedKmh: 0, lat: 18.8, lng: 99.0 }] })
      const added = (await alerts()).slice(0, (await alerts()).length - n).filter((x: any) => x.vehicleId === 'EV-007')
      assert.deepEqual(added.map((x: any) => x.severity), ['critical'])
    })

    it('ความเร็วเกินกำหนด: สร้างแจ้งเตือน + เหตุการณ์ขับเร็วของคนขับประจำ (เฉพาะตอนข้ามเกณฑ์)', async () => {
      const ev = async () => (await t.pool.query(`select count(*)::int as n from driving_events where driver_id = 'D05' and type = 'speeding'`)).rows[0].n
      const e0 = await ev()
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-005', soc: 90, speedKmh: 120, lat: 18.8, lng: 98.97 }] })
      assert.equal(await ev(), e0 + 1)
      assert.ok((await alerts()).some((a: any) => a.vehicleId === 'EV-005' && a.title === 'ขับเร็วเกินกำหนด' && /120 กม\./.test(a.text)))
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-005', soc: 90, speedKmh: 125, lat: 18.8, lng: 98.97 }] })
      assert.equal(await ev(), e0 + 1, 'ยังเกินอยู่ ไม่นับซ้ำ')
    })

    it('ปิดกฎแล้วไม่สร้างแจ้งเตือน', async () => {
      await t.app.inject({ method: 'PATCH', url: '/api/v1/alert-rules/low', headers: h, payload: { enabled: false } })
      const n = (await alerts()).length
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-011', soc: 50, speedKmh: 0, lat: 18.8, lng: 98.95 }] })
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-011', soc: 5, speedKmh: 0, lat: 18.8, lng: 98.95 }] })
      assert.equal((await alerts()).length, n)
      await t.app.inject({ method: 'PATCH', url: '/api/v1/alert-rules/low', headers: h, payload: { enabled: true } })
    })

    it('ข้อมูลมาช้า (เก่ากว่าสถานะล่าสุด): เก็บประวัติแต่ไม่ย้อนสถานะ', async () => {
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-012', soc: 80, speedKmh: 30, lat: 18.87, lng: 99.14, ts: isoAgo(0) }] })
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-012', soc: 99, speedKmh: 0, lat: 1, lng: 1, ts: isoAgo(120) }] })
      const v = await vehicle('EV-012')
      assert.deepEqual([v.soc, v.speedKmh, v.lat], [80, 30, 18.87])
      assert.equal((await t.pool.query(`select count(*)::int as n from vehicle_telemetry where vehicle_id = 'EV-012' and soc = 99`)).rows[0].n, 1)
    })

    it('รายการที่ไม่ถูกต้องถูกข้ามและรายงาน ส่วนที่ถูกต้องยังบันทึก', async () => {
      const res = await ingest('POST', '/telemetry', {
        readings: [
          { vehicleId: 'EV-404', soc: 50, lat: 1, lng: 1 },
          { vehicleId: 'EV-001', soc: 84, speedKmh: 50, lat: 18.79, lng: 98.99 },
          { vehicleId: 'EV-001', soc: 83, lat: 18.79, lng: 98.99, ts: new Date(Date.now() + 3_600_000).toISOString() },
        ],
      })
      const r = json(res)
      assert.equal(r.accepted, 1)
      assert.deepEqual(r.rejected.map((x: any) => [x.index, x.reason]), [[0, 'ไม่พบรถ'], [2, 'เวลาอยู่ในอนาคตเกิน 5 นาที']])
      assert.equal((await vehicle('EV-001')).soc, 84)
    })

    it('ตรวจรูปแบบข้อมูล: soc เกิน 100, lat นอกช่วง, ว่างเปล่า → 400', async () => {
      assert.equal((await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-001', soc: 101, lat: 1, lng: 1 }] })).statusCode, 400)
      assert.equal((await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-001', soc: 50, lat: 91, lng: 1 }] })).statusCode, 400)
      assert.equal((await ingest('POST', '/telemetry', { readings: [] })).statusCode, 400)
    })
  })

  describe('เซสชันการชาร์จ', () => {
    it('เริ่ม → อัปเดตความคืบหน้า → จบ: สถานะรถและแจ้งเตือนตามวงจร', async () => {
      const start = await ingest('POST', '/charging/sessions', { vehicleId: 'EV-011', stationId: 'S1', fromSoc: 5, targetSoc: 80, kw: 22 })
      assert.equal(start.statusCode, 201, start.body)
      assert.equal(json(start).status, 'active')
      assert.equal((await vehicle('EV-011')).status, 'charging')
      assert.ok((await alerts()).some((a: any) => a.title === 'เริ่มชาร์จ' && a.vehicleId === 'EV-011'))

      assert.equal((await ingest('POST', '/charging/sessions', { vehicleId: 'EV-011', stationId: 'S1', targetSoc: 80 })).statusCode, 409, 'ชาร์จซ้อนไม่ได้')

      const prog = json(await ingest('PATCH', '/charging/sessions/EV-011', { nowSoc: 40, kwh: 16.5, cost: 69.3, etaMinutes: 55 }))
      assert.deepEqual([prog.nowSoc, prog.kwh, prog.cost, prog.etaMinutes], [40, 16.5, 69.3, 55])
      const v = await vehicle('EV-011')
      assert.deepEqual([v.soc, v.status], [40, 'charging'])
      assert.equal(v.rangeKm, Math.round((0.4 * 47.8) / 0.139))

      const done = await ingest('POST', '/charging/sessions/EV-011/complete', { toSoc: 80 })
      assert.equal(done.statusCode, 200, done.body)
      assert.deepEqual([json(done).status, json(done).toSoc, json(done).etaMinutes], ['completed', 80, null])
      assert.deepEqual([(await vehicle('EV-011')).soc, (await vehicle('EV-011')).status], [80, 'parked'])
      assert.ok((await alerts()).some((a: any) => a.title === 'ชาร์จเสร็จสิ้น' && a.vehicleId === 'EV-011'))
      assert.equal((await ingest('POST', '/charging/sessions/EV-011/complete', {})).statusCode, 404)
    })

    it('ตรวจข้อมูล: รถ/สถานีไม่มี, เป้าหมายต่ำกว่าแบตเริ่ม, เป้าหมายต่ำกว่าแบตปัจจุบัน', async () => {
      assert.equal((await ingest('POST', '/charging/sessions', { vehicleId: 'EV-404', stationId: 'S1', targetSoc: 80 })).statusCode, 422)
      assert.equal((await ingest('POST', '/charging/sessions', { vehicleId: 'EV-011', stationId: 'S9', targetSoc: 90 })).statusCode, 422)
      assert.equal((await ingest('POST', '/charging/sessions', { vehicleId: 'EV-011', stationId: 'S1', fromSoc: 50, targetSoc: 40 })).statusCode, 422)
      assert.equal((await ingest('PATCH', '/charging/sessions/EV-004', { targetSoc: 50 })).statusCode, 422)
      assert.equal((await ingest('PATCH', '/charging/sessions/EV-001', { nowSoc: 50 })).statusCode, 404)
    })

    it('ชาร์จอยู่ แล้ว telemetry ส่งมา → สถานะยังเป็น "กำลังชาร์จ" และประวัติมีธง charging', async () => {
      await ingest('POST', '/telemetry', { readings: [{ vehicleId: 'EV-004', soc: 80, speedKmh: 0, lat: 18.7672, lng: 98.963 }] })
      assert.equal((await vehicle('EV-004')).status, 'charging')
      const last = (await t.pool.query(`select charging from vehicle_telemetry where vehicle_id = 'EV-004' order by ts desc limit 1`)).rows[0]
      assert.equal(last.charging, true)
    })

    it('ช่องชาร์จของสถานี: อัปเดตได้ แต่ห้ามเกินจำนวนช่อง', async () => {
      assert.equal(json(await ingest('PUT', '/stations/S3/occupancy', { busyPorts: 1 })).busyPorts, 1)
      assert.equal((await ingest('PUT', '/stations/S3/occupancy', { busyPorts: 5 })).statusCode, 422)
      assert.equal((await ingest('PUT', '/stations/S9/occupancy', { busyPorts: 1 })).statusCode, 404)
    })

    it('โหลดรายชั่วโมง: upsert และกราฟแสดงวันล่าสุด', async () => {
      assert.equal((await ingest('PUT', '/charging/load', { day: '2099-01-01', hour: 3, kw: 77 })).statusCode, 200)
      assert.equal((await ingest('PUT', '/charging/load', { day: '2099-01-01', hour: 3, kw: 88 })).statusCode, 200)
      const load = json(await t.app.inject({ method: 'GET', url: '/api/v1/charging/load', headers: h }))
      assert.deepEqual([load.day, load.kw[3], load.kw[4]], ['2099-01-01', 88, 0])
    })
  })

  describe('ทริป เหตุการณ์ คะแนน พลังงาน แจ้งเตือน', () => {
    it('ทริป: คนขับเริ่มต้น = คนขับประจำ, ส่งผลต่อสถิติ 30 วันของคนขับและประวัติของรถ', async () => {
      const km0 = json(await t.app.inject({ method: 'GET', url: '/api/v1/drivers', headers: h })).find((d: any) => d.id === 'D01')
      const res = await ingest('POST', '/trips', { vehicleId: 'EV-001', startedAt: isoAgo(90), endedAt: isoAgo(50), origin: 'Depot A', destination: 'สนามบิน', distanceKm: 25.5, energyKwh: 3.6, endSoc: 70 })
      assert.equal(res.statusCode, 201, res.body)
      const d1 = json(await t.app.inject({ method: 'GET', url: '/api/v1/drivers', headers: h })).find((d: any) => d.id === 'D01')
      assert.equal(d1.trips30d, km0.trips30d + 1)
      assert.equal(Math.round((d1.km30d - km0.km30d) * 10) / 10, 25.5)
      const detail = json(await t.app.inject({ method: 'GET', url: '/api/v1/vehicles/EV-001', headers: h }))
      assert.equal(detail.trips[0].destination, 'สนามบิน')
      assert.equal(detail.trips[0].durationMin, 40)
      assert.equal(detail.trips[0].efficiency, 14.1)
    })

    it('ทริปผิดเวลา/รถไม่มี → 422', async () => {
      assert.equal((await ingest('POST', '/trips', { vehicleId: 'EV-001', startedAt: isoAgo(10), endedAt: isoAgo(50), origin: 'a', destination: 'b', distanceKm: 1, energyKwh: 1 })).statusCode, 422)
      assert.equal((await ingest('POST', '/trips', { vehicleId: 'EV-404', startedAt: isoAgo(50), endedAt: isoAgo(10), origin: 'a', destination: 'b', distanceKm: 1, energyKwh: 1 })).statusCode, 422)
    })

    it('เหตุการณ์การขับขี่: รับเป็นชุด รายการเสียถูกข้าม และไปรวมในกราฟ', async () => {
      const ev0 = json(await t.app.inject({ method: 'GET', url: '/api/v1/drivers/events', headers: h }))
      const res = await ingest('POST', '/driving-events', { events: [{ vehicleId: 'EV-003', type: 'harsh_brake' }, { vehicleId: 'EV-003', type: 'long_idle' }, { vehicleId: 'EV-404', type: 'speeding' }, { vehicleId: 'EV-003', driverId: 'D99', type: 'speeding' }] })
      assert.deepEqual(json(res), { accepted: 2, rejected: [{ index: 2, reason: 'ไม่พบรถ' }, { index: 3, reason: 'ไม่พบคนขับ' }] })
      const ev1 = json(await t.app.inject({ method: 'GET', url: '/api/v1/drivers/events', headers: h }))
      assert.deepEqual(ev1.map((e: any) => e.count - ev0.find((x: any) => x.type === e.type).count), [1, 0, 0, 1])
    })

    it('คะแนนคนขับ: อัปเดตได้ 0–100 เท่านั้น', async () => {
      assert.equal(json(await ingest('PUT', '/drivers/D03/score', { score: 76 })).score, 76)
      assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/v1/drivers', headers: h })).find((d: any) => d.id === 'D03').score, 76)
      assert.equal((await ingest('PUT', '/drivers/D03/score', { score: 101 })).statusCode, 400)
      assert.equal((await ingest('PUT', '/drivers/D99/score', { score: 50 })).statusCode, 404)
    })

    it('สุขภาพแบต/เลขไมล์ และพลังงานรายวัน/รายเดือน มีผลต่อแดชบอร์ดและรายงาน', async () => {
      assert.equal(json(await ingest('PATCH', '/vehicles/EV-003', { soh: 90, odometerKm: 31300 })).soh, 90)
      assert.equal((await ingest('PATCH', '/vehicles/EV-404', { soh: 90 })).statusCode, 404)

      const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
      await ingest('PUT', '/energy/daily', { day, kwh: 200, cost: 900 })
      const w = json(await t.app.inject({ method: 'GET', url: '/api/v1/energy/week', headers: h }))
      assert.equal(w.days.at(-1), day)
      assert.equal(w.kwh.at(-1), 200)

      const before = json(await t.app.inject({ method: 'GET', url: '/api/v1/reports?period=sep', headers: h })).totals.kwh
      const m = await ingest('PUT', '/energy/monthly', { month: '2026-09-15', vehicleId: 'EV-001', kwhDepot: 500, kwhPublic: 100, costDepotOffpeak: 1000, co2AvoidedKg: 50 })
      assert.equal(json(m).month, '2026-09-01')
      const after = json(await t.app.inject({ method: 'GET', url: '/api/v1/reports?period=sep', headers: h })).totals.kwh
      assert.equal(after - before, 600 - 440, 'แทนที่ค่าเดิมของรถคันนั้นในเดือนนั้น (seed = 5280/12)')
    })

    it('แจ้งเตือนจากระบบภายนอก: สร้างได้ ตรวจรถที่อ้างอิง', async () => {
      const ok = await ingest('POST', '/alerts', { severity: 'warning', type: 'geofence', title: 'ออกนอกพื้นที่', text: 'EV-006 ออกนอกเขต', vehicleId: 'EV-006' })
      assert.equal(ok.statusCode, 201)
      assert.equal((await alerts())[0].title, 'ออกนอกพื้นที่')
      assert.equal((await ingest('POST', '/alerts', { severity: 'info', type: 'device', title: 'x', text: 'y', vehicleId: 'EV-404' })).statusCode, 422)
      assert.equal((await ingest('POST', '/alerts', { severity: 'bad', type: 'device', title: 'x', text: 'y' })).statusCode, 400)
    })
  })
})
