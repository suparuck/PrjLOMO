import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { purgeAudit } from '../src/services/audit'
import { codeAtStep, stepAt } from '../src/lib/totp'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('บันทึกกิจกรรม (audit log)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string> = admin, payload?: unknown) =>
    t.app.inject({ method, url: `${P}${url}`, headers, payload: payload as never })
  const list = async (qs = '') => json(await call('GET', `/audit-log?page=1&pageSize=100${qs}`)) as { items: Item[]; total: number }
  type Item = { action: string; actorEmail: string | null; target: string | null; ip: string | null; label: string; category: string; detail: { fields?: string[] } }
  const rowsOf = async (action: string) => (await list()).items.filter((i) => i.action === action)

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('เข้าสู่ระบบสำเร็จ/ล้มเหลวถูกบันทึก (ล้มเหลวเก็บอีเมลที่ลอง ไม่เก็บรหัสผ่าน)', async () => {
    await call('POST', '/auth/login', {}, { email: 'ghost@nowhere.co', password: 'Sup3r-Secret-Pw' })
    await call('POST', '/auth/login', {}, { email: 'prasit@company.co.th', password: 'wrong-pass-1' })
    const fails = await rowsOf('auth.login_failed')
    assert.deepEqual(fails.map((f) => f.actorEmail).sort(), ['ghost@nowhere.co', 'prasit@company.co.th'])
    assert.ok(fails.every((f) => f.category === 'security' && f.label.includes('ไม่สำเร็จ')))
    const logins = await rowsOf('auth.login')
    assert.ok(logins.some((l) => l.actorEmail === 'admin@evmonitor.co.th'))
    const all = JSON.stringify((await t.pool.query('select * from audit_log')).rows)
    assert.ok(!all.includes('Sup3r-Secret-Pw') && !all.includes('wrong-pass-1') && !all.includes('demo1234'), 'ไม่มีรหัสผ่านในบันทึก')
  })

  it('การแก้ข้อมูลที่สำเร็จถูกบันทึกอัตโนมัติ: ผู้ทำ เป้าหมาย IP ชื่อฟิลด์ (ไม่มีค่า) และคำขออ่าน/ที่ล้มเหลวไม่ถูกบันทึก', async () => {
    const inv = await call('POST', '/users/invite', admin, { email: 'audit-newbie@company.co.th', role: 'viewer' })
    assert.equal(inv.statusCode, 201)
    const id = json(inv).id
    const r = (await rowsOf('POST /users/invite'))[0]
    assert.equal(r.actorEmail, 'admin@evmonitor.co.th')
    assert.equal(r.target, 'audit-newbie@company.co.th')
    assert.equal(r.category, 'users')
    assert.ok(r.ip)
    assert.deepEqual(r.detail.fields!.sort(), ['email', 'role'])

    // แก้ผู้ใช้: เป้าหมายเป็นอีเมล ไม่ใช่ uuid
    await call('PATCH', `/users/${id}`, admin, { name: 'ผู้ใช้ทดสอบ', role: 'viewer', status: 'active' }).catch(() => undefined)
    // ลบแถว (ยกเลิกคำเชิญ) — ยังรู้ว่าเป้าหมายคือใคร
    assert.equal((await call('DELETE', `/users/${id}`)).statusCode, 200)
    const del = (await rowsOf('DELETE /users/:id'))[0]
    assert.equal(del.target, 'audit-newbie@company.co.th')

    const before = (await list()).total
    await call('GET', '/vehicles')
    await call('POST', '/users/invite', admin, { email: 'not-an-email', role: 'viewer' }) // 422 ไม่บันทึก
    await call('POST', '/users/invite', {}, { email: 'x@y.co', role: 'viewer' }) // 401 ไม่บันทึก
    assert.equal((await list()).total, before)
  })

  it('เหตุการณ์ด้านความปลอดภัย/ตั้งค่าถูกบันทึกพร้อมชื่อภาษาไทย และกรองตามหมวด/ค้นหา/วันที่ได้', async () => {
    await call('PUT', '/report-config', admin, json(await call('GET', '/report-config')).values ?? undefined).catch(() => undefined)
    assert.equal((await call('POST', '/auth/change-password', admin, { currentPassword: 'demo1234', newPassword: 'Admin-New-Pass-1' })).statusCode, 200)
    admin = await login(t.app, 'admin@evmonitor.co.th', 'Admin-New-Pass-1')
    const cp = (await rowsOf('POST /auth/change-password'))[0]
    assert.equal(cp.label, 'เปลี่ยนรหัสผ่านของตัวเอง')
    assert.equal(cp.category, 'security')
    assert.deepEqual(cp.detail.fields!.sort(), ['currentPassword', 'newPassword'])

    const sec = await list('&category=security')
    assert.ok(sec.items.length >= 3 && sec.items.every((i) => i.category === 'security'))
    const users = await list('&category=users')
    assert.ok(users.items.length >= 2 && users.items.every((i) => i.category === 'users'))
    assert.ok((await list('&category=data')).items.every((i) => i.category === 'data'))
    const byQ = await list('&q=ghost')
    assert.ok(byQ.items.length === 1 && byQ.items[0].actorEmail === 'ghost@nowhere.co')

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    assert.ok((await list(`&from=${today}&to=${today}`)).total >= 5)
    assert.equal((await list('&from=2000-01-01&to=2000-01-02')).total, 0)
  })

  it('2FA: ยืนยันไม่สำเร็จและสำเร็จถูกบันทึก; เปิด/ปิด/รีเซ็ตบันทึกโดยไม่เก็บรหัส', async () => {
    const PW = 'Admin-New-Pass-1'
    const setup = json(await call('POST', '/auth/2fa/setup', admin, { password: PW }))
    const code = codeAtStep(setup.secret, stepAt(Date.now()))
    const en = await call('POST', '/auth/2fa/enable', admin, { pending: setup.pending, code })
    assert.equal(en.statusCode, 200)
    const h = { Cookie: `ev_session=${en.cookies.find((c) => c.name === 'ev_session')!.value}` }
    admin = h // เปิด 2FA แล้ว session เดิมหลุด ใช้ cookie ใหม่
    const ch = json(await call('POST', '/auth/login', {}, { email: 'admin@evmonitor.co.th', password: PW })).challenge
    assert.equal((await call('POST', '/auth/login/2fa', {}, { challenge: ch, code: '000000' })).statusCode, 401)
    assert.equal((await rowsOf('auth.2fa_failed'))[0].actorEmail, 'admin@evmonitor.co.th')
    assert.equal((await rowsOf('POST /auth/2fa/enable')).length, 1)
    const text = JSON.stringify((await t.pool.query('select * from audit_log')).rows)
    assert.ok(!text.includes(setup.secret) && !text.includes(setup.pending) && !text.includes(code) && !text.includes(ch))
    // รีเซ็ตโดยผู้ดูแล (ที่นี่ตัวเอง → ปิดผ่านฐานข้อมูล) ไม่เกี่ยว — ทดสอบสวิตช์นโยบายแทน
    assert.equal((await call('PUT', '/security/2fa-policy', h, { required: true })).statusCode, 200)
    const pol = (await rowsOf('PUT /security/2fa-policy'))[0]
    assert.equal(pol.label, 'ตั้งค่าการบังคับ 2FA ของผู้ดูแล')
    assert.deepEqual(pol.detail.fields, ['required'])
  })

  it('อ่านได้เฉพาะ admin: ผู้จัดการ 403, ไม่ล็อกอิน 401, ไม่ส่ง page ก็ได้ซองเสมอ', async () => {
    const mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
    assert.equal((await call('GET', '/audit-log?page=1', mgr)).statusCode, 403)
    assert.equal((await call('GET', '/audit-log?page=1', {})).statusCode, 401)
  })

  it('บันทึกแก้ไขไม่ได้ (trigger) และงานล้างลบเฉพาะที่เก่ากว่ากำหนด', async () => {
    await assert.rejects(() => t.pool.query(`update audit_log set action = 'x'`), /แก้ไขไม่ได้/)
    await t.pool.query(`insert into audit_log (action, at) values ('old.event', now() - interval '400 days'), ('mid.event', now() - interval '100 days')`)
    const n = await purgeAudit(t.pool, 365)
    assert.equal(n, 1)
    const left = (await t.pool.query(`select action from audit_log where action in ('old.event','mid.event')`)).rows.map((r) => r.action)
    assert.deepEqual(left, ['mid.event'])
  })
})

