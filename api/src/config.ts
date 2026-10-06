/** อ่านและตรวจค่า environment ตอนเริ่มระบบ — ค่าที่จำเป็นขาดจะหยุดทันที (fail fast) */
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`ต้องตั้งค่า environment variable ${name}`)
  return v
}

const authSecret = required('AUTH_SECRET')
if (authSecret.length < 16) throw new Error('AUTH_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร')

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  authSecret,
  /** ตั้ง true เมื่อให้บริการผ่าน HTTPS */
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** ถ้าตั้งค่า จะสร้าง API key สำหรับ ingest ตั้งต้นตอนเริ่มระบบ (ถ้ายังไม่มี) */
  bootstrapIngestKey: process.env.INGEST_API_KEY || undefined,
  /** ตรวจรถออฟไลน์ทุกกี่วินาที (0 = ปิด job) */
  offlineCheckIntervalSeconds: Number(process.env.OFFLINE_CHECK_INTERVAL_SECONDS ?? 60),
  inviteTtlDays: 7,
  resetTtlMinutes: 60,
  /** ที่อยู่เว็บสำหรับสร้างลิงก์ในอีเมล — ตั้งค่าเอง ไม่ใช้ Host/Origin จาก request (กัน host header poisoning) */
  appBaseUrl: (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  /** smtp = ส่งผ่าน SMTP_URL · log = เขียนอีเมลลง log (เฉพาะพัฒนา: ลิงก์รีเซ็ตจะอยู่ใน log) · off = ไม่ส่ง */
  mailMode: ((process.env.MAIL_MODE ?? (process.env.SMTP_URL ? 'smtp' : 'off')) as 'smtp' | 'log' | 'off'),
  smtpUrl: process.env.SMTP_URL || undefined,
  mailFrom: process.env.MAIL_FROM ?? 'EV Monitor <no-reply@evmonitor.local>',
  /** LINE Messaging API (push) — ต้องตั้งทั้งสองค่าจึงจะเปิดใช้; ไม่ตั้ง = ไม่ส่ง */
  lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || undefined,
  lineTo: process.env.LINE_TO || undefined,
  sessionCookie: 'ev_session',
  sessionTtlSeconds: 12 * 60 * 60,
  rememberTtlSeconds: 30 * 24 * 60 * 60,
  logLevel: process.env.LOG_LEVEL ?? 'info',
}
