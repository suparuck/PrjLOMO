'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { USER_ROLES, validatePassword } from '@/lib/validators'
import type { InviteInfo } from '@/types'

type State = { kind: 'loading' } | { kind: 'invalid'; message: string } | { kind: 'ready'; info: InviteInfo }

const ORDER = ['name', 'password', 'confirm']

export function InviteForm({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.lookupInvite(token).then((res) => {
      if (res.ok) {
        setName(res.data.name)
        setState({ kind: 'ready', info: res.data })
      } else {
        setState({ kind: 'invalid', message: Object.values(res.errors)[0] ?? 'ลิงก์คำเชิญไม่ถูกต้อง' })
      }
    })
  }, [token])

  const validate = (v: { name: string; password: string; confirm: string }) => {
    const e: Record<string, string> = {}
    if (v.name.trim().length < 2 || v.name.trim().length > 60) e.name = 'ชื่อต้องยาว 2–60 ตัวอักษร'
    const pw = validatePassword(v.password)
    if (pw) e.password = pw
    if (!pw && v.confirm !== v.password) e.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return e
  }

  function change(next: Partial<{ name: string; password: string; confirm: string }>) {
    const v = { name, password, confirm, ...next }
    if (next.name !== undefined) setName(next.name)
    if (next.password !== undefined) setPassword(next.password)
    if (next.confirm !== undefined) setConfirm(next.confirm)
    if (submitted) setErrors(validate(v))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validate({ name, password, confirm })
    if (Object.keys(local).length) {
      setErrors(local)
      focusFirstError(ORDER, local)
      return
    }
    setBusy(true)
    const res = await api.acceptInvite(token, password, name)
    if (!res.ok) {
      setBusy(false)
      // ลิงก์หมดอายุ/ถูกใช้ไประหว่างกรอก → แสดงสถานะลิงก์ใช้ไม่ได้
      const hasField = Object.keys(res.errors).some((k) => k !== '_')
      if (!hasField) return setState({ kind: 'invalid', message: res.errors._ ?? 'ตอบรับคำเชิญไม่สำเร็จ' })
      setErrors(res.errors)
      return focusFirstError(ORDER, res.errors)
    }
    // เข้าสู่ระบบแล้ว (API ตั้ง cookie ให้) — ผู้ดูรายงานไม่มีสิทธิ์ดูแดชบอร์ด จึงไปหน้ารายงาน
    router.replace(res.data.user.role === 'viewer' ? '/reports' : '/dashboard')
    router.refresh()
  }

  if (state.kind === 'loading') return <div className="auth-box muted">กำลังตรวจสอบลิงก์คำเชิญ…</div>

  if (state.kind === 'invalid') {
    return (
      <div className="auth-box">
        <h1>ลิงก์คำเชิญใช้ไม่ได้</h1>
        <p role="alert">{state.message}</p>
        <Link className="btn btn-outline btn-lg" style={{ width: '100%' }} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
          หากยังไม่ได้ตั้งรหัสผ่าน โปรดติดต่อผู้ดูแลระบบเพื่อขอลิงก์ใหม่
        </p>
      </div>
    )
  }

  const { info } = state
  return (
    <form className="auth-box" onSubmit={submit} noValidate>
      <h1>ตอบรับคำเชิญ</h1>
      <p>
        ตั้งรหัสผ่านเพื่อเปิดใช้บัญชี <b>{info.email}</b> · บทบาท {USER_ROLES[info.role].label}
      </p>
      <FormField name="name" label="ชื่อที่แสดง" required error={errors.name} render={(p) => <input {...p} className="input" autoComplete="name" value={name} onChange={(e) => change({ name: e.target.value })} data-autofocus />} />
      <FormField
        name="password"
        label="รหัสผ่าน"
        required
        error={errors.password}
        hint="อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข"
        render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => change({ password: e.target.value })} />}
      />
      <FormField name="confirm" label="ยืนยันรหัสผ่าน" required error={errors.confirm} render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => change({ confirm: e.target.value })} />} />
      <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} type="submit" disabled={busy}>
        {busy ? 'กำลังเปิดใช้บัญชี…' : 'ตั้งรหัสผ่านและเข้าสู่ระบบ'}
      </button>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" style={{ color: 'var(--blue)', fontWeight: 600 }}>
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
