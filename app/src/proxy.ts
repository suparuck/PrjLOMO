import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, safeNext, verifySession } from '@/lib/auth'

/**
 * คำขอ /api/v1/* ที่ Next ส่งต่อไป API: Next ส่ง X-Forwarded-For ที่ผู้เรียกใส่มาต่อไปโดยไม่เติม IP ของผู้เรียกจริง
 * ถ้าปล่อยผ่าน ผู้โจมตีใส่ค่าปลอมเพื่อหลบ rate limit ต่อ IP ได้ จึงทำให้เหลือค่าที่เชื่อถือได้ค่าเดียว:
 *  - TRUST_FORWARDED_FOR=true (มี reverse proxy/load balancer ของเราอยู่หน้าเว็บ และเขียนทับ/ต่อท้าย X-Forwarded-For เอง):
 *    ใช้เฉพาะรายการ "ท้ายสุด" ซึ่งพร็อกซีของเราเติมไว้
 *  - ไม่ตั้ง (ค่าเริ่มต้น เช่น เปิดพอร์ตเว็บตรง): ทิ้ง X-Forwarded-For ทั้งหมด API จะเห็น IP ของเว็บคอนเทนเนอร์แทน
 *    (การจำกัดรายบัญชีของ API ยังป้องกันการเดารหัสผ่านได้ไม่ว่า IP ใด)
 */
function sanitizeForwardedFor(req: NextRequest) {
  const headers = new Headers(req.headers)
  const xff = headers.get('x-forwarded-for')
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  if (process.env.TRUST_FORWARDED_FOR === 'true' && xff) {
    const last = xff.split(',').pop()?.trim()
    if (last) headers.set('x-forwarded-for', last)
  }
  return NextResponse.next({ request: { headers } })
}

/**
 * Content-Security-Policy แบบเข้ม (สร้างใหม่ทุกคำขอ):
 *  - script-src: เฉพาะสคริปต์ที่มี nonce ของคำขอนั้น ('strict-dynamic' ให้สคริปต์ที่ Next โหลดต่อได้) — สคริปต์ที่ถูกแทรกเข้ามา (XSS) รันไม่ได้
 *  - style-src: ไฟล์ CSS ของเราเองเท่านั้น; style-src-attr อนุญาต style="" ในแท็ก (React inline style) แต่ไม่อนุญาต <style> ที่แทรกเข้ามา
 *  - img-src: ของเรา + data:/blob: (QR 2FA) + แผนที่ OpenStreetMap · connect-src/font-src: ของเราเท่านั้น (ฟอนต์ self-host ผ่าน next/font)
 *  - ตอนพัฒนา (next dev) ต้องมี 'unsafe-eval' สำหรับ React refresh เท่านั้น
 */
function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self'" + (dev ? " 'unsafe-inline'" : ''),
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** ส่งต่อคำขอพร้อม nonce/CSP (Next อ่าน nonce จากส่วนหัว CSP ของคำขอไปใส่ให้สคริปต์ของตัวเอง) และตั้ง CSP ให้การตอบกลับ */
function nextWithCsp(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)
  const headers = new Headers(req.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

// หน้าที่ต้องล็อกอิน (หน้าอื่นที่ผ่าน matcher — หน้าแรก, ลืมรหัสผ่าน, คำเชิญ, รีเซ็ตรหัส — เป็นหน้าสาธารณะ)
const PROTECTED = new Set(['dashboard', 'map', 'alerts', 'vehicles', 'battery', 'charging', 'drivers', 'reports', 'settings', 'account'])

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/api/v1/')) return sanitizeForwardedFor(req)
  if (!PROTECTED.has(pathname.split('/')[1]) && pathname !== '/login') return nextWithCsp(req)
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    // ล็อกอินอยู่แล้ว → ไปหน้าที่ต้องการ (หรือแดชบอร์ด)
    // expired=1: API ปฏิเสธ session (ถูกเพิกถอน/เปลี่ยนรหัสผ่าน) ทั้งที่ลายเซ็นยังถูก — ต้องอยู่หน้าเข้าสู่ระบบ ไม่เช่นนั้นวนลูป
    if (user && !req.nextUrl.searchParams.has('expired') && !req.nextUrl.searchParams.has('reset')) return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url))
    return nextWithCsp(req)
  }

  if (!user) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  return nextWithCsp(req)
}

export const config = {
  // ทุกหน้า (ใส่ CSP) + /api/v1 (กรอง X-Forwarded-For) ยกเว้นไฟล์สแตติกของ Next และคำขอ prefetch
  matcher: [
    '/api/v1/:path*',
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
