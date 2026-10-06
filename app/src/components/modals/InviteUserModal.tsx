'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { USER_ROLES, validateInvite } from '@/lib/validators'
import { InviteLinkPanel } from './InviteLinkPanel'
import type { AppUser, InviteResult, InviteUserDraft, UserRole } from '@/types'

const ORDER = ['email', 'role']

export function InviteUserModal({ users, onClose, onDone }: { users: AppUser[]; onClose: () => void; onDone: (u: AppUser) => void }) {
  const ctx = { emails: users.map((u) => u.email) }
  const [draft, setDraft] = useState<InviteUserDraft>({ email: '', role: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<InviteResult | null>(null)

  const set = (k: keyof InviteUserDraft, v: string) => {
    const nextDraft = { ...draft, [k]: v } as InviteUserDraft
    setDraft(nextDraft)
    if (submitted) setErrors(validateInvite(nextDraft, ctx).errors)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateInvite(draft, ctx)
    if (!local.value) {
      setErrors(local.errors)
      focusFirstError(ORDER, local.errors)
      return
    }
    setBusy(true)
    const res = await api.inviteUser(draft)
    setBusy(false)
    if (res.ok) return setCreated(res.data) // แสดงลิงก์ก่อน แล้วค่อยปิดเมื่อผู้ดูแลกด "เสร็จสิ้น"
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  const role = draft.role ? USER_ROLES[draft.role as UserRole] : null

  if (created) {
    return (
      <Modal
        title="สร้างคำเชิญแล้ว"
        description="ผู้ถูกเชิญเปิดลิงก์เพื่อตั้งรหัสผ่านและเข้าสู่ระบบ"
        size="sm"
        onClose={() => onDone(created.user)}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => onDone(created.user)} data-autofocus>
            เสร็จสิ้น
          </button>
        }
      >
        <InviteLinkPanel email={created.user.email} token={created.token} expiresAt={created.expiresAt} />
        <p className="small muted" style={{ marginTop: 12 }}>
          {created.emailed ? `ส่งอีเมลคำเชิญไปที่ ${created.user.email} แล้ว (ส่งลิงก์ด้านบนเองซ้ำได้) — ` : 'ยังไม่ได้ตั้งค่าอีเมลในระบบ จึงไม่ได้ส่งให้อัตโนมัติ — '}หากทำลิงก์หาย สร้างลิงก์ใหม่ได้จากรายชื่อผู้ใช้ (ลิงก์เดิมจะใช้ไม่ได้)
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="เชิญผู้ใช้"
      description="ผู้ถูกเชิญจะได้รับสิทธิ์ตามบทบาทที่เลือก"
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="invite-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'สร้างคำเชิญ'}
          </button>
        </>
      }
    >
      <form id="invite-form" className="form-stack" onSubmit={submit} noValidate>
        <FormField name="email" label="อีเมล" required error={errors.email} render={(p) => <input {...p} className="input" type="email" autoComplete="off" placeholder="name@company.co.th" value={draft.email} onChange={(e) => set('email', e.target.value)} data-autofocus />} />
        <FormField
          name="role"
          label="บทบาท"
          required
          error={errors.role}
          hint={role ? `สิทธิ์: ${role.permissions}` : undefined}
          render={(p) => (
            <select {...p} className="select" value={draft.role} onChange={(e) => set('role', e.target.value)}>
              <option value="">เลือกบทบาท</option>
              {(Object.keys(USER_ROLES) as UserRole[]).map((k) => (
                <option key={k} value={k}>
                  {USER_ROLES[k].label}
                </option>
              ))}
            </select>
          )}
        />
        <p className="small muted">ระบบจะสร้างลิงก์ตอบรับคำเชิญ (ใช้ครั้งเดียว อายุ 7 วัน) ให้นำไปส่งให้ผู้ถูกเชิญ</p>
        {errors._ && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
