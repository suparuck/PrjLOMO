'use client'

import { Doughnut } from 'react-chartjs-2'
import { chartColors, setupChart } from '@/lib/chartSetup'

export function SocDonut({ counts, avg }: { counts: [number, number, number]; avg: number }) {
  setupChart()
  const c = chartColors()
  return (
    <div className="donut" style={{ margin: '0 auto' }}>
      <Doughnut
        data={{
          labels: ['สูง (≥70%)', 'กลาง (30–69%)', 'ต่ำ (<30%)'],
          datasets: [{ data: counts, backgroundColor: [c.green, c.amber, c.red], borderWidth: 3, borderColor: c.card }],
        }}
        options={{ cutout: '74%', plugins: { legend: { display: false } } }}
      />
      <div className="donut-center">
        <strong>{avg}%</strong>
        <span>เฉลี่ย</span>
      </div>
    </div>
  )
}
