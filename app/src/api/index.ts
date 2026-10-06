/**
 * ชั้นเรียก API จริง — ชื่อเมธอดและรูปข้อมูลที่คืนเหมือนเดิมทุกประการ (หน้าเว็บจึงไม่ต้องรู้ว่าเปลี่ยนจาก mock)
 * การแปลงรูปข้อมูลจาก DTO ของ API (camelCase, timestamp ISO) เป็นรูปที่หน้าเว็บใช้ อยู่ใน ./mappers
 */
import { ApiError, del, get, patch, post, put } from './http'
import * as m from './mappers'
import type * as D from './dto'
import type {
  AlertRule, Alert, ApiKeyInfo, AppUser, BatteryInsights, ChargingHistory, ChargingLoad, ChargingSession, Driver, DriverEventStat,
  ElectrificationReport, EnergySummary, EnergyWeek, IceVehicle, Integration, InviteInfo, InviteUserDraft, Paged, VehiclesPage, DriversPage, AlertsPage, VehicleStatus, AlertSeverity, AlertType, ReportSchedule, ReportSchedules, ScheduleDraft, ResetInfo, ResetLinkResult, UserRole, NewDriverDraft, NewStationDraft, NewVehicleDraft,
  NotificationChannel, Org, PublicOverview, Report, ReportFilters, Result, Settings, Station, Sustainability, Vehicle, VehicleDetail,
} from '@/types'

export { ApiError }

/** แปลงข้อผิดพลาดจากการตรวจข้อมูลหรือสิทธิ์ (400/403/404/409/410/422) เป็น Result ให้ฟอร์มแสดงใต้ช่อง ส่วนข้อผิดพลาดอื่นโยนต่อ */
async function write<T>(fn: () => Promise<T>, rename: Record<string, string> = {}): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof ApiError && [400, 403, 404, 409, 410, 422].includes(e.status)) {
      const fields = e.fields && Object.keys(e.fields).length ? e.fields : { _: e.message }
      // ชื่อฟิลด์ใน API กับชื่อช่องในฟอร์มอาจต่างกัน (เช่น odometerKm ↔ odometer)
      return { ok: false, errors: Object.fromEntries(Object.entries(fields).map(([k, v]) => [rename[k] ?? k, v])) }
    }
    throw e
  }
}

/** สร้าง query string จากค่าที่มีจริง (ข้าม undefined/ค่าว่าง) */
const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

const stationBody = (d: NewStationDraft) => ({
  name: d.name,
  type: d.type,
  network: d.network,
  power: d.power,
  ports: Number(d.ports),
  pricePerKwh: Number(d.pricePerKwh),
  lat: Number(d.lat),
  lng: Number(d.lng),
})

const num = (s: string) => Number(s.trim().replace(/,/g, ''))

