'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { RangeField } from '@/components/ui/RangeField'
import { validateChargingTarget } from '@/lib/validators'
import type { ChargingSession } from '@/types'

export function ChargingTargetModal({
  session,
  model,
  onClose,
  onDone,
}: {
  session: ChargingSession
  model: string
  onClose: () => void
  onDone: (target: number, eta: string) => void
}) {
  const [target, setTarget] = useState(session.targetSoc)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const local = validateChargingTarget(target, session.nowSoc)
    if (local) return setError(local)
    setBusy(true)
    const res = await api.setChargingTarget(session.vehicleId, target)
    setBusy(false)
    if (res.ok) return onDone(target, res.data.eta)
    setError(res.errors.target ?? res.errors._ ?? 'บันทึกไม่สำเร็จ')
  }

  return (
    <Modal
      title="ปรับเป้าหมายการชาร์จ"
      description={`${session.vehicleId} · ${model} · ${session.stationName}`}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="charging-target-form" className="btn btn-primary" disabled={busy || target === session.targetSoc}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกเป้าหมาย'}
          </button>
        </>
      }
    >
      <form id="charging-target-form" className="form-stack" onSubmit={submit} noValidate>
        <RangeField
          label="เป้าหมายแบต"
          hint={`ปัจจุบัน ${session.nowSoc}% · เป้าหมายเดิม ${session.targetSoc}% · ปรับได้ตั้งแต่ระดับปัจจุบันถึง 100%`}
          min={session.nowSoc}
          max={100}
          value={target}
          format={(v) => `${v}%`}
          onChange={(v) => {
            setTarget(v)
            setError('')
          }}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="small muted">แนะนำให้ชาร์จเต็ม 100% เฉพาะวันที่ต้องวิ่งไกล เพื่อยืดอายุแบต</p>
      </form>
    </Modal>
  )
}
