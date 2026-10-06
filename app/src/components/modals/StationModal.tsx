'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { validateStation } from '@/lib/validators'
import type { NewStationDraft, Station } from '@/types'

const ORDER = ['name', 'type', 'network', 'power', 'ports', 'pricePerKwh', 'lat', 'lng']
const INTERNAL = 'ภายในองค์กร'

const toDraft = (s: Station): NewStationDraft => ({
  name: s.name,
  type: s.type,
  network: s.network,
  power: s.power,
  ports: String(s.ports),
  pricePerKwh: String(s.pricePerKwh),
  lat: String(s.lat),
  lng: String(s.lng),
})

/** เพิ่ม/แก้ไขสถานีชาร์จ — สถานีใหม่เริ่มที่จุดกึ่งกลางแผนที่ขององค์กร (แก้พิกัดได้) · ลบได้เมื่อไม่มีประวัติการชาร์จ */
export function StationModal({
  station,
  stations,
  center,
  onClose,
  onDone,
}: {
  station?: Station
  stations: Station[]
  center: [number, number]
  onClose: () => void
  onDone: (action: 'added' | 'updated' | 'deleted', s: Station) => void
}) {
  const editing = !!station
  const [draft, setDraft] = useState<NewStationDraft>(
    station
      ? toDraft(station)
      : { name: '', type: 'depot', network: INTERNAL, power: '', ports: '2', pricePerKwh: '', lat: center[0].toFixed(5), lng: center[1].toFixed(5) },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ctx = { names: stations.filter((s) => s.id !== station?.id).map((s) => s.name), busy: station?.busy ?? 0 }

  const set = (k: keyof NewStationDraft, v: string) => {
    let next = { ...draft, [k]: v }
    // เปลี่ยนเป็นสาธารณะแล้วเครือข่ายยังเป็นค่าตั้งต้นของ Depot → ล้างให้กรอกใหม่ (และกลับกัน)
    if (k === 'type' && v === 'public' && draft.network === INTERNAL) next = { ...next, network: '' }
    if (k === 'type' && v === 'depot' && !draft.network.trim()) next = { ...next, network: INTERNAL }
    setDraft(next)
    if (submitted) setErrors(validateStation(next, ctx).errors)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateStation(draft, ctx)
    if (!local.value) {
      setErrors(local.errors)
      focusFirstError(ORDER, local.errors)
      return
    }
    setBusy(true)
    const res = editing ? await api.updateStation(station!.id, draft) : await api.addStation(draft)
    setBusy(false)
    if (res.ok) return onDone(editing ? 'updated' : 'added', res.data)
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  if (confirmDelete && station) {
    return (
      <ConfirmDialog
        title={`ลบสถานี ${station.name}?`}
        confirmLabel="ลบสถานี"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const res = await api.deleteStation(station.id)
          if (!res.ok) return Object.values(res.errors)[0] ?? 'ลบไม่สำเร็จ'
          onDone('deleted', station)
          return null
        }}
      >
        <p>ลบได้เฉพาะสถานีที่ยังไม่มีประวัติการชาร์จ — ถ้ามีประวัติ ระบบจะไม่ลบ (แก้ไขชื่อหรือรายละเอียดแทนได้)</p>
      </ConfirmDialog>
    )
  }

  const text = (name: keyof NewStationDraft, label: string, extra: { hint?: string; inputMode?: 'decimal' | 'numeric'; required?: boolean; focus?: boolean } = {}) => (
    <FormField
      name={name}
      label={label}
      required={extra.required ?? true}
      error={errors[name]}
      hint={extra.hint}
      render={(p) => <input {...p} className="input" autoComplete="off" inputMode={extra.inputMode} value={draft[name]} onChange={(e) => set(name, e.target.value)} data-autofocus={extra.focus ? true : undefined} />}
    />
  )

  return (
    <Modal
      title={editing ? 'แก้ไขสถานีชาร์จ' : 'เพิ่มสถานีชาร์จ'}
      description={editing ? `รหัส ${station!.id}` : 'Depot ขององค์กรหรือสถานีสาธารณะที่ใช้ชาร์จ'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          {editing && (
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)} disabled={busy}>
              ลบสถานี
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="station-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'เพิ่มสถานี'}
          </button>
        </>
      }
    >
      <form id="station-form" className="form-stack" onSubmit={submit} noValidate>
        {text('name', 'ชื่อสถานี', { focus: true })}
        <FormField
          name="type"
          label="ประเภท"
          render={(p) => (
            <select {...p} className="select" value={draft.type} onChange={(e) => set('type', e.target.value)}>
              <option value="depot">Depot (ขององค์กร)</option>
              <option value="public">สาธารณะ</option>
            </select>
          )}
        />
        {text('network', 'เครือข่าย / ผู้ให้บริการ', { hint: 'เช่น ภายในองค์กร, PEA VOLTA, EA Anywhere' })}
        {text('power', 'กำลังชาร์จ', { hint: 'เช่น AC 22 kW, DC 120 kW' })}
        <div className="grid g-2" style={{ gap: 12 }}>
          {text('ports', 'จำนวนช่องชาร์จ', { inputMode: 'numeric', hint: editing && station!.busy > 0 ? `ใช้งานอยู่ ${station!.busy} ช่อง — ลดต่ำกว่านี้ไม่ได้` : undefined })}
          {text('pricePerKwh', 'ราคา (บาท/kWh)', { inputMode: 'decimal', hint: 'ทศนิยมไม่เกิน 2 ตำแหน่ง' })}
        </div>
        <div className="grid g-2" style={{ gap: 12 }}>
          {text('lat', 'ละติจูด', { inputMode: 'decimal', hint: '−90 ถึง 90' })}
          {text('lng', 'ลองจิจูด', { inputMode: 'decimal', hint: '−180 ถึง 180' })}
        </div>
        <p className="small muted">เริ่มต้นที่จุดกึ่งกลางแผนที่ขององค์กร — คัดลอกพิกัดจากแผนที่ (คลิกขวาที่จุดบน Google Maps หรือ OpenStreetMap) มาวางได้</p>
        {errors._ && (
          <p className="field-error" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
