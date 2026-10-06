import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signChallenge, verifyChallenge } from '../src/auth'
import { open, seal } from '../src/lib/seal'
import { base32Decode, base32Encode, codeAtStep, generateSecret, otpauthUri, stepAt, verifyTotp } from '../src/lib/totp'
import { json, login, startApp } from './helpers'

const P = '/api/v1'
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('TOTP (RFC 6238) และการปิดผนึก', () => {
  it('ตรงกับตัวอย่างทดสอบของ RFC 6238 (SHA1, 6 หลัก)', () => {
    // RFC ให้รหัส 8 หลัก 94287082 ที่ T=59 → 6 หลักท้ายคือ 287082
    assert.equal(codeAtStep(RFC_SECRET, stepAt(59_000)), '287082')
    assert.equal(codeAtStep(RFC_SECRET, stepAt(1111111109_000)), '081804')
    assert.equal(codeAtStep(RFC_SECRET, stepAt(2000000000_000)), '279037')
  })

  it('base32 เข้ารหัส/ถอดรหัสกลับได้ และไม่รับอักขระแปลก', () => {
    for (const n of [1, 5, 20, 33]) {
      const b = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255))
      assert.deepEqual(base32Decode(base32Encode(b)), b)
    }
    assert.throws(() => base32Decode('abc1'))
    assert.equal(generateSecret().length, 32)
  })

  it('verifyTotp: ยอมคลาด ±1 ช่วง, ไม่ยอมช่วงที่ใช้แล้ว/ไกลกว่า/รูปแบบผิด', () => {
    const now = 1_700_000_000_000
    const s = stepAt(now)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s), now), s)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s - 1), now), s - 1)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s + 1), now), s + 1)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s - 2), now), null)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s + 2), now), null)
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s), now, s), null, 'ช่วงที่ใช้ไปแล้วซ้ำไม่ได้')
    assert.equal(verifyTotp(RFC_SECRET, codeAtStep(RFC_SECRET, s - 1), now, s), null, 'ช่วงเก่ากว่าที่ใช้ไปแล้วก็ไม่ได้')
    assert.equal(verifyTotp(RFC_SECRET, '12345', now), null)
    assert.equal(verifyTotp(RFC_SECRET, 'abcdef', now), null)
    const c = codeAtStep(RFC_SECRET, s)
    assert.equal(verifyTotp(RFC_SECRET, `${c.slice(0, 3)} ${c.slice(3)}`, now), s, 'ยอมช่องว่างระหว่างหลัก')
  })

  it('otpauth URI มี issuer/secret/period', () => {
    const u = otpauthUri('EV Monitor', 'a@b.co', 'ABC234')
    assert.match(u, /^otpauth:\/\/totp\/EV%20Monitor%3Aa%40b\.co\?secret=ABC234&issuer=EV%20Monitor&algorithm=SHA1&digits=6&period=30$/)
  })

  it('seal/open: คืนค่าเดิม, ผิดวัตถุประสงค์/ถูกแก้ → null, แต่ละครั้งต่างกัน', () => {
    const a = seal('ความลับ', 'x')
    assert.equal(open(a, 'x'), 'ความลับ')
    assert.equal(open(a, 'y'), null)
    assert.notEqual(seal('ความลับ', 'x'), a)
    const b = Buffer.from(a, 'base64url')
    b[b.length - 1] ^= 1
    assert.equal(open(b.toString('base64url'), 'x'), null)
    assert.equal(open('', 'x'), null)
    assert.equal(open('zzz', 'x'), null)
  })

  it('โทเคนขั้นที่สอง: ใช้ได้ถูกต้อง, แก้ไข/หมดอายุ/โทเคน session ใช้แทนกันไม่ได้', () => {
    const t = signChallenge('u-1', true)
    assert.deepEqual(verifyChallenge(t), { userId: 'u-1', remember: true })
    const [h, p, s] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 'u-2' })).toString('base64url')
    assert.equal(verifyChallenge(`${h}.${forged}.${s}`), null)
    assert.equal(verifyChallenge('a.b'), null)
    const realNow = Date.now
    Date.now = () => realNow() + 6 * 60_000
    try {
      assert.equal(verifyChallenge(t), null, 'หมดอายุหลัง 5 นาที')
    } finally {
      Date.now = realNow
    }
  })
})

