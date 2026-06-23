import React, { useState } from 'react'
import useStore from '../store/useStore'
import { API_BASE } from '../config/api.js'

async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function Simulator() {
  const simulatorStatus    = useStore((s) => s.simulatorStatus)
  const simulatorSpeed     = useStore((s) => s.simulatorSpeed)
  const setSimulatorStatus = useStore((s) => s.setSimulatorStatus)
  const setSimulatorSpeed  = useStore((s) => s.setSimulatorSpeed)

  const [loading, setLoading]           = useState(null)
  const [error, setError]               = useState(null)
  const [resetConfirm, setResetConfirm] = useState(false)

  const isRunning = simulatorStatus === 'running'

  async function handleStartStop() {
    const action = isRunning ? 'stop' : 'start'
    setLoading(action); setError(null)
    try {
      if (action === 'start') {
        await apiPost('/api/simulator/start', { speed: simulatorSpeed })
        setSimulatorStatus('running')
      } else {
        await apiPost('/api/simulator/stop')
        setSimulatorStatus('stopped')
      }
    } catch (err) {
      setError(`Failed to ${action} simulator: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  async function handleReset() {
    setLoading('reset'); setError(null)
    try {
      await apiPost('/api/simulator/reset')
      setSimulatorStatus('stopped')
      setResetConfirm(false)
    } catch (err) {
      setError(`Reset failed: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Simulator Controls</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Generate real-time check-in, check-out, and payment events
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 max-w-2xl" data-tour="simulator-controls">
        {/* Status card */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <p className="text-slate-500 text-sm font-medium mb-3">Simulator Status</p>
          <div className="flex items-center gap-2 mb-6">
            <span className="relative flex h-3 w-3">
              {isRunning ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-300" />
              )}
            </span>
            <span className={`text-2xl font-bold capitalize ${isRunning ? 'text-green-600' : 'text-slate-400'}`}>
              {isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          <button
            onClick={handleStartStop}
            disabled={loading !== null}
            className={`w-full py-3 rounded-lg font-bold text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              isRunning
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
            data-testid="simulator-toggle"
          >
            {loading === 'start' || loading === 'stop'
              ? '⏳ Working…'
              : isRunning
              ? '⏸ Pause Simulator'
              : '▶ Start Simulator'}
          </button>
        </div>

        {/* Speed card */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <p className="text-slate-500 text-sm font-medium mb-3">Simulation Speed</p>
          <div className="flex flex-col gap-3">
            {[1, 5, 10].map((speed) => (
              <button
                key={speed}
                onClick={() => {
                  setSimulatorSpeed(speed)
                  if (isRunning) apiPost('/api/simulator/start', { speed }).catch(() => {})
                }}
                className={`py-2.5 px-4 rounded-lg font-semibold transition-colors text-sm border ${
                  simulatorSpeed === speed
                    ? 'bg-sky-500 text-white border-sky-500 ring-2 ring-sky-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="font-mono text-lg mr-2">{speed}×</span>
                <span className="text-xs opacity-80">
                  {speed === 1 ? 'Normal (1 event / 2s)' : speed === 5 ? 'Fast (5 events / 2s)' : 'Turbo (10 events / 2s)'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reset card */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 max-w-2xl">
        <h2 className="text-slate-900 font-semibold mb-1">Reset to Baseline</h2>
        <p className="text-slate-500 text-sm mb-4">
          Clears all open check-ins generated by the simulator and returns the dashboard to the
          seeded baseline state. Historical data is preserved.
        </p>

        {resetConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-amber-600 text-sm font-medium">⚠️ This will clear all live check-ins. Continue?</span>
            <button
              onClick={handleReset}
              disabled={loading === 'reset'}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm disabled:opacity-50"
            >
              {loading === 'reset' ? '⏳ Resetting…' : 'Confirm Reset'}
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setResetConfirm(true)}
            disabled={loading !== null}
            className="px-4 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-600 border border-slate-200 rounded font-medium text-sm transition-colors disabled:opacity-50"
            data-testid="simulator-reset"
          >
            🔄 Reset to Baseline
          </button>
        )}
      </div>

      {/* Info box */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 max-w-2xl">
        <h2 className="text-slate-900 font-semibold mb-3">How It Works</h2>
        <ul className="space-y-2 text-sm text-slate-500">
          <li className="flex items-start gap-2">
            <span className="text-sky-500 shrink-0">•</span>
            Events are written directly to PostgreSQL - no mocking
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 shrink-0">•</span>
            Follows realistic patterns: peak load 9–12am and 2–5pm, lower mornings/evenings
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 shrink-0">•</span>
            All events broadcast to connected WebSocket clients in real time
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 shrink-0">•</span>
            Anomaly detector runs every 30 seconds - watch the Anomalies tab
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 shrink-0">•</span>
            Speed multiplier applies immediately without restarting
          </li>
        </ul>
      </div>
    </div>
  )
}
