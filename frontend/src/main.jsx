import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './index.css'

import { useAuth } from './hooks/useAuth'
import useStore from './store/useStore'

import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Analytics  from './pages/Analytics'
import Anomalies  from './pages/Anomalies'
import Simulator  from './pages/Simulator'
import Users      from './pages/Users'
import Members    from './pages/Members'
import Layout     from './components/Layout'

// ── Route guards ──────────────────────────────────────────────────────────────

function PublicRoute({ children }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const authLoading     = useStore((s) => s.authLoading)
  if (authLoading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

function ProtectedRoute() {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const authLoading     = useStore((s) => s.authLoading)
  if (authLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

function RoleRoute({ role }) {
  const user = useStore((s) => s.user)
  if (!user || user.role !== role) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

// ── App shell — runs checkAuth on mount, shows spinner while loading ──────────

function AppShell() {
  const { authLoading, checkAuth } = useAuth()

  useEffect(() => {
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/analytics"  element={<Analytics />} />
          <Route path="/anomalies"  element={<Anomalies />} />
          <Route path="/members"    element={<Members />} />

          <Route element={<RoleRoute role="super_admin" />}>
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/users"     element={<Users />} />
          </Route>
        </Route>
      </Route>

      {/* Catch-all → dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

// ── Mount ─────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </React.StrictMode>
)
