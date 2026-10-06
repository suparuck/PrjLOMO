import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDigestEmail, gatherDigest, runDailyDigest } from '../src/services/dailyDigest'
import { createAlert } from '../src/services/ops'
import { login, startApp } from './helpers'

const P = '/api/v1'

describe('สรุปรายวันทางอีเมล', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  const run = (hour = 0, latest = 24) => runDailyDigest(t.pool, t.app.mailer, hour, latest)
  const digests = () => t.mail.filter((m) => /สรุปกองยาน/.test(m.subject))

  before(async () => {
    t = await startApp()
    await t.pool.query(`update app_settings set notify = jsonb_set(notify, '{dailyDigest}', 'true'), digest_last_date = null`)
  })
  after(async () => { await t.stop() })

  it('เนื้อหา: สถานะรถ, แบตต่ำ/ออฟไลน์, แจ้งเตือนเมื่อวาน, การชาร์จ, ซ่อมบำรุง, ลิงก์แดชบอร์ด', async () => {
    await t.pool.query(`insert into alerts (severity, type, title, text, vehicle_id, created_at) values
      ('critical', 'battery', 'เมื่อวานวิกฤต', 'x', 'EV-001', now() - interval '1 day'),
      ('warning', 'battery', 'เมื่อวานเตือน', 'x', 'EV-001', now() - interval '1 day')`)
    const d = await gatherDigest(t.pool)
    assert.ok(d.vehicles.total >= 10)
    assert.ok(d.alerts.openUnacked >= 2)
    const m = buildDigestEmail(d)
    assert.match(m.subject, /สรุปกองยานประจำวันที่ \d\d\/\d\d\/\d{4}/)
    for (const s of ['■ สถานะรถตอนนี้', '■ แจ้งเตือนเมื่อวาน', '■ การชาร์จเมื่อวาน', 'localhost:3000/dashboard', 'บัญชีของฉัน']) assert.ok(m.text.includes(s), s)
    // เมื่อวาน (เวลาไทย) นับเฉพาะที่สร้างในวันนั้น: ที่สร้างตอนนี้ไม่นับ
    await createAlert(t.pool, { severity: 'critical', type: 'battery', title: 'วันนี้', text: 'x', vehicleId: 'EV-002' })
    const d2 = await gatherDigest(t.pool)
    assert.equal(d2.alerts.critical, d.alerts.critical)
    assert.equal(d2.alerts.openCritical, d.alerts.openCritical + 1)
  })

  it('ส่งหา admin/manager ที่ active ฉบับละคน ครั้งเดียวต่อวัน (เรียกซ้ำไม่ส่งอีก) ผู้ดูรายงานไม่ได้', async () => {
    t.mail.length = 0
    const r = await run()
    assert.equal(r.skipped, undefined)
    assert.equal(r.sent, digests().length)
    const to = digests().map((m) => m.to).sort()
    assert.deepEqual(to, ['admin@evmonitor.co.th', 'prasit@company.co.th'])
    assert.deepEqual(await run(), { sent: 0, skipped: 'already-sent' })
    assert.equal(digests().length, 2)
    // พรุ่งนี้ (ถอยวันที่ที่จองไว้ 1 วัน) ส่งใหม่ได้
    await t.pool.query(`update app_settings set digest_last_date = digest_last_date - 1`)
    assert.ok((await run()).sent === 2)
  })

  it('เคารพสวิตช์ระบบ, ตัวเลือกรายบุคคล, ชั่วโมงที่กำหนด และ mailer off', async () => {
    await t.pool.query(`update app_settings set digest_last_date = null`)
    t.mail.length = 0
    assert.deepEqual(await runDailyDigest(t.pool, t.app.mailer, 0, 0), { sent: 0, skipped: 'not-time' })
    assert.deepEqual(await runDailyDigest(t.pool, { mode: 'off', send: async () => {} }, 0, 24), { sent: 0, skipped: 'mail-off' })

    const mgr = await login(t.app, 'prasit@company.co.th', 'demo1234')
    assert.equal((await t.app.inject({ method: 'PUT', url: `${P}/auth/notifications`, headers: mgr, payload: { dailyDigest: false } })).statusCode, 200)
    assert.deepEqual((await run()).sent, 1)
    assert.deepEqual(digests().map((m) => m.to), ['admin@evmonitor.co.th'])

    await t.pool.query(`update app_settings set digest_last_date = null, notify = jsonb_set(notify, '{dailyDigest}', 'false')`)
    assert.deepEqual(await run(), { sent: 0, skipped: 'disabled' })
    await t.pool.query(`update app_settings set notify = jsonb_set(notify, '{dailyDigest}', 'true')`)
  })

  it('ส่งไม่สำเร็จเลย → คืนการจอง (ลองใหม่ได้); ส่งได้บางคนถือว่าสำเร็จ', async () => {
    await t.pool.query(`update app_settings set digest_last_date = null`)
    const failing = { mode: 'log' as const, send: async () => { throw new Error('smtp down') } }
    assert.deepEqual(await runDailyDigest(t.pool, failing, 0, 24), { sent: 0, skipped: 'failed' })
    const left = (await t.pool.query("select digest_last_date::text as d, (now() at time zone 'Asia/Bangkok')::date::text as today from app_settings")).rows[0]
    assert.ok(left.d < left.today, `คืนการจองแล้วต้องเป็นวันก่อนหน้า: ${JSON.stringify(left)}`)
    const sent: string[] = []
    const flaky = { mode: 'log' as const, send: async (m: { to: string }) => { if (m.to.startsWith('admin')) throw new Error('x'); sent.push(m.to) } }
    const r = await runDailyDigest(t.pool, flaky, 0, 24)
    assert.equal(r.sent, sent.length)
  })
})

describe('สรุปรายวัน: กองยานว่างเปล่า', () => {
  it('ไม่ส่งสรุป (ไม่มีรถ)', async () => {
    const e = await startApp({ demo: false })
    try {
      await e.pool.query(`update app_settings set notify = jsonb_set(notify, '{dailyDigest}', 'true')`)
      await e.pool.query(`insert into users (email, name, role, password_hash) values ('own@x.co', 'o', 'admin', crypt('Abcdefg1', gen_salt('bf', 4)))`)
      assert.deepEqual(await runDailyDigest(e.pool, e.app.mailer, 0, 24), { sent: 0, skipped: 'no-vehicles' })
    } finally {
      await e.stop()
    }
  })
})

describe('ค่า DIGEST_HOUR_TH', () => {
  it('0 ใช้ได้ (ไม่ถูกแทนด้วยค่าเริ่มต้น), ว่าง/ไม่ใช่ตัวเลขใช้ค่าเริ่มต้น, เกินช่วงถูกบีบ', async () => {
    const { parseHour } = await import('../src/config')
    assert.equal(parseHour('0', 8), 0)
    assert.equal(parseHour('6', 8), 6)
    assert.equal(parseHour(undefined, 8), 8)
    assert.equal(parseHour('', 8), 8)
    assert.equal(parseHour('abc', 8), 8)
    assert.equal(parseHour('25', 8), 19)
    assert.equal(parseHour('-3', 8), 0)
  })
})
