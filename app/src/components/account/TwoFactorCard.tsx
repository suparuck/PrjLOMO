'use client'

import { useEffect, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { api } from '@/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import type { TwoFactorSetup } from '@/types'

type Mode = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regen'

/** การยืนยันตัวตนสองขั้นตอน (TOTP) ของบัญชีตัวเอง — เปิด/ปิด/สร้างรหัสสำรองใหม่ ทุกขั้นต้องยืนยันรหัสผ่านซ้ำ */
export function TwoFactorCard({ enabled, recoveryLeft, onChanged }: { enabled: boolean; recoveryLeft: number; onChanged: () => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('idle')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [qr, setQr] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // สร้าง QR ฝั่งเบราว์เซอร์ — ความลับไม่ถูกส่งไปบริการภายนอก
  useEffect(() => {
    if (!setup) return
    let alive = true
    QRCode.toDataURL(setup.uri, { margin: 1, width: 192 }).then(
      (u) => alive && setQr(u),
      () => alive && setQr(''),
    )
    return () => {
      alive = false
    }
  }, [setup])

  function reset(next: Mode = 'idle') {
    setMode(next)
    setPassword('')
    setCode('')
    setErrors({})
    if (next !== 'scan') setSetup(null)
  }

  function fail(errs: Record<string, string>, order: string[]) {
    setErrors(errs)
    if (errs._) toast(errs._, 'error')
    focusFirstError(order, errs)
  }

  async function startSetup(e: FormEvent) {
    e.preventDefault()
    if (!password) return fail({ password: 'กรุณากรอกรหัสผ่านปัจจุบัน' }, ['password'])
    setBusy(true)
    const res = await api.twoFactorSetup(password)
    setBusy(false)
    if (!res.ok) return fail(res.errors, ['password'])
    setSetup(res.data)
    setPassword('')
    setErrors({})
    setMode('scan')
  }

  async function enable(e: FormEvent) {
    e.preventDefault()
    if (!setup) return
    if (!code.trim()) return fail({ code: 'กรุณากรอกรหัส 6 หลักจากแอป' }, ['code'])
    setBusy(true)
    const res = await api.twoFactorEnable(setup.pending, code)
    setBusy(false)
    if (!res.ok) {
      if (res.errors._) {
        toast(res.errors._, 'error')
        return reset() // หมดอายุ → เริ่มใหม่
      }
      return fail(res.errors, ['code'])
    }
    setCodes(res.data)
    setSetup(null)
    setCode('')
    setErrors({})
    setMode('codes')
    onChanged()
  }

  async function disableOrRegen(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!password) errs.password = 'กรุณากรอกรหัสผ่านปัจจุบัน'
    if (!code.trim()) errs.code = 'กรุณากรอกรหัสจากแอปหรือรหัสสำรอง'
    if (Object.keys(errs).length) return fail(errs, ['password', 'code'])
    setBusy(true)
    if (mode === 'disable') {
      const res = await api.twoFactorDisable(password, code)
      setBusy(false)
      if (!res.ok) return fail(res.errors, ['password', 'code'])
      reset()
      toast('ปิดการยืนยันตัวตนสองขั้นตอนแล้ว — อุปกรณ์อื่นถูกออกจากระบบ')
    } else {
      const res = await api.twoFactorNewRecoveryCodes(password, code)
      setBusy(false)
      if (!res.ok) return fail(res.errors, ['password', 'code'])
      reset('codes')
      setCodes(res.data)
    }
    onChanged()
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast('คัดลอกรหัสสำรองแล้ว')
    } catch {
      toast('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'error')
    }
  }

  const sub = enabled ? 'เปิดใช้งานอยู่ — เข้าสู่ระบบต้องกรอกรหัสจากแอปทุกครั้ง' : 'เพิ่มความปลอดภัยด้วยรหัสจากแอป Authenticator (Google Authenticator, Microsoft Authenticator, Authy ฯลฯ)'

  return (
    <Card>
      <CardHeader title="การยืนยันตัวตนสองขั้นตอน (2FA)" sub={sub} actions={enabled ? <span className="badge s-charging">เปิดอยู่</span> : <span className="badge s-parked">ปิดอยู่</span>} />

      {mode === 'idle' && !enabled && (
        <button type="button" className="btn btn-primary" onClick={() => reset('password')}>
          <Icon name="shield" size={16} />
          เปิดใช้ 2FA
        </button>
      )}
      {mode === 'idle' && enabled && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            รหัสสำรองที่ยังไม่ได้ใช้: <strong>{recoveryLeft}</strong> ชุด{recoveryLeft <= 2 && ' — ใกล้หมด ควรสร้างชุดใหม่'}
          </p>
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={() => reset('regen')}>
              สร้างรหัสสำรองใหม่
            </button>
            <button type="button" className="btn btn-outline" onClick={() => reset('disable')}>
              ปิด 2FA
            </button>
          </div>
        </>
      )}

      {mode === 'password' && (
        <form onSubmit={startSetup} noValidate>
          <FormField
            name="password"
            label="ยืนยันรหัสผ่านปัจจุบัน"
            required
            error={errors.password}
            hint="เพื่อความปลอดภัย ต้องยืนยันรหัสผ่านก่อนตั้งค่า 2FA"
            render={(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          />
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'กำลังตรวจสอบ…' : 'ต่อไป'}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => reset()} disabled={busy}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {mode === 'scan' && setup && (
        <form onSubmit={enable} noValidate>
          <ol className="small" style={{ paddingLeft: 20, marginTop: 0 }}>
            <li>เปิดแอป Authenticator บนมือถือ แล้วเลือกเพิ่มบัญชี (สแกน QR)</li>
            <li>สแกน QR ด้านล่าง หรือกรอกรหัสลับด้วยตัวเอง</li>
            <li>กรอกรหัส 6 หลักที่แอปแสดง แล้วกดยืนยัน</li>
          </ol>
          <div className="flex" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
            {/* data URL สร้างในเบราว์เซอร์ — ไม่ต้องใช้ตัวช่วยปรับภาพของ next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {setup && qr ? <img src={qr} width={192} height={192} alt="QR สำหรับเพิ่มบัญชีในแอป Authenticator" /> : <div style={{ width: 192, height: 192 }} />}
            <div className="small">
              <div className="muted">รหัสลับ (กรณีสแกนไม่ได้)</div>
              <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{setup.secret}</code>
            </div>
          </div>
          <FormField
            name="code"
            label="รหัส 6 หลักจากแอป"
            required
            error={errors.code}
            render={(p) => (
              <input {...p} className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />
            )}
          />
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'กำลังตรวจสอบ…' : 'ยืนยันและเปิดใช้'}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => reset()} disabled={busy}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {mode === 'codes' && (
        <div>
          <div className="banner" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: 16 }}>
            <strong>เก็บรหัสสำรองนี้ไว้ในที่ปลอดภัย — ระบบจะไม่แสดงอีก</strong>
            <span className="small">ใช้แทนรหัสจากแอปได้ชุดละ 1 ครั้ง เมื่อมือถือหาย (ตอนนี้ทุกอุปกรณ์อื่นถูกออกจากระบบแล้ว)</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
              {codes.map((c) => (
                <li key={c}>
                  <code style={{ userSelect: 'all' }}>{c}</code>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-light btn-sm" style={{ alignSelf: 'flex-start' }} onClick={copyCodes}>
              <Icon name="download" size={15} />
              คัดลอกทั้งหมด
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            เก็บแล้ว เสร็จสิ้น
          </button>
        </div>
      )}

      {(mode === 'disable' || mode === 'regen') && (
        <form onSubmit={disableOrRegen} noValidate>
          <p className="small muted" style={{ marginTop: 0 }}>
            {mode === 'disable' ? 'ปิด 2FA แล้วบัญชีจะใช้รหัสผ่านอย่างเดียว และอุปกรณ์อื่นถูกออกจากระบบ' : 'รหัสสำรองชุดเดิมจะใช้ไม่ได้ทันที'}
          </p>
          <FormField
            name="password"
            label="รหัสผ่านปัจจุบัน"
            required
            error={errors.password}
            render={(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />}
          />
          <FormField
            name="code"
            label="รหัสจากแอป หรือรหัสสำรอง"
            required
            error={errors.code}
            render={(p) => <input {...p} className="input" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />}
          />
          <div className="flex" style={{ gap: 8 }}>
            <button className={`btn ${mode === 'disable' ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={busy}>
              {busy ? 'กำลังดำเนินการ…' : mode === 'disable' ? 'ปิด 2FA' : 'สร้างชุดใหม่'}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => reset()} disabled={busy}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}
    </Card>
  )
}
