import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { codeAtStep, stepAt } from '../src/lib/totp'
import { ipPrefix, recordLoginAndMaybeAlert } from '../src/services/loginAlert'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('ipPrefix', () => {
  it('IPv4 → /24, IPv4-mapped IPv6 → /24, IPv6 → /64 (ย่อ :: และเลขศูนย์นำหน้าได้เท่ากัน), ค่าว่าง/อ่านไม่ได้ → null', () => {
    assert.equal(ipPrefix('203.0.113.77'), '203.0.113')
    assert.equal(ipPrefix('::ffff:203.0.113.9'), '203.0.113')
    assert.equal(ipPrefix('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2')
    assert.equal(ipPrefix('2001:0db8:0001:0002::1'), '2001:db8:1:2')
    assert.equal(ipPrefix('2001:db8::1'), '2001:db8:0:0')
    assert.equal(ipPrefix('::1'), '0:0:0:0')
    assert.equal(ipPrefix(''), null)
    assert.equal(ipPrefix(undefined), null)
    assert.equal(ipPrefix('not-an-ip'), null)
  })
})

describe('แจ้งเตือนเมื่อเข้าสู่ระบบสำเร็จจากเครือข่ายใหม่', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  const loginFrom = (ip: string, email = 'prasit@company.co.th', password = 'demo1234') =>
    t.app.inject({ method: 'POST', url: `${P}/auth/login`, remoteAddress: ip, headers: { 'user-agent': 'TestBrowser/1.0' }, payload: { email, password } })
  const alerts = () => t.mail.filter((m) => /เครือข่ายใหม่/.test(m.subject))

  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('ครั้งแรกสุดของบัญชีไม่เตือน; เครือข่ายเดิม (IP ต่างแต่ /24 เดียวกัน) ไม่เตือน', async () => {
    assert.equal((await loginFrom('203.0.113.5')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, 0)
    assert.equal((await loginFrom('203.0.113.200')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, 0)
  })

  it('เครือข่ายใหม่: เตือนเจ้าของบัญชีฉบับเดียว มีเวลา/IP/อุปกรณ์/ลิงก์เปลี่ยนรหัส; เข้าซ้ำจากเครือข่ายนั้นไม่เตือนอีก', async () => {
    assert.equal((await loginFrom('198.51.100.9')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, 1)
    const m = alerts()[0]
    assert.equal(m.to, 'prasit@company.co.th')
    assert.match(m.text, /198\.51\.100\.9/)
    assert.match(m.text, /TestBrowser\/1\.0/)
    assert.match(m.text, /\/account/)
    assert.equal((await loginFrom('198.51.100.40')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, 1)
    const rows = (await t.pool.query(`select action, detail from audit_log where actor_email = 'prasit@company.co.th' and action in ('auth.login','auth.new_network_alert_sent') order by id`)).rows
    assert.equal(rows.filter((r) => r.action === 'auth.new_network_alert_sent').length, 1)
    assert.equal(rows.filter((r) => r.detail.newNetwork).length, 1)
  })

  it('รหัสผ่านผิดจากเครือข่ายใหม่ไม่ทำให้ถือว่า "เคยเห็น" (ต้องสำเร็จเท่านั้น) และไม่เตือนคนอื่น', async () => {
    const before = alerts().length
    const bad = await loginFrom('192.0.2.1', 'prasit@company.co.th', 'wrong-pass-1')
    assert.equal(bad.statusCode, 401)
    await t.app.mailIdle()
    assert.equal(alerts().length, before)
    assert.equal((await loginFrom('192.0.2.2')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, before + 1, 'ครั้งแรกที่สำเร็จจากเครือข่าย 192.0.2.x ถึงเตือน')
  })

  it('บัญชี 2FA: เตือนหลังผ่านขั้นที่สองเท่านั้น (ไม่เตือนตอนรหัสผ่านถูกแต่ยังไม่ผ่าน 2FA)', async () => {
    const admin = await login(t.app)
    const setup = json(await t.app.inject({ method: 'POST', url: `${P}/auth/2fa/setup`, headers: admin, payload: { password: 'demo1234' } }))
    await t.app.inject({ method: 'POST', url: `${P}/auth/2fa/enable`, headers: admin, payload: { pending: setup.pending, code: codeAtStep(setup.secret, stepAt(Date.now())) } })
    const before = alerts().length
    const r1 = await loginFrom('198.18.0.7', 'admin@evmonitor.co.th')
    assert.equal(json(r1).twoFactorRequired, true)
    await t.app.mailIdle()
    assert.equal(alerts().length, before)
    // รหัสช่วงถัดไป (ช่วงปัจจุบันถูกใช้ตอนเปิด 2FA แล้ว)
    const code = codeAtStep(setup.secret, stepAt(Date.now()) + 1)
    const r2 = await t.app.inject({ method: 'POST', url: `${P}/auth/login/2fa`, remoteAddress: '198.18.0.7', payload: { challenge: json(r1).challenge, code } })
    assert.equal(r2.statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().length, before + 1)
    assert.equal(alerts()[alerts().length - 1].to, 'admin@evmonitor.co.th')
  })

  it('เกิน 90 วัน = ไม่เคยเห็น แต่ถ้าไม่มีประวัติในช่วงนั้นเลยก็ไม่เตือน; mailer off ไม่ส่งแต่ยังบันทึก', async () => {
    await t.pool.query(`update audit_log set at = now() - interval '100 days' where actor_email = 'wanna@company.co.th'`)
    assert.equal((await loginFrom('203.0.113.1', 'wanna@company.co.th')).statusCode, 200)
    await t.app.mailIdle()
    assert.equal(alerts().filter((m) => m.to === 'wanna@company.co.th').length, 0)

    let sent = 0
    const off = { mode: 'off' as const, send: async () => { sent++ } }
    const uid = (await t.pool.query(`select id from users where email = 'wanna@company.co.th'`)).rows[0].id
    const req = { ip: '100.64.0.1', log: { error() {} } as never, headers: {} }
    await recordLoginAndMaybeAlert(t.pool, off, (p) => void p, req, { id: uid, email: 'wanna@company.co.th', name: 'x' })
    assert.equal(sent, 0)
    assert.equal((await t.pool.query(`select count(*)::int as n from audit_log where actor_email = 'wanna@company.co.th' and detail->>'newNetwork' = 'true'`)).rows[0].n, 1)
  })
})
