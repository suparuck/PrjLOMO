'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

/** กล่องยืนยันการกระทำที่ย้อนกลับไม่ได้ — onConfirm คืนข้อความผิดพลาดถ้าไม่สำเร็จ (กล่องจะไม่ปิด) */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<string | null>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    const err = await onConfirm()
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy} data-autofocus>
            ยกเลิก
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={confirm} disabled={busy}>
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="small">{children}</div>
      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </Modal>
  )
}
