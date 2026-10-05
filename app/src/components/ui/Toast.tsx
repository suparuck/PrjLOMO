'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type Tone = 'success' | 'error'
interface ToastItem {
  id: number
  text: string
  tone: Tone
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

/** แจ้งผลการทำงานมุมล่างขวา (role=status อ่านโดย screen reader) หายเองใน 5 วินาที */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((text: string, tone: Tone = 'success') => {
    const id = nextId.current++
    setItems((l) => [...l, { id, text, tone }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 5000)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === 'success' ? 'check' : 'alert'} size={18} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
