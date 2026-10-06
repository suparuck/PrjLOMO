import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('แบ่งหน้าฝั่ง API', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const get = async (url: string) => t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: admin })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  describe('รถ', () => {
    it('ไม่ส่ง page = อาร์เรย์ทั้งหมดเหมือนเดิม', async () => {
      const all = json(await get('/vehicles'))
      assert.ok(Array.isArray(all))
      assert.equal(all.length, 12)
    })

    it('ส่ง page = ซองข้อมูล: หน้า 1 ได้ 10, หน้า 2 ได้ที่เหลือ, ไม่ซ้ำกัน, total/pages/summary ถูกต้อง', async () => {
      const p1 = json(await get('/vehicles?page=1&pageSize=10'))
      const p2 = json(await get('/vehicles?page=2&pageSize=10'))
      assert.equal(p1.items.length, 10)
      assert.equal(p2.items.length, 2)
      assert.equal(p1.total, 12)
      assert.equal(p1.pages, 2)
      assert.equal(new Set([...p1.items, ...p2.items].map((v: { id: string }) => v.id)).size, 12)
      assert.equal(json(await get('/vehicles?page=3&pageSize=10')).items.length, 0, 'เกินหน้าสุดท้าย = ว่าง ไม่ error')

      const s = p1.summary
      assert.equal(s.total, 12)
      assert.equal(Object.values(s.byStatus as Record<string, number>).reduce((a, b) => a + b, 0), 12)
      assert.ok(s.models.length > 0 && s.rangeKm > 0 && s.avgSoh > 0 && s.odometerKm > 0)
    })

    it('กรองสถานะและค้นหา (รวมชื่อคนขับ) ได้ total ที่ตรงกับตัวกรอง แต่ summary ยังเป็นของทั้งกอง', async () => {
      const all = json(await get('/vehicles')) as { id: string; model: string; status: string; driverId: string }[]
      const status = all[0].status
      const want = all.filter((v) => v.status === status).length
      const r = json(await get(`/vehicles?page=1&status=${status}`))
      assert.equal(r.total, want)
      assert.ok(r.items.every((v: { status: string }) => v.status === status))
      assert.equal(r.summary.total, 12)

      const model = all[0].model
      const byModel = json(await get(`/vehicles?page=1&q=${encodeURIComponent(model.toLowerCase())}`))
      assert.equal(byModel.total, all.filter((v) => v.model === model).length, 'ไม่สนตัวพิมพ์')

      const drv = json(await get('/drivers')).find((d: { vehicleId: string | null }) => d.vehicleId)
      const byDriver = json(await get(`/vehicles?page=1&q=${encodeURIComponent(drv.name)}`))
      assert.ok(byDriver.items.some((v: { id: string }) => v.id === drv.vehicleId), 'ค้นหาจากชื่อคนขับ')
    })

    it('คำค้นเป็นข้อความตรงตัว: % และ _ ไม่ใช่ตัวแทน, อักขระพิเศษ/SQL ไม่ทำให้พัง', async () => {
      for (const q of ['%', '_', "'; drop table vehicles; --", '\\']) {
        const res = await get(`/vehicles?page=1&q=${encodeURIComponent(q)}`)
        assert.equal(res.statusCode, 200, q)
        assert.equal(json(res).total, 0, q)
      }
      assert.equal(json(await get('/vehicles')).length, 12)
    })

    it('เรียงลำดับ: แบตน้อย→มาก, มาก→น้อย, ระยะวิ่งมากสุด (คงที่ข้ามหน้า)', async () => {
      const asc = json(await get('/vehicles?page=1&pageSize=100&sort=soc-asc')).items.map((v: { soc: number }) => v.soc)
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b))
      const desc = json(await get('/vehicles?page=1&pageSize=100&sort=soc-desc')).items.map((v: { soc: number }) => v.soc)
      assert.deepEqual(desc, [...desc].sort((a, b) => b - a))
      const rng = json(await get('/vehicles?page=1&pageSize=100&sort=range-desc')).items.map((v: { rangeKm: number }) => v.rangeKm)
      assert.deepEqual(rng, [...rng].sort((a, b) => b - a))
      // หน้าต่อหน้าต้องต่อกันพอดีกับหน้าเดียวขนาดใหญ่
      const a = json(await get('/vehicles?page=1&pageSize=5&sort=soc-desc')).items
      const b = json(await get('/vehicles?page=2&pageSize=5&sort=soc-desc')).items
      const c = json(await get('/vehicles?page=3&pageSize=5&sort=soc-desc')).items
      const one = json(await get('/vehicles?page=1&pageSize=100&sort=soc-desc')).items
      assert.deepEqual([...a, ...b, ...c].map((v: { id: string }) => v.id), one.map((v: { id: string }) => v.id))
    })

    it('พารามิเตอร์ผิด → 400 และต้องล็อกอิน/สิทธิ์ manager', async () => {
      for (const qs of ['page=0', 'pageSize=101', 'pageSize=0', 'status=flying', 'sort=random', 'page=abc']) {
        assert.equal((await get(`/vehicles?${qs}`)).statusCode, 400, qs)
      }
      assert.equal((await t.app.inject({ method: 'GET', url: '/api/v1/vehicles?page=1' })).statusCode, 401)
    })
  })

  describe('แจ้งเตือน', () => {
    it('ไม่ส่ง page = อาร์เรย์เดิม · ส่ง page = ซอง + summary แยกตามระดับ (ไม่ขึ้นกับตัวกรอง)', async () => {
      const all = json(await get('/alerts')) as { severity: string; type: string; acknowledgedAt: string | null }[]
      assert.ok(Array.isArray(all))
      const r = json(await get('/alerts?page=1&pageSize=5'))
      assert.equal(r.items.length, Math.min(5, all.length))
      assert.equal(r.total, all.length)
      const sum = r.summary.bySeverity as Record<string, { total: number; open: number }>
      assert.equal(Object.values(sum).reduce((a, b) => a + b.total, 0), all.length)
      assert.equal(Object.values(sum).reduce((a, b) => a + b.open, 0), all.filter((a) => !a.acknowledgedAt).length)

      const sev = all[0].severity
      const f = json(await get(`/alerts?page=1&pageSize=100&severity=${sev}`))
      assert.equal(f.total, all.filter((a) => a.severity === sev).length)
      assert.ok(f.items.every((a: { severity: string }) => a.severity === sev))
      assert.equal(f.summary.bySeverity[sev].total, sum[sev].total, 'summary ไม่เปลี่ยนตามตัวกรอง')

      const type = all[0].type
      const ft = json(await get(`/alerts?page=1&pageSize=100&type=${type}&severity=${sev}`))
      assert.equal(ft.total, all.filter((a) => a.type === type && a.severity === sev).length)
    })

    it('ใหม่→เก่า ต่อกันข้ามหน้าไม่ซ้ำไม่ตก', async () => {
      const all = json(await get('/alerts')).map((a: { id: number }) => a.id)
      const got: number[] = []
      for (let p = 1; p <= Math.ceil(all.length / 4); p++) got.push(...json(await get(`/alerts?page=${p}&pageSize=4`)).items.map((a: { id: number }) => a.id))
      assert.deepEqual(got, all)
    })
  })

  describe('ประวัติการชาร์จ', () => {
    it('ไม่ส่ง page = อาร์เรย์เดิม · ส่ง page = ซอง ที่ total ตรงกับจำนวนทั้งหมดในช่วงเวลา', async () => {
      const legacy = json(await get('/charging/history?hours=8760&limit=500'))
      assert.ok(Array.isArray(legacy))
      const r = json(await get('/charging/history?hours=8760&page=1&pageSize=2'))
      assert.equal(r.total, legacy.length)
      assert.equal(r.items.length, Math.min(2, legacy.length))
      const got: string[] = []
      for (let p = 1; p <= Math.ceil(legacy.length / 2); p++) got.push(...json(await get(`/charging/history?hours=8760&page=${p}&pageSize=2`)).items.map((s: { id: number }) => String(s.id)))
      assert.equal(new Set(got).size, legacy.length, 'ไม่ซ้ำและไม่ตก')
    })
  })
})
