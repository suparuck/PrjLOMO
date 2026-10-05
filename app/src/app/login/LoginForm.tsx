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
  const next = safeNext(useSearchParams()?.get('next'))
  const [email, setEmail] = useState(DEMO[0] ?? '')
  const [password, setPassword] = useState(DEMO.slice(1).join(':'))
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      })
      if (!res.ok) {
        setError(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? 'เข้าสู่ระบบไม่สำเร็จ')
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

  return (
    <form className="auth-box" onSubmit={onSubmit}>
      <h1>เข้าสู่ระบบ</h1>
      <p>ยินดีต้อนรับกลับ กรุณากรอกข้อมูลเพื่อเข้าใช้งาน</p>
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
        <a href="#">ลืมรหัสผ่าน?</a>
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
