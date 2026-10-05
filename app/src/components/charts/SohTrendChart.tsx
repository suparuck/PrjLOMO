'use client'

import { Line } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'

export function SohTrendChart({ labels, values }: { labels: string[]; values: number[] }) {
  setupChart()
  const c = chartColors()
  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: 'SoH เฉลี่ย',
            data: values,
            borderColor: c.green,
            backgroundColor: `${c.green}14`,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: c.card,
            borderWidth: 2,
          },
        ],
      }}
      options={{
        plugins: { legend: { display: false } },
        scales: { y: { min: 94, max: 98, ticks: { callback: (x) => `${x}%` } }, x: { grid: { display: false } } },
      }}
    />
  )
}
