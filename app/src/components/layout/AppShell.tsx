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

/** หน้าที่ใช้พื้นที่เต็มจอ (ไม่มี padding และ footer) */
const FULL_BLEED = ['/map']

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AlertsProvider>
      <Shell>{children}</Shell>
    </AlertsProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [override, setOverride] = useState<PageHeader | null>(null)
  const pathname = usePathname() ?? ''
  const { unread } = useAlerts()
  const { data: org } = useAsync(() => api.getOrg())
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
              <main className="content">{children}</main>
              <footer className="app-foot">
                <span>อัปเดตล่าสุด: วันนี้ 10:30 น.</span>
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
