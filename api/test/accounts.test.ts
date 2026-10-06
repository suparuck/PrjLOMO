import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAdmin, findDefaultPasswordUsers, retireDefaultPasswordUsers, setPassword } from '../src/services/accounts'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('บัญชีตั้งต้น: ผู้ดูแลคนแรก / รหัสผ่านเดโม', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })
  const loginStatus = async (email: string, password: string) =>
    (await t.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: { email, password } })).statusCode

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('ห้ามตั้งรหัสผ่านเป็นรหัสตั้งต้นของระบบ (เปลี่ยนรหัส/ตอบรับคำเชิญ/create-admin/set-password) — ข้อความบอกเหตุผลใต้ช่อง', async () => {
    const r = await call('POST', '/auth/change-password', { currentPassword: 'demo1234', newPassword: 'demo1234' })
    assert.equal(r.statusCode, 422)
    assert.match(json(r).error.fields.newPassword, /รหัสตั้งต้น|ซ้ำกับรหัสผ่านปัจจุบัน/)
    const inv = json(await call('POST', '/users/invite', { email: 'newbie@company.co.th', role: 'viewer' }))
    const acc = await call('POST', '/auth/invite/accept', { token: inv.inviteToken, password: 'demo1234' }, {})
    assert.equal(acc.statusCode, 422)
    assert.match(json(acc).error.fields.password, /รหัสตั้งต้น/)
  })

  it('GET /security/status: เฉพาะ admin, แสดงบัญชีเดโมที่ยังใช้รหัสตั้งต้น (ไม่รั่วรหัส/hash) และหายไปเมื่อเจ้าของเปลี่ยนรหัส', async () => {
    assert.equal((await call('GET', '/security/status', undefined, {})).statusCode, 401)
    const before = json(await call('GET', '/security/status'))
    const emails = before.defaultPasswordUsers.map((u: { email: string }) => u.email).sort()
    assert.deepEqual(emails, ['admin@evmonitor.co.th', 'prasit@company.co.th', 'wanna@company.co.th'])
    assert.ok(!JSON.stringify(before).match(/demo1234|password_hash|\$2[aby]\$/))

    // ผู้จัดการ (ไม่ใช่ admin) เรียกไม่ได้
    const mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
    assert.equal((await call('GET', '/security/status', undefined, mgr)).statusCode, 403)

    // prasit เปลี่ยนรหัสแล้ว → ไม่อยู่ในรายการ
    assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'demo1234', newPassword: 'Prasit-Real1' }, mgr)).statusCode, 200)
    const after = json(await call('GET', '/security/status')).defaultPasswordUsers.map((u: { email: string }) => u.email)
    assert.ok(!after.includes('prasit@company.co.th') && after.length === 2)
  })

  it('retire-defaults: ปฏิเสธถ้าจะไม่เหลือ admin ที่ใช้งานอยู่ (ไม่เปลี่ยนอะไรเลย)', async () => {
    // ตอนนี้ admin ที่ใช้งานอยู่มีคนเดียวคือ admin@evmonitor.co.th ซึ่งยังใช้รหัสตั้งต้น
    await assert.rejects(() => retireDefaultPasswordUsers(t.pool), /ไม่เหลือผู้ดูแล/)
    const n = (await t.pool.query(`select count(*)::int as n from users where status = 'active'`)).rows[0].n
    assert.equal(n, 3, 'ทุกบัญชียังใช้งานอยู่')
  })

  it('create-admin: สร้างแล้วเข้าสู่ระบบได้ · อีเมลซ้ำ 409 · รหัสอ่อน/รหัสตั้งต้น/อีเมลผิดรูปแบบ 422', async () => {
    const a = await createAdmin(t.pool, { email: ' Owner@Company.co.th ', name: '  เจ้าของ  ระบบ ', password: 'Owner-Pass-1' })
    assert.equal(a.email, 'owner@company.co.th')
    assert.equal(a.name, 'เจ้าของ ระบบ')
    assert.equal(await loginStatus('owner@company.co.th', 'Owner-Pass-1'), 200)
    const row = (await t.pool.query(`select role::text as role, status::text as status from users where email = 'owner@company.co.th'`)).rows[0]
    assert.deepEqual(row, { role: 'admin', status: 'active' })

    await assert.rejects(() => createAdmin(t.pool, { email: 'OWNER@company.co.th', name: 'ซ้ำ', password: 'Owner-Pass-1' }), /อยู่ในระบบแล้ว/)
    await assert.rejects(() => createAdmin(t.pool, { email: 'x@company.co.th', name: 'x ok', password: 'demo1234' }), (e: { fields?: Record<string, string> }) => /รหัสตั้งต้น/.test(e.fields?.password ?? ''))
    await assert.rejects(() => createAdmin(t.pool, { email: 'x@company.co.th', name: 'x ok', password: 'short1' }), /8 ตัวอักษร/)
    await assert.rejects(() => createAdmin(t.pool, { email: 'not-an-email', name: 'x ok', password: 'Owner-Pass-2' }), /รูปแบบอีเมล/)
    assert.equal((await t.pool.query(`select count(*)::int as n from users where email = 'x@company.co.th'`)).rows[0].n, 0)
  })

  it('set-password: ทุก session เดิมหลุด, รหัสเดิมใช้ไม่ได้, ลิงก์รีเซ็ตที่ค้างอยู่ดับ, บัญชีที่ไม่มีในระบบ = 404', async () => {
    const old = await login(t.app, 'owner@company.co.th', 'Owner-Pass-1')
    const rl = json(await call('POST', `/users/${(await t.pool.query(`select id from users where email='owner@company.co.th'`)).rows[0].id}/reset-link`, {}))
    await setPassword(t.pool, { email: 'owner@company.co.th', password: 'Owner-Pass-NEW1' })
    assert.equal((await call('GET', '/auth/me', undefined, old)).statusCode, 401)
    assert.equal(await loginStatus('owner@company.co.th', 'Owner-Pass-1'), 401)
    assert.equal(await loginStatus('owner@company.co.th', 'Owner-Pass-NEW1'), 200)
    assert.equal((await call('POST', '/auth/reset/lookup', { token: rl.resetToken }, {})).statusCode, 404)
    await assert.rejects(() => setPassword(t.pool, { email: 'ghost@company.co.th', password: 'Whatever-1x' }), /ไม่พบ/)
    await assert.rejects(() => setPassword(t.pool, { email: 'owner@company.co.th', password: 'demo1234' }), /รหัสตั้งต้น/)
  })

  it('retire-defaults: หลังมี admin จริง ปิดเฉพาะบัญชีที่ยังใช้รหัสตั้งต้น (ไม่แตะบัญชีที่เปลี่ยนรหัสแล้ว) และรันซ้ำได้', async () => {
    const closed = await retireDefaultPasswordUsers(t.pool)
    assert.deepEqual(closed.map((u) => u.email).sort(), ['admin@evmonitor.co.th', 'wanna@company.co.th'])
    const st = Object.fromEntries((await t.pool.query(`select email, status::text as status from users`)).rows.map((r) => [r.email, r.status]))
    assert.equal(st['admin@evmonitor.co.th'], 'disabled')
    assert.equal(st['wanna@company.co.th'], 'disabled')
    assert.equal(st['prasit@company.co.th'], 'active', 'เปลี่ยนรหัสแล้ว — ไม่ปิด')
    assert.equal(st['owner@company.co.th'], 'active')
    assert.equal(await loginStatus('admin@evmonitor.co.th', 'demo1234'), 401, 'เข้าด้วยรหัสเดโมไม่ได้อีก')
    assert.equal((await call('GET', '/auth/me', undefined, admin)).statusCode, 401, 'session เดิมของบัญชีเดโมหลุด')
    assert.deepEqual(await retireDefaultPasswordUsers(t.pool), [])
    assert.deepEqual(await findDefaultPasswordUsers(t.pool), [])
  })
})
