import { Card } from './Card'
import { Icon, type IconName } from './Icon'

export type KpiTone = 'navy' | 'blue' | 'green' | 'red' | 'amber'

export function KpiCard({
  label,
  value,
  unit,
  note,
  icon,
  tone,
}: {
  label: string
  value: number | string
  unit: string
  note: string
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
        <div className="kpi-note">{note}</div>
      </div>
    </Card>
  )
}
