import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAdmin } from '../src/services/accounts'
import { json, login, startApp } from './helpers'

const P = '/api/v1'
const valid = { id: 'ICE-30', model: 'Toyota Vios', kmPerDay: 80, maxKmPerDay: 150, fuelPerMonth: 5200, readinessScore: 90, recommendedEv: 'BYD Dolphin' }

describe('จัดการรถสันดาปและ TCO', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('สิทธิ์: ไม่ล็อกอิน 401, ผู้ดูรายงานเขียนไม่ได้ 403 (แต่ดูรายการรถสันดาปได้), ผู้จัดการทำได้', async () => {
    assert.equal((await call('POST', '/ice-vehicles', valid, {})).statusCode, 401)
    const viewer = await login(t.app, 'wanna@company.co.th', 'demo1234')
    assert.equal((await call('POST', '/ice-vehicles', valid, viewer)).statusCode, 403)
    assert.equal((await call('PUT', '/tco', { iceName: 'a', evName: 'b', items: [{ label: 'x', iceCost: 1, evCost: 1 }] }, viewer)).statusCode, 403)
    assert.equal((await call('GET', '/tco', undefined, viewer)).statusCode, 403)
    assert.equal((await call('GET', '/ice-vehicles', undefined, viewer)).statusCode, 200)
    const mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
    const r = await call('POST', '/ice-vehicles', { ...valid, id: 'ICE-MGR' }, mgr)
    assert.equal(r.statusCode, 201, r.body)
    assert.equal((await call('DELETE', '/ice-vehicles/ICE-MGR', undefined, mgr)).statusCode, 200)
  })

  describe('รถสันดาป', () => {
    it('เพิ่ม: ตัดช่องว่างในชื่อ ปรากฏในรายการและในรายงานความพร้อม (ค่าไฟ EV คำนวณให้)', async () => {
      const r = await call('POST', '/ice-vehicles', { ...valid, model: '  Toyota   Vios ' })
      assert.equal(r.statusCode, 201, r.body)
      assert.equal(json(r).model, 'Toyota Vios')
      const list = json(await call('GET', '/ice-vehicles'))
      assert.ok(list.some((v: { id: string }) => v.id === 'ICE-30'))
      const rep = json(await call('GET', '/reports/electrification'))
      const row = rep.rows.find((x: { ice: { id: string } }) => x.ice.id === 'ICE-30')
      assert.equal(row.readiness, 'ready', 'คะแนน 90 = พร้อม')
      assert.ok(row.evMonthlyCost > 0)
    })

    it('ตรวจข้อมูล: รหัสซ้ำ (ไม่สนตัวพิมพ์) 422, รหัส/รุ่นว่าง/มีช่องว่าง, ระยะสูงสุด < ระยะเฉลี่ย, ค่านอกช่วง 400', async () => {
      const dup = await call('POST', '/ice-vehicles', { ...valid, id: 'ice-30' })
      assert.equal(dup.statusCode, 422)
      assert.match(json(dup).error.fields.id, /มีอยู่แล้ว/)
      assert.ok(json(await call('POST', '/ice-vehicles', { ...valid, id: 'A B' })).error.fields.id)
      assert.ok(json(await call('POST', '/ice-vehicles', { ...valid, id: 'X' })).error.fields.id)
      assert.ok(json(await call('POST', '/ice-vehicles', { ...valid, id: 'ICE-31', model: ' ' })).error.fields.model)
      assert.match(json(await call('POST', '/ice-vehicles', { ...valid, id: 'ICE-31', kmPerDay: 200, maxKmPerDay: 100 })).error.fields.maxKmPerDay, /ไม่น้อยกว่า/)
      for (const bad of [{ kmPerDay: 0 }, { readinessScore: 101 }, { readinessScore: -1 }, { fuelPerMonth: -5 }, { maxKmPerDay: 5000 }]) {
        assert.equal((await call('POST', '/ice-vehicles', { ...valid, id: 'ICE-31', ...bad })).statusCode, 400, JSON.stringify(bad))
      }
      assert.equal(json(await call('GET', '/ice-vehicles')).filter((v: { id: string }) => v.id === 'ICE-31').length, 0)
    })

    it('แก้ไขบางฟิลด์ (ที่เหลือคงเดิม) · ตรวจระยะสูงสุดเทียบค่าเดิมในฐานข้อมูล · 404', async () => {
      const r = await call('PATCH', '/ice-vehicles/ICE-30', { readinessScore: 55, recommendedEv: ' MG4  Electric ' })
      assert.equal(r.statusCode, 200, r.body)
      assert.deepEqual([json(r).readinessScore, json(r).recommendedEv, json(r).model, json(r).kmPerDay], [55, 'MG4 Electric', 'Toyota Vios', 80])
      // ส่งเฉพาะ maxKmPerDay ที่ต่ำกว่า kmPerDay เดิม (80) → 422
      const bad = await call('PATCH', '/ice-vehicles/ICE-30', { maxKmPerDay: 50 })
      assert.equal(bad.statusCode, 422)
      assert.ok(json(bad).error.fields.maxKmPerDay)
      assert.equal((await call('PATCH', '/ice-vehicles/ICE-30', {})).statusCode, 400)
      assert.equal((await call('PATCH', '/ice-vehicles/NOPE', { readinessScore: 10 })).statusCode, 404)
      const rep = json(await call('GET', '/reports/electrification'))
      assert.equal(rep.rows.find((x: { ice: { id: string } }) => x.ice.id === 'ICE-30').readiness, 'not', 'คะแนน 55 = ยังไม่แนะนำ')
    })

    it('ลบ: ลบได้ แล้วหายจากรายงาน · ลบซ้ำ 404', async () => {
      assert.equal((await call('DELETE', '/ice-vehicles/ICE-30')).statusCode, 200)
      assert.equal((await call('DELETE', '/ice-vehicles/ICE-30')).statusCode, 404)
      const rep = json(await call('GET', '/reports/electrification'))
      assert.ok(!rep.rows.some((x: { ice: { id: string } }) => x.ice.id === 'ICE-30'))
    })
  })

  describe('TCO', () => {
    it('อ่าน: รายการเดโม 4 รายการ + ชื่อรถที่เปรียบเทียบ', async () => {
      const r = json(await call('GET', '/tco'))
      assert.equal(r.items.length, 4)
      assert.deepEqual(r.items[0], { label: 'ราคารถ', iceCost: 559000, evCost: 569900 })
      assert.equal(r.iceName, 'รถสันดาป (Yaris Ativ)')
    })

    it('บันทึกทั้งชุด: แทนที่รายการเดิม เรียงตามลำดับที่ส่ง รายงานและกราฟสะท้อนทันที (รวม TCO คำนวณใหม่)', async () => {
      const body = {
        iceName: '  Vios  ',
        evName: 'MG4',
        items: [
          { label: 'ราคารถ', iceCost: 600000, evCost: 700000 },
          { label: 'พลังงาน 5 ปี', iceCost: 400000.5, evCost: 120000 },
          { label: 'ค่าธรรมเนียม', iceCost: 10000, evCost: 0 },
        ],
      }
      const r = await call('PUT', '/tco', body)
      assert.equal(r.statusCode, 200, r.body)
      assert.equal(json(r).count, 3)
      const got = json(await call('GET', '/tco'))
      assert.deepEqual(got.items.map((i: { label: string }) => i.label), ['ราคารถ', 'พลังงาน 5 ปี', 'ค่าธรรมเนียม'])
      assert.deepEqual([got.iceName, got.evName], ['Vios', 'MG4'])
      const rep = json(await call('GET', '/reports/electrification'))
      assert.deepEqual(rep.tco.labels, ['ราคารถ', 'พลังงาน 5 ปี', 'ค่าธรรมเนียม', 'รวม TCO'])
      assert.equal(rep.tco.ice.at(-1), 1010000.5)
      assert.equal(rep.tco.ev.at(-1), 820000)
      assert.deepEqual([rep.tco.iceName, rep.tco.evName], ['Vios', 'MG4'])
      assert.equal((await t.pool.query('select count(*)::int as n from tco_items')).rows[0].n, 3)
    })

    it('ตรวจข้อมูล: ชื่อรายการซ้ำ/ว่าง ทศนิยมเกิน 2 ตำแหน่ง ชื่อรถว่าง → 422 ระบุตำแหน่งรายการ · ค่าติดลบ/เกิน/ไม่มีรายการ → 400 · และข้อมูลเดิมไม่เปลี่ยน', async () => {
      const before = json(await call('GET', '/tco'))
      const r = await call('PUT', '/tco', {
        iceName: ' ',
        evName: 'EV',
        items: [
          { label: 'A', iceCost: 1, evCost: 1 },
          { label: ' a ', iceCost: 1.234, evCost: 1 },
          { label: '', iceCost: 1, evCost: 1 },
        ],
      })
      assert.equal(r.statusCode, 422)
      const f = json(r).error.fields
      assert.ok(f.iceName && f['items.1.label'] && f['items.1.iceCost'] && f['items.2.label'], JSON.stringify(f))
      assert.equal((await call('PUT', '/tco', { iceName: 'a', evName: 'b', items: [{ label: 'x', iceCost: -1, evCost: 1 }] })).statusCode, 400)
      assert.equal((await call('PUT', '/tco', { iceName: 'a', evName: 'b', items: [] })).statusCode, 400)
      assert.equal((await call('PUT', '/tco', { iceName: 'a', evName: 'b', items: Array.from({ length: 13 }, (_, i) => ({ label: `L${i}`, iceCost: 1, evCost: 1 })) })).statusCode, 400)
      assert.deepEqual(json(await call('GET', '/tco')), before)
    })
  })
})

