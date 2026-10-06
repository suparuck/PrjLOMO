'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import type { AssumptionLimits, AssumptionValues } from '@/types'

interface FieldDef {
  key: keyof AssumptionLimits
  label: string
  unit: string
  /** ใช้ที่ไหนในระบบ — บอกผู้ใช้ว่าค่านี้กระทบอะไร */
  help: string
}
interface Group {
  title: string
  note?: string
  fields: FieldDef[]
}

const GROUPS: Group[] = [
  {
    title: 'คาร์บอน',
    fields: [
      { key: 'gridKgPerKwh', label: 'ค่าการปล่อย CO₂ ของไฟฟ้า', unit: 'kgCO₂/kWh', help: 'การปล่อยจากไฟฟ้า (Scope 2) และ CO₂ ที่ลดได้ — ค่ากริดไทยโดยประมาณ 0.4–0.5' },
      { key: 'treeKgPerYear', label: 'CO₂ ที่ต้นไม้ 1 ต้นดูดซับต่อปี', unit: 'kg', help: 'ใช้แปลง CO₂ ที่ลดได้เป็นจำนวนต้นไม้เทียบเท่า' },
      { key: 'co2GPerKm.sedan', label: 'รถเก๋งน้ำมัน', unit: 'gCO₂/กม.', help: 'กราฟการปล่อยต่อกิโลเมตร' },
      { key: 'co2GPerKm.diesel', label: 'กระบะดีเซล', unit: 'gCO₂/กม.', help: 'กราฟการปล่อยต่อกิโลเมตร' },
      { key: 'co2GPerKm.hybrid', label: 'ไฮบริด', unit: 'gCO₂/กม.', help: 'กราฟการปล่อยต่อกิโลเมตร' },
      { key: 'co2GPerKm.evSolar', label: 'EV ที่ชาร์จจากโซลาร์ Depot', unit: 'gCO₂/กม.', help: 'กราฟการปล่อยต่อกิโลเมตร' },
    ],
  },
  {
    title: 'ต้นทุนและค่าไฟ',
    fields: [
      { key: 'oilCostPerKm', label: 'ต้นทุนน้ำมันเทียบเท่าต่อกิโลเมตร', unit: 'บาท/กม.', help: 'เปรียบเทียบต้นทุนต่อกม. และคำนวณเงินที่ประหยัดจากเชื้อเพลิง' },
      { key: 'evEstimate.workingDays', label: 'วันทำงานต่อเดือน', unit: 'วัน', help: 'ประมาณค่าไฟ EV ต่อเดือนของรถสันดาปที่ประเมินการเปลี่ยน' },
      { key: 'evEstimate.kwhPerKm', label: 'พลังงาน EV ต่อกิโลเมตร', unit: 'kWh/กม.', help: 'ประมาณค่าไฟ EV ต่อเดือน (เช่น 0.15 = 15 kWh/100 กม.)' },
      { key: 'evEstimate.pricePerKwh', label: 'ราคาไฟเฉลี่ย', unit: 'บาท/kWh', help: 'ประมาณค่าไฟ EV ต่อเดือน' },
    ],
  },
  {
    title: 'รถและแบตเตอรี่',
    fields: [
      { key: 'defaultEfficiency', label: 'ประสิทธิภาพตั้งต้นของรถใหม่', unit: 'kWh/100 กม.', help: 'ค่าเริ่มต้นเมื่อเพิ่มรถ และใช้ประมาณระยะวิ่งคงเหลือ' },
      { key: 'actualRangeRatio', label: 'สัดส่วนระยะวิ่งจริงเทียบสเปก', unit: 'เท่า', help: 'หน้าแบตเตอรี่: ระยะวิ่งจริงต่อรุ่น = ระยะตามสเปก × ค่านี้' },
    ],
  },
  {
    title: 'ตัวเลขเปรียบเทียบ (กรอกเอง)',
    note: 'ระบบยังไม่มีข้อมูลย้อนหลังพอจะคำนวณเอง จึงแสดงตามที่กรอก — ปล่อยเป็น 0 ถ้ายังไม่ทราบ',
    fields: [
      { key: 'kwhChangePct', label: 'พลังงานรวมเทียบปีก่อน', unit: '%', help: 'แสดงเป็น "เทียบช่วงก่อน" ที่การ์ดพลังงานในรายงาน (ติดลบ = ลดลง)' },
      { key: 'efficiencyChangePct', label: 'ประสิทธิภาพดีขึ้นเทียบช่วงก่อน', unit: '%', help: 'แสดงในการ์ดประสิทธิภาพของแดชบอร์ด' },
    ],
  },
]

const ALL = GROUPS.flatMap((g) => g.fields)
const ORDER = ALL.map((f) => f.key)