describe('2FA ทั้งขั้นตอน (API)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const post = (url: string, payload: unknown, headers: Record<string, string> = admin) => t.app.inject({ method: 'POST', url: `${P}${url}`, headers, payload: payload as never })
  const get = (url: string, headers: Record<string, string> = admin) => t.app.inject({ method: 'GET', url: `${P}${url}`, headers })
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => ({ Cookie: `ev_session=${res.cookies.find((c) => c.name === 'ev_session')!.value}` })
  const PW = 'demo1234'
  // เทสต์ขยับเวลาทีละช่วงเอง เพื่อไม่ชนกฎ "ช่วงเวลาเดิมใช้ซ้ำไม่ได้" และไม่ต้องรอจริง
  const realNow = Date.now
  let skew = 0
  const codeNow = (secret: string) => codeAtStep(secret, stepAt(Date.now()))
  const nextWindow = () => { skew += 31_000; Date.now = () => realNow() + skew }

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => {
    Date.now = realNow
    await t.stop()
  })

  let secret = ''
  let recovery: string[] = []

  it('บัญชีที่ยังไม่เปิด 2FA ล็อกอินเหมือนเดิม และ /auth/me บอกว่ายังไม่เปิด', async () => {
    const me = json(await get('/auth/me'))
    assert.equal(me.user.twoFactorEnabled, false)
    assert.equal(me.user.recoveryCodesLeft, 0)
  })

  it('setup ต้องยืนยันรหัสผ่านซ้ำ (ผิด → 422) และต้องล็อกอิน (401)', async () => {
    assert.equal((await post('/auth/2fa/setup', { password: PW }, {})).statusCode, 401)
    const bad = await post('/auth/2fa/setup', { password: 'wrong-pass' })
    assert.equal(bad.statusCode, 422)
    assert.ok(json(bad).error.fields.password)
  })

  it('เปิด 2FA: รหัสแรกผิด 422 / โทเคนตั้งค่าของคนอื่นหรือถูกแก้ 410 / ถูกต้องได้รหัสสำรอง 8 ชุด และ session อื่นหลุด', async () => {
    const setup = json(await post('/auth/2fa/setup', { password: PW }))
    secret = setup.secret
    assert.match(setup.uri, /^otpauth:\/\/totp\//)
    assert.match(setup.uri, new RegExp(`secret=${secret}`))
    // ยังไม่เปิดจนกว่าจะยืนยัน
    assert.equal(json(await get('/auth/me')).user.twoFactorEnabled, false)

    assert.equal((await post('/auth/2fa/enable', { pending: setup.pending, code: '000000' })).statusCode, 422)
    assert.equal((await post('/auth/2fa/enable', { pending: setup.pending.slice(0, -3) + 'AAA', code: codeNow(secret) })).statusCode, 410)
    const mgr = await login(t.app, 'prasit@company.co.th', PW)
    assert.equal((await post('/auth/2fa/enable', { pending: setup.pending, code: codeNow(secret) }, mgr)).statusCode, 410, 'โทเคนของ admin ใช้กับบัญชีอื่นไม่ได้')

    const other = await login(t.app) // session อีกเครื่องของ admin
    const ok = await post('/auth/2fa/enable', { pending: setup.pending, code: codeNow(secret) })
    assert.equal(ok.statusCode, 200)
    recovery = json(ok).recoveryCodes
    assert.equal(recovery.length, 8)
    assert.ok(recovery.every((c) => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(c)))
    assert.equal(new Set(recovery).size, 8)
    admin = cookieOf(ok) // cookie ใหม่ของเครื่องที่เปิด 2FA
    assert.equal((await get('/auth/me', admin)).statusCode, 200)
    assert.equal(json(await get('/auth/me', admin)).user.twoFactorEnabled, true)
    assert.equal(json(await get('/auth/me', admin)).user.recoveryCodesLeft, 8)
    assert.equal((await get('/auth/me', other)).statusCode, 401, 'session เครื่องอื่นถูกเพิกถอน')
    // ฐานข้อมูลไม่เก็บความลับ/รหัสสำรองแบบอ่านได้
    const row = (await t.pool.query(`select totp_secret_enc from users where email = 'admin@evmonitor.co.th'`)).rows[0]
    assert.ok(!row.totp_secret_enc.includes(secret))
    const hashes = (await t.pool.query('select code_hash from user_recovery_codes')).rows.map((r) => r.code_hash)
    assert.ok(recovery.every((c) => !hashes.includes(c) && !hashes.includes(c.replace('-', ''))))
  })

  it('เปิดซ้ำตอนเปิดอยู่แล้ว → 409', async () => {
    assert.equal((await post('/auth/2fa/setup', { password: PW })).statusCode, 409)
  })

  it('ล็อกอินสองขั้น: รหัสผ่านถูก → ได้ challenge ไม่มี cookie และยังไม่บันทึกเวลาเข้าใช้', async () => {
    await t.pool.query(`update users set last_login_at = null where email = 'admin@evmonitor.co.th'`)
    const r = await post('/auth/login', { email: 'admin@evmonitor.co.th', password: PW }, {})
    assert.equal(r.statusCode, 200)
    assert.equal(json(r).twoFactorRequired, true)
    assert.ok(json(r).challenge)
    assert.equal(json(r).user, undefined)
    assert.equal(r.cookies.length, 0)
    assert.equal((await t.pool.query(`select last_login_at from users where email = 'admin@evmonitor.co.th'`)).rows[0].last_login_at, null)
    // challenge ใช้เป็น session ไม่ได้
    assert.equal((await get('/auth/me', { Authorization: `Bearer ${json(r).challenge}` })).statusCode, 401)
  })

  const step1 = async () => json(await post('/auth/login', { email: 'admin@evmonitor.co.th', password: PW }, {})).challenge as string

  it('ขั้นที่สอง: รหัสผิด 401 / challenge เสีย 401 / รหัสถูกได้ cookie และบันทึกเวลาเข้าใช้', async () => {
    const ch = await step1()
    const bad = await post('/auth/login/2fa', { challenge: ch, code: '123456' }, {})
    assert.equal(bad.statusCode, 401)
    assert.equal(bad.cookies.length, 0)
    assert.equal((await post('/auth/login/2fa', { challenge: 'x.y.z', code: codeNow(secret) }, {})).statusCode, 401)
    nextWindow()
    const ok = await post('/auth/login/2fa', { challenge: ch, code: codeNow(secret) }, {})
    assert.equal(ok.statusCode, 200)
    assert.equal(json(ok).user.role, 'admin')
    assert.equal((await get('/auth/me', cookieOf(ok))).statusCode, 200)
    assert.ok((await t.pool.query(`select last_login_at from users where email = 'admin@evmonitor.co.th'`)).rows[0].last_login_at)
  })

  it('เล่นซ้ำรหัสช่วงเดิมไม่ได้ (แม้ส่งซ้ำทันที)', async () => {
    nextWindow()
    const code = codeNow(secret)
    assert.equal((await post('/auth/login/2fa', { challenge: await step1(), code }, {})).statusCode, 200)
    assert.equal((await post('/auth/login/2fa', { challenge: await step1(), code }, {})).statusCode, 401)
    const [a, b] = await Promise.all([step1(), step1()])
    nextWindow()
    const c2 = codeNow(secret)
    const rs = await Promise.all([post('/auth/login/2fa', { challenge: a, code: c2 }, {}), post('/auth/login/2fa', { challenge: b, code: c2 }, {})])
    assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 401], 'ส่งพร้อมกัน สำเร็จได้ครั้งเดียว')
  })

  it('รหัสสำรอง: ใช้เข้าสู่ระบบได้ครั้งเดียว (ไม่สนตัวพิมพ์/ขีด) และนับจำนวนที่เหลือ', async () => {
    const code = recovery[0]
    const loose = code.replace('-', ' ').toLowerCase()
    const ok = await post('/auth/login/2fa', { challenge: await step1(), code: loose }, {})
    assert.equal(ok.statusCode, 200)
    assert.equal((await post('/auth/login/2fa', { challenge: await step1(), code }, {})).statusCode, 401, 'ใช้แล้วใช้อีกไม่ได้')
    assert.equal(json(await get('/auth/me', cookieOf(ok))).user.recoveryCodesLeft, 7)
  })

  it('จำกัดการเดารหัส: ผิดเกิน 10 ครั้งถูกบล็อก (429) แม้ภายหลังกรอกรหัสถูก', async () => {
    const ch = await step1()
    let last = 0
    for (let i = 0; i < 12; i++) last = (await post('/auth/login/2fa', { challenge: ch, code: String(100000 + i) }, {})).statusCode
    assert.equal(last, 429)
    nextWindow()
    assert.equal((await post('/auth/login/2fa', { challenge: ch, code: codeNow(secret) }, {})).statusCode, 429)
    // ล้างตัวนับด้วยการรีสตาร์ท guard ไม่ได้ — เทสต์ถัดไปจึงใช้บัญชีอื่น/สร้างแอปใหม่
  })
})

