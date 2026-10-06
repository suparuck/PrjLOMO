'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { validatePassword } from '@/lib/validators'
import type { ResetInfo } from '@/types'

type State = { kind: 'loading' } | { kind: 'invalid'; message: string } | { kind: 'ready'; info: ResetInfo }

const ORDER = ['password', 'confirm']

export function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.lookupReset(token).then((res) => {
      if (res.ok) setState({ kind: 'ready', info: res.data })
      else setState({ kind: 'invalid', message: Object.values(res.errors)[0] ?? 'ลิงก์ไม่ถูกต้อง' })
    })
  }, [token])

  const validate = (v: { password: string; confirm: string }) => {
    const e: Record<string, string> = {}
    const pw = validatePassword(v.password)
    if (pw) e.password = pw
    else if (v.confirm !== v.password) e.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return e
  }

  function change(next: Partial<{ password: string; confirm: string }>) {
    const v = { password, confirm, ...next }
    if (next.password !== undefined) setPassword(next.password)
    if (next.confirm !== undefined) setConfirm(next.confirm)
    if (submitted) setErrors(validate(v))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validate({ password, confirm })
    if (Object.keys(local).length) {
      setErrors(local)
      focusFirstError(ORDER, local)
      return
    }
    setBusy(true)
    const res = await api.acceptReset(token, password)
    if (!res.ok) {
      setBusy(false)
      const hasField = Object.keys(res.errors).some((k) => k !== '_')
      if (!hasField) return setState({ kind: 'invalid', message: res.errors._ ?? 'ตั้งรหัสผ่านไม่สำเร็จ' })
      setErrors(res.errors)
      return focusFirstError(ORDER, res.errors)
    }
    // ทุกอุปกรณ์ถูกออกจากระบบแล้ว — ให้เข้าสู่ระบบด้วยรหัสใหม่
    await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined) // ล้าง cookie เก่าของเบราว์เซอร์นี้ (ถ้ามี)
    // ล้าง cookie เก่าของเบราว์เซอร์นี้ (ถ้ามี) เพื่อไม่ให้ถูกพากลับเข้าแอปด้วย session ที่ถูกเพิกถอนแล้ว
    await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login?reset=1')
  }

  if (state.kind === 'loading') return <div className="auth-box muted">กำลังตรวจสอบลิงก์…</div>

  if (state.kind === 'invalid') {
    return (
      <div className="auth-box">
        <h1>ลิงก์ใช้ไม่ได้</h1>
        <p role="alert">{state.message}</p>
        <Link className="btn btn-primary btn-lg" style={{ width: '100%' }} href="/forgot-password">
          ขอลิงก์ใหม่
        </Link>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/login" style={{ color: 'var(--blue)', fontWeight: 600 }}>
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form className="auth-box" onSubmit={submit} noValidate>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      <p>
        สำหรับบัญชี <b>{state.info.email}</b> — เมื่อตั้งแล้วทุกอุปกรณ์จะถูกออกจากระบบ
      </p>
      <FormField
        name="password"
        label="รหัสผ่านใหม่"
        required
        error={errors.password}
        hint="อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข"
        render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => change({ password: e.target.value })} data-autofocus />}
      />
      <FormField name="confirm" label="ยืนยันรหัสผ่านใหม่" required error={errors.confirm} render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => change({ confirm: e.target.value })} />} />
      <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} type="submit" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
      </button>
    </form>
  )
}
