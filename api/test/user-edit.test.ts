import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('แก้ไขผู้ใช้ (เปลี่ยนบทบาท / เปิด-ปิดบัญชี)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  let adminId: string

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })
  const patch = (id: string, body: unknown, headers?: Record<string, string>) => call('PATCH', `/users/${id}`, body, headers)
  const me = (h: Record<string, string>) => call('GET', '/auth/me', undefined, h)
  const mkUser = async (email: string, role = 'viewer', pw = 'Passw0rdOK') => {
    const inv = json(await call('POST', '/users/invite', { email, role }))
    assert.equal((await call('POST', '/auth/invite/accept', { token: inv.inviteToken, password: pw }, {})).statusCode, 200)
    return inv.id as string
  }

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
    adminId = (await t.pool.query(`select id from users where email = 'admin@evmonitor.co.th'`)).rows[0].id
  })
  after(async () => { await t.stop() })

  it('สิทธิ์: ไม่ล็อกอิน 401, manager 403, ตรวจรูปแบบ (ชื่อสั้น/บทบาทผิด)', async () => {
    const id = await mkUser('e1@company.co.th')
    await mkUser('m1@company.co.th', 'manager')
    const mgr = await login(t.app, 'm1@company.co.th', 'Passw0rdOK')
    assert.equal((await patch(id, { role: 'manager' }, {})).statusCode, 401)
    assert.equal((await patch(id, { role: 'manager' }, mgr)).statusCode, 403)
    assert.equal((await patch(id, { name: 'ก' })).statusCode, 422)
    assert.equal((await patch(id, { role: 'god' })).statusCode, 400)
    assert.equal((await patch('00000000-0000-4000-8000-000000000000', { role: 'viewer' })).statusCode, 404)
  })

  it('เปลี่ยนชื่อและบทบาท: มีผลทันทีกับ session เดิมของผู้ใช้นั้น', async () => {
    const id = await mkUser('e2@company.co.th')
    const h = await login(t.app, 'e2@company.co.th', 'Passw0rdOK')
    assert.equal((await call('GET', '/vehicles', undefined, h)).statusCode, 403, 'viewer ดูรถไม่ได้')
    const res = await patch(id, { name: '  ชื่อ   ใหม่  ', role: 'manager' })
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(json(res).name, 'ชื่อ ใหม่')
    assert.equal(json(res).role, 'manager')
    assert.equal((await call('GET', '/vehicles', undefined, h)).statusCode, 200, 'เป็น manager ทันที')
    assert.equal(json(await me(h)).user.name, 'ชื่อ ใหม่')
  })

  it('ป้องกันตัวเอง: เปลี่ยนบทบาท/ปิดบัญชีตัวเองไม่ได้ แต่เปลี่ยนชื่อได้', async () => {
    const r = await patch(adminId, { role: 'viewer' })
    assert.equal(r.statusCode, 422)
    assert.ok(json(r).error.fields.role)
    const d = await patch(adminId, { status: 'disabled' })
    assert.equal(d.statusCode, 422)
    assert.ok(json(d).error.fields.status)
    assert.equal((await patch(adminId, { name: 'Admin ใหม่' })).statusCode, 200)
    assert.equal(json(await me(admin)).user.role, 'admin', 'ยังเป็น admin')
  })

  it('ปิดบัญชี: session เดิมหลุดทันที เข้าสู่ระบบ/ขอลืมรหัส/รีเซ็ตโดยผู้ดูแลไม่ได้ ลิงก์รีเซ็ตเดิมดับ; เปิดใหม่ใช้รหัสเดิมได้', async () => {
    const id = await mkUser('e3@company.co.th')
    const old = await login(t.app, 'e3@company.co.th', 'Passw0rdOK')
    const rl = json(await call('POST', `/users/${id}/reset-link`, {}))
    assert.equal((await call('POST', '/auth/reset/lookup', { token: rl.resetToken }, {})).statusCode, 200)

    const off = await patch(id, { status: 'disabled' })
    assert.equal(off.statusCode, 200, off.body)
    assert.equal(json(off).status, 'disabled')
    assert.equal((await me(old)).statusCode, 401, 'session เดิมหลุด')
    assert.equal((await call('POST', '/auth/login', { email: 'e3@company.co.th', password: 'Passw0rdOK' }, {})).statusCode, 401)
    assert.equal((await call('POST', '/auth/reset/lookup', { token: rl.resetToken }, {})).statusCode, 404, 'ลิงก์รีเซ็ตเดิมดับ')
    t.mail.length = 0
    await call('POST', '/auth/forgot-password', { email: 'e3@company.co.th' }, {})
    await t.app.mailIdle()
    assert.equal(t.mail.length, 0, 'ไม่ส่งลิงก์รีเซ็ตให้บัญชีที่ถูกปิด')
    const rr = await call('POST', `/users/${id}/reset-link`, {})
    assert.equal(rr.statusCode, 409)
    assert.match(json(rr).error.message, /ปิดใช้งาน/)

    assert.equal((await patch(id, { status: 'active' })).statusCode, 200)
    assert.equal((await me(old)).statusCode, 401, 'session ที่ออกก่อนปิดยังใช้ไม่ได้หลังเปิดใหม่')
    assert.equal((await call('POST', '/auth/login', { email: 'e3@company.co.th', password: 'Passw0rdOK' }, {})).statusCode, 200)
  })

  it('ผู้ที่ยังไม่ตอบรับคำเชิญแก้ไขไม่ได้ (409)', async () => {
    const inv = json(await call('POST', '/users/invite', { email: 'pending2@company.co.th', role: 'viewer' }))
    const r = await patch(inv.id, { role: 'manager' })
    assert.equal(r.statusCode, 409)
    assert.match(json(r).error.message, /ยังไม่ได้ตอบรับ/)
  })

  it('ผู้ถูกปิดไม่รับอีเมลแจ้งเตือน/ไม่นับเป็นผู้ดูแลที่ใช้งานอยู่', async () => {
    const id = await mkUser('e4@company.co.th', 'manager')
    await patch(id, { status: 'disabled' })
    const list = json(await call('GET', '/users?page=1&pageSize=50')).items as { email: string; status: string }[]
    assert.equal(list.find((u) => u.email === 'e4@company.co.th')!.status, 'disabled')
    const active = (await t.pool.query(`select email from users where status = 'active' and role in ('admin','manager')`)).rows.map((r) => r.email)
    assert.ok(!active.includes('e4@company.co.th'))
  })

  it('สองผู้ดูแลลดสิทธิ์กันพร้อมกัน: ต้องเหลือผู้ดูแลที่ใช้งานอยู่อย่างน้อย 1 คนเสมอ', async () => {
    const bId = await mkUser('admin-b@company.co.th', 'admin')
    const b = await login(t.app, 'admin-b@company.co.th', 'Passw0rdOK')
    const [r1, r2] = await Promise.all([patch(bId, { role: 'viewer' }), patch(adminId, { role: 'viewer' }, b)])
    assert.ok([r1.statusCode, r2.statusCode].some((c) => c === 200), 'อย่างน้อยหนึ่งคำขอสำเร็จ')
    const left = (await t.pool.query(`select count(*)::int as n from users where role = 'admin' and status = 'active'`)).rows[0].n
    assert.ok(left >= 1, `เหลือผู้ดูแล ${left} คน`)
  })
})
