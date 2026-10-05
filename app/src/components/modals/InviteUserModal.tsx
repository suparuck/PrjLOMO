'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { USER_ROLES, validateInvite } from '@/lib/validators'
import type { AppUser, InviteUserDraft, UserRole } from '@/types'

const ORDER = ['email', 'role']

export function InviteUserModal({ users, onClose, onDone }: { users: AppUser[]; onClose: () => void; onDone: (u: AppUser) => void }) {
  const ctx = { emails: users.map((u) => u.email) }
  const [draft, setDraft] = useState<InviteUserDraft>({ email: '', role: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

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
    if (res.ok) return onDone(res.data)
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  const role = draft.role ? USER_ROLES[draft.role as UserRole] : null

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
            {busy ? 'กำลังบันทึก…' : 'ส่งคำเชิญ'}
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
        <p className="small muted">ต้นแบบนี้ยังไม่ได้ส่งอีเมลจริง — ระบบบันทึกคำเชิญเป็น “รอตอบรับ” เท่านั้น</p>
      </form>
    </Modal>
  )
}
