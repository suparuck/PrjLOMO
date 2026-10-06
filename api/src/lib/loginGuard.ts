/**
 * จำกัดการเดารหัสผ่านรายบัญชี (เสริม rate limit ต่อ IP): เดาผิดเกิน MAX ครั้งใน WINDOW → ปฏิเสธชั่วคราว
 * IP หลายตัวช่วยกันเดาบัญชีเดียว (botnet / สลับ IP) จึงไม่หลุดการจำกัดนี้
 *
 * ข้อแลกเปลี่ยน: ผู้โจมตีทำให้เจ้าของบัญชีเข้าไม่ได้ได้ชั่วคราว (≤ WINDOW) จึงตั้งเพดานไว้สูงพอที่คนจริงพิมพ์ผิดไม่ถึง
 * เก็บในหน่วยความจำของโปรเซสนี้ (หลาย API อินสแตนซ์แยกนับกัน) และคีย์เป็นอีเมลแบบ lower-case
 */
export function createLoginGuard(opts: { max?: number; windowMs?: number; maxKeys?: number; now?: () => number } = {}) {
  const max = opts.max ?? 20
  const windowMs = opts.windowMs ?? 15 * 60_000
  const maxKeys = opts.maxKeys ?? 10_000
  const now = opts.now ?? Date.now
  const fails = new Map<string, { n: number; resetAt: number }>()
  const key = (email: string) => email.trim().toLowerCase()

  function prune() {
    if (fails.size < maxKeys) return
    const t = now()
    for (const [k, v] of fails) if (v.resetAt <= t) fails.delete(k)
    // ยังเต็ม (ถูกถล่มด้วยอีเมลสุ่ม): ทิ้งรายการเก่าสุดเพื่อไม่ให้หน่วยความจำโต
    while (fails.size >= maxKeys) fails.delete(fails.keys().next().value as string)
  }

  return {
    /** บัญชีนี้ถูกจำกัดอยู่หรือไม่ */
    blocked(email: string) {
      const v = fails.get(key(email))
      if (!v) return false
      if (v.resetAt <= now()) {
        fails.delete(key(email))
        return false
      }
      return v.n >= max
    },
    fail(email: string) {
      const k = key(email)
      const v = fails.get(k)
      if (v && v.resetAt > now()) v.n++
      else {
        prune()
        fails.set(k, { n: 1, resetAt: now() + windowMs })
      }
    },
    success(email: string) {
      fails.delete(key(email))
    },
    get size() {
      return fails.size
    },
  }
}

export type LoginGuard = ReturnType<typeof createLoginGuard>
