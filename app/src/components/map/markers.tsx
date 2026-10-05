import L from 'leaflet'
import Link from 'next/link'
import { iconSvg } from '../ui/Icon'
import { StatusBadge } from '../ui/StatusBadge'
import { STATUS } from '@/lib/status'
import type { Driver, Station, Vehicle } from '@/types'

export const vehicleIcon = (v: Vehicle) =>
  L.divIcon({
    html: `<div class="vm ${STATUS[v.status].cls}">${iconSvg(v.status === 'charging' ? 'bolt' : 'car', 14)}</div><div class="vm-label">${v.id}</div>`,
    className: 'vm-wrap',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

export const stationIcon = (s: Station) =>
  L.divIcon({
    html: `<div class="sm ${s.type}">${iconSvg('plug', 13)}</div>`,
    className: 'vm-wrap',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

export function VehiclePopup({ vehicle: v, drivers }: { vehicle: Vehicle; drivers: Driver[] }) {
  return (
    <div className="pop">
      <strong>{v.id}</strong> · {v.model}
      <br />
      <StatusBadge status={v.status} />
      <dl>
        <dt>แบตเตอรี่</dt>
        <dd>{v.soc}%</dd>
        <dt>ระยะวิ่งคงเหลือ</dt>
        <dd>{v.range} กม.</dd>
        <dt>ความเร็ว</dt>
        <dd>{v.speed} กม./ชม.</dd>
        <dt>คนขับ</dt>
        <dd>{drivers.find((d) => d.id === v.driverId)?.name}</dd>
      </dl>
      <Link href={`/vehicles/${v.id}`}>ดูรายละเอียด →</Link>
    </div>
  )
}

export function StationPopup({ station: s, detailed = false }: { station: Station; detailed?: boolean }) {
  if (!detailed) {
    return (
      <div className="pop">
        <strong>{s.name}</strong>
        <br />
        {s.network} · {s.power}
        <br />
        ว่าง {s.ports - s.busy}/{s.ports} ช่อง
      </div>
    )
  }
  return (
    <div className="pop">
      <strong>{s.name}</strong>
      <br />
      <span className="tag">{s.network}</span>
      <dl>
        <dt>กำลังไฟ</dt>
        <dd>{s.power}</dd>
        <dt>ช่องว่าง</dt>
        <dd>
          {s.ports - s.busy}/{s.ports}
        </dd>
        <dt>ราคา</dt>
        <dd>฿{s.pricePerKwh}/kWh</dd>
      </dl>
    </div>
  )
}
