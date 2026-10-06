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

  describe('คนขับ', () => {
    it('ไม่ส่ง page = อาร์เรย์เดิม · ส่ง page = ซอง เรียงตามคะแนน มีอันดับ รถประจำ และ summary', async () => {
      const all = json(await get('/drivers')) as { id: string; score: number | null; km30d: number; events30d: number }[]
      assert.ok(Array.isArray(all))
      const p1 = json(await get('/drivers?page=1&pageSize=5'))
      const p2 = json(await get('/drivers?page=2&pageSize=5'))
      const p3 = json(await get('/drivers?page=3&pageSize=5'))
      assert.equal(p1.total, all.length)
      const items = [...p1.items, ...p2.items, ...p3.items] as { id: string; score: number | null; rank: number | null; vehicleId: string | null; vehicleModel: string | null }[]
      assert.equal(items.length, all.length)
      assert.equal(new Set(items.map((d) => d.id)).size, all.length, 'ไม่ซ้ำไม่ตก')

      // คะแนนมาก→น้อย ไม่มีคะแนนอยู่ท้าย; อันดับ 1,2,3… ต่อเนื่องข้ามหน้า
      const scored = items.filter((d) => d.score !== null)
      assert.deepEqual(scored.map((d) => d.score), scored.map((d) => d.score).sort((a, b) => b! - a!))
      assert.deepEqual(scored.map((d) => d.rank), scored.map((_, k) => k + 1))
      assert.ok(items.slice(scored.length).every((d) => d.score === null && d.rank === null), 'ไม่มีคะแนน = ไม่มีอันดับ อยู่ท้าย')
      const withVehicle = items.find((d) => d.vehicleId)!
      assert.ok(withVehicle.vehicleModel)

      const s = p1.summary
      assert.equal(s.total, all.length)
      assert.equal(s.scored, all.filter((d) => d.score !== null).length)
      assert.equal(s.good, all.filter((d) => (d.score ?? 0) >= 85).length)
      assert.equal(s.events, all.reduce((n, d) => n + d.events30d, 0))
      assert.ok(Math.abs(s.totalKm - all.reduce((n, d) => n + d.km30d, 0)) < 0.01)
      assert.ok(s.working >= 0 && s.working <= all.length)
    })

    it('ค้นหาชื่อ/เบอร์: อันดับยังเป็นอันดับรวม (ไม่นับใหม่ตามผลค้นหา) และ summary ไม่เปลี่ยน', async () => {
      const full = json(await get('/drivers?page=1&pageSize=100'))
      const target = full.items.find((d: { rank: number | null }) => d.rank && d.rank > 3)
      const r = json(await get(`/drivers?page=1&q=${encodeURIComponent(target.name)}`))
      assert.equal(r.total, 1)
      assert.equal(r.items[0].rank, target.rank)
      assert.equal(r.summary.total, full.summary.total)
      const byPhone = json(await get(`/drivers?page=1&q=${encodeURIComponent(target.phone)}`))
      assert.equal(byPhone.items[0].id, target.id)
      assert.equal(json(await get('/drivers?page=1&q=%25')).total, 0)
      assert.equal((await get('/drivers?page=0')).statusCode, 400)
    })
  })

  describe('ผู้ใช้', () => {
    it('ไม่ส่ง page = อาร์เรย์เดิม · ส่ง page = ซอง; admin อยู่บนสุด; ค้นหาจากชื่อ/อีเมล; ไม่รั่ว hash', async () => {
      const all = json(await get('/users')) as { id: string; email: string }[]
      assert.ok(Array.isArray(all))
      const p1 = json(await get('/users?page=1&pageSize=2'))
      const p2 = json(await get('/users?page=2&pageSize=2'))
      assert.equal(p1.total, all.length)
      assert.deepEqual([...p1.items, ...p2.items].map((u: { id: string }) => u.id), all.map((u) => u.id), 'ลำดับเดียวกับแบบไม่แบ่งหน้า')
      assert.equal(p1.items[0].role, 'admin')
      assert.ok(!JSON.stringify(p1).includes('password'))
      const r = json(await get(`/users?page=1&q=${encodeURIComponent(all[0].email.toUpperCase())}`))
      assert.equal(r.total, 1)
      assert.equal(json(await get('/users?page=1&q=%25')).total, 0)
    })

    it('ต้องเป็น manager ขึ้นไป', async () => {
      assert.equal((await t.app.inject({ method: 'GET', url: '/api/v1/users?page=1' })).statusCode, 401)
    })
  })
})
