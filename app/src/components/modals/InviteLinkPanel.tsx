'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { formatDayTime } from '@/lib/time'

/** แสดงลิงก์คำเชิญที่ผู้ดูแลต้องนำไปส่งต่อเอง (ระบบยังไม่ส่งอีเมล) — โทเคนแสดงได้ครั้งเดียว */
export function InviteLinkPanel({ email, token, expiresAt }: { email: string; token: string; expiresAt: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/invite/${token}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      toast('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'error')
    }
  }

  return (
    <div className="banner" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <strong>ส่งลิงก์นี้ให้ {email} — จะแสดงครั้งเดียว</strong>
      <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{link}</code>
      <div className="flex wrap" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-light btn-sm" onClick={copy}>
          <Icon name={copied ? 'check' : 'download'} size={15} />
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
        </button>
        <span className="small">ใช้ได้ครั้งเดียว หมดอายุ {formatDayTime(expiresAt)} (7 วัน)</span>
      </div>
    </div>
  )
}
