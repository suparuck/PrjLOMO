/**
 * รหัสผ่านตั้งต้นของข้อมูลเดโม (db/init/02_reference.sql) — ห้ามใช้เป็นรหัสผ่านจริง
 * ระบบปฏิเสธเมื่อตั้งรหัสผ่านเป็นค่าเหล่านี้ และตรวจหาบัญชีที่ยังใช้อยู่เพื่อเตือน/ปิด (services/accounts.ts)
 * ถ้าแก้รายการนี้ ให้แก้ DEFAULT_PASSWORDS ใน app/src/lib/validators.ts ด้วย
 */
export const DEFAULT_PASSWORDS = ['demo1234']
