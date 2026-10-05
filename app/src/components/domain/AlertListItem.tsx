import { Icon, type IconName } from '../ui/Icon'
import type { Alert, AlertSeverity, AlertType } from '@/types'

const SEV: Record<AlertSeverity, [string, IconName]> = {
  critical: ['t-red', 'alert'],
  warning: ['t-amber', 'alert'],
  info: ['t-blue', 'info'],
}
const TYPE_ICON: Partial<Record<AlertType, IconName>> = {
  charging: 'bolt',
  device: 'wifiOff',
  maint: 'wrench',
  driving: 'speed',
  geofence: 'pin',
}

export function AlertListItem({ alert }: { alert: Alert }) {
  const [tone, fallback] = SEV[alert.severity]
  return (
    <div className="li">
      <div className={`li-ico ${tone}`}>
        <Icon name={TYPE_ICON[alert.type] ?? fallback} size={18} />
      </div>
      <div className="li-body">
        <strong>{alert.title}</strong>
        <p>{alert.text}</p>
      </div>
      <span className="li-time">{alert.time.replace('ที่แล้ว', '')}</span>
    </div>
  )
}
