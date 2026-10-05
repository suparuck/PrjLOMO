import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'

/** อ่านค่าสีจาก CSS token — ไม่ hardcode สีซ้ำใน JS */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export const chartColors = () => ({
  navy: cssVar('--navy-900'),
  blue: cssVar('--blue'),
  green: cssVar('--green'),
  amber: cssVar('--amber'),
  red: cssVar('--red'),
  ink: cssVar('--ink'),
  slate: cssVar('--slate'),
  muted: cssVar('--muted'),
  grid: cssVar('--line-2'),
  card: cssVar('--card'),
})

let ready = false
/** Chart.js defaults ตาม HANDOFF §2 */
export function setupChart() {
  if (ready) return
  ready = true
  Chart.register(
    ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale,
    DoughnutController, BarController, LineController, Filler, Legend, Tooltip,
  )
  const c = chartColors()
  Chart.defaults.font.family = cssVar('--font')
  Chart.defaults.font.size = 12
  Chart.defaults.color = c.muted
  Chart.defaults.plugins.legend.labels.boxWidth = 10
  Chart.defaults.plugins.legend.labels.boxHeight = 10
  Chart.defaults.plugins.legend.labels.usePointStyle = true
  Chart.defaults.plugins.tooltip.backgroundColor = c.ink
  Chart.defaults.plugins.tooltip.padding = 10
  Chart.defaults.plugins.tooltip.cornerRadius = 6
  Chart.defaults.scale.grid.color = cssVar('--chart-grid')
  // typings ของ Chart.js ไม่มี border บน defaults.scale แต่ค่านี้มีอยู่จริงตอนรัน
  ;(Chart.defaults.scale as unknown as { border: { display: boolean } }).border.display = false
  Chart.defaults.maintainAspectRatio = false
}
