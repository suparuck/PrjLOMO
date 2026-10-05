export type VehicleStatus = 'driving' | 'charging' | 'parked' | 'low' | 'offline'

export interface Vehicle {
  id: string
  model: string
  plate: string
  driverId: string
  soc: number
  soh: number
  range: number
  speed: number
  status: VehicleStatus
  location: string
  lat: number
  lng: number
  odometer: number
  efficiency: number // kWh/100km
  batteryKwh: number
}

export interface Driver {
  id: string
  name: string
  phone: string
  score: number
  km: number
  events: number
  trips: number
}

export interface Station {
  id: string
  name: string
  type: 'depot' | 'public'
  network: string
  lat: number
  lng: number
  ports: number
  busy: number
  power: string
  pricePerKwh: number
}

export interface ChargingSession {
  vehicleId: string
  stationName: string
  start: string
  fromSoc: number
  nowSoc: number
  targetSoc: number
  kw: number
  kwh: number
  cost: number
  eta: string
}

export interface ChargingHistory {
  vehicleId: string
  stationName: string
  date: string
  duration: string
  kwh: number
  cost: number
  fromSoc: number
  toSoc: number
}

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertType = 'battery' | 'charging' | 'device' | 'maint' | 'driving' | 'geofence'

export interface Alert {
  id: number
  severity: AlertSeverity
  type: AlertType
  title: string
  text: string
  vehicleId: string
  time: string
  acknowledged: boolean
}

export interface IceVehicle {
  id: string
  model: string
  kmPerDay: number
  maxKmPerDay: number
  fuelPerMonth: number
  readinessScore: number
  recommendedEv: string
}

export interface EnergyWeek {
  labels: string[]
  kwh: number[]
  cost: number[]
}

export interface EnergySummary {
  totalKwh: number
  kwhChangePct: number
  totalCost: number
  avgPricePerKwh: number
  efficiency: number
  efficiencyChangePct: number
}

export interface Sustainability {
  co2Tons: number
  treesEquivalent: number
  fuelSavings: number
  totalKm: number
  iceReadyCount: number
}

export interface VehicleTrip {
  when: string
  route: string
  km: number
  minutes: number
  kwh: number
  efficiency: number
  soc: number
}

export interface MaintenanceItem {
  title: string
  text: string
  tone: 'amber' | 'blue' | 'green'
  icon: 'wrench' | 'shield' | 'battery'
}

export interface VehicleDetail {
  vehicle: Vehicle
  driver: Driver | null
  socSeries: { labels: string[]; values: number[] }
  trips: VehicleTrip[]
  maintenance: MaintenanceItem[]
}

export interface BatteryInsights {
  sohTrend: { labels: string[]; values: number[] }
  sohChange3m: number
  modelRanges: { model: string; spec: number; actual: number }[]
}

export interface ChargingLoad {
  hours: string[]
  kw: number[]
  peakStart: number // ชั่วโมงเริ่ม On-Peak (รวม)
  peakEnd: number // ชั่วโมงสิ้นสุด On-Peak (ไม่รวม)
}

export interface DriverEventStat {
  label: string
  count: number
}

export type ReportPeriod = 'year' | 'q3' | 'sep'
export type ReportBrand = 'all' | 'BYD' | 'MG'
export interface ReportFilters {
  period: ReportPeriod
  brand: ReportBrand
}

export interface Report {
  labels: string[]
  kwhDepot: number[]
  kwhPublic: number[]
  co2: number[]
  totals: {
    kwh: number
    kwhChangePct: number
    cost: number
    avgPricePerKwh: number
    km: number
    costPerKm: number
    oilCostPerKm: number
    vehicleCount: number
    fuelSavings: number
  }
  costMix: { label: string; pct: number }[]
  carbon: {
    avoidedTons: number
    gridTons: number
    gridFactor: number
    trees: number
    treeKgPerYear: number
    netZeroPct: number
    evCount: number
    fleetCount: number
  }
  perKm: { label: string; grams: number }[]
  usage: { id: string; utilization: number; efficiency: number }[]
}

export interface ElectrificationRow {
  ice: IceVehicle
  evMonthlyCost: number
  readiness: 'ready' | 'consider' | 'not'
}

export interface ElectrificationReport {
  rows: ElectrificationRow[]
  readyCount: number
  laterCount: number
  annualSavings: number
  tco: { labels: string[]; ice: number[]; ev: number[]; iceName: string; evName: string }
}

export interface Settings {
  org: { name: string; fleetName: string; timezone: string; distanceUnit: string; language: string; currency: string }
  thresholds: { lowBattery: number; criticalBattery: number; maxSpeed: number; offlineMinutes: number }
  notify: { email: boolean; line: boolean; sms: boolean; dailyDigest: boolean }
  charging: { tariff: string; offPeak: string; onPeak: string; defaultTarget: string; smartSchedule: boolean; demandLimit: boolean }
}

/** ผลลัพธ์ของการเขียนข้อมูล: สำเร็จ หรือคืนข้อความผิดพลาดรายฟิลด์ (key '_' = ข้อผิดพลาดทั่วไป) */
export type Result<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

export type UserRole = 'admin' | 'manager' | 'viewer'

/** ค่าจากฟอร์มเพิ่มรถ (ทุกฟิลด์เป็น string ตามที่ผู้ใช้พิมพ์) */
export interface NewVehicleDraft {
  id: string
  model: string
  plate: string
  driverId: string
  batteryKwh: string
  soc: string
  odometer: string
}

export interface NewDriverDraft {
  name: string
  phone: string
  vehicleId: string
}

export interface InviteUserDraft {
  email: string
  role: UserRole | ''
}

export interface AppUser {
  name: string
  email: string
  initials: string
  role: string
  roleBadge: string
  permissions: string
  lastSeen: string
  color?: string
}

export interface Integration {
  key: string
  name: string
  text: string
  logo: string
  color: string
  connected: boolean
  actionLabel?: string
}

export interface Org {
  name: string
  city: string
  center: [number, number]
}
