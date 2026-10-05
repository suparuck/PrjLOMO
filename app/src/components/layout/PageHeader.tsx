'use client'

import { createContext, useContext, useEffect } from 'react'

export interface PageHeader {
  title: string
  sub?: string
  crumb?: { href: string; label: string; current: string }
}

export const PageHeaderSetter = createContext<(h: PageHeader | null) => void>(() => {})

/** ให้หน้าที่ชื่อขึ้นกับข้อมูล (เช่น รายละเอียดรถ) กำหนดหัวเรื่องของ Topbar */
export function usePageHeader(h: PageHeader | null) {
  const set = useContext(PageHeaderSetter)
  const key = h ? `${h.title}|${h.sub ?? ''}|${h.crumb?.current ?? ''}` : ''
  useEffect(() => {
    set(h)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
