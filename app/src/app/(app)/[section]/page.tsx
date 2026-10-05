import { notFound } from 'next/navigation'
import { PAGE_META } from '@/components/layout/navConfig'
import { Card } from '@/components/ui/Card'

const IMPLEMENTED = ['dashboard', 'vehicles', 'map', 'battery', 'charging', 'drivers', 'alerts']
const SECTIONS = Object.keys(PAGE_META).filter((k) => !IMPLEMENTED.includes(k))

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }))
}

export const dynamicParams = false

/** หน้าที่ยังไม่ได้ทำ — จะทยอยแทนที่ตามเฟส 4–6 ของ HANDOFF */
export default function ComingSoon({ params }: { params: { section: string } }) {
  const meta = PAGE_META[params.section]
  if (!meta) notFound()
  return (
    <Card>
      <div className="empty">
        <h3>{meta.title}</h3>
        <p>หน้านี้กำลังพัฒนา — จะเพิ่มในเฟสถัดไป</p>
      </div>
    </Card>
  )
}
