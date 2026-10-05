import type { Metadata } from 'next'
import { api } from '@/api'
import { CtaBand, DetailBlocks, Faq, Features, Hero, SiteFooter, SiteNav, StatsBand } from '@/components/landing/sections'

export const metadata: Metadata = {
  title: 'EV Monitor — ระบบบริหารกองยานรถยนต์ไฟฟ้า',
  description: 'ติดตามแบตเตอรี่ การชาร์จ ตำแหน่ง และรายงานต้นทุน/คาร์บอนของกองยาน EV ในแพลตฟอร์มเดียว',
}

/** Landing — ตัวเลขในส่วนโชว์สินค้าดึงจาก API เดียวกับแอป เพื่อให้ตรงกันทุกหน้า */
export default async function Landing() {
  const [vehicles, ice, sessions, sustain, energy, sep] = await Promise.all([
    api.listVehicles(),
    api.listIceVehicles(),
    api.listChargingSessions(),
    api.getSustainability(),
    api.getEnergySummary(),
    api.getReport({ period: 'sep', brand: 'all' }),
  ])
  const session = sessions[0]

  return (
    <div className="site">
      <SiteNav />
      <Hero vehicles={vehicles} monthCo2={sep.carbon.avoidedTons} />
      <Features />
      <DetailBlocks
        ice={ice}
        session={session}
        sessionModel={vehicles.find((v) => v.id === session.vehicleId)?.model ?? ''}
        kpis={{
          co2Tons: sustain.co2Tons,
          fuelSavingsK: Math.round(sustain.fuelSavings / 1000),
          weekKwh: energy.totalKwh,
          efficiency: energy.efficiency,
        }}
      />
      <StatsBand vehicleCount={vehicles.length} monthKwh={sep.totals.kwh} />
      <Faq />
      <CtaBand />
      <SiteFooter />
    </div>
  )
}
