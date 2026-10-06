import { daysUntil, formatClock, formatDayTime, formatMonthYear, formatRelative } from '@/lib/time'
import { USER_ROLES, formatDuration } from '@/lib/validators'
import { fmt } from '@/lib/format'
import type {
  Alert, AppUser, ChargingHistory, ChargingSession, Driver, Integration, InviteResult, MaintenanceItem, Station, Vehicle, VehicleDetail,
} from '@/types'
import type * as D from './dto'

export const vehicle = (v: D.VehicleDTO): Vehicle => ({
  id: v.id,
  model: v.model,
  plate: v.plate,
  driverId: v.driverId ?? '',
  soc: v.soc,
  soh: v.soh,
  range: v.rangeKm,
  speed: v.speedKmh,
  status: v.status,
  location: v.location,
  lat: v.lat,
  lng: v.lng,
  odometer: v.odometerKm,
  efficiency: v.efficiency,
  batteryKwh: v.batteryKwh,
  batteryTempC: v.batteryTempC,
  lastSeenAt: v.lastSeenAt,
})

export const driver = (d: D.DriverDTO): Driver => ({
  id: d.id,
  name: d.name,
  phone: d.phone,
  score: d.score,
  km: d.km30d,
  events: d.events30d,
  trips: d.trips30d,
  rank: d.rank ?? null,
  vehicle: d.vehicleId ? { id: d.vehicleId, model: d.vehicleModel ?? '', efficiency: d.vehicleEfficiency ?? null, status: d.vehicleStatus ?? 'offline' } : null,
})

export const station = (s: D.StationDTO): Station => ({
  id: s.id,
  name: s.name,
  type: s.type,
  network: s.network,
  lat: s.lat,
  lng: s.lng,
  ports: s.ports,
  busy: s.busyPorts,
  power: s.power,
  pricePerKwh: s.pricePerKwh,
})

export const session = (s: D.SessionDTO): ChargingSession => ({
  vehicleId: s.vehicleId,
  stationName: s.stationName,
  start: formatClock(s.startedAt),
  fromSoc: s.fromSoc,
  nowSoc: s.nowSoc,
  targetSoc: s.targetSoc,
  kw: s.kw,
  kwh: s.kwh,
  cost: s.cost,
  eta: s.etaMinutes === null ? '–' : formatDuration(s.etaMinutes),
})

export const historyItem = (s: D.SessionDTO): ChargingHistory => ({
  vehicleId: s.vehicleId,
  stationName: s.stationName,
  date: formatDayTime(s.startedAt),
  duration: s.endedAt ? formatDuration((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000) : '–',
  kwh: s.kwh,
  cost: s.cost,
  fromSoc: s.fromSoc,
  toSoc: s.toSoc ?? s.nowSoc,
  startedAt: s.startedAt,
})

export const alert = (a: D.AlertDTO): Alert => ({
  id: a.id,
  severity: a.severity,
  type: a.type,
  title: a.title,
  text: a.text,
  vehicleId: a.vehicleId ?? '',
  time: formatRelative(a.createdAt),
  acknowledged: a.acknowledgedAt !== null,
})

const ROLE_COLOR: Record<D.UserDTO['role'], string | undefined> = { admin: undefined, manager: 'var(--green)', viewer: 'var(--amber)' }

export function user(u: D.UserDTO, now = new Date()): AppUser {
  const r = USER_ROLES[u.role]
  const online = u.lastLoginAt && now.getTime() - new Date(u.lastLoginAt).getTime() < 5 * 60_000
  return {
    id: u.id,
    status: u.status,
    name: u.name,
    email: u.email,
    initials: u.name.slice(0, 2).toUpperCase(),
    roleKey: u.role,
    role: r.label,
    roleBadge: r.badge,
    permissions: r.permissions,
    lastSeen: u.status === 'invited' ? 'รอตอบรับคำเชิญ' : u.status === 'disabled' ? 'ปิดใช้งาน' : online ? 'ออนไลน์' : u.lastLoginAt ? formatRelative(u.lastLoginAt, now) : '–',
    twoFactorEnabled: !!u.twoFactorEnabled,
    color: ROLE_COLOR[u.role],
  }
}

export const invite = (d: D.InviteDTO): InviteResult => ({ user: user(d), token: d.inviteToken, expiresAt: d.inviteExpiresAt, emailed: d.emailed })

export const integration = (i: D.IntegrationDTO): Integration => ({
  key: i.key,
  name: i.name,
  text: i.text,
  logo: i.logo,
  color: `var(--${i.colorToken})`,
  connected: i.connected,
  actionLabel: i.actionLabel ?? undefined,
})

function maintenanceItem(t: D.VehicleDetailDTO['maintenance'][number], odometer: number): MaintenanceItem {
  const style = {
    service: { tone: 'amber', icon: 'wrench' },
    software: { tone: 'blue', icon: 'shield' },
    battery: { tone: 'green', icon: 'battery' },
  } as const
  let text = t.detail
  if (t.dueDate && t.dueOdometerKm !== null) {
    const km = t.dueOdometerKm - odometer
    const days = daysUntil(t.dueDate)
    text = km <= 0 || days < 0 ? 'เลยกำหนดแล้ว' : `อีก ${fmt(km)} กม. หรือ ${days} วัน`
  } else if (t.dueDate) {
    text = daysUntil(t.dueDate) < 0 ? 'เลยกำหนดแล้ว' : `ครบกำหนด ${formatMonthYear(t.dueDate)}`
  }
  return { title: t.title, text, ...style[t.kind] }
}

export function vehicleDetail(d: D.VehicleDetailDTO): VehicleDetail {
  const v = vehicle(d.vehicle)
  return {
    vehicle: v,
    driver: d.driver ? driver(d.driver) : null,
    socSeries: d.socSeries,
    trips: d.trips.map((t) => ({
      when: formatDayTime(t.startedAt),
      route: `${t.origin} → ${t.destination}`,
      km: t.distanceKm,
      minutes: t.durationMin,
      kwh: t.energyKwh,
      efficiency: t.efficiency,
      soc: t.endSoc,
    })),
    maintenance: d.maintenance.map((t) => maintenanceItem(t, v.odometer)),
  }
}
