'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { validateNewDriver } from '@/lib/validators'
import type { Driver, NewDriverDraft, Vehicle } from '@/types'

const ORDER = ['name', 'phone', 'vehicleId']

export function AddDriverModal({
  drivers,
  vehicles,
  onClose,
  onDone,
}: {
  drivers: Driver[]
  vehicles: Vehicle[]
  onClose: () => void
  onDone: (d: Driver) => void
}) {
  const freeVehicles = vehicles.filter((v) => !v.driverId)
  const ctx = { phones: drivers.map((d) => d.phone), freeVehicleIds: freeVehicles.map((v) => v.id) }

  const [draft, setDraft] = useState<NewDriverDraft>({ name: '', phone: '', vehicleId: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof NewDriverDraft, v: string) => {
    const nextDraft = { ...draft, [k]: v }
    setDraft(nextDraft)
    if (submitted) setErrors(validateNewDriver(nextDraft, ctx).errors)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateNewDriver(draft, ctx)
    if (!local.value) {
      setErrors(local.errors)
      focusFirstError(ORDER, local.errors)
      return
    }
    setBusy(true)
    const res = await api.addDriver(draft)
    setBusy(false)
    if (res.ok) return onDone(res.data)
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  return (
    <Modal
      title="เพิ่มคนขับ"
      description="ลงทะเบียนพนักงานขับรถใหม่"
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="add-driver-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'เพิ่มคนขับ'}
          </button>
        </>
      }
    >
      <form id="add-driver-form" className="form-stack" onSubmit={submit} noValidate>
        <FormField name="name" label="ชื่อ-นามสกุล" required error={errors.name} render={(p) => <input {...p} className="input" autoComplete="off" value={draft.name} onChange={(e) => set('name', e.target.value)} data-autofocus />} />
        <FormField name="phone" label="เบอร์โทร" required error={errors.phone} hint="เช่น 081-234-5678" render={(p) => <input {...p} className="input" inputMode="tel" autoComplete="off" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />} />
        <FormField
          name="vehicleId"
          label="รถประจำ"
          error={errors.vehicleId}
          hint={freeVehicles.length === 0 ? 'ทุกคันมีคนขับประจำแล้ว — เพิ่มรถใหม่ได้ที่หน้ารถทั้งหมด' : undefined}
          render={(p) => (
            <select {...p} className="select" value={draft.vehicleId} onChange={(e) => set('vehicleId', e.target.value)}>
              <option value="">ยังไม่ระบุ</option>
              {freeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} · {v.model}
                </option>
              ))}
            </select>
          )}
        />
        <p className="small muted">คนขับใหม่จะยังไม่มีคะแนนจนกว่าจะมีทริปแรก</p>
        {errors._ && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
