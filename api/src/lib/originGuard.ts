import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import { AppError } from '../errors'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** host (รวมพอร์ต) ของหน้าเว็บที่ผู้ใช้เปิดอยู่: ผ่านพร็อกซีที่เชื่อถือใช้ X-Forwarded-Host ไม่งั้นใช้ Host */
function requestHost(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers['x-forwarded-host']
  const v = config.trustProxyHops > 0 && typeof fwd === 'string' && fwd ? fwd.split(',')[0] : headers.host
  return String(v ?? '').trim().toLowerCase()
}

/**
 * กัน CSRF แบบชั้นที่สอง (นอกจาก SameSite=Lax ของ cookie): คำขอแก้ข้อมูลที่ยืนยันตัวตนด้วย session cookie
 * ต้องมาจากหน้าเว็บของเราเอง — ปฏิเสธเมื่อเบราว์เซอร์บอกว่าข้ามไซต์ (Sec-Fetch-Site) หรือ Origin ไม่ตรงกับโฮสต์
 * ไม่กระทบคำขอที่ไม่มี cookie (ingest ใช้ API key, ล็อกอิน, ลืมรหัสผ่าน) และไม่มี Origin (curl/เซิร์ฟเวอร์) ซึ่งเบราว์เซอร์ข้ามไซต์ไม่ส่งแบบนั้น
 * ALLOWED_ORIGINS (คั่นจุลภาค) ใช้เพิ่มต้นทางที่ยอมรับ เช่น โดเมนอื่นที่ชี้มาเว็บเดียวกัน
 */
export function registerOriginGuard(app: FastifyInstance) {
  const extra = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/\/$/, '')).filter(Boolean))
  app.addHook('onRequest', async (req) => {
    if (SAFE.has(req.method)) return
    if (!(req.headers.cookie ?? '').includes(`${config.sessionCookie}=`)) return
    const deny = () => new AppError(403, 'cross_origin', 'คำขอนี้ไม่ได้มาจากหน้าเว็บของระบบ')
    const site = req.headers['sec-fetch-site']
    if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
      const o = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase().replace(/\/$/, '') : ''
      if (!o || !extra.has(o)) throw deny()
      return
    }
    const origin = req.headers.origin
    if (typeof origin !== 'string' || origin === '') return
    const o = origin.toLowerCase().replace(/\/$/, '')
    if (extra.has(o)) return
    let host = ''
    try {
      host = new URL(o).host
    } catch {
      throw deny()
    }
    if (host !== requestHost(req.headers)) throw deny()
  })
}