const getPath = (v: AssumptionValues, key: string): number => {
  const [a, b] = key.split('.')
  const x = (v as unknown as Record<string, unknown>)[a]
  return Number(b ? (x as Record<string, unknown>)[b] : x)
}
const toDraft = (v: AssumptionValues): Record<string, string> => Object.fromEntries(ALL.map((f) => [f.key, String(getPath(v, f.key))]))
const fromDraft = (d: Record<string, string>): AssumptionValues => {
  const n = (k: string) => Number(d[k])
  return {
    gridKgPerKwh: n('gridKgPerKwh'),
    treeKgPerYear: n('treeKgPerYear'),
    oilCostPerKm: n('oilCostPerKm'),
    kwhChangePct: n('kwhChangePct'),
    efficiencyChangePct: n('efficiencyChangePct'),
    actualRangeRatio: n('actualRangeRatio'),
    defaultEfficiency: n('defaultEfficiency'),
    co2GPerKm: { sedan: n('co2GPerKm.sedan'), diesel: n('co2GPerKm.diesel'), hybrid: n('co2GPerKm.hybrid'), evSolar: n('co2GPerKm.evSolar') },
    evEstimate: { workingDays: n('evEstimate.workingDays'), kwhPerKm: n('evEstimate.kwhPerKm'), pricePerKwh: n('evEstimate.pricePerKwh') },
  }
}

/** ตรวจตามช่วงและทศนิยมที่ API ส่งมา (limits) — กฎเดียวกับที่ API ใช้ตรวจจริง */
function validate(d: Record<string, string>, limits: AssumptionLimits): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of ALL) {
    const l = limits[f.key]
    const raw = (d[f.key] ?? '').trim().replace(/,/g, '')
    const n = Number(raw)
    if (!raw || Number.isNaN(n)) errors[f.key] = 'กรุณากรอกตัวเลข'
    else if (n < l.min || n > l.max) errors[f.key] = `ต้องอยู่ระหว่าง ${l.min} ถึง ${l.max}`
    else if (Math.round(n * 10 ** l.dp) / 10 ** l.dp !== n) errors[f.key] = l.dp === 0 ? 'ต้องเป็นจำนวนเต็ม' : `ทศนิยมไม่เกิน ${l.dp} ตำแหน่ง`
  }
  return errors
}

/** แก้สมมติฐานของรายงาน (ค่าที่ใช้คำนวณ CO₂ ต้นทุน ค่าไฟ EV) — มีผลกับรายงาน แดชบอร์ด Excel และอีเมลรายงานตามเวลาทันที */
export function AssumptionsModal({
  initial,
  onClose,
  onDone,
}: {
  initial: { values: AssumptionValues; defaults: AssumptionValues; limits: AssumptionLimits }
  onClose: () => void
  onDone: () => void
}) {
  const { limits, defaults } = initial
  const [draft, setDraft] = useState(() => toDraft(initial.values))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = (next: Record<string, string>) => {
    setDraft(next)
    if (submitted) setErrors(validate(next, limits))
  }
  const dd = toDraft(defaults)
  const changedFromDefault = ALL.filter((f) => Number(draft[f.key]) !== Number(dd[f.key])).length

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const local = validate(draft, limits)
    if (Object.keys(local).length) {
      setErrors(local)
      return focusFirstError(ORDER, local)
    }
    setBusy(true)
    const res = await api.saveReportConfig(fromDraft(draft))
    setBusy(false)
    if (res.ok) return onDone()
    setErrors(res.errors)
    focusFirstError(ORDER, res.errors)
  }

  return (
    <Modal
      title="สมมติฐานของรายงาน"
      description="ค่าปัจจัยที่ใช้คำนวณคาร์บอน ต้นทุน และค่าไฟ EV — มีผลกับทุกรายงานทันที (รวมไฟล์ Excel และอีเมลรายงานตามเวลา)"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => update(toDraft(defaults))} disabled={busy || changedFromDefault === 0}>
            คืนค่ามาตรฐาน
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="assumptions-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="assumptions-form" onSubmit={submit} noValidate>
        {GROUPS.map((g) => (
          <fieldset key={g.title} style={{ border: 0, padding: 0, margin: '0 0 18px' }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>{g.title}</legend>
            {g.note && <p className="small muted" style={{ margin: '0 0 8px' }}>{g.note}</p>}
            {g.fields.map((f, i) => {
              const l = limits[f.key]
              const def = dd[f.key]
              const isDef = Number(draft[f.key]) === Number(def)
              return (
                <FormField
                  key={f.key}
                  name={f.key}
                  label={`${f.label} (${f.unit})`}
                  required
                  error={errors[f.key]}
                  hint={`${f.help} · ช่วง ${l.min}–${l.max}${isDef ? '' : ` · ค่ามาตรฐาน ${def}`}`}
                  render={(p) => (
                    <input
                      {...p}
                      className="input"
                      inputMode="decimal"
                      autoComplete="off"
                      value={draft[f.key]}
                      onChange={(e) => update({ ...draft, [f.key]: e.target.value })}
                      data-autofocus={g === GROUPS[0] && i === 0 ? true : undefined}
                    />
                  )}
                />
              )
            })}
          </fieldset>
        ))}
        {errors._ && (
          <p className="field-error" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
