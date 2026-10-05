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
import { SocBar } from '@/components/ui/SocBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BatteryBars } from '@/components/charts/BatteryBars'
import { RangeModelChart } from '@/components/charts/RangeModelChart'
import { SohTrendChart } from '@/components/charts/SohTrendChart'

async function load() {
  const [vehicles, stations, insights] = await Promise.all([api.listVehicles(), api.listStations(), api.getBatteryInsights()])
  return { vehicles, stations, insights }
}

/** อุณหภูมิแบตจำลอง (ยังไม่มีเซ็นเซอร์จริง) — สูตรเดียวกับต้นแบบ */
const batteryTemp = (soc: number) => 28 + (soc % 9)

export default function BatteryPage() {
  const { data } = useAsync(load)
  const [metric, setMetric] = useState<'soc' | 'range'>('soc')
  if (!data) return <div className="muted">กำลังโหลดข้อมูล…</div>

  const { vehicles: V, stations, insights } = data
  const sorted = [...V].sort((a, b) => a.soc - b.soc)
  const low = sorted.filter((v) => v.soc < 30)
  const avgSoc = Math.round(V.reduce((s, v) => s + v.soc, 0) / V.length)
  const avgSoh = (V.reduce((s, v) => s + v.soh, 0) / V.length).toFixed(1)
  const kwhLeft = V.reduce((s, v) => s + (v.batteryKwh * v.soc) / 100, 0)
  const capacity = V.reduce((s, v) => s + v.batteryKwh, 0)
  const nearest = stations.find((s) => s.ports > s.busy)

  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="แบตเฉลี่ย (SoC)" value={avgSoc} unit="%" note="ทั้งกองยาน" icon="battery" tone="green" />
        <KpiCard label="สุขภาพแบตเฉลี่ย (SoH)" value={avgSoh} unit="%" note={`ลดลง ${insights.sohChange3m}% ใน 3 เดือน`} icon="shield" tone="blue" />
        <KpiCard label="พลังงานคงเหลือรวม" value={fmt(kwhLeft)} unit="kWh" note={`จากความจุ ${fmt(capacity)} kWh`} icon="bolt" tone="amber" />
        <KpiCard label="แบตต่ำกว่า 30%" value={low.length} unit="คัน" note="ต้องวางแผนชาร์จ" icon="alert" tone="red" />
      </section>

      <section className="grid g-21 mb">
        <Card>
          <CardHeader
            title="ระดับแบตเตอรี่รายคัน"
            sub="เรียงจากน้อยไปมาก — เส้นแดงคือเกณฑ์แจ้งเตือน 30%"
            actions={
              <Segmented
                value={metric}
                onChange={setMetric}
                options={[
                  { key: 'soc', label: 'SoC %' },
                  { key: 'range', label: 'ระยะวิ่ง (กม.)' },
                ]}
              />
            }
          />
          <div className="chart lg">
            <BatteryBars vehicles={sorted} metric={metric} />
          </div>
        </Card>
        <Card>
          <CardHeader title="ต้องชาร์จเร็วที่สุด" sub="รถที่แบตต่ำกว่าเกณฑ์" />
          <div className="list">
            {low.map((v) => (
              <div className="li" key={v.id}>
                <div className="li-ico t-red">
                  <Icon name="battery" size={18} />
                </div>
                <div className="li-body">
                  <strong>
                    {v.id} · {v.soc}%
                  </strong>
                  <p>
                    เหลือ {v.range} กม. · {v.location}
                    <br />
                    สถานีแนะนำ: {nearest?.name ?? '-'}
                  </p>
                </div>
                <Link className="btn btn-outline btn-sm" href={`/vehicles/${v.id}`}>
                  ดู
                </Link>
              </div>
            ))}
            {low.length === 0 && <div className="empty">ไม่มีรถที่แบตต่ำกว่าเกณฑ์</div>}
          </div>
          <div className="divider" />
          <div className="card-h" style={{ marginBottom: 12 }}>
            <div>
              <h3>คำแนะนำ</h3>
            </div>
          </div>
          <div className="list">
            <div className="li">
              <div className="li-ico t-green">
                <Icon name="bolt" size={18} />
              </div>
              <div className="li-body">
                <strong>ชาร์จนอกเวลา Peak</strong>
                <p>ตั้งเวลาชาร์จ 22:00–09:00 ที่ Depot ประหยัดค่าไฟได้ราว 35% (อัตรา TOU)</p>
              </div>
            </div>
            <div className="li">
              <div className="li-ico t-blue">
                <Icon name="shield" size={18} />
              </div>
              <div className="li-body">
                <strong>รักษาแบตที่ 20–80%</strong>
                <p>ช่วยยืดอายุแบต ใช้ชาร์จเต็ม 100% เฉพาะวันที่ต้องวิ่งไกล</p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid g-2 mb">
        <Card>
          <CardHeader title="แนวโน้มสุขภาพแบต (SoH)" sub="ค่าเฉลี่ยกองยาน 12 เดือนล่าสุด" />
          <div className="chart">
            <SohTrendChart labels={insights.sohTrend.labels} values={insights.sohTrend.values} />
          </div>
        </Card>
        <Card>
          <CardHeader title="ระยะวิ่งที่ใช้งานได้ตามรุ่น" sub="ระยะเฉลี่ยจากแบต 100% เทียบสเปก" />
          <div className="chart">
            <RangeModelChart data={insights.modelRanges} />
          </div>
        </Card>
      </section>

      <section className="card flush">
        <CardHeader title="รายละเอียดแบตเตอรี่" sub="ข้อมูลรายคัน" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>รถ</th>
                <th>SoC</th>
                <th className="r">พลังงานคงเหลือ</th>
                <th className="r">ความจุ</th>
                <th className="r">ระยะวิ่ง</th>
                <th>SoH</th>
                <th className="r">อุณหภูมิแบต</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link className="veh" href={`/vehicles/${v.id}`}>
                      <span className="veh-ico">
                        <Icon name="battery" />
                      </span>
                      <span>
                        <strong>{v.id}</strong>
                        <small>{v.model}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <SocBar value={v.soc} width={90} />
                  </td>
                  <td className="r">{((v.batteryKwh * v.soc) / 100).toFixed(1)} kWh</td>
                  <td className="r">{v.batteryKwh} kWh</td>
                  <td className="r">{v.range} กม.</td>
                  <td>
                    <SocBar value={v.soh} width={60} />
                  </td>
                  <td className="r">{batteryTemp(v.soc)}°C</td>
                  <td>
                    <StatusBadge status={v.status} />
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
