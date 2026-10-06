import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { config } from '../config'

/**
 * เข้ารหัสข้อมูลลับที่ต้องอ่านกลับได้ (ความลับ TOTP ของผู้ใช้, โทเคนตั้งค่า 2FA ที่ค้างอยู่) ด้วย AES-256-GCM
 * กุญแจมาจาก AUTH_SECRET (HKDF แยกตามวัตถุประสงค์) — ฐานข้อมูลหลุดอย่างเดียวจึงยังอ่านความลับ 2FA ไม่ได้
 * ข้อแลกเปลี่ยน: เปลี่ยน AUTH_SECRET แล้วความลับ 2FA ที่เก็บไว้ถอดรหัสไม่ได้ → ต้องรีเซ็ต 2FA ของผู้ใช้ (CLI: reset-2fa)
 */
const key = (purpose: string) => Buffer.from(hkdfSync('sha256', config.authSecret, '', `ev-monitor/${purpose}/v1`, 32))

export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(purpose), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')
}

/** ถอดรหัส — คืน null ถ้าถูกแก้ไข/ผิดวัตถุประสงค์/กุญแจไม่ตรง (ไม่โยนข้อผิดพลาดที่บอกสาเหตุ) */
export function open(sealed: string, purpose: string): string | null {
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < 12 + 16 + 1) return null
    const d = createDecipheriv('aes-256-gcm', key(purpose), buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
