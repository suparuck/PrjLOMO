import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAdmin } from '../src/services/accounts'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('สมมติฐานของรายงาน', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('สิทธิ์: ไม่ล็อกอิน 401, ผู้ดูรายงาน 403 (ทั้งอ่านและเขียน)', async () => {
    assert.equal((await call('GET', '/report-config', undefined, {})).statusCode, 401)
    const viewer = await login(t.app, 'wanna@company.co.th', 'demo1234')
    assert.equal((await call('GET', '/report-config', undefined, viewer)).statusCode, 403)
    assert.equal((await call('PUT', '/report-config', {}, viewer)).statusCode, 403)
  })

  it('อ่าน: ค่าเดโมปัจจุบัน + ค่ามาตรฐาน + ช่วงที่ยอมรับของทุกค่า (ไม่รวมชื่อรถ TCO)', async () => {
    const r = json(await call('GET', '/report-config'))
    assert.deepEqual([r.values.gridKgPerKwh, r.values.oilCostPerKm, r.values.kwhChangePct, r.values.efficiencyChangePct], [0.4, 2.48, 12, 2.1])
    assert.deepEqual(r.values.evEstimate, { workingDays: 26, kwhPerKm: 0.15, pricePerKwh: 4.8 })
    assert.deepEqual(r.values.co2GPerKm, { sedan: 165, diesel: 210, hybrid: 105, evSolar: 12 })
    assert.deepEqual([r.defaults.kwhChangePct, r.defaults.efficiencyChangePct], [0, 0], 'ค่ามาตรฐานไม่มีตัวเลขเปรียบเทียบเดโม')
    assert.equal(Object.keys(r.limits).length, 14)
    assert.ok(!('tcoNames' in r.values))
  })

  it('บันทึกแล้วมีผลทันทีกับรายงาน/ค่าไฟ EV/รถใหม่ และชื่อรถ TCO ไม่ถูกแตะ', async () => {
    const cur = json(await call('GET', '/report-config')).values
    const before = json(await call('GET', '/reports?period=year&brand=all'))
    const beforeIce = json(await call('GET', '/reports/electrification'))
    const next = {
      ...cur,
      gridKgPerKwh: 0.5,
      treeKgPerYear: 20,
      oilCostPerKm: 3.5,
      kwhChangePct: -4.5,
      defaultEfficiency: 18,
      evEstimate: { workingDays: 20, kwhPerKm: 0.2, pricePerKwh: 5 },
    }
    const put = await call('PUT', '/report-config', next)
    assert.equal(put.statusCode, 200, put.body)
    assert.deepEqual(json(await call('GET', '/report-config')).values, next)

    const after = json(await call('GET', '/reports?period=year&brand=all'))
    assert.equal(after.carbon.gridFactor, 0.5)
    assert.ok(after.carbon.gridTons > before.carbon.gridTons, 'ค่าปล่อยกริดสูงขึ้น → การปล่อยจากไฟฟ้ามากขึ้น')
    assert.equal(after.carbon.treeKgPerYear, 20)
    assert.equal(after.totals.oilCostPerKm, 3.5)
    assert.ok(after.totals.fuelSavings > before.totals.fuelSavings)
    assert.equal(after.totals.kwhChangePct, -4.5)

    const ice = json(await call('GET', '/reports/electrification'))
    const row = ice.rows[0]
    assert.equal(row.evMonthlyCost, Math.round(row.ice.kmPerDay * 20 * 0.2 * 5))
    assert.notEqual(row.evMonthlyCost, beforeIce.rows[0].evMonthlyCost)

    const car = await call('POST', '/vehicles', { id: 'EV-900', model: 'BYD Dolphin', plate: '9กข 9000', batteryKwh: 60, soc: 50, odometerKm: 0 })
    assert.equal(car.statusCode, 201, car.body)
    assert.equal(json(car).efficiency, 18, 'รถใหม่ใช้ประสิทธิภาพตั้งต้นใหม่')

    assert.equal(json(await call('GET', '/tco')).iceName, 'รถสันดาป (Yaris Ativ)', 'ชื่อรถ TCO ไม่ถูกแตะ')
  })

  it('ตรวจข้อมูล: ทศนิยมเกิน/ไม่ใช่จำนวนเต็ม → 422 ระบุฟิลด์ (คีย์แบบจุด) · นอกช่วง → 400 · ไม่เปลี่ยนค่าเดิมเลย (บันทึกแบบทั้งชุด)', async () => {
    const cur = json(await call('GET', '/report-config')).values
    const bad = await call('PUT', '/report-config', { ...cur, gridKgPerKwh: 0.4567, co2GPerKm: { ...cur.co2GPerKm, sedan: 165.5 }, evEstimate: { ...cur.evEstimate, workingDays: 20.5, kwhPerKm: 0.1234 } })
    assert.equal(bad.statusCode, 422)
    const f = json(bad).error.fields
    assert.ok(f.gridKgPerKwh && f['co2GPerKm.sedan'] && f['evEstimate.workingDays'] && f['evEstimate.kwhPerKm'], JSON.stringify(f))
    for (const patch of [{ treeKgPerYear: 0 }, { actualRangeRatio: 1.5 }, { defaultEfficiency: 2 }, { oilCostPerKm: -1 }, { gridKgPerKwh: 5 }, { efficiencyChangePct: 500 }]) {
      assert.equal((await call('PUT', '/report-config', { ...cur, ...patch })).statusCode, 400, JSON.stringify(patch))
    }
    assert.equal((await call('PUT', '/report-config', { ...cur, evEstimate: { workingDays: 26 } })).statusCode, 400, 'ฟิลด์ไม่ครบ')
    assert.deepEqual(json(await call('GET', '/report-config')).values, cur, 'ค่าเดิมไม่เปลี่ยน')
  })

  it('คืนค่ามาตรฐาน: บันทึก defaults ได้ และ GET กลับมาตรงกัน', async () => {
    const r = json(await call('GET', '/report-config'))
    assert.equal((await call('PUT', '/report-config', r.defaults)).statusCode, 200)
    assert.deepEqual(json(await call('GET', '/report-config')).values, r.defaults)
    // รายงานยังคำนวณได้ (ไม่หารศูนย์ ไม่เป็น null) ที่ค่าขอบของช่วง
    const edge = { ...r.defaults, treeKgPerYear: 1, gridKgPerKwh: 0, actualRangeRatio: 0.3 }
    assert.equal((await call('PUT', '/report-config', edge)).statusCode, 200)
    const rep = json(await call('GET', '/reports?period=year&brand=all'))
    for (const k of ['gridTons', 'trees', 'avoidedTons']) assert.ok(Number.isFinite(rep.carbon[k]), k)
    assert.equal((await call('GET', '/battery/insights')).statusCode, 200)
  })
})

describe('สมมติฐานในกองยานว่างเปล่า', () => {
  it('ค่าเริ่มต้นของการติดตั้งใหม่ตรงกับค่ามาตรฐานของระบบ (แก้ที่เดียวไม่เพี้ยน)', async () => {
    const t = await startApp({ demo: false })
    try {
      await createAdmin(t.pool, { email: 'first@company.co.th', name: 'ผู้ดูแลคนแรก', password: 'First-Admin-1' })
      const h = await login(t.app, 'first@company.co.th', 'First-Admin-1')
      const r = json(await t.app.inject({ method: 'GET', url: `${P}/report-config`, headers: h }))
      assert.deepEqual(r.values, r.defaults, 'db/init/02_reference.sql ต้องตรงกับ DEFAULT_ASSUMPTIONS ใน reportConfig.ts')
    } finally {
      await t.stop()
    }
  })
})
