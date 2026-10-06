import type { ReportBrand, ReportPeriod } from '@/types'

export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  year: 'ปี 2026 (ม.ค. – ต.ค.)',
  q3: 'ไตรมาส 3/2026',
  sep: 'เดือน ก.ย. 2026',
}
export const brandLabel = (b: ReportBrand) => (b === 'all' ? 'รถทุกคัน' : `เฉพาะ ${b}`)

/**
 * ดาวน์โหลดรายงานเป็น Excel — ไฟล์สร้างที่ API (GET /reports/export) ชุดเดียวกับที่แนบในอีเมลรายงานตามเวลา
 * kind=report: รายงานเต็ม · kind=esg: ข้อมูลรายงานความยั่งยืน
 */
export async function downloadReportXlsx(kind: 'report' | 'esg', { period, brand }: { period: ReportPeriod; brand: ReportBrand }) {
  const res = await fetch(`/api/v1/reports/export?kind=${kind}&period=${period}&brand=${encodeURIComponent(brand)}`, { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401) window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`
    throw new Error(`ส่งออกไม่สำเร็จ (${res.status})`)
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `ev-monitor-${kind}.xlsx`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
