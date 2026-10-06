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
  batteryTempC: number | null
  /** เวลาที่อุปกรณ์ส่งข้อมูลล่าสุด (ISO) */
  lastSeenAt: string | null
}

export interface Driver {
  id: string
  name: string
  phone: string
  /** null = ยังไม่มีคะแนน (ยังไม่มีทริป) */
  score: number | null
  km: number
  events: number
  trips: number
  /** อันดับรวม (มีเมื่อได้จากรายการแบ่งหน้า; null = ยังไม่มีคะแนน) */
  rank?: number | null
  /** รถประจำ (มีเมื่อได้จากรายการแบ่งหน้า) */
  vehicle?: DriverVehicle | null
}

export interface DriverVehicle {
  id: string
  model: string
  efficiency: number | null
  status: VehicleStatus
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
  /** ISO — ใช้กรองช่วงเวลา */
  startedAt: string
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
  efficiency: number | null
  soc: number | null
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
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'

/** ตารางเวลาส่งรายงานทางอีเมล (เวลาไทย) */
export interface ReportSchedule {
  id: string
  frequency: ScheduleFrequency
  /** 0 = อาทิตย์ … 6 = เสาร์ (weekly) */
  weekday: number | null
  /** 1–28 (monthly) */
  monthDay: number | null
  hour: number
  recipients: string[]
  period: ReportPeriod
  brand: ReportBrand
  enabled: boolean
  nextRunAt: string
  lastRunAt: string | null
  lastStatus: 'sent' | 'failed' | null
  lastError: string | null
}

export interface ReportSchedules {
  /** false = ระบบยังไม่ได้ตั้งค่าอีเมล (SMTP_URL) จึงส่งจริงไม่ได้ */
  mailEnabled: boolean
  items: ReportSchedule[]
}

export interface ScheduleDraft {
  frequency: ScheduleFrequency
  weekday: string
  monthDay: string
  hour: string
  /** คั่นด้วยจุลภาค เว้นวรรค หรือขึ้นบรรทัดใหม่ */
  recipients: string
  period: ReportPeriod
  brand: ReportBrand
  enabled: boolean
}

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

/** ผลของการสร้างคำเชิญ: โทเคนแสดงได้ครั้งเดียว (ผู้ดูแลนำลิงก์ไปส่งต่อ — ยังไม่มีบริการส่งอีเมล) */
export interface InviteResult {
  user: AppUser
  token: string
  expiresAt: string
  /** ระบบส่งอีเมลคำเชิญให้แล้ว */
  emailed: boolean
}

/** ซองข้อมูลแบ่งหน้าจาก API (ส่ง page มา) */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface VehiclesPage extends Paged<Vehicle> {
  /** ภาพรวมทั้งกอง ไม่ขึ้นกับตัวกรอง/หน้า */
  summary: { total: number; rangeKm: number; avgSoh: number; odometerKm: number; models: string[]; byStatus: Partial<Record<VehicleStatus, number>> }
}

export interface DriversPage extends Paged<Driver> {
  summary: { total: number; scored: number; avgScore: number; good: number; totalKm: number; events: number; working: number }
}

export interface AlertsPage extends Paged<Alert> {
  summary: { bySeverity: Partial<Record<AlertSeverity, { total: number; open: number }>> }
}

export interface ResetInfo {
  email: string
  name: string
}

/** ผลของการสร้างลิงก์รีเซ็ตรหัสผ่านโดยผู้ดูแล: โทเคนแสดงได้ครั้งเดียว */
export interface ResetLinkResult {
  email: string
  token: string
  expiresAt: string
}

export interface InviteInfo {
  email: string
  name: string
  role: UserRole
}

export interface AppUser {
  id: string
  status: 'active' | 'invited' | 'disabled'
  name: string
  email: string
  initials: string
  /** บทบาทแบบรหัส (ใช้ในฟอร์มแก้ไข) — role คือชื่อไทยสำหรับแสดงผล */
  roleKey: UserRole
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

export interface AlertRule {
  key: string
  title: string
  text: string
  enabled: boolean
}

export interface NotificationChannel {
  key: string
  name: string
  detail: string
  icon: 'bell' | 'globe' | 'phone'
  tone: 'navy' | 'blue' | 'green'
  enabled: boolean
}

export interface ApiKeyInfo {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** ตัวเลขรวมสำหรับหน้า Landing/Login (ไม่มีข้อมูลรายคัน) */
export interface PublicOverview {
  vehicleCount: number
  onlineCount: number
  avgSoc: number
  chargingCount: number
  efficiency: number
  weekKwh: number
  latestMonthKwh: number
  latestMonthCo2Tons: number
  yearCo2Tons: number
  yearFuelSavings: number
}
