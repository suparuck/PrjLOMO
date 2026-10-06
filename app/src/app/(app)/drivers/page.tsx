'use client'

import { useEffect, useState } from 'react'
import { Pager, pagerOf } from '@/components/ui/Pager'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { useDebounced } from '@/hooks/useDebounced'
import { fmt } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { SearchInput } from '@/components/ui/SearchInput'
import { DriverDetailModal } from '@/components/modals/DriverDetailModal'
import { AddDriverModal } from '@/components/modals/AddDriverModal'
import { useToast } from '@/components/ui/Toast'
import { DriverEventsDonut } from '@/components/charts/DriverEventsDonut'
import type { Driver, Vehicle } from '@/types'

const scoreClass = (sc: number) => (sc >= 85 ? 'good' : sc >= 70 ? 'mid' : 'bad')
const PAGE_SIZE = 10

export default function DriversPage() {
  const toast = useToast()
  const [adding, setAdding] = useState<{ drivers: Driver[]; vehicles: Vehicle[] } | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Driver | null>(null)
  const dq = useDebounced(q.trim(), 300)
  useEffect(() => setPage(1), [dq])

  // แบ่งหน้า/ค้นหาที่ API: อันดับและรถประจำมากับแต่ละแถว, KPI มาจาก summary ของคนขับทั้งหมด
  const { data, error, reload } = useAsync(() => api.listDriversPage({ page, pageSize: PAGE_SIZE, q: dq }), [page, dq], { live: true })
  const { data: events } = useAsync(() => api.getDriverEvents(), [], { live: true })
  useEffect(() => {
    if (data && data.page > data.pages) setPage(data.pages)
  }, [data])

  if (!data || !events) return <PageLoading error={error} />

  const { items: list, summary: sm } = data
  const avg = sm.avgScore
  const good = sm.good
  const scoredCount = sm.scored

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="คนขับทั้งหมด" value={sm.total} unit="คน" note={`ปฏิบัติงานวันนี้ ${sm.working} คน`} icon="users" tone="navy" />
        <KpiCard label="คะแนน Eco เฉลี่ย" value={avg} unit="/100" note={`จากคนขับที่มีทริป ${scoredCount} คน`} icon="star" tone="green" />
        <KpiCard label="ระยะทางรวม 30 วัน" value={fmt(sm.totalKm)} unit="กม." note={`เฉลี่ย ${fmt(sm.total ? sm.totalKm / sm.total : 0)} กม./คน`} icon="route" tone="blue" />
        <KpiCard label="เหตุการณ์ไม่ปลอดภัย" value={sm.events} unit="ครั้ง" note="เบรกแรง ขับเร็ว เร่งแรง" icon="alert" tone="red" />
      </section>

      <section className="grid g-21 mb">
        <div className="card flush">
          <CardHeader
            title="อันดับคนขับ"
            sub="คะแนน Eco-Driving 30 วันล่าสุด"
            actions={
              <div className="card-tools">
                <SearchInput value={q} onChange={setQ} placeholder="ค้นหาคนขับ" minWidth={200} />
                <button type="button" className="btn btn-primary btn-sm" onClick={async () => setAdding({ drivers: await api.listDrivers(), vehicles: await api.listVehicles() })}>
                  <Icon name="plus" size={15} />
                  เพิ่มคนขับ
                </button>
              </div>
            }
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>คนขับ</th>
                  <th>รถประจำ</th>
                  <th className="r">คะแนน</th>
                  <th className="r">ระยะทาง</th>
                  <th className="r">kWh/100 กม.</th>
                  <th className="r">เหตุการณ์</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                    const v = d.vehicle
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className={`pill-num${d.rank != null && d.rank <= 3 ? ' gold' : ''}`}>{d.rank ?? '–'}</span>
                        </td>
                        <td>
                          <div className="veh">
                            <span className="avatar avatar-sm">
                              {d.name.slice(0, 2)}
                            </span>
                            <span>
                              <strong>{d.name}</strong>
                              <small>{d.phone}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {v && (
                            <>
                              <Link href={`/vehicles/${v.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                                {v.id}
                              </Link>{' '}
                              <span className="muted small">{v.model}</span>
                            </>
                          )}
                        </td>
                        <td className="r">
                          {d.score !== null ? <span className={`score ${scoreClass(d.score)}`}>{d.score}</span> : <span className="muted">–</span>}
                        </td>
                        <td className="r">{fmt(d.km)} กม.</td>
                        <td className="r">{v?.efficiency ?? '-'}</td>
                        <td className="r">{d.events}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(d)}>
                            รายละเอียด
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {data.total === 0 && <div className="empty">{dq ? 'ไม่พบคนขับที่ตรงกับคำค้น' : 'ยังไม่มีคนขับ — กด "เพิ่มคนขับ" เพื่อเริ่ม'}</div>}
          <Pager p={pagerOf(data, setPage)} unit="คน" />
        </div>

        <Card>
          <CardHeader title="เหตุการณ์การขับขี่" sub="30 วันล่าสุด แยกตามประเภท" />
          <div className="chart sm">
            <DriverEventsDonut events={events} />
          </div>
          <div className="divider" />
          <div className="stat-rows">
            <div className="stat-row">
              <div className="top">
                <span>คะแนนเฉลี่ยกองยาน</span>
                <b>{avg}</b>
              </div>
              <div className="bar">
                <div className="bar-fill good" style={{ width: `${avg}%` }} />
              </div>
            </div>
            <div className="stat-row">
              <div className="top">
                <span>คนขับที่คะแนน ≥ 85</span>
                <b>
                  {good}/{scoredCount} คน
                </b>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${scoredCount ? (good / scoredCount) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section>
        <div className="toolbar">
          <h3>โปรไฟล์คนขับ</h3>
          <span className="small muted">กดการ์ดเพื่อดูรถที่ขับ</span>
        </div>
        <div className="grid g-4">
          {list.map((d) => {
            const v = d.vehicle
            return (
              <Link key={d.id} className="card driver-card" href={v ? `/vehicles/${v.id}` : '/vehicles'}>
                <div className="driver-head">
                  <span className="avatar">{d.name.slice(0, 2)}</span>
                  <div>
                    <strong>{d.name}</strong>
                    <small>{v ? `${v.id} · ${v.model}` : 'ยังไม่มีรถประจำ'}</small>
                  </div>
                  <ScoreRing score={d.score} />
                </div>
                <div className="mini-stats">
                  <div>
                    <b>{fmt(d.km)}</b>
                    <span>กม.</span>
                  </div>
                  <div>
                    <b>{v?.efficiency ?? '-'}</b>
                    <span>kWh/100</span>
                  </div>
                  <div>
                    <b>{d.events}</b>
                    <span>เหตุการณ์</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {detail && <DriverDetailModal driver={detail} vehicle={detail.vehicle ?? undefined} onClose={() => setDetail(null)} />}
      {adding && (
        <AddDriverModal
          drivers={adding.drivers}
          vehicles={adding.vehicles}
          onClose={() => setAdding(null)}
          onDone={(d) => {
            setAdding(null)
            reload()
            toast(`เพิ่มคนขับ ${d.name} แล้ว`)
          }}
        />
      )}
    </>
  )
}
