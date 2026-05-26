import { useEffect } from 'react'
import useStore from '../store/useStore'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/** Coerce any API response shape into a plain array of gym objects. */
function toGymArray(raw) {
  if (Array.isArray(raw)) return raw
  // Backend might wrap: { gyms: [...] } or { data: [...] }
  if (raw && Array.isArray(raw.gyms)) return raw.gyms
  if (raw && Array.isArray(raw.data)) return raw.data
  console.warn('[useGymData] unexpected response shape — got:', typeof raw, raw)
  return []
}

export function useGymData() {
  const setGyms      = useStore((s) => s.setGyms)
  const setGymsError = useStore((s) => s.setGymsError)

  useEffect(() => {
    let cancelled = false

    async function fetchGyms() {
      try {
        const res = await fetch(`${API_BASE}/api/gyms`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.json()
        // ── always coerce to array before storing ──────────────────────────
        if (!cancelled) setGyms(toGymArray(raw))
      } catch (err) {
        if (!cancelled) setGymsError(err.message || 'Failed to load gyms')
      }
    }

    fetchGyms()
    return () => { cancelled = true }
  }, [setGyms, setGymsError])
}

// ── Standalone fetch helpers (called directly in pages, not as hooks) ─────────

export async function fetchGymAnalytics(gymId, dateRange = '30d') {
  const res = await fetch(`${API_BASE}/api/gyms/${gymId}/analytics?dateRange=${dateRange}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchCrossGym() {
  const res = await fetch(`${API_BASE}/api/analytics/cross-gym`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  // Coerce to array in case backend wraps the response
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.gyms)) return raw.gyms
  if (raw && Array.isArray(raw.data)) return raw.data
  return []
}
