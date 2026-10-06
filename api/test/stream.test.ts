import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { login, startApp } from './helpers'

describe('เรียลไทม์ (SSE /stream)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  let base: string

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
    await t.app.listen({ port: 0, host: '127.0.0.1' })
    base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}/api/v1`
  })
  after(async () => { await t.stop() })

  /** อ่านสตรีมจนกว่าข้อความจะมี needle หรือหมดเวลา */
  async function readUntil(res: Response, needle: string, ms = 4000) {
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let text = ''
    const deadline = Date.now() + ms
    while (!text.includes(needle) && Date.now() < deadline) {
      const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), deadline - Date.now()))])
      if (!r || r.done) break
      text += dec.decode(r.value)
    }
    return { text, reader }
  }

  it('ไม่ล็อกอิน → 401', async () => {
    assert.equal((await fetch(`${base}/stream`)).status, 401)
  })

  it('ล็อกอินแล้วเป็น text/event-stream และได้ event: change เมื่อมีคนแก้ข้อมูล', async () => {
    const ac = new AbortController()
    const res = await fetch(`${base}/stream`, { headers: admin, signal: ac.signal })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)
    assert.match(res.headers.get('cache-control') ?? '', /no-transform/)

    // แก้ข้อมูลผ่าน API จริง (แจ้งเตือนทั้งหมดเป็นรับทราบ)
    const m = await fetch(`${base}/alerts/ack-all`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: '{}' })
    assert.ok(m.status < 400, String(m.status))
    const { text, reader } = await readUntil(res, 'event: change')
    assert.ok(text.includes('event: change'), text)
    ac.abort()
    await reader.cancel().catch(() => undefined)
  })

  it('คำขออ่าน (GET) และคำขอที่ล้มเหลวไม่ทำให้เกิด change', async () => {
    const ac = new AbortController()
    const res = await fetch(`${base}/stream`, { headers: admin, signal: ac.signal })
    await fetch(`${base}/vehicles`, { headers: admin })
    await fetch(`${base}/alerts/999999/ack`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: '{}' })
    const { text, reader } = await readUntil(res, 'event: change', 1500)
    assert.ok(!text.includes('event: change'), text)
    ac.abort()
    await reader.cancel().catch(() => undefined)
  })
})
