import { NextResponse } from 'next/server'
import { SESSION_COOKIE, createToken, verifyCredentials } from '@/lib/auth'

const DAY = 60 * 60 * 24

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown; remember?: unknown } | null
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
  }
  if (!verifyCredentials(body.email, body.password)) {
    return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  const remember = body.remember === true
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createToken(body.email.trim().toLowerCase(), remember ? 30 * DAY : DAY), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true', // ตั้ง true เมื่อให้บริการผ่าน HTTPS
    ...(remember ? { maxAge: 30 * DAY } : {}), // ไม่จดจำ = session cookie
  })
  return res
}
