/** ข้อผิดพลาดที่ตอบกลับลูกข่ายได้ — fields ใช้แสดงข้อความใต้ช่องฟอร์ม (key '_' = ข้อผิดพลาดทั่วไป) */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `ไม่พบ${what}`)
export const forbidden = (message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้') => new AppError(403, 'forbidden', message)
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new AppError(401, 'unauthorized', message)
export const conflict = (message: string, fields?: Record<string, string>) => new AppError(409, 'conflict', message, fields)
/** ข้อมูลผ่านรูปแบบ แต่ผิดกฎของระบบ (เช่น รหัสซ้ำ ค่าเกินช่วง) */
export const invalid = (fields: Record<string, string>) =>
  new AppError(422, 'invalid', Object.values(fields)[0] ?? 'ข้อมูลไม่ถูกต้อง', fields)

/** ชื่อ constraint ของ PostgreSQL → ฟิลด์และข้อความ (กรณีชนกันตอนบันทึกพร้อมกัน) */
export const UNIQUE_MESSAGES: Record<string, [string, string]> = {
  vehicles_pkey: ['id', 'รหัสรถนี้มีอยู่แล้ว'],
  vehicles_plate_key: ['plate', 'ทะเบียนนี้มีอยู่แล้ว'],
  vehicles_driver_id_key: ['driverId', 'คนขับคนนี้มีรถประจำแล้ว'],
  drivers_phone_key: ['phone', 'เบอร์โทรนี้ถูกใช้แล้ว'],
  users_email_key: ['email', 'อีเมลนี้อยู่ในระบบแล้ว'],
  charging_sessions_one_active: ['_', 'รถคันนี้มีเซสชันการชาร์จที่กำลังดำเนินอยู่แล้ว'],
}
