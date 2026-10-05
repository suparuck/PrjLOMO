import { Pool, types, type PoolClient, type QueryResultRow } from 'pg'
import { config } from './config'

// numeric → number, bigint → number (ค่าที่ใช้อยู่มีขนาดเล็กพอ), date → 'YYYY-MM-DD' (ไม่แปลงเป็น Date เพื่อเลี่ยงปัญหา timezone)
types.setTypeParser(1700, (v) => parseFloat(v))
types.setTypeParser(20, (v) => parseInt(v, 10))
types.setTypeParser(1082, (v) => v)

export function createPool(connectionString = config.databaseUrl) {
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 })
}

export type Db = Pick<Pool, 'query'>

export async function withTx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

export async function rows<T extends QueryResultRow = QueryResultRow>(db: Db, text: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(text, params)).rows
}

export async function one<T extends QueryResultRow = QueryResultRow>(db: Db, text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(text, params)).rows[0]
}
