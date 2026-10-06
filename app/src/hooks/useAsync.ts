'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLive } from '@/components/layout/LiveProvider'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { live?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn().then(
      (d) => alive && setData(d),
      (e) => alive && setError(e),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  // เรียลไทม์: เมื่อ API แจ้งว่าข้อมูลเปลี่ยน โหลดซ้ำเงียบ ๆ (คงข้อมูลเดิมไว้ ไม่กระพริบ; โหลดพลาดก็ไม่ล้มหน้า)
  const { version } = useLive()
  const seen = useRef(version)
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    if (!opts.live || version === seen.current) return
    seen.current = version
    let alive = true
    latest.current().then(
      (d) => alive && setData(d),
      () => undefined,
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, opts.live])

  /** โหลดซ้ำโดยคงข้อมูลเดิมไว้จนกว่าข้อมูลใหม่จะมา (ไม่กระพริบ) */
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading: data === null && error === null, setData, reload }
}
