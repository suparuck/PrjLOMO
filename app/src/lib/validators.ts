/**
 * ตรวจสอบข้อมูลฟอร์ม — ใช้ทั้งฝั่งฟอร์ม (แจ้งผิดทันที) และฝั่ง API (ตัดสินจริง)
 * ทุกฟังก์ชันคืน { errors, value } โดย value เป็นข้อมูลที่ปรับรูปแบบแล้ว (ว่างถ้ามี error)
 */
import type { InviteUserDraft, NewDriverDraft, NewStationDraft, NewVehicleDraft, UserRole } from '@/types'

export type Errors = Record<string, string>

export const USER_ROLES: Record<UserRole, { label: string; badge: string; permissions: string }> = {
  admin: { label: 'ผู้ดูแลระบบ', badge: 's-driving', permissions: 'ทั้งหมด' },
  manager: { label: 'ผู้จัดการกองยาน', badge: 's-charging', permissions: 'รถ คนขับ รายงาน' },
  viewer: { label: 'ผู้ดูรายงาน', badge: 's-parked', permissions: 'รายงานเท่านั้น' },
}

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

/** แปลงข้อความตัวเลข: คืน NaN ถ้าไม่ใช่ตัวเลขล้วน (อนุญาตทศนิยมเมื่อ allowDecimal) */
function parseNum(s: string, allowDecimal = false) {
  const t = s.trim().replace(/,/g, '')
  const re = allowDecimal ? /^\d+(\.\d+)?$/ : /^\d+$/
  return re.test(t) ? Number(t) : NaN
}

export function validateNewVehicle(
  d: NewVehicleDraft,
  ctx: { ids: string[]; plates: string[]; freeDriverIds: string[] },
): { errors: Errors; value?: { id: string; model: string; plate: string; driverId: string; batteryKwh: number; soc: number; odometer: number } } {
  const errors: Errors = {}
  const id = normalizeVehicleId(d.id)
  const model = d.model.trim()
  const plate = normalizePlate(d.plate)
  const batteryKwh = parseNum(d.batteryKwh, true)
  const soc = parseNum(d.soc)
  const odometer = parseNum(d.odometer)

  if (!id) errors.id = 'กรุณากรอกรหัสรถ'
  else if (!/^EV-\d{3,4}$/.test(id)) errors.id = 'รูปแบบรหัสรถคือ EV- ตามด้วยเลข 3–4 หลัก เช่น EV-013'
  else if (ctx.ids.includes(id)) errors.id = 'รหัสรถนี้มีอยู่แล้ว'

  if (!model) errors.model = 'กรุณากรอกรุ่นรถ'
  else if (model.length > 40) errors.model = 'รุ่นรถต้องไม่เกิน 40 ตัวอักษร'

  if (!plate) errors.plate = 'กรุณากรอกทะเบียนรถ'
  else if (!PLATE_RE.test(plate)) errors.plate = 'รูปแบบทะเบียนไม่ถูกต้อง เช่น 1กข 1234'
  else if (ctx.plates.map(normalizePlate).includes(plate)) errors.plate = 'ทะเบียนนี้มีอยู่แล้ว'

  if (Number.isNaN(batteryKwh)) errors.batteryKwh = 'กรุณากรอกความจุแบตเป็นตัวเลข'
  else if (batteryKwh < 10 || batteryKwh > 200) errors.batteryKwh = 'ความจุแบตต้องอยู่ระหว่าง 10–200 kWh'

  if (Number.isNaN(soc)) errors.soc = 'กรุณากรอกระดับแบตเป็นตัวเลข'
  else if (soc > 100) errors.soc = 'ระดับแบตต้องอยู่ระหว่าง 0–100%'

  if (Number.isNaN(odometer)) errors.odometer = 'กรุณากรอกเลขไมล์เป็นตัวเลข'
  else if (odometer > 999999) errors.odometer = 'เลขไมล์ต้องไม่เกิน 999,999 กม.'

  if (d.driverId && !ctx.freeDriverIds.includes(d.driverId)) errors.driverId = 'คนขับคนนี้ไม่ว่างหรือไม่มีในระบบ'

  return Object.keys(errors).length ? { errors } : { errors, value: { id, model, plate, driverId: d.driverId, batteryKwh, soc, odometer } }
}

