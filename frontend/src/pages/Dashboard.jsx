import React, { useEffect } from 'react'
import { LogIn, LogOut, CreditCard, Activity } from 'lucide-react'
import useStore from '../store/useStore'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'

const TOUR_KEY = 'deskpulse_tour_completed'

// ── Helpers ─────────────────────────────────────────────────────────────────

function occupancyColor(pct) {
  if (pct == null) return 'text-slate-400'
  if (pct < 60) return 'text-green-600'
  if (pct <= 85) return 'text-amber-600'
  return 'text-red-600'
}

function occupancyBarColor(pct) {
  if (pct == null) return 'bg-slate-300'
  if (pct < 60) return 'bg-green-500'
  if (pct <= 85) return 'bg-amber-500'
  return 'bg-red-500'
}

function fmtTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch { return '' }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SkeletonKpi() {
  return (
    <div className="animate-pulse bg-white rounded-xl p-5 border border-slate-200 flex flex-col gap-3">
      <div className="bg-slate-200 rounded h-4 w-24" />
      <div className="bg-slate-200 rounded h-10 w-36" />
      <div className="bg-slate-200 rounded h-3 w-20" />
    </div>
  )
}

function KpiCard({ label, value, sub, colorClass = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <p className="text-slate-500 text-sm mb-1">{label}</p>
      <p className={`text-4xl font-bold font-mono tabular-nums ${colorClass}`}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function SummaryBar({ locations }) {
  const totalCheckins      = locations.reduce((sum, l) => sum + (l.current_occupancy || 0), 0)
  const totalRevenue       = locations.reduce((sum, l) => sum + parseFloat(l.today_revenue || 0), 0)
  const rawAnomalies       = useStore((s) => s.anomalies)
  const anomalies          = Array.isArray(rawAnomalies) ? rawAnomalies : []
  const activeAnomalyCount = anomalies.filter((a) => !a.resolved && !a.dismissed).length

  const animCheckins  = useCountUp(totalCheckins)
  const animRevenue   = useCountUp(Math.round(totalRevenue))
  const animAnomalies = useCountUp(activeAnomalyCount)

  return (
    <div className="grid grid-cols-3 gap-4 mb-6" data-tour="summary-bar">
      <KpiCard
        label="Members Currently Checked In (All Locations)"
        value={animCheckins.toLocaleString('en-IN')}
        sub="across all locations"
        colorClass="text-sky-600"
      />
      <KpiCard
        label="Total Today's Revenue (All Locations)"
        value={`₹${animRevenue.toLocaleString('en-IN')}`}
        sub="payments received today"
        colorClass="text-sky-600"
      />
      <KpiCard
        label="Active Anomalies"
        value={animAnomalies}
        sub="requiring attention"
        colorClass={activeAnomalyCount > 0 ? 'text-red-600' : 'text-green-600'}
      />
    </div>
  )
}

function OccupancyCard({ location, wsConnected }) {
  const pct = location.capacity_pct ?? Math.round(((location.current_occupancy || 0) / location.capacity) * 100)
  const animOccupancy = useCountUp(location.current_occupancy || 0)
  const animPct       = useCountUp(pct)

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200" data-tour="live-occupancy">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-slate-500 text-sm font-medium">Live Occupancy</p>
          <p className="text-slate-700 text-xs mt-0.5">{location.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            {wsConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            )}
          </span>
          <span className="text-xs text-slate-500">{wsConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-5xl font-bold font-mono tabular-nums ${occupancyColor(animPct)}`}>
          {animOccupancy}
        </span>
        <span className="text-slate-400 text-lg mb-1">/ {location.capacity}</span>
        <span className={`text-3xl font-bold font-mono tabular-nums ml-auto ${occupancyColor(animPct)}`}>
          {animPct}%
        </span>
      </div>

      <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${occupancyBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>0</span>
        <span className={`font-medium text-xs ${pct < 60 ? 'text-green-600' : pct <= 85 ? 'text-amber-600' : 'text-red-600'}`}>
          {pct < 60 ? 'Normal' : pct <= 85 ? 'Busy' : 'Near Capacity'}
        </span>
        <span>{location.capacity}</span>
      </div>
    </div>
  )
}

function RevenueCard({ location }) {
  const revenue     = parseFloat(location.today_revenue || 0)
  const animRevenue = useCountUp(Math.round(revenue))

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <p className="text-slate-500 text-sm font-medium mb-1">Today's Revenue</p>
      <p className="text-slate-700 text-xs mb-3">{location.name}</p>
      <p className="text-4xl font-bold font-mono tabular-nums text-sky-600">
        ₹{animRevenue.toLocaleString('en-IN')}
      </p>
      <p className="text-slate-400 text-xs mt-1">payments today</p>
    </div>
  )
}

const FEED_ICONS = {
  checkin:  { Icon: LogIn,       label: 'Check-in',  color: 'text-green-600', bg: 'bg-green-50' },
  checkout: { Icon: LogOut,      label: 'Check-out', color: 'text-slate-500', bg: 'bg-slate-100' },
  payment:  { Icon: CreditCard,  label: 'Payment',   color: 'text-sky-600',   bg: 'bg-sky-50' },
}

function ActivityFeedItem({ event }) {
  const { Icon, label, color, bg } = FEED_ICONS[event.kind] || { Icon: Activity, label: 'Event', color: 'text-slate-500', bg: 'bg-slate-100' }

  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className={`shrink-0 mt-0.5 w-6 h-6 rounded-md ${bg} flex items-center justify-center`}>
        <Icon size={13} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${color}`}>{label}</span>
          <span className="text-slate-400 text-xs">{event.locationName}</span>
        </div>
        <p className="text-slate-700 text-sm truncate">{event.memberName}</p>
        {event.kind === 'payment' && (
          <p className="text-sky-600 text-xs">₹{Number(event.amount).toLocaleString('en-IN')} · {event.planType}</p>
        )}
        {(event.kind === 'checkin' || event.kind === 'checkout') && event.occupancy != null && (
          <p className={`text-xs ${occupancyColor(event.capacityPct)}`}>
            Occupancy: {event.occupancy} ({Math.round(event.capacityPct || 0)}%)
          </p>
        )}
      </div>
      <span className="text-slate-400 text-xs shrink-0">{fmtTime(event.timestamp)}</span>
    </div>
  )
}

function ActivityFeed() {
  const feed = useStore((s) => s.activityFeed)

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col h-full" data-tour="activity-feed">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-slate-900 font-semibold">Live Activity Feed</h2>
        <span className="text-slate-400 text-xs">{feed.length} events</span>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: '380px', overflowAnchor: 'none' }}
        data-testid="activity-feed"
      >
        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1">Start the simulator to see live events</p>
          </div>
        ) : (
          feed.map((event) => <ActivityFeedItem key={event.id} event={event} />)
        )}
      </div>
    </div>
  )
}

