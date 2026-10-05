'use client'

import { Bar } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'
import type { EnergyWeek } from '@/types'

export function EnergyChart({ week, metric }: { week: EnergyWeek; metric: 'kwh' | 'cost' }) {
  setupChart()
  const c = chartColors()
  return (
    <Bar
      data={{
        labels: week.labels,
        datasets: [
          {
            label: metric === 'kwh' ? 'พลังงาน (kWh)' : 'ค่าใช้จ่าย (฿)',
            data: week[metric],
            backgroundColor: metric === 'kwh' ? c.navy : c.green,
            borderRadius: 6,
            maxBarThickness: 34,
          },
        ],
      }}
      options={{ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }}
    />
  )
}
