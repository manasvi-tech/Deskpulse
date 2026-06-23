import { useEffect } from 'react'
import useStore from '../store/useStore'
import { API_BASE } from '../config/api.js'

function toAnomalyArray(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.anomalies)) return raw.anomalies
  if (raw && Array.isArray(raw.data))      return raw.data
  console.warn('[useAnomalies] unexpected response shape — got:', typeof raw, raw)
  return []
}

export function useAnomalies() {
  const setAnomalies        = useStore((s) => s.setAnomalies)
  const setAnomaliesError   = useStore((s) => s.setAnomaliesError)
  const dismissAnomalyLocal = useStore((s) => s.dismissAnomalyLocal)
  const anomalies = useStore((s) => s.anomalies)
  const loading   = useStore((s) => s.anomaliesLoading)
  const error     = useStore((s) => s.anomaliesError)

  useEffect(() => {
    let cancelled = false

    async function fetchAnomalies() {
      try {
        const res = await fetch(`${API_BASE}/api/anomalies`, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.json()
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
      credentials: 'include',
    })
    if (res.status === 403) throw new Error('Critical anomalies cannot be dismissed')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    dismissAnomalyLocal(anomalyId)
  }

  const safeAnomalies = Array.isArray(anomalies) ? anomalies : []
  const activeCount = safeAnomalies.filter((a) => !a.resolved && !a.dismissed).length

  return { anomalies: safeAnomalies, loading, error, dismiss, activeCount }
}
