import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

describe('ตอบรับคำเชิญ', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: headers ?? admin, payload: payload as any })
  const invite = async (email: string, role = 'manager') => {
    const res = await call('POST', '/users/invite', { email, role })
    assert.equal(res.statusCode, 201, res.body)
    return json(res) as { id: string; inviteToken: string; inviteExpiresAt: string; status: string; email: string }
  }
  const accept = (token: string, password: string, name?: string) =>
    t.app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token, password, name } })
  const lookup = (token: string) => t.app.inject({ method: 'POST', url: '/api/v1/auth/invite/lookup', payload: { token } })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('เชิญแล้วได้โทเคนครั้งเดียว: ฐานข้อมูลเก็บเฉพาะ hash และรายชื่อผู้ใช้ไม่รั่วโทเคน', async () => {
    const inv = await invite('a1@company.co.th')
    assert.ok(inv.inviteToken.length >= 40)
    assert.equal(inv.status, 'invited')
    const days = (new Date(inv.inviteExpiresAt).getTime() - Date.now()) / 86_400_000
    assert.ok(days > 6.9 && days <= 7, 'อายุ 7 วัน')

    const row = (await t.pool.query(`select invite_token_hash from users where id = $1`, [inv.id])).rows[0]
    assert.ok(row.invite_token_hash !== inv.inviteToken && row.invite_token_hash.length === 64, 'เก็บเป็น sha256')
    const list = (await call('GET', '/users')).body
    assert.ok(!list.includes(inv.inviteToken) && !list.includes(row.invite_token_hash), 'รายการไม่แสดงโทเคน/hash')
  })

  it('ตรวจลิงก์: ถูกต้อง → อีเมลและบทบาท, โทเคนมั่ว → 404, หมดอายุ → 410', async () => {
    const inv = await invite('a2@company.co.th', 'viewer')
    const ok = await lookup(inv.inviteToken)
    assert.equal(ok.statusCode, 200)
    assert.deepEqual(json(ok), { email: 'a2@company.co.th', name: 'a2', role: 'viewer' })

    assert.equal((await lookup('x'.repeat(43))).statusCode, 404)
    await t.pool.query(`update users set invite_expires_at = now() - interval '1 minute' where id = $1`, [inv.id])
    const expired = await lookup(inv.inviteToken)
    assert.equal(expired.statusCode, 410)
    assert.match(json(expired).error.message, /หมดอายุ/)
    assert.equal((await accept(inv.inviteToken, 'Passw0rdOK')).statusCode, 410, 'ตอบรับลิงก์หมดอายุไม่ได้')
    assert.equal((await t.pool.query(`select status from users where id = $1`, [inv.id])).rows[0].status, 'invited')
  })

  it('รหัสผ่าน/ชื่อไม่ผ่านกฎ → 422 และโทเคนยังใช้ได้', async () => {
    const inv = await invite('a3@company.co.th')
    for (const pw of ['short1', 'onlyletters', '12345678', 'a'.repeat(129) + '1']) {
      const res = await accept(inv.inviteToken, pw)
      assert.ok([400, 422].includes(res.statusCode), `${pw.slice(0, 12)} → ${res.statusCode}`)
    }
    assert.match(json(await accept(inv.inviteToken, 'short1')).error.fields.password, /8 ตัวอักษร/)
    assert.match(json(await accept(inv.inviteToken, 'onlyletters')).error.fields.password, /ตัวเลข/)
    assert.ok(json(await accept(inv.inviteToken, 'Passw0rdOK', 'ก')).error.fields.name)
    assert.equal((await lookup(inv.inviteToken)).statusCode, 200, 'ยังไม่เสียโทเคน')
  })

  it('ตอบรับสำเร็จ: เปิดใช้บัญชี ตั้งชื่อ เข้าสู่ระบบทันที โทเคนใช้ซ้ำไม่ได้ และล็อกอินด้วยรหัสใหม่ได้', async () => {
    const inv = await invite('a4@company.co.th', 'manager')
    const res = await accept(inv.inviteToken, 'Passw0rdOK', '  สมศรี   ใจดี ')
    assert.equal(res.statusCode, 200, res.body)
    assert.deepEqual([json(res).user.email, json(res).user.name, json(res).user.role], ['a4@company.co.th', 'สมศรี ใจดี', 'manager'])
    const cookie = res.cookies.find((c) => c.name === 'ev_session')!
    assert.equal(cookie.httpOnly, true)

    const me = await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { Cookie: `ev_session=${cookie.value}` } })
    assert.equal(json(me).user.email, 'a4@company.co.th')

    const row = (await t.pool.query(`select status, password_hash, invite_token_hash, invite_expires_at, last_login_at from users where id = $1`, [inv.id])).rows[0]
    assert.equal(row.status, 'active')
    assert.ok(row.password_hash.startsWith('$2') && !row.password_hash.includes('Passw0rdOK'), 'เก็บเป็น bcrypt')
    assert.deepEqual([row.invite_token_hash, row.invite_expires_at], [null, null], 'ล้างโทเคน')
    assert.ok(row.last_login_at)

    assert.equal((await accept(inv.inviteToken, 'Another1Pass')).statusCode, 404, 'โทเคนใช้ได้ครั้งเดียว')
    assert.equal((await lookup(inv.inviteToken)).statusCode, 404)

    await login(t.app, 'a4@company.co.th', 'Passw0rdOK')
    assert.equal((await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a4@company.co.th', password: 'wrong' } })).statusCode, 401)
  })

  it('บทบาทตามที่เชิญถูกบังคับจริงหลังตอบรับ (viewer ดูรถไม่ได้)', async () => {
    const inv = await invite('a5@company.co.th', 'viewer')
    const res = await accept(inv.inviteToken, 'Passw0rdOK')
    const h = { Cookie: `ev_session=${res.cookies.find((c) => c.name === 'ev_session')!.value}` }
    assert.equal((await call('GET', '/vehicles', undefined, h)).statusCode, 403)
    assert.equal((await call('GET', '/reports', undefined, h)).statusCode, 200)
  })

  it('สร้างลิงก์ใหม่: ลิงก์เก่าใช้ไม่ได้ทันที, ผู้ใช้ที่ตอบรับแล้ว → 409, ไม่มีผู้ใช้ → 404, ไม่ใช่ admin → 403', async () => {
    const inv = await invite('a6@company.co.th')
    const re = await call('POST', `/users/${inv.id}/invite-link`)
    assert.equal(re.statusCode, 200, re.body)
    const fresh = json(re).inviteToken as string
    assert.notEqual(fresh, inv.inviteToken)
    assert.equal((await lookup(inv.inviteToken)).statusCode, 404, 'ลิงก์เก่าใช้ไม่ได้')
    assert.equal((await lookup(fresh)).statusCode, 200)

    const adminUser = json(await call('GET', '/users')).find((u: any) => u.email === 'admin@evmonitor.co.th')
    assert.equal((await call('POST', `/users/${adminUser.id}/invite-link`)).statusCode, 409)
    assert.equal((await call('POST', '/users/00000000-0000-4000-8000-000000000000/invite-link')).statusCode, 404)
    const manager = await login(t.app, 'prasit@company.co.th')
    assert.equal((await call('POST', `/users/${inv.id}/invite-link`, undefined, manager)).statusCode, 403)
  })

  it('ยกเลิกคำเชิญ: ลบแล้วลิงก์ใช้ไม่ได้, ลบผู้ใช้ที่ใช้งานแล้วไม่ได้ (409), ไม่ใช่ admin → 403', async () => {
    const inv = await invite('a7@company.co.th')
    const manager = await login(t.app, 'prasit@company.co.th')
    assert.equal((await call('DELETE', `/users/${inv.id}`, undefined, manager)).statusCode, 403)
    assert.equal((await call('DELETE', `/users/${inv.id}`)).statusCode, 200)
    assert.equal((await lookup(inv.inviteToken)).statusCode, 404)
    assert.equal((await call('DELETE', `/users/${inv.id}`)).statusCode, 404, 'ลบซ้ำ')

    const adminUser = json(await call('GET', '/users')).find((u: any) => u.email === 'admin@evmonitor.co.th')
    assert.equal((await call('DELETE', `/users/${adminUser.id}`)).statusCode, 409)
    // เชิญอีเมลเดิมซ้ำได้หลังยกเลิก
    await invite('a7@company.co.th')
  })

  it('ผู้ถูกเชิญที่ยังไม่ตอบรับล็อกอินไม่ได้ แม้เดารหัสผ่านใด ๆ', async () => {
    await invite('a8@company.co.th')
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a8@company.co.th', password: '' + 'x' } })
    assert.equal(res.statusCode, 401)
  })
})
