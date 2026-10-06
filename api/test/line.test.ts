import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'
import { createLineClient, type LineClient } from '../src/services/line'
import { currentAlertFloor, formatLineMessage, runLineNotify } from '../src/services/lineNotify'
import { json, login, startApp } from './helpers'

type Fake = LineClient & { sent: string[]; next: { ok: true } | { ok: false; retryable: boolean; error: string } }
const fakeLine = (): Fake => {
  const f: Fake = {
    configured: true,
    sent: [],
    next: { ok: true },
    async push(text) {
      if (f.next.ok) f.sent.push(text)
      return f.next
    },
  }
  return f
}

describe('LINE client (Messaging API push)', () => {
  const ok = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch

  it('ส่งรูปแบบถูกต้อง: Bearer token, ปลายทาง, ข้อความ text และตัดความยาวไม่เกินที่ LINE รับ', async () => {
    let req: { url: string; init: RequestInit } | undefined
    const c = createLineClient({ token: 'TKN', to: 'U123', fetchImpl: (async (url: string, init: RequestInit) => ((req = { url, init }), new Response('{}'))) as unknown as typeof fetch })
    assert.deepEqual(await c.push('x'.repeat(6000)), { ok: true })
    assert.equal(req!.url, 'https://api.line.me/v2/bot/message/push')
    assert.equal((req!.init.headers as Record<string, string>).Authorization, 'Bearer TKN')
    const body = JSON.parse(req!.init.body as string)
    assert.equal(body.to, 'U123')
    assert.equal(body.messages[0].type, 'text')
    assert.ok(body.messages[0].text.length <= 5000)
  })

  it('จัดประเภทข้อผิดพลาด: 4xx ไม่ลองใหม่, 429/5xx/เครือข่ายลองใหม่ และข้อความผิดพลาดไม่รั่ว token', async () => {
    const r401 = await createLineClient({ token: 'SECRET-TOKEN', to: 'U1', fetchImpl: ok(401, '{"message":"Authentication failed"}') }).push('a')
    assert.equal(r401.ok, false)
    assert.equal((r401 as { retryable: boolean }).retryable, false)
    assert.ok(!JSON.stringify(r401).includes('SECRET-TOKEN'))
    assert.equal(((await createLineClient({ token: 't', to: 'u', fetchImpl: ok(429) }).push('a')) as { retryable: boolean }).retryable, true)
    assert.equal(((await createLineClient({ token: 't', to: 'u', fetchImpl: ok(503) }).push('a')) as { retryable: boolean }).retryable, true)
    const down = createLineClient({ token: 't', to: 'u', fetchImpl: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch })
    assert.deepEqual(await down.push('a'), { ok: false, retryable: true, error: 'ECONNRESET' })
  })

  it('ไม่ตั้ง token/ปลายทาง = configured:false และไม่เรียกเครือข่าย', async () => {
    let called = false
    const f = (async () => ((called = true), new Response())) as unknown as typeof fetch
    for (const o of [{}, { token: 't' }, { to: 'u' }]) {
      const c = createLineClient({ ...o, fetchImpl: f })
      assert.equal(c.configured, false)
      assert.equal((await c.push('a')).ok, false)
    }
    assert.equal(called, false)
  })
})

