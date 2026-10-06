'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * แบ่งหน้ารายการฝั่งหน้าเว็บ — resetKey เปลี่ยน (เช่น ตัวกรอง/คำค้น) จะกลับไปหน้าแรก
 * ข้อมูลที่ถูกลบ/กรองจนหน้าปัจจุบันเกินจำนวนหน้า จะถอยมาหน้าสุดท้ายให้เอง
 */
export function usePagination<T>(items: T[], pageSize = 10, resetKey: unknown = '') {
  const [requested, setPage] = useState(1)
  useEffect(() => setPage(1), [resetKey])
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requested, pages)
  const slice = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])
  return { slice, page, pages, total: items.length, from: items.length ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, items.length), setPage }
}

export type Pagination = ReturnType<typeof usePagination>
