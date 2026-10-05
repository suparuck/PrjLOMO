import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { json, login, startApp } from './helpers'
import { runOfflineCheck, startJobs } from '../src/services/jobs'

describe('job ตรวจรถออฟไลน์', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  let admin: Record<string, string>
  const silent = (id: string, minutes: number) => t.pool.query(`update vehicles set last_seen_at = now() - ($2::int * interval '1 minute') where id = $1`, [id, minutes])
  const status = async (id: string) => (await t.pool.query(`select status from vehicles where id = $1`, [id])).rows[0].status as string
  const offlineAlerts = async (id: string) =>
    (await t.pool.query(`select id, acknowledged_at from alerts where vehicle_id = $1 and type = 'device' and title = 'รถออฟไลน์' order by id`, [id])).rows
  const ack = (id: number) => t.app.inject({ method: 'POST', url: `/api/v1/alerts/${id}/ack`, headers: admin })

  before(async () => {
    t = await startApp()
    admin = await login(t.app)
  })
  after(async () => { await t.stop() })

  it('รถที่เงียบเกินเกณฑ์ (30 นาที) กลายเป็นออฟไลน์ + แจ้งเตือน ส่วนรถที่ยังส่งข้อมูลอยู่ไม่ถูกแตะ', async () => {
    await silent('EV-001', 45)
    await silent('EV-002', 10)
    const r = await runOfflineCheck(t.pool)
    assert.deepEqual(r, { marked: ['EV-001'], skipped: false })
    assert.equal(await status('EV-001'), 'offline')
    assert.equal(await status('EV-002'), 'parked', 'เงียบ 10 นาที ยังไม่ถึงเกณฑ์')
    assert.equal(await status('EV-009'), 'offline', 'รถที่ออฟไลน์อยู่แล้วไม่ถูกนับซ้ำ')

    const alerts = await offlineAlerts('EV-001')
    assert.equal(alerts.length, 1)
    const text = (await t.pool.query(`select severity, text from alerts where id = $1`, [alerts[0].id])).rows[0]
    assert.deepEqual(text, { severity: 'warning', text: 'EV-001 ไม่ส่งข้อมูลมากกว่า 30 นาที' })
  })

  it('รันซ้ำไม่แจ้งซ้ำ และไม่แจ้งซ้ำแม้กลับมาออนไลน์แล้วเงียบอีกถ้าแจ้งเตือนเดิมยังไม่รับทราบ', async () => {
    assert.deepEqual((await runOfflineCheck(t.pool)).marked, [])
    assert.equal((await offlineAlerts('EV-001')).length, 1)

    // กลับมาออนไลน์ด้วย telemetry → สถานะคำนวณใหม่
    const send = () => t.app.inject({ method: 'POST', url: '/api/v1/ingest/telemetry', headers: { 'x-api-key': t.apiKey }, payload: { readings: [{ vehicleId: 'EV-001', soc: 80, speedKmh: 0, lat: 18.79, lng: 98.98 }] } })
    assert.equal((await send()).statusCode, 200)
    assert.equal(await status('EV-001'), 'parked', 'ส่งข้อมูลแล้วออนไลน์เอง')

    await silent('EV-001', 60)
    assert.deepEqual((await runOfflineCheck(t.pool)).marked, ['EV-001'])
    assert.equal(await status('EV-001'), 'offline')
    assert.equal((await offlineAlerts('EV-001')).length, 1, 'มีแจ้งเตือนเดิมที่ยังไม่รับทราบ จึงไม่สร้างซ้ำ')

    // รับทราบแล้ว เหตุการณ์ใหม่ต้องแจ้งอีก
    await ack((await offlineAlerts('EV-001'))[0].id)
    await send()
    await silent('EV-001', 60)
    await runOfflineCheck(t.pool)
    assert.equal((await offlineAlerts('EV-001')).length, 2)
  })

  it('ปิดกฎ "รถออฟไลน์" → ยังเปลี่ยนสถานะ แต่ไม่สร้างแจ้งเตือน', async () => {
    await t.app.inject({ method: 'PATCH', url: '/api/v1/alert-rules/offline', headers: admin, payload: { enabled: false } })
    await silent('EV-003', 90)
    assert.deepEqual((await runOfflineCheck(t.pool)).marked, ['EV-003'])
    assert.equal(await status('EV-003'), 'offline')
    assert.equal((await offlineAlerts('EV-003')).length, 0)
    await t.app.inject({ method: 'PATCH', url: '/api/v1/alert-rules/offline', headers: admin, payload: { enabled: true } })
  })

  it('ใช้เกณฑ์จากการตั้งค่า: ลดเหลือ 5 นาที รถที่เงียบ 10 นาทีถูกตรวจพบ และข้อความแจ้งเตือนอ้างเกณฑ์ใหม่', async () => {
    const cur = json(await t.app.inject({ method: 'GET', url: '/api/v1/settings', headers: admin }))
    const put = await t.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: admin, payload: { ...cur, thresholds: { ...cur.thresholds, offlineMinutes: 5 } } })
    assert.equal(put.statusCode, 200, put.body)
    const r = await runOfflineCheck(t.pool)
    assert.ok(r.marked.includes('EV-002'))
    const a = (await t.pool.query(`select text from alerts where vehicle_id = 'EV-002' and title = 'รถออฟไลน์'`)).rows[0]
    assert.equal(a.text, 'EV-002 ไม่ส่งข้อมูลมากกว่า 5 นาที')
    await t.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: admin, payload: cur })
  })

  it('รถที่ยังไม่เคยส่งข้อมูลเลย (last_seen_at ว่าง) ไม่ถูกแตะ', async () => {
    await t.pool.query(`update vehicles set status = 'parked', last_seen_at = null where id = 'EV-004'`)
    const r = await runOfflineCheck(t.pool)
    assert.ok(!r.marked.includes('EV-004'))
    assert.equal(await status('EV-004'), 'parked')
  })

  it('มีอินสแตนซ์อื่นกำลังตรวจอยู่ (advisory lock) → ข้ามรอบ ไม่ตรวจซ้อน', async () => {
    await silent('EV-005', 120)
    const other = new Client({ connectionString: process.env.DATABASE_URL })
    await other.connect()
    await other.query('select pg_advisory_lock(727401)')
    try {
      assert.deepEqual(await runOfflineCheck(t.pool), { marked: [], skipped: true })
      assert.equal(await status('EV-005'), 'driving', 'ยังไม่ถูกตรวจ')
    } finally {
      await other.query('select pg_advisory_unlock(727401)')
      await other.end()
    }
    assert.deepEqual((await runOfflineCheck(t.pool)).marked, ['EV-005'])
  })

  it('startJobs: ตั้งเป็น 0 = ปิด (ไม่ทำงานและหยุดได้ปลอดภัย)', async () => {
    const logs: string[] = []
    const stop = startJobs(t.pool, { info: (_o, m) => logs.push(m), error: (_o, m) => logs.push(m) }, 0)
    stop()
    assert.match(logs[0], /disabled/)
  })
})
