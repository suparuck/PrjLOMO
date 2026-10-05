'use client'

import { useEffect, useState } from 'react'
import { socClass } from '@/lib/status'

const COLOR = { good: 'var(--green)', mid: 'var(--amber)', bad: 'var(--danger)' } as const
const C = 377 // เส้นรอบวง r=60

export function SocGauge({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  return (
    <div className="v-gauge">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="60" fill="none" stroke="var(--line-2)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r="60"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
          style={{ stroke: COLOR[socClass(value)], transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="center">
        <strong>{value}%</strong>
        <span>แบตเตอรี่</span>
      </div>
    </div>
  )
}
