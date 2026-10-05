import { STATUS } from '@/lib/status'
import type { VehicleStatus } from '@/types'

export function StatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <span className={`badge ${STATUS[status].cls}`}>
      <i />
      {STATUS[status].th}
    </span>
  )
}
