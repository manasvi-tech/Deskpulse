import React, { useState } from 'react'
import { useAnomalies } from '../hooks/useAnomalies'
import useStore from '../store/useStore'

function fmtDatetime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}

function SeverityBadge({ severity }) {
  const cls =
    severity === 'critical'
      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${cls}`}>
      {severity}
    </span>
  )
}

function TypeBadge({ type }) {
  const labels = {
    zero_checkins: { label: 'Zero Check-ins', cls: 'text-orange-400' },
    capacity_breach: { label: 'Capacity Breach', cls: 'text-red-400' },
    revenue_drop: { label: 'Revenue Drop', cls: 'text-yellow-400' },
  }
  const { label, cls } = labels[type] || { label: type, cls: 'text-slate-400' }
  return <span className={`text-sm font-medium ${cls}`}>{label}</span>
}

function StatusBadge({ anomaly }) {
  if (anomaly.dismissed) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600">
        Dismissed
      </span>
    )
  }
  if (anomaly.resolved) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/40">
        ✓ Resolved
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
      Active
    </span>
  )
}

function DismissButton({ anomaly, onDismiss }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (anomaly.severity === 'critical') {
    return (
      <span className="text-xs text-slate-600 italic">Cannot dismiss critical</span>
    )
  }
  if (anomaly.resolved || anomaly.dismissed) return null

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Confirm dismiss?</span>
        <button
          onClick={async () => {
            setLoading(true)
            setError(null)
            try {
              await onDismiss(anomaly.id)
            } catch (err) {
              setError(err.message)
            } finally {
              setLoading(false)
              setConfirming(false)
            }
          }}
          disabled={loading}
          className="text-xs px-2 py-0.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded disabled:opacity-50"
        >
          {loading ? '...' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
        >
          No
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-yellow-600 text-slate-300 hover:text-white rounded transition-colors"
    >
      Dismiss
    </button>
  )
}

export default function Anomalies() {
  const { anomalies, loading, error, dismiss, activeCount } = useAnomalies()
  const gyms = useStore((s) => s.gyms)
  const [filter, setFilter] = useState('all') // 'all' | 'active' | 'resolved'
  const [severityFilter, setSeverityFilter] = useState('all')

  const gymMap = Object.fromEntries(gyms.map((g) => [g.id, g.name]))

  const filtered = anomalies.filter((a) => {
    if (filter === 'active' && (a.resolved || a.dismissed)) return false
    if (filter === 'resolved' && !a.resolved && !a.dismissed) return false
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false
    return true
  })

  // Only show resolved anomalies within the last 24 hours
  const visible = filtered.filter((a) => {
    if (!a.resolved) return true
    const resolvedMs = new Date(a.resolved_at || a.detected_at).getTime()
    return Date.now() - resolvedMs < 24 * 60 * 60 * 1000
  })

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
          ⚠️ Failed to load anomalies: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Anomaly Log</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} active anomaly{activeCount !== 1 ? 'ies' : 'y'} requiring attention
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {['all', 'active', 'resolved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {['all', 'warning', 'critical'].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  severityFilter === s
                    ? s === 'critical'
                      ? 'bg-red-600 text-white'
                      : s === 'warning'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-teal-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1A1A2E] rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-700 rounded h-14" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <span className="text-4xl mb-3">✅</span>
            <p className="font-medium text-slate-400">No anomalies found</p>
            <p className="text-sm mt-1">
              {filter === 'active'
                ? 'All clear — no active anomalies'
                : 'No anomalies match the current filter'}
            </p>
          </div>
        ) : (
          <table className="w-full" data-testid="anomaly-table">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Gym</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Type</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Severity</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Message</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Detected</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((anomaly) => (
                <tr
                  key={anomaly.id}
                  className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${
                    !anomaly.resolved && !anomaly.dismissed && anomaly.severity === 'critical'
                      ? 'bg-red-500/5'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {anomaly.gym_name ||
                      gymMap[anomaly.gym_id] ||
                      anomaly.gym_id?.substring(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={anomaly.type} />
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={anomaly.severity} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 max-w-xs">
                    <span title={anomaly.message} className="line-clamp-2">
                      {anomaly.message}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {fmtDatetime(anomaly.detected_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge anomaly={anomaly} />
                    {anomaly.resolved && anomaly.resolved_at && (
                      <p className="text-xs text-slate-600 mt-1">
                        {fmtDatetime(anomaly.resolved_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DismissButton anomaly={anomaly} onDismiss={dismiss} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
