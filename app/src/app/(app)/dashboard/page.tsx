'use client'

import { useState } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'
import Link from 'next/link'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { fmt } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { Segmented } from '@/components/ui/Segmented'
import { SocBar } from '@/components/ui/SocBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AlertListItem } from '@/components/domain/AlertListItem'
import { ChargingSessionCard } from '@/components/domain/ChargingSessionCard'
import { SocDonut } from '@/components/charts/SocDonut'
import { EnergyChart } from '@/components/charts/EnergyChart'
import { FleetMapClient } from '@/components/map/FleetMapClient'

async function loadDashboard() {
  const [org, vehicles, drivers, stations, alerts, sessions, week, energy, sustain] = await Promise.all([
    api.getOrg(),
    api.listVehicles(),
    api.listDrivers(),
    api.listStations(),
    api.listAlerts(),
    api.listChargingSessions(),
    api.getEnergyWeek(),
    api.getEnergySummary(),
    api.getSustainability(),
  ])
  return { org, vehicles, drivers, stations, alerts, sessions, week, energy, sustain }
}

const LEGEND = [
  ['var(--blue)', 'กำลังขับ'],
  ['var(--green)', 'กำลังชาร์จ'],
  ['var(--slate)', 'จอดอยู่'],
  ['var(--danger)', 'แบตต่ำ'],
  ['var(--faint)', 'ออฟไลน์'],
] as const

