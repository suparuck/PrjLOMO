'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { validateNewVehicle } from '@/lib/validators'
import type { Driver, NewVehicleDraft, Vehicle } from '@/types'

const ORDER = ['id', 'plate', 'model', 'batteryKwh', 'soc', 'odometer', 'driverId']

export function AddVehicleModal({
  vehicles,
  drivers,
  onClose,
  onDone,
}: {
  vehicles: Vehicle[]
  drivers: Driver[]
  onClose: () => void
  onDone: (v: Vehicle) => void
}) {
  const freeDrivers = drivers.filter((d) => !vehicles.some((v) => v.driverId === d.id))
  const next = Math.max(0, ...vehicles.map((v) => Number(v.id.replace(/\D/g, '')) || 0)) + 1
  const ctx = { ids: vehicles.map((v) => v.id), plates: vehicles.map((v) => v.plate), freeDriverIds: freeDrivers.map((d) => d.id) }

  const [draft, setDraft] = useState<NewVehicleDraft>({
    id: `EV-${String(next).padStart(3, '0')}`,
    model: '',
    plate: '',
    driverId: '',
    batteryKwh: '',
    soc: '100',
    odometer: '0',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof NewVehicleDraft, v: string) => {
    const nextDraft = { ...draft, [k]: v }
    setDraft(nextDraft)
    if (submitted) setErrors(validateNewVehicle(nextDraft, ctx).errors)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateNewVehicle(draft, ctx)
    if (!local.value) {
      setErrors(local.errors)
      focusFirstError(ORDER, local.errors)
      return
    }
    setBusy(true)
    const res = await api.addVehicle(draft)
    setBusy(false)
    if (res.ok) return onDone(res.data)
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  const models = [...new Set(vehicles.map((v) => v.model))]

  return (
    <Modal
      title="เพิ่มรถ"
      description="ลงทะเบียนรถไฟฟ้าคันใหม่เข้ากองยาน"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="add-vehicle-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'เพิ่มรถ'}
          </button>
        </>
      }
    >
      <form id="add-vehicle-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <FormField name="id" label="รหัสรถ" required error={errors.id} render={(p) => <input {...p} className="input" value={draft.id} onChange={(e) => set('id', e.target.value)} data-autofocus />} />
          <FormField name="plate" label="ทะเบียน" required error={errors.plate} hint="เช่น 1กข 1234" render={(p) => <input {...p} className="input" value={draft.plate} onChange={(e) => set('plate', e.target.value)} />} />
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField
              name="model"
              label="ยี่ห้อ / รุ่น"
              required
              error={errors.model}
              render={(p) => (
                <>
                  <input {...p} className="input" list="vehicle-models" value={draft.model} onChange={(e) => set('model', e.target.value)} />
                  <datalist id="vehicle-models">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            />
          </div>
          <FormField name="batteryKwh" label="ความจุแบต (kWh)" required error={errors.batteryKwh} render={(p) => <input {...p} className="input" inputMode="decimal" value={draft.batteryKwh} onChange={(e) => set('batteryKwh', e.target.value)} />} />
          <FormField name="soc" label="ระดับแบตปัจจุบัน (%)" required error={errors.soc} render={(p) => <input {...p} className="input" inputMode="numeric" value={draft.soc} onChange={(e) => set('soc', e.target.value)} />} />
          <FormField name="odometer" label="เลขไมล์ (กม.)" required error={errors.odometer} render={(p) => <input {...p} className="input" inputMode="numeric" value={draft.odometer} onChange={(e) => set('odometer', e.target.value)} />} />
          <FormField
            name="driverId"
            label="คนขับประจำ"
            error={errors.driverId}
            hint={freeDrivers.length === 0 ? 'ทุกคนมีรถประจำแล้ว — เพิ่มคนขับใหม่ได้ที่หน้าพนักงานขับรถ' : undefined}
            render={(p) => (
              <select {...p} className="select" value={draft.driverId} onChange={(e) => set('driverId', e.target.value)}>
                <option value="">ยังไม่ระบุ</option>
                {freeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
        <p className="small muted" style={{ marginTop: 14 }}>
          รถจะแสดงเป็น “ออฟไลน์” จนกว่าอุปกรณ์ติดตามจะส่งสัญญาณครั้งแรก
        </p>
        {errors._ && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
