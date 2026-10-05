import { delay } from './delay'
import * as db from './mockData'
import type { EnergySummary, Sustainability } from '../types'

export const api = {
  getOrg: () => delay(db.org, 0),
  listVehicles: () => delay(db.vehicles),
  getVehicle: (id: string) => delay(db.vehicles.find((v) => v.id === id) ?? null),
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

  /** ความยั่งยืนปี 2026 — ค่าประมาณจากต้นแบบ รอสูตรจริงจาก backend */
  getSustainability(): Promise<Sustainability> {
    return delay({
      co2Tons: 32.1,
      treesEquivalent: 1460,
      fuelSavings: 412800,
      totalKm: db.vehicles.reduce((s, v) => s + v.odometer, 0),
      iceReadyCount: db.iceVehicles.filter((i) => i.readinessScore >= 80).length,
    })
  },
}
