import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  X,
  UserPlus,
  UserCheck,
  Users,
  MapPin,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react'
import { DemoModal } from '../components/DemoModal'
import useStore from '../store/useStore'
import { API_BASE } from '../config/api.js'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

const PLAN_PRICE = {
  day_pass:       499,
  hot_desk:       3999,
  dedicated_desk: 7999,
  private_office: 24999,
}

const PLAN_DURATION_LABEL = {
  day_pass:       '1 day',
  hot_desk:       '30 days',
  dedicated_desk: '30 days',
  private_office: '30 days',
}

const PLAN_COLOR = {
  day_pass:       'bg-slate-100 text-slate-600',
  hot_desk:       'bg-sky-50 text-sky-700',
  dedicated_desk: 'bg-indigo-50 text-indigo-700',
  private_office: 'bg-violet-50 text-violet-700',
}

function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase()
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function daysFromNow(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function StatusBadge({ status }) {
  const map = {
    checked_in:    { cls: 'bg-green-50 text-green-700 border border-green-200',  label: 'In Office' },
    active:        { cls: 'bg-slate-50 text-slate-600 border border-slate-200',  label: 'Active' },
    expiring_soon: { cls: 'bg-amber-50 text-amber-700 border border-amber-200',  label: 'Expiring Soon' },
    expired:       { cls: 'bg-red-50 text-red-600 border border-red-200',        label: 'Expired' },
    inactive:      { cls: 'bg-slate-100 text-slate-500 border border-slate-200', label: 'Inactive' },
    frozen:        { cls: 'bg-blue-50 text-blue-600 border border-blue-200',     label: 'Frozen' },
  }
  const entry = map[status] || map.active
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

export default function Members() {
  const user         = useStore((s) => s.user)
  const locations    = useStore((s) => s.locations)
  const activityFeed = useStore((s) => s.activityFeed)

  // ── Left panel ──────────────────────────────────────────────────────────────
  const [members, setMembers]                 = useState([])
  const [pagination, setPagination]           = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const [listLoading, setListLoading]         = useState(true)
  const [listError, setListError]             = useState(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [locationFilter, setLocationFilter]   = useState('')
  const [page, setPage]                       = useState(1)
  const [selectedMember, setSelectedMember]   = useState(null)

  // ── Mobile detail overlay ───────────────────────────────────────────────────
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  // ── Right panel ─────────────────────────────────────────────────────────────
  const [checkinStatus, setCheckinStatus]             = useState(null)
  const [checkinLoading, setCheckinLoading]           = useState(false)
  const [checkinActionLoading, setCheckinActionLoading] = useState(false)
  const [checkinError, setCheckinError]               = useState(null)
  const [renewOpen, setRenewOpen]                     = useState(false)
  const [renewPlan, setRenewPlan]                     = useState(null)
  const [renewLoading, setRenewLoading]               = useState(false)
  const [renewSuccess, setRenewSuccess]               = useState(false)
  const [statusValue, setStatusValue]                 = useState('')
  const [statusLoading, setStatusLoading]             = useState(false)
  const [deleteConfirm, setDeleteConfirm]             = useState(false)
  const [deleteLoading, setDeleteLoading]             = useState(false)
  const [demoModal, setDemoModal]                     = useState(null)

  const isSuperAdmin = user?.role === 'super_admin'

  // ── Debounce search ─────────────────────────────────────────────────────────
  const searchTimer = useRef(null)
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  // ── Fetch member list ───────────────────────────────────────────────────────
  const fetchMembers = useCallback(() => {
    setListLoading(true)
    setListError(null)
    const params = new URLSearchParams({ page, limit: 20 })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (locationFilter)  params.set('location_id', locationFilter)

    fetch(`${API_BASE}/api/members?${params}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setMembers(Array.isArray(data.members) ? data.members : [])
        setPagination(data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 })
        setListLoading(false)
      })
      .catch((err) => {
        setListError(err.message)
        setListLoading(false)
      })
  }, [page, debouncedSearch, locationFilter])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // ── Fetch check-in status when member is selected ───────────────────────────
  useEffect(() => {
    if (!selectedMember) {
      setCheckinStatus(null)
      return
    }
    setCheckinLoading(true)
    setCheckinError(null)
    setCheckinActionLoading(false)
    setRenewOpen(false)
    setRenewSuccess(false)
    setDeleteConfirm(false)
    setStatusValue(selectedMember.status || 'active')
    setRenewPlan(selectedMember.plan_type || 'hot_desk')

    fetch(`${API_BASE}/api/checkins/status/${selectedMember.id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setCheckinStatus(data)
        setCheckinLoading(false)
      })
      .catch(() => setCheckinLoading(false))
  }, [selectedMember?.id])

  // ── WebSocket: watch activityFeed for check-in / checkout events ────────────
  const prevFeedLen = useRef(activityFeed.length)
  useEffect(() => {
    if (activityFeed.length <= prevFeedLen.current) {
      prevFeedLen.current = activityFeed.length
      return
    }
    prevFeedLen.current = activityFeed.length

    const latest = activityFeed[0]
    if (!latest || (latest.kind !== 'checkin' && latest.kind !== 'checkout')) return

    setMembers((prev) =>
      prev.map((m) => {
        if (m.name !== latest.memberName) return m
        if (latest.kind === 'checkin') {
          return { ...m, display_status: 'checked_in', active_checkin_id: 'ws', checked_in_at: latest.timestamp }
        }
        return { ...m, display_status: m.status || 'active', active_checkin_id: null, checked_in_at: null }
      })
    )

    if (selectedMember && selectedMember.name === latest.memberName) {
      fetch(`${API_BASE}/api/checkins/status/${selectedMember.id}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => setCheckinStatus(data))
        .catch(() => {})
    }
  }, [activityFeed])

  // ── Check In ────────────────────────────────────────────────────────────────
  const handleCheckIn = () => {
    if (!selectedMember) return
    setCheckinActionLoading(true)
    setCheckinError(null)
    fetch(`${API_BASE}/api/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ member_id: selectedMember.id }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to check in')
        return fetch(`${API_BASE}/api/checkins/status/${selectedMember.id}`, { credentials: 'include' }).then((r) => r.json())
      })
      .then((status) => {
        setCheckinStatus(status)
        setCheckinActionLoading(false)
        setMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id
              ? { ...m, display_status: 'checked_in', active_checkin_id: status.checkin_id, checked_in_at: status.checked_in_at }
              : m
          )
        )
      })
      .catch((err) => {
        setCheckinError(err.message)
        setCheckinActionLoading(false)
      })
  }

  // ── Check Out ────────────────────────────────────────────────────────────────
  const handleCheckOut = () => {
    if (!selectedMember) return
    setCheckinActionLoading(true)
    setCheckinError(null)
    fetch(`${API_BASE}/api/checkins/checkout/${selectedMember.id}`, {
      method: 'PATCH',
      credentials: 'include',
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to check out')
        setCheckinStatus({ isCheckedIn: false, checkin_id: null, checked_in_at: null })
        setCheckinActionLoading(false)
        setMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id
              ? { ...m, display_status: m.status || 'active', active_checkin_id: null, checked_in_at: null }
              : m
          )
        )
      })
      .catch((err) => {
        setCheckinError(err.message)
        setCheckinActionLoading(false)
      })
  }

  // ── Renew / change plan ──────────────────────────────────────────────────────
  const handleRenew = () => {
    if (!selectedMember || !renewPlan) return
    if (DEMO_MODE) { setDemoModal('renew or change this membership plan'); return }
    setRenewLoading(true)
    fetch(`${API_BASE}/api/members/${selectedMember.id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ plan_type: renewPlan }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to renew')
        const newMs = data.membership
        setRenewOpen(false)
        setRenewLoading(false)
        setRenewSuccess(true)
        setSelectedMember((prev) => ({
          ...prev,
          plan_type:        newMs.plan_type,
          start_date:       newMs.start_date,
          end_date:         newMs.end_date,
          membership_status: newMs.status,
          display_status:   prev.display_status === 'expired' || prev.display_status === 'expiring_soon'
            ? 'active' : prev.display_status,
        }))
        setMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id
              ? {
                  ...m,
                  plan_type:        newMs.plan_type,
                  start_date:       newMs.start_date,
                  end_date:         newMs.end_date,
                  membership_status: newMs.status,
                  display_status:   m.display_status === 'expired' || m.display_status === 'expiring_soon'
                    ? 'active' : m.display_status,
                }
              : m
          )
        )
        setTimeout(() => setRenewSuccess(false), 4000)
      })
      .catch((err) => {
        setRenewLoading(false)
        alert(err.message)
      })
  }

  // ── Status change ────────────────────────────────────────────────────────────
  const handleStatusChange = () => {
    if (!selectedMember || !statusValue) return
    if (DEMO_MODE) { setDemoModal('change member status'); return }
    setStatusLoading(true)
    fetch(`${API_BASE}/api/members/${selectedMember.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: statusValue }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to update status')
        const updated = data.member
        setSelectedMember((prev) => ({ ...prev, status: updated.status }))
        setMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id ? { ...m, status: updated.status } : m
          )
        )
        setStatusLoading(false)
      })
      .catch((err) => {
        setStatusLoading(false)
        alert(err.message)
      })
  }

  // ── Deactivate member ────────────────────────────────────────────────────────
  const handleDeactivate = () => {
    if (!selectedMember) return
    setDeleteLoading(true)
    fetch(`${API_BASE}/api/members/${selectedMember.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to deactivate')
        setDeleteLoading(false)
        setDeleteConfirm(false)
        setSelectedMember(null)
        setMobileDetailOpen(false)
        fetchMembers()
      })
      .catch((err) => {
        setDeleteLoading(false)
        alert(err.message)
      })
  }

  const { total, totalPages } = pagination
  const startIdx = total === 0 ? 0 : (page - 1) * 20 + 1
  const endIdx   = Math.min(page * 20, total)

  // ── Render detail content (shared between desktop panel and mobile overlay) ──
  const renderDetailContent = () => {
    if (!selectedMember) {
      return (
        <div className="h-full bg-white flex flex-col items-center justify-center text-center p-8">
          <UserCheck size={40} className="text-slate-200 mb-3" />
          <p className="text-lg text-slate-400 font-medium">Select a member</p>
          <p className="text-sm text-slate-300 mt-1">Click any member to view details</p>
        </div>
      )
    }

    return (
      <>
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-white" data-tour="member-detail">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-xl font-semibold text-slate-600 shrink-0 select-none">
              {initials(selectedMember.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-slate-900">{selectedMember.name}</h2>
                <StatusBadge status={selectedMember.display_status} />
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{selectedMember.email}</p>
              {selectedMember.phone && (
                <p className="text-sm text-slate-500">{selectedMember.phone}</p>
              )}
              {selectedMember.location_name && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-400">{selectedMember.location_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Check-in status card */}
        <div className="mx-6 mt-6">
          {checkinLoading ? (
            <div className="p-4 rounded-xl border border-slate-200 animate-pulse bg-slate-100 h-20" />
          ) : checkinStatus?.isCheckedIn ? (
            <div className="p-4 rounded-xl border border-green-200 bg-green-50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm font-medium text-green-700">Currently In Office</span>
              </div>
              {checkinStatus.checked_in_at && (
                <p className="text-xs text-green-600 mt-1 ml-4">
                  Checked in at {formatTime(checkinStatus.checked_in_at)}
                </p>
              )}
              {checkinError && (
                <p className="text-xs text-red-600 mt-2">{checkinError}</p>
              )}
              <button
                onClick={handleCheckOut}
                disabled={checkinActionLoading}
                className="w-full mt-3 bg-white border border-green-300 text-green-700 hover:bg-green-50 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkinActionLoading ? 'Processing...' : 'Check Out'}
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                <span className="text-sm font-medium text-slate-600">Not In Office</span>
              </div>
              {checkinError && (
                <p className="text-xs text-red-600 mt-2">{checkinError}</p>
              )}
              <button
                onClick={handleCheckIn}
                disabled={checkinActionLoading || selectedMember.status !== 'active'}
                className="w-full mt-3 bg-sky-500 hover:bg-sky-600 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkinActionLoading ? 'Processing...' : 'Check In'}
              </button>
              {selectedMember.status !== 'active' && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  Member must be active to check in
                </p>
              )}
            </div>
          )}
        </div>

        {/* Membership card */}
        <div className="mx-6 mt-4 p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-sm font-semibold text-slate-700 mb-3">Current Membership</p>

          {renewSuccess && (
            <div className="mb-3 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              Membership renewed successfully
            </div>
          )}

          {selectedMember.plan_type ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${PLAN_COLOR[selectedMember.plan_type] || 'bg-slate-100 text-slate-600'}`}>
                    {selectedMember.plan_type.replace(/_/g, ' ')}
                  </span>
                  <p className="text-xs text-slate-500 mt-2">
                    Started {formatDate(selectedMember.start_date)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Expires {formatDate(selectedMember.end_date)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {(() => {
                    const days = daysFromNow(selectedMember.end_date)
                    if (days === null) return null
                    if (days > 7)  return <span className="text-xs text-green-600 font-medium">{days} days left</span>
                    if (days > 0)  return <span className="text-xs text-amber-600 font-medium">{days} days left</span>
                    return <span className="text-xs text-red-600 font-medium">Expired {Math.abs(days)} days ago</span>
                  })()}
                </div>
              </div>

              <button
                onClick={() => {
                  if (DEMO_MODE) { setDemoModal('renew or change this membership plan'); return }
                  setRenewOpen((o) => !o)
                }}
                className="w-full mt-3 flex items-center justify-center bg-white border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-700 hover:text-sky-700 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw size={14} className="mr-1.5" />
                Renew / Change Plan
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">No active membership</p>
              <button
                onClick={() => {
                  if (DEMO_MODE) { setDemoModal('add a membership plan'); return }
                  setRenewOpen((o) => !o)
                }}
                className="w-full mt-3 flex items-center justify-center bg-white border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-700 hover:text-sky-700 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw size={14} className="mr-1.5" />
                Add Membership
              </button>
            </>
          )}

          {/* Inline renew modal */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              renewOpen ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <p className="text-sm font-semibold text-slate-700 mb-3">Renew or Change Plan</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PLAN_PRICE).map(([plan, price]) => (
                  <button
                    key={plan}
                    onClick={() => setRenewPlan(plan)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      renewPlan === plan
                        ? 'border-sky-500 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800 capitalize">
                      {plan.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-semibold text-sky-600">
                      &#8377;{price.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-slate-400">{PLAN_DURATION_LABEL[plan]}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={handleRenew}
                disabled={renewLoading}
                className="w-full mt-3 bg-sky-500 hover:bg-sky-600 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {renewLoading
                  ? 'Processing...'
                  : `Confirm Renewal — ₹${(PLAN_PRICE[renewPlan] || 0).toLocaleString('en-IN')}`}
              </button>
              <button
                onClick={() => setRenewOpen(false)}
                className="w-full mt-2 text-sm text-slate-400 hover:text-slate-600 text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Member status edit */}
        <div className="mx-6 mt-4 p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-sm font-semibold text-slate-700 mb-3">Member Status</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-slate-500">Current:</span>
            <StatusBadge status={selectedMember.display_status} />
          </div>
          <select
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="frozen">Frozen</option>
          </select>
          <button
            onClick={handleStatusChange}
            disabled={statusLoading || statusValue === selectedMember.status}
            className="w-full mt-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {statusLoading ? 'Saving...' : 'Apply Status Change'}
          </button>
        </div>

        {/* Danger zone */}
        <div className="mx-6 mt-4 mb-6 p-4 rounded-xl border border-red-100 bg-red-50">
          <p className="text-sm font-semibold text-red-700 mb-1">Danger Zone</p>
          <p className="text-xs text-red-500 mb-3">
            Deactivating a member will cancel their active membership.
          </p>
          {deleteConfirm ? (
            <div className="space-y-2">
              <p className="text-xs text-red-600 font-medium">
                Are you sure? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeactivate}
                  disabled={deleteLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? 'Deactivating...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (DEMO_MODE) { setDemoModal('deactivate this member'); return }
                setDeleteConfirm(true)
              }}
              className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Deactivate Member
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex overflow-hidden bg-slate-50" style={{ height: 'calc(100vh - 56px)' }}>
      {demoModal && <DemoModal action={demoModal} onClose={() => setDemoModal(null)} />}

      {/* ── Mobile Full-Screen Detail Overlay ───────────────────────────────── */}
      <div
        className={`lg:hidden fixed inset-0 bg-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          mobileDetailOpen && selectedMember ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Back button bar */}
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
          <button
            onClick={() => setMobileDetailOpen(false)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Members</span>
          </button>
        </div>
        {/* Scrollable detail content */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {renderDetailContent()}
        </div>
      </div>

      {/* ── LEFT PANEL — Member List ─────────────────────────────────────── */}
      <div className="flex flex-col border-r border-slate-200 bg-white shrink-0 w-full lg:w-[55%]">

        {/* Header */}
        <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-3 lg:pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Members</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {listLoading ? 'Loading...' : `${total.toLocaleString()} members`}
              </p>
            </div>
            <button
              onClick={() => setDemoModal('add a new member')}
              className="flex items-center bg-sky-500 hover:bg-sky-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              <UserPlus size={14} className="mr-1.5" />
              Add Member
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 lg:px-6 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Location filter — super_admin only */}
        {isSuperAdmin && (
          <div className="px-4 lg:px-6 pb-3">
            <select
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setPage(1) }}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Member list — scrollable */}
        <div className="flex-1 overflow-y-auto" data-tour="members-list">
          {listError ? (
            <div className="px-4 lg:px-6 py-4 text-sm text-red-600 bg-red-50 border-b border-red-100">
              Failed to load members: {listError}
            </div>
          ) : listLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="px-4 lg:px-6 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full animate-pulse bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="animate-pulse bg-slate-200 rounded h-3 w-2/5" />
                  <div className="animate-pulse bg-slate-200 rounded h-3 w-3/5" />
                </div>
                <div className="animate-pulse bg-slate-200 rounded-full h-5 w-16 shrink-0" />
              </div>
            ))
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Users size={32} className="text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm font-medium">No members found</p>
              {debouncedSearch && (
                <p className="text-slate-400 text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            members.map((m) => {
              const isSelected = selectedMember?.id === m.id
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    setSelectedMember(m)
                    setMobileDetailOpen(true)
                  }}
                  className={`px-4 lg:px-6 py-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50 border-l-2 border-l-sky-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-medium shrink-0 select-none">
                    {initials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-500 truncate">{m.email}</p>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={m.display_status} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {!listLoading && total > 0 && (
          <div className="px-4 lg:px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
            <p className="text-xs sm:text-sm text-slate-500">
              {startIdx}–{endIdx} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-sm text-slate-700 font-medium px-1">{page}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL — Member Detail (desktop only) ───────────────────── */}
      <div className="hidden lg:flex flex-1 overflow-y-auto bg-slate-50 flex-col">
        {renderDetailContent()}
      </div>
    </div>
  )
}
