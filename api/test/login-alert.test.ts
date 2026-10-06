import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { codeAtStep, stepAt } from '../src/lib/totp'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('แจ้งเตือนเจ้าของบัญชีเมื่อมีคนล็อกอินผิดซ้ำ', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => t.app.inject({ method: 'POST', url: `${P}${url}`, headers, payload: payload as never })
  const bad = async (email: string, n: number) => {
    for (let i = 0; i < n; i++) await post('/auth/login', { email, password: `wrong-pass-${i}` })
    await t.app.mailIdle()
  }
  const alerts = () => t.mail.filter((m) => /พยายามเข้าสู่ระบบ|รหัสผ่านของคุณอาจรั่ว/.test(m.subject))

  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('ต่ำกว่าเกณฑ์ (4 ครั้ง) ไม่ส่ง; ครบ 5 ครั้งส่งฉบับเดียวถึงเจ้าของบัญชี พร้อมเวลา/IP/ลิงก์ ไม่มีรหัสผ่านที่ลอง', async () => {
    await bad('prasit@company.co.th', 4)
    assert.equal(alerts().length, 0)
    await bad('prasit@company.co.th', 1)
    assert.equal(alerts().length, 1)
    const m = alerts()[0]
    assert.equal(m.to, 'prasit@company.co.th')
    assert.match(m.text, /5 ครั้ง/)
    assert.match(m.text, /ที่อยู่ IP: /)
    assert.match(m.text, /\/forgot-password/)
    assert.ok(!/wrong-pass/.test(m.text))
    const logged = (await t.pool.query(`select count(*)::int as n from audit_log where action = 'auth.login_alert_sent' and actor_email = 'prasit@company.co.th'`)).rows[0].n
    assert.equal(logged, 1)
  })

  it('ช่วงพัก 1 ชั่วโมง: ล้มเหลวต่อไปไม่ส่งซ้ำ แต่พ้นช่วงพักแล้วส่งใหม่', async () => {
    await bad('prasit@company.co.th', 6)
    assert.equal(alerts().length, 1)
    await t.pool.query(`update users set login_alert_at = now() - interval '61 minutes' where email = 'prasit@company.co.th'`)
    await bad('prasit@company.co.th', 1)
    assert.equal(alerts().length, 2)
  })

  it('ไม่มีบัญชีนี้/บัญชีถูกปิด: ไม่ส่งอะไรเลย (ไม่เปิดเผยและไม่สแปมคนอื่น); อีเมลตัวพิมพ์ต่างกันนับรวมกัน', async () => {
    const before = alerts().length
    await bad('ghost@nowhere.co', 8)
    assert.equal(alerts().length, before)
    await t.pool.query(`update users set status = 'disabled' where email = 'wanna@company.co.th'`)
    await bad('wanna@company.co.th', 6)
    assert.equal(alerts().length, before)
    await t.pool.query(`update users set status = 'active' where email = 'wanna@company.co.th'`)
    for (let i = 0; i < 3; i++) await post('/auth/login', { email: 'WANNA@company.co.th', password: `x-${i}` })
    for (let i = 0; i < 2; i++) await post('/auth/login', { email: 'wanna@company.co.th', password: `y-${i}` })
    await t.app.mailIdle()
    // 5 ครั้งที่ 6 หลังเปิดใหม่ + 6 ครั้งตอนปิด (ผิดจริงในบันทึก) → ถึงเกณฑ์แล้วส่ง 1 ฉบับ
    assert.equal(alerts().filter((m) => m.to === 'wanna@company.co.th').length, 1)
  })

  it('คำขอตอบเหมือนกันทั้งบัญชีที่มี/ไม่มี (401 รหัสเดียวกัน ไม่มีข้อมูลเพิ่ม)', async () => {
    const a = await post('/auth/login', { email: 'prasit@company.co.th', password: 'nope-nope-1' })
    const b = await post('/auth/login', { email: 'ghost2@nowhere.co', password: 'nope-nope-1' })
    assert.equal(a.statusCode, b.statusCode)
    assert.equal(a.body, b.body)
  })

  it('รหัส 2FA ผิดหลังรหัสผ่านถูก: เกณฑ์ 3 ครั้ง ส่งคำเตือนรหัสผ่านอาจรั่ว', async () => {
    const admin = await login(t.app)
    const setup = json(await post('/auth/2fa/setup', { password: 'demo1234' }, admin))
    assert.equal((await post('/auth/2fa/enable', { pending: setup.pending, code: codeAtStep(setup.secret, stepAt(Date.now())) }, admin)).statusCode, 200)
    t.mail.length = 0
    for (let i = 0; i < 3; i++) {
      const ch = json(await post('/auth/login', { email: 'admin@evmonitor.co.th', password: 'demo1234' })).challenge
      await post('/auth/login/2fa', { challenge: ch, code: `00000${i}` })
    }
    await t.app.mailIdle()
    const a = alerts()
    assert.equal(a.length, 1)
    assert.equal(a[0].to, 'admin@evmonitor.co.th')
    assert.match(a[0].subject, /รหัสผ่านของคุณอาจรั่ว/)
    assert.match(a[0].text, /เปลี่ยนรหัสผ่านทันที/)
  })

  it('ไม่ตั้ง SMTP (mailer off): ไม่ส่งและไม่กินช่วงพัก', async () => {
    const { alertOnFailedLogins } = await import('../src/services/loginAlert')
    await t.pool.query(`update users set login_alert_at = null where email = 'prasit@company.co.th'`)
    await alertOnFailedLogins(t.pool, { mode: 'off', send: async () => { throw new Error('ไม่ควรเรียก') } }, { ip: '1.2.3.4', log: { error() {} } as never }, { email: 'prasit@company.co.th' }, 'password')
    assert.equal((await t.pool.query(`select login_alert_at from users where email = 'prasit@company.co.th'`)).rows[0].login_alert_at, null)
  })
})
