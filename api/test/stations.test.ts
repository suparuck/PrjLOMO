import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAdmin } from '../src/services/accounts'
import { json, login, startApp } from './helpers'

const P = '/api/v1'
const valid = { name: 'Depot C (ขอนแก่น)', type: 'depot', network: 'ภายในองค์กร', lat: 16.44, lng: 102.83, ports: 4, power: 'AC 22 kW', pricePerKwh: 4.5 }

describe('จัดการสถานีชาร์จ', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('สิทธิ์: ไม่ล็อกอิน 401, ผู้ดูรายงาน 403, ผู้จัดการทำได้', async () => {
    assert.equal((await call('POST', '/stations', valid, {})).statusCode, 401)
    const viewer = await login(t.app, 'wanna@company.co.th', 'demo1234')
    assert.equal((await call('POST', '/stations', valid, viewer)).statusCode, 403)
    assert.equal((await call('DELETE', '/stations/S1', undefined, viewer)).statusCode, 403)
    const mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
    const r = await call('POST', '/stations', { ...valid, name: 'โดยผู้จัดการ' }, mgr)
    assert.equal(r.statusCode, 201, r.body)
    await call('DELETE', `/stations/${json(r).id}`, undefined, mgr)
  })

  it('เพิ่มสถานี: ได้รหัสถัดไป (S7), เริ่มว่าง busy=0, ตัดช่องว่างในชื่อ, ปรากฏใน GET /stations', async () => {
    const before = json(await call('GET', '/stations')).length
    const res = await call('POST', '/stations', { ...valid, name: '  Depot   C  (ขอนแก่น) ' })
    assert.equal(res.statusCode, 201, res.body)
    const s = json(res)
    assert.equal(s.id, 'S7')
    assert.equal(s.name, 'Depot C (ขอนแก่น)')
    assert.deepEqual([s.busyPorts, s.ports, s.type, s.power, s.pricePerKwh], [0, 4, 'depot', 'AC 22 kW', 4.5])
    const list = json(await call('GET', '/stations'))
    assert.equal(list.length, before + 1)
    assert.ok(list.some((x: { id: string }) => x.id === 'S7'))
  })

  it('ตรวจข้อมูล: ชื่อซ้ำ (ไม่สนตัวพิมพ์) 422, ชื่อสั้น/ว่าง, ราคาทศนิยมเกิน 2 ตำแหน่ง, ค่านอกช่วง 400', async () => {
    const dup = await call('POST', '/stations', { ...valid, name: 'DEPOT C (ขอนแก่น)' })
    assert.equal(dup.statusCode, 422)
    assert.match(json(dup).error.fields.name, /ชื่อนี้อยู่แล้ว/)
    assert.equal((await call('POST', '/stations', { ...valid, name: 'x' })).statusCode, 422)
    assert.ok(json(await call('POST', '/stations', { ...valid, name: 'ใหม่', network: '   ' })).error.fields.network)
    assert.ok(json(await call('POST', '/stations', { ...valid, name: 'ใหม่', pricePerKwh: 4.567 })).error.fields.pricePerKwh)
    for (const bad of [{ lat: 91 }, { lng: -181 }, { ports: 0 }, { ports: 101 }, { pricePerKwh: -1 }, { type: 'x' }]) {
      assert.equal((await call('POST', '/stations', { ...valid, name: 'ใหม่', ...bad })).statusCode, 400, JSON.stringify(bad))
    }
    assert.equal(json(await call('GET', '/stations')).filter((s: { name: string }) => s.name === 'ใหม่').length, 0)
  })

  it('เพิ่มพร้อมกันหลายสถานี: ได้รหัสไม่ซ้ำกัน', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/stations', { ...valid, name: `พร้อมกัน ${i}` })))
    assert.ok(rs.every((r) => r.statusCode === 201), rs.map((r) => r.statusCode).join())
    const ids = rs.map((r) => json(r).id)
    assert.equal(new Set(ids).size, 5)
    for (const id of ids) await call('DELETE', `/stations/${id}`)
  })

  it('แก้ไข: แก้บางฟิลด์ (ที่เหลือคงเดิม), เปลี่ยนชนิด, ชื่อชนสถานีอื่น 422 แต่ใช้ชื่อตัวเองได้', async () => {
    const r = await call('PATCH', '/stations/S7', { pricePerKwh: 5.25, type: 'public', power: ' DC  60 kW ' })
    assert.equal(r.statusCode, 200, r.body)
    const s = json(r)
    assert.deepEqual([s.pricePerKwh, s.type, s.power, s.name, s.ports], [5.25, 'public', 'DC 60 kW', 'Depot C (ขอนแก่น)', 4])
    assert.equal((await call('PATCH', '/stations/S7', { name: 'depot a (สำนักงานใหญ่)' })).statusCode, 422, 'ชนชื่อ S1')
    assert.equal((await call('PATCH', '/stations/S7', { name: 'DEPOT C (ขอนแก่น)' })).statusCode, 200, 'ชื่อตัวเอง (ต่างตัวพิมพ์) ใช้ได้')
    assert.equal((await call('PATCH', '/stations/S7', {})).statusCode, 400, 'ต้องส่งอย่างน้อยหนึ่งฟิลด์')
    assert.equal((await call('PATCH', '/stations/NOPE', { ports: 3 })).statusCode, 404)
  })

  it('ลดจำนวนช่องต่ำกว่าช่องที่ใช้งานอยู่ไม่ได้ (S1 ใช้งาน 2 ช่อง)', async () => {
    const before = json(await call('GET', '/stations')).find((s: { id: string }) => s.id === 'S1')
    assert.equal(before.busyPorts, 2)
    const r = await call('PATCH', '/stations/S1', { ports: 1 })
    assert.equal(r.statusCode, 422)
    assert.match(json(r).error.fields.ports, /ใช้งานอยู่ 2 ช่อง/)
    assert.equal((await call('PATCH', '/stations/S1', { ports: 2 })).statusCode, 200, 'เท่ากับช่องที่ใช้งานได้')
    await call('PATCH', '/stations/S1', { ports: before.ports })
  })

  it('ลบ: สถานีใหม่ลบได้ · สถานีที่มีประวัติการชาร์จลบไม่ได้ (409) และไม่หาย', async () => {
    assert.equal((await call('DELETE', '/stations/S7')).statusCode, 200)
    assert.equal((await call('DELETE', '/stations/S7')).statusCode, 404)
    const used = (await t.pool.query('select station_id from charging_sessions limit 1')).rows[0].station_id
    const r = await call('DELETE', `/stations/${used}`)
    assert.equal(r.statusCode, 409)
    assert.match(json(r).error.message, /ประวัติการชาร์จ/)
    assert.ok(json(await call('GET', '/stations')).some((s: { id: string }) => s.id === used))
  })
})

describe('สถานีชาร์จในกองยานว่างเปล่า', () => {
  it('สถานีแรกได้รหัส S1 และสถานีถัดไปได้ S2', async () => {
    const t = await startApp({ demo: false })
    try {
      await createAdmin(t.pool, { email: 'first@company.co.th', name: 'ผู้ดูแลคนแรก', password: 'First-Admin-1' })
      const h = await login(t.app, 'first@company.co.th', 'First-Admin-1')
      const r = await t.app.inject({ method: 'POST', url: `${P}/stations`, headers: h, payload: valid })
      assert.equal(r.statusCode, 201, r.body)
      assert.equal(json(r).id, 'S1')
      const second = await t.app.inject({ method: 'POST', url: `${P}/stations`, headers: h, payload: { ...valid, name: 'สถานีที่สอง' } })
      assert.equal(json(second).id, 'S2')
    } finally {
      await t.stop()
    }
  })
})
