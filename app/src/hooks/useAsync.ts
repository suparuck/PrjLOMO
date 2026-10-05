'use client'

import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
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
  /** โหลดซ้ำโดยคงข้อมูลเดิมไว้จนกว่าข้อมูลใหม่จะมา (ไม่กระพริบ) */
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading: data === null && error === null, setData, reload }
}