// ── Dashboard Page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }           = useAuth()
  const locations          = useStore((s) => s.locations)
  const storeTourStart     = useStore((s) => s.startTour)
  const locationsLoading   = useStore((s) => s.locationsLoading)
  const locationsError     = useStore((s) => s.locationsError)
  const selectedLocationId = useStore((s) => s.selectedLocationId)
  const wsConnected        = useStore((s) => s.wsConnected)

  // Frontdesk is always locked to their own location
  const effectiveLocationId =
    user?.role === 'frontdesk' ? user.location_id : selectedLocationId

  const selectedLocation = locations.find((l) => l.id === effectiveLocationId)

  // Frontdesk sees only their one location in the bottom grid
  const gridLocations =
    user?.role === 'frontdesk'
      ? locations.filter((l) => l.id === user.location_id)
      : locations

  if (locationsError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-red-500 text-4xl">⚠️</span>
        <p className="text-red-600 font-semibold">Failed to load location data</p>
        <p className="text-slate-500 text-sm">{locationsError}</p>
        <button
          className="mt-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded text-sm"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    )
  }

  const handleRestartTour = () => {
    localStorage.setItem(TOUR_KEY, 'false')
    if (storeTourStart) storeTourStart()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleRestartTour}
          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer underline"
        >
          Restart tour
        </button>
      </div>

      {locationsLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SkeletonKpi /><SkeletonKpi /><SkeletonKpi />
        </div>
      ) : (
        <SummaryBar locations={locations} />
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 flex flex-col gap-6">
          {locationsLoading || !selectedLocation ? (
            <><SkeletonKpi /><SkeletonKpi /></>
          ) : (
            <>
              <OccupancyCard location={selectedLocation} wsConnected={wsConnected} />
              <RevenueCard location={selectedLocation} />
            </>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-6">
          <ActivityFeed />

          <div>
            <h2 className="text-slate-900 font-semibold mb-3">
              {user?.role === 'frontdesk' ? 'Your Location' : 'All Locations'}
            </h2>
            {locationsLoading ? (
              <div className="grid grid-cols-5 gap-3">
                {[...Array(user?.role === 'frontdesk' ? 1 : 10)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-white rounded-lg p-3 border border-slate-200 h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {gridLocations.map((loc) => {
                  const pct = loc.capacity_pct ?? Math.round(((loc.current_occupancy || 0) / loc.capacity) * 100)
                  const isSelected = loc.id === effectiveLocationId
                  const isClickable = user?.role !== 'frontdesk'
                  return (
                    <button
                      key={loc.id}
                      onClick={() => isClickable && useStore.getState().selectLocation(loc.id)}
                      className={`text-left rounded-lg p-3 border transition-colors ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50'
                          : isClickable
                          ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          : 'border-slate-200 bg-white cursor-default'
                      }`}
                    >
                      <p className="text-xs text-slate-500 truncate">{loc.name}</p>
                      <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${occupancyColor(pct)}`}>
                        {pct}%
                      </p>
                      <p className="text-xs text-slate-400">
                        {loc.current_occupancy || 0}/{loc.capacity}
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
