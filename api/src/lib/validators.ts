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
import { DEFAULT_PASSWORDS } from './defaults'

export function checkPassword(pw: string, field = 'password') {
  const errors: Record<string, string> = {}
  if (pw.length < 8) errors[field] = 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'
  else if (pw.length > 128) errors[field] = 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร'
  else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errors[field] = 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'
  else if (DEFAULT_PASSWORDS.includes(pw)) errors[field] = 'รหัสผ่านนี้เป็นรหัสตั้งต้นของระบบ ห้ามใช้ กรุณาตั้งรหัสอื่น'
  if (Object.keys(errors).length) throw invalid(errors)
  return pw
}

export function checkDisplayName(raw: string) {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60) throw invalid({ name: 'ชื่อต้องยาว 2–60 ตัวอักษร' })
  return name
}

/**
 * ตรวจ/จัดรูปข้อมูลสถานีชาร์จ (กฎเดียวกับ validateStation ใน app/src/lib/validators.ts)
 * partial=true ใช้กับการแก้ไข: ตรวจเฉพาะฟิลด์ที่ส่งมา
 */
export function checkStationFields(
  input: { name?: string; network?: string; power?: string; pricePerKwh?: number },
  partial = false,
) {
  const errors: Record<string, string> = {}
  const out: { name?: string; network?: string; power?: string; pricePerKwh?: number } = {}
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

  if (input.name !== undefined || !partial) {
    out.name = clean(input.name ?? '')
    if (!out.name) errors.name = 'กรุณากรอกชื่อสถานี'
    else if (out.name.length < 2 || out.name.length > 80) errors.name = 'ชื่อสถานีต้องยาว 2–80 ตัวอักษร'
  }
  if (input.network !== undefined || !partial) {
    out.network = clean(input.network ?? '')
    if (!out.network) errors.network = 'กรุณากรอกเครือข่าย/ผู้ให้บริการ (เช่น ภายในองค์กร, PEA VOLTA)'
    else if (out.network.length > 60) errors.network = 'เครือข่ายต้องไม่เกิน 60 ตัวอักษร'
  }
  if (input.power !== undefined || !partial) {
    out.power = clean(input.power ?? '')
    if (!out.power) errors.power = 'กรุณากรอกกำลังชาร์จ (เช่น AC 22 kW, DC 120 kW)'
    else if (out.power.length > 60) errors.power = 'กำลังชาร์จต้องไม่เกิน 60 ตัวอักษร'
  }
  if (input.pricePerKwh !== undefined) {
    // ทศนิยมไม่เกิน 2 ตำแหน่ง (เก็บเป็น numeric(5,2))
    if (Math.round(input.pricePerKwh * 100) / 100 !== input.pricePerKwh) errors.pricePerKwh = 'ราคาใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง'
    else out.pricePerKwh = input.pricePerKwh
  }
  if (Object.keys(errors).length) throw invalid(errors)
  return out
}
