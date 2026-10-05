import { buildApp } from './app'
import { config } from './config'
import { createPool, one } from './db'
import { hashKey } from './auth'

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
  await app.listen({ port: config.port, host: config.host })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
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
