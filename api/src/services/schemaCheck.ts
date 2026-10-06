import type { Pool } from 'pg'
import { rows } from '../db'

/** คอลัมน์/ตารางที่โค้ดปัจจุบันต้องใช้ พร้อมไฟล์ migration ที่สร้างมัน — เพิ่มทุกครั้งที่เพิ่ม migration ที่โค้ดพึ่งพา */
export const REQUIRED_SCHEMA: { table: string; column?: string; migration: string }[] = [
  { table: 'users', column: 'totp_enabled_at', migration: '007_two_factor.sql' },
  { table: 'user_recovery_codes', migration: '007_two_factor.sql' },
  { table: 'app_settings', column: 'require_admin_2fa', migration: '008_require_admin_2fa.sql' },
  { table: 'audit_log', migration: '009_audit_log.sql' },
  { table: 'users', column: 'login_alert_at', migration: '010_login_alert.sql' },
  { table: 'users', column: 'notify_prefs', migration: '011_notify_prefs.sql' },
  { table: 'app_settings', column: 'digest_last_date', migration: '012_daily_digest.sql' },
]

/**
 * ตรวจว่าฐานข้อมูลที่รันอยู่มีโครงสร้างครบตามรุ่นโค้ด (ฐานข้อมูลเก่าที่อัปเกรดแอปแต่ยังไม่รัน migration จะพังเป็นช่วง ๆ ตอนมีคนใช้ฟีเจอร์นั้น)
 * คืนรายการ migration ที่ยังขาด (เรียงตามลำดับ ไม่ซ้ำ) — ว่าง = ครบ
 */
export async function missingMigrations(pool: Pool): Promise<string[]> {
  const have = await rows<{ table_name: string; column_name: string }>(
    pool,
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  )
  const set = new Set(have.map((r) => `${r.table_name}.${r.column_name}`))
  const tables = new Set(have.map((r) => r.table_name))
  const missing = REQUIRED_SCHEMA.filter((r) => (r.column ? !set.has(`${r.table}.${r.column}`) : !tables.has(r.table))).map((r) => r.migration)
  return [...new Set(missing)].sort()
}
