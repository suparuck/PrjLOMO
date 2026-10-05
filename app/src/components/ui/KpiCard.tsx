import type { ReactNode } from 'react'
import { Card } from './Card'
import { Icon, type IconName } from './Icon'

export type KpiTone = 'navy' | 'blue' | 'green' | 'red' | 'amber'

export function KpiCard({
  label,
  value,
  unit,
  note,
  noteClass = '',
  icon,
  tone,
}: {
  label: string
  value: number | string
  unit: string
  note: ReactNode
  /** เช่น 'up' (เขียว) หรือ 'down' (แดง) */
  noteClass?: string
  icon: IconName
  tone: KpiTone
}) {
  return (
    <Card className="kpi">
      <div className={`kpi-ico t-${tone}`}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">
          {value}
          <small>{unit}</small>
        </div>
        {note !== '' && <div className={`kpi-note ${noteClass}`.trim()}>{note}</div>}
      </div>
    </Card>
  )
}
