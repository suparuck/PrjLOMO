'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { safeNext } from '@/lib/auth'

// ช่วงพัฒนา/เดโม: ตั้ง NEXT_PUBLIC_DEMO_LOGIN=อีเมล:รหัสผ่าน เพื่อเติมค่าในฟอร์มให้ (production ไม่ต้องตั้ง)
const DEMO = (process.env.NEXT_PUBLIC_DEMO_LOGIN ?? '').split(':')

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params?.get('next'))
  const notice = params?.get('reset') ? 'ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' : params?.get('expired') ? 'เซสชันหมดอายุหรือถูกออกจากระบบ กรุณาเข้าสู่ระบบอีกครั้ง' : ''
  const [email, setEmail] = useState(DEMO[0] ?? '')
  const [password, setPassword] = useState(DEMO.slice(1).join(':'))
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // เปิด 2FA: หลังรหัสผ่านถูก API ส่งโทเคนชั่วคราวมา แล้วขอรหัสจากแอป (หรือรหัสสำรอง) อีกขั้น
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')

  function backToPassword() {
    setChallenge('')
    setCode('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(challenge ? '/api/v1/auth/login/2fa' : '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenge ? { challenge, code } : { email, password, remember }),
      })
      if (!res.ok) {
        const err = ((await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null)?.error
        setError(err?.message ?? 'เข้าสู่ระบบไม่สำเร็จ')
        if (err?.code === 'invalid_challenge') backToPassword()
        return
      }
      const body = (await res.json().catch(() => null)) as { twoFactorRequired?: boolean; challenge?: string } | null
      if (body?.twoFactorRequired && body.challenge) {
        setChallenge(body.challenge)
        setPassword('')
        return
      }
      router.replace(next)
      router.refresh()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <form className="auth-box" onSubmit={onSubmit}>
        <h1>ยืนยันตัวตนสองขั้นตอน</h1>
        <p>กรอกรหัส 6 หลักจากแอป Authenticator ของคุณ หรือใช้รหัสสำรองหนึ่งชุด</p>
        <div className="field">
          <label htmlFor="otp">รหัสยืนยัน</label>
          <input className="input" id="otp" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={20} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="small" style={{ color: 'var(--danger)', margin: '-8px 0 14px' }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} type="submit" disabled={busy || !code.trim()}>
          {busy ? 'กำลังตรวจสอบ…' : 'ยืนยันและเข้าสู่ระบบ'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 20 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { backToPassword(); setError('') }}>
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </p>
      </form>
    )
  }

  return (
    <form className="auth-box" onSubmit={onSubmit}>
      <h1>เข้าสู่ระบบ</h1>
      <p>ยินดีต้อนรับกลับ กรุณากรอกข้อมูลเพื่อเข้าใช้งาน</p>
      {notice && (
        <p role="status" className="small" style={{ margin: '-12px 0 18px', color: 'var(--green)', fontWeight: 600 }}>
          {notice}
        </p>
      )}
      <div className="field">
        <label htmlFor="email">อีเมล</label>
        <input className="input" id="email" type="email" placeholder="name@company.co.th" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw">รหัสผ่าน</label>
        <input className="input" id="pw" type="password" placeholder="••••••••" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="auth-row">
        <label className="flex" style={{ gap: 8 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: 'var(--red)' }} /> จดจำฉันไว้
        </label>
        <Link href="/forgot-password">ลืมรหัสผ่าน?</Link>
      </div>
      {error && (
        <p role="alert" className="small" style={{ color: 'var(--danger)', margin: '-8px 0 14px' }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} type="submit" disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
      <div className="or">หรือ</div>
      <button className="btn btn-outline btn-lg" style={{ width: '100%' }} type="button" disabled title="ยังไม่ได้เชื่อมต่อ SSO — ตั้งค่าได้ที่ ตั้งค่า > การเชื่อมต่อ">
        <Icon name="shield" />
        เข้าสู่ระบบด้วย SSO องค์กร
      </button>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
        ยังไม่มีบัญชี?{' '}
        <Link href="/#demo" style={{ color: 'var(--blue)', fontWeight: 600 }}>
          ติดต่อฝ่ายขาย
        </Link>
      </p>
    </form>
  )
}
