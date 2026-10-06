'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PAGE_META } from './navConfig'
import { PageHeaderSetter, type PageHeader } from './PageHeader'
import { AlertsProvider, useAlerts } from './AlertsProvider'
import { LiveProvider, useLive } from './LiveProvider'
import Link from 'next/link'
import { ToastProvider } from '@/components/ui/Toast'

/** หน้าที่ใช้พื้นที่เต็มจอ (ไม่มี padding และ footer) */
const FULL_BLEED = ['/map']

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <AlertsProvider>
        <ToastProvider>
          <Shell>{children}</Shell>
        </ToastProvider>
      </AlertsProvider>
    </LiveProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [override, setOverride] = useState<PageHeader | null>(null)
  const pathname = usePathname() ?? ''
  const { unread } = useAlerts()
  const { updatedAt, connected } = useLive()
  const { data: org } = useAsync(() => api.getOrg())
  // ผู้ดูแลระบบ: เตือนถ้ายังมีบัญชีที่ใช้รหัสผ่านตั้งต้นของข้อมูลเดโม (เรียกเฉพาะ admin — คนอื่นได้ 403)
  const { data: me } = useAsync(() => api.getMe())
  const { data: sec } = useAsync(() => (me?.role === 'admin' ? api.getSecurityStatus() : Promise.resolve(null)), [me?.role], { live: true })
  const weak = sec?.defaultPasswordUsers ?? []
  const selfWeak = weak.some((u) => u.id === me?.id)
  const meta: PageHeader = override ?? PAGE_META[pathname.split('/')[1]] ?? { title: '' }
  const full = FULL_BLEED.includes(pathname)

  useEffect(() => setNavOpen(false), [pathname])
  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen)
    return () => document.body.classList.remove('nav-open')
  }, [navOpen])
  useEffect(() => {
    document.title = meta.title ? `${meta.title} — EV Monitor` : 'EV Monitor'
  }, [meta.title])

  return (
    <PageHeaderSetter.Provider value={setOverride}>
      <div className="shell">
        <Sidebar unread={unread} city={org?.city ?? ''} onNavigate={() => setNavOpen(false)} />
        <div className="main">
          <Topbar title={meta.title} sub={meta.sub} crumb={meta.crumb} unread={unread} onMenu={() => setNavOpen((o) => !o)} />
          {full ? (
            children
          ) : (
            <>
              <main className="content">
                {weak.length > 0 && (
                  <div className="banner warn" role="alert">
                    <div className="small">
                      <strong>{selfWeak ? 'บัญชีของคุณยังใช้รหัสผ่านตั้งต้นของระบบ' : `มี ${weak.length} บัญชีที่ยังใช้รหัสผ่านตั้งต้นของระบบ`}</strong>
                      {' — '}
                      ใครรู้รหัสเดโมก็เข้าได้ ควรเปลี่ยนรหัสผ่าน ปิดบัญชีเดโม หรือสร้างผู้ดูแลจริงก่อนเปิดให้ผู้ใช้จริง ({weak.map((u) => u.email).join(', ')})
                    </div>
                    <Link className="btn btn-outline btn-sm" href={selfWeak ? '/account' : '/settings#users'}>
                      {selfWeak ? 'เปลี่ยนรหัสผ่านตอนนี้' : 'ไปที่ผู้ใช้และสิทธิ์'}
                    </Link>
                  </div>
                )}
                {children}
              </main>
              <footer className="app-foot">
                <span>
                  <i className={`live-dot${connected ? ' on' : ''}`} aria-hidden="true" />
                  {connected ? 'เรียลไทม์' : 'ออฟไลน์'}
                  {updatedAt && ` · อัปเดตล่าสุด ${updatedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.`}
                </span>
                <span>© 2026 EV Monitor Dashboard</span>
              </footer>
            </>
          )}
        </div>
        <div className="scrim" onClick={() => setNavOpen(false)} />
      </div>
    </PageHeaderSetter.Provider>
  )
}
