/** ป้ายภาษาไทยที่ API ส่งกลับเพื่อให้กราฟแสดงผลได้ทันที */
export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

/** วันที่ 'YYYY-MM-DD' → ชื่อวันย่อ (คำนวณแบบ UTC เพื่อไม่ให้ timezone เลื่อนวัน) */
export const weekdayLabel = (day: string) => THAI_WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]
export const monthLabel = (month: string) => THAI_MONTHS[Number(month.slice(5, 7)) - 1]

export const EVENT_LABELS: Record<string, string> = {
  harsh_brake: 'เบรกแรง',
  speeding: 'ขับเร็วเกินกำหนด',
  harsh_accel: 'เร่งแรง',
  long_idle: 'จอดติดเครื่องนาน',
}
export const EVENT_ORDER = ['harsh_brake', 'speeding', 'harsh_accel', 'long_idle']
