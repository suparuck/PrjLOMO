/**
 * การเขียนข้อมูลของ mock API (เก็บในหน่วยความจำ — รีสตาร์ทเซิร์ฟเวอร์แล้วหาย)
 * ทุกฟังก์ชันตรวจข้อมูลซ้ำที่นี่เสมอ ไม่เชื่อค่าจากฟอร์ม เมื่อต่อ backend จริงให้ย้าย logic นี้ไปฝั่งเซิร์ฟเวอร์
 */
import * as db from './mockData'
import { validateChargingTarget, validateInvite, validateNewDriver, validateNewVehicle, formatDuration, USER_ROLES } from '../lib/validators'
import type { AppUser, Driver, InviteUserDraft, NewDriverDraft, NewVehicleDraft, Result, Vehicle } from '../types'

const freeDriverIds = () => db.drivers.filter((d) => !db.vehicles.some((v) => v.driverId === d.id)).map((d) => d.id)
const freeVehicleIds = () => db.vehicles.filter((v) => !v.driverId).map((v) => v.id)

export function addVehicle(draft: NewVehicleDraft): Result<Vehicle> {
  const { errors, value } = validateNewVehicle(draft, {
    ids: db.vehicles.map((v) => v.id),
    plates: db.vehicles.map((v) => v.plate),
    freeDriverIds: freeDriverIds(),
  })
  if (!value) return { ok: false, errors }

  const efficiency = 15 // kWh/100กม. ค่าเริ่มต้นจนกว่าจะมีข้อมูลการขับจริง
  const vehicle: Vehicle = {
    id: value.id,
    model: value.model,
    plate: value.plate,
    driverId: value.driverId,
    soc: value.soc,
    soh: 100,
    range: Math.round(((value.soc / 100) * value.batteryKwh) / (efficiency / 100)),
    speed: 0,
    status: 'offline', // ยังไม่ได้ติดตั้งอุปกรณ์ติดตาม จึงยังไม่มีสัญญาณ
    location: 'ยังไม่มีสัญญาณ GPS',
    lat: db.org.center[0],
    lng: db.org.center[1],
    odometer: value.odometer,
    efficiency,
    batteryKwh: value.batteryKwh,
  }
  db.vehicles.push(vehicle)
  return { ok: true, data: vehicle }
}

export function addDriver(draft: NewDriverDraft): Result<Driver> {
  const { errors, value } = validateNewDriver(draft, {
    phones: db.drivers.map((d) => d.phone),
    freeVehicleIds: freeVehicleIds(),
  })
  if (!value) return { ok: false, errors }

  const next = Math.max(0, ...db.drivers.map((d) => Number(d.id.slice(1)) || 0)) + 1
  // คนขับใหม่ยังไม่มีทริป: คะแนน/ระยะทาง/เหตุการณ์ = 0 (UI แสดง "–" และไม่นับในค่าเฉลี่ย)
  const driver: Driver = { id: `D${String(next).padStart(2, '0')}`, name: value.name, phone: value.phone, score: 0, km: 0, events: 0, trips: 0 }
  db.drivers.push(driver)
  if (value.vehicleId) {
    const v = db.vehicles.find((x) => x.id === value.vehicleId)
    if (v) v.driverId = driver.id
  }
  return { ok: true, data: driver }
}

export function inviteUser(draft: InviteUserDraft): Result<AppUser> {
  const { errors, value } = validateInvite(draft, { emails: db.users.map((u) => u.email) })
  if (!value) return { ok: false, errors }

  const local = value.email.split('@')[0]
  const r = USER_ROLES[value.role]
  const user: AppUser = {
    name: local,
    email: value.email,
    initials: local.slice(0, 2).toUpperCase(),
    role: r.label,
    roleBadge: r.badge,
    permissions: r.permissions,
    lastSeen: 'รอตอบรับคำเชิญ',
  }
  db.users.push(user)
  return { ok: true, data: user }
}

/** ปรับเป้าหมายชาร์จ: เวลาที่เหลือปรับตามสัดส่วนของ % ที่ต้องชาร์จเพิ่ม */
export function setChargingTarget(vehicleId: string, target: number): Result<{ eta: string }> {
  const s = db.sessions.find((x) => x.vehicleId === vehicleId)
  if (!s) return { ok: false, errors: { _: 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)' } }
  const err = validateChargingTarget(target, s.nowSoc)
  if (err) return { ok: false, errors: { target: err } }

  const oldRemain = s.targetSoc - s.nowSoc
  const newRemain = target - s.nowSoc
  const oldMins = parseInt(s.eta, 10)
  const mins = newRemain === 0 ? 0 : oldRemain > 0 && Number.isFinite(oldMins) ? Math.max(1, (oldMins * newRemain) / oldRemain) : fallbackMinutes(s.vehicleId, newRemain, s.kw)
  s.targetSoc = target
  s.eta = formatDuration(mins)
  return { ok: true, data: { eta: s.eta } }
}

function fallbackMinutes(vehicleId: string, remainPct: number, kw: number) {
  const cap = db.vehicles.find((v) => v.id === vehicleId)?.batteryKwh ?? 50
  return (((remainPct / 100) * cap) / kw) * 60
}

/** หยุดชาร์จ: ย้ายเซสชันเข้าประวัติ และเปลี่ยนสถานะรถจาก "กำลังชาร์จ" */
export function stopCharging(vehicleId: string): Result<{ vehicleId: string }> {
  const i = db.sessions.findIndex((x) => x.vehicleId === vehicleId)
  if (i < 0) return { ok: false, errors: { _: 'ไม่พบเซสชันการชาร์จ (อาจหยุดชาร์จไปแล้ว)' } }
  const s = db.sessions[i]

  const [h, m] = s.start.split(':').map(Number)
  const mins = Math.max(0, db.MOCK_NOW_MINUTES - (h * 60 + m))

  db.history.unshift({
    vehicleId: s.vehicleId,
    stationName: s.stationName,
    date: `วันนี้ ${s.start}`,
    duration: formatDuration(mins),
    kwh: s.kwh,
    cost: s.cost,
    fromSoc: s.fromSoc,
    toSoc: s.nowSoc,
  })
  db.sessions.splice(i, 1)

  const v = db.vehicles.find((x) => x.id === vehicleId)
  if (v) {
    v.soc = s.nowSoc
    v.status = s.nowSoc < 30 ? 'low' : 'parked'
  }
  return { ok: true, data: { vehicleId } }
}
