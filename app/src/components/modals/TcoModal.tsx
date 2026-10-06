'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { Icon } from '@/components/ui/Icon'
import { fmt } from '@/lib/format'
import { validateTco } from '@/lib/validators'
import type { TcoDraft } from '@/types'

const MAX_ITEMS = 12
const money = (s: string) => {
  const n = Number(s.trim().replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** ตั้งค่าต้นทุนรวมตลอดอายุ (TCO) 5 ปีต่อคัน: รายการต้นทุนของรถสันดาปเทียบ EV และชื่อรถที่เปรียบเทียบ */
export function TcoModal({ initial, onClose, onDone }: { initial: TcoDraft; onClose: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState<TcoDraft>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = (next: TcoDraft) => {
    setDraft(next)
    if (submitted) setErrors(validateTco(next).errors)
  }
  const setItem = (i: number, k: 'label' | 'iceCost' | 'evCost', v: string) => update({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) })
  const total = (k: 'iceCost' | 'evCost') => draft.items.reduce((s, it) => s + money(it[k]), 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validateTco(draft)
    if (!local.ok) {
      setErrors(local.errors)
      return focusFirstError(['iceName', 'evName', 'items'], local.errors)
    }
    setBusy(true)
    const res = await api.saveTco(draft)
    setBusy(false)
    if (res.ok) return onDone()
    setErrors(res.errors)
  }

  const cell = (i: number, k: 'label' | 'iceCost' | 'evCost', label: string) => {
    const err = errors[`items.${i}.${k}`]
    return (
      <div style={{ minWidth: 0 }}>
        <input
          className="input"
          aria-label={`${label} รายการที่ ${i + 1}`}
          aria-invalid={err ? true : undefined}
          inputMode={k === 'label' ? undefined : 'decimal'}
          autoComplete="off"
          value={draft.items[i][k]}
          onChange={(e) => setItem(i, k, e.target.value)}
        />
        {err && (
          <span className="field-error" role="alert">
            {err}
          </span>
        )}
      </div>
    )
  }

  return (
    <Modal
      title="ตั้งค่าต้นทุนรวม (TCO) 5 ปี"
      description="ต้นทุนต่อคัน เทียบรถสันดาปกับ EV (บาท) — ใช้ในกราฟของรายงานความพร้อมเปลี่ยนเป็น EV"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="tco-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="tco-form" onSubmit={submit} noValidate>
        <div className="grid g-2" style={{ gap: 12 }}>
          <FormField name="iceName" label="รถสันดาปที่ใช้เปรียบเทียบ" required error={errors.iceName} render={(p) => <input {...p} className="input" autoComplete="off" value={draft.iceName} onChange={(e) => update({ ...draft, iceName: e.target.value })} data-autofocus />} />
          <FormField name="evName" label="EV ที่ใช้เปรียบเทียบ" required error={errors.evName} render={(p) => <input {...p} className="input" autoComplete="off" value={draft.evName} onChange={(e) => update({ ...draft, evName: e.target.value })} />} />
        </div>

        <div className="field">
          <label id="f-items-label">รายการต้นทุน (บาทต่อคัน ตลอด 5 ปี)</label>
          <div id="f-items" tabIndex={-1} style={{ display: 'grid', gap: 10 }}>
            <div className="small muted" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 36px', gap: 8 }}>
              <span>รายการ</span>
              <span>รถสันดาป</span>
              <span>EV</span>
              <span />
            </div>
            {draft.items.map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 36px', gap: 8, alignItems: 'start' }}>
                {cell(i, 'label', 'ชื่อรายการ')}
                {cell(i, 'iceCost', 'ต้นทุนรถสันดาป')}
                {cell(i, 'evCost', 'ต้นทุน EV')}
                <button type="button" className="icon-btn" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => update({ ...draft, items: draft.items.filter((__, j) => j !== i) })} disabled={draft.items.length <= 1}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 36px', gap: 8 }} className="small">
              <strong>รวม TCO</strong>
              <strong>฿{fmt(total('iceCost'))}</strong>
              <strong>฿{fmt(total('evCost'))}</strong>
              <span />
            </div>
          </div>
          {errors.items && (
            <span className="field-error" role="alert">
              {errors.items}
            </span>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => update({ ...draft, items: [...draft.items, { label: '', iceCost: '0', evCost: '0' }] })}
            disabled={draft.items.length >= MAX_ITEMS}
          >
            <Icon name="plus" size={15} />
            เพิ่มรายการ
          </button>
          <span className="hint" style={{ display: 'block', marginTop: 8 }}>
            ตัวอย่างรายการ: ราคารถ · พลังงาน 5 ปี · บำรุงรักษา 5 ปี · ภาษี/ประกัน 5 ปี (สูงสุด {MAX_ITEMS} รายการ)
          </span>
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
