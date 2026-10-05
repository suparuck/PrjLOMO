'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { formatDayTime } from '@/lib/time'

/** จัดการ API key สำหรับอุปกรณ์/ระบบภายนอกที่ส่งข้อมูลเข้า /api/v1/ingest/* (เฉพาะผู้ดูแลระบบ) */
export function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { data: keys, error, reload } = useAsync(() => api.listApiKeys())
  const [name, setName] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setFieldError('กรุณาตั้งชื่อคีย์ เช่น ชื่ออุปกรณ์หรือระบบที่จะใช้')
    setBusy(true)
    const res = await api.createApiKey(name.trim())
    setBusy(false)
    if (!res.ok) return setFieldError(Object.values(res.errors)[0] ?? 'สร้างคีย์ไม่สำเร็จ')
    setCreated({ key: res.data.key, name: res.data.name })
    setName('')
    setFieldError('')
    setCopied(false)
    reload()
  }

  async function revoke(id: string, keyName: string) {
    const res = await api.revokeApiKey(id)
    if (!res.ok) return toast(Object.values(res.errors)[0] ?? 'เพิกถอนไม่สำเร็จ', 'error')
    toast(`เพิกถอนคีย์ “${keyName}” แล้ว`)
    reload()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      toast('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'error')
    }
  }

  return (
    <Modal title="API key สำหรับส่งข้อมูลเข้าระบบ" description="ใช้กับ endpoint /api/v1/ingest/* ผ่านส่วนหัว X-API-Key" onClose={onClose} dismissible={!busy}>
      {created && (
        <div className="banner" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: 16 }}>
          <strong>คีย์ “{created.name}” — คัดลอกเก็บไว้ตอนนี้ ระบบจะไม่แสดงอีก</strong>
          <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{created.key}</code>
          <button type="button" className="btn btn-light btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => copy(created.key)}>
            <Icon name={copied ? 'check' : 'download'} size={15} />
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
        </div>
      )}

      <form className="flex wrap" style={{ alignItems: 'flex-start', marginBottom: 18 }} onSubmit={create} noValidate>
        <div style={{ flex: 1, minWidth: 200 }}>
          <FormField
            name="keyName"
            label="ชื่อคีย์"
            error={fieldError}
            render={(p) => (
              <input {...p} className="input" placeholder="เช่น Telematics ศูนย์เชียงใหม่" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
            )}
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={busy}>
          <Icon name="plus" size={16} />
          {busy ? 'กำลังสร้าง…' : 'สร้างคีย์'}
        </button>
      </form>

      <h4 style={{ marginBottom: 8 }}>คีย์ที่มีอยู่</h4>
      {error && <p className="field-error">{error.message}</p>}
      {!keys && !error && <p className="muted small">กำลังโหลด…</p>}
      {keys && keys.length === 0 && <p className="muted small">ยังไม่มีคีย์</p>}
      <div className="list">
        {keys?.map((k) => (
          <div className="li" key={k.id} style={{ opacity: k.revokedAt ? 0.55 : 1 }}>
            <div className="li-body">
              <strong>{k.name}</strong>
              <p>
                {k.prefix}… · {k.revokedAt ? 'เพิกถอนแล้ว' : k.lastUsedAt ? `ใช้ล่าสุด ${formatDayTime(k.lastUsedAt)}` : 'ยังไม่เคยใช้'}
              </p>
            </div>
            {!k.revokedAt && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => revoke(k.id, k.name)}>
                เพิกถอน
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
