import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * TOTP (RFC 6238) แบบ HMAC-SHA1 รหัส 6 หลัก ช่วงละ 30 วินาที — เข้ากันได้กับ Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password ฯลฯ เขียนเองด้วย node:crypto (ไม่พึ่งไลบรารีเพิ่ม) และมีเทสต์เทียบกับตัวอย่างทดสอบของ RFC
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_SECONDS = 30
export const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('base32 ไม่ถูกต้อง')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** ความลับ 160 บิต (ขนาดที่ RFC แนะนำสำหรับ HMAC-SHA1) เข้ารหัส base32 */
export const generateSecret = () => base32Encode(randomBytes(20))

/** รหัสของช่วงเวลา (step = เลขช่วง 30 วินาทีนับจาก epoch) */
export function codeAtStep(secretB32: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32Decode(secretB32)).update(counter).digest()
  const off = h[h.length - 1] & 0xf
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS)

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * ตรวจรหัสที่ผู้ใช้กรอก — ยอมคลาดเคลื่อนของนาฬิกา ±1 ช่วง (30 วินาที) และไม่ยอมรับช่วงที่ใช้ไปแล้ว (lastStep) กันการเล่นซ้ำ
 * คืนเลขช่วงที่ตรง (ให้ผู้เรียกบันทึกเป็น lastStep) หรือ null
 */
export function verifyTotp(secretB32: string, input: string, nowMs: number, lastStep = 0): number | null {
  const code = input.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return null
  const cur = stepAt(nowMs)
  let hit: number | null = null
  for (const step of [cur - 1, cur, cur + 1]) {
    // เทียบครบทุกช่วงโดยไม่หยุดเมื่อเจอ (ไม่ให้เวลาตอบบอกว่าตรงช่วงไหน)
    if (eq(codeAtStep(secretB32, step), code) && step > lastStep) hit = hit === null || step > hit ? step : hit
  }
  return hit
}

/** ลิงก์ otpauth:// ให้แอปสแกนผ่าน QR */
export function otpauthUri(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
