import type { VehicleStatus } from '../types'

export const STATUS: Record<VehicleStatus, { th: string; cls: string }> = {
  driving: { th: 'กำลังขับ', cls: 's-driving' },
  charging: { th: 'กำลังชาร์จ', cls: 's-charging' },
  parked: { th: 'จอดอยู่', cls: 's-parked' },
  low: { th: 'แบตต่ำ', cls: 's-low' },
  offline: { th: 'ออฟไลน์', cls: 's-offline' },
}

/** เกณฑ์แบต: ≥70 ดี, 30–69 ปานกลาง, <30 ต่ำ */
export const socClass = (v: number) => (v >= 70 ? 'good' : v >= 30 ? 'mid' : 'bad')
