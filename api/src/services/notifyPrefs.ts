import type { Pool } from 'pg'
import { one } from '../db'

/**
 * การรับอีเมลแจ้งเตือนรายบุคคล (ผู้ใช้ตั้งเองที่ "บัญชีของฉัน"; ไม่มีคีย์ = เปิด):
 *  - alertEmail  อีเมลแจ้งเตือนเหตุการณ์กองยาน (วิกฤต/เตือน) — ใช้กับ admin/manager เท่านั้น
 *  - loginFailed เตือนเมื่อมีคนใส่รหัสผ่าน/รหัส 2FA ผิดซ้ำ
 *  - newNetwork  เตือนเมื่อเข้าสู่ระบบจากเครือข่ายใหม่
 * ปิด loginFailed/newNetwork ต้องยืนยันรหัสผ่านซ้ำ (session ที่ถูกขโมยจะปิดเสียงเตือนที่เจ้าของบัญชีจะได้รับไม่ได้)
 */
export interface NotifyPrefs {
  alertEmail: boolean
  loginFailed: boolean
  newNetwork: boolean
}
export const SECURITY_PREFS = ['loginFailed', 'newNetwork'] as const
export const normalizePrefs = (raw: unknown): NotifyPrefs => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const b = (k: string) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : true)
  return { alertEmail: b('alertEmail'), loginFailed: b('loginFailed'), newNetwork: b('newNetwork') }
}
export async function getPrefs(pool: Pool, userId: string): Promise<NotifyPrefs> {
  return normalizePrefs((await one<{ p: unknown }>(pool, 'select notify_prefs as p from users where id = $1', [userId]))?.p)
}
export async function savePrefs(pool: Pool, userId: string, prefs: NotifyPrefs): Promise<void> {
  await pool.query('update users set notify_prefs = $2::jsonb where id = $1', [userId, JSON.stringify(prefs)])
}
