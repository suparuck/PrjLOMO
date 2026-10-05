'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { useAlerts } from '@/components/layout/AlertsProvider'
import { Card, CardHeader } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { Icon, type IconName } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { Switch } from '@/components/ui/Switch'
import type { AlertSeverity, AlertType } from '@/types'

type SevFilter = 'all' | AlertSeverity

const SEV_TONE: Record<AlertSeverity, string> = { critical: 't-red', warning: 't-amber', info: 't-blue' }
const SEV_TH: Record<AlertSeverity, string> = { critical: 'วิกฤต', warning: 'เตือน', info: 'ข้อมูล' }
const TYPE_ICON: Record<AlertType, IconName> = {
  battery: 'battery',
  charging: 'bolt',
  device: 'wifiOff',
  maint: 'wrench',
  driving: 'speed',
  geofence: 'pin',
}
const TYPE_TH: Record<AlertType, string> = {
  battery: 'แบตเตอรี่',
  charging: 'การชาร์จ',
  device: 'อุปกรณ์',
  maint: 'บำรุงรักษา',
  driving: 'การขับขี่',
  geofence: 'พื้นที่',
}

const RULES = [
  { id: 'low', title: 'แบตต่ำกว่า 30%', text: 'แจ้งผู้จัดการและคนขับ', on: true },
  { id: 'offline', title: 'รถออฟไลน์เกิน 30 นาที', text: 'แจ้งผู้ดูแลระบบ', on: true },
  { id: 'speed', title: 'ความเร็วเกิน 100 กม./ชม.', text: 'บันทึกเป็นเหตุการณ์การขับ', on: true },
  { id: 'charge', title: 'ชาร์จเสร็จ / หยุดชาร์จผิดปกติ', text: 'แจ้งคนขับผ่านแอป', on: true },
  { id: 'geo', title: 'ออกนอกพื้นที่ (Geofence)', text: 'เขตเมืองเชียงใหม่', on: false },
]

export default function AlertsPage() {
  const { alerts: A, acknowledge, acknowledgeAll } = useAlerts()
  const { data: stats } = useAsync(() => api.getAlertStats())
  const [sev, setSev] = useState<SevFilter>('all')
  const [type, setType] = useState<'all' | AlertType>('all')
  const [rules, setRules] = useState(() => Object.fromEntries(RULES.map((r) => [r.id, r.on])))

  if (!A) return <div className="muted">กำลังโหลดข้อมูล…</div>

  const open = A.filter((a) => !a.acknowledged)
  const list = A.filter((a) => (sev === 'all' || a.severity === sev) && (type === 'all' || a.type === type))
  const chipOptions: { key: SevFilter; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: A.length },
    ...(['critical', 'warning', 'info'] as const).map((k) => ({ key: k, label: SEV_TH[k], count: A.filter((a) => a.severity === k).length })),
  ]

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="ยังไม่รับทราบ" value={open.length} unit="รายการ" note="" icon="bell" tone="navy" />
        <KpiCard label="วิกฤต" value={open.filter((a) => a.severity === 'critical').length} unit="รายการ" note="" icon="alert" tone="red" />
        <KpiCard label="เตือน" value={open.filter((a) => a.severity === 'warning').length} unit="รายการ" note="" icon="alert" tone="amber" />
        <KpiCard label="เวลาตอบสนองเฉลี่ย" value={stats?.avgResponseMinutes ?? '–'} unit="นาที" note="" icon="clock" tone="green" />
      </section>

      <section className="grid g-21">
        <div className="card flush">
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)' }} className="toolbar">
            <Chips options={chipOptions} value={sev} onChange={setSev} />
            <div className="flex wrap">
              <select className="select" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as 'all' | AlertType)}>
                <option value="all">ทุกประเภท</option>
                {(Object.keys(TYPE_TH) as AlertType[]).map((k) => (
                  <option key={k} value={k}>
                    {TYPE_TH[k]}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline" onClick={acknowledgeAll} disabled={open.length === 0}>
                <Icon name="check" size={16} />
                รับทราบทั้งหมด
              </button>
            </div>
          </div>
          <div>
            {list.map((a) => (
              <div key={a.id} className={`alert-row${a.acknowledged ? ' acked' : ''}`}>
                <span className={`sev ${a.severity}`} />
                <div className={`li-ico ${SEV_TONE[a.severity]}`}>
                  <Icon name={TYPE_ICON[a.type]} size={18} />
                </div>
                <div className="li-body">
                  <div className="flex wrap" style={{ gap: 8 }}>
                    <strong>{a.title}</strong>
                    <span className="tag">{TYPE_TH[a.type]}</span>
                    {a.acknowledged && <span className="tag">รับทราบแล้ว</span>}
                  </div>
                  <p>{a.text}</p>
                  <div className="flex small" style={{ marginTop: 6, gap: 14 }}>
                    <span className="li-time">{a.time}</span>
                    <Link href={`/vehicles/${a.vehicleId}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                      ดู {a.vehicleId}
                    </Link>
                  </div>
                </div>
                {!a.acknowledged && (
                  <button className="btn btn-outline btn-sm" onClick={() => acknowledge(a.id)}>
                    รับทราบ
                  </button>
                )}
              </div>
            ))}
            {list.length === 0 && <div className="empty">ไม่มีการแจ้งเตือน</div>}
          </div>
        </div>

        <div>
          <Card className="mb">
            <CardHeader title="กฎการแจ้งเตือน" sub="เปิด/ปิดได้ทันที" actions={<LinkButton href="/settings#alerts" variant="ghost">แก้ไข</LinkButton>} />
            {RULES.map((r) => (
              <div className="set-row" key={r.id}>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.text}</p>
                </div>
                <Switch label={r.title} checked={rules[r.id]} onChange={(v) => setRules((s) => ({ ...s, [r.id]: v }))} />
              </div>
            ))}
          </Card>
          <Card>
            <CardHeader title="ช่องทางแจ้งเตือน" />
            <div className="list">
              {(
                [
                  ['t-navy', 'bell', 'ในระบบ', 'เปิดใช้งาน'],
                  ['t-blue', 'globe', 'อีเมล', 'fleet@company.co.th'],
                  ['t-green', 'phone', 'LINE Official Account', 'กลุ่มผู้จัดการกองยาน'],
                ] as const
              ).map(([tone, ico, title, text]) => (
                <div className="li" key={title}>
                  <div className={`li-ico ${tone}`}>
                    <Icon name={ico} />
                  </div>
                  <div className="li-body">
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
