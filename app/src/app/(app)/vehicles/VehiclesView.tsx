'use client'

import { useMemo, useState } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { fmt } from '@/lib/format'
import { STATUS } from '@/lib/status'
import { Icon } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { Chips } from '@/components/ui/Chips'
import { SearchInput } from '@/components/ui/SearchInput'
import { SocBar } from '@/components/ui/SocBar'
import { AddVehicleModal } from '@/components/modals/AddVehicleModal'
import { useToast } from '@/components/ui/Toast'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Driver, Vehicle, VehicleStatus } from '@/types'

type Filter = 'all' | VehicleStatus
type Sort = 'id' | 'soc-asc' | 'soc-desc' | 'range-desc'

const SORTERS: Record<Sort, (a: Vehicle, b: Vehicle) => number> = {
  id: (a, b) => a.id.localeCompare(b.id),
  'soc-asc': (a, b) => a.soc - b.soc,
  'soc-desc': (a, b) => b.soc - a.soc,
  'range-desc': (a, b) => b.range - a.range,
}

const brandOf = (model: string) => model.split(' ')[0].replace(/\d+$/, '')

async function load() {
  const [vehicles, drivers] = await Promise.all([api.listVehicles(), api.listDrivers()])
  return { vehicles, drivers }
}

function exportCsv(list: Vehicle[], driverName: (id: string) => string) {
  const head = 'id,model,plate,driver,soc,soh,range,odo,location,status'
  const rows = list.map((v) =>
    [v.id, v.model, v.plate, driverName(v.driverId), v.soc, v.soh, v.range, v.odometer, v.location, v.status].join(','),
  )
  const blob = new Blob(['﻿' + [head, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'ev-vehicles.csv' })
  a.click()
  URL.revokeObjectURL(a.href)
}

export function VehiclesView() {
  const { data, error, reload } = useAsync(load)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState(useSearchParams()?.get('q') ?? '')
  const [sort, setSort] = useState<Sort>('id')

  const vehicles = data?.vehicles
  const drivers = useMemo<Driver[]>(() => data?.drivers ?? [], [data])
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '-'

  const list = useMemo(() => {
    if (!vehicles) return []
    const term = q.trim().toLowerCase()
    return vehicles
      .filter(
        (v) =>
          (filter === 'all' || v.status === filter) &&
          (!term || [v.id, v.model, v.plate, drivers.find((d) => d.id === v.driverId)?.name, v.location].join(' ').toLowerCase().includes(term)),
      )
      .sort(SORTERS[sort])
  }, [vehicles, drivers, filter, q, sort])

  if (!vehicles) return <PageLoading error={error} />

  const avgSoh = (vehicles.reduce((s, v) => s + v.soh, 0) / vehicles.length).toFixed(1)
  const brands = new Set(vehicles.map((v) => brandOf(v.model))).size
  const models = new Set(vehicles.map((v) => v.model)).size
  const chipOptions: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: vehicles.length },
    ...(Object.keys(STATUS) as VehicleStatus[]).map((k) => ({
      key: k,
      label: STATUS[k].th,
      count: vehicles.filter((v) => v.status === k).length,
    })),
  ]

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m kpi-stack-m">
        <KpiCard label="รถไฟฟ้าทั้งหมด" value={vehicles.length} unit="คัน" note={`${brands} ยี่ห้อ ${models} รุ่น`} icon="car" tone="navy" />
        <KpiCard label="ระยะวิ่งคงเหลือรวม" value={fmt(vehicles.reduce((s, v) => s + v.range, 0))} unit="กม." note="จากแบตปัจจุบัน" icon="route" tone="blue" />
        <KpiCard label="สุขภาพแบตเฉลี่ย (SoH)" value={avgSoh} unit="%" note="อยู่ในเกณฑ์ดี" icon="shield" tone="green" />
        <KpiCard label="เลขไมล์สะสม" value={fmt(vehicles.reduce((s, v) => s + v.odometer, 0))} unit="กม." note="ทั้งกองยาน" icon="speed" tone="amber" />
      </section>

      <section className="card flush">
        <div style={{ padding: '18px 22px 0' }}>
          <div className="toolbar">
            <Chips options={chipOptions} value={filter} onChange={setFilter} />
            <div className="flex wrap">
              <SearchInput value={q} onChange={setQ} placeholder="ค้นหา รหัสรถ รุ่น ทะเบียน คนขับ" />
              <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="id">เรียงตามรหัสรถ</option>
                <option value="soc-asc">แบตน้อย → มาก</option>
                <option value="soc-desc">แบตมาก → น้อย</option>
                <option value="range-desc">ระยะวิ่งมากสุด</option>
              </select>
              <button className="btn btn-outline" onClick={() => exportCsv(list, driverName)}>
                <Icon name="download" size={16} />
                ส่งออก
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} />
                เพิ่มรถ
              </button>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>รถ</th>
                <th>ทะเบียน</th>
                <th>คนขับ</th>
                <th>แบตเตอรี่</th>
                <th className="r">SoH</th>
                <th className="r">ระยะวิ่งคงเหลือ</th>
                <th className="r">เลขไมล์</th>
                <th>ตำแหน่งล่าสุด</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link className="veh" href={`/vehicles/${v.id}`}>
                      <span className="veh-ico">
                        <Icon name={v.status === 'charging' ? 'bolt' : 'car'} />
                      </span>
                      <span>
                        <strong>{v.id}</strong>
                        <small>{v.model}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="tag">{v.plate}</span>
                  </td>
                  <td>{driverName(v.driverId)}</td>
                  <td>
                    <SocBar value={v.soc} />
                  </td>
                  <td className="r">{v.soh}%</td>
                  <td className="r">{v.range} กม.</td>
                  <td className="r">{fmt(v.odometer)}</td>
                  <td>{v.location}</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>
                    <Link className="btn btn-ghost btn-sm" href={`/vehicles/${v.id}`}>
                      ดู
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <div className="empty">ไม่พบรถที่ตรงกับเงื่อนไข</div>}
        <div className="flex between" style={{ padding: '14px 22px', borderTop: '1px solid var(--line-2)' }}>
          <span className="small muted">
            แสดง {list.length} จาก {vehicles.length} คัน
          </span>
          <div className="flex">
            <button className="btn btn-outline btn-sm" disabled>
              ก่อนหน้า
            </button>
            <button className="btn btn-outline btn-sm" disabled>
              ถัดไป
            </button>
          </div>
        </div>
      </section>

      {adding && (
        <AddVehicleModal
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setAdding(false)}
          onDone={(v) => {
            setAdding(false)
            reload()
            toast(`เพิ่มรถ ${v.id} (${v.model}) แล้ว`)
          }}
        />
      )}
    </>
  )
}
