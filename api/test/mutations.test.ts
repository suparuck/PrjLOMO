import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('เขียนข้อมูลผ่าน API (ผู้ใช้)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let h: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers = h) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as any })
  before(async () => {
    t = await startApp()
    h = await login(t.app)
  })
  after(async () => { await t.stop() })

  describe('รถ', () => {
    it('เพิ่มรถ: ปรับรูปแบบ รหัส/ทะเบียน, ค่าเริ่มต้นออฟไลน์, ลงทะเบียนรุ่นใหม่', async () => {
      const res = await call('POST', '/vehicles', { id: 'ev-013', model: ' Zeekr 001 ', plate: '4กค9999', batteryKwh: 100, soc: 80, odometerKm: 120 })
      assert.equal(res.statusCode, 201, res.body)
      const v = json(res)
      assert.equal(v.id, 'EV-013')
      assert.equal(v.model, 'Zeekr 001')
      assert.equal(v.plate, '4กค 9999')
      assert.equal(v.status, 'offline')
      assert.equal(v.driverId, null)
      assert.equal(v.rangeKm, Math.round((0.8 * 100) / 0.15))
      assert.equal(v.efficiency, 15)
      assert.equal(v.lat, 18.7883)
      const m = await t.pool.query(`select brand, spec_range_km from vehicle_models where model = 'Zeekr 001'`)
      assert.deepEqual(m.rows[0], { brand: 'Zeekr', spec_range_km: null })
      assert.equal(json(await call('GET', '/vehicles')).length, 13)
    })

    it('ข้อมูลซ้ำ → 409 พร้อมฟิลด์ (รหัส/ทะเบียนเทียบหลังปรับรูปแบบ)', async () => {
      const dupId = await call('POST', '/vehicles', { id: 'EV-001', model: 'X', plate: '9กก 1111', batteryKwh: 50 })
      assert.equal(dupId.statusCode, 409)
      assert.equal(json(dupId).error.fields.id, 'รหัสรถนี้มีอยู่แล้ว')
      const dupPlate = await call('POST', '/vehicles', { id: 'EV-020', model: 'X', plate: '1กข1234', batteryKwh: 50 })
      assert.equal(dupPlate.statusCode, 409)
      assert.equal(json(dupPlate).error.fields.plate, 'ทะเบียนนี้มีอยู่แล้ว')
      assert.equal((await t.pool.query(`select 1 from vehicle_models where model = 'X'`)).rowCount, 0, 'rollback: ไม่ทิ้งรุ่นค้าง')
    })

    it('ข้อมูลผิดกฎ → 422/400 พร้อมข้อความรายฟิลด์', async () => {
      const bad = await call('POST', '/vehicles', { id: 'ABC', model: '', plate: 'xx', batteryKwh: 50 })
      assert.equal(bad.statusCode, 422)
      const f = json(bad).error.fields
      assert.ok(f.id && f.model && f.plate)
      const range = await call('POST', '/vehicles', { id: 'EV-021', model: 'X', plate: '9กก 2222', batteryKwh: 5 })
      assert.equal(range.statusCode, 400)
      assert.ok(json(range).error.fields.batteryKwh)
      const noDriver = await call('POST', '/vehicles', { id: 'EV-022', model: 'X', plate: '9กก 3333', batteryKwh: 50, driverId: 'D99' })
      assert.equal(noDriver.statusCode, 422)
      const taken = await call('POST', '/vehicles', { id: 'EV-022', model: 'X', plate: '9กก 3333', batteryKwh: 50, driverId: 'D01' })
      assert.equal(taken.statusCode, 422)
      assert.equal(json(taken).error.fields.driverId, 'คนขับคนนี้มีรถประจำแล้ว')
    })

    it('แก้ไขรถ: ทะเบียน/คนขับ, ย้ายคนขับที่ถูกใช้แล้ว → 409', async () => {
      assert.equal(json(await call('PATCH', '/vehicles/EV-013', { plate: '5กค 1111', odometerKm: 500 })).odometerKm, 500)
      assert.equal((await call('PATCH', '/vehicles/EV-013', { driverId: 'D01' })).statusCode, 409)
      assert.equal((await call('PATCH', '/vehicles/EV-999', { plate: '1กก 1' })).statusCode, 404)
    })

    it('งานบำรุงรักษา: เพิ่ม → ปรากฏในรายละเอียด → ทำเสร็จแล้วหายไป', async () => {
      const m = await call('POST', '/vehicles/EV-013/maintenance', { kind: 'service', title: 'เปลี่ยนน้ำมันเกียร์', dueDate: '2026-12-31', dueOdometerKm: 10000 })
      assert.equal(m.statusCode, 201)
      assert.equal(json(await call('GET', '/vehicles/EV-013')).maintenance.length, 1)
      assert.equal((await call('POST', `/maintenance/${json(m).id}/complete`)).statusCode, 200)
      assert.equal(json(await call('GET', '/vehicles/EV-013')).maintenance.length, 0)
    })
  })

  describe('คนขับ', () => {
    it('เพิ่มคนขับ: ยังไม่มีคะแนน/ทริป, มอบหมายรถประจำ, รหัสถัดไป D13', async () => {
      const res = await call('POST', '/drivers', { name: '  ทดสอบ   ระบบ ', phone: '0991112222', vehicleId: 'EV-013' })
      assert.equal(res.statusCode, 201, res.body)
      const d = json(res)
      assert.deepEqual([d.id, d.name, d.phone, d.score, d.trips30d, d.km30d, d.vehicleId], ['D13', 'ทดสอบ ระบบ', '099-111-2222', null, 0, 0, 'EV-013'])
      assert.equal(json(await call('GET', '/vehicles/EV-013')).vehicle.driverId, 'D13')
    })

    it('เบอร์ซ้ำข้ามรูปแบบ → 409, รถที่มีคนขับแล้ว → 422, รูปแบบผิด → 422', async () => {
      const dup = await call('POST', '/drivers', { name: 'คนอื่น', phone: '0812345678' })
      assert.equal(dup.statusCode, 409)
      assert.equal(json(dup).error.fields.phone, 'เบอร์โทรนี้ถูกใช้แล้ว')
      const taken = await call('POST', '/drivers', { name: 'คนอื่น', phone: '0900000001', vehicleId: 'EV-001' })
      assert.equal(taken.statusCode, 422)
      assert.equal((await t.pool.query(`select 1 from drivers where phone = '090-000-0001'`)).rowCount, 0, 'rollback')
      assert.equal((await call('POST', '/drivers', { name: 'ก', phone: '12345' })).statusCode, 422)
    })

    it('แก้ไข/ย้าย/ยกเลิกรถประจำ', async () => {
      assert.equal(json(await call('PATCH', '/drivers/D13', { name: 'ชื่อใหม่' })).name, 'ชื่อใหม่')
      assert.equal(json(await call('PATCH', '/drivers/D13', { vehicleId: null })).vehicleId, null)
      assert.equal(json(await call('PATCH', '/drivers/D13', { vehicleId: 'EV-013' })).vehicleId, 'EV-013')
      assert.equal((await call('PATCH', '/drivers/D13', { vehicleId: 'EV-001' })).statusCode, 422)
      assert.equal((await call('PATCH', '/drivers/D99', { name: 'xx' })).statusCode, 404)
    })
  })

  describe('การชาร์จ', () => {
    it('ปรับเป้าหมาย: เวลาที่เหลือปรับตามสัดส่วน, ต่ำกว่าระดับปัจจุบัน → 422, ไม่มีเซสชัน → 404', async () => {
      const ok = await call('PATCH', '/charging/sessions/EV-004/target', { targetSoc: 100 })
      assert.equal(ok.statusCode, 200)
      assert.deepEqual([json(ok).targetSoc, json(ok).etaMinutes], [100, 33]) // 18 นาที × (22/12)
      assert.equal(json(await call('PATCH', '/charging/sessions/EV-004/target', { targetSoc: 78 })).etaMinutes, 0)
      const low = await call('PATCH', '/charging/sessions/EV-004/target', { targetSoc: 70 })
      assert.equal(low.statusCode, 422)
      assert.match(json(low).error.fields.targetSoc, /78%/)
      assert.equal((await call('PATCH', '/charging/sessions/EV-001/target', { targetSoc: 90 })).statusCode, 404)
      assert.equal((await call('PATCH', '/charging/sessions/EV-004/target', { targetSoc: 101 })).statusCode, 400)
    })

    it('หยุดชาร์จ: เซสชันเป็น stopped, ย้ายเข้าประวัติ, รถเปลี่ยนสถานะ, หยุดซ้ำ → 404', async () => {
      const res = await call('POST', '/charging/sessions/EV-008/stop')
      assert.equal(res.statusCode, 200)
      const s = json(res)
      assert.deepEqual([s.status, s.toSoc], ['stopped', 33])
      assert.ok(s.endedAt)
      assert.equal(json(await call('GET', '/charging/sessions')).length, 1)
      assert.equal(json(await call('GET', '/charging/history')).find((x: any) => x.vehicleId === 'EV-008').status, 'stopped')
      const v = json(await call('GET', '/vehicles')).find((x: any) => x.id === 'EV-008')
      assert.equal(v.status, 'parked', 'ไม่ชาร์จแล้ว (แบต 33% ≥ เกณฑ์ 30%)')
      assert.equal((await call('POST', '/charging/sessions/EV-008/stop')).statusCode, 404)
      const alerts = json(await call('GET', '/alerts'))
      assert.equal(alerts[0].title, 'หยุดชาร์จ', 'สร้างแจ้งเตือนอัตโนมัติ')
    })
  })

  describe('แจ้งเตือนและกฎ', () => {
    it('รับทราบทีละรายการ (ซ้ำได้) และรับทราบทั้งหมด', async () => {
      const before = json(await call('GET', '/alerts/stats')).openCount
      const first = json(await call('GET', '/alerts')).find((a: any) => !a.acknowledgedAt)
      const a1 = json(await call('POST', `/alerts/${first.id}/ack`))
      assert.ok(a1.acknowledgedAt)
      const a2 = json(await call('POST', `/alerts/${first.id}/ack`))
      assert.equal(a2.acknowledgedAt, a1.acknowledgedAt, 'รับทราบซ้ำไม่เปลี่ยนเวลาเดิม')
      assert.equal(json(await call('GET', '/alerts/stats')).openCount, before - 1)
      assert.equal((await call('POST', '/alerts/999999/ack')).statusCode, 404)
      const all = json(await call('POST', '/alerts/ack-all'))
      assert.equal(all.acknowledged, before - 1)
      assert.equal(json(await call('GET', '/alerts/stats')).openCount, 0)
    })

    it('เปิด/ปิดกฎ', async () => {
      assert.equal(json(await call('PATCH', '/alert-rules/geo', { enabled: true })).enabled, true)
      assert.equal(json(await call('GET', '/alert-rules')).every((r: any) => r.enabled), true)
      assert.equal((await call('PATCH', '/alert-rules/nope', { enabled: true })).statusCode, 404)
      await call('PATCH', '/alert-rules/geo', { enabled: false })
    })
  })

  describe('ตั้งค่า ผู้ใช้ และ API key', () => {
    it('บันทึกตั้งค่า และตรวจกฎ: แบตวิกฤตต้องไม่สูงกว่าแบตต่ำ, ค่านอกช่วง → 400', async () => {
      const cur = json(await call('GET', '/settings'))
      const next = { ...cur, thresholds: { ...cur.thresholds, lowBattery: 40, maxSpeed: 90 }, charging: { ...cur.charging, onPeak: '6.10' } }
      const ok = await call('PUT', '/settings', next)
      assert.equal(ok.statusCode, 200, ok.body)
      assert.deepEqual([json(ok).thresholds.lowBattery, json(ok).charging.onPeak], [40, '6.10'])
      assert.equal(json(await call('GET', '/settings')).thresholds.maxSpeed, 90, 'บันทึกถาวร')

      const bad = await call('PUT', '/settings', { ...next, thresholds: { ...next.thresholds, lowBattery: 15, criticalBattery: 25 } })
      assert.equal(bad.statusCode, 422)
      assert.ok(json(bad).error.fields.criticalBattery)
      assert.equal((await call('PUT', '/settings', { ...next, thresholds: { ...next.thresholds, maxSpeed: 500 } })).statusCode, 400)
      assert.equal((await call('PUT', '/settings', { ...next, charging: { ...next.charging, offPeak: 'abc' } })).statusCode, 400)
      await call('PUT', '/settings', cur)
    })

    it('เชิญผู้ใช้: อีเมลปรับเป็นตัวพิมพ์เล็ก, ซ้ำ → 409, รูปแบบผิด → 422', async () => {
      const ok = await call('POST', '/users/invite', { email: 'New.Person@Company.co.th', role: 'manager' })
      assert.equal(ok.statusCode, 201)
      assert.deepEqual([json(ok).email, json(ok).name, json(ok).status, json(ok).role], ['new.person@company.co.th', 'new.person', 'invited', 'manager'])
      const dup = await call('POST', '/users/invite', { email: 'ADMIN@evmonitor.co.th', role: 'viewer' })
      assert.equal(dup.statusCode, 409)
      assert.equal(json(dup).error.fields.email, 'อีเมลนี้อยู่ในระบบแล้ว')
      assert.equal((await call('POST', '/users/invite', { email: 'not-an-email', role: 'viewer' })).statusCode, 422)
      assert.equal((await call('POST', '/users/invite', { email: 'a@b.co', role: 'root' })).statusCode, 400)
    })

    it('API key: สร้าง (เห็นคีย์เต็มครั้งเดียว) → ใช้ส่งข้อมูลได้ → เพิกถอนแล้วใช้ไม่ได้', async () => {
      const created = await call('POST', '/api-keys', { name: 'อุปกรณ์ทดสอบ' })
      assert.equal(created.statusCode, 201)
      const { id, key, prefix } = json(created)
      assert.ok(key.startsWith('evm_') && key.startsWith(prefix))
      const list = json(await call('GET', '/api-keys'))
      assert.ok(!JSON.stringify(list).includes(key), 'รายการไม่แสดงคีย์เต็ม')
      const hash = await t.pool.query(`select key_hash from api_keys where id = $1`, [id])
      assert.ok(hash.rows[0].key_hash !== key && hash.rows[0].key_hash.length === 64, 'เก็บเป็น sha256')

      const send = () => t.app.inject({ method: 'PUT', url: '/api/v1/ingest/energy/daily', headers: { 'x-api-key': key }, payload: { day: '2026-01-01', kwh: 1, cost: 1 } })
      assert.equal((await send()).statusCode, 200)
      assert.ok(json(await call('GET', '/api-keys')).find((k: any) => k.id === id).lastUsedAt)
      assert.equal((await call('DELETE', `/api-keys/${id}`)).statusCode, 200)
      assert.equal((await send()).statusCode, 401)
    })
  })
})
