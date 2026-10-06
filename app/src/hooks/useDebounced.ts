'use client'

import { useEffect, useState } from 'react'

/** ค่าที่ตามหลังการพิมพ์ — ใช้กับช่องค้นหาที่ยิง API ทุกครั้งที่ค่าเปลี่ยน */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
