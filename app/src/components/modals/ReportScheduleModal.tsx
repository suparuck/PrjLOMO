'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField, focusFirstError } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { useAsync } from '@/hooks/useAsync'
import { PERIOD_LABEL, brandLabel } from '@/lib/exportReport'
import { formatDayTime } from '@/lib/time'
import type { ReportSchedule, ScheduleDraft } from '@/types'

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const ORDER = ['recipients', 'weekday', 'monthDay', 'hour']
const hh = (h: number) => `${String(h).padStart(2, '0')}:00 น.`

const EMPTY: ScheduleDraft = { frequency: 'weekly', weekday: '1', monthDay: '1', hour: '8', recipients: '', period: 'year', brand: 'all', enabled: true }

const toDraft = (s: ReportSchedule): ScheduleDraft => ({
  frequency: s.frequency,
  weekday: String(s.weekday ?? 1),
  monthDay: String(s.monthDay ?? 1),
  hour: String(s.hour),
  recipients: s.recipients.join('\n'),
  period: s.period,
  brand: s.brand,
  enabled: s.enabled,
})

function when(s: ReportSchedule) {
  if (s.frequency === 'daily') return `ทุกวัน ${hh(s.hour)}`
  if (s.frequency === 'weekly') return `ทุกวัน${WEEKDAYS[s.weekday ?? 0]} ${hh(s.hour)}`
  return `ทุกวันที่ ${s.monthDay} ของเดือน ${hh(s.hour)}`
}