export function validateNewDriver(
  d: NewDriverDraft,
  ctx: { phones: string[]; freeVehicleIds: string[] },
): { errors: Errors; value?: { name: string; phone: string; vehicleId: string } } {
  const errors: Errors = {}
  const name = d.name.trim().replace(/\s+/g, ' ')
  const phone = normalizePhone(d.phone)

  if (!name) errors.name = 'กรุณากรอกชื่อ-นามสกุล'
  else if (name.length < 2 || name.length > 60) errors.name = 'ชื่อต้องยาว 2–60 ตัวอักษร'

  if (!d.phone.trim()) errors.phone = 'กรุณากรอกเบอร์โทร'
  else if (!/^0\d{2}-\d{3}-\d{4}$/.test(phone)) errors.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0 เช่น 081-234-5678'
  else if (ctx.phones.map(normalizePhone).includes(phone)) errors.phone = 'เบอร์โทรนี้ถูกใช้แล้ว'

  if (d.vehicleId && !ctx.freeVehicleIds.includes(d.vehicleId)) errors.vehicleId = 'รถคันนี้มีคนขับประจำแล้วหรือไม่มีในระบบ'

  return Object.keys(errors).length ? { errors } : { errors, value: { name, phone, vehicleId: d.vehicleId } }
}

export function validateInvite(
  d: InviteUserDraft,
  ctx: { emails: string[] },
): { errors: Errors; value?: { email: string; role: UserRole } } {
  const errors: Errors = {}
  const email = normalizeEmail(d.email)

  if (!email) errors.email = 'กรุณากรอกอีเมล'
  else if (!EMAIL_RE.test(email)) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง'
  else if (ctx.emails.map(normalizeEmail).includes(email)) errors.email = 'อีเมลนี้อยู่ในระบบแล้ว'

  if (!d.role || !(d.role in USER_ROLES)) errors.role = 'กรุณาเลือกบทบาท'

  return Object.keys(errors).length ? { errors } : { errors, value: { email, role: d.role as UserRole } }
}

export function validateChargingTarget(target: number, nowSoc: number): string | null {
  if (!Number.isInteger(target)) return 'เป้าหมายต้องเป็นจำนวนเต็ม'
  if (target > 100) return 'เป้าหมายต้องไม่เกิน 100%'
  if (target < nowSoc) return `เป้าหมายต้องไม่ต่ำกว่าระดับแบตปัจจุบัน (${nowSoc}%)`
  return null
}

