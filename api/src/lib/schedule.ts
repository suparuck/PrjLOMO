export type Frequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduleRule {
  frequency: Frequency
  /** 0 = อาทิตย์ … 6 = เสาร์ (weekly) */
  weekday: number | null
  /** 1–28 (monthly) */
  monthDay: number | null
  /** ชั่วโมงเวลาไทย 0–23 */
  hour: number
}

const TH_OFFSET_MS = 7 * 3600_000 // ไทยไม่มี DST — เลื่อนคงที่ +7 ชม.

/** เวลาส่งถัดไปหลังจาก `after` (เวลาไทย, นาที/วินาทีเป็น 0) — คืนเป็นเวลาสากล */
export function nextRun(rule: ScheduleRule, after: Date): Date {
  const local = new Date(after.getTime() + TH_OFFSET_MS) // อ่านด้วยเมธอด getUTC* = นาฬิกาไทย
  for (let d = 0; d <= 62; d++) {
    const c = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d, rule.hour, 0, 0))
    const ok =
      rule.frequency === 'daily' ||
      (rule.frequency === 'weekly' && c.getUTCDay() === rule.weekday) ||
      (rule.frequency === 'monthly' && c.getUTCDate() === rule.monthDay)
    if (ok && c.getTime() > local.getTime()) return new Date(c.getTime() - TH_OFFSET_MS)
  }
  throw new Error('คำนวณเวลาส่งถัดไปไม่ได้') // ไม่ควรเกิด: กฎที่ผ่านการตรวจมีวันตรงภายใน 62 วันเสมอ
}
