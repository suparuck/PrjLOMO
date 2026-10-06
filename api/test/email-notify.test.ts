import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Mailer } from '../src/services/mailer'
import { currentAlertFloor } from '../src/services/lineNotify'
import { buildAlertEmail, runEmailNotify } from '../src/services/emailNotify'
import { startApp } from './helpers'

type Fake = Mailer & { sent: { to: string; subject: string; text: string }[]; failFor: Set<string>; failAll: boolean }
const fakeMailer = (mode: Mailer['mode'] = 'smtp'): Fake => {
  const f: Fake = {
    mode,
    sent: [],
    failFor: new Set(),
    failAll: false,
    async send(m) {
      if (f.failAll || f.failFor.has(m.to)) throw new Error('smtp down')
      f.sent.push(m)
    },
  }
  return f
}

describe('อีเมลแจ้งเตือนเหตุการณ์ (job)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let staff: string[]
  const add = async (severity: string, title: string, ageMin = 0) =>
    (await t.pool.query(`insert into alerts (severity, type, title, text, created_at) values ($1, 'battery', $2, 'รายละเอียด', now() - ($3::int * interval '1 minute')) returning id`, [severity, title, ageMin])).rows[0].id as number
  const setEmail = (on: boolean) => t.pool.query(`update app_settings set notify = jsonb_set(notify, '{email}', $1::jsonb) where id = 1`, [String(on)])

  before(async () => {
    t = await startApp()
    staff = (await t.pool.query(`select email from users where status = 'active' and role in ('admin','manager') order by email`)).rows.map((r) => r.email)
    // เพิ่มผู้ดูรายงานและผู้ถูกเชิญ (ต้องไม่ได้รับอีเมล)
    await t.pool.query(
      `insert into users (email, name, role, status, password_hash) values
         ('viewer.only@x.co', 'v', 'viewer', 'active', crypt('Passw0rdOK', gen_salt('bf', 4))),
         ('invited@x.co', 'i', 'manager', 'invited', null)`,
    )
  })
  after(async () => { await t.stop() })

  it('ส่งให้ admin/manager ที่ใช้งานอยู่เท่านั้น ฉบับเดียวต่อคน รวมหลายเหตุการณ์ ไม่ส่งซ้ำ/ไม่ส่งระดับข้อมูล/ของเก่า', async () => {
    const mail = fakeMailer()
    const floor = await currentAlertFloor(t.pool)
    await setEmail(true)
    await add('critical', 'แบตวิกฤต')
    await add('warning', 'แบตต่ำ')
    await add('info', 'ข้อมูลทั่วไป')
    await add('critical', 'ของเก่า', 60)

    const r = await runEmailNotify(t.pool, mail, floor)
    assert.deepEqual(r, { sent: 2, recipients: staff.length })
    assert.deepEqual(mail.sent.map((m) => m.to).sort(), staff)
    assert.ok(staff.length >= 2 && !mail.sent.some((m) => m.to === 'viewer.only@x.co' || m.to === 'invited@x.co'))
    const m = mail.sent[0]
    assert.match(m.subject, /แจ้งเตือนใหม่ 2 รายการ \(วิกฤต 1\)/)
    assert.match(m.text, /\[วิกฤต\] แบตวิกฤต/)
    assert.match(m.text, /\[เตือน\] แบตต่ำ/)
    assert.ok(!m.text.includes('ข้อมูลทั่วไป') && !m.text.includes('ของเก่า'))
    assert.match(m.text, /http:\/\/localhost:3000\/alerts/)

    assert.deepEqual(await runEmailNotify(t.pool, mail, floor), { sent: 0 })
    assert.equal(mail.sent.length, staff.length, 'ไม่ส่งซ้ำ')
  })

  it('ไม่แตะแจ้งเตือนที่มีอยู่ก่อนเริ่มระบบ (floorId)', async () => {
    const mail = fakeMailer()
    await setEmail(true)
    await add('critical', 'มีอยู่ก่อนเริ่มระบบ')
    const floor = await currentAlertFloor(t.pool)
    assert.deepEqual(await runEmailNotify(t.pool, mail, floor), { sent: 0 })
    await add('warning', 'เกิดหลังเริ่มระบบ')
    assert.equal((await runEmailNotify(t.pool, mail, floor)).sent, 1)
  })

  it('สวิตช์อีเมลปิด / ยังไม่ตั้งค่าอีเมล = ไม่ส่งและไม่จองแถว', async () => {
    const floor = await currentAlertFloor(t.pool)
    const id = await add('critical', 'ทดสอบสวิตช์')
    await setEmail(false)
    assert.deepEqual(await runEmailNotify(t.pool, fakeMailer(), floor), { sent: 0, skipped: 'disabled' })
    await setEmail(true)
    assert.deepEqual(await runEmailNotify(t.pool, fakeMailer('off'), floor), { sent: 0, skipped: 'mail-off' })
    assert.equal((await t.pool.query('select email_notified_at from alerts where id = $1', [id])).rows[0].email_notified_at, null)
    assert.equal((await runEmailNotify(t.pool, fakeMailer(), floor)).sent, 1, 'เปิดแล้วส่งได้ทันที')
  })

  it('ส่งไม่ถึงใครเลย → คืนการจองแล้วลองใหม่ได้; ถึงบางคน → ถือว่าส่งแล้ว (ไม่ส่งซ้ำให้คนที่ได้ไปแล้ว)', async () => {
    const mail = fakeMailer()
    const floor = await currentAlertFloor(t.pool)
    await setEmail(true)
    const id = await add('critical', 'ลองใหม่')
    mail.failAll = true
    assert.deepEqual(await runEmailNotify(t.pool, mail, floor), { sent: 0, skipped: 'failed' })
    assert.equal((await t.pool.query('select email_notified_at from alerts where id = $1', [id])).rows[0].email_notified_at, null)
    mail.failAll = false
    mail.failFor.add(staff[0])
    const r = await runEmailNotify(t.pool, mail, floor)
    assert.equal(r.sent, 1)
    assert.equal(r.recipients, staff.length - 1)
    assert.deepEqual(await runEmailNotify(t.pool, mail, floor), { sent: 0 })
  })

  it('จัดข้อความ: เกิน 20 รายการสรุป "และอีก N รายการ"', () => {
    const list = Array.from({ length: 25 }, (_, i) => ({ id: i, severity: 'warning', type: 'battery', title: `เหตุ ${i}`, text: 't' }))
    const m = buildAlertEmail(list)
    assert.match(m.text, /และอีก 5 รายการ/)
    assert.ok(!m.text.includes('เหตุ 24'))
    assert.ok(!m.subject.includes('วิกฤต'))
  })
})
