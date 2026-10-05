import { delay } from './delay'
import * as db from './mockData'
import { computeElectrification, computeReport } from './report'
import * as mut from './mutations'
import type { AppUser, InviteUserDraft, NewDriverDraft, NewVehicleDraft, Integration, ReportFilters, Settings, BatteryInsights, ChargingLoad, DriverEventStat, EnergySummary, MaintenanceItem, Sustainability, Vehicle, VehicleDetail, VehicleTrip } from '../types'

const PLACES = ['Depot A', 'นิมมานเหมินท์', 'เซ็นทรัล เฟสติวัล', 'สนามบินเชียงใหม่', 'มช. (CMU)', 'หางดง', 'สันกำแพง']

/** SoC 24 ชม. จำลอง: ชาร์จกลางคืน 00–06, ชาร์จพักเที่ยง 12–13 แล้วลดลงตามการใช้งาน */
function mockSocSeries(v: Vehicle) {
  const labels = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  let s = Math.max(20, v.soc - 30)
  const values = labels.map((_, i) => {
    if (i < 6) s = Math.min(95, s + 9)
    else if (i < 12) s = Math.max(10, s - 4)
    else if (i < 13) s = Math.min(95, s + 10)
    else s = Math.max(10, s - 3.2)
    return Math.round(s)
  })
  values[24] = v.soc
  return { labels, values }
}

function mockTrips(v: Vehicle): VehicleTrip[] {
  const km = [18.4, 32.1, 9.7, 24.6, 41.2]
  const when = ['วันนี้ 09:12', 'วันนี้ 07:40', 'เมื่อวาน 17:05', 'เมื่อวาน 13:20', 'เมื่อวาน 08:15']
  const minutes = [28, 46, 19, 37, 58]
  const soc = [v.soc, 92, 64, 81, 95]
  return km.map((k, i) => ({
    when: when[i],
    route: `${PLACES[i]} → ${PLACES[i + 1]}`,
    km: k,
    minutes: minutes[i],
    kwh: +((k * v.efficiency) / 100).toFixed(1),
    efficiency: v.efficiency,
    soc: soc[i],
  }))
}

const MAINTENANCE: MaintenanceItem[] = [
  { title: 'ตรวจเช็กระบบเบรกและยาง', text: 'อีก 1,580 กม. หรือ 18 วัน', tone: 'amber', icon: 'wrench' },
  { title: 'อัปเดตซอฟต์แวร์รถ (OTA)', text: 'เวอร์ชันใหม่พร้อมติดตั้ง', tone: 'blue', icon: 'shield' },
  { title: 'ตรวจสุขภาพแบตประจำปี', text: 'ครบกำหนด ม.ค. 2027', tone: 'green', icon: 'battery' },
]