/** จัดการตารางเวลาส่งรายงานทางอีเมล: รายการ → เพิ่ม/แก้ → เปิดปิด ส่งทดสอบ ลบ */
export function ReportScheduleModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { data, error, reload } = useAsync(() => api.listReportSchedules())
  const [editing, setEditing] = useState<{ id: string | null; draft: ScheduleDraft } | null>(null)
  const [deleting, setDeleting] = useState<ReportSchedule | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (deleting) {
    return (
      <ConfirmDialog
        title="ลบตารางเวลานี้?"
        confirmLabel="ลบ"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const res = await api.deleteReportSchedule(deleting.id)
          if (!res.ok) return Object.values(res.errors)[0] ?? 'ลบไม่สำเร็จ'
          toast('ลบตารางเวลาแล้ว')
          setDeleting(null)
          reload()
          return null
        }}
      >
        <p>
          จะไม่ส่งรายงาน {when(deleting)} ไปที่ {deleting.recipients.join(', ')} อีก
        </p>
      </ConfirmDialog>
    )
  }

  if (editing) {
    return (
      <ScheduleForm
        id={editing.id}
        initial={editing.draft}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload()
          toast(editing.id ? 'บันทึกตารางเวลาแล้ว' : 'เพิ่มตารางเวลาแล้ว')
        }}
      />
    )
  }

  async function toggle(s: ReportSchedule, enabled: boolean) {
    setBusyId(s.id)
    const res = await api.saveReportSchedule(s.id, { ...toDraft(s), enabled })
    setBusyId(null)
    if (!res.ok) return toast(Object.values(res.errors)[0] ?? 'บันทึกไม่สำเร็จ', 'error')
    reload()
  }

  async function sendNow(s: ReportSchedule) {
    setBusyId(s.id)
    const res = await api.sendReportNow(s.id)
    setBusyId(null)
    toast(res.ok ? `ส่งรายงานทดสอบไปที่ ${s.recipients.join(', ')} แล้ว` : (Object.values(res.errors)[0] ?? 'ส่งไม่สำเร็จ'), res.ok ? 'success' : 'error')
    reload()
  }

  return (
    <Modal
      title="ตั้งเวลาส่งรายงาน"
      description="ส่งสรุปรายงานกองยานทางอีเมลตามเวลาที่กำหนด (เวลาประเทศไทย)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: null, draft: EMPTY })} disabled={!data}>
            เพิ่มตารางเวลา
          </button>
        </>
      }
    >
      {!data ? (
        <p className="small muted" role="status">
          {error ? 'โหลดตารางเวลาไม่สำเร็จ' : 'กำลังโหลด…'}
        </p>
      ) : (
        <>
          {!data.mailEnabled && (
            <p className="banner small" role="alert">
              ระบบยังไม่ได้ตั้งค่าอีเมล (SMTP_URL) จึงยังส่งรายงานจริงไม่ได้ — บันทึกตารางเวลาไว้ได้ และจะส่งเมื่อผู้ดูแลตั้งค่าอีเมลแล้ว
            </p>
          )}
          {data.items.length === 0 ? (
            <p className="empty">ยังไม่มีตารางเวลา — กด &quot;เพิ่มตารางเวลา&quot; เพื่อเริ่ม</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {data.items.map((s) => (
                <li key={s.id} className="card" style={{ padding: 14, boxShadow: 'none' }}>
                  <div className="flex between wrap" style={{ gap: 8 }}>
                    <strong>{when(s)}</strong>
                    <Switch checked={s.enabled} onChange={(v) => toggle(s, v)} label={`เปิดใช้งานตารางเวลา ${when(s)}`} />
                  </div>
                  <p className="small muted" style={{ margin: '6px 0' }}>
                    {PERIOD_LABEL[s.period]} · {brandLabel(s.brand)}
                    <br />
                    ถึง {s.recipients.join(', ')}
                  </p>
                  <p className="small" style={{ margin: '0 0 10px' }}>
                    {s.enabled ? `ส่งครั้งถัดไป ${formatDayTime(s.nextRunAt)}` : 'ปิดอยู่ — ไม่ส่ง'}
                    {s.lastStatus && (
                      <span style={{ color: s.lastStatus === 'sent' ? 'var(--green)' : 'var(--danger)' }}>
                        {' · '}
                        {s.lastStatus === 'sent' ? 'ส่งล่าสุดสำเร็จ' : `ส่งล่าสุดไม่สำเร็จ: ${s.lastError ?? ''}`}
                        {s.lastRunAt ? ` (${formatDayTime(s.lastRunAt)})` : ''}
                      </span>
                    )}
                  </p>
                  <div className="flex wrap">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => sendNow(s)} disabled={busyId === s.id}>
                      {busyId === s.id ? 'กำลังส่ง…' : 'ส่งทดสอบตอนนี้'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: s.id, draft: toDraft(s) })}>
                      แก้ไข
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(s)}>
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}

function ScheduleForm({ id, initial, onClose, onSaved }: { id: string | null; initial: ScheduleDraft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof ScheduleDraft>(k: K, v: ScheduleDraft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await api.saveReportSchedule(id, d)
    setBusy(false)
    if (!res.ok) {
      setErrors(res.errors)
      return focusFirstError(ORDER, res.errors)
    }
    onSaved()
  }

  return (
    <Modal
      title={id ? 'แก้ไขตารางเวลา' : 'เพิ่มตารางเวลาส่งรายงาน'}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" form="schedule-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} noValidate>
        <FormField
          name="frequency"
          label="ความถี่"
          render={(p) => (
            <select {...p} className="select" value={d.frequency} onChange={(e) => set('frequency', e.target.value as ScheduleDraft['frequency'])}>
              <option value="daily">ทุกวัน</option>
              <option value="weekly">ทุกสัปดาห์</option>
              <option value="monthly">ทุกเดือน</option>
            </select>
          )}
        />
        {d.frequency === 'weekly' && (
          <FormField
            name="weekday"
            label="วัน"
            error={errors.weekday}
            render={(p) => (
              <select {...p} className="select" value={d.weekday} onChange={(e) => set('weekday', e.target.value)}>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    วัน{w}
                  </option>
                ))}
              </select>
            )}
          />
        )}
        {d.frequency === 'monthly' && (
          <FormField
            name="monthDay"
            label="วันที่ของเดือน"
            error={errors.monthDay}
            hint="เลือกได้ 1–28 เพื่อให้ทุกเดือนมีวันนั้น"
            render={(p) => (
              <select {...p} className="select" value={d.monthDay} onChange={(e) => set('monthDay', e.target.value)}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    วันที่ {n}
                  </option>
                ))}
              </select>
            )}
          />
        )}
        <FormField
          name="hour"
          label="เวลาส่ง (เวลาไทย)"
          error={errors.hour}
          render={(p) => (
            <select {...p} className="select" value={d.hour} onChange={(e) => set('hour', e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          )}
        />
        <FormField
          name="recipients"
          label="อีเมลผู้รับ"
          required
          error={errors.recipients}
          hint="คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ สูงสุด 10 ราย"
          render={(p) => <textarea {...p} className="input" rows={3} value={d.recipients} onChange={(e) => set('recipients', e.target.value)} data-autofocus />}
        />
        <FormField
          name="period"
          label="ช่วงเวลาของรายงาน"
          render={(p) => (
            <select {...p} className="select" value={d.period} onChange={(e) => set('period', e.target.value as ScheduleDraft['period'])}>
              {Object.entries(PERIOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        />
        <FormField
          name="brand"
          label="รถที่นับ"
          render={(p) => (
            <select {...p} className="select" value={d.brand} onChange={(e) => set('brand', e.target.value as ScheduleDraft['brand'])}>
              <option value="all">รถทุกคัน</option>
              <option value="BYD">เฉพาะ BYD</option>
              <option value="MG">เฉพาะ MG</option>
            </select>
          )}
        />
        {errors._ && (
          <p className="field-error" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  )
}
