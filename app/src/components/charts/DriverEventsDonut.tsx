'use client'

import { useEffect, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'
import type { DriverEventStat } from '@/types'

export function DriverEventsDonut({ events }: { events: DriverEventStat[] }) {
  setupChart()
  const c = chartColors()
  // จอแคบ: ย้าย legend ลงล่างเพื่อไม่ให้โดนัทถูกบีบ
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return (
    <Doughnut
      data={{
        labels: events.map((e) => e.label),
        datasets: [
          { data: events.map((e) => e.count), backgroundColor: [c.red, c.amber, c.navy, c.slate], borderWidth: 3, borderColor: c.card },
        ],
      }}
      options={{ cutout: '62%', plugins: { legend: { position: narrow ? 'bottom' : 'right' } } }}
    />
  )
}
