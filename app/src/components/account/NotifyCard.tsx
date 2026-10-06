'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import type { NotifyPrefs, UserRole } from '@/types'

/** การรับอีเมลแจ้งเตือนของตัวเอง — ปิดเตือนด้านความปลอดภัยต้องยืนยันรหัสผ่านซ้ำ (กัน session ที่ถูกขโมยปิดเสียงเตือนของเจ้าของบัญชี) */
export function NotifyCard({ prefs, role, onChanged }: { prefs: NotifyPrefs; role: UserRole; onChanged: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // กำลังจะปิดเตือนความปลอดภัย: เก็บค่าที่ขอไว้ รอรหัสผ่าน
  const [pending, setPending] = useState<Partial<NotifyPrefs> | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function save(patch: Partial<NotifyPrefs>, pw?: string) {
    setBusy(true)
    const res = await api.saveNotifyPrefs(patch, pw)
    setBusy(false)
    if (!res.ok) {
      setError(res.errors.password ?? res.errors._ ?? 'บันทึกไม่สำเร็จ')
      return false
    }
    setPending(null)
    setPassword('')
    setError('')
    toast('บันทึกการตั้งค่าแจ้งเตือนแล้ว')
    onChanged()
    return true
  }

  function toggle(key: keyof NotifyPrefs, value: boolean) {
    const security = key !== 'alertEmail'
    if (security && !value) {
      setPending({ [key]: false })
      setError('')
      return
    }
    void save({ [key]: value })
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!pending) return
    if (!password) return setError('กรุณายืนยันรหัสผ่านก่อนปิดการแจ้งเตือนด้านความปลอดภัย')
    await save(pending, password)
  }

  const rows: { key: keyof NotifyPrefs; title: string; text: string; show: boolean }[] = [
    { key: 'alertEmail', title: 'แจ้งเตือนเหตุการณ์กองยานทางอีเมล', text: 'แบตต่ำ/วิกฤต และเหตุการณ์ระดับเตือนขึ้นไป (ต้องเปิดสวิตช์อีเมลที่ตั้งค่า > เกณฑ์การแจ้งเตือนด้วย)', show: role !== 'viewer' },
    { key: 'dailyDigest', title: 'สรุปกองยานประจำวันทางอีเมล', text: 'ทุกเช้า (ค่าเริ่มต้น 08:00 น.) สถานะรถ แจ้งเตือนและการชาร์จของเมื่อวาน (ต้องเปิดสวิตช์สรุปรายวันที่ ตั้งค่า > เกณฑ์การแจ้งเตือนด้วย)', show: role !== 'viewer' },
    { key: 'loginFailed', title: 'เตือนเมื่อมีคนพยายามเข้าบัญชีของฉันด้วยรหัสผ่านผิดซ้ำ', text: 'ส่งเมื่อรหัสผ่านผิด 5 ครั้ง หรือรหัส 2FA ผิด 3 ครั้งใน 15 นาที (ไม่เกิน 1 ฉบับ/ชั่วโมง)', show: true },
    { key: 'newNetwork', title: 'เตือนเมื่อเข้าสู่ระบบจากเครือข่ายใหม่', text: 'ส่งเมื่อบัญชีเข้าจากเครือข่ายที่ไม่เคยใช้ใน 90 วัน', show: true },
  ]

  return (
    <Card>
      <CardHeader title="การแจ้งเตือนทางอีเมล" sub="เลือกอีเมลที่ต้องการรับ — ต้องตั้งค่า SMTP ที่ระบบก่อนจึงจะส่งได้" />
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <div className="set-row" key={r.key}>
            <div>
              <strong>{r.title}</strong>
              <p>{r.text}</p>
            </div>
            <Switch label={r.title} checked={prefs[r.key]} disabled={busy || !!pending} onChange={(v) => toggle(r.key, v)} />
          </div>
        ))}
      {pending && (
        <form onSubmit={confirm} noValidate style={{ marginTop: 12 }}>
          <FormField
            name="notify-password"
            label="ยืนยันรหัสผ่านเพื่อปิดการแจ้งเตือนนี้"
            required
            error={error}
            hint="การปิดเตือนความปลอดภัยทำให้คุณไม่ทราบเมื่อมีคนพยายามเข้าบัญชี จึงต้องยืนยันตัวตน"
            render={(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />}
          />
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn btn-danger" type="submit" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ปิดการแจ้งเตือน'}
            </button>
            <button className="btn btn-outline" type="button" disabled={busy} onClick={() => { setPending(null); setPassword(''); setError('') }}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}
      {!pending && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
