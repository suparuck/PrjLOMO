'use client'

import { useEffect, useState } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { fmt } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { KpiCard } from '@/components/ui/KpiCard'
import { SocBar } from '@/components/ui/SocBar'
import { Tabs } from '@/components/ui/Tabs'
import {
  Co2Chart,
  CostMixDonut,
  EfficiencyChart,
  MonthlyEnergyChart,
  PerKmChart,
  TcoChart,
  UtilizationChart,
} from '@/components/charts/ReportCharts'
import type { ElectrificationReport, Report, ReportBrand, ReportPeriod } from '@/types'

type Tab = 'energy' | 'co2' | 'electrify' | 'usage'
const TABS: { key: Tab; label: string }[] = [
  { key: 'energy', label: 'พลังงานและต้นทุน' },
  { key: 'co2', label: 'คาร์บอนและความยั่งยืน' },
  { key: 'electrify', label: 'ความพร้อมเปลี่ยนเป็น EV' },
  { key: 'usage', label: 'การใช้งานรถ' },
]
const isTab = (s: string): s is Tab => TABS.some((t) => t.key === s)

const READY_LABEL = { ready: 'พร้อม', consider: 'พิจารณา', not: 'ยังไม่แนะนำ' } as const
const READY_COLOR = { ready: 'var(--green)', consider: 'var(--amber)', not: 'var(--danger)' } as const

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('energy')
  const [period, setPeriod] = useState<ReportPeriod>('year')
  const [brand, setBrand] = useState<ReportBrand>('all')

  // เปิดแท็บจาก hash เช่น /reports#electrify และซิงก์ hash เมื่อสลับแท็บ
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '')
      if (isTab(h)) setTab(h)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  const selectTab = (t: Tab) => {
    setTab(t)
    window.history.replaceState(null, '', `#${t}`)
  }

  const { data: report } = useAsync(() => api.getReport({ period, brand }), [period, brand])
  const { data: electrify } = useAsync(() => api.getElectrification())

  return (
    <>
      <div className="toolbar">
        <div className="flex wrap">
          <select className="select" style={{ width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
            <option value="year">ปี 2026 (ม.ค. – ต.ค.)</option>
            <option value="q3">ไตรมาส 3/2026</option>
            <option value="sep">เดือน ก.ย. 2026</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={brand} onChange={(e) => setBrand(e.target.value as ReportBrand)}>
            <option value="all">รถทุกคัน</option>
            <option value="BYD">เฉพาะ BYD</option>
            <option value="MG">เฉพาะ MG</option>
          </select>
        </div>
        <div className="flex wrap">
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Icon name="download" size={16} />
            PDF
          </button>
          <button className="btn btn-outline">
            <Icon name="download" size={16} />
            Excel
          </button>
          <button className="btn btn-navy">
            <Icon name="clock" size={16} />
            ตั้งเวลาส่งรายงาน
          </button>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={selectTab} />

      {tab === 'electrify' ? (
        electrify ? <ElectrifyPanel data={electrify} /> : <Loading />
      ) : report ? (
        <>
          {tab === 'energy' && <EnergyPanel r={report} />}
          {tab === 'co2' && <CarbonPanel r={report} />}
          {tab === 'usage' && <UsagePanel r={report} />}
        </>
      ) : (
        <Loading />
      )}
    </>
  )
}

const Loading = () => <div className="muted">กำลังโหลดข้อมูล…</div>

function EnergyPanel({ r }: { r: Report }) {
  const t = r.totals
  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard
          label="พลังงานรวม"
          value={fmt(t.kwh)}
          unit="kWh"
          note={<><Icon name="arrowUp" size={13} />{t.kwhChangePct}% เทียบปีก่อน</>}
          noteClass="up"
          icon="bolt"
          tone="blue"
        />
        <KpiCard label="ค่าไฟรวม" value={`฿${fmt(t.cost)}`} unit="" note={`เฉลี่ย ฿${t.avgPricePerKwh.toFixed(2)}/kWh`} icon="coin" tone="amber" />
        <KpiCard label="ต้นทุนต่อกม." value={`฿${t.costPerKm.toFixed(2)}`} unit="" note={`น้ำมันเทียบเท่า ฿${t.oilCostPerKm.toFixed(2)}/กม.`} icon="speed" tone="green" />
        <KpiCard label="ระยะทางรวม" value={fmt(t.km)} unit="กม." note={`${t.vehicleCount} คัน`} icon="route" tone="navy" />
      </section>
      <section className="grid g-21 mb">
        <Card>
          <CardHeader title="พลังงานรายเดือน" sub="kWh ที่ชาร์จ แยก Depot / สาธารณะ" />
          <div className="chart lg">
            <MonthlyEnergyChart report={r} />
          </div>
        </Card>
        <Card>
          <CardHeader title="สัดส่วนค่าใช้จ่าย" sub="ตามประเภทการชาร์จ" />
          <div className="chart lg">
            <CostMixDonut mix={r.costMix} />
          </div>
        </Card>
      </section>
    </>
  )
}