export const api = {
  getOrg: () => delay(db.org, 0),
  listVehicles: () => delay(db.vehicles),
  getVehicle: (id: string) => delay(db.vehicles.find((v) => v.id === id) ?? null),
  getVehicleDetail(id: string): Promise<VehicleDetail | null> {
    const vehicle = db.vehicles.find((v) => v.id === id)
    if (!vehicle) return delay(null)
    return delay({
      vehicle,
      driver: db.drivers.find((d) => d.id === vehicle.driverId) ?? null,
      socSeries: mockSocSeries(vehicle),
      trips: mockTrips(vehicle),
      maintenance: MAINTENANCE,
    })
  },
  getBatteryInsights(): Promise<BatteryInsights> {
    const avgSoh = Math.round((db.vehicles.reduce((s, v) => s + v.soh, 0) / db.vehicles.length) * 10) / 10
    const values = [...db.sohHistory, avgSoh]
    const models = [...new Set(db.vehicles.map((v) => v.model))]
    return delay({
      sohTrend: { labels: [...db.sohMonths, 'ต.ค.'], values },
      sohChange3m: Math.round((values[8] - avgSoh) * 10) / 10,
      // ใช้งานจริงประมาณ 86% ของสเปก (ค่าประมาณ รอข้อมูลจริงจาก backend)
      modelRanges: models.map((model) => ({
        model,
        spec: db.modelSpecRange[model],
        actual: Math.round(db.modelSpecRange[model] * 0.86),
      })),
    })
  },
  getChargingLoad: (): Promise<ChargingLoad> =>
    delay({
      hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
      kw: db.chargingLoadKw,
      peakStart: 9,
      peakEnd: 22,
    }),
  getDriverEvents: (): Promise<DriverEventStat[]> => delay(db.driverEvents),
  async acknowledgeAlert(id: number) {
    const a = db.alerts.find((x) => x.id === id)
    if (a) a.acknowledged = true
    return delay(db.alerts)
  },
  async acknowledgeAllAlerts() {
    db.alerts.forEach((a) => (a.acknowledged = true))
    return delay(db.alerts)
  },
  /** เวลาตอบสนองเฉลี่ยต่อการแจ้งเตือน (นาที) — ค่าประมาณจากต้นแบบ */
  getAlertStats: () => delay({ avgResponseMinutes: 6.4 }),
  listDrivers: () => delay(db.drivers),
  listStations: () => delay(db.stations),
  listAlerts: () => delay(db.alerts),
  listChargingSessions: () => delay(db.sessions),
  listChargingHistory: () => delay(db.history),
  getEnergyWeek: () => delay(db.energyWeek),
  listIceVehicles: () => delay(db.iceVehicles),

  /** สรุปพลังงานสัปดาห์นี้ — คำนวณจากข้อมูลรายวันและรถ */
  getEnergySummary(): Promise<EnergySummary> {
    const totalKwh = db.energyWeek.kwh.reduce((a, b) => a + b, 0)
    const totalCost = db.energyWeek.cost.reduce((a, b) => a + b, 0)
    const efficiency = db.vehicles.reduce((s, v) => s + v.efficiency, 0) / db.vehicles.length
    return delay({
      totalKwh,
      kwhChangePct: 8.4,
      totalCost,
      avgPricePerKwh: Math.round((totalCost / totalKwh) * 100) / 100,
      efficiency: Math.round(efficiency * 10) / 10,
      efficiencyChangePct: 2.1,
    })
  },

  /** ความยั่งยืนปี 2026 — คำนวณจากรายงาน (ม.ค.–ต.ค. ทุกคัน) ให้ตรงกับหน้า Reports */
  getSustainability(): Promise<Sustainability> {
    const r = computeReport({ period: 'year', brand: 'all' })
    return delay({
      co2Tons: r.carbon.avoidedTons,
      treesEquivalent: r.carbon.trees,
      fuelSavings: r.totals.fuelSavings,
      totalKm: db.vehicles.reduce((s, v) => s + v.odometer, 0),
      iceReadyCount: db.iceVehicles.filter((i) => i.readinessScore >= 80).length,
    })
  },

  getReport: (f: ReportFilters) => delay(computeReport(f), 150),
  getElectrification: () => delay(computeElectrification()),
  getSettings: () => delay(db.settings),
  async saveSettings(s: Settings) {
    db.saveSettings(s)
    return delay(db.settings)
  },
  listUsers: (): Promise<AppUser[]> => delay(db.users),

  // ---- การเขียนข้อมูล (ดู mutations.ts) ----
  addVehicle: (d: NewVehicleDraft) => delay(mut.addVehicle(d), 200),
  addDriver: (d: NewDriverDraft) => delay(mut.addDriver(d), 200),
  inviteUser: (d: InviteUserDraft) => delay(mut.inviteUser(d), 200),
  setChargingTarget: (vehicleId: string, target: number) => delay(mut.setChargingTarget(vehicleId, target), 200),
  stopCharging: (vehicleId: string) => delay(mut.stopCharging(vehicleId), 200),
  listIntegrations: (): Promise<Integration[]> => delay(db.integrations),
}
