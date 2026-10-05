import type { IconName } from '../ui/Icon'

export type NavItem = { group: string } | { key: string; label: string; href: string; icon: IconName; badge?: boolean }

export const NAV: NavItem[] = [
  { group: 'ภาพรวม' },
  { key: 'dashboard', label: 'แดชบอร์ด', href: '/dashboard', icon: 'dashboard' },
  { key: 'map', label: 'แผนที่สด', href: '/map', icon: 'map' },
  { key: 'alerts', label: 'การแจ้งเตือน', href: '/alerts', icon: 'bell', badge: true },
  { group: 'ยานพาหนะ' },
  { key: 'vehicles', label: 'รถทั้งหมด', href: '/vehicles', icon: 'car' },
  { key: 'battery', label: 'สถานะแบตเตอรี่', href: '/battery', icon: 'battery' },
  { key: 'charging', label: 'การชาร์จ', href: '/charging', icon: 'bolt' },
  { group: 'การจัดการ' },
  { key: 'drivers', label: 'พนักงานขับรถ', href: '/drivers', icon: 'users' },
  { key: 'reports', label: 'รายงาน', href: '/reports', icon: 'chart' },
  { key: 'settings', label: 'ตั้งค่า', href: '/settings', icon: 'settings' },
]

export const PAGE_META: Record<string, { title: string; sub?: string }> = {
  dashboard: { title: 'ภาพรวมกองยาน EV', sub: 'ติดตามรถยนต์ไฟฟ้าของคุณแบบเรียลไทม์' },
  map: { title: 'แผนที่สด', sub: 'ตำแหน่งรถและสถานีชาร์จแบบเรียลไทม์' },
  alerts: { title: 'การแจ้งเตือน', sub: 'เหตุการณ์จากรถ แบตเตอรี่ การชาร์จ และการขับขี่' },
  vehicles: { title: 'รถทั้งหมด', sub: 'จัดการและติดตามรถยนต์ไฟฟ้าทุกคันในกองยาน' },
  battery: { title: 'สถานะแบตเตอรี่', sub: 'ระดับแบต (SoC) สุขภาพแบต (SoH) และระยะวิ่งของทุกคัน' },
  charging: { title: 'การชาร์จ', sub: 'เซสชันการชาร์จ สถานี และค่าใช้จ่ายพลังงาน' },
  drivers: { title: 'พนักงานขับรถ', sub: 'คะแนนการขับแบบประหยัดพลังงานและความปลอดภัย' },
  reports: { title: 'รายงาน', sub: 'พลังงาน ต้นทุน คาร์บอน และความพร้อมเปลี่ยนเป็น EV' },
  settings: { title: 'ตั้งค่า', sub: 'องค์กร การแจ้งเตือน ผู้ใช้ และการเชื่อมต่อ' },
}
