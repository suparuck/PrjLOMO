import { ADMIN_URL, TEST_DB, TEST_URL } from './env'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { buildApp } from '../src/app'
import { createPool } from '../src/db'
import { generateApiKey } from '../src/auth'

/**
 * สร้างฐานข้อมูลทดสอบใหม่จากสคริปต์ใน db/init (ตรวจ schema และข้อมูลอ้างอิงไปพร้อมกัน)
 * demo=true (ค่าเริ่มต้น) เติมข้อมูลเดโมจาก db/demo ด้วย · demo=false = กองยานว่างเปล่าเหมือนติดตั้งจริง (ไม่มีผู้ใช้)
 */
export async function resetTestDb(demo = true) {
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${TEST_DB}' and pid <> pg_backend_pid()`)
  await admin.query(`drop database if exists ${TEST_DB}`)
  await admin.query(`create database ${TEST_DB}`)
  await admin.end()

  const c = new Client({ connectionString: TEST_URL })
  await c.connect()
  await c.query(`set timezone = 'Asia/Bangkok'`)
  const dir = join(__dirname, '..', '..', 'db', 'init')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await c.query(readFileSync(join(dir, f), 'utf8'))
  }
  if (demo) await c.query(readFileSync(join(__dirname, '..', '..', 'db', 'demo', 'demo_seed.sql'), 'utf8'))
  await c.end()
}

/** ตัวส่งอีเมลสำหรับเทสต์: เก็บจดหมายไว้ในหน่วยความจำ */
export function memoryMailer() {
  const sent: { to: string; subject: string; text: string }[] = []
  return { sent, mailer: { mode: 'log' as const, async send(m: { to: string; subject: string; text: string }) { sent.push(m) } } }
}

export async function startApp(opts: { demo?: boolean } = {}) {
  await resetTestDb(opts.demo ?? true)
  const pool = createPool(TEST_URL)
  await pool.query(`alter database ${TEST_DB} set timezone = 'Asia/Bangkok'`)
  const mail = memoryMailer()
  const app = await buildApp(pool, { logger: false, rateLimit: false, mailer: mail.mailer })
  await app.ready()
  // API key สำหรับทดสอบ ingest
  const k = generateApiKey()
  await pool.query(`insert into api_keys (name, key_prefix, key_hash) values ('test', $1, $2)`, [k.prefix, k.hash])
  return { app, pool, mail: mail.sent, apiKey: k.key, stop: async () => { await app.close(); await pool.end() } }
}

type App = Awaited<ReturnType<typeof startApp>>['app']

export async function login(app: App, email = 'admin@evmonitor.co.th', password = 'demo1234') {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  const c = res.cookies.find((x) => x.name === 'ev_session')!
  return { Cookie: `ev_session=${c.value}` }
}

export const json = (res: { body: string }) => JSON.parse(res.body)
