'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api'
import type { Alert } from '@/types'

interface AlertsState {
  alerts: Alert[] | null
  unread: number
  acknowledge: (id: number) => Promise<void>
  acknowledgeAll: () => Promise<void>
}

const Ctx = createContext<AlertsState>({ alerts: null, unread: 0, acknowledge: async () => {}, acknowledgeAll: async () => {} })

/** เก็บรายการแจ้งเตือนร่วมกัน เพื่อให้ badge ใน Sidebar/Topbar อัปเดตทันทีเมื่อรับทราบ */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  useEffect(() => {
    api.listAlerts().then(setAlerts)
  }, [])
  const acknowledge = useCallback(async (id: number) => setAlerts(await api.acknowledgeAlert(id)), [])
  const acknowledgeAll = useCallback(async () => setAlerts(await api.acknowledgeAllAlerts()), [])
  const unread = alerts?.filter((a) => !a.acknowledged).length ?? 0
  return <Ctx.Provider value={{ alerts, unread, acknowledge, acknowledgeAll }}>{children}</Ctx.Provider>
}

export const useAlerts = () => useContext(Ctx)
