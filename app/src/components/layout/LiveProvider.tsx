'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface LiveState {
  /** เพิ่มขึ้นทุกครั้งที่ข้อมูลในระบบเปลี่ยน (หรือสตรีมต่อกลับหลังหลุด) */
  version: number
  /** เวลาที่ข้อมูลล่าสุดถูกโหลด/อัปเดต — null ตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์/ก่อนเมานต์ (กัน hydration mismatch จากเวลา) */
  updatedAt: Date | null
  connected: boolean
}

const Ctx = createContext<LiveState>({ version: 0, updatedAt: null, connected: false })

/**
 * รับเหตุการณ์ "change" จาก API (Server-Sent Events) แล้วบอกให้หน้าที่ใช้ useAsync(..., { live: true }) โหลดข้อมูลใหม่
 * เหตุการณ์ไม่มีเนื้อข้อมูล — แต่ละหน้าโหลดเองตามสิทธิ์ของผู้ใช้ · EventSource ต่อใหม่เองเมื่อหลุด
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveState>({ version: 0, updatedAt: null, connected: false })
  const wasDown = useRef(false)

  // ตั้งเวลาเริ่มต้นหลังเมานต์ (ฝั่งเบราว์เซอร์เท่านั้น)
  useEffect(() => {
    setState((s) => ({ ...s, updatedAt: s.updatedAt ?? new Date() }))
  }, [])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/v1/stream')
    const bump = (connected = true) => setState((s) => ({ version: s.version + 1, updatedAt: new Date(), connected }))
    es.onopen = () => {
      setState((s) => ({ ...s, connected: true }))
      // ต่อกลับหลังหลุด: อาจพลาดเหตุการณ์ระหว่างนั้น จึงโหลดใหม่หนึ่งรอบ
      if (wasDown.current) bump()
      wasDown.current = false
    }
    es.onerror = () => {
      wasDown.current = true
      setState((s) => ({ ...s, connected: false }))
    }
    es.addEventListener('change', () => bump())
    return () => es.close()
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export const useLive = () => useContext(Ctx)
