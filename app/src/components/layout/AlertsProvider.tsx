'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api'
import { useLive } from './LiveProvider'
import type { Alert } from '@/types'

interface AlertsState {
  alerts: Alert[] | null
  error: Error | null
  unread: number
  acknowledge: (id: number) => Promise<void>
  acknowledgeAll: () => Promise<void>
}

const Ctx = createContext<AlertsState>({ alerts: null, error: null, unread: 0, acknowledge: async () => {}, acknowledgeAll: async () => {} })

/** เก็บรายการแจ้งเตือนร่วมกัน เพื่อให้ badge ใน Sidebar/Topbar อัปเดตทันทีเมื่อรับทราบ */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const { version } = useLive()
  // โหลดครั้งแรก และโหลดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน (badge แจ้งเตือนอัปเดตเอง) — โหลดซ้ำพลาดไม่ล้มหน้า
  useEffect(() => {
    api.listAlerts().then(setAlerts, (e) => version === 0 && setError(e))
  }, [version])
  const acknowledge = useCallback(async (id: number) => setAlerts(await api.acknowledgeAlert(id)), [])
  const acknowledgeAll = useCallback(async () => setAlerts(await api.acknowledgeAllAlerts()), [])
  const unread = alerts?.filter((a) => !a.acknowledged).length ?? 0
  return <Ctx.Provider value={{ alerts, error, unread, acknowledge, acknowledgeAll }}>{children}</Ctx.Provider>
}

export const useAlerts = () => useContext(Ctx)
