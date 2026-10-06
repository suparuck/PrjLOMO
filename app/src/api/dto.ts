/** รูปข้อมูลที่ API ส่งมา (ดู /docs ของ API) — mappers.ts แปลงเป็นรูปที่หน้าเว็บใช้ */
import type { VehicleStatus } from '@/types'

export interface VehicleDTO {
  id: string
  model: string
  plate: string
  driverId: string | null
  soc: number
  soh: number
  rangeKm: number
  speedKmh: number
  status: 'driving' | 'charging' | 'parked' | 'low' | 'offline'
  location: string
  lat: number
  lng: number
  odometerKm: number
  efficiency: number
  batteryKwh: number
  batteryTempC: number | null
  lastSeenAt: string | null
}

export interface DriverDTO {
  id: string
  name: string
  phone: string
  score: number | null
  km30d: number
  trips30d: number
  events30d: number
  vehicleId: string | null
  /** มีเฉพาะรายการแบ่งหน้า */
  rank?: number | null
  vehicleModel?: string | null
  vehicleEfficiency?: number | null
  vehicleStatus?: VehicleStatus | null
}

export interface StationDTO {
  id: string
  name: string
  type: 'depot' | 'public'
  network: string
  lat: number
  lng: number
  ports: number
  busyPorts: number
  power: string
  pricePerKwh: number
}

export interface SessionDTO {
  id: number
  vehicleId: string
  stationId: string
  stationName: string
  status: 'active' | 'completed' | 'stopped'
  startedAt: string
  endedAt: string | null
  fromSoc: number
  nowSoc: number
  toSoc: number | null
  targetSoc: number
  kw: number
  kwh: number
  cost: number
  etaMinutes: number | null
}

export interface AlertDTO {
  id: number
  severity: 'critical' | 'warning' | 'info'
  type: 'battery' | 'charging' | 'device' | 'maint' | 'driving' | 'geofence'
  title: string
  text: string
  vehicleId: string | null
  createdAt: string
  acknowledgedAt: string | null
}

export interface UserDTO {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'viewer'
  status: 'active' | 'invited' | 'disabled'
  lastLoginAt: string | null
  invitedAt: string | null
  twoFactorEnabled?: boolean
}

/** ผลของ POST /users/invite และ POST /users/:id/invite-link */
export interface InviteDTO extends UserDTO {
  inviteToken: string
  inviteExpiresAt: string
  /** true = ระบบส่งอีเมลคำเชิญให้แล้ว */
  emailed: boolean
}

export interface IntegrationDTO {
  key: string
  name: string
  text: string
  logo: string
  colorToken: string
  connected: boolean
  actionLabel: string | null
}

export interface VehicleDetailDTO {
  vehicle: VehicleDTO
  driver: DriverDTO | null
  socSeries: { labels: string[]; values: number[] }
  trips: {
    startedAt: string
    origin: string
    destination: string
    distanceKm: number
    durationMin: number
    energyKwh: number
    efficiency: number | null
    endSoc: number | null
  }[]
  maintenance: {
    id: number
    kind: 'service' | 'software' | 'battery'
    title: string
    detail: string
    dueDate: string | null
    dueOdometerKm: number | null
  }[]
}
