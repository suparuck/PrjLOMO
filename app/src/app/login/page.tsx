import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { LoginForm } from './LoginForm'
import { api } from '@/api'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ — EV Monitor' }

export default async function LoginPage() {
  const [vehicles, sessions] = await Promise.all([api.listVehicles(), api.listChargingSessions()])
  const online = vehicles.filter((v) => v.status !== 'offline').length

  return (
    <div className="auth">
      <aside className="auth-art">
        <Link className="brand" href="/" style={{ border: 0, padding: 0 }}>
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
            <div className="mock-kpi" style={{ background: 'rgba(255,255,255,.06)', borderColor: 'rgba(255,255,255,.1)' }}>
              <span style={{ color: 'var(--faint)' }}>รถออนไลน์ตอนนี้</span>
              <b style={{ color: '#fff' }}>
                {online} / {vehicles.length}
              </b>
            </div>
            <div className="mock-kpi" style={{ background: 'rgba(255,255,255,.06)', borderColor: 'rgba(255,255,255,.1)' }}>
              <span style={{ color: 'var(--faint)' }}>กำลังชาร์จ</span>
              <b style={{ color: 'var(--green)' }}>{sessions.length} คัน</b>
            </div>
          </div>
        </div>
        <p className="small" style={{ color: 'var(--faint)' }}>
          © 2026 EV Monitor · เชียงใหม่
        </p>
      </aside>

      <main className="auth-form">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  )
}
