/**
 * ข้อมูลตัวอย่างสำหรับภาพจำลองผลิตภัณฑ์บนหน้า Landing (หน้าสาธารณะ)
 * ตั้งใจแยกจากข้อมูลจริงของกองยาน เพื่อไม่ให้หน้าที่ไม่ต้องล็อกอินเผยรหัสรถ/ระดับแบตของลูกค้า
 */
import type { ChargingSession, IceVehicle } from '@/types'

export const SAMPLE_VEHICLE_ROWS = [
  { id: 'EV-001', soc: 85 },
  { id: 'EV-004', soc: 78 },
  { id: 'EV-003', soc: 18 },
]

export const SAMPLE_ICE: IceVehicle[] = [
  { id: 'ICE-22', model: 'Toyota Yaris Ativ', kmPerDay: 74, maxKmPerDay: 140, fuelPerMonth: 6100, readinessScore: 95, recommendedEv: 'BYD Dolphin' },
  { id: 'ICE-21', model: 'Toyota Hilux Revo', kmPerDay: 96, maxKmPerDay: 180, fuelPerMonth: 9800, readinessScore: 92, recommendedEv: 'BYD Shark 6' },
  { id: 'ICE-23', model: 'Honda City', kmPerDay: 120, maxKmPerDay: 260, fuelPerMonth: 7900, readinessScore: 81, recommendedEv: 'MG4 Electric' },
  { id: 'ICE-25', model: 'Isuzu D-Max', kmPerDay: 160, maxKmPerDay: 380, fuelPerMonth: 12500, readinessScore: 63, recommendedEv: 'BYD Shark 6 (PHEV)' },
  { id: 'ICE-24', model: 'Toyota Commuter', kmPerDay: 210, maxKmPerDay: 420, fuelPerMonth: 16800, readinessScore: 48, recommendedEv: 'รอรุ่นรถตู้ EV ระยะไกล' },
]

export const SAMPLE_SESSION: ChargingSession = {
  vehicleId: 'EV-004',
  stationName: 'Depot A',
  start: '10:05',
  fromSoc: 41,
  nowSoc: 78,
  targetSoc: 90,
  kw: 60,
  kwh: 14.2,
  cost: 59.6,
  eta: '18 นาที',
}
export const SAMPLE_SESSION_MODEL = 'Neta V'

/** ใช้เมื่อเรียก API ไม่ได้ (เช่น ตอน build หรือ API ล่ม) — หน้า Landing ยังแสดงผลได้ */
export const FALLBACK_OVERVIEW = {
  vehicleCount: 0,
  onlineCount: 0,
  avgSoc: 0,
  chargingCount: 0,
  efficiency: 0,
  weekKwh: 0,
  latestMonthKwh: 0,
  latestMonthCo2Tons: 0,
  yearCo2Tons: 0,
  yearFuelSavings: 0,
}
