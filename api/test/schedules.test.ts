import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nextRun } from '../src/lib/schedule'
import { runDueSchedules } from '../src/services/reportMail'
import { json, login, startApp } from './helpers'

const P = '/api/v1'
// เวลาไทย → UTC เพื่อให้ตัวอย่างอ่านง่าย (ไทย = UTC+7)
const th = (s: string) => new Date(`${s}+07:00`)

describe('คำนวณเวลาส่งถัดไป (เวลาไทย)', () => {
  it('รายวัน: ก่อนเวลาส่ง = วันนี้, หลังเวลาส่ง/ตรงเวลา = พรุ่งนี้', () => {
    const rule = { frequency: 'daily', weekday: null, monthDay: null, hour: 8 } as const
    assert.deepEqual(nextRun(rule, th('2026-10-06T07:59:00')), th('2026-10-06T08:00:00'))
    assert.deepEqual(nextRun(rule, th('2026-10-06T08:00:00')), th('2026-10-07T08:00:00'))
    assert.deepEqual(nextRun(rule, th('2026-10-06T23:30:00')), th('2026-10-07T08:00:00'))
  })
  it('ข้ามเที่ยงคืนตามเวลาไทย ไม่ใช่เวลาสากล (01:00 ไทย = 18:00 UTC วันก่อน)', () => {
    const rule = { frequency: 'daily', weekday: null, monthDay: null, hour: 1 } as const
    assert.deepEqual(nextRun(rule, new Date('2026-10-05T18:30:00Z')), th('2026-10-07T01:00:00')) // 01:30 ไทยของวันที่ 6 → ครั้งถัดไปคือ 7 ต.ค.
    assert.deepEqual(nextRun(rule, new Date('2026-10-05T17:30:00Z')), th('2026-10-06T01:00:00')) // 00:30 ไทยของวันที่ 6
  })
  it('รายสัปดาห์: จันทร์ 09:00', () => {
    const rule = { frequency: 'weekly', weekday: 1, monthDay: null, hour: 9 } as const
    // 6 ต.ค. 2026 เป็นวันอังคาร → จันทร์ถัดไปคือ 12 ต.ค.
    assert.deepEqual(nextRun(rule, th('2026-10-06T10:00:00')), th('2026-10-12T09:00:00'))
    assert.deepEqual(nextRun(rule, th('2026-10-12T08:00:00')), th('2026-10-12T09:00:00'))
    assert.deepEqual(nextRun(rule, th('2026-10-12T09:00:00')), th('2026-10-19T09:00:00'))
  })
  it('รายเดือน: วันที่ 1 ข้ามเดือน/ปี และวันที่ 28 ในเดือนกุมภาพันธ์', () => {
    const first = { frequency: 'monthly', weekday: null, monthDay: 1, hour: 7 } as const
    assert.deepEqual(nextRun(first, th('2026-12-15T12:00:00')), th('2027-01-01T07:00:00'))
    const d28 = { frequency: 'monthly', weekday: null, monthDay: 28, hour: 7 } as const
    assert.deepEqual(nextRun(d28, th('2027-02-10T00:00:00')), th('2027-02-28T07:00:00'))
  })
})