export default function DashboardPage() {
  const { data, error } = useAsync(loadDashboard)
  const [metric, setMetric] = useState<'kwh' | 'cost'>('kwh')

  if (!data) return <PageLoading error={error} />

  const { org, vehicles: V, drivers, stations, alerts, sessions, week, energy, sustain } = data
  const count = (s: string) => V.filter((v) => v.status === s).length
  const online = V.filter((v) => v.status !== 'offline').length
  const unread = alerts.filter((a) => !a.acknowledged).length
  const chargingDepot = sessions.filter((s) => stations.find((st) => st.name === s.stationName)?.type === 'depot').length

  const hi = V.filter((v) => v.soc >= 70).length
  const mid = V.filter((v) => v.soc >= 30 && v.soc < 70).length
  const lo = V.filter((v) => v.soc < 30).length
  const avg = Math.round(V.reduce((s, v) => s + v.soc, 0) / V.length)
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '-'

  return (
    <>
      <section className="grid g-5 mb kpi-grid-2m">
        <KpiCard label="รถทั้งหมด" value={V.length} unit="คัน" note={`ออนไลน์ ${online} คัน (${Math.round((online / V.length) * 100)}%)`} icon="car" tone="navy" />
        <KpiCard label="กำลังขับ" value={count('driving')} unit="คัน" note="กำลังปฏิบัติงาน" icon="route" tone="blue" />
        <KpiCard label="กำลังชาร์จ" value={count('charging')} unit="คัน" note={`Depot ${chargingDepot} · สาธารณะ ${sessions.length - chargingDepot}`} icon="bolt" tone="green" />
        <KpiCard label="แบตต่ำ" value={count('low')} unit="คัน" note="ต่ำกว่า 30%" icon="battery" tone="red" />
        <KpiCard label="การแจ้งเตือน" value={unread} unit="รายการ" note="ยังไม่ได้รับทราบ" icon="bell" tone="amber" />
      </section>

      <section className="grid g-21 mb">
        <Card>
          <CardHeader
            title="แผนที่รถแบบสด"
            sub="ตำแหน่งปัจจุบันของรถทุกคันและสถานีชาร์จ"
            actions={<LinkButton href="/map" icon="map">เปิดแผนที่เต็ม</LinkButton>}
          />
          <FleetMapClient vehicles={V} stations={stations} drivers={drivers} center={org.center} />
          <div className="legend">
            {LEGEND.map(([color, label]) => (
              <span key={label}>
                <i style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="สถานะแบตเตอรี่" sub="ระดับแบตเฉลี่ยของทั้งกองยาน" actions={<LinkButton href="/battery" variant="ghost">ทั้งหมด</LinkButton>} />
          <div className="donut-wrap" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <SocDonut counts={[hi, mid, lo]} avg={avg} />
            <div className="stat-rows">
              {(
                [
                  ['แบตสูง', hi, '≥ 70%', 'good'],
                  ['แบตปานกลาง', mid, '30% – 69%', 'mid'],
                  ['แบตต่ำ', lo, '< 30%', 'bad'],
                ] as const
              ).map(([label, n, range, cls]) => (
                <div className="stat-row" key={label}>
                  <div className="top">
                    <span>{label}</span>
                    <b>{n} คัน</b>
                  </div>
                  <div className="bar">
                    <div className={`bar-fill ${cls}`} style={{ width: `${(n / V.length) * 100}%` }} />
                  </div>
                  <small>{range}</small>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="card flush mb">
        <CardHeader title="สถานะรถ" sub="ข้อมูลล่าสุดของรถยนต์ไฟฟ้าทุกคัน" actions={<LinkButton href="/vehicles">ดูรถทั้งหมด →</LinkButton>} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>รถ</th>
                <th>คนขับ</th>
                <th>แบตเตอรี่</th>
                <th className="r">ระยะวิ่งคงเหลือ</th>
                <th>ตำแหน่ง</th>
                <th className="r">ความเร็ว</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {V.slice(0, 7).map((v) => (
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
                  <td>{driverName(v.driverId)}</td>
                  <td>
                    <SocBar value={v.soc} />
                  </td>
                  <td className="r">{v.range} กม.</td>
                  <td>{v.location}</td>
                  <td className="r">{v.speed} กม./ชม.</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid g-3 mb">
        <Card className="span-2">
          <CardHeader
            title="การใช้พลังงาน"
            sub="พลังงานรวมและค่าไฟของกองยาน สัปดาห์นี้"
            actions={
              <div className="card-tools">
                <Segmented
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { key: 'kwh', label: 'kWh' },
                    { key: 'cost', label: 'ค่าใช้จ่าย (฿)' },
                  ]}
                />
              </div>
            }
          />
          <div className="flex wrap" style={{ gap: 32, marginBottom: 12 }}>
            <div>
              <div className="kpi-label">พลังงานรวม</div>
              <div className="kpi-value">
                {fmt(energy.totalKwh)}
                <small>kWh</small>
              </div>
              <div className="kpi-note up">
                <Icon name="arrowUp" size={13} />
                {energy.kwhChangePct}% จากสัปดาห์ก่อน
              </div>
            </div>
            <div>
              <div className="kpi-label">ค่าไฟรวม</div>
              <div className="kpi-value">฿{fmt(energy.totalCost)}</div>
              <div className="kpi-note">เฉลี่ย ฿{energy.avgPricePerKwh.toFixed(2)} / kWh</div>
            </div>
            <div>
              <div className="kpi-label">ประสิทธิภาพ</div>
              <div className="kpi-value">
                {energy.efficiency}
                <small>kWh/100 กม.</small>
              </div>
              <div className="kpi-note up">
                <Icon name="arrowDown" size={13} />
                ดีขึ้น {energy.efficiencyChangePct}%
              </div>
            </div>
          </div>
          <div className="chart">
            <EnergyChart week={week} metric={metric} />
          </div>
        </Card>

        <Card>
          <CardHeader title="การแจ้งเตือนล่าสุด" sub="เหตุการณ์ที่ต้องติดตาม" actions={<LinkButton href="/alerts" variant="ghost">ทั้งหมด</LinkButton>} />
          <div className="list">
            {alerts.slice(0, 5).map((a) => (
              <AlertListItem key={a.id} alert={a} />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid g-2">
        <Card>
          <CardHeader title="กำลังชาร์จตอนนี้" sub="เซสชันที่กำลังดำเนินการ" actions={<LinkButton href="/charging" variant="ghost">การชาร์จ</LinkButton>} />
          <div className="grid" style={{ gap: 12 }}>
            {sessions.map((s) => (
              <ChargingSessionCard key={s.vehicleId} session={s} model={V.find((v) => v.id === s.vehicleId)?.model ?? ''} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="ความยั่งยืน" sub="ผลลัพธ์จากการใช้รถไฟฟ้า ปี 2026" actions={<LinkButton href="/reports#co2" variant="ghost">รายงาน CO₂</LinkButton>} />
          <div className="grid g-2" style={{ gap: 12 }}>
            <div className="v-fact"><span>CO₂ ที่ลดได้</span><b>{sustain.co2Tons} ตัน</b></div>
            <div className="v-fact"><span>เทียบเท่าปลูกต้นไม้</span><b>{fmt(sustain.treesEquivalent)} ต้น</b></div>
            <div className="v-fact"><span>ประหยัดเทียบน้ำมัน</span><b>฿{fmt(sustain.fuelSavings)}</b></div>
            <div className="v-fact"><span>ระยะทางสะสม</span><b>{fmt(sustain.totalKm)} กม.</b></div>
          </div>
          <div className="banner mt">
            <Icon name="route" size={22} />
            <div className="small">
              <strong>รถสันดาป {sustain.iceReadyCount} คัน</strong> พร้อมเปลี่ยนเป็น EV ได้ทันที
            </div>
            <LinkButton href="/reports#electrify" variant="primary">ดูรายงาน</LinkButton>
          </div>
        </Card>
      </section>
    </>
  )
}
