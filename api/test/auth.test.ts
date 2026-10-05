import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { json, login, startApp } from './helpers'

describe('auth และสิทธิ์ตามบทบาท', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('รหัสผ่านผิด → 401 และไม่ตั้ง cookie', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@evmonitor.co.th', password: 'wrong' } })
    assert.equal(res.statusCode, 401)
    assert.equal(json(res).error.code, 'invalid_credentials')
    assert.equal(res.cookies.length, 0)
  })

  it('อีเมลไม่สนตัวพิมพ์เล็กใหญ่ และ cookie เป็น httpOnly', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ADMIN@EvMonitor.co.th', password: 'demo1234' } })
    assert.equal(res.statusCode, 200)
    const c = res.cookies.find((x) => x.name === 'ev_session')!
    assert.equal(c.httpOnly, true)
    assert.equal(c.maxAge, undefined, 'ไม่จดจำ = session cookie')
    assert.equal(json(res).user.role, 'admin')
  })

  it('จดจำฉัน → cookie มีอายุ 30 วัน', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@evmonitor.co.th', password: 'demo1234', remember: true } })
    assert.equal(res.cookies.find((x) => x.name === 'ev_session')!.maxAge, 30 * 24 * 3600)
  })

  it('me / logout / ไม่ล็อกอินได้ 401', async () => {
    const h = await login(t.app)
    assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: h })).user.email, 'admin@evmonitor.co.th')
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode, 401)
    const out = await t.app.inject({ method: 'POST', url: '/api/v1/auth/logout' })
    assert.equal(out.statusCode, 200)
    assert.equal(out.cookies[0].value, '')
  })

  it('ผู้ใช้ที่ถูกเชิญแต่ยังไม่ตอบรับ ล็อกอินไม่ได้', async () => {
    const h = await login(t.app)
    assert.equal((await t.app.inject({ method: 'POST', url: '/api/v1/users/invite', headers: h, payload: { email: 'new@x.co', role: 'viewer' } })).statusCode, 201)
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'new@x.co', password: 'anything' } })
    assert.equal(res.statusCode, 401)
  })

  it('token ปลอม: alg=none, ลายเซ็นผิด, หมดอายุ ถูกปฏิเสธ', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const payload = b({ sub: 'x', email: 'a@b.c', name: 'x', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    const none = `${b({ alg: 'none', typ: 'JWT' })}.${payload}.`
    const badSig = `${b({ alg: 'HS256', typ: 'JWT' })}.${payload}.${createHmac('sha256', 'wrong-secret').update('x').digest('base64url')}`
    const expiredPayload = b({ sub: 'x', email: 'a@b.c', name: 'x', role: 'admin', exp: Math.floor(Date.now() / 1000) - 10 })
    const header = b({ alg: 'HS256', typ: 'JWT' })
    const expired = `${header}.${expiredPayload}.${createHmac('sha256', process.env.AUTH_SECRET!).update(`${header}.${expiredPayload}`).digest('base64url')}`
    for (const tok of [none, badSig, expired]) {
      const res = await t.app.inject({ method: 'GET', url: '/api/v1/vehicles', headers: { authorization: `Bearer ${tok}` } })
      assert.equal(res.statusCode, 401, tok.slice(0, 20))
    }
  })

  it('RBAC: viewer ดูได้เฉพาะรายงาน, manager แก้ตั้งค่า/เชิญผู้ใช้ไม่ได้, admin ได้ทั้งหมด', async () => {
    const viewer = await login(t.app, 'wanna@company.co.th')
    const manager = await login(t.app, 'prasit@company.co.th')
    const admin = await login(t.app)
    const get = (url: string, headers: Record<string, string>) => t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers })

    assert.equal((await get('/reports', viewer)).statusCode, 200)
    assert.equal((await get('/reports/electrification', viewer)).statusCode, 200)
    assert.equal((await get('/org', viewer)).statusCode, 200)
    assert.equal((await get('/vehicles', viewer)).statusCode, 403)
    assert.equal((await get('/alerts', viewer)).statusCode, 403)

    assert.equal((await get('/vehicles', manager)).statusCode, 200)
    assert.equal((await t.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: manager, payload: {} })).statusCode, 403)
    assert.equal((await t.app.inject({ method: 'POST', url: '/api/v1/users/invite', headers: manager, payload: { email: 'a@b.co', role: 'viewer' } })).statusCode, 403)
    assert.equal((await get('/api-keys', manager)).statusCode, 403)

    assert.equal((await get('/api-keys', admin)).statusCode, 200)
    assert.equal((await get('/users', admin)).statusCode, 200)
  })

  it('/healthz และ /docs เปิดได้โดยไม่ต้องล็อกอิน', async () => {
    assert.equal((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200)
    const docs = await t.app.inject({ method: 'GET', url: '/docs/json' })
    assert.equal(docs.statusCode, 200)
    assert.ok(Object.keys(json(docs).paths).length > 40, 'OpenAPI ครอบคลุม endpoint')
  })
})