describe('2FA: ปิด/สร้างรหัสสำรองใหม่/ผู้ดูแลรีเซ็ต', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const PW = 'demo1234'
  const realNow = Date.now
  let skew = 0
  const nextWindow = () => { skew += 31_000; Date.now = () => realNow() + skew }
  const codeNow = (s: string) => codeAtStep(s, stepAt(Date.now()))
  const post = (url: string, payload: unknown, headers: Record<string, string>) => t.app.inject({ method: 'POST', url: `${P}${url}`, headers, payload: payload as never })
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => ({ Cookie: `ev_session=${res.cookies.find((c) => c.name === 'ev_session')!.value}` })

  async function enableFor(email: string) {
    const h = await login(t.app, email, PW)
    const setup = json(await post('/auth/2fa/setup', { password: PW }, h))
    nextWindow()
    const r = await post('/auth/2fa/enable', { pending: setup.pending, code: codeAtStep(setup.secret, stepAt(Date.now())) }, h)
    assert.equal(r.statusCode, 200)
    return { secret: setup.secret as string, headers: cookieOf(r), recovery: json(r).recoveryCodes as string[] }
  }

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => {
    Date.now = realNow
    await t.stop()
  })

  it('ปิด 2FA ต้องรหัสผ่าน + รหัสจากแอป (ผิดอย่างใดอย่างหนึ่ง → 422) แล้ว session อื่นหลุด และล็อกอินกลับเป็นขั้นเดียว', async () => {
    const m = await enableFor('prasit@company.co.th')
    const other = cookieOf(await t.app.inject({ method: 'POST', url: `${P}/auth/login/2fa`, payload: { challenge: json(await post('/auth/login', { email: 'prasit@company.co.th', password: PW }, {})).challenge, code: m.recovery[0] } }))
    nextWindow()
    assert.equal((await post('/auth/2fa/disable', { password: 'wrong-pass', code: codeNow(m.secret) }, m.headers)).statusCode, 422)
    assert.equal((await post('/auth/2fa/disable', { password: PW, code: '000000' }, m.headers)).statusCode, 422)
    const ok = await post('/auth/2fa/disable', { password: PW, code: codeNow(m.secret) }, m.headers)
    assert.equal(ok.statusCode, 200)
    const mine = cookieOf(ok)
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/auth/me`, headers: mine })).statusCode, 200)
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/auth/me`, headers: other })).statusCode, 401)
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/auth/me`, headers: m.headers })).statusCode, 401, 'cookie เก่าของเครื่องที่ปิดก็ใช้ไม่ได้')
    const again = await post('/auth/login', { email: 'prasit@company.co.th', password: PW }, {})
    assert.equal(json(again).user.email, 'prasit@company.co.th')
    assert.equal(json(again).twoFactorRequired, undefined)
    assert.equal((await t.pool.query(`select count(*)::int as n from user_recovery_codes u join users x on x.id = u.user_id where x.email = 'prasit@company.co.th'`)).rows[0].n, 0)
  })

  it('สร้างรหัสสำรองชุดใหม่: ชุดเก่าใช้ไม่ได้ทันที', async () => {
    const m = await enableFor('wanna@company.co.th')
    nextWindow()
    const r = await post('/auth/2fa/recovery-codes', { password: PW, code: codeNow(m.secret) }, m.headers)
    assert.equal(r.statusCode, 200)
    const fresh: string[] = json(r).recoveryCodes
    assert.equal(fresh.length, 8)
    assert.ok(fresh.every((c) => !m.recovery.includes(c)))
    const ch = async () => json(await post('/auth/login', { email: 'wanna@company.co.th', password: PW }, {})).challenge
    assert.equal((await post('/auth/login/2fa', { challenge: await ch(), code: m.recovery[1] }, {})).statusCode, 401)
    assert.equal((await post('/auth/login/2fa', { challenge: await ch(), code: fresh[1] }, {})).statusCode, 200)
    assert.equal((await post('/auth/2fa/recovery-codes', { password: 'wrong-pass', code: fresh[2] }, m.headers)).statusCode, 422)
  })

  it('ผู้ดูแลรีเซ็ต 2FA ให้ผู้ใช้ (เครื่องหาย): ผู้ใช้เข้าด้วยรหัสผ่านอย่างเดียวได้ · ไม่ใช่ admin 403 · ไม่ได้เปิดอยู่ 409 · ไม่พบ 404', async () => {
    const m = await enableFor('prasit@company.co.th')
    const users = json(await t.app.inject({ method: 'GET', url: `${P}/users`, headers: admin }))
    const prasit = users.find((u: { email: string }) => u.email === 'prasit@company.co.th')
    assert.equal(prasit.twoFactorEnabled, true)
    assert.equal(users.find((u: { email: string }) => u.email === 'wanna@company.co.th').twoFactorEnabled, true)
    assert.equal((await post(`/users/${prasit.id}/2fa-reset`, {}, m.headers)).statusCode, 403)
    assert.equal((await post(`/users/${prasit.id}/2fa-reset`, {}, {})).statusCode, 401)
    assert.equal((await post(`/users/${prasit.id}/2fa-reset`, {}, admin)).statusCode, 200)
    assert.equal((await post(`/users/${prasit.id}/2fa-reset`, {}, admin)).statusCode, 409)
    assert.equal((await post('/users/00000000-0000-4000-8000-000000000000/2fa-reset', {}, admin)).statusCode, 404)
    assert.equal((await t.app.inject({ method: 'GET', url: `${P}/auth/me`, headers: m.headers })).statusCode, 401)
    assert.equal(json(await post('/auth/login', { email: 'prasit@company.co.th', password: PW }, {})).user.role, 'manager')
  })

  it('เปลี่ยนรหัสผ่านไม่ปิด 2FA และกู้รหัสผ่านก็ยังต้องผ่านขั้นที่สอง', async () => {
    const m = await enableFor('prasit@company.co.th')
    nextWindow()
    const r = await post('/auth/change-password', { currentPassword: PW, newPassword: 'Prasit-New-1' }, m.headers)
    assert.equal(r.statusCode, 200)
    const login2 = await post('/auth/login', { email: 'prasit@company.co.th', password: 'Prasit-New-1' }, {})
    assert.equal(json(login2).twoFactorRequired, true)
  })

  it('ข้อมูลความลับ 2FA เสีย/ถอดรหัสไม่ได้ (เช่น เปลี่ยน AUTH_SECRET): รหัสแอปถูกปฏิเสธ 401 โดยไม่ crash', async () => {
    const m = await enableFor('wanna@company.co.th').catch(() => null)
    // wanna เปิดอยู่แล้วจากเทสต์ก่อนหน้า → ใช้ข้อมูลเสียกับบัญชีนั้นโดยตรง
    void m
    await t.pool.query(`update users set totp_secret_enc = 'broken' where email = 'wanna@company.co.th'`)
    const ch = json(await post('/auth/login', { email: 'wanna@company.co.th', password: PW }, {})).challenge
    assert.equal((await post('/auth/login/2fa', { challenge: ch, code: '123456' }, {})).statusCode, 401)
  })
})
