import React, { useEffect, useState } from 'react'
import { DemoModal } from '../components/DemoModal'
import useStore from '../store/useStore'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export default function Users() {
  const locations = useStore((s) => s.locations)
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [demoModal, setDemoModal] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/users', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) {
          setUsers(Array.isArray(data.users) ? data.users : [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const locationName = (locationId) => {
    if (!locationId) return 'All locations'
    return locations.find((l) => l.id === locationId)?.name || locationId.slice(0, 8)
  }

  const handleWrite = (action) => {
    if (DEMO_MODE) setDemoModal(action)
  }

  return (
    <div className="p-6 space-y-6">
      {demoModal && <DemoModal action={demoModal} onClose={() => setDemoModal(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">User Management</h1>
        <button
          onClick={() => handleWrite('create a new staff account')}
          className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Staff
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Role</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Location</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No staff accounts found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.role === 'super_admin' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">Admin</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Staff</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{locationName(u.location_id)}</td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Active</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active && (
                      <button
                        onClick={() => handleWrite('deactivate this staff account')}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 border border-slate-200 hover:border-red-200 rounded transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
