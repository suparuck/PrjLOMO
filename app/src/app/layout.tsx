import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import '@/styles/tokens.css'
import '@/styles/global.css'

// ฟอนต์ถูกดาวน์โหลดตอน build แล้วเสิร์ฟจากเซิร์ฟเวอร์เราเอง — ไม่เรียก Google ตอนใช้งาน (CSP font-src 'self' และไม่ส่งข้อมูลผู้ใช้ให้ภายนอก)
const plex = IBM_Plex_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-plex' })

export const metadata: Metadata = {
  title: 'EV Monitor',
  description: 'ระบบติดตามและบริหารจัดการกองยานรถยนต์ไฟฟ้า',
}

// CSP แบบ nonce (src/proxy.ts) ต้องสร้าง nonce ใหม่ทุกคำขอ จึงห้าม prerender หน้าเป็นไฟล์คงที่ — ไม่เช่นนั้นสคริปต์ของ Next จะไม่มี nonce แล้วถูกเบราว์เซอร์บล็อก
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={plex.variable}>
      <body>{children}</body>
    </html>
  )
}
