'use client'

import { useState } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { InviteLinkPanel } from './InviteLinkPanel'
import type { AppUser, ResetLinkResult } from '@/types'

/** ผู้ดูแลสร้างลิงก์รีเซ็ตรหัสผ่านให้ผู้ใช้ (กรณีไม่ได้ตั้งค่าอีเมล หรือผู้ใช้เข้าอีเมลไม่ได้) — ผู้ดูแลไม่เห็นรหัสผ่านใหม่ */
export function ResetLinkModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState<ResetLinkResult | null>(null)

  async function create() {
    setBusy(true)
    setError('')
    const res = await api.adminResetLink(user.id)
    setBusy(false)
    if (!res.ok) return setError(Object.values(res.errors)[0] ?? 'สร้างลิงก์ไม่สำเร็จ')
    setFresh(res.data)
  }

  return (
    <Modal
      title="รีเซ็ตรหัสผ่าน"
      description={user.email}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ปิด
          </button>
          {!fresh && (
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy} data-autofocus>
              {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์รีเซ็ต'}
            </button>
          )}
        </>
      }
    >
      {fresh ? (
        <InviteLinkPanel email={fresh.email} token={fresh.token} expiresAt={fresh.expiresAt} kind="reset" />
      ) : (
        <p className="small">
          ระบบจะสร้างลิงก์ใช้ครั้งเดียว (อายุ 60 นาที) ให้นำไปส่งให้ผู้ใช้ตั้งรหัสผ่านใหม่เอง — ผู้ดูแลไม่เห็นรหัสผ่านของผู้ใช้ ลิงก์รีเซ็ตเดิมที่ค้างอยู่จะใช้ไม่ได้ และเมื่อผู้ใช้ตั้งรหัสใหม่แล้วทุกอุปกรณ์จะถูกออกจากระบบ
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
