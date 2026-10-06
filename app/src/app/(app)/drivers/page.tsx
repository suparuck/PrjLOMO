'use client'

import { useState } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
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

const scoreClass = (s: number) => (s >= 85 ? 'good' : s >= 70 ? 'mid' : 'bad')

async function load() {
  const [drivers, vehicles, events] = await Promise.all([api.listDrivers(), api.listVehicles(), api.getDriverEvents()])
  return { drivers, vehicles, events }
}

export default function DriversPage() {
  const { data, error, reload } = useAsync(load)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Driver | null>(null)
  if (!data) return <PageLoading error={error} />

  const { drivers: D, vehicles, events } = data
  const vehOf = (driverId: string): Vehicle | undefined => vehicles.find((v) => v.driverId === driverId)
  // คนขับที่ยังไม่มีทริปไม่มีคะแนน: ไม่นับในค่าเฉลี่ยและอันดับ (แสดงท้ายตาราง)
  const scored = D.filter((d) => d.score !== null)
  const byScore = (a: Driver, b: Driver) => (b.score ?? 0) - (a.score ?? 0)
  const ranked = [...scored].sort(byScore).concat(D.filter((d) => d.score === null))
  const avg = scored.length ? Math.round(scored.reduce((s, d) => s + (d.score ?? 0), 0) / scored.length) : 0
  const good = scored.filter((d) => (d.score ?? 0) >= 85).length
  const totalKm = D.reduce((s, d) => s + d.km, 0)
  const working = D.filter((d) => {
    const v = vehOf(d.id)
    return v && v.status !== 'offline'
  }).length
  const term = q.trim()

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="คนขับทั้งหมด" value={D.length} unit="คน" note={`ปฏิบัติงานวันนี้ ${working} คน`} icon="users" tone="navy" />
        <KpiCard label="คะแนน Eco เฉลี่ย" value={avg} unit="/100" note="เพิ่มขึ้น 3 คะแนนจากเดือนก่อน" icon="star" tone="green" />
        <KpiCard label="ระยะทางรวม 30 วัน" value={fmt(totalKm)} unit="กม." note={`เฉลี่ย ${fmt(totalKm / D.length)} กม./คน`} icon="route" tone="blue" />
        <KpiCard label="เหตุการณ์ไม่ปลอดภัย" value={D.reduce((s, d) => s + d.events, 0)} unit="ครั้ง" note="เบรกแรง ขับเร็ว เร่งแรง" icon="alert" tone="red" />
      </section>

      <section className="grid g-21 mb">
        <div className="card flush">
          <CardHeader
            title="อันดับคนขับ"
            sub="คะแนน Eco-Driving 30 วันล่าสุด"
            actions={
              <div className="card-tools">
                <SearchInput value={q} onChange={setQ} placeholder="ค้นหาคนขับ" minWidth={200} />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
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
                {ranked.map((d, i) => ({ d, i }))
                  .filter(({ d }) => !term || d.name.includes(term))
                  .map(({ d, i }) => {
                    const v = vehOf(d.id)
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className={`pill-num${d.score !== null && i < 3 ? ' gold' : ''}`}>{d.score !== null ? i + 1 : '–'}</span>
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
                  {good}/{scored.length} คน
                </b>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${scored.length ? (good / scored.length) * 100 : 0}%` }} />
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
          {ranked.map((d) => {
            const v = vehOf(d.id)
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

      {detail && <DriverDetailModal driver={detail} vehicle={vehOf(detail.id)} onClose={() => setDetail(null)} />}
      {adding && (
        <AddDriverModal
          drivers={D}
          vehicles={vehicles}
          onClose={() => setAdding(false)}
          onDone={(d) => {
            setAdding(false)
            reload()
            toast(`เพิ่มคนขับ ${d.name} แล้ว`)
          }}
        />
      )}
    </>
  )
}
