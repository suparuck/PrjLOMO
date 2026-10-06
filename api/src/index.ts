import { buildApp } from './app'
import { config } from './config'
import { createPool, one } from './db'
import { hashKey } from './auth'
import { startJobs } from './services/jobs'
import { findDefaultPasswordUsers } from './services/accounts'

async function main() {
  const pool = createPool()
  // ตรวจว่าเชื่อมฐานข้อมูลได้ก่อนเปิดรับ request
  await pool.query('select 1')

  // สร้าง API key ตั้งต้นสำหรับ ingest จาก env (ถ้ากำหนดไว้และยังไม่มี)
  if (config.bootstrapIngestKey) {
    const hash = hashKey(config.bootstrapIngestKey)
    const exists = await one(pool, 'select 1 from api_keys where key_hash = $1', [hash])
    if (!exists) {
      await pool.query(`insert into api_keys (name, key_prefix, key_hash, scopes) values ($1, $2, $3, '{ingest}')`, [
        'bootstrap (INGEST_API_KEY)',
        config.bootstrapIngestKey.slice(0, 8),
        hash,
      ])
    }
  }

  const app = await buildApp(pool)
  // ติดตั้งแบบกองยานว่างเปล่า (SEED_DEMO=false) ยังไม่มีผู้ใช้เลย — บอกวิธีสร้างผู้ดูแลคนแรก
  try {
    const active = await one<{ n: number }>(pool, "select count(*)::int as n from users where status = 'active' and role = 'admin'")
    if (!active || active.n === 0) {
      app.log.warn('ยังไม่มีผู้ดูแลระบบที่ใช้งานอยู่ — สร้างคนแรกด้วย: docker compose exec api node dist/cli.js create-admin --email <อีเมล> --name <ชื่อ>')
    }
  } catch (err) {
    app.log.error({ err }, 'ตรวจผู้ดูแลระบบไม่สำเร็จ')
  }
  // เตือนเมื่อมีบัญชีที่ยังใช้รหัสผ่านตั้งต้น (ข้อมูลเดโม) — production ควรเปลี่ยน/ปิดก่อนเปิดให้ผู้ใช้จริง
  try {
    const weak = await findDefaultPasswordUsers(pool)
    if (weak.length) {
      const msg = `มี ${weak.length} บัญชีที่ยังใช้รหัสผ่านตั้งต้น (${weak.map((u) => u.email).join(', ')}) — สร้างผู้ดูแลจริงด้วย "node dist/cli.js create-admin" แล้วปิดด้วย "node dist/cli.js retire-defaults"`
      if (config.env === 'production') app.log.warn({ count: weak.length }, msg)
      else app.log.info({ count: weak.length }, msg)
    }
  } catch (err) {
    app.log.error({ err }, 'ตรวจบัญชีรหัสผ่านตั้งต้นไม่สำเร็จ')
  }
  await app.listen({ port: config.port, host: config.host })
  const stopJobs = startJobs(pool, app.log, config.offlineCheckIntervalSeconds, app.mailer, app.line)

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    stopJobs()
    await app.close()
    await pool.end()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
