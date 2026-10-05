'use client'

import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import type { Plugin } from 'chart.js'
import { chartColors, cssVar, setupChart } from '@/lib/chartSetup'
import type { ChargingLoad } from '@/types'

export function ChargingLoadChart({ load }: { load: ChargingLoad }) {
  setupChart()
  const c = chartColors()
  const { peakStart, peakEnd } = load

  // แรเงาช่วง On-Peak
  const peakBg = useMemo<Plugin<'bar'>>(
    () => ({
      id: 'peak',
      beforeDatasetsDraw(chart) {
        const { ctx: g, chartArea: a, scales } = chart
        const x = scales.x
        const half = x.width / 48
        const x1 = x.getPixelForValue(peakStart) - half
        const x2 = x.getPixelForValue(peakEnd - 1) + half
        g.save()
        g.fillStyle = `${cssVar('--slate')}1A`
        g.fillRect(x1, a.top, x2 - x1, a.bottom - a.top)
        g.restore()
      },
    }),
    [peakStart, peakEnd],
  )

  return (
    <Bar
      plugins={[peakBg]}
      data={{
        labels: load.hours,
        datasets: [
          {
            label: 'kW',
            data: load.kw,
            backgroundColor: load.hours.map((_, i) => (i >= peakStart && i < peakEnd ? c.amber : c.green)),
            borderRadius: 3,
          },
        ],
      }}
      options={{
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
          y: { beginAtZero: true, ticks: { callback: (x) => `${x} kW` } },
        },
      }}
    />
  )
}