function CarbonPanel({ r }: { r: Report }) {
  const c = r.carbon
  return (
    <>
      <section className="grid g-4 mb kpi-grid-2m">
        <KpiCard label="CO₂ ที่ลดได้" value={c.avoidedTons} unit="ตัน" note="เทียบรถน้ำมันระยะเท่ากัน" icon="leaf" tone="green" />
        <KpiCard label="การปล่อยจากไฟฟ้า" value={c.gridTons} unit="ตัน" note={`ค่าการปล่อยกริด ${c.gridFactor.toFixed(2)} kgCO₂/kWh`} icon="globe" tone="blue" />
        <KpiCard label="เทียบเท่าปลูกต้นไม้" value={fmt(c.trees)} unit="ต้น" note={`ดูดซับ ${c.treeKgPerYear} kg/ต้น/ปี`} icon="leaf" tone="amber" />
        <KpiCard label="เป้าหมาย Net Zero กองยาน" value={c.netZeroPct} unit="%" note={`EV ${c.evCount} จาก ${c.fleetCount} คัน`} icon="shield" tone="navy" />
      </section>
      <section className="grid g-2 mb">
        <Card>
          <CardHeader title="CO₂ ที่หลีกเลี่ยงได้รายเดือน" sub="ตัน CO₂e" />
          <div className="chart">
            <Co2Chart labels={r.labels} values={r.co2} />
          </div>
        </Card>
        <Card>
          <CardHeader title="การปล่อยต่อกิโลเมตร" sub="gCO₂/กม. — EV เทียบรถสันดาป" />
          <div className="chart">
            <PerKmChart data={r.perKm} />
          </div>
        </Card>
      </section>
      <div className="banner">
        <Icon name="leaf" size={22} />
        <div className="small">
          <strong>พร้อมสำหรับรายงาน ESG</strong> — ส่งออกข้อมูล Scope 1 และ Scope 2 ของกองยานเป็น Excel เพื่อใช้ในรายงานความยั่งยืนประจำปี
        </div>
        <button className="btn btn-primary btn-sm">ส่งออกข้อมูล ESG</button>
      </div>
    </>
  )
}

function ElectrifyPanel({ data }: { data: ElectrificationReport }) {
  return (
    <>
      <section className="grid g-3 mb">
        <KpiCard label="พร้อมเปลี่ยนทันที" value={data.readyCount} unit="คัน" note="คะแนนความพร้อม ≥ 80" icon="check" tone="green" />
        <KpiCard label="พิจารณาภายหลัง" value={data.laterCount} unit="คัน" note="ระยะวิ่งต่อวันสูง" icon="clock" tone="amber" />
        <KpiCard
          label="ประหยัดได้ต่อปี (คาดการณ์)"
          value={`฿${fmt(Math.round(data.annualSavings / 1000))}K`}
          unit=""
          note={`หากเปลี่ยน ${data.readyCount} คันที่พร้อม`}
          icon="coin"
          tone="blue"
        />
      </section>
      <section className="card flush mb">
        <CardHeader title="รายงานความพร้อมเปลี่ยนเป็น EV (Fleet Electrification)" sub="วิเคราะห์จากข้อมูลการใช้งานจริง 90 วันของรถสันดาป" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>รถสันดาป</th>
                <th className="r">ระยะเฉลี่ย/วัน</th>
                <th className="r">ระยะสูงสุด/วัน</th>
                <th className="r">ค่าน้ำมัน/เดือน</th>
                <th className="r">ค่าไฟ EV (คาดการณ์)</th>
                <th>คะแนนความพร้อม</th>
                <th>รุ่น EV ที่แนะนำ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(({ ice: c, evMonthlyCost, readiness }) => (
                <tr key={c.id}>
                  <td>
                    <div className="veh">
                      <span className="veh-ico">
                        <Icon name="car" />
                      </span>
                      <span>
                        <strong>{c.id}</strong>
                        <small>{c.model}</small>
                      </span>
                    </div>
                  </td>
                  <td className="r">{c.kmPerDay} กม.</td>
                  <td className="r">{c.maxKmPerDay} กม.</td>
                  <td className="r">฿{fmt(c.fuelPerMonth)}</td>
                  <td className="r" style={{ color: 'var(--green)', fontWeight: 600 }}>
                    ฿{fmt(evMonthlyCost)}
                  </td>
                  <td>
                    <div className="flex">
                      <SocBar value={c.readinessScore} width={70} />
                      <span className="ready" style={{ color: READY_COLOR[readiness] }}>
                        <i style={{ background: READY_COLOR[readiness] }} />
                        {READY_LABEL[readiness]}
                      </span>
                    </div>
                  </td>
                  <td>{c.recommendedEv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Card>
        <CardHeader title="ต้นทุนรวมตลอดอายุ (TCO) 5 ปี" sub="เปรียบเทียบรถสันดาปกับ EV ต่อคัน (บาท)" />
        <div className="chart">
          <TcoChart tco={data.tco} />
        </div>
      </Card>
    </>
  )
}

function UsagePanel({ r }: { r: Report }) {
  return (
    <section className="grid g-2 mb">
      <Card>
        <CardHeader title="อัตราการใช้งานรถ" sub="% ของเวลาทำงาน (08:00–18:00) ที่รถเคลื่อนที่" />
        <div className="chart lg">
          <UtilizationChart usage={r.usage} />
        </div>
      </Card>
      <Card>
        <CardHeader title="ประสิทธิภาพพลังงานรายคัน" sub="kWh/100 กม. — ยิ่งต่ำยิ่งดี" />
        <div className="chart lg">
          <EfficiencyChart usage={r.usage} />
        </div>
      </Card>
    </section>
  )
}
