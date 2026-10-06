import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, safeNext, verifySession } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
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
