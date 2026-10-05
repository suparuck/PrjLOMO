'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { fmt } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { Segmented } from '@/components/ui/Segmented'
import { ChargingSessionCard } from '@/components/domain/ChargingSessionCard'
import { StationCard } from '@/components/domain/StationCard'
import { ChargingLoadChart } from '@/components/charts/ChargingLoadChart'

async function load() {
  const [vehicles, stations, sessions, history, loadKw] = await Promise.all([
    api.listVehicles(),
    api.listStations(),
    api.listChargingSessions(),
    api.listChargingHistory(),
    api.getChargingLoad(),
  ])
  return { vehicles, stations, sessions, history, loadKw }
}

type StationFilter = 'all' | 'depot' | 'public'

export default function ChargingPage() {
  const { data } = useAsync(load)
  const [stFilter, setStFilter] = useState<StationFilter>('all')
  if (!data) return <div className="muted">กำลังโหลดข้อมูล…</div>

  const { vehicles, stations, sessions: S, history: H, loadKw } = data
  const modelOf = (id: string) => vehicles.find((v) => v.id === id)?.model ?? ''
  const typeOf = (name: string) => stations.find((s) => s.name === name)?.type

  const all = [...S.map((s) => ({ name: s.stationName, kwh: s.kwh, cost: s.cost })), ...H.map((h) => ({ name: h.stationName, kwh: h.kwh, cost: h.cost }))]
  const kwh = all.reduce((s, x) => s + x.kwh, 0)
  const cost = all.reduce((s, x) => s + x.cost, 0)
  const depotKwh = all.filter((x) => typeOf(x.name) === 'depot').reduce((s, x) => s + x.kwh, 0)
  const avgPrice = (type: 'depot' | 'public') => {
    const l = stations.filter((s) => s.type === type)
    return l.reduce((s, x) => s + x.pricePerKwh, 0) / l.length
  }
  const cheaperPct = Math.round((1 - avgPrice('depot') / avgPrice('public')) * 100)

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="เซสชัน 24 ชม." value={all.length} unit="ครั้ง" note={`กำลังชาร์จ ${S.length} คัน`} icon="bolt" tone="green" />
        <KpiCard label="พลังงานที่ชาร์จ" value={fmt(kwh, 1)} unit="kWh" note="24 ชั่วโมงล่าสุด" icon="battery" tone="blue" />
        <KpiCard label="ค่าใช้จ่าย" value={`฿${fmt(cost)}`} unit="" note={`เฉลี่ย ฿${(cost / kwh).toFixed(2)}/kWh`} icon="coin" tone="amber" />
        <KpiCard label="สัดส่วนชาร์จที่ Depot" value={Math.round((depotKwh / kwh) * 100)} unit="%" note={`ราคาถูกกว่าสาธารณะ ~${cheaperPct}%`} icon="plug" tone="navy" />
      </section>

      <section className="grid g-2 mb">
        <Card>
          <CardHeader
            title="กำลังชาร์จตอนนี้"
            sub="อัปเดตทุก 30 วินาที"
            actions={
              <span className="badge s-charging">
                <i />
                สด
              </span>
            }
          />
          <div className="grid" style={{ gap: 12 }}>
            {S.map((s) => (
              <ChargingSessionCard
                key={s.vehicleId}
                session={s}
                model={modelOf(s.vehicleId)}
                showFrom
                actions={
                  <>
                    <button className="btn btn-outline btn-sm">ปรับเป้าหมาย</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                      หยุดชาร์จ
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="โหลดการชาร์จรายชั่วโมง" sub="วันนี้ (kW) — ช่วงสีเทาคือเวลา On-Peak 09:00–22:00" />
          <div className="chart">
            <ChargingLoadChart load={loadKw} />
          </div>
        </Card>
      </section>

      <Card className="mb">
        <CardHeader
          title="สถานีชาร์จ"
          sub="Depot ขององค์กรและเครือข่ายสาธารณะที่ใช้บ่อย"
          actions={
            <Segmented
              value={stFilter}
              onChange={setStFilter}
              options={[
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'depot', label: 'Depot' },
                { key: 'public', label: 'สาธารณะ' },
              ]}
            />
          }
        />
        <div className="grid g-3">
          {stations
            .filter((s) => stFilter === 'all' || s.type === stFilter)
            .map((s) => (
              <StationCard key={s.id} station={s} />
            ))}
        </div>
      </Card>

      <section className="card flush">
        <CardHeader
          title="ประวัติการชาร์จ"
          sub="เซสชันล่าสุด"
          actions={
            <button className="btn btn-outline btn-sm">
              <Icon name="download" size={15} />
              ส่งออก Excel
            </button>
          }
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>รถ</th>
                <th>สถานี</th>
                <th>วันเวลา</th>
                <th className="r">ระยะเวลา</th>
                <th>แบต</th>
                <th className="r">พลังงาน</th>
                <th className="r">ค่าใช้จ่าย</th>
              </tr>
            </thead>
            <tbody>
              {H.map((h) => (
                <tr key={h.vehicleId + h.date}>
                  <td>
                    <Link className="veh" href={`/vehicles/${h.vehicleId}`}>
                      <span className="veh-ico">
                        <Icon name="bolt" />
                      </span>
                      <span>
                        <strong>{h.vehicleId}</strong>
                        <small>{modelOf(h.vehicleId)}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{h.stationName}</td>
                  <td>{h.date}</td>
                  <td className="r">{h.duration}</td>
                  <td>
                    <span className="small">
                      <b>{h.fromSoc}%</b> → <b style={{ color: 'var(--green)' }}>{h.toSoc}%</b>
                    </span>
                  </td>
                  <td className="r">{h.kwh} kWh</td>
                  <td className="r">฿{fmt(h.cost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
