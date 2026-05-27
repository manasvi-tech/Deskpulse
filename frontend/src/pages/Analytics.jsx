// ⚠️ PATCH-v6 — Revenue chart now uses stacked bars broken down by plan type.
// Backend now returns [{ date, plan_type, revenue, payment_count }] (shape-B).
// normaliseRevenue() pivots multiple rows per date into { date, monthly, quarterly, annual }.
// member_stats has monthly_count/quarterly_count/annual_count — no new/renewal keys.
console.log('%c✅ ANALYTICS PATCH-v6 LOADED — stacked revenue chart by plan type', 'color:#2dd4bf;font-weight:bold;font-size:13px')

import React, { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import useStore from '../store/useStore'
import { fetchGymAnalytics, fetchCrossGym } from '../hooks/useGymData'
import { ChartErrorBoundary } from '../components/ChartErrorBoundary'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

const PLAN_COLORS = {
  monthly:   '#2dd4bf',   // teal-400
  quarterly: '#f59e0b',   // amber-400
  annual:    '#818cf8',   // indigo-400
}
// Three slices: monthly / quarterly / annual
const PIE_COLORS = ['#2dd4bf', '#f59e0b', '#818cf8']

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

function safeNum(v) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function SkeletonBlock({ h = 'h-48' }) {
  return <div className={`animate-pulse bg-slate-700 rounded-lg ${h}`} />
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapCell({ value, max }) {
  if (!value || value === 0) {
    return <div className="w-full h-full rounded-sm bg-slate-800" />
  }
  const opacity = 0.15 + (Math.min(value / Math.max(max, 1), 1)) * 0.85
  return (
    <div
      className="w-full h-full rounded-sm"
      style={{ backgroundColor: `rgba(45, 212, 191, ${opacity.toFixed(2)})` }}
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
      const h = Number(row.hour_of_day)
      const d = Number(row.day_of_week)
      const c = Number(row.checkin_count || 0)
      if (h >= 0 && h < 24 && d >= 0 && d < 7) {
        m[h][d] = c
        if (c > max) max = c
      }
    }
    return { matrix: m, maxVal: max }
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex mb-1 ml-12">
          {DAYS.map((d) => (
            <div key={d} className="flex-1 text-center text-xs text-slate-400 font-medium">
              {d}
            </div>
          ))}
        </div>
        {HOURS.map((hr, hIdx) => (
          <div key={hr} className="flex items-center mb-0.5">
            <div className="w-11 text-right text-xs text-slate-600 mr-1 shrink-0">{hr}</div>
            {DAYS.map((_, dIdx) => (
              <div key={dIdx} className="flex-1 h-5 px-0.5">
                <HeatmapCell value={matrix[hIdx][dIdx]} max={maxVal} />
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 justify-end">
          <span className="text-slate-600 text-xs">Low</span>
          {[0.15, 0.3, 0.5, 0.7, 0.9].map((o) => (
            <div
              key={o}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: `rgba(45, 212, 191, ${o})` }}
            />
          ))}
          <span className="text-slate-600 text-xs">High</span>
        </div>
      </div>
    </div>
  )
}

// ── Revenue Chart ─────────────────────────────────────────────────────────────
//
// API shape (shape-B): [{ date, plan_type, revenue, payment_count }]
// Multiple rows per date, one per plan_type. Pivoted into stacked bars.
// Also handles shape-A (single total per day) gracefully as a fallback.

function normaliseRevenue(rawRows) {
  // Pivot shape-B rows into { date, monthly, quarterly, annual }
  const map = {}
  for (const r of safeArray(rawRows)) {
    const rawDate = r.date
      ? (typeof r.date === 'string' ? r.date.slice(0, 10) : String(r.date).slice(0, 10))
      : ''
    if (!rawDate) continue
    if (!map[rawDate]) map[rawDate] = { _rawDate: rawDate, monthly: 0, quarterly: 0, annual: 0 }
    const pt = r.plan_type
    if (pt === 'monthly' || pt === 'quarterly' || pt === 'annual') {
      map[rawDate][pt] = safeNum(r.revenue)
    } else {
      // shape-A fallback: single total in 'monthly' slot so something renders
      map[rawDate].monthly += safeNum(r.revenue)
    }
  }
  return Object.values(map)
    .sort((a, b) => a._rawDate.localeCompare(b._rawDate))
    .map((r) => {
      let label
      try {
        label = new Date(r._rawDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      } catch {
        label = r._rawDate
      }
      return { date: label, monthly: r.monthly, quarterly: r.quarterly, annual: r.annual }
    })
}

function RevenueChart({ revenueData }) {
  const data = useMemo(() => normaliseRevenue(revenueData), [revenueData])

  React.useEffect(() => {
    console.log('[RevenueChart] data items:', data.length, '| sample:', data[0])
  }, [data])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No revenue data for selected range
      </div>
    )
  }

  return (
    <ChartErrorBoundary>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748b', fontSize: 10 }}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            contentStyle={{ background: '#1A1A2E', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0', fontSize: 12 }}
            itemStyle={{ fontSize: 12 }}
            formatter={(v, name) => [
              `₹${Number(v).toLocaleString('en-IN')}`,
              name.charAt(0).toUpperCase() + name.slice(1),
            ]}
          />
          {/* Stacked bars — one per plan type. isAnimationActive=false to avoid
              Recharts rAF callbacks crashing outside React's render cycle. */}
          <Bar dataKey="monthly"   stackId="rev" fill={PLAN_COLORS.monthly}   name="monthly"   isAnimationActive={false} />
          <Bar dataKey="quarterly" stackId="rev" fill={PLAN_COLORS.quarterly} name="quarterly" isAnimationActive={false} />
          <Bar dataKey="annual"    stackId="rev" fill={PLAN_COLORS.annual}    name="annual"    isAnimationActive={false} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {/* Manual legend — Recharts Legend component is avoided (v2.x bug with filter) */}
      <div className="flex gap-4 mt-2 justify-end">
        {[
          { key: 'monthly',   label: 'Monthly',   color: PLAN_COLORS.monthly },
          { key: 'quarterly', label: 'Quarterly', color: PLAN_COLORS.quarterly },
          { key: 'annual',    label: 'Annual',    color: PLAN_COLORS.annual },
        ].map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-slate-400">{l.label}</span>
          </div>
        ))}
      </div>
    </ChartErrorBoundary>
  )
}

// ── Churn Risk Panel ──────────────────────────────────────────────────────────

function ChurnPanel({ churnData }) {
  const rows = safeArray(churnData)

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        No churn risk members found
      </div>
    )
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.last_checkin_at) - new Date(b.last_checkin_at)
  )

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left text-slate-400 text-xs font-medium pb-2">Member</th>
            <th className="text-left text-slate-400 text-xs font-medium pb-2">Last Check-in</th>
            <th className="text-left text-slate-400 text-xs font-medium pb-2">Days Ago</th>
            <th className="text-left text-slate-400 text-xs font-medium pb-2">Risk</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const daysAgo = m.last_checkin_at
              ? Math.floor((Date.now() - new Date(m.last_checkin_at).getTime()) / 86400000)
              : 0
            const isCritical = daysAgo >= 60
            return (
              <tr key={m.id} className="border-b border-slate-800/50">
                <td className="py-1.5 text-slate-200 font-medium">{m.name || '—'}</td>
                <td className="py-1.5 text-slate-400 text-xs">
                  {m.last_checkin_at
                    ? new Date(m.last_checkin_at).toLocaleDateString('en-IN')
                    : '—'}
                </td>
                <td className="py-1.5 text-slate-400 text-xs">{daysAgo}d</td>
                <td className="py-1.5">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isCritical
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {isCritical ? 'CRITICAL' : 'HIGH'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Plan Mix Donut ────────────────────────────────────────────────────────────
//
// API shape (member_stats): {
//   total_members, active_members, inactive_members, frozen_members,
//   monthly_count, quarterly_count, annual_count,
//   monthly_pct, quarterly_pct, annual_pct
// }
// No new/renewal breakdown in the API — show plan type distribution instead.

function RatioDonut({ ratioData }) {
  if (!ratioData || typeof ratioData !== 'object') return <SkeletonBlock h="h-40" />

  const monthly   = safeNum(ratioData.monthly_count   ?? 0)
  const quarterly = safeNum(ratioData.quarterly_count ?? 0)
  const annual    = safeNum(ratioData.annual_count    ?? 0)
  const total     = monthly + quarterly + annual

  React.useEffect(() => {
    console.log('[RatioDonut] monthly:', monthly, 'quarterly:', quarterly, 'annual:', annual)
  }, [monthly, quarterly, annual])

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No membership data available
      </div>
    )
  }

  const pieData = [
    { name: 'Monthly',   value: monthly,   color: PIE_COLORS[0] },
    { name: 'Quarterly', value: quarterly, color: PIE_COLORS[1] },
    { name: 'Annual',    value: annual,    color: PIE_COLORS[2] },
  ].filter((d) => d.value > 0)

  return (
    <ChartErrorBoundary>
      {/* PieChart WITHOUT <Legend> — Recharts 2.x Legend calls .filter() on
          uninitialised graphical items; replaced with a manual colour key. */}
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
            paddingAngle={4}
            dataKey="value"
            isAnimationActive={false}
          >
            {pieData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1A1A2E', border: '1px solid #334155', borderRadius: 8 }}
            formatter={(v, name) => [
              `${v} (${Math.round((v / total) * 100)}%)`,
              name,
            ]}
            itemStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Manual legend */}
      <div className="flex flex-col gap-1.5 mt-2">
        {pieData.map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-slate-400">{d.name}</span>
            </div>
            <span className="text-xs font-semibold" style={{ color: d.color }}>
              {d.value}
              <span className="text-slate-600 font-normal ml-1">
                ({Math.round((d.value / total) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </ChartErrorBoundary>
  )
}

// ── Cross-Gym Revenue ─────────────────────────────────────────────────────────

function CrossGymChart({ data, loading, error }) {
  // Hooks MUST be called unconditionally — before any early returns
  const chartData = React.useMemo(() => {
    const rows = safeArray(data)
    if (!rows.length) return []
    return [...rows]
      .map((r) => ({
        shortName:
          (r.gym_name || r.name || '').replace('WTF Gyms — ', '') ||
          r.gym_id?.slice(0, 8) ||
          '?',
        revenue: safeNum(r.total_revenue ?? r.revenue ?? r.sum ?? 0),
      }))
      .filter((r) => r.shortName)
      .sort((a, b) => b.revenue - a.revenue)
  }, [data])

  // ── Diagnostic marker ────────────────────────────────────────────────────
  React.useEffect(() => {
    console.log('[CrossGymChart] mounted — rows:', safeArray(data).length, '→ chartData:', chartData.length)
  }, [data, chartData])

  if (loading) return <SkeletonBlock h="h-52" />
  if (error) return <p className="text-red-400 text-sm">⚠️ {error}</p>
  if (!chartData.length) {
    return (
      <p className="text-slate-500 text-sm flex items-center justify-center h-24">
        No cross-gym data available
      </p>
    )
  }

  return (
    <ChartErrorBoundary>
      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 28 + 20, 200)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            width={110}
          />
          <Tooltip
            contentStyle={{ background: '#1A1A2E', border: '1px solid #334155', borderRadius: 8 }}
            formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']}
            labelStyle={{ color: '#e2e8f0', fontSize: 12 }}
            itemStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="revenue" fill="#2dd4bf" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  )
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function Analytics() {
  const selectedGymId = useStore((s) => s.selectedGymId)
  const gyms = useStore((s) => s.gyms)
  const crossGymData = useStore((s) => s.crossGymData)
  const crossGymLoading = useStore((s) => s.crossGymLoading)
  const crossGymError = useStore((s) => s.crossGymError)
  const setCrossGymData = useStore((s) => s.setCrossGymData)
  const setCrossGymLoading = useStore((s) => s.setCrossGymLoading)
  const setCrossGymError = useStore((s) => s.setCrossGymError)

  const [dateRange, setDateRange] = useState('30d')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)

  const selectedGym = gyms.find((g) => g.id === selectedGymId)

  // Fetch per-gym analytics when gym or date range changes
  useEffect(() => {
    if (!selectedGymId) return
    let cancelled = false
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    setAnalyticsData(null)

    fetchGymAnalytics(selectedGymId, dateRange)
      .then((d) => {
        if (!cancelled) {
          setAnalyticsData(d)
          setAnalyticsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAnalyticsError(err.message || 'Failed to load analytics')
          setAnalyticsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [selectedGymId, dateRange])

  // Fetch cross-gym data once (cached in store)
  useEffect(() => {
    if (safeArray(crossGymData).length > 0 || crossGymLoading) return
    setCrossGymLoading(true)
    fetchCrossGym()
      .then((d) => setCrossGymData(Array.isArray(d) ? d : safeArray(d?.data ?? d?.gyms ?? [])))
      .catch((err) => setCrossGymError(err.message || 'Failed to load cross-gym data'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // API returns { analytics: { heatmap, revenue_chart, churn_risk, member_stats } }
  // Unwrap the outer envelope; fall back to root if the backend ever changes.
  const body        = analyticsData?.analytics ?? analyticsData
  const heatmapData = safeArray(body?.heatmap)
  const revenueData = safeArray(body?.revenue_chart)   // ← was 'revenue'
  const churnData   = safeArray(body?.churn_risk)      // ← was 'churn'
  const ratioData   = body?.member_stats ?? null       // ← was 'ratio'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Analytics</h1>
          {selectedGym && (
            <p className="text-slate-400 text-sm mt-0.5">{selectedGym.name}</p>
          )}
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                dateRange === r
                  ? 'bg-teal-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {analyticsError && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 text-sm">
          ⚠️ {analyticsError}
        </div>
      )}

      {/* Row 1: Heatmap + Ratio donut */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
          <h2 className="text-slate-200 font-semibold mb-4">Peak Hours Heatmap (Last 7 Days)</h2>
          {analyticsLoading ? (
            <SkeletonBlock h="h-64" />
          ) : (
            <PeakHoursHeatmap heatmapData={heatmapData} />
          )}
        </div>

        <div className="col-span-1 bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
          <h2 className="text-slate-200 font-semibold mb-1">Plan Mix</h2>
          <p className="text-slate-500 text-xs mb-3">All members at this gym</p>
          {analyticsLoading ? (
            <SkeletonBlock h="h-40" />
          ) : (
            <RatioDonut ratioData={ratioData} />
          )}
        </div>
      </div>

      {/* Row 2: Revenue chart */}
      <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
        <h2 className="text-slate-200 font-semibold mb-4">Daily Revenue (₹)</h2>
        {analyticsLoading ? (
          <SkeletonBlock h="h-52" />
        ) : (
          <RevenueChart revenueData={revenueData} />
        )}
      </div>

      {/* Row 3: Churn Risk + Cross-gym */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-200 font-semibold">Churn Risk Members</h2>
            {!analyticsLoading && churnData.length > 0 && (
              <span className="text-xs text-slate-500">{churnData.length} at risk</span>
            )}
          </div>
          {analyticsLoading ? (
            <SkeletonBlock h="h-48" />
          ) : (
            <ChurnPanel churnData={churnData} />
          )}
        </div>

        <div className="bg-[#1A1A2E] rounded-xl p-5 border border-slate-800">
          <h2 className="text-slate-200 font-semibold mb-3">
            Cross-Gym Revenue (Last 30 Days)
          </h2>
          <CrossGymChart
            data={crossGymData}
            loading={crossGymLoading}
            error={crossGymError}
          />
        </div>
      </div>
    </div>
  )
}
