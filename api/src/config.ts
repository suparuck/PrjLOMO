/** อ่านและตรวจค่า environment ตอนเริ่มระบบ — ค่าที่จำเป็นขาดจะหยุดทันที (fail fast) */
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`ต้องตั้งค่า environment variable ${name}`)
  return v
}

const authSecret = required('AUTH_SECRET')
if (authSecret.length < 16) throw new Error('AUTH_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร')
// production: ใช้เซ็น session ของทุกคน — สั้นเกินไปเดาได้ (สุ่มด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
if (process.env.NODE_ENV === 'production' && authSecret.length < 32) throw new Error('AUTH_SECRET ใน production ต้องยาวอย่างน้อย 32 ตัวอักษร')

/** ชั่วโมง 0–19 (ค่า 0 ใช้ได้ — ห้ามใช้ `|| ค่าเริ่มต้น` เพราะ 0 เป็น falsy) ค่าที่ไม่ใช่ตัวเลข → ค่าเริ่มต้น */
export function parseHour(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.min(19, Math.max(0, Math.trunc(n))) : fallback
}

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
  // เก็บบันทึกกิจกรรม (audit log) กี่วัน (ค่าเริ่มต้น 365; ต่ำกว่า 30 ไม่รับ)
  auditKeepDays: Math.max(30, Number(process.env.AUDIT_KEEP_DAYS ?? 365) || 365),
  // ชั่วโมง (เวลาไทย 0–19) ที่ส่งสรุปรายวันทางอีเมล
  digestHourTh: parseHour(process.env.DIGEST_HOUR_TH, 8),
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
  /**
   * จำนวนพร็อกซีที่เชื่อถือหน้า API (เว็บ Next.js = 1) — ใช้หา IP ผู้เรียกจริงสำหรับ rate limit
   * ห้ามเป็น true (เชื่อทุกชั้น): ผู้โจมตีใส่ X-Forwarded-For ปลอมแล้วหลบการจำกัดการเดารหัสผ่านได้
   * ถ้ามี reverse proxy/load balancer เพิ่มหน้าเว็บ ให้ตั้งเป็นจำนวนชั้นรวม · API ที่เปิดตรงสู่ภายนอกให้ตั้ง 0
   */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  sessionCookie: 'ev_session',
  sessionTtlSeconds: 12 * 60 * 60,
  rememberTtlSeconds: 30 * 24 * 60 * 60,
  logLevel: process.env.LOG_LEVEL ?? 'info',
}
