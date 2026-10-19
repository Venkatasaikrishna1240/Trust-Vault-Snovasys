import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../services/api'

export interface AsyncState<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fnRef.current()
      .then((d) => { if (active) setData(d) })
      .catch((e) => { if (active) setError(errorMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}