/** นาที → ข้อความไทย เช่น 18 → "18 นาที", 130 → "2 ชม. 10 นาที" */
export function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  if (m < 60) return `${m} นาที`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`
}

/** รหัสผ่านตอนตอบรับคำเชิญ: 8–128 ตัวอักษร ต้องมีทั้งตัวอักษรและตัวเลข (กฎเดียวกับ api/src/lib/validators.ts) */
/** รหัสผ่านตั้งต้นของข้อมูลเดโม — ห้ามใช้ (ต้องตรงกับ api/src/lib/defaults.ts) */
export const DEFAULT_PASSWORDS = ['demo1234']

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'
  if (pw.length > 128) return 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'
  if (DEFAULT_PASSWORDS.includes(pw)) return 'รหัสผ่านนี้เป็นรหัสตั้งต้นของระบบ ห้ามใช้ กรุณาตั้งรหัสอื่น'
  return null
}

/** อีเมลที่กรอกในฟอร์มลืมรหัสผ่าน */
export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw)
  if (!email) return 'กรุณากรอกอีเมล'
  if (!EMAIL_RE.test(email)) return 'รูปแบบอีเมลไม่ถูกต้อง'
  return null
}

/** เปลี่ยนรหัสผ่านในหน้าบัญชี: ต้องกรอกรหัสปัจจุบัน และรหัสใหม่ต้องผ่านกฎและไม่ซ้ำรหัสเดิม */
export function validatePasswordChange(d: { current: string; next: string; confirm: string }): Errors {
  const errors: Errors = {}
  if (!d.current) errors.current = 'กรุณากรอกรหัสผ่านปัจจุบัน'
  const pw = validatePassword(d.next)
  if (pw) errors.next = pw
  else if (d.next === d.current) errors.next = 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน'
  if (!pw && d.confirm !== d.next) errors.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
  return errors
}

/** ตรวจฟอร์มสถานีชาร์จ (กฎเดียวกับ checkStationFields ใน api/src/lib/validators.ts) — names = ชื่อสถานีอื่นที่มีอยู่แล้ว, busy = ช่องที่ใช้งานอยู่ (เมื่อแก้ไข) */
export function validateStation(
  d: NewStationDraft,
  ctx: { names: string[]; busy?: number },
): { errors: Errors; value?: { name: string; type: 'depot' | 'public'; network: string; power: string; ports: number; pricePerKwh: number; lat: number; lng: number } } {
  const errors: Errors = {}
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ')
  const name = clean(d.name)
  const network = clean(d.network)
  const power = clean(d.power)
  const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : NaN)

  if (!name) errors.name = 'กรุณากรอกชื่อสถานี'
  else if (name.length < 2 || name.length > 80) errors.name = 'ชื่อสถานีต้องยาว 2–80 ตัวอักษร'
  else if (ctx.names.some((n) => n.trim().toLowerCase() === name.toLowerCase())) errors.name = 'มีสถานีชื่อนี้อยู่แล้ว'

  if (!network) errors.network = 'กรุณากรอกเครือข่าย/ผู้ให้บริการ'
  else if (network.length > 60) errors.network = 'เครือข่ายต้องไม่เกิน 60 ตัวอักษร'

  if (!power) errors.power = 'กรุณากรอกกำลังชาร์จ'
  else if (power.length > 60) errors.power = 'กำลังชาร์จต้องไม่เกิน 60 ตัวอักษร'

  const ports = num(d.ports)
  if (!d.ports.trim()) errors.ports = 'กรุณากรอกจำนวนช่องชาร์จ'
  else if (!Number.isInteger(ports) || ports < 1 || ports > 100) errors.ports = 'จำนวนช่องต้องเป็นจำนวนเต็ม 1–100'
  else if (ctx.busy && ports < ctx.busy) errors.ports = `ตอนนี้ใช้งานอยู่ ${ctx.busy} ช่อง ลดจำนวนช่องต่ำกว่านี้ไม่ได้`

  const price = num(d.pricePerKwh)
  if (!d.pricePerKwh.trim()) errors.pricePerKwh = 'กรุณากรอกราคาต่อ kWh'
  else if (Number.isNaN(price) || price < 0 || price > 99.99) errors.pricePerKwh = 'ราคาต้องเป็นตัวเลข 0–99.99 บาท'
  else if (Math.round(price * 100) / 100 !== price) errors.pricePerKwh = 'ราคาใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง'

  const lat = num(d.lat)
  if (!d.lat.trim()) errors.lat = 'กรุณากรอกละติจูด'
  else if (Number.isNaN(lat) || lat < -90 || lat > 90) errors.lat = 'ละติจูดต้องอยู่ระหว่าง −90 ถึง 90'
  const lng = num(d.lng)
  if (!d.lng.trim()) errors.lng = 'กรุณากรอกลองจิจูด'
  else if (Number.isNaN(lng) || lng < -180 || lng > 180) errors.lng = 'ลองจิจูดต้องอยู่ระหว่าง −180 ถึง 180'

  return Object.keys(errors).length ? { errors } : { errors, value: { name, type: d.type, network, power, ports, pricePerKwh: price, lat, lng } }
}
