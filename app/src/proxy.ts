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

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/api/v1/')) return sanitizeForwardedFor(req)
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    // ล็อกอินอยู่แล้ว → ไปหน้าที่ต้องการ (หรือแดชบอร์ด)
    // expired=1: API ปฏิเสธ session (ถูกเพิกถอน/เปลี่ยนรหัสผ่าน) ทั้งที่ลายเซ็นยังถูก — ต้องอยู่หน้าเข้าสู่ระบบ ไม่เช่นนั้นวนลูป
    if (user && !req.nextUrl.searchParams.has('expired') && !req.nextUrl.searchParams.has('reset')) return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url))
    return NextResponse.next()
  }

  if (!user) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/v1/:path*',
    '/login',
    '/dashboard/:path*',
    '/map/:path*',
    '/alerts/:path*',
    '/vehicles/:path*',
    '/battery/:path*',
    '/charging/:path*',
    '/drivers/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/account/:path*',
  ],
}
