/**
 * ชื่อแสดงผล/หมวดของเหตุการณ์ใน audit log — คีย์คือ `auth.*` (เหตุการณ์ที่ระบบบันทึกเอง) หรือ "METHOD /เส้นทาง" (ทุกคำขอที่แก้ข้อมูลสำเร็จ)
 * เหตุการณ์ที่ไม่มีในตารางนี้ยังถูกบันทึก (หมวด data, ชื่อ = คีย์ดิบ) จึงไม่มีการแก้ข้อมูลที่หลุดบันทึก
 */
export type AuditCategory = 'security' | 'users' | 'config' | 'data'

export const AUDIT_CATEGORIES: Record<AuditCategory, string> = {
  security: 'ความปลอดภัย',
  users: 'ผู้ใช้และสิทธิ์',
  config: 'การตั้งค่า',
  data: 'ข้อมูลกองยาน',
}

const L: Record<string, [AuditCategory, string]> = {
  'auth.login': ['security', 'เข้าสู่ระบบ'],
  'auth.login_failed': ['security', 'เข้าสู่ระบบไม่สำเร็จ (รหัสผ่านผิด)'],
  'auth.login_blocked': ['security', 'ถูกบล็อกชั่วคราวจากการเดารหัสผ่าน'],
  'auth.2fa_failed': ['security', 'ยืนยัน 2FA ไม่สำเร็จ'],
  'auth.new_network_alert_sent': ['security', 'ส่งอีเมลเตือนเจ้าของบัญชี (เข้าจากเครือข่ายใหม่)'],
  'auth.login_alert_sent': ['security', 'ส่งอีเมลเตือนเจ้าของบัญชี (ล็อกอินผิดซ้ำ)'],
  'auth.invite_accept': ['users', 'ตอบรับคำเชิญและตั้งรหัสผ่าน'],
  'auth.reset_accept': ['security', 'ตั้งรหัสผ่านใหม่ผ่านลิงก์รีเซ็ต'],
  'POST /auth/change-password': ['security', 'เปลี่ยนรหัสผ่านของตัวเอง'],
  'PUT /auth/notifications': ['security', 'เปลี่ยนการตั้งค่าแจ้งเตือนทางอีเมลของตัวเอง'],
  'POST /auth/2fa/enable': ['security', 'เปิดใช้ 2FA'],
  'POST /auth/2fa/disable': ['security', 'ปิด 2FA ของตัวเอง'],
  'POST /auth/2fa/recovery-codes': ['security', 'สร้างรหัสสำรอง 2FA ใหม่'],
  'POST /users/:id/2fa-reset': ['security', 'รีเซ็ต 2FA ของผู้ใช้'],
  'PUT /security/2fa-policy': ['security', 'ตั้งค่าการบังคับ 2FA ของผู้ดูแล'],
  'POST /users/:id/reset-link': ['security', 'สร้างลิงก์รีเซ็ตรหัสผ่านให้ผู้ใช้'],
  'POST /api-keys': ['security', 'สร้าง API key'],
  'DELETE /api-keys/:id': ['security', 'เพิกถอน API key'],
  'POST /users/invite': ['users', 'เชิญผู้ใช้'],
  'PATCH /users/:id': ['users', 'แก้ไขผู้ใช้ (ชื่อ/บทบาท/สถานะ)'],
  'DELETE /users/:id': ['users', 'ยกเลิกคำเชิญ'],
  'POST /users/:id/invite-link': ['users', 'สร้างลิงก์คำเชิญใหม่'],
  'PUT /settings': ['config', 'แก้ไขการตั้งค่าระบบ'],
  'PATCH /alert-rules/:key': ['config', 'แก้ไขกฎการแจ้งเตือน'],
  'PUT /report-config': ['config', 'แก้ไขสมมติฐานของรายงาน'],
  'PUT /tco': ['config', 'แก้ไขรายการ TCO'],
  'POST /integrations/line/test': ['config', 'ส่งข้อความทดสอบเข้า LINE'],
  'POST /report-schedules': ['config', 'ตั้งเวลาส่งรายงาน'],
  'PUT /report-schedules/:id': ['config', 'แก้ไขการตั้งเวลาส่งรายงาน'],
  'DELETE /report-schedules/:id': ['config', 'ลบการตั้งเวลาส่งรายงาน'],
  'POST /report-schedules/:id/send-now': ['config', 'ส่งรายงานทันที'],
  'POST /vehicles': ['data', 'เพิ่มรถ'],
  'PATCH /vehicles/:id': ['data', 'แก้ไขรถ'],
  'POST /vehicles/:id/maintenance': ['data', 'เพิ่มรายการซ่อมบำรุง'],
  'POST /maintenance/:id/complete': ['data', 'ปิดงานซ่อมบำรุง'],
  'POST /drivers': ['data', 'เพิ่มคนขับ'],
  'PATCH /drivers/:id': ['data', 'แก้ไขคนขับ'],
  'POST /stations': ['data', 'เพิ่มสถานีชาร์จ'],
  'PATCH /stations/:id': ['data', 'แก้ไขสถานีชาร์จ'],
  'DELETE /stations/:id': ['data', 'ลบสถานีชาร์จ'],
  'POST /ice-vehicles': ['data', 'เพิ่มรถสันดาป'],
  'PATCH /ice-vehicles/:id': ['data', 'แก้ไขรถสันดาป'],
  'DELETE /ice-vehicles/:id': ['data', 'ลบรถสันดาป'],
  'PATCH /charging/sessions/:vehicleId/target': ['data', 'เปลี่ยนเป้าหมายการชาร์จ'],
  'POST /charging/sessions/:vehicleId/stop': ['data', 'หยุดการชาร์จ'],
}

export const describeAudit = (action: string): { category: AuditCategory; label: string } => {
  const x = L[action]
  return x ? { category: x[0], label: x[1] } : { category: 'data', label: action }
}

/** รายชื่อ action ในหมวดหนึ่ง (ใช้กรอง) — หมวด data รวมเหตุการณ์ที่ไม่มีในตารางด้วย จึงกรองแบบ "ไม่ใช่หมวดอื่น" แทน */
export const actionsOf = (c: AuditCategory) => Object.keys(L).filter((k) => L[k][0] === c)

/** คำขอที่ไม่บันทึก: อ่านล้วน/รบกวนมาก/ไม่เปลี่ยนสถานะ (ล็อกอินและตอบรับคำเชิญบันทึกแยกด้วยเหตุการณ์ auth.*) */
export const AUDIT_SKIP = new Set([
  'POST /auth/login',
  'POST /auth/login/2fa',
  'POST /auth/logout',
  'POST /auth/2fa/setup',
  'POST /auth/invite/lookup',
  'POST /auth/invite/accept',
  'POST /auth/reset/lookup',
  'POST /auth/reset/accept',
  'POST /auth/forgot-password',
  'POST /alerts/:id/ack',
  'POST /alerts/ack-all',
])
