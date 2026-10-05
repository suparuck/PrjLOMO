'use client'

import { useState } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InviteLinkPanel } from './InviteLinkPanel'
import type { AppUser, InviteResult } from '@/types'

/** จัดการคำเชิญที่ยังไม่ตอบรับ: สร้างลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้) หรือยกเลิกคำเชิญ */
export function InviteManageModal({
  user,
  onClose,
  onChanged,
}: {
  user: AppUser
  onClose: () => void
  /** เรียกเมื่อรายชื่อเปลี่ยน (สร้างลิงก์ใหม่ / ยกเลิก) — action บอกชนิด */
  onChanged: (action: 'resent' | 'cancelled') => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState<InviteResult | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  async function resend() {
    setBusy(true)
    setError('')
    const res = await api.resendInvite(user.id)
    setBusy(false)
    if (!res.ok) return setError(Object.values(res.errors)[0] ?? 'สร้างลิงก์ไม่สำเร็จ')
    setFresh(res.data)
    onChanged('resent')
  }

  if (confirmCancel) {
    return (
      <ConfirmDialog
        title="ยกเลิกคำเชิญ?"
        confirmLabel="ยกเลิกคำเชิญ"
        danger
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          const res = await api.cancelInvite(user.id)
          if (!res.ok) return Object.values(res.errors)[0] ?? 'ยกเลิกไม่สำเร็จ'
          onChanged('cancelled')
          return null
        }}
      >
        <p>
          ลบคำเชิญของ <b>{user.email}</b> ลิงก์ที่ส่งไปแล้วจะใช้ไม่ได้ทันที (เชิญใหม่ภายหลังได้)
        </p>
      </ConfirmDialog>
    )
  }

  return (
    <Modal
      title="คำเชิญที่รอตอบรับ"
      description={`${user.email} · ${user.role}`}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => setConfirmCancel(true)} disabled={busy}>
            ยกเลิกคำเชิญ
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ปิด
          </button>
          {!fresh && (
            <button type="button" className="btn btn-primary" onClick={resend} disabled={busy} data-autofocus>
              {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์ใหม่'}
            </button>
          )}
        </>
      }
    >
      {fresh ? (
        <InviteLinkPanel email={user.email} token={fresh.token} expiresAt={fresh.expiresAt} />
      ) : (
        <p className="small">
          ระบบเก็บเฉพาะค่าแฮชของลิงก์ จึงเปิดดูลิงก์เดิมไม่ได้ — หากผู้ถูกเชิญทำลิงก์หายหรือหมดอายุ ให้สร้างลิงก์ใหม่ (ลิงก์เดิมจะใช้ไม่ได้ทันที)
        </p>
      )}
      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </Modal>
  )
}
