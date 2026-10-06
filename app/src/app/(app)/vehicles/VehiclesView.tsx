'use client'

import { useEffect, useState } from 'react'
import { Pager, pagerOf } from '@/components/ui/Pager'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { useDebounced } from '@/hooks/useDebounced'
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

const PAGE_SIZE = 10
const brandOf = (model: string) => model.split(' ')[0].replace(/\d+$/, '')

/** ส่งออก CSV: ดึงทุกหน้าที่ตรงกับตัวกรอง (ไม่ใช่แค่หน้าที่เห็น) */
async function exportCsv(query: { q: string; status?: VehicleStatus; sort: Sort }, driverName: (id: string) => string) {
  const list: Vehicle[] = []
  for (let page = 1; ; page++) {
    const r = await api.listVehiclesPage({ page, pageSize: 100, ...query })
    list.push(...r.items)
    if (page >= r.pages) break
  }
  const head = 'id,model,plate,driver,soc,soh,range,odo,location,status'
  const rows = list.map((v) => [v.id, v.model, v.plate, driverName(v.driverId), v.soc, v.soh, v.range, v.odometer, v.location, v.status].join(','))
  const blob = new Blob(['﻿' + [head, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'ev-vehicles.csv' })
  a.click()
  URL.revokeObjectURL(a.href)
}

export function VehiclesView() {
  const toast = useToast()
  const [adding, setAdding] = useState<Vehicle[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState(useSearchParams()?.get('q') ?? '')
  const [sort, setSort] = useState<Sort>('id')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q.trim(), 300)
  const status = filter === 'all' ? undefined : filter

  // ตัวกรองเปลี่ยน → กลับหน้าแรก
  useEffect(() => setPage(1), [dq, filter, sort])

  const { data, error, reload } = useAsync(() => api.listVehiclesPage({ page, pageSize: PAGE_SIZE, q: dq, status, sort }), [page, dq, filter, sort], { live: true })
  const { data: drivers } = useAsync(() => api.listDrivers(), [], { live: true })
  const driverName = (id: string) => drivers?.find((d: Driver) => d.id === id)?.name ?? '-'

  // ข้อมูลหดจนหน้าปัจจุบันเกินหน้าสุดท้าย (เช่น รถถูกกรองออกตอนเรียลไทม์) → ถอยมาหน้าสุดท้าย
  useEffect(() => {
    if (data && data.page > data.pages) setPage(data.pages)
  }, [data])

  if (!data) return <PageLoading error={error} />

  const { items: list, summary: s } = data
  const brands = new Set(s.models.map(brandOf)).size
  const chipOptions: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: s.total },
    ...(Object.keys(STATUS) as VehicleStatus[]).map((k) => ({ key: k, label: STATUS[k].th, count: s.byStatus[k] ?? 0 })),
  ]

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m kpi-stack-m">
        <KpiCard label="รถไฟฟ้าทั้งหมด" value={s.total} unit="คัน" note={`${brands} ยี่ห้อ ${s.models.length} รุ่น`} icon="car" tone="navy" />
        <KpiCard label="ระยะวิ่งคงเหลือรวม" value={fmt(s.rangeKm)} unit="กม." note="จากแบตปัจจุบัน" icon="route" tone="blue" />
        <KpiCard label="สุขภาพแบตเฉลี่ย (SoH)" value={s.avgSoh.toFixed(1)} unit="%" note="อยู่ในเกณฑ์ดี" icon="shield" tone="green" />
        <KpiCard label="เลขไมล์สะสม" value={fmt(s.odometerKm)} unit="กม." note="ทั้งกองยาน" icon="speed" tone="amber" />
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
              <button className="btn btn-outline" onClick={() => exportCsv({ q: dq, status, sort }, driverName).catch(() => toast('ส่งออกไม่สำเร็จ', 'error'))}>
                <Icon name="download" size={16} />
                ส่งออก
              </button>
              <button type="button" className="btn btn-primary" onClick={async () => setAdding(await api.listVehicles())}>
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
        {list.length === 0 && (
          <div className="empty">
            {s.total === 0 ? 'ยังไม่มีรถในระบบ — กด "เพิ่มรถ" หรือให้อุปกรณ์ส่งข้อมูลเข้ามาทาง API (ตั้งค่า > การเชื่อมต่อ > สร้างคีย์)' : 'ไม่พบรถที่ตรงกับเงื่อนไข'}
          </div>
        )}
        <Pager p={pagerOf(data, setPage)} unit="คัน" />
      </section>

      {adding && (
        <AddVehicleModal
          vehicles={adding}
          drivers={drivers ?? []}
          onClose={() => setAdding(null)}
          onDone={(v) => {
            setAdding(null)
            reload()
            toast(`เพิ่มรถ ${v.id} (${v.model}) แล้ว`)
          }}
        />
      )}
    </>
  )
}
