'use client'

import { useMemo, useRef } from 'react'
import { Bar } from 'react-chartjs-2'
import type { Plugin } from 'chart.js'
import { chartColors, setupChart } from '@/lib/chartSetup'
import { socClass } from '@/lib/status'
import type { Vehicle } from '@/types'

/** แท่งแนวนอนรายคัน (SoC % หรือระยะวิ่ง) พร้อมเส้นเกณฑ์ 30% เมื่อดู SoC */
export function BatteryBars({ vehicles, metric }: { vehicles: Vehicle[]; metric: 'soc' | 'range' }) {
  setupChart()
  const c = chartColors()
  const metricRef = useRef(metric)
  metricRef.current = metric

  const threshold = useMemo<Plugin<'bar'>>(
    () => ({
      id: 'threshold',
      afterDatasetsDraw(chart) {
        if (metricRef.current !== 'soc') return
        const x = chart.scales.x.getPixelForValue(30)
        const { top, bottom } = chart.chartArea
        const g = chart.ctx
        g.save()
        g.strokeStyle = chartColors().red
        g.setLineDash([4, 4])
        g.beginPath()
        g.moveTo(x, top)
        g.lineTo(x, bottom)
        g.stroke()
        g.restore()
      },
    }),
    [],
  )

  const color = (v: Vehicle) => ({ good: c.green, mid: c.amber, bad: c.red })[socClass(v.soc)]
  return (
    <Bar
      plugins={[threshold]}
      data={{
        labels: vehicles.map((v) => `${v.id} · ${v.model}`),
        datasets: [
          {
            data: vehicles.map((v) => v[metric]),
            backgroundColor: metric === 'soc' ? vehicles.map(color) : c.navy,
            borderRadius: 4,
            barThickness: 14,
          },
        ],
      }}
      options={{
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: {
            min: 0,
            max: metric === 'soc' ? 100 : undefined,
            ticks: { callback: (x) => (metric === 'soc' ? `${x}%` : `${x} กม.`) },
          },
          y: { grid: { display: false } },
        },
      }}
    />
  )
}
