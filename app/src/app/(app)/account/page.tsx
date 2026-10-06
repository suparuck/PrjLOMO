'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageLoading } from '@/components/ui/PageLoading'
import { Card, CardHeader } from '@/components/ui/Card'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'
import { TwoFactorCard } from '@/components/account/TwoFactorCard'
import { NotifyCard } from '@/components/account/NotifyCard'
import { USER_ROLES, validatePasswordChange } from '@/lib/validators'

const ORDER = ['current', 'next', 'confirm']
const EMPTY = { current: '', next: '', confirm: '' }

/** บัญชีของฉัน — ทุกบทบาทเข้าได้ (ผู้ดูรายงานไม่มีสิทธิ์เข้าหน้าตั้งค่า จึงเปลี่ยนรหัสผ่านที่นี่) */
export default function AccountPage() {
  const toast = useToast()
  const { data: me, error, reload } = useAsync(() => api.getMe())
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!me) return <PageLoading error={error} />

  function change(next: Partial<typeof EMPTY>) {
    const v = { ...form, ...next }
    setForm(v)
    if (submitted) setErrors(validatePasswordChange(v))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validatePasswordChange(form)
    if (Object.keys(local).length) {
      setErrors(local)
      focusFirstError(ORDER, local)
      return
    }
    setBusy(true)
    const res = await api.changePassword(form.current, form.next)
    setBusy(false)
    if (!res.ok) {
      // ชื่อฟิลด์ใน API → ช่องในฟอร์ม
      const mapped = Object.fromEntries(Object.entries(res.errors).map(([k, v]) => [k === 'currentPassword' ? 'current' : k === 'newPassword' ? 'next' : k, v]))
      setErrors(mapped)
      if (mapped._) toast(mapped._, 'error')
      return focusFirstError(ORDER, mapped)
    }
    setForm(EMPTY)
    setErrors({})
    setSubmitted(false)
    toast('เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่นถูกออกจากระบบ')
  }

  const role = USER_ROLES[me.role]
  return (
    <div className="grid g-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHeader title="ข้อมูลบัญชี" />
        <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 20px', margin: 0 }}>
          <dt className="muted">ชื่อที่แสดง</dt>
          <dd style={{ margin: 0 }}>{me.name}</dd>
          <dt className="muted">อีเมล</dt>
          <dd style={{ margin: 0 }}>{me.email}</dd>
          <dt className="muted">บทบาท</dt>
          <dd style={{ margin: 0 }}>
            <span className={`badge ${role.badge}`}>{role.label}</span> <span className="muted">{role.permissions}</span>
          </dd>
        </dl>
      </Card>

      <TwoFactorCard enabled={!!me.twoFactorEnabled} recoveryLeft={me.recoveryCodesLeft ?? 0} onChanged={reload} />

      <NotifyCard prefs={me.notify ?? { alertEmail: true, loginFailed: true, newNetwork: true, dailyDigest: true }} role={me.role} onChanged={reload} />

      <Card>
        <CardHeader title="เปลี่ยนรหัสผ่าน" sub="เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นที่ล็อกอินอยู่จะถูกออกจากระบบ" />
        <form onSubmit={submit} noValidate>
          <FormField
            name="current"
            label="รหัสผ่านปัจจุบัน"
            required
            error={errors.current}
            render={(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={form.current} onChange={(e) => change({ current: e.target.value })} />}
          />
          <FormField
            name="next"
            label="รหัสผ่านใหม่"
            required
            error={errors.next}
            hint="อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข"
            render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.next} onChange={(e) => change({ next: e.target.value })} />}
          />
          <FormField
            name="confirm"
            label="ยืนยันรหัสผ่านใหม่"
            required
            error={errors.confirm}
            render={(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => change({ confirm: e.target.value })} />}
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </Card>
    </div>
  )
}
