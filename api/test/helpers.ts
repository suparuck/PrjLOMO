import { ADMIN_URL, TEST_DB, TEST_URL } from './env'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { buildApp } from '../src/app'
import { createPool } from '../src/db'
import { generateApiKey } from '../src/auth'

/** สร้างฐานข้อมูลทดสอบใหม่จากสคริปต์ใน db/init (ตรวจ schema และ seed ไปพร้อมกัน) */
export async function resetTestDb() {
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
  await c.end()
}

export async function startApp() {
  await resetTestDb()
  const pool = createPool(TEST_URL)
  await pool.query(`alter database ${TEST_DB} set timezone = 'Asia/Bangkok'`)
  const app = await buildApp(pool, { logger: false, rateLimit: false })
  await app.ready()
  // API key สำหรับทดสอบ ingest
  const k = generateApiKey()
  await pool.query(`insert into api_keys (name, key_prefix, key_hash) values ('test', $1, $2)`, [k.prefix, k.hash])
  return { app, pool, apiKey: k.key, stop: async () => { await app.close(); await pool.end() } }
}

type App = Awaited<ReturnType<typeof startApp>>['app']

export async function login(app: App, email = 'admin@evmonitor.co.th', password = 'demo1234') {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  const c = res.cookies.find((x) => x.name === 'ev_session')!
  return { Cookie: `ev_session=${c.value}` }
}

export const json = (res: { body: string }) => JSON.parse(res.body)
