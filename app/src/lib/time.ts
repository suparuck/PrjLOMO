/** แสดงเวลาจาก timestamp (ISO) เป็นภาษาไทยตามเขตเวลา Asia/Bangkok — ฐานข้อมูลเก็บเวลาเป็น UTC */
const TZ = 'Asia/Bangkok'
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour, mm: p.minute }
}

const dayNumber = (d: Date) => {
  const p = parts(d)
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000)
}

/** "10:05" */
export function formatClock(iso: string): string {
  const p = parts(new Date(iso))
  return `${p.hh}:${p.mm}`
}

/** "วันนี้ 06:10" / "เมื่อวาน 21:00" / "3 ต.ค. 14:20" */
export function formatDayTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const diff = dayNumber(now) - dayNumber(d)
  const clock = formatClock(iso)
  if (diff === 0) return `วันนี้ ${clock}`
  if (diff === 1) return `เมื่อวาน ${clock}`
  const p = parts(d)
  return `${p.d} ${MONTHS[p.m - 1]} ${clock}`
}

/** "5 นาทีที่แล้ว" / "1 ชม.ที่แล้ว" / "2 วันที่แล้ว" */
export function formatRelative(iso: string, now = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

/** "ม.ค. 2027" จากวันที่ 'YYYY-MM-DD' (ปี ค.ศ. ตามที่ใช้ในแอป) */
export function formatMonthYear(day: string): string {
  const [y, m] = day.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** จำนวนวันจากวันนี้ (เขตเวลาไทย) ถึงวันที่ 'YYYY-MM-DD' — ติดลบ = เลยกำหนดแล้ว */
export function daysUntil(day: string, now = new Date()): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000) - dayNumber(now)
}
