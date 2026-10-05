'use client'

import { useMemo, useState } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Chips } from '@/components/ui/Chips'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { SocBar } from '@/components/ui/SocBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { LiveMapClient } from '@/components/map/FleetMapClient'
import type { MapLayers } from '@/components/map/LiveMap'
import type { VehicleStatus } from '@/types'

type Filter = 'all' | VehicleStatus

const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'driving', label: 'ขับ' },
  { key: 'charging', label: 'ชาร์จ' },
  { key: 'parked', label: 'จอด' },
  { key: 'low', label: 'แบตต่ำ' },
  { key: 'offline', label: 'ออฟไลน์' },
]

const LAYER_LABELS: [keyof MapLayers, string][] = [
  ['vehicles', 'รถยนต์ไฟฟ้า'],
  ['depot', 'สถานีชาร์จ Depot'],
  ['public', 'สถานีชาร์จสาธารณะ'],
  ['range', 'รัศมีระยะวิ่งคงเหลือ'],
]

async function load() {
  const [org, vehicles, drivers, stations] = await Promise.all([api.getOrg(), api.listVehicles(), api.listDrivers(), api.listStations()])
  return { org, vehicles, drivers, stations }
}

export default function MapPage() {
  const { data } = useAsync(load)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [layers, setLayers] = useState<MapLayers>({ vehicles: true, depot: true, public: true, range: false })
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)

  const driverName = (id: string) => data?.drivers.find((d) => d.id === id)?.name ?? ''
  const list = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.vehicles.filter(
      (v) =>
        (filter === 'all' || v.status === filter) &&
        (!term || (v.id + v.model + (data.drivers.find((d) => d.id === v.driverId)?.name ?? '')).toLowerCase().includes(term)),
    )
  }, [data, filter, q])
  const visibleIds = useMemo(() => new Set(list.map((v) => v.id)), [list])

  if (!data) return <div className="content muted">กำลังโหลดข้อมูล…</div>
  const { org, vehicles: V, drivers, stations } = data

  const stats: [string, string | number][] = [
    ['ออนไลน์', `${V.filter((v) => v.status !== 'offline').length}/${V.length}`],
    ['กำลังขับ', V.filter((v) => v.status === 'driving').length],
    ['ช่องชาร์จว่าง', stations.reduce((s, x) => s + x.ports - x.busy, 0)],
  ]

  return (
    <div className="map-page">
      <aside className="map-side">
        <div className="map-side-h">
          <SearchInput value={q} onChange={setQ} placeholder="ค้นหารถหรือคนขับ" minWidth={0} />
          <Chips options={CHIPS} value={filter} onChange={setFilter} />
        </div>
        <div className="map-list">
          {list.length === 0 && <div className="empty">ไม่พบรถ</div>}
          {list.map((v) => (
            <div
              key={v.id}
              className={`map-item${focus?.id === v.id ? ' active' : ''}`}
              onClick={() => setFocus((f) => ({ id: v.id, n: (f?.n ?? 0) + 1 }))}
            >
              <span className="veh-ico">
                <Icon name={v.status === 'charging' ? 'bolt' : 'car'} />
              </span>
              <div className="grow">
                <div className="flex between">
                  <strong>{v.id}</strong>
                  <StatusBadge status={v.status} />
                </div>
                <p>
                  {v.model} · {driverName(v.driverId)}
                </p>
                <div className="flex between small" style={{ marginTop: 4 }}>
                  <SocBar value={v.soc} width={70} />
                  <span className="muted">
                    {v.range} กม. · {v.speed} กม./ชม.
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="map-main">
        <div id="bigmap">
          <LiveMapClient
            allVehicles={V}
            visibleIds={visibleIds}
            stations={stations}
            drivers={drivers}
            center={org.center}
            layers={layers}
            focus={focus}
          />
        </div>
        <div className="map-overlay">
          <strong style={{ color: 'var(--ink)' }}>ชั้นข้อมูล</strong>
          {LAYER_LABELS.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                style={{ accentColor: 'var(--red)' }}
              />{' '}
              {label}
            </label>
          ))}
        </div>
        <div className="map-stats">
          {stats.map(([l, b]) => (
            <div className="map-stat" key={l}>
              {l}
              <b>{b}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
