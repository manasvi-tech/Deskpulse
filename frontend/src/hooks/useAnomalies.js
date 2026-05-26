import { useEffect } from 'react'
import useStore from '../store/useStore'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/** Coerce any API response shape into a plain array of anomaly objects. */
function toAnomalyArray(raw) {
  if (Array.isArray(raw)) return raw
  // Backend might wrap: { anomalies: [...] } or { data: [...] }
  if (raw && Array.isArray(raw.anomalies)) return raw.anomalies
  if (raw && Array.isArray(raw.data))      return raw.data
  console.warn('[useAnomalies] unexpected response shape — got:', typeof raw, raw)
  return []
}

export function useAnomalies() {
  const setAnomalies     = useStore((s) => s.setAnomalies)
  const setAnomaliesError = useStore((s) => s.setAnomaliesError)
  const dismissAnomalyLocal = useStore((s) => s.dismissAnomalyLocal)
  const anomalies = useStore((s) => s.anomalies)
  const loading   = useStore((s) => s.anomaliesLoading)
  const error     = useStore((s) => s.anomaliesError)

  useEffect(() => {
    let cancelled = false

    async function fetchAnomalies() {
      try {
        const res = await fetch(`${API_BASE}/api/anomalies`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.json()
        // ── always coerce to array before storing ──────────────────────────
        if (!cancelled) setAnomalies(toAnomalyArray(raw))
      } catch (err) {
        if (!cancelled) setAnomaliesError(err.message || 'Failed to load anomalies')
      }
    }

    fetchAnomalies()
    return () => { cancelled = true }
  }, [setAnomalies, setAnomaliesError])

  const dismiss = async (anomalyId) => {
    const res = await fetch(`${API_BASE}/api/anomalies/${anomalyId}/dismiss`, {
      method: 'PATCH',
    })
    if (res.status === 403) throw new Error('Critical anomalies cannot be dismissed')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    dismissAnomalyLocal(anomalyId)
  }

  // ── Always safe: anomalies is guaranteed [] by store initialiser,
  //    but toAnomalyArray above ensures we never stored a non-array. ──────────
  const safeAnomalies = Array.isArray(anomalies) ? anomalies : []
  const activeCount = safeAnomalies.filter((a) => !a.resolved && !a.dismissed).length

  return { anomalies: safeAnomalies, loading, error, dismiss, activeCount }
}
