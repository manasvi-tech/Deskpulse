import { useEffect } from 'react'
import useStore from '../store/useStore'

function toLocationArray(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.locations)) return raw.locations
  if (raw && Array.isArray(raw.data)) return raw.data
  console.warn('[useLocationData] unexpected response shape:', typeof raw, raw)
  return []
}

export function useLocationData() {
  const setLocations      = useStore((s) => s.setLocations)
  const setLocationsError = useStore((s) => s.setLocationsError)

  useEffect(() => {
    let cancelled = false

    async function fetchLocations() {
      try {
        const res = await fetch('/api/locations', { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.json()
        if (!cancelled) setLocations(toLocationArray(raw))
      } catch (err) {
        if (!cancelled) setLocationsError(err.message || 'Failed to load locations')
      }
    }

    fetchLocations()
    return () => { cancelled = true }
  }, [setLocations, setLocationsError])
}

export async function fetchLocationAnalytics(locationId, dateRange = '30d') {
  const res = await fetch(`/api/locations/${locationId}/analytics?dateRange=${dateRange}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchCrossLocation() {
  const res = await fetch('/api/analytics/cross-location', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.locations)) return raw.locations
  if (raw && Array.isArray(raw.data)) return raw.data
  return []
}
