import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runEmailNotify } from '../src/services/emailNotify'
import { createAlert } from '../src/services/ops'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('เปิด/ปิดอีเมลแจ้งเตือนรายบุคคล', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let mgr: Record<string, string>
  const call = (method: 'GET' | 'PUT' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) => t.app.inject({ method, url: `${P}${url}`, headers, payload: payload as never })
  const me = async (h = mgr) => json(await call('GET', '/auth/me', h)).user

  before(async () => {
    t = await startApp()
    mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
  })
  after(async () => { await t.stop() })

  it('ค่าเริ่มต้นเปิดทั้งหมด และต้องล็อกอิน', async () => {
    assert.deepEqual((await me()).notify, { alertEmail: true, loginFailed: true, newNetwork: true })
    assert.equal((await call('PUT', '/auth/notifications', {}, { alertEmail: false })).statusCode, 401)
  })

  it('ปิดอีเมลแจ้งเตือนกองยาน (ไม่ใช่เรื่องความปลอดภัย) ได้โดยไม่ต้องใช้รหัสผ่าน และเปิดกลับได้', async () => {
    const r = await call('PUT', '/auth/notifications', mgr, { alertEmail: false })
    assert.equal(r.statusCode, 200)
    assert.deepEqual(json(r), { alertEmail: false, loginFailed: true, newNetwork: true })
    assert.equal((await me()).notify.alertEmail, false)
    assert.equal((await call('PUT', '/auth/notifications', mgr, { alertEmail: true })).statusCode, 200)
  })

  it('ปิดเตือนความปลอดภัยต้องยืนยันรหัสผ่าน (ไม่ส่ง/ผิด → 422 ไม่เปลี่ยนค่า); เปิดกลับไม่ต้อง', async () => {
    const none = await call('PUT', '/auth/notifications', mgr, { loginFailed: false })
    assert.equal(none.statusCode, 422)
    assert.ok(json(none).error.fields.password)
    assert.equal((await call('PUT', '/auth/notifications', mgr, { newNetwork: false, password: 'wrong-pass-1' })).statusCode, 422)
    assert.equal((await me()).notify.newNetwork, true)
    const ok = await call('PUT', '/auth/notifications', mgr, { loginFailed: false, newNetwork: false, password: 'demo1234' })
    assert.equal(ok.statusCode, 200)
    assert.deepEqual(json(ok), { alertEmail: true, loginFailed: false, newNetwork: false })
    assert.equal((await call('PUT', '/auth/notifications', mgr, { loginFailed: true, newNetwork: true })).statusCode, 200)
  })

  it('ผู้ใช้ที่ปิดแล้วไม่ได้รับ: เตือนล็อกอินผิด, เตือนเครือข่ายใหม่, อีเมลแจ้งเตือนกองยาน (คนอื่นยังได้)', async () => {
    await call('PUT', '/auth/notifications', mgr, { alertEmail: false, loginFailed: false, newNetwork: false, password: 'demo1234' })
    t.mail.length = 0

    // ล็อกอินผิด 6 ครั้ง
    for (let i = 0; i < 6; i++) await call('POST', '/auth/login', {}, { email: 'prasit@company.co.th', password: `bad-${i}-xx` })
    // เข้าจากเครือข่ายใหม่
    await t.app.inject({ method: 'POST', url: `${P}/auth/login`, remoteAddress: '198.51.100.9', payload: { email: 'prasit@company.co.th', password: 'demo1234' } })
    await t.app.inject({ method: 'POST', url: `${P}/auth/login`, remoteAddress: '203.0.113.9', payload: { email: 'prasit@company.co.th', password: 'demo1234' } })
    await t.app.mailIdle()
    assert.equal(t.mail.filter((m) => m.to === 'prasit@company.co.th').length, 0)
    // ช่วงพักไม่ถูกกิน: ยังไม่เคยแจ้ง
    assert.equal((await t.pool.query(`select login_alert_at from users where email = 'prasit@company.co.th'`)).rows[0].login_alert_at, null)

    // อีเมลแจ้งเตือนกองยาน
    await t.pool.query(`update app_settings set notify = jsonb_set(notify, '{email}', 'true')`)
    await createAlert(t.pool, { severity: 'critical', type: 'battery', title: 'ทดสอบ', text: 'ทดสอบการเลือกรับ', vehicleId: 'EV-001' })
    const r = await runEmailNotify(t.pool, t.app.mailer, 0)
    assert.ok(r.sent >= 1)
    const to = t.mail.filter((m) => /ทดสอบ/.test(m.subject + m.text)).map((m) => m.to)
    assert.ok(to.length >= 1 && !to.includes('prasit@company.co.th'))
    assert.ok(to.includes('admin@evmonitor.co.th'))
  })

  it('เปิดกลับแล้วกลับมาได้รับ และการเปลี่ยนค่าถูกบันทึกใน audit log', async () => {
    await call('PUT', '/auth/notifications', mgr, { loginFailed: true })
    t.mail.length = 0
    for (let i = 0; i < 5; i++) await call('POST', '/auth/login', {}, { email: 'prasit@company.co.th', password: `bad2-${i}-xx` })
    await t.app.mailIdle()
    assert.equal(t.mail.filter((m) => m.to === 'prasit@company.co.th' && /พยายามเข้าสู่ระบบ/.test(m.subject)).length, 1)
    const audit = (await t.pool.query(`select detail from audit_log where action = 'PUT /auth/notifications' and actor_email = 'prasit@company.co.th'`)).rows
    assert.ok(audit.length >= 4)
    assert.ok(!JSON.stringify(audit).includes('demo1234'))
  })
})
