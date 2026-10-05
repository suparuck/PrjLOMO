/**
 * กฎตรวจสอบข้อมูลฟอร์ม — สอดคล้องกับ app/src/lib/validators.ts ฝั่งเว็บ (ฝั่งเว็บใช้แจ้งผิดทันที ฝั่งนี้เป็นผู้ตัดสินจริง)
 * ถ้าแก้กฎ ต้องแก้ทั้งสองที่
 */
import { invalid } from '../errors'

export type UserRole = 'admin' | 'manager' | 'viewer'

export const normalizeVehicleId = (s: string) => s.trim().toUpperCase()
/** ทะเบียนไทย: ให้มีช่องว่างระหว่างอักษรกับเลข เช่น "1กข1234" → "1กข 1234" */
export const normalizePlate = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/([ก-ฮ])\s*([0-9])/, '$1 $2')
export const normalizePhone = (s: string) => {
  const d = s.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : s.trim()
}
export const normalizeEmail = (s: string) => s.trim().toLowerCase()

const PLATE_RE = /^[0-9]{0,2}[ก-ฮ]{1,3} [0-9]{1,4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const VEHICLE_ID_RE = /^EV-\d{3,4}$/

/** ตรวจรูปแบบ แล้วคืนค่าที่ปรับรูปแบบแล้ว หรือโยน 422 พร้อมข้อความรายฟิลด์ */
export function checkVehicleFields(input: { id?: string; model?: string; plate?: string }, partial = false) {
  const errors: Record<string, string> = {}
  const out: { id?: string; model?: string; plate?: string } = {}

  if (input.id !== undefined) {
    out.id = normalizeVehicleId(input.id)
    if (!VEHICLE_ID_RE.test(out.id)) errors.id = 'รูปแบบรหัสรถคือ EV- ตามด้วยเลข 3–4 หลัก เช่น EV-013'
  } else if (!partial) errors.id = 'กรุณากรอกรหัสรถ'

  if (input.model !== undefined) {
    out.model = input.model.trim()
    if (!out.model) errors.model = 'กรุณากรอกรุ่นรถ'
    else if (out.model.length > 40) errors.model = 'รุ่นรถต้องไม่เกิน 40 ตัวอักษร'
  } else if (!partial) errors.model = 'กรุณากรอกรุ่นรถ'

  if (input.plate !== undefined) {
    out.plate = normalizePlate(input.plate)
    if (!out.plate) errors.plate = 'กรุณากรอกทะเบียนรถ'
    else if (!PLATE_RE.test(out.plate)) errors.plate = 'รูปแบบทะเบียนไม่ถูกต้อง เช่น 1กข 1234'
  } else if (!partial) errors.plate = 'กรุณากรอกทะเบียนรถ'

  if (Object.keys(errors).length) throw invalid(errors)
  return out
}

export function checkDriverFields(input: { name?: string; phone?: string }, partial = false) {
  const errors: Record<string, string> = {}
  const out: { name?: string; phone?: string } = {}

  if (input.name !== undefined) {
    out.name = input.name.trim().replace(/\s+/g, ' ')
    if (!out.name) errors.name = 'กรุณากรอกชื่อ-นามสกุล'
    else if (out.name.length < 2 || out.name.length > 60) errors.name = 'ชื่อต้องยาว 2–60 ตัวอักษร'
  } else if (!partial) errors.name = 'กรุณากรอกชื่อ-นามสกุล'

  if (input.phone !== undefined) {
    out.phone = normalizePhone(input.phone)
    if (!input.phone.trim()) errors.phone = 'กรุณากรอกเบอร์โทร'
    else if (!/^0\d{2}-\d{3}-\d{4}$/.test(out.phone)) errors.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0 เช่น 081-234-5678'
  } else if (!partial) errors.phone = 'กรุณากรอกเบอร์โทร'

  if (Object.keys(errors).length) throw invalid(errors)
  return out
}

export function checkEmail(raw: string) {
  const email = normalizeEmail(raw)
  if (!email) throw invalid({ email: 'กรุณากรอกอีเมล' })
  if (!EMAIL_RE.test(email)) throw invalid({ email: 'รูปแบบอีเมลไม่ถูกต้อง' })
  return email
}

export const USER_ROLE_RANK: Record<UserRole, number> = { viewer: 1, manager: 2, admin: 3 }

/** รหัสผ่านตอนตอบรับคำเชิญ: 8–128 ตัวอักษร ต้องมีทั้งตัวอักษรและตัวเลข (กฎเดียวกับ app/src/lib/validators.ts) */
export function checkPassword(pw: string) {
  const errors: Record<string, string> = {}
  if (pw.length < 8) errors.password = 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'
  else if (pw.length > 128) errors.password = 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร'
  else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errors.password = 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'
  if (Object.keys(errors).length) throw invalid(errors)
  return pw
}

export function checkDisplayName(raw: string) {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60) throw invalid({ name: 'ชื่อต้องยาว 2–60 ตัวอักษร' })
  return name
}
