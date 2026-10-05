'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '../ui/Icon'

export function Topbar({
  title,
  sub,
  crumb,
  unread,
  onMenu,
}: {
  title: string
  sub?: string
  crumb?: { href: string; label: string; current: string }
  unread: number
  onMenu: () => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" aria-label="เมนู" onClick={onMenu}>
        <Icon name="menu" size={20} />
      </button>
      <div className="top-title">
        {crumb && (
          <p className="crumb">
            <Link href={crumb.href}>{crumb.label}</Link> / {crumb.current}
          </p>
        )}
        <h1>{title}</h1>
        {sub && <p className="top-sub">{sub}</p>}
      </div>
      <div className="top-actions">
        <label className="top-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="ค้นหารถ ทะเบียน หรือคนขับ…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/vehicles?q=${encodeURIComponent(q)}`)}
          />
        </label>
        <Link className="icon-btn" href="/alerts" aria-label="การแจ้งเตือน">
          <Icon name="bell" size={19} />
          {unread > 0 && <span className="dot-count">{unread}</span>}
        </Link>
        <div className="user-chip" tabIndex={0}>
          <span className="avatar">AE</span>
          <span className="user-meta">
            <strong>Admin EV</strong>
            <small>ผู้ดูแลระบบ</small>
          </span>
          <div className="user-menu">
            <Link href="/settings">
              <Icon name="settings" size={16} /> ตั้งค่าบัญชี
            </Link>
            <a
              href="/login"
              onClick={async (e) => {
                e.preventDefault()
                await fetch('/api/v1/auth/logout', { method: 'POST' })
                router.replace('/login')
                router.refresh()
              }}
            >
              <Icon name="logout" size={16} /> ออกจากระบบ
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
