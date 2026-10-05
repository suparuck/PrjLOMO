'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '../ui/Icon'
import { NAV } from './navConfig'

export function Sidebar({ unread, city, onNavigate }: { unread: number; city: string; onNavigate: () => void }) {
  const pathname = usePathname() ?? ''
  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard" onClick={onNavigate}>
        <span className="brand-mark">
          <Icon name="bolt" size={20} />
        </span>
        <span className="brand-text">
          <strong>EV Monitor</strong>
          <small>Fleet Management</small>
        </span>
      </Link>
      <nav className="side-nav">
        {NAV.map((n) =>
          'group' in n ? (
            <p key={n.group} className="side-group">
              {n.group}
            </p>
          ) : (
            <Link
              key={n.key}
              href={n.href}
              className={`side-link${pathname === n.href || pathname.startsWith(n.href + '/') ? ' active' : ''}`}
              onClick={onNavigate}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.badge && unread > 0 && <em className="side-badge">{unread}</em>}
            </Link>
          ),
        )}
      </nav>
      <div className="side-foot">
        <Link className="side-help" href="/settings#support" onClick={onNavigate}>
          <Icon name="help" size={20} />
          <span>
            <strong>ต้องการความช่วยเหลือ?</strong>
            <small>ติดต่อทีมซัพพอร์ต 24/7</small>
          </span>
        </Link>
        <p className="side-version">EV Monitor v2.0 · {city}</p>
      </div>
    </aside>
  )
}
