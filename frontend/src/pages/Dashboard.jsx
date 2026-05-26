import React, { useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import { useCountUp, useCountUpCurrency } from '../hooks/useCountUp'

// ── Helpers ─────────────────────────────────────────────────────────────────

function occupancyColor(pct) {
  if (pct == null) return 'text-slate-400'
  if (pct < 60) return 'text-green-400'
  if (pct <= 85) return 'text-yellow-400'
  return 'text-red-400'
}

function occupancyBarColor(pct) {
  if (pct == null) return 'bg-slate-600'
  if (pct < 60) return 'bg-green-400'
  if (pct <= 85) return 'bg-yellow-400'
  return 'bg-red-400'
}

function fmtTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SkeletonKpi() {
  return (
    <div className="animate-pulse bg-[#1A1A2E] rounded-xl p-5 border border-slate-800 flex flex-col gap-3">
      <div className="bg-slate-700 rounded h-4 w-24" />
      <div className="bg-slate-700 rounded h-10 w-36" />
      <div className="bg-slate-700 rounded h-3 w-20" />
    </div>
  )
}

function KpiCard({ label, value, sub, colorClass = 'text-slate-200' }) {
  return (
    <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className={`text-4xl font-bold font-mono tabular-nums ${colorClass}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function SummaryBar({ gyms }) {
  const totalCheckins = gyms.reduce((sum, g) => sum + (g.current_occupancy || 0), 0)
  const totalRevenue = gyms.reduce((sum, g) => sum + parseFloat(g.today_revenue || 0), 0)
  const rawAnomalies = useStore((s) => s.anomalies)
  // Guard: store is always [], but coerce in case API response was an object
  const anomalies = Array.isArray(rawAnomalies) ? rawAnomalies : []
  const activeAnomalyCount = anomalies.filter((a) => !a.resolved && !a.dismissed).length

  const animCheckins = useCountUp(totalCheckins)
  const animRevenue = useCountUp(Math.round(totalRevenue))
  const animAnomalies = useCountUp(activeAnomalyCount)

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <KpiCard
        label="Members Currently Checked In (All Gyms)"
        value={animCheckins.toLocaleString('en-IN')}
        sub="across all locations"
        colorClass="text-teal-400"
      />
      <KpiCard
        label="Total Today's Revenue (All Gyms)"
        value={`₹${animRevenue.toLocaleString('en-IN')}`}
        sub="payments received today"
        colorClass="text-teal-400"
      />
      <KpiCard
        label="Active Anomalies"
        value={animAnomalies}
        sub="requiring attention"
        colorClass={activeAnomalyCount > 0 ? 'text-red-400' : 'text-green-400'}
      />
    </div>
  )
}

function OccupancyCard({ gym, wsConnected }) {
  const pct = gym.capacity_pct ?? Math.round(((gym.current_occupancy || 0) / gym.capacity) * 100)
  const animOccupancy = useCountUp(gym.current_occupancy || 0)
  const animPct = useCountUp(pct)

  return (
    <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-slate-400 text-sm">Live Occupancy</p>
          <p className="text-slate-300 text-xs mt-0.5">
            {gym.name.replace('WTF Gyms — ', '')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            {wsConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            )}
          </span>
          <span className="text-xs text-slate-400">{wsConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-5xl font-bold font-mono tabular-nums ${occupancyColor(animPct)}`}>
          {animOccupancy}
        </span>
        <span className="text-slate-500 text-lg mb-1">/ {gym.capacity}</span>
        <span className={`text-3xl font-bold font-mono tabular-nums ml-auto ${occupancyColor(animPct)}`}>
          {animPct}%
        </span>
      </div>

      {/* Bar */}
      <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${occupancyBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>0</span>
        <span className="text-slate-400">
          {pct < 60 ? '🟢 Normal' : pct <= 85 ? '🟡 Busy' : '🔴 Near Capacity'}
        </span>
        <span>{gym.capacity}</span>
      </div>
    </div>
  )
}

function RevenueCard({ gym }) {
  const revenue = parseFloat(gym.today_revenue || 0)
  const animRevenue = useCountUp(Math.round(revenue))

  return (
    <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
      <p className="text-slate-400 text-sm mb-1">Today's Revenue</p>
      <p className="text-slate-300 text-xs mb-3">
        {gym.name.replace('WTF Gyms — ', '')}
      </p>
      <p className="text-4xl font-bold font-mono tabular-nums text-teal-400">
        ₹{animRevenue.toLocaleString('en-IN')}
      </p>
      <p className="text-slate-500 text-xs mt-1">payments today</p>
    </div>
  )
}

function ActivityFeedItem({ event }) {
  const icons = {
    checkin: { emoji: '🏋️', label: 'Check-in', color: 'text-green-400' },
    checkout: { emoji: '👋', label: 'Check-out', color: 'text-slate-400' },
    payment: { emoji: '💳', label: 'Payment', color: 'text-teal-400' },
  }
  const { emoji, label, color } = icons[event.kind] || { emoji: '📌', label: 'Event', color: 'text-slate-400' }

  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-base shrink-0 mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${color}`}>{label}</span>
          <span className="text-slate-500 text-xs">{event.gymName?.replace('WTF Gyms — ', '')}</span>
        </div>
        <p className="text-slate-300 text-sm truncate">{event.memberName}</p>
        {event.kind === 'payment' && (
          <p className="text-teal-400 text-xs">₹{Number(event.amount).toLocaleString('en-IN')} · {event.planType}</p>
        )}
        {(event.kind === 'checkin' || event.kind === 'checkout') && event.occupancy != null && (
          <p className={`text-xs ${occupancyColor(event.capacityPct)}`}>
            Occupancy: {event.occupancy} ({Math.round(event.capacityPct || 0)}%)
          </p>
        )}
      </div>
      <span className="text-slate-600 text-xs shrink-0">{fmtTime(event.timestamp)}</span>
    </div>
  )
}

function ActivityFeed() {
  const feed = useStore((s) => s.activityFeed)
  const bottomRef = useRef(null)

  useEffect(() => {
    // Auto-scroll on new events
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed])

  return (
    <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-slate-200 font-semibold">Live Activity Feed</h2>
        <span className="text-slate-500 text-xs">{feed.length} events</span>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: '380px' }}
        data-testid="activity-feed"
      >
        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600">
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1">Start the simulator to see live events</p>
          </div>
        ) : (
          feed.map((event) => <ActivityFeedItem key={event.id} event={event} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Dashboard Page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const gyms = useStore((s) => s.gyms)
  const gymsLoading = useStore((s) => s.gymsLoading)
  const gymsError = useStore((s) => s.gymsError)
  const selectedGymId = useStore((s) => s.selectedGymId)
  const wsConnected = useStore((s) => s.wsConnected)

  const selectedGym = gyms.find((g) => g.id === selectedGymId)

  if (gymsError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-red-400 text-4xl">⚠️</span>
        <p className="text-red-400 font-semibold">Failed to load gym data</p>
        <p className="text-slate-500 text-sm">{gymsError}</p>
        <button
          className="mt-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-sm"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary Bar */}
      {gymsLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SkeletonKpi /><SkeletonKpi /><SkeletonKpi />
        </div>
      ) : (
        <SummaryBar gyms={gyms} />
      )}

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left column: Occupancy + Revenue */}
        <div className="col-span-1 flex flex-col gap-6">
          {gymsLoading || !selectedGym ? (
            <>
              <SkeletonKpi />
              <SkeletonKpi />
            </>
          ) : (
            <>
              <OccupancyCard gym={selectedGym} wsConnected={wsConnected} />
              <RevenueCard gym={selectedGym} />
            </>
          )}
        </div>

        {/* Right columns: Activity feed + All-gyms grid */}
        <div className="col-span-2 flex flex-col gap-6">
          <ActivityFeed />

          {/* All gyms mini-grid */}
          <div>
            <h2 className="text-slate-200 font-semibold mb-3">All Locations</h2>
            {gymsLoading ? (
              <div className="grid grid-cols-5 gap-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-[#1A1A2E] rounded-lg p-3 border border-slate-800 h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {gyms.map((gym) => {
                  const pct =
                    gym.capacity_pct ??
                    Math.round(((gym.current_occupancy || 0) / gym.capacity) * 100)
                  return (
                    <button
                      key={gym.id}
                      onClick={() => useStore.getState().selectGym(gym.id)}
                      className={`text-left rounded-lg p-3 border transition-colors ${
                        gym.id === selectedGymId
                          ? 'border-teal-500 bg-teal-500/10'
                          : 'border-slate-800 bg-[#1A1A2E] hover:border-slate-600'
                      }`}
                    >
                      <p className="text-xs text-slate-400 truncate">
                        {gym.name.replace('WTF Gyms — ', '')}
                      </p>
                      <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${occupancyColor(pct)}`}>
                        {pct}%
                      </p>
                      <p className="text-xs text-slate-600">
                        {gym.current_occupancy || 0}/{gym.capacity}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