describe('กองยานว่างเปล่า', () => {
  it('เริ่มจากศูนย์: เพิ่มรถสันดาปและ TCO แล้วรายงานความพร้อมมีตัวเลข (ประหยัดต่อปีคำนวณจากรถที่พร้อม)', async () => {
    const e = await startApp({ demo: false })
    try {
      await createAdmin(e.pool, { email: 'first@company.co.th', name: 'ผู้ดูแลคนแรก', password: 'First-Admin-1' })
      const h = await login(e.app, 'first@company.co.th', 'First-Admin-1')
      const c = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => e.app.inject({ method, url: `${P}${url}`, headers: h, payload: payload as never })
      assert.deepEqual(json(await c('GET', '/tco')).items, [])
      assert.equal((await c('POST', '/ice-vehicles', valid)).statusCode, 201)
      assert.equal((await c('PUT', '/tco', { iceName: 'Vios', evName: 'Dolphin', items: [{ label: 'ราคารถ', iceCost: 600000, evCost: 700000 }] })).statusCode, 200)
      const rep = json(await c('GET', '/reports/electrification'))
      assert.deepEqual([rep.rows.length, rep.readyCount], [1, 1])
      assert.ok(rep.annualSavings > 0)
      assert.deepEqual(rep.tco.labels, ['ราคารถ', 'รวม TCO'])
    } finally {
      await e.stop()
    }
  })
})
