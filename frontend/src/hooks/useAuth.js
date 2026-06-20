import useStore from '../store/useStore'

export function useAuth() {
  const { user, isAuthenticated, authLoading, setUser, clearUser, setAuthLoading } = useStore()

  const checkAuth = async () => {
    try {
      setAuthLoading(true)
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        clearUser()
      }
    } catch {
      clearUser()
    }
  }

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Login failed')
    }
    // Fetch full profile (includes location_name) using the now-set cookie
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'include' })
      if (meRes.ok) {
        const meData = await meRes.json()
        setUser(meData.user)
        return meData.user
      }
    } catch {}
    // Fallback to login response body
    const data = await res.json()
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    clearUser()
  }

  return { user, isAuthenticated, authLoading, checkAuth, login, logout }
}
