'use client'

import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { chartColors, cssVar, setupChart } from '@/lib/chartSetup'
import { fmt } from '@/lib/format'
import type { ElectrificationReport, Report } from '@/types'

export function MonthlyEnergyChart({ report }: { report: Report }) {
  setupChart()
  const c = chartColors()
  return (
    <Bar
      data={{
        labels: report.labels,
        datasets: [
          { label: 'Depot', data: report.kwhDepot, backgroundColor: c.navy, borderRadius: 4, stack: 'a', maxBarThickness: 36 },
          { label: 'สาธารณะ', data: report.kwhPublic, backgroundColor: c.green, borderRadius: 4, stack: 'a', maxBarThickness: 36 },
        ],
      }}
      options={{
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (x) => fmt(Number(x)) } } },
      }}
    />
  )
}

export function CostMixDonut({ mix }: { mix: Report['costMix'] }) {
  setupChart()
  const c = chartColors()
  const colors = [c.navy, cssVar('--navy-700'), c.green, `${c.green}80`]
  return (
    <Doughnut
      data={{
        labels: mix.map((m) => m.label),
        datasets: [{ data: mix.map((m) => m.pct), backgroundColor: colors, borderWidth: 3, borderColor: c.card }],
      }}
      options={{ cutout: '60%', plugins: { legend: { position: 'bottom' } } }}
    />
  )
}

export function Co2Chart({ labels, values }: { labels: string[]; values: number[] }) {
  setupChart()
  const c = chartColors()
  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: 'ตัน CO₂e',
            data: values,
            borderColor: c.green,
            backgroundColor: `${c.green}1A`,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: c.card,
            borderWidth: 2,
          },
        ],
      }}
      options={{ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }}
    />
  )
}

export function PerKmChart({ data }: { data: Report['perKm'] }) {
  setupChart()
  const c = chartColors()
  const colors = [c.slate, c.slate, c.amber, c.green, `${c.green}B3`]
  return (
    <Bar
      data={{ labels: data.map((d) => d.label), datasets: [{ data: data.map((d) => d.grams), backgroundColor: colors, borderRadius: 4, maxBarThickness: 40 }] }}
      options={{ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (x) => `${x} g` } } } }}
    />
  )
}

export function TcoChart({ tco }: { tco: ElectrificationReport['tco'] }) {
  setupChart()
  const c = chartColors()
  return (
    <Bar
      data={{
        labels: tco.labels,
        datasets: [
          { label: tco.iceName, data: tco.ice, backgroundColor: c.slate, borderRadius: 4, maxBarThickness: 28 },
          { label: tco.evName, data: tco.ev, backgroundColor: c.green, borderRadius: 4, maxBarThickness: 28 },
        ],
      }}
      options={{
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: (x) => `฿${fmt(Number(x) / 1000)}K` } } },
      }}
    />
  )
}

export function UtilizationChart({ usage }: { usage: Report['usage'] }) {
  setupChart()
  const c = chartColors()
  return (
    <Bar
      data={{
        labels: usage.map((u) => u.id),
        datasets: [{ label: '% การใช้งาน', data: usage.map((u) => u.utilization), backgroundColor: c.navy, borderRadius: 4 }],
      }}
      options={{
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { max: 100, ticks: { callback: (x) => `${x}%` } }, y: { grid: { display: false } } },
      }}
    />
  )
}

/** kWh/100 กม. ยิ่งต่ำยิ่งดี: <14 เขียว, <15.5 เหลือง, นอกนั้นแดง */
export function EfficiencyChart({ usage }: { usage: Report['usage'] }) {
  setupChart()
  const c = chartColors()
  const sorted = [...usage].sort((a, b) => a.efficiency - b.efficiency)
  return (
    <Bar
      data={{
        labels: sorted.map((u) => u.id),
        datasets: [
          {
            data: sorted.map((u) => u.efficiency),
            backgroundColor: sorted.map((u) => (u.efficiency < 14 ? c.green : u.efficiency < 15.5 ? c.amber : c.red)),
            borderRadius: 4,
          },
        ],
      }}
      options={{ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 10 }, y: { grid: { display: false } } } }}
    />
  )
}
