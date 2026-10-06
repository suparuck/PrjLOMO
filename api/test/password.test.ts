import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { json, login, startApp } from './helpers'

const P = '/api/v1'

describe('เปลี่ยนรหัสผ่าน / ลืมรหัสผ่าน', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>

  const post = (url: string, payload: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method: 'POST', url: `${P}${url}`, headers, payload: payload as any })
  const me = (h: Record<string, string>) => t.app.inject({ method: 'GET', url: `${P}/auth/me`, headers: h })
  const tokenFromMail = (m: { text: string }) => m.text.match(/\/reset-password\/([\w-]+)/)![1]
  const mkUser = async (email: string, pw = 'Passw0rdOK') => {
    const inv = json(await post('/users/invite', { email, role: 'viewer' }, admin))
    assert.equal((await post('/auth/invite/accept', { token: inv.inviteToken, password: pw })).statusCode, 200)
    return inv.id as string
  }

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('เปลี่ยนรหัสผ่าน: ต้องล็อกอิน, รหัสปัจจุบันผิด → 422 (ไม่ใช่ 401), ผ่านแล้ว session เดิมทุกเครื่องหลุด', async () => {
    await mkUser('c1@company.co.th')
    const a = await login(t.app, 'c1@company.co.th', 'Passw0rdOK')
    const b = await login(t.app, 'c1@company.co.th', 'Passw0rdOK')

    assert.equal((await post('/auth/change-password', { currentPassword: 'x', newPassword: 'NewPassw0rd1' })).statusCode, 401)
    const wrong = await post('/auth/change-password', { currentPassword: 'Wrong1234', newPassword: 'NewPassw0rd1' }, a)
    assert.equal(wrong.statusCode, 422)
    assert.ok(json(wrong).error.fields.currentPassword)
    for (const pw of ['short1', 'onlyletters', '12345678']) {
      const r = await post('/auth/change-password', { currentPassword: 'Passw0rdOK', newPassword: pw }, a)
      assert.equal(r.statusCode, 422, pw)
      assert.ok(json(r).error.fields.newPassword, pw)
    }
    assert.equal((await post('/auth/change-password', { currentPassword: 'Passw0rdOK', newPassword: 'Passw0rdOK' }, a)).statusCode, 422, 'ซ้ำรหัสเดิม')

    const ok = await post('/auth/change-password', { currentPassword: 'Passw0rdOK', newPassword: 'NewPassw0rd1' }, a)
    assert.equal(ok.statusCode, 200, ok.body)
    const fresh = ok.cookies.find((c) => c.name === 'ev_session')!
    assert.equal((await me(b)).statusCode, 401, 'session เครื่องอื่นถูกเพิกถอน')
    assert.equal((await me(a)).statusCode, 401, 'token เดิมของเครื่องนี้ก็ใช้ไม่ได้')
    assert.equal((await me({ Cookie: `ev_session=${fresh.value}` })).statusCode, 200, 'cookie ใหม่ใช้ได้')
    assert.equal((await post('/auth/login', { email: 'c1@company.co.th', password: 'Passw0rdOK' })).statusCode, 401)
    assert.equal((await post('/auth/login', { email: 'c1@company.co.th', password: 'NewPassw0rd1' })).statusCode, 200)
  })

  it('ลืมรหัสผ่าน: ตอบเหมือนกันทั้งอีเมลที่มี/ไม่มี, ส่งเมลเฉพาะบัญชีที่ใช้งานอยู่', async () => {
    await mkUser('f1@company.co.th')
    await post('/users/invite', { email: 'pending@company.co.th', role: 'viewer' }, admin)
    t.mail.length = 0
    const known = await post('/auth/forgot-password', { email: ' F1@company.co.th ' })
    const unknown = await post('/auth/forgot-password', { email: 'nobody@company.co.th' })
    const pending = await post('/auth/forgot-password', { email: 'pending@company.co.th' })
    await t.app.mailIdle()
    assert.equal(known.statusCode, 200)
    assert.equal(known.body, unknown.body)
    assert.equal(known.body, pending.body)
    assert.equal(t.mail.length, 1)
    assert.equal(t.mail[0].to, 'f1@company.co.th')
    assert.match(t.mail[0].text, /http:\/\/localhost:3000\/reset-password\//)
    const tok = tokenFromMail(t.mail[0])
    const row = (await t.pool.query(`select token_hash, requested_by from password_resets order by created_at desc limit 1`)).rows[0]
    assert.ok(row.token_hash !== tok && row.token_hash.length === 64, 'เก็บเป็น sha256')
    assert.equal(row.requested_by, 'self')
  })

  it('รีเซ็ตด้วยลิงก์: ใช้ได้ครั้งเดียว, session เดิมหลุด, รหัสเดิมใช้ไม่ได้', async () => {
    await mkUser('r1@company.co.th')
    const old = await login(t.app, 'r1@company.co.th', 'Passw0rdOK')
    t.mail.length = 0
    await post('/auth/forgot-password', { email: 'r1@company.co.th' })
    await t.app.mailIdle()
    const token = tokenFromMail(t.mail[0])

    const look = await post('/auth/reset/lookup', { token })
    assert.equal(look.statusCode, 200)
    assert.equal(json(look).email, 'r1@company.co.th')

    assert.equal((await post('/auth/reset/accept', { token, password: 'short1' })).statusCode, 422)
    assert.equal((await post('/auth/reset/lookup', { token })).statusCode, 200, 'รหัสไม่ผ่านกฎ → ลิงก์ยังไม่ถูกใช้')

    assert.equal((await post('/auth/reset/accept', { token, password: 'Reset0kPass' })).statusCode, 200)
    assert.equal((await post('/auth/reset/accept', { token, password: 'Another0kPass' })).statusCode, 404, 'ใช้ซ้ำไม่ได้')
    assert.equal((await post('/auth/reset/lookup', { token })).statusCode, 404)
    assert.equal((await me(old)).statusCode, 401)
    assert.equal((await post('/auth/login', { email: 'r1@company.co.th', password: 'Passw0rdOK' })).statusCode, 401)
    assert.equal((await post('/auth/login', { email: 'r1@company.co.th', password: 'Reset0kPass' })).statusCode, 200)
  })

  it('ลิงก์รีเซ็ต: มั่ว → 404, หมดอายุ → 410, ใช้ลิงก์หนึ่งแล้วลิงก์อื่นของผู้ใช้เดียวกันดับ', async () => {
    await mkUser('r2@company.co.th')
    assert.equal((await post('/auth/reset/lookup', { token: 'x'.repeat(43) })).statusCode, 404)

    t.mail.length = 0
    await post('/auth/forgot-password', { email: 'r2@company.co.th' })
    await post('/auth/forgot-password', { email: 'r2@company.co.th' })
    await t.app.mailIdle()
    assert.equal(t.mail.length, 2)
    const [t1, t2] = t.mail.map(tokenFromMail)

    await t.pool.query(`update password_resets set expires_at = now() - interval '1 minute' where token_hash = encode(sha256($1::bytea), 'hex')`, [t1])
    const exp = await post('/auth/reset/lookup', { token: t1 })
    assert.equal(exp.statusCode, 410)
    assert.match(json(exp).error.message, /หมดอายุ/)
    assert.equal((await post('/auth/reset/accept', { token: t1, password: 'Reset0kPass' })).statusCode, 410)

    // ลิงก์ที่สามยังไม่หมดอายุ — ใช้ t2 แล้ว t3 ต้องดับ
    await post('/auth/forgot-password', { email: 'r2@company.co.th' })
    await t.app.mailIdle()
    const t3 = tokenFromMail(t.mail[2])
    assert.equal((await post('/auth/reset/accept', { token: t2, password: 'Reset0kPass' })).statusCode, 200)
    assert.equal((await post('/auth/reset/lookup', { token: t3 })).statusCode, 404)
  })

  it('จำกัดการขอซ้ำ: ผู้ใช้เดียวได้ลิงก์ไม่เกิน 3 ใน 15 นาที', async () => {
    await mkUser('s1@company.co.th')
    t.mail.length = 0
    for (let i = 0; i < 5; i++) await post('/auth/forgot-password', { email: 's1@company.co.th' })
    await t.app.mailIdle()
    assert.equal(t.mail.length, 3)
  })

  it('ผู้ดูแลสร้างลิงก์รีเซ็ตให้: เฉพาะ admin, เฉพาะบัญชีที่ใช้งานแล้ว, ลิงก์เก่าดับ', async () => {
    const id = await mkUser('a9@company.co.th')
    const viewer = await login(t.app, 'a9@company.co.th', 'Passw0rdOK')
    assert.equal((await post(`/users/${id}/reset-link`, {}, viewer)).statusCode, 403)
    assert.equal((await post(`/users/${id}/reset-link`, {})).statusCode, 401)

    const r1 = json(await post(`/users/${id}/reset-link`, {}, admin))
    const r2 = json(await post(`/users/${id}/reset-link`, {}, admin))
    assert.ok(r1.resetToken.length >= 40 && r1.email === 'a9@company.co.th' && r1.expiresAt)
    assert.equal((await post('/auth/reset/lookup', { token: r1.resetToken })).statusCode, 404, 'ลิงก์เก่าดับ')
    assert.equal((await post('/auth/reset/lookup', { token: r2.resetToken })).statusCode, 200)
    assert.equal((await t.pool.query(`select requested_by from password_resets where user_id = $1 order by created_at desc limit 1`, [id])).rows[0].requested_by, 'admin')
    assert.equal((await post('/auth/reset/accept', { token: r2.resetToken, password: 'AdminSet0k1' })).statusCode, 200)

    const pending = json(await post('/users/invite', { email: 'p9@company.co.th', role: 'viewer' }, admin))
    assert.equal((await post(`/users/${pending.id}/reset-link`, {}, admin)).statusCode, 409)
    assert.equal((await post('/users/00000000-0000-4000-8000-000000000000/reset-link', {}, admin)).statusCode, 404)
  })

  it('เปลี่ยนบทบาท/ลบบัญชี มีผลทันที (guard อ่านจากฐานข้อมูล)', async () => {
    const id = await mkUser('g1@company.co.th')
    const h = await login(t.app, 'g1@company.co.th', 'Passw0rdOK')
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/users`, headers: h })).statusCode, 403)
    await t.pool.query(`update users set role = 'manager' where id = $1`, [id])
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/users`, headers: h })).statusCode, 200, 'เลื่อนสิทธิ์มีผลทันที')
    await t.pool.query(`delete from users where id = $1`, [id])
    assert.equal((await me(h)).statusCode, 401, 'บัญชีถูกลบ → 401')
  })

  it('เชิญผู้ใช้: ส่งอีเมลคำเชิญให้อัตโนมัติ (emailed=true) และลิงก์ในอีเมลใช้ตอบรับได้', async () => {
    t.mail.length = 0
    const inv = json(await post('/users/invite', { email: 'mail1@company.co.th', role: 'viewer' }, admin))
    assert.equal(inv.emailed, true)
    assert.equal(t.mail.length, 1)
    assert.equal(t.mail[0].to, 'mail1@company.co.th')
    const tok = t.mail[0].text.match(/\/invite\/([\w-]+)/)![1]
    assert.equal(tok, inv.inviteToken)
    const again = json(await post(`/users/${inv.id}/invite-link`, {}, admin))
    assert.equal(again.emailed, true)
    assert.equal(t.mail.length, 2)
    assert.equal((await post('/auth/invite/accept', { token: again.inviteToken, password: 'Passw0rdOK' })).statusCode, 200)
  })
})
