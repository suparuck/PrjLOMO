import type { Pool } from 'pg'
import { one, rows, withTx } from '../db'
import { conflict, invalid, notFound } from '../errors'
import { DEFAULT_PASSWORDS } from '../lib/defaults'
import { checkDisplayName, checkEmail, checkPassword, type UserRole } from '../lib/validators'

export interface DefaultPasswordUser {
  id: string
  email: string
  name: string
  role: UserRole
}

/**
 * บัญชีที่ใช้งานอยู่และยังใช้รหัสผ่านตั้งต้นของระบบ (ข้อมูลเดโมตอนติดตั้ง) — ตรวจด้วย bcrypt ในฐานข้อมูล
 * ไม่คืนรหัสผ่านหรือ hash; ใช้เตือนผู้ดูแลและให้ CLI ปิดบัญชีเหล่านี้ก่อนขึ้นระบบจริง
 */
export async function findDefaultPasswordUsers(pool: Pool): Promise<DefaultPasswordUser[]> {
  return rows<DefaultPasswordUser>(
    pool,
    `select id, email, name, role::text as role from users
      where status = 'active' and password_hash is not null
        and exists (select 1 from unnest($1::text[]) p where password_hash = crypt(p, password_hash))
      order by (role = 'admin') desc, email`,
    [DEFAULT_PASSWORDS],
  )
}

/** สร้างผู้ดูแลระบบ (ใช้ตอนติดตั้งครั้งแรกหรือกู้สิทธิ์) — อีเมลซ้ำ = ผิดพลาด ไม่เขียนทับบัญชีเดิม */
export async function createAdmin(pool: Pool, input: { email: string; name: string; password: string }) {
  const email = checkEmail(input.email)
  const name = checkDisplayName(input.name)
  const password = checkPassword(input.password)
  const row = await one<{ id: string }>(
    pool,
    `insert into users (email, name, role, status, password_hash, last_login_at)
     values ($1, $2, 'admin', 'active', crypt($3, gen_salt('bf', 10)), null)
     on conflict do nothing
     returning id`,
    [email, name, password],
  )
  if (!row) throw conflict('อีเมลนี้อยู่ในระบบแล้ว — ใช้ set-password เพื่อตั้งรหัสผ่านใหม่ หรือแก้บทบาทที่หน้าตั้งค่า', { email: 'อีเมลนี้อยู่ในระบบแล้ว' })
  return { id: row.id, email, name }
}

/** ตั้งรหัสผ่านใหม่ให้บัญชีที่ใช้งานอยู่ — ทุก session เดิมหลุด และลิงก์รีเซ็ตที่ค้างอยู่ใช้ไม่ได้ */
export async function setPassword(pool: Pool, input: { email: string; password: string }) {
  const email = checkEmail(input.email)
  const password = checkPassword(input.password)
  return withTx(pool, async (c) => {
    const u = await one<{ id: string }>(
      c,
      `update users set password_hash = crypt($2, gen_salt('bf', 10)), session_version = session_version + 1
        where lower(email) = lower($1) and status = 'active' returning id`,
      [email, password],
    )
    if (!u) throw notFound('ผู้ใช้ที่ใช้งานอยู่')
    await c.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [u.id])
    return { id: u.id, email }
  })
}

/**
 * ปิดบัญชีที่ยังใช้รหัสผ่านตั้งต้นทั้งหมด (เหลือเฉพาะบัญชีที่เจ้าของเปลี่ยนรหัสแล้ว)
 * ปฏิเสธถ้าทำแล้วจะไม่เหลือผู้ดูแลที่ใช้งานอยู่ — ต้องสร้าง/เปลี่ยนรหัสผู้ดูแลจริงก่อน
 */
export async function retireDefaultPasswordUsers(pool: Pool): Promise<DefaultPasswordUser[]> {
  return withTx(pool, async (c) => {
    await c.query("select id from users where role = 'admin' and status = 'active' for update")
    const weak = await findDefaultPasswordUsers(c as unknown as Pool)
    if (weak.length === 0) return []
    const ids = weak.map((u) => u.id)
    const remaining = await one<{ n: number }>(
      c,
      "select count(*)::int as n from users where role = 'admin' and status = 'active' and not (id = any($1::uuid[]))",
      [ids],
    )
    if (!remaining || remaining.n === 0) {
      throw invalid({ _: 'ปิดแล้วจะไม่เหลือผู้ดูแลระบบที่ใช้งานอยู่ — สร้างผู้ดูแลคนแรกด้วย create-admin (หรือเปลี่ยนรหัสผ่านบัญชี admin) ก่อน' })
    }
    await c.query("update users set status = 'disabled', session_version = session_version + 1 where id = any($1::uuid[])", [ids])
    await c.query('update password_resets set used_at = now() where user_id = any($1::uuid[]) and used_at is null', [ids])
    return weak
  })
}
