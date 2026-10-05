'use client'

import { Bar } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'
import type { BatteryInsights } from '@/types'

export function RangeModelChart({ data }: { data: BatteryInsights['modelRanges'] }) {
  setupChart()
  const c = chartColors()
  return (
    <Bar
      data={{
        labels: data.map((d) => d.model),
        datasets: [
          { label: 'ใช้งานจริง', data: data.map((d) => d.actual), backgroundColor: c.navy, borderRadius: 4, maxBarThickness: 18 },
          { label: 'ตามสเปก', data: data.map((d) => d.spec), backgroundColor: c.grid, borderRadius: 4, maxBarThickness: 18 },
        ],
      }}
      options={{
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } },
          y: { ticks: { callback: (x) => `${x} กม.` } },
        },
      }}
    />
  )
}
