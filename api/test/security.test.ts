import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'
import { createLoginGuard } from '../src/lib/loginGuard'
import { json, startApp } from './helpers'

describe('การจำกัดการเดารหัสผ่าน', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  const login = (app: { inject: (o: never) => Promise<{ statusCode: number }> }, email: string, password: string, extra: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, ...extra } as never)

  it('ใส่ X-Forwarded-For ปลอมคนละค่าทุกคำขอ ก็ไม่หลบ rate limit ต่อ IP (นับตาม IP ที่พร็อกซีของเราเห็น)', async () => {
    const app = await buildApp(t.pool, { logger: false, rateLimit: true })
    await app.ready()
    const codes: number[] = []
    for (let i = 1; i <= 34; i++) {
      // ผู้โจมตีใส่ค่าปลอมหน้าสุด; พร็อกซีของเรา (เว็บ) ต่อท้ายด้วย IP จริงที่มันเห็น
      const res = await login(app as never, `nobody${i}@x.co`, 'x', { remoteAddress: '172.18.0.5', headers: { 'x-forwarded-for': `10.9.${i}.${i}, 203.0.113.7` } })
      codes.push(res.statusCode)
    }
    assert.deepEqual(codes.slice(0, 30), Array(30).fill(401))
    assert.ok(codes.slice(30).every((c) => c === 429), `หลัง 30 ครั้งต้อง 429: ${codes.join(',')}`)
    // ผู้ใช้อื่นที่มาจาก IP อื่นไม่โดนลูกหลง
    const other = await login(app as never, 'a@x.co', 'x', { remoteAddress: '172.18.0.5', headers: { 'x-forwarded-for': '198.51.100.9' } })
    assert.equal(other.statusCode, 401)
    await app.close()
  })

  it('เดาผิดรายบัญชีเกินเพดานจาก "หลาย IP" ก็ถูกจำกัด (ไม่ขึ้นกับ IP) และกลับมาได้เมื่อหมดเวลา', async () => {
    const app = await buildApp(t.pool, { logger: false, rateLimit: false })
    await app.ready()
    const codes: number[] = []
    for (let i = 0; i < 22; i++) {
      codes.push((await login(app as never, 'Admin@EvMonitor.co.th', `wrong-${i}`, { remoteAddress: `10.0.0.${i + 1}` })).statusCode)
    }
    assert.deepEqual(codes.slice(0, 20), Array(20).fill(401))
    assert.deepEqual(codes.slice(20), [429, 429])
    // ระหว่างถูกจำกัด แม้รหัสถูกก็ยังถูกปฏิเสธ (กันเดาแล้วลองรหัสจริงสลับกัน) และไม่กระทบบัญชีอื่น
    assert.equal((await login(app as never, 'admin@evmonitor.co.th', 'demo1234')).statusCode, 429)
    assert.equal((await login(app as never, 'prasit@company.co.th', 'wrong')).statusCode, 401)
    await app.close()
  })

  it('ตัวนับ: ล็อกอินสำเร็จล้างตัวนับ, หมดหน้าต่างเวลา = เริ่มนับใหม่, หน่วยความจำมีเพดาน', () => {
    let now = 1_000
    const g = createLoginGuard({ max: 3, windowMs: 1000, maxKeys: 5, now: () => now })
    g.fail('a@x.co'); g.fail('A@x.co'); g.fail('a@x.co')
    assert.equal(g.blocked('a@x.co'), true, 'ไม่สนตัวพิมพ์')
    now += 1001
    assert.equal(g.blocked('a@x.co'), false, 'หมดเวลา')
    g.fail('b@x.co'); g.fail('b@x.co')
    g.success('b@x.co')
    g.fail('b@x.co'); g.fail('b@x.co')
    assert.equal(g.blocked('b@x.co'), false, 'สำเร็จแล้วนับใหม่')
    for (let i = 0; i < 50; i++) g.fail(`rand${i}@x.co`)
    assert.ok(g.size <= 5, `เพดานคีย์: ${g.size}`)
  })

  it('ไม่รั่วว่ามีอีเมลนี้หรือไม่: ข้อความผิดพลาดเหมือนกัน และชดเชย bcrypt ให้อีเมลที่ไม่มีในระบบ (ไม่พึ่งการจับเวลา)', async () => {
    const queries: string[] = []
    const spy = Object.assign(Object.create(t.pool), {
      query: (sql: unknown, params: unknown) => {
        queries.push(String(sql))
        return (t.pool.query as (...a: unknown[]) => unknown)(sql, params)
      },
    })
    const app = await buildApp(spy, { logger: false, rateLimit: false })
    await app.ready()
    const attempt = async (email: string) => {
      queries.length = 0
      const r = await login(app as never, email, 'wrong-password-1')
      return { code: r.statusCode, msg: json(r as never).error.message as string, dummy: queries.filter((q) => q.startsWith('select crypt(')).length }
    }
    const known = await attempt('prasit@company.co.th')
    const unknown = await attempt('ghost@x.co')
    assert.equal(known.code, 401)
    assert.equal(unknown.code, 401)
    assert.equal(known.msg, unknown.msg)
    // อีเมลที่มี: bcrypt ทำงานใน UPDATE อยู่แล้วหนึ่งครั้ง (ไม่ต้องชดเชย) · ไม่มีอีเมลนั้น: UPDATE ไม่เจอแถวจึงไม่ทำ bcrypt → ต้องชดเชยด้วย dummy หนึ่งครั้ง
    assert.equal(known.dummy, 0, 'อีเมลที่มี: ไม่ทำ dummy ซ้ำ (จะช้ากว่ากรณีไม่มี)')
    assert.equal(unknown.dummy, 1, 'อีเมลที่ไม่มี: ทำ dummy bcrypt หนึ่งครั้งเพื่อให้เวลาเท่ากัน')
    await app.close()
  })
})

describe('ส่วนหัวความปลอดภัยของ API', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('nosniff, ไม่ส่ง Referer, ข้อมูลไม่ถูกแคช (รวมคำตอบผิดพลาด)', async () => {
    for (const url of ['/healthz', '/api/v1/auth/me', '/api/v1/public/overview']) {
      const res = await t.app.inject({ method: 'GET', url })
      assert.equal(res.headers['x-content-type-options'], 'nosniff', url)
      assert.equal(res.headers['referrer-policy'], 'no-referrer', url)
      assert.equal(res.headers['cache-control'], 'no-store', url)
    }
  })
})