describe('audit log กับการลบผู้ใช้', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('ลบผู้ใช้ได้ แถวบันทึกยังอยู่ (เก็บอีเมลไว้ actor_id ถูกเคลียร์) แต่แก้คอลัมน์อื่นไม่ได้', async () => {
    const admin = await login(t.app)
    const inv = json(await t.app.inject({ method: 'POST', url: `${P}/users/invite`, headers: admin, payload: { email: 'gone@company.co.th', role: 'viewer' } }))
    // ผู้ใช้ที่เคยเป็น "ผู้ทำ": ล็อกอินแล้วลบบัญชีทิ้ง
    const mgr = await login(t.app, 'wanna@company.co.th', 'demo1234')
    await t.app.inject({ method: 'POST', url: `${P}/auth/change-password`, headers: mgr, payload: { currentPassword: 'demo1234', newPassword: 'Wanna-New-Pass1' } })
    const uid = (await t.pool.query(`select id from users where email = 'wanna@company.co.th'`)).rows[0].id
    assert.ok((await t.pool.query('select 1 from audit_log where actor_id = $1', [uid])).rowCount! >= 1)
    await t.pool.query('delete from users where id = $1', [uid])
    const r = (await t.pool.query(`select actor_id, actor_email from audit_log where actor_email = 'wanna@company.co.th' limit 1`)).rows[0]
    assert.equal(r.actor_id, null)
    assert.equal(r.actor_email, 'wanna@company.co.th')
    await assert.rejects(() => t.pool.query(`update audit_log set actor_email = 'x' where actor_email = 'wanna@company.co.th'`), /แก้ไขไม่ได้/)
    void inv
  })
})
