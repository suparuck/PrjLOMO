import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import type { PublicOverview } from '@/types'

/** แผงซ้ายของหน้าก่อนเข้าสู่ระบบ (Login / ตอบรับคำเชิญ) — ตัวเลขรวมเท่านั้น null = ดึงจาก API ไม่ได้ */
export function AuthArt({ overview: o }: { overview: PublicOverview | null }) {
  return (
    <aside className="auth-art">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <Icon name="bolt" size={20} />
        </span>
        <span className="brand-text">
          <strong>EV Monitor</strong>
          <small>Fleet Management</small>
        </span>
      </Link>
      <div>
        <h2>ทุกคันในกองยาน EV ของคุณ อยู่ในสายตาตลอดเวลา</h2>
        <p>ติดตามแบตเตอรี่ การชาร์จ และตำแหน่งแบบเรียลไทม์ พร้อมรายงานต้นทุนและคาร์บอนในที่เดียว</p>
        <div className="grid g-2" style={{ marginTop: 32, maxWidth: 460 }}>
          <div className="mock-kpi">
            <span>รถออนไลน์ตอนนี้</span>
            <b>{o ? `${o.onlineCount} / ${o.vehicleCount}` : '–'}</b>
          </div>
          <div className="mock-kpi">
            <span>กำลังชาร์จ</span>
            <b className="accent">{o ? o.chargingCount : '–'} คัน</b>
          </div>
        </div>
      </div>
      <p className="small foot-note">© 2026 EV Monitor · เชียงใหม่</p>
    </aside>
  )
}