export const api = {
  // ---- อ่านข้อมูล ----
  getOrg: () => get<Org>('/org'),
  /** ผู้ใช้ที่ล็อกอินอยู่ (จาก session cookie) */
  getMe: async () => (await get<{ user: { id: string; email: string; name: string; role: UserRole } }>('/auth/me')).user,
  listVehicles: async (): Promise<Vehicle[]> => (await get<D.VehicleDTO[]>('/vehicles')).map(m.vehicle),
  getVehicleDetail: async (id: string): Promise<VehicleDetail | null> => {
    try {
      return m.vehicleDetail(await get<D.VehicleDetailDTO>(`/vehicles/${encodeURIComponent(id)}`))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },
  /** แบ่งหน้าฝั่งเซิร์ฟเวอร์: ค้นหา กรองสถานะ เรียง + summary ของทั้งกอง */
  listVehiclesPage: async (o: { page: number; pageSize?: number; q?: string; status?: VehicleStatus; sort?: string }): Promise<VehiclesPage> => {
    const r = await get<Paged<D.VehicleDTO> & Pick<VehiclesPage, 'summary'>>(`/vehicles?${qs({ ...o, pageSize: o.pageSize ?? 10 })}`)
    return { ...r, items: r.items.map(m.vehicle) }
  },
  listAlertsPage: async (o: { page: number; pageSize?: number; severity?: AlertSeverity; type?: AlertType }): Promise<AlertsPage> => {
    const r = await get<Paged<D.AlertDTO> & Pick<AlertsPage, 'summary'>>(`/alerts?${qs({ ...o, pageSize: o.pageSize ?? 10 })}`)
    return { ...r, items: r.items.map(m.alert) }
  },
  listChargingHistoryPage: async (o: { page: number; pageSize?: number }): Promise<Paged<ChargingHistory>> => {
    const r = await get<Paged<D.SessionDTO>>(`/charging/history?${qs({ hours: 72, ...o, pageSize: o.pageSize ?? 10 })}`)
    return { ...r, items: r.items.map(m.historyItem) }
  },
  /** แบ่งหน้าตามอันดับคะแนน (ค้นหา q) พร้อมรถประจำ อันดับ และ summary ของคนขับทั้งหมด */
  listDriversPage: async (o: { page: number; pageSize?: number; q?: string }): Promise<DriversPage> => {
    const r = await get<Paged<D.DriverDTO> & Pick<DriversPage, 'summary'>>(`/drivers?${qs({ ...o, pageSize: o.pageSize ?? 10 })}`)
    return { ...r, items: r.items.map(m.driver) }
  },
  listUsersPage: async (o: { page: number; pageSize?: number; q?: string }): Promise<Paged<AppUser>> => {
    const r = await get<Paged<D.UserDTO>>(`/users?${qs({ ...o, pageSize: o.pageSize ?? 10 })}`)
    return { ...r, items: r.items.map((u) => m.user(u)) }
  },
  listDrivers: async (): Promise<Driver[]> => (await get<D.DriverDTO[]>('/drivers')).map(m.driver),
  getDriverEvents: () => get<DriverEventStat[]>('/drivers/events'),
  listStations: async (): Promise<Station[]> => (await get<D.StationDTO[]>('/stations')).map(m.station),
  listChargingSessions: async (): Promise<ChargingSession[]> => (await get<D.SessionDTO[]>('/charging/sessions')).map(m.session),
  listChargingHistory: async (): Promise<ChargingHistory[]> => (await get<D.SessionDTO[]>('/charging/history?hours=72&limit=50')).map(m.historyItem),
  getChargingLoad: () => get<ChargingLoad>('/charging/load'),
  listAlerts: async (): Promise<Alert[]> => (await get<D.AlertDTO[]>('/alerts')).map(m.alert),
  getAlertStats: async () => {
    const s = await get<{ avgResponseMinutes: number | null }>('/alerts/stats')
    return { avgResponseMinutes: s.avgResponseMinutes }
  },
  listAlertRules: () => get<AlertRule[]>('/alert-rules'),
  listNotificationChannels: () => get<NotificationChannel[]>('/notification-channels'),
  getEnergyWeek: () => get<EnergyWeek>('/energy/week'),
  getEnergySummary: () => get<EnergySummary>('/energy/summary'),
  getSustainability: () => get<Sustainability>('/sustainability'),
  getBatteryInsights: () => get<BatteryInsights>('/battery/insights'),
  getReport: (f: ReportFilters) => get<Report>(`/reports?period=${f.period}&brand=${encodeURIComponent(f.brand)}`),
  getElectrification: () => get<ElectrificationReport>('/reports/electrification'),
  listIceVehicles: () => get<IceVehicle[]>('/ice-vehicles'),
  getSettings: () => get<Settings>('/settings'),
  listUsers: async (): Promise<AppUser[]> => (await get<D.UserDTO[]>('/users')).map((u) => m.user(u)),
  listIntegrations: async (): Promise<Integration[]> => (await get<D.IntegrationDTO[]>('/integrations')).map(m.integration),
  /** ส่งข้อความทดสอบเข้า LINE (admin) */
  testLine: () => write(() => post<{ sent: boolean }>('/integrations/line/test')),
  /** บัญชีที่ยังใช้รหัสผ่านตั้งต้นของข้อมูลเดโม (admin เท่านั้น) */
  getSecurityStatus: () => get<{ defaultPasswordUsers: { id: string; email: string; name: string; role: string }[] }>('/security/status'),
  listApiKeys: () => get<ApiKeyInfo[]>('/api-keys'),

  // ---- เขียนข้อมูล (คืน Result ให้ฟอร์มแสดงข้อผิดพลาดรายฟิลด์) ----
  addVehicle: (d: NewVehicleDraft) =>
    write(async () =>
      m.vehicle(
        await post<D.VehicleDTO>('/vehicles', {
          id: d.id,
          model: d.model,
          plate: d.plate,
          driverId: d.driverId || null,
          batteryKwh: num(d.batteryKwh),
          soc: num(d.soc),
          odometerKm: num(d.odometer),
        }),
      ),
      { odometerKm: 'odometer' },
    ),
  addStation: (d: NewStationDraft) => write(async () => m.station(await post<D.StationDTO>('/stations', stationBody(d)))),
  updateStation: (id: string, d: NewStationDraft) => write(async () => m.station(await patch<D.StationDTO>(`/stations/${encodeURIComponent(id)}`, stationBody(d)))),
  deleteStation: (id: string) => write(() => del<{ deleted: boolean }>(`/stations/${encodeURIComponent(id)}`)),
  addDriver: (d: NewDriverDraft) =>
    write(async () => m.driver(await post<D.DriverDTO>('/drivers', { name: d.name, phone: d.phone, vehicleId: d.vehicleId || null }))),
  inviteUser: (d: InviteUserDraft) =>
    write(async () => m.invite(await post<D.InviteDTO>('/users/invite', { email: d.email, role: d.role }))),
  /** สร้างลิงก์คำเชิญใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที) */
  resendInvite: (userId: string) => write(async () => m.invite(await post<D.InviteDTO>(`/users/${userId}/invite-link`))),
  /** แก้ไขผู้ใช้ (admin): ชื่อ บทบาท เปิด/ปิดบัญชี */
  updateUser: (userId: string, d: { name: string; role: UserRole; status: 'active' | 'disabled' }) =>
    write(async () => m.user(await patch<D.UserDTO>(`/users/${userId}`, d))),
  cancelInvite: (userId: string) => write(() => del<{ cancelled: boolean }>(`/users/${userId}`)),
  // ---- ผู้ถูกเชิญ (ยังไม่ล็อกอิน) ----
  lookupInvite: (token: string) => write(() => post<InviteInfo>('/auth/invite/lookup', { token })),
  acceptInvite: (token: string, password: string, name: string) =>
    write(() => post<{ user: { role: UserRole } }>('/auth/invite/accept', { token, password, name: name.trim() || undefined })),
  // ---- ลืม/เปลี่ยนรหัสผ่าน ----
  /** ขอลิงก์รีเซ็ตทางอีเมล — API ตอบเหมือนกันเสมอ (ไม่บอกว่ามีอีเมลนี้หรือไม่) */
  forgotPassword: (email: string) => post<{ ok: boolean }>('/auth/forgot-password', { email }),
  lookupReset: (token: string) => write(() => post<ResetInfo>('/auth/reset/lookup', { token })),
  acceptReset: (token: string, password: string) => write(() => post<{ ok: boolean }>('/auth/reset/accept', { token, password })),
  changePassword: (currentPassword: string, newPassword: string) =>
    write(() => post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword })),
  /** ผู้ดูแลสร้างลิงก์รีเซ็ตรหัสผ่านให้ผู้ใช้ (โทเคนแสดงครั้งเดียว) */
  adminResetLink: (userId: string) =>
    write(async (): Promise<ResetLinkResult> => {
      const d = await post<{ email: string; resetToken: string; expiresAt: string }>(`/users/${userId}/reset-link`)
      return { email: d.email, token: d.resetToken, expiresAt: d.expiresAt }
    }),
  // ---- ตั้งเวลาส่งรายงาน ----
  listReportSchedules: () => get<ReportSchedules>('/report-schedules'),
  /** id = null สร้างใหม่ · มี id แก้ไข */
  saveReportSchedule: (id: string | null, d: ScheduleDraft) => {
    const body = {
      frequency: d.frequency,
      ...(d.frequency === 'weekly' ? { weekday: Number(d.weekday) } : {}),
      ...(d.frequency === 'monthly' ? { monthDay: Number(d.monthDay) } : {}),
      hour: Number(d.hour),
      recipients: d.recipients.split(/[\s,;]+/).filter(Boolean),
      period: d.period,
      brand: d.brand,
      enabled: d.enabled,
    }
    return write(() => (id ? put<ReportSchedule>(`/report-schedules/${id}`, body) : post<ReportSchedule>('/report-schedules', body)))
  },
  deleteReportSchedule: (id: string) => write(() => del<{ deleted: boolean }>(`/report-schedules/${id}`)),
  sendReportNow: (id: string) => write(() => post<{ sent: boolean }>(`/report-schedules/${id}/send-now`)),
  setChargingTarget: (vehicleId: string, targetSoc: number) =>
    write(async () => {
      const s = await patch<D.SessionDTO>(`/charging/sessions/${encodeURIComponent(vehicleId)}/target`, { targetSoc })
      return { eta: m.session(s).eta }
    }),
  stopCharging: (vehicleId: string) =>
    write(async () => {
      await post(`/charging/sessions/${encodeURIComponent(vehicleId)}/stop`)
      return { vehicleId }
    }),
  setAlertRule: (key: string, enabled: boolean) => write(() => patch<AlertRule>(`/alert-rules/${encodeURIComponent(key)}`, { enabled })),
  saveSettings: (s: Settings) => write(() => put<Settings>('/settings', s)),
  createApiKey: (name: string) => write(() => post<ApiKeyInfo & { key: string }>('/api-keys', { name })),
  revokeApiKey: (id: string) => write(() => del<{ revoked: boolean }>(`/api-keys/${id}`)),

  // รับทราบแล้วคืนรายการล่าสุด (ให้ badge ใน Sidebar อัปเดตตรงกับฐานข้อมูล)
  async acknowledgeAlert(id: number): Promise<Alert[]> {
    await post(`/alerts/${id}/ack`)
    return api.listAlerts()
  },
  async acknowledgeAllAlerts(): Promise<Alert[]> {
    await post('/alerts/ack-all')
    return api.listAlerts()
  },

  // ---- หน้าสาธารณะ (ไม่ต้องล็อกอิน) ----
  getPublicOverview: () => get<PublicOverview>('/public/overview'),
}
