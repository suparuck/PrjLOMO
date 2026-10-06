'use client'

import Link from 'next/link'
import { PageLoading } from '@/components/ui/PageLoading'
import { api } from '@/api'
import { use } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { fmt } from '@/lib/format'
import { formatRelative } from '@/lib/time'
import { usePageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { telHref } from '@/lib/phone'
import { Icon } from '@/components/ui/Icon'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { SocBar } from '@/components/ui/SocBar'
import { SocGauge } from '@/components/ui/SocGauge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SocLineChart } from '@/components/charts/SocLineChart'
import { FleetMapClient } from '@/components/map/FleetMapClient'

async function load(id: string) {
  const [detail, stations, org] = await Promise.all([api.getVehicleDetail(id), api.listStations(), api.getOrg()])
  return { detail, stations, org }
}

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 15+: params เป็น Promise — หน้า client component ใช้ use() เปิดค่า
  const id = decodeURIComponent(use(params).id)
  const { data, error } = useAsync(() => load(id), [id], { live: true })
  const v = data?.detail?.vehicle
  usePageHeader(
    v
      ? { title: `${v.id} · ${v.model}`, crumb: { href: '/vehicles', label: 'รถทั้งหมด', current: 'รายละเอียด' } }
      : { title: 'รายละเอียดรถ', crumb: { href: '/vehicles', label: 'รถทั้งหมด', current: 'รายละเอียด' } },
  )

  if (!data) return <PageLoading error={error} />
  if (!data.detail || !v) {
    return (
      <Card>
        <div className="empty">
          <h3>ไม่พบรถ {id}</h3>
          <p>
            <Link href="/vehicles">กลับไปรายการรถทั้งหมด</Link>
          </p>
        </div>
      </Card>
    )
  }

  const { driver: d, socSeries, trips, maintenance } = data.detail
  const { stations, org } = data
  const facts: [string, string][] = [
    ['ระยะวิ่งคงเหลือ', `${v.range} กม.`],
    ['ความเร็ว', `${v.speed} กม./ชม.`],
    ['สุขภาพแบต (SoH)', `${v.soh}%`],
    ['ประสิทธิภาพ', `${v.efficiency} kWh/100`],
  ]
  const spec: [string, string][] = [
    ['รุ่น', v.model],
    ['ทะเบียน', v.plate],
    ['ความจุแบต', `${v.batteryKwh} kWh`],
    ['พลังงานคงเหลือ', `${((v.batteryKwh * v.soc) / 100).toFixed(1)} kWh`],
    ['SoH', `${v.soh}%`],
    ['เลขไมล์', `${fmt(v.odometer)} กม.`],
    ['หัวชาร์จ', 'CCS2 / Type 2'],
    ['อุปกรณ์ติดตาม', 'OBD-Link · ออนไลน์'],
  ]

  return (
    <>
      <section className="card mb">
        <div className="v-hero">
          <SocGauge value={v.soc} />
          <div className="v-title">
            <h2>
              {v.model} <span className="tag">{v.plate}</span> <StatusBadge status={v.status} />
            </h2>
            <p>
              คนขับ: {d?.name ?? '-'} · ตำแหน่ง: {v.location} · อัปเดต {v.lastSeenAt ? formatRelative(v.lastSeenAt) : 'ยังไม่เคยส่งข้อมูล'}
            </p>
            <div className="v-facts">
              {facts.map(([l, b]) => (
                <div className="v-fact" key={l}>
                  <span>{l}</span>
                  <b>{b}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="flex wrap" style={{ alignSelf: 'start' }}>
            <LinkButton href="/map" size="md" icon="map">
              ดูบนแผนที่
            </LinkButton>
            {d ? (
              <a className="btn btn-navy" href={telHref(d.phone)} title={`โทร ${d.name} ${d.phone}`}>
                <Icon name="phone" size={16} />
                ติดต่อคนขับ
              </a>
            ) : (
              <button type="button" className="btn btn-navy" disabled title="รถคันนี้ยังไม่มีคนขับประจำ">
                <Icon name="phone" size={16} />
                ติดต่อคนขับ
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid g-21 mb">
        <Card>
          <CardHeader title="ระดับแบตเตอรี่ 24 ชั่วโมง" sub="SoC (%) และช่วงเวลาชาร์จ" />
          <div className="chart">
            <SocLineChart labels={socSeries.labels} values={socSeries.values} />
          </div>
        </Card>
        <Card>
          <CardHeader title="ตำแหน่งปัจจุบัน" sub={v.location} />
          <FleetMapClient vehicles={[v]} stations={stations} drivers={d ? [d] : []} center={[v.lat, v.lng]} zoom={13} fit={false} height={260} />
        </Card>
      </section>

      <section className="grid g-3 mb">
        <Card>
          <CardHeader title="ข้อมูลรถ" sub="สเปกและสุขภาพแบตเตอรี่" />
          <dl className="kv">
            {spec.map(([k, val]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="คนขับประจำรถ" sub="ผลการขับสัปดาห์นี้" />
          {d ? (
            <div className="driver-card">
              <div className="driver-head">
                <span className="avatar">{d.name.slice(0, 2)}</span>
                <div>
                  <strong>{d.name}</strong>
                  <small>{d.phone}</small>
                </div>
                <ScoreRing score={d.score} />
              </div>
              <div className="mini-stats">
                <div>
                  <b>{fmt(d.km)}</b>
                  <span>กม.</span>
                </div>
                <div>
                  <b>{d.trips}</b>
                  <span>ทริป</span>
                </div>
                <div>
                  <b>{d.events}</b>
                  <span>เหตุการณ์</span>
                </div>
              </div>
              <LinkButton href="/drivers">ดูข้อมูลคนขับทั้งหมด</LinkButton>
            </div>
          ) : (
            <div className="empty">ยังไม่ได้กำหนดคนขับ</div>
          )}
        </Card>
        <Card>
          <CardHeader title="การบำรุงรักษา" sub="รายการที่จะถึงกำหนด" />
          <div className="list">
            {maintenance.map((m) => (
              <div className="li" key={m.title}>
                <div className={`li-ico t-${m.tone}`}>
                  <Icon name={m.icon} size={18} />
                </div>
                <div className="li-body">
                  <strong>{m.title}</strong>
                  <p>{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="card flush">
        <CardHeader
          title="ประวัติการเดินทาง"
          sub="5 ทริปล่าสุด"
          actions={
            <button className="btn btn-outline btn-sm">
              <Icon name="download" size={15} />
              ส่งออก
            </button>
          }
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>วันเวลา</th>
                <th>ต้นทาง → ปลายทาง</th>
                <th className="r">ระยะทาง</th>
                <th className="r">เวลา</th>
                <th className="r">พลังงาน</th>
                <th className="r">kWh/100 กม.</th>
                <th>แบต</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.when}>
                  <td>{t.when}</td>
                  <td>{t.route}</td>
                  <td className="r">{t.km} กม.</td>
                  <td className="r">{t.minutes} นาที</td>
                  <td className="r">{t.kwh} kWh</td>
                  <td className="r">{t.efficiency ?? '–'}</td>
                  <td>
                    {t.soc === null ? <span className="muted">–</span> : <SocBar value={t.soc} width={48} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
