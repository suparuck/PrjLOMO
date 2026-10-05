import type { Db } from '../db'
import { one, rows } from '../db'

export type VehicleStatus = 'driving' | 'charging' | 'parked' | 'low' | 'offline'
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertType = 'battery' | 'charging' | 'device' | 'maint' | 'driving' | 'geofence'

export async function loadThresholds(db: Db) {
  const r = await one<{ t: { lowBattery: number; criticalBattery: number; maxSpeed: number; offlineMinutes: number } }>(
    db,
    'select thresholds as t from app_settings where id = 1',
  )
  return r!.t
}

/** กฎการแจ้งเตือนที่เปิดอยู่ (key ตรงกับตาราง alert_rules) */
export async function enabledRules(db: Db): Promise<Set<string>> {
  const list = await rows<{ key: string }>(db, 'select key from alert_rules where enabled')
  return new Set(list.map((r) => r.key))
}

/**
 * สถานะจากข้อมูลล่าสุด: กำลังชาร์จ > แบตต่ำ (ต่ำกว่าเกณฑ์) > กำลังขับ (ความเร็ว > 0) > จอดอยู่
 * "ออฟไลน์" ตั้งจากการไม่มีสัญญาณ ไม่ได้คำนวณที่นี่
 */
export function deriveStatus(p: { charging: boolean; soc: number; speedKmh: number; lowBattery: number }): VehicleStatus {
  if (p.charging) return 'charging'
  if (p.soc < p.lowBattery) return 'low'
  if (p.speedKmh > 0) return 'driving'
  return 'parked'
}

export const estimateRangeKm = (soc: number, batteryKwh: number, efficiency: number) =>
  Math.round(((soc / 100) * batteryKwh) / (efficiency / 100))

/** คำนวณสถานะรถใหม่หลังเซสชันชาร์จเริ่ม/จบ (ใช้ค่าล่าสุดในตาราง vehicles) */
export async function refreshVehicleStatus(db: Db, vehicleId: string) {
  const t = await loadThresholds(db)
  await db.query(
    `update vehicles v set status = case
         when v.status = 'offline' and not exists (select 1 from charging_sessions s where s.vehicle_id = v.id and s.status = 'active') then 'offline'::vehicle_status
         when exists (select 1 from charging_sessions s where s.vehicle_id = v.id and s.status = 'active') then 'charging'::vehicle_status
         when v.soc < $2 then 'low'::vehicle_status
         when v.speed_kmh > 0 then 'driving'::vehicle_status
         else 'parked'::vehicle_status end
      where v.id = $1`,
    [vehicleId, t.lowBattery],
  )
}

export async function createAlert(
  db: Db,
  a: { severity: AlertSeverity; type: AlertType; title: string; text: string; vehicleId?: string | null },
) {
  return one<{ id: number }>(
    db,
    `insert into alerts (severity, type, title, text, vehicle_id) values ($1, $2, $3, $4, $5) returning id`,
    [a.severity, a.type, a.title, a.text, a.vehicleId ?? null],
  )
}

/** มีแจ้งเตือนประเภทเดียวกันของรถคันนี้ที่ยังไม่รับทราบอยู่แล้วหรือไม่ (กันแจ้งซ้ำเมื่อค่าแกว่งรอบเกณฑ์) */
export async function hasOpenAlert(db: Db, vehicleId: string, type: AlertType, severity: AlertSeverity) {
  const r = await one(db, `select 1 from alerts where vehicle_id = $1 and type = $2 and severity = $3 and acknowledged_at is null limit 1`, [
    vehicleId,
    type,
    severity,
  ])
  return !!r
}
