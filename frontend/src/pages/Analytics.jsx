import React, { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import useStore from '../store/useStore'
import { fetchLocationAnalytics, fetchCrossLocation } from '../hooks/useLocationData'
import { ChartErrorBoundary } from '../components/ChartErrorBoundary'

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

const PLAN_COLORS = {
  day_pass:       '#0EA5E9',   // sky-500
  hot_desk:       '#f59e0b',   // amber-400
  dedicated_desk: '#818cf8',   // indigo-400
  private_office: '#f87171',   // red-400
}
const PLAN_LABELS = {
  day_pass:       'Day Pass',
  hot_desk:       'Hot Desk',
  dedicated_desk: 'Dedicated Desk',
  private_office: 'Private Office',
}
const PLAN_KEYS = ['day_pass', 'hot_desk', 'dedicated_desk', 'private_office']

const TOOLTIP_STYLE = {
  contentStyle: { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 },
  labelStyle:   { color: '#0F172A', fontSize: 12 },
  itemStyle:    { fontSize: 12, color: '#374151' },
}

function safeArray(v) { return Array.isArray(v) ? v : [] }
function safeNum(v)   { const n = Number(v); return isFinite(n) ? n : 0 }

function SkeletonBlock({ h = 'h-48' }) {
  return <div className={`animate-pulse bg-slate-200 rounded-lg ${h}`} />
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapCell({ value, max }) {
  if (!value || value === 0) return <div className="w-full h-full rounded-sm bg-slate-100" />
  const opacity = 0.15 + (Math.min(value / Math.max(max, 1), 1)) * 0.85
  return (
    <div
      className="w-full h-full rounded-sm"
      style={{ backgroundColor: `rgba(14, 165, 233, ${opacity.toFixed(2)})` }}
      title={`${value} check-ins`}
    />
  )
}

function PeakHoursHeatmap({ heatmapData }) {
  const rows = safeArray(heatmapData)
  const { matrix, maxVal } = useMemo(() => {
    const m = Array.from({ length: 24 }, () => Array(7).fill(0))
    let max = 1
    for (const row of rows) {
      const h = Number(row.hour_of_day), d = Number(row.day_of_week), c = Number(row.checkin_count || 0)
      if (h >= 0 && h < 24 && d >= 0 && d < 7) { m[h][d] = c; if (c > max) max = c }
    }
    return { matrix: m, maxVal: max }
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex mb-1 ml-12">
          {DAYS.map((d) => <div key={d} className="flex-1 text-center text-xs text-slate-500 font-medium">{d}</div>)}
        </div>
        {HOURS.map((hr, hIdx) => (
          <div key={hr} className="flex items-center mb-0.5">
            <div className="w-11 text-right text-xs text-slate-400 mr-1 shrink-0">{hr}</div>
            {DAYS.map((_, dIdx) => (
              <div key={dIdx} className="flex-1 h-5 px-0.5">
                <HeatmapCell value={matrix[hIdx][dIdx]} max={maxVal} />
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 justify-end">
          <span className="text-slate-400 text-xs">Low</span>
          {[0.15, 0.3, 0.5, 0.7, 0.9].map((o) => (
            <div key={o} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(14, 165, 233, ${o})` }} />
          ))}
          <span className="text-slate-400 text-xs">High</span>
        </div>
      </div>
    </div>
  )
}

// ── Revenue Chart ─────────────────────────────────────────────────────────────

function normaliseRevenue(rawRows) {
  const map = {}
  for (const r of safeArray(rawRows)) {
    const rawDate = r.date
      ? (typeof r.date === 'string' ? r.date.slice(0, 10) : String(r.date).slice(0, 10))
      : ''
    if (!rawDate) continue
    if (!map[rawDate]) map[rawDate] = { _rawDate: rawDate, day_pass: 0, hot_desk: 0, dedicated_desk: 0, private_office: 0 }
    const pt = r.plan_type
    if (PLAN_KEYS.includes(pt)) { map[rawDate][pt] = safeNum(r.revenue) }
    else { map[rawDate].day_pass += safeNum(r.revenue) }
  }
  return Object.values(map)
    .sort((a, b) => a._rawDate.localeCompare(b._rawDate))
    .map((r) => {
      let label
      try { label = new Date(r._rawDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) }
      catch { label = r._rawDate }
      return { date: label, day_pass: r.day_pass, hot_desk: r.hot_desk, dedicated_desk: r.dedicated_desk, private_office: r.private_office }
    })
}

function RevenueChart({ revenueData }) {
  const data = useMemo(() => normaliseRevenue(revenueData), [revenueData])
  if (!data.length) return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
      No revenue data for selected range
    </div>
  )
  return (
    <ChartErrorBoundary>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" angle={-30} textAnchor="end" height={40} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={50} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`₹${Number(v).toLocaleString('en-IN')}`, PLAN_LABELS[name] || name]} />
          <Bar dataKey="day_pass"       stackId="rev" fill={PLAN_COLORS.day_pass}       isAnimationActive={false} />
          <Bar dataKey="hot_desk"       stackId="rev" fill={PLAN_COLORS.hot_desk}       isAnimationActive={false} />
          <Bar dataKey="dedicated_desk" stackId="rev" fill={PLAN_COLORS.dedicated_desk} isAnimationActive={false} />
          <Bar dataKey="private_office" stackId="rev" fill={PLAN_COLORS.private_office} isAnimationActive={false} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-end flex-wrap">
        {PLAN_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PLAN_COLORS[k] }} />
            <span className="text-xs text-slate-500">{PLAN_LABELS[k]}</span>
          </div>
        ))}
      </div>
    </ChartErrorBoundary>
  )
}

// ── Churn Risk Panel ──────────────────────────────────────────────────────────

function ChurnPanel({ churnRisk }) {
  const expiringSoon = safeArray(churnRisk?.expiring_soon)
  const inactive     = safeArray(churnRisk?.inactive)

  if (!expiringSoon.length && !inactive.length) {
    return <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No churn risk members found</div>
  }

  const Section = ({ title, badge, members, renderRow }) => (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-700 text-sm font-medium">{title}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{members.length}</span>
        {badge}
      </div>
      {members.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-slate-400 text-xs font-medium pb-1">Member</th>
              <th className="text-left text-slate-400 text-xs font-medium pb-1">Plan</th>
              <th className="text-left text-slate-400 text-xs font-medium pb-1">Details</th>
            </tr>
          </thead>
          <tbody>{members.slice(0, 8).map(renderRow)}</tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
      <Section
        title="Expiring Soon"
        badge={<span className="text-xs text-amber-600 font-semibold">EXPIRING SOON</span>}
        members={expiringSoon}
        renderRow={(m) => (
          <tr key={m.id} className="border-b border-slate-100">
            <td className="py-1 text-slate-700 text-xs">{m.name || '—'}</td>
            <td className="py-1 text-slate-500 text-xs capitalize">{(m.plan_type || '').replace(/_/g, ' ')}</td>
            <td className="py-1 text-amber-600 text-xs">
              {m.days_until_expiry != null ? `${Math.max(0, Math.round(m.days_until_expiry))}d left` : '—'}
            </td>
          </tr>
        )}
      />
      <Section
        title="Inactive (30+ days)"
        badge={<span className="text-xs text-slate-400 font-semibold">INACTIVE</span>}
        members={inactive}
        renderRow={(m) => (
          <tr key={m.id} className="border-b border-slate-100">
            <td className="py-1 text-slate-700 text-xs">{m.name || '—'}</td>
            <td className="py-1 text-slate-500 text-xs capitalize">{(m.plan_type || '').replace(/_/g, ' ')}</td>
            <td className="py-1 text-slate-400 text-xs">
              {m.days_since_checkin != null ? `${Math.round(m.days_since_checkin)}d ago` : 'Never'}
            </td>
          </tr>
        )}
      />
    </div>
  )
}

// ── Plan Mix Donut ────────────────────────────────────────────────────────────

function RatioDonut({ ratioData }) {
  if (!ratioData || typeof ratioData !== 'object') return <SkeletonBlock h="h-40" />

  const dayPass       = safeNum(ratioData.day_pass_count       ?? 0)
  const hotDesk       = safeNum(ratioData.hot_desk_count       ?? 0)
  const dedicatedDesk = safeNum(ratioData.dedicated_desk_count ?? 0)
  const privateOffice = safeNum(ratioData.private_office_count ?? 0)
  const total         = dayPass + hotDesk + dedicatedDesk + privateOffice

  if (total === 0) return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No membership data available</div>
  )

  const pieData = [
    { name: 'Day Pass',       value: dayPass,       color: PLAN_COLORS.day_pass },
    { name: 'Hot Desk',       value: hotDesk,       color: PLAN_COLORS.hot_desk },
    { name: 'Dedicated Desk', value: dedicatedDesk, color: PLAN_COLORS.dedicated_desk },
    { name: 'Private Office', value: privateOffice, color: PLAN_COLORS.private_office },
  ].filter((d) => d.value > 0)

  return (
    <ChartErrorBoundary>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value" isAnimationActive={false}>
            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v, name) => [`${v} (${Math.round((v / total) * 100)}%)`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 mt-2">
        {pieData.map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-slate-500">{d.name}</span>
            </div>
            <span className="text-xs font-semibold" style={{ color: d.color }}>
              {d.value}
              <span className="text-slate-400 font-normal ml-1">({Math.round((d.value / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </ChartErrorBoundary>
  )
}

// ── Cross-Location Revenue ─────────────────────────────────────────────────────

function CrossLocationChart({ data, loading, error }) {
  const chartData = React.useMemo(() => {
    const rows = safeArray(data)
    if (!rows.length) return []
    return [...rows]
      .map((r) => ({
        shortName: (r.location_name || r.name || r.gym_name || '').replace('WTF Gyms — ', '') || r.location_id?.slice(0, 8) || '?',
        revenue:   safeNum(r.total_revenue ?? r.revenue ?? r.sum ?? 0),
      }))
      .filter((r) => r.shortName)
      .sort((a, b) => b.revenue - a.revenue)
  }, [data])

  if (loading) return <SkeletonBlock h="h-52" />
  if (error)   return <p className="text-red-600 text-sm">⚠️ {error}</p>
  if (!chartData.length) return (
    <p className="text-slate-400 text-sm flex items-center justify-center h-24">No cross-location data available</p>
  )

  return (
    <ChartErrorBoundary>
      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 28 + 20, 200)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="shortName" tick={{ fill: '#64748b', fontSize: 11 }} width={130} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
          <Bar dataKey="revenue" fill="#0EA5E9" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  )
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function Analytics() {
  const selectedLocationId    = useStore((s) => s.selectedLocationId)
  const locations              = useStore((s) => s.locations)
  const crossLocationData      = useStore((s) => s.crossLocationData)
  const crossLocationLoading   = useStore((s) => s.crossLocationLoading)
  const crossLocationError     = useStore((s) => s.crossLocationError)
  const setCrossLocationData   = useStore((s) => s.setCrossLocationData)
  const setCrossLocationLoading = useStore((s) => s.setCrossLocationLoading)
  const setCrossLocationError  = useStore((s) => s.setCrossLocationError)

  const [dateRange, setDateRange]               = useState('30d')
  const [analyticsData, setAnalyticsData]       = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError]     = useState(null)

  const selectedLocation = locations.find((l) => l.id === selectedLocationId)

  useEffect(() => {
    if (!selectedLocationId) return
    let cancelled = false
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    setAnalyticsData(null)

    fetchLocationAnalytics(selectedLocationId, dateRange)
      .then((d) => { if (!cancelled) { setAnalyticsData(d); setAnalyticsLoading(false) } })
      .catch((err) => { if (!cancelled) { setAnalyticsError(err.message || 'Failed to load analytics'); setAnalyticsLoading(false) } })

    return () => { cancelled = true }
  }, [selectedLocationId, dateRange])

  useEffect(() => {
    if (safeArray(crossLocationData).length > 0 || crossLocationLoading) return
    setCrossLocationLoading(true)
    fetchCrossLocation()
      .then((d) => setCrossLocationData(Array.isArray(d) ? d : []))
      .catch((err) => setCrossLocationError(err.message || 'Failed to load cross-location data'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const body        = analyticsData?.analytics ?? analyticsData
  const heatmapData = safeArray(body?.heatmap)
  const revenueData = safeArray(body?.revenue_chart)
  const churnRisk   = body?.churn_risk ?? null
  const ratioData   = body?.member_stats ?? null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
          {selectedLocation && <p className="text-slate-500 text-sm mt-0.5">{selectedLocation.name}</p>}
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                dateRange === r
                  ? 'bg-sky-500 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {analyticsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">⚠️ {analyticsError}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl p-5 border border-slate-200">
          <h2 className="text-slate-900 font-semibold mb-4">Peak Hours Heatmap (Last 7 Days)</h2>
          {analyticsLoading ? <SkeletonBlock h="h-64" /> : <PeakHoursHeatmap heatmapData={heatmapData} />}
        </div>

        <div className="col-span-1 bg-white rounded-xl p-5 border border-slate-200">
          <h2 className="text-slate-900 font-semibold mb-1">Plan Mix</h2>
          <p className="text-slate-400 text-xs mb-3">Active memberships at this location</p>
          {analyticsLoading ? <SkeletonBlock h="h-40" /> : <RatioDonut ratioData={ratioData} />}
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h2 className="text-slate-900 font-semibold mb-4">Daily Revenue (₹)</h2>
        {analyticsLoading ? <SkeletonBlock h="h-52" /> : <RevenueChart revenueData={revenueData} />}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h2 className="text-slate-900 font-semibold mb-3">Churn Risk Members</h2>
          {analyticsLoading ? <SkeletonBlock h="h-48" /> : <ChurnPanel churnRisk={churnRisk} />}
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h2 className="text-slate-900 font-semibold mb-3">Cross-Location Revenue (Last 30 Days)</h2>
          <CrossLocationChart data={crossLocationData} loading={crossLocationLoading} error={crossLocationError} />
        </div>
      </div>
    </div>
  )
}
