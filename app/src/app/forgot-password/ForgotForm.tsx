'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/api'
import { FormField } from '@/components/ui/FormField'
import { validateEmail } from '@/lib/validators'

export function ForgotForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const msg = validateEmail(email)
    if (msg) return setError(msg)
    setBusy(true)
    setError('')
    try {
      await api.forgotPassword(email.trim())
      setSent(email.trim())
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'ขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' : 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-box">
        <h1>ตรวจสอบอีเมลของคุณ</h1>
        <p role="status">
          หากมีบัญชีที่ใช้อีเมล <b>{sent}</b> ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้ (ใช้ได้ครั้งเดียว ภายใน 60 นาที) — ถ้าไม่พบอีเมลภายในไม่กี่นาที ให้ตรวจโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบเพื่อขอลิงก์รีเซ็ต
        </p>
        <Link className="btn btn-outline btn-lg" style={{ width: '100%' }} href="/login">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    )
  }

  return (
    <form className="auth-box" onSubmit={submit} noValidate>
      <h1>ลืมรหัสผ่าน</h1>
      <p>กรอกอีเมลที่ใช้เข้าสู่ระบบ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
      <FormField
        name="email"
        label="อีเมล"
        required
        error={error}
        render={(p) => <input {...p} className="input" type="email" placeholder="name@company.co.th" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus />}
      />
      <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} type="submit" disabled={busy}>
        {busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
      </button>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
        นึกรหัสผ่านออกแล้ว?{' '}
        <Link href="/login" style={{ color: 'var(--blue)', fontWeight: 600 }}>
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
