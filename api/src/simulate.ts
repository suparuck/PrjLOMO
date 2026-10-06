/**
 * ตัวจำลอง telemetry สำหรับเดโม/พัฒนา — ส่งข้อมูลของรถที่ยัง "ออนไลน์" เข้า /ingest/telemetry เป็นระยะ
 * เพื่อให้รถเดโมไม่กลายเป็นออฟไลน์เมื่อ job ตรวจออฟไลน์ทำงาน และเห็นการอัปเดตสด (ระดับแบต ตำแหน่ง แจ้งเตือนอัตโนมัติ)
 *
 * ไม่ใช่ส่วนหนึ่งของระบบจริง: รันเฉพาะเมื่อต้องการ (docker compose --profile demo up -d simulator)
 * ค่าเริ่มต้น: รถที่ออฟไลน์อยู่แล้วจะไม่ถูกจำลอง (ยังคงเป็นออฟไลน์) — ตั้ง SIM_REVIVE=true เพื่อให้ส่งข้อมูลของรถทุกคัน (ปลุกรถออฟไลน์ให้กลับมา; สถานะคำนวณใหม่ตามข้อมูลที่ส่ง)
 * ส่งผ่าน API จริงด้วย X-API-Key เหมือนอุปกรณ์จริง
 */
import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL
const apiUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const apiKey = process.env.INGEST_API_KEY
const everySeconds = Number(process.env.SIM_INTERVAL_SECONDS ?? 30)
const revive = process.env.SIM_REVIVE === 'true'

if (!databaseUrl || !apiKey) {
  console.error('ต้องตั้งค่า DATABASE_URL และ INGEST_API_KEY')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 })
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

interface V {
  id: string
  soc: number
  speed_kmh: number
  lat: number
  lng: number
  status: string
  odometer_km: number
}

function step(v: V) {
  let { soc, speed_kmh: speed, lat, lng, odometer_km: odo } = v
  if (v.status === 'charging') {
    speed = 0
    if (Math.random() < 0.5) soc = Math.min(100, soc + 1)
  } else if (speed > 0) {
    // กำลังเคลื่อนที่ (รวมรถแบตต่ำที่ยังวิ่ง): ความเร็วแกว่ง ตำแหน่งเลื่อนเล็กน้อย แบตลดลงช้า ๆ
    speed = Math.round(clamp(speed + rand(-8, 8), 20, 85))
    if (Math.random() < 0.25) soc = Math.max(10, soc - 1)
    lat += rand(-0.0008, 0.0008)
    lng += rand(-0.0008, 0.0008)
    odo += Math.round((speed * everySeconds) / 3600)
  }
  return {
    vehicleId: v.id,
    soc,
    speedKmh: speed,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    odometerKm: odo,
    batteryTempC: Math.round(rand(28, 36) * 10) / 10,
  }
}

async function tick() {
  const { rows } = await pool.query<V>(
    `select id, soc, speed_kmh, lat, lng, status, odometer_km from vehicles ${revive ? '' : "where status <> 'offline'"} order by id`,
  )
  if (rows.length === 0) return console.log(JSON.stringify({ msg: 'ไม่มีรถออนไลน์ให้จำลอง' }))
  const res = await fetch(`${apiUrl}/api/v1/ingest/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey! },
    body: JSON.stringify({ readings: rows.map(step) }),
  })
  const body = (await res.json().catch(() => null)) as { accepted?: number; rejected?: unknown[] } | null
  console.log(JSON.stringify({ msg: 'sent', status: res.status, vehicles: rows.length, accepted: body?.accepted, rejected: body?.rejected?.length }))
}

async function main() {
  console.log(JSON.stringify({ msg: 'simulator started', apiUrl, everySeconds, revive }))
  for (;;) {
    try {
      await tick()
    } catch (e) {
      console.error(JSON.stringify({ msg: 'tick failed', error: String(e) }))
    }
    await new Promise((r) => setTimeout(r, everySeconds * 1000))
  }
}
void main()