describe('ตั้งเวลาส่งรายงาน (API + job)', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers?: Record<string, string>) =>
    t.app.inject({ method, url: `${P}${url}`, headers: headers ?? admin, payload: payload as never })
  const valid = { frequency: 'weekly', weekday: 1, hour: 9, recipients: ['boss@company.co.th', ' CFO@company.co.th '], period: 'year', brand: 'all' }

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('สิทธิ์: ไม่ล็อกอิน 401, viewer 403', async () => {
    assert.equal((await call('GET', '/report-schedules', undefined, {})).statusCode, 401)
    const inv = json(await call('POST', '/users/invite', { email: 'sv@company.co.th', role: 'viewer' }))
    await t.app.inject({ method: 'POST', url: `${P}/auth/invite/accept`, payload: { token: inv.inviteToken, password: 'Passw0rdOK' } })
    const viewer = await login(t.app, 'sv@company.co.th', 'Passw0rdOK')
    assert.equal((await call('GET', '/report-schedules', undefined, viewer)).statusCode, 403)
    assert.equal((await call('POST', '/report-schedules', valid, viewer)).statusCode, 403)
  })

  it('สร้าง: ปรับอีเมลให้เป็นตัวพิมพ์เล็ก ตัดซ้ำ และคำนวณเวลาส่งถัดไป', async () => {
    const res = await call('POST', '/report-schedules', { ...valid, recipients: [...valid.recipients, 'boss@company.co.th'] })
    assert.equal(res.statusCode, 201, res.body)
    const s = json(res)
    assert.deepEqual(s.recipients, ['boss@company.co.th', 'cfo@company.co.th'])
    assert.ok(new Date(s.nextRunAt).getTime() > Date.now())
    assert.equal(new Date(new Date(s.nextRunAt).getTime() + 7 * 3600_000).getUTCDay(), 1, 'วันจันทร์ตามเวลาไทย')
    const list = json(await call('GET', '/report-schedules'))
    assert.equal(list.items.length, 1)
    assert.equal(list.mailEnabled, true)
  })

  it('ตรวจข้อมูล: ผู้รับผิดรูปแบบ → 422 ใต้ช่อง recipients, weekly ไม่มีวัน, monthly ไม่มีวันที่', async () => {
    const bad = await call('POST', '/report-schedules', { ...valid, recipients: ['ok@company.co.th', 'not-an-email'] })
    assert.equal(bad.statusCode, 422)
    assert.match(json(bad).error.fields.recipients, /not-an-email/)
    assert.equal(json(await call('POST', '/report-schedules', { ...valid, weekday: undefined })).error.fields.weekday.length > 0, true)
    assert.ok(json(await call('POST', '/report-schedules', { ...valid, frequency: 'monthly' })).error.fields.monthDay)
    assert.equal((await call('POST', '/report-schedules', { ...valid, hour: 24 })).statusCode, 400)
    assert.equal((await call('POST', '/report-schedules', { ...valid, recipients: [] })).statusCode, 400)
  })

  it('ส่งทดสอบทันที: อีเมลถึงผู้รับทุกคน (ทีละฉบับ) มีตัวเลขรายงานและลิงก์ ไม่เปลี่ยนเวลาส่งถัดไป', async () => {
    const created = json(await call('POST', '/report-schedules', { ...valid, frequency: 'daily', weekday: undefined }))
    t.mail.length = 0
    const res = await call('POST', `/report-schedules/${created.id}/send-now`, {})
    assert.equal(res.statusCode, 200, res.body)
    assert.deepEqual(t.mail.map((m) => m.to).sort(), ['boss@company.co.th', 'cfo@company.co.th'])
    assert.match(t.mail[0].subject, /รายงานกองยาน EV/)
    assert.match(t.mail[0].text, /44,440 kWh/)
    assert.match(t.mail[0].text, /http:\/\/localhost:3000\/reports/)
    const after = json(await call('GET', '/report-schedules')).items.find((x: { id: string }) => x.id === created.id)
    assert.equal(after.nextRunAt, created.nextRunAt)
    assert.equal(after.lastStatus, 'sent')
    assert.equal((await call('POST', '/report-schedules/00000000-0000-4000-8000-000000000000/send-now', {})).statusCode, 404)
  })

  it('job: ส่งเฉพาะที่ถึงเวลา เลื่อนเวลาถัดไป ไม่ส่งซ้ำ ข้ามที่ปิดอยู่', async () => {
    await t.pool.query('delete from report_schedules')
    const a = json(await call('POST', '/report-schedules', { ...valid, frequency: 'daily', weekday: undefined, recipients: ['a@company.co.th'] }))
    const b = json(await call('POST', '/report-schedules', { ...valid, frequency: 'daily', weekday: undefined, recipients: ['b@company.co.th'] }))
    const off = json(await call('POST', '/report-schedules', { ...valid, frequency: 'daily', weekday: undefined, recipients: ['off@company.co.th'], enabled: false }))
    await t.pool.query(`update report_schedules set next_run_at = now() - interval '1 minute' where id in ($1, $2)`, [a.id, off.id])
    await t.pool.query(`update report_schedules set next_run_at = now() + interval '1 hour' where id = $1`, [b.id])

    t.mail.length = 0
    const r1 = await runDueSchedules(t.pool, t.app.mailer)
    assert.deepEqual(r1.sent, [a.id])
    assert.deepEqual(t.mail.map((m) => m.to), ['a@company.co.th'])
    const row = (await t.pool.query('select next_run_at, last_status from report_schedules where id = $1', [a.id])).rows[0]
    assert.ok(row.next_run_at.getTime() > Date.now() && row.last_status === 'sent')

    const r2 = await runDueSchedules(t.pool, t.app.mailer)
    assert.deepEqual(r2, { sent: [], failed: [] }, 'รอบถัดไปไม่ส่งซ้ำ')
    assert.equal(t.mail.length, 1)
  })

  it('แก้และลบ', async () => {
    const created = json(await call('POST', '/report-schedules', valid))
    const put = await call('PUT', `/report-schedules/${created.id}`, { ...valid, frequency: 'monthly', weekday: undefined, monthDay: 15, enabled: false })
    assert.equal(put.statusCode, 200, put.body)
    assert.deepEqual([json(put).frequency, json(put).weekday, json(put).monthDay, json(put).enabled], ['monthly', null, 15, false])
    assert.equal((await call('DELETE', `/report-schedules/${created.id}`)).statusCode, 200)
    assert.equal((await call('DELETE', `/report-schedules/${created.id}`)).statusCode, 404)
  })
})
