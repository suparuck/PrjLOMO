'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { USER_ROLES } from '@/lib/validators'
import type { AppUser, UserRole } from '@/types'

const ORDER = ['name', 'role', 'status']

/** แก้ไขผู้ใช้: ชื่อที่แสดง บทบาท และเปิด/ปิดใช้งานบัญชี — บทบาทและสถานะของตัวเองแก้ไม่ได้ (กันล็อกตัวเองออก) */
export function UserEditModal({ user, isSelf, onClose, onSaved }: { user: AppUser; isSelf: boolean; onClose: () => void; onSaved: (u: AppUser) => void }) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<UserRole>(user.roleKey)
  const [active, setActive] = useState(user.status === 'active')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed.length < 2 || trimmed.length > 60) {
      const err = { name: 'ชื่อต้องยาว 2–60 ตัวอักษร' }
      setErrors(err)
      return focusFirstError(ORDER, err)
    }
    setBusy(true)
    const res = await api.updateUser(user.id, { name: trimmed, role, status: active ? 'active' : 'disabled' })
    setBusy(false)
    if (!res.ok) {
      setErrors(res.errors)
      return focusFirstError(ORDER, res.errors)
    }
    onSaved(res.data)
  }

  return (
    <Modal
      title="แก้ไขผู้ใช้"
      description={user.email}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="user-edit-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="user-edit-form" onSubmit={submit} noValidate>
        <FormField
          name="name"
          label="ชื่อที่แสดง"
          required
          error={errors.name}
          render={(p) => <input {...p} className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />}
        />
        <FormField
          name="role"
          label="บทบาท"
          error={errors.role}
          hint={isSelf ? 'เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ผู้ดูแลระบบอีกคนทำให้' : USER_ROLES[role].permissions}
          render={(p) => (
            <select {...p} className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf}>
              {(Object.keys(USER_ROLES) as UserRole[]).map((k) => (
                <option key={k} value={k}>
                  {USER_ROLES[k].label}
                </option>
              ))}
            </select>
          )}
        />
        <div className="field">
          <div className="flex between" style={{ gap: 12 }}>
            <label htmlFor="f-status">เปิดใช้งานบัญชี</label>
            {isSelf ? <span className="small muted">ปิดบัญชีตัวเองไม่ได้</span> : <Switch checked={active} onChange={setActive} label="เปิดใช้งานบัญชี" />}
          </div>
          {!active && !isSelf && (
            <span className="hint">
              ปิดแล้วผู้ใช้จะเข้าสู่ระบบไม่ได้ และทุกอุปกรณ์ที่ล็อกอินอยู่ถูกออกจากระบบทันที (เปิดใหม่ได้ ใช้รหัสผ่านเดิม)
            </span>
          )}
          {errors.status && (
            <span className="field-error" id="f-status-msg" role="alert">
              {errors.status}
            </span>
          )}
        </div>
        {errors._ && (
          <p className="field-error" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
