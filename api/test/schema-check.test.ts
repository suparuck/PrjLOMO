import './env'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { REQUIRED_SCHEMA, missingMigrations } from '../src/services/schemaCheck'
import { startApp } from './helpers'

describe('ตรวจว่าฐานข้อมูลรัน migration ครบ', () => {
  let t: Awaited<ReturnType<typeof startApp>>
  before(async () => { t = await startApp() })
  after(async () => { await t.stop() })

  it('ฐานข้อมูลใหม่ (จาก db/init) ครบทุกรายการ', async () => {
    assert.deepEqual(await missingMigrations(t.pool), [])
  })

  it('ขาดคอลัมน์/ตาราง → ระบุชื่อไฟล์ migration ที่ต้องรัน (เรียงลำดับ ไม่ซ้ำ)', async () => {
    await t.pool.query('alter table app_settings drop column digest_last_date')
    await t.pool.query('alter table users drop column totp_enabled_at')
    assert.deepEqual(await missingMigrations(t.pool), ['007_two_factor.sql', '012_daily_digest.sql'])
    await t.pool.query('drop table audit_log')
    assert.ok((await missingMigrations(t.pool)).includes('009_audit_log.sql'))
  })

  it('ไฟล์ migration ที่อ้างถึงมีอยู่จริงในรีโป', async () => {
    const fs = await import('node:fs')
    for (const r of REQUIRED_SCHEMA) assert.ok(fs.existsSync(`../db/migrations/${r.migration}`), r.migration)
  })
})
