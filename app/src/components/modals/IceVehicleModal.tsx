'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { validateIceVehicle } from '@/lib/validators'
import type { IceDraft, IceVehicle } from '@/types'

const ORDER = ['id', 'model', 'kmPerDay', 'maxKmPerDay', 'fuelPerMonth', 'readinessScore', 'recommendedEv']

const toDraft = (v: IceVehicle): IceDraft => ({
  id: v.id,
  model: v.model,
  kmPerDay: String(v.kmPerDay),
  maxKmPerDay: String(v.maxKmPerDay),
  fuelPerMonth: String(v.fuelPerMonth),
  readinessScore: String(v.readinessScore),
  recommendedEv: v.recommendedEv,
})

/** เพิ่ม/แก้ไข/ลบรถสันดาปที่ยังเหลือในกองยาน — ใช้ในรายงานความพร้อมเปลี่ยนเป็น EV (คะแนนความพร้อมกรอกเอง) */
export function IceVehicleModal({
  vehicle,
  allIds,
  onClose,
  onDone,
}: {
  vehicle?: IceVehicle
  allIds: string[]
  onClose: () => void
  onDone: (action: 'added' | 'updated' | 'deleted', id: string) => void
}) {
  const editing = !!vehicle
  const [draft, setDraft] = useState<IceDraft>(
    vehicle ? toDraft(vehicle) : { id: '', model: '', kmPerDay: '', maxKmPerDay: '', fuelPerMonth: '', readinessScore: '', recommendedEv: '' },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ctx = { ids: editing ? undefined : allIds }

  const set = (k: keyof IceDraft, v: string) => {
    const next = { ...draft, [k]: v }
    setDraft(next)
    if (submitted) setErrors(validateIceVehicle(next, ctx).errors)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateIceVehicle(draft, ctx)
    if (!local.ok) {
      setErrors(local.errors)
      return focusFirstError(ORDER, local.errors)
    }
    setBusy(true)
    const res = editing ? await api.updateIceVehicle(vehicle!.id, draft) : await api.addIceVehicle(draft)
    setBusy(false)
    if (res.ok) return onDone(editing ? 'updated' : 'added', res.data.id)
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  if (confirmDelete && vehicle) {
    return (
      <ConfirmDialog
        title={`ลบรถสันดาป ${vehicle.id}?`}
        confirmLabel="ลบ"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const res = await api.deleteIceVehicle(vehicle.id)
          if (!res.ok) return Object.values(res.errors)[0] ?? 'ลบไม่สำเร็จ'
          onDone('deleted', vehicle.id)
          return null
        }}
      >
        <p>
          รถคันนี้จะหายจากรายงานความพร้อมเปลี่ยนเป็น EV และตัวเลขประหยัดต่อปี — ใช้เมื่อขาย ปลดระวาง หรือเปลี่ยนเป็น EV แล้ว (เพิ่มกลับได้ภายหลัง)
        </p>
      </ConfirmDialog>
    )
  }

  const f = (name: keyof IceDraft, label: string, extra: { hint?: string; inputMode?: 'numeric'; focus?: boolean; readOnly?: boolean } = {}) => (
    <FormField
      name={name}
      label={label}
      required
      error={errors[name]}
      hint={extra.hint}
      render={(p) => (
        <input {...p} className="input" autoComplete="off" inputMode={extra.inputMode} readOnly={extra.readOnly} value={draft[name]} onChange={(e) => set(name, e.target.value)} data-autofocus={extra.focus ? true : undefined} />
      )}
    />
  )

  return (
    <Modal
      title={editing ? 'แก้ไขรถสันดาป' : 'เพิ่มรถสันดาป'}
      description={editing ? vehicle!.id : 'รถยนต์สันดาปที่ยังใช้งานอยู่และพิจารณาเปลี่ยนเป็น EV'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          {editing && (
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)} disabled={busy}>
              ลบรถ
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="ice-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'เพิ่มรถ'}
          </button>
        </>
      }
    >
      <form id="ice-form" className="form-stack" onSubmit={submit} noValidate>
        {!editing && f('id', 'รหัสรถ', { hint: 'ไม่มีช่องว่าง เช่น ICE-21 (แก้ภายหลังไม่ได้)', focus: true })}
        {f('model', 'รุ่นรถ', { focus: editing })}
        <div className="grid g-2" style={{ gap: 12 }}>
          {f('kmPerDay', 'ระยะเฉลี่ย/วัน (กม.)', { inputMode: 'numeric' })}
          {f('maxKmPerDay', 'ระยะสูงสุด/วัน (กม.)', { inputMode: 'numeric' })}
        </div>
        {f('fuelPerMonth', 'ค่าน้ำมัน/เดือน (บาท)', { inputMode: 'numeric' })}
        {f('readinessScore', 'คะแนนความพร้อมเปลี่ยนเป็น EV (0–100)', {
          inputMode: 'numeric',
          hint: 'ประเมินเอง: ≥ 80 พร้อมเปลี่ยนทันที · 60–79 พิจารณา · < 60 ยังไม่แนะนำ (พิจารณาจากระยะสูงสุดต่อวันเทียบระยะวิ่งจริงของ EV และการเข้าถึงที่ชาร์จ)',
        })}
        {f('recommendedEv', 'รุ่น EV ที่แนะนำ', { hint: 'เช่น BYD Dolphin หรือ "รอรุ่นที่เหมาะสม"' })}
        {errors._ && (
          <p className="field-error" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
