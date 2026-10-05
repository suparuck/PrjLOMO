import type { Metadata } from 'next'
import { api } from '@/api'
import { CtaBand, DetailBlocks, Faq, Features, Hero, SiteFooter, SiteNav, StatsBand } from '@/components/landing/sections'
import { FALLBACK_OVERVIEW, SAMPLE_ICE, SAMPLE_SESSION, SAMPLE_SESSION_MODEL, SAMPLE_VEHICLE_ROWS } from '@/components/landing/sampleData'

export const metadata: Metadata = {
  title: 'EV Monitor — ระบบบริหารกองยานรถยนต์ไฟฟ้า',
  description: 'ติดตามแบตเตอรี่ การชาร์จ ตำแหน่ง และรายงานต้นทุน/คาร์บอนของกองยาน EV ในแพลตฟอร์มเดียว',
}

// ตัวเลขรวมดึงจาก API ตอนเปิดหน้า (ไม่ prerender ตอน build เพราะ API อาจยังไม่พร้อม)
export const dynamic = 'force-dynamic'

export default async function Landing() {
  // ตัวเลขรวมเท่านั้น (ไม่ต้องล็อกอิน) — ถ้า API ไม่ตอบ หน้ายังแสดงผลได้ด้วยค่าว่าง
  const o = await api.getPublicOverview().catch(() => FALLBACK_OVERVIEW)

  return (
    <div className="site">
      <SiteNav />
      <Hero online={o.onlineCount} total={o.vehicleCount} avgSoc={o.avgSoc} monthCo2={o.latestMonthCo2Tons} rows={SAMPLE_VEHICLE_ROWS} />
      <Features />
      <DetailBlocks
        ice={SAMPLE_ICE}
        session={SAMPLE_SESSION}
        sessionModel={SAMPLE_SESSION_MODEL}
        kpis={{
          co2Tons: o.yearCo2Tons,
          fuelSavingsK: Math.round(o.yearFuelSavings / 1000),
          weekKwh: o.weekKwh,
          efficiency: o.efficiency,
        }}
      />
      <StatsBand vehicleCount={o.vehicleCount} monthKwh={o.latestMonthKwh} />
      <Faq />
      <CtaBand />
      <SiteFooter />
    </div>
  )
}