describe('ส่งแจ้งเตือนใหม่เข้า LINE (job)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  const add = async (severity: string, title: string, ageMin = 0) =>
    (await t.pool.query(`insert into alerts (severity, type, title, text, created_at) values ($1, 'battery', $2, 'รายละเอียด', now() - ($3::int * interval '1 minute')) returning id`, [severity, title, ageMin])).rows[0].id as number
  const setLine = (on: boolean) => t.pool.query(`update app_settings set notify = jsonb_set(notify, '{line}', $1::jsonb) where id = 1`, [String(on)])

  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('ส่งเฉพาะวิกฤต/เตือนที่ใหม่ รวมเป็นข้อความเดียว ไม่ส่งซ้ำรอบถัดไป ไม่ส่งระดับข้อมูลและของเก่า', async () => {
    const line = fakeLine()
    const floor = await currentAlertFloor(t.pool)
    await setLine(true)
    await add('critical', 'แบตวิกฤต')
    await add('warning', 'แบตต่ำ')
    await add('info', 'ข้อมูลทั่วไป')
    await add('critical', 'ของเก่า', 60)

    const r1 = await runLineNotify(t.pool, line, floor)
    assert.equal(r1.sent, 2)
    assert.equal(line.sent.length, 1, 'หนึ่งข้อความต่อรอบ')
    assert.match(line.sent[0], /แจ้งเตือนใหม่ 2 รายการ/)
    assert.match(line.sent[0], /\[วิกฤต\] แบตวิกฤต/)
    assert.match(line.sent[0], /\[เตือน\] แบตต่ำ/)
    assert.ok(!line.sent[0].includes('ข้อมูลทั่วไป') && !line.sent[0].includes('ของเก่า'))
    assert.match(line.sent[0], /http:\/\/localhost:3000\/alerts/)

    assert.deepEqual(await runLineNotify(t.pool, line, floor), { sent: 0 })
    assert.equal(line.sent.length, 1, 'ไม่ส่งซ้ำ')
  })

  it('ไม่แตะแจ้งเตือนที่มีอยู่ก่อนเริ่มระบบ (floorId)', async () => {
    const line = fakeLine()
    await setLine(true)
    await add('critical', 'มีอยู่ก่อนเริ่มระบบ')
    const floor = await currentAlertFloor(t.pool)
    assert.deepEqual(await runLineNotify(t.pool, line, floor), { sent: 0 })
    assert.equal(line.sent.length, 0)
    await add('warning', 'เกิดหลังเริ่มระบบ')
    assert.equal((await runLineNotify(t.pool, line, floor)).sent, 1)
  })

  it('สวิตช์ LINE ในหน้าตั้งค่าปิด = ไม่ส่งและไม่จองแถว; เปิดแล้วส่งได้ทันที', async () => {
    const line = fakeLine()
    const floor = await currentAlertFloor(t.pool)
    const id = await add('critical', 'ทดสอบสวิตช์')
    await setLine(false)
    assert.deepEqual(await runLineNotify(t.pool, line, floor), { sent: 0, skipped: 'disabled' })
    assert.equal((await t.pool.query('select line_notified_at from alerts where id = $1', [id])).rows[0].line_notified_at, null)
    await setLine(true)
    assert.equal((await runLineNotify(t.pool, line, floor)).sent, 1)
  })

  it('ส่งไม่สำเร็จ: ผิดชั่วคราว (retryable) คืนการจองแล้วลองใหม่ได้; ผิดถาวร (เช่น token ผิด) ไม่วนส่งซ้ำ', async () => {
    const line = fakeLine()
    const floor = await currentAlertFloor(t.pool)
    await setLine(true)
    const id = await add('critical', 'ลองใหม่')
    line.next = { ok: false, retryable: true, error: 'LINE ตอบ 503' }
    assert.deepEqual(await runLineNotify(t.pool, line, floor), { sent: 0, skipped: 'failed' })
    assert.equal((await t.pool.query('select line_notified_at from alerts where id = $1', [id])).rows[0].line_notified_at, null, 'คืนการจอง')
    line.next = { ok: true }
    assert.equal((await runLineNotify(t.pool, line, floor)).sent, 1, 'รอบถัดไปส่งได้')

    const id2 = await add('critical', 'token ผิด')
    line.next = { ok: false, retryable: false, error: 'LINE ตอบ 401' }
    await runLineNotify(t.pool, line, floor)
    assert.ok((await t.pool.query('select line_notified_at from alerts where id = $1', [id2])).rows[0].line_notified_at, 'ผิดถาวร: ไม่คืนการจอง')
  })

  it('จัดข้อความ: เกิน 8 รายการสรุป "และอีก N รายการ"', () => {
    const list = Array.from({ length: 11 }, (_, i) => ({ id: i, severity: 'warning', title: `เหตุ ${i}`, text: 't' }))
    const msg = formatLineMessage(list)
    assert.match(msg, /ใหม่ 11 รายการ/)
    assert.match(msg, /และอีก 3 รายการ/)
    assert.ok(!msg.includes('เหตุ 9'))
  })

  it('ไม่ตั้งค่า LINE = ข้ามทั้งหมด', async () => {
    const line = createLineClient({})
    assert.deepEqual(await runLineNotify(t.pool, line, 0), { sent: 0, skipped: 'not-configured' })
  })
})

describe('การเชื่อมต่อ LINE ในหน้าตั้งค่า (API)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('ยังไม่ตั้งค่า: connected=false (ไม่ใช้ค่าตั้งต้นในฐานข้อมูล) และส่งทดสอบ → 422', async () => {
    const list = json(await t.app.inject({ method: 'GET', url: '/api/v1/integrations', headers: admin }))
    assert.equal(list.find((i: { key: string }) => i.key === 'line').connected, false)
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/integrations/line/test', headers: admin, payload: {} })
    assert.equal(res.statusCode, 422)
    assert.match(json(res).error.message, /LINE_CHANNEL_ACCESS_TOKEN/)
  })

  it('ตั้งค่าแล้ว: connected=true, ส่งทดสอบได้เฉพาะ admin', async () => {
    const line = fakeLine()
    const app = await buildApp(t.pool, { logger: false, rateLimit: false, line })
    await app.ready()
    const h = admin
    assert.equal(json(await app.inject({ method: 'GET', url: '/api/v1/integrations', headers: h })).find((i: { key: string }) => i.key === 'line').connected, true)
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/integrations/line/test', headers: h, payload: {} })).statusCode, 200)
    assert.equal(line.sent.length, 1)
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/integrations/line/test', payload: {} })).statusCode, 401)
    await app.close()
  })
})
