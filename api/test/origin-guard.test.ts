import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('ป้องกัน CSRF ชั้นที่สอง (ตรวจ Origin / Sec-Fetch-Site)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let cookie: string
  before(async () => {
    t = await startApp()
    cookie = (await login(t.app)).Cookie
  })
  after(async () => { await t.stop() })

  const post = (headers: Record<string, string>, withCookie = true) =>
    t.app.inject({ method: 'POST', url: '/api/v1/alerts/ack-all', headers: { host: 'app.example.test', ...(withCookie ? { cookie } : {}), ...headers }, payload: {} })

  it('Origin ต่างไซต์ + cookie → 403 cross_origin และไม่แก้ข้อมูล', async () => {
    const res = await post({ origin: 'https://evil.example' })
    assert.equal(res.statusCode, 403)
    assert.equal(json(res).error.code, 'cross_origin')
  })

  it('Sec-Fetch-Site: cross-site / same-site → 403, same-origin และ none ผ่าน', async () => {
    assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).statusCode, 403)
    assert.equal((await post({ 'sec-fetch-site': 'same-site' })).statusCode, 403)
    assert.equal((await post({ 'sec-fetch-site': 'same-origin' })).statusCode, 200)
    assert.equal((await post({ 'sec-fetch-site': 'none' })).statusCode, 200)
  })

  it('Origin ตรงกับโฮสต์ (รวมกรณีผ่านพร็อกซีด้วย X-Forwarded-Host) → ผ่าน', async () => {
    assert.equal((await post({ origin: 'https://app.example.test' })).statusCode, 200)
    const viaProxy = await t.app.inject({ method: 'POST', url: '/api/v1/alerts/ack-all', headers: { host: 'api:4000', 'x-forwarded-host': 'monitor.example.test', origin: 'https://monitor.example.test', cookie }, payload: {} })
    assert.equal(viaProxy.statusCode, 200)
  })

  it('Origin ผิดรูปแบบ / null → 403; ไม่มี Origin (curl, เซิร์ฟเวอร์ต่อเซิร์ฟเวอร์) → ผ่านเหมือนเดิม', async () => {
    assert.equal((await post({ origin: 'null' })).statusCode, 403)
    assert.equal((await post({})).statusCode, 200)
  })

  it('ไม่กระทบคำขอที่ไม่ใช้ cookie: ล็อกอิน และ ingest ด้วย API key แม้มี Origin ต่างไซต์', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://other.example' }, payload: { email: 'admin@evmonitor.co.th', password: 'wrong' } })
    assert.equal(res.statusCode, 401, 'ถึงตรรกะล็อกอิน ไม่ใช่ 403')
    const ing = await t.app.inject({ method: 'PUT', url: '/api/v1/ingest/energy/daily', headers: { origin: 'https://other.example' }, payload: {} })
    assert.equal(ing.statusCode, 401, 'ถึงการตรวจ API key ไม่ใช่ 403')
  })

  it('คำขออ่าน (GET) ไม่ถูกตรวจ', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie, origin: 'https://evil.example' } })
    assert.equal(res.statusCode, 200)
  })
})
