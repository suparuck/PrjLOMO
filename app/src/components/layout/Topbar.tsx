'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { USER_ROLES } from '@/lib/validators'
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
  const { data: me } = useAsync(() => api.getMe())
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
          <span className="avatar">{me ? me.name.slice(0, 2).toUpperCase() : ''}</span>
          <span className="user-meta">
            <strong>{me?.name ?? ''}</strong>
            <small>{me ? USER_ROLES[me.role].label : ''}</small>
          </span>
          <div className="user-menu">
            <Link href="/account">
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
