import { Type } from '@sinclair/typebox'

/**
 * แบ่งหน้าฝั่ง API (opt-in): ส่ง page มา = ได้ซองข้อมูล { items, total, page, pageSize, ... }
 * ไม่ส่ง page = ได้อาร์เรย์เต็มเหมือนเดิม (ผู้เรียกเดิมไม่พัง) — pageSize สูงสุด 100
 */
export const PageQuery = {
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 10 })),
}

export const pageArgs = (q: { page?: number; pageSize?: number }) => {
  const pageSize = q.pageSize ?? 10
  const page = q.page ?? 1
  return { paged: q.page !== undefined, page, pageSize, offset: (page - 1) * pageSize }
}

export const envelope = <T, X extends object = Record<string, never>>(items: T[], total: number, page: number, pageSize: number, extra?: X) => ({
  items,
  total,
  page,
  pageSize,
  pages: Math.max(1, Math.ceil(total / pageSize)),
  ...(extra ?? ({} as X)),
})

/** escape ตัวอักษรพิเศษของ LIKE เพื่อให้คำค้นเป็นข้อความตรงตัว */
export const likeTerm = (s: string) => `%${s.trim().replace(/[\\%_]/g, '\\$&')}%`
