'use client'

import { Line } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'

export function SocLineChart({ labels, values }: { labels: string[]; values: number[] }) {
  setupChart()
  const c = chartColors()
  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: 'SoC %',
            data: values,
            borderColor: c.navy,
            backgroundColor: `${c.navy}14`,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      }}
      options={{
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (x) => `${x}%` } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        },
      }}
    />
  )
}
