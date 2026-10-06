'use client'

import { useState } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { useAlerts } from '@/components/layout/AlertsProvider'
import { useToast } from '@/components/ui/Toast'
import { Card, CardHeader } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { Icon, type IconName } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { Switch } from '@/components/ui/Switch'
import type { AlertRule, AlertSeverity, AlertType } from '@/types'

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

export default function AlertsPage() {
  const { alerts: A, error, acknowledge, acknowledgeAll } = useAlerts()
  const { data: stats } = useAsync(() => api.getAlertStats(), [], { live: true })
  const [sev, setSev] = useState<SevFilter>('all')
  const [type, setType] = useState<'all' | AlertType>('all')
  const toast = useToast()
  const { data: rules, setData: setRules } = useAsync(() => api.listAlertRules())
  const { data: channels } = useAsync(() => api.listNotificationChannels())

  // เปิด/ปิดกฎ: อัปเดตหน้าจอทันที แล้วบันทึกลงฐานข้อมูล ถ้าบันทึกไม่ได้ให้ย้อนกลับ
  async function toggleRule(r: AlertRule, enabled: boolean) {
    const apply = (v: boolean) => setRules((list) => (list ?? []).map((x) => (x.key === r.key ? { ...x, enabled: v } : x)))
    apply(enabled)
    const res = await api.setAlertRule(r.key, enabled)
    if (!res.ok) {
      apply(!enabled)
      toast(Object.values(res.errors)[0] ?? 'บันทึกกฎไม่สำเร็จ', 'error')
    }
  }

  if (!A) return <PageLoading error={error} />

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
            {(rules ?? []).map((r) => (
              <div className="set-row" key={r.key}>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.text}</p>
                </div>
                <Switch label={r.title} checked={r.enabled} onChange={(v) => void toggleRule(r, v)} />
              </div>
            ))}
          </Card>
          <Card>
            <CardHeader title="ช่องทางแจ้งเตือน" />
            <div className="list">
              {(channels ?? []).map((c) => (
                <div className="li" key={c.key}>
                  <div className={`li-ico t-${c.tone}`}>
                    <Icon name={c.icon} />
                  </div>
                  <div className="li-body">
                    <strong>{c.name}</strong>
                    <p>{c.detail}</p>
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
