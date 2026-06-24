import React, { useState } from 'react'
import { useAnomalies } from '../hooks/useAnomalies'
import useStore from '../store/useStore'

function fmtDatetime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-IN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch { return ts }
}

function SeverityBadge({ severity }) {
  const cls =
    severity === 'critical'
      ? 'bg-red-50 text-red-700 border border-red-200'
      : 'bg-amber-50 text-amber-700 border border-amber-200'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${cls}`}>
      {severity}
    </span>
  )
}

function TypeBadge({ type }) {
  const labels = {
    no_activity:  { label: 'No Activity',  cls: 'text-orange-600' },
    overbooking:  { label: 'Overbooking',  cls: 'text-red-600' },
    revenue_drop: { label: 'Revenue Drop', cls: 'text-amber-600' },
    high_no_show: { label: 'High No-Show', cls: 'text-purple-600' },
  }
  const { label, cls } = labels[type] || { label: type, cls: 'text-slate-500' }
  return <p className={`text-sm font-medium ${cls}`}>{label}</p>
}

function StatusBadge({ anomaly }) {
  if (anomaly.dismissed) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
        Dismissed
      </span>
    )
  }
  if (anomaly.resolved) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
        ✓ Resolved
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 animate-pulse">
      Active
    </span>
  )
}

function DismissButton({ anomaly, onDismiss }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  if (anomaly.severity === 'critical') {
    return <span className="text-xs text-slate-400 italic">Cannot dismiss critical</span>
  }
  if (anomaly.resolved || anomaly.dismissed) return null

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Confirm dismiss?</span>
        <button
          onClick={async () => {
            setLoading(true); setError(null)
            try { await onDismiss(anomaly.id) }
            catch (err) { setError(err.message) }
            finally { setLoading(false); setConfirming(false) }
          }}
          disabled={loading}
          className="text-xs px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50"
        >
          {loading ? '...' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded"
        >
          No
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 border border-slate-200 hover:border-amber-200 rounded transition-colors"
    >
      Dismiss
    </button>
  )
}

export default function Anomalies() {
  const { anomalies, loading, error, dismiss, activeCount } = useAnomalies()
  const locations = useStore((s) => s.locations)
  const [filter, setFilter]               = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')

  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]))

  const filtered = anomalies.filter((a) => {
    if (filter === 'active' && (a.resolved || a.dismissed)) return false
    if (filter === 'resolved' && !a.resolved && !a.dismissed) return false
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false
    return true
  })

  const visible = filtered.filter((a) => {
    if (!a.resolved) return true
    const resolvedMs = new Date(a.resolved_at || a.detected_at).getTime()
    return Date.now() - resolvedMs < 24 * 60 * 60 * 1000
  })

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          ⚠️ Failed to load anomalies: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Anomaly Log</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {activeCount} active anomaly{activeCount !== 1 ? 'ies' : 'y'} requiring attention
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {['all', 'active', 'resolved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-sky-500 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {['all', 'warning', 'critical'].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  severityFilter === s
                    ? s === 'critical'
                      ? 'bg-red-600 text-white'
                      : s === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-sky-500 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="anomaly-table" data-tour="anomaly-table">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-200 rounded h-14" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="text-4xl mb-3">✅</span>
            <p className="font-medium text-slate-500">No anomalies found</p>
            <p className="text-sm mt-1">
              {filter === 'active' ? 'All clear — no active anomalies' : 'No anomalies match the current filter'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Location</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Type</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Severity</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Message</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Detected</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((anomaly) => (
                <tr
                  key={anomaly.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    !anomaly.resolved && !anomaly.dismissed && anomaly.severity === 'critical'
                      ? 'bg-red-50/40'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                    {anomaly.location_name ||
                      locationMap[anomaly.location_id] ||
                      anomaly.location_id?.substring(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={anomaly.type} />
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={anomaly.severity} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-xs">
                    <span title={anomaly.message} className="line-clamp-2">{anomaly.message}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {fmtDatetime(anomaly.detected_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge anomaly={anomaly} />
                    {anomaly.resolved && anomaly.resolved_at && (
                      <p className="text-xs text-slate-400 mt-1">{fmtDatetime(anomaly.resolved_at)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DismissButton anomaly={anomaly} onDismiss={dismiss} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
