import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Building2 } from 'lucide-react'

function occupancyBadgeCls(pct) {
  if (pct < 60) return 'text-green-600'
  if (pct <= 85) return 'text-amber-600'
  return 'text-red-600'
}

export default function LocationSwitcher({ user, locations, selectedLocationId, selectLocation, compact = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Frontdesk — static display only
  if (user?.role === 'frontdesk') {
    const loc = locations.find((l) => l.id === user.location_id)
    const name = loc?.name || 'Loading...'
    const displayName = compact ? (name.split('—')[1]?.trim() || name.split(' ')[0]) : name
    return (
      <div className="flex items-center gap-1.5">
        <Building2 size={14} className="text-slate-400 shrink-0" />
        <span className={`text-sm text-slate-600 font-medium ${compact ? 'max-w-[90px] truncate' : ''}`}>
          {displayName}
        </span>
      </div>
    )
  }

  // Super admin — dropdown
  const selected = locations.find((l) => l.id === selectedLocationId)
  const displayName = compact
    ? (selected?.name?.split(' ')[0] || (locations.length === 0 ? '…' : 'Select'))
    : (selected?.name || (locations.length === 0 ? 'Loading…' : 'Select location'))

  return (
    <div className="relative" ref={ref} data-tour="location-switcher">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 font-medium flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer ${compact ? 'max-w-[120px]' : ''}`}
      >
        <span className={compact ? 'truncate' : ''}>{displayName}</span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50 max-h-[60vh] overflow-y-auto ${
            compact
              ? 'fixed left-4 right-4 top-14'
              : 'absolute right-0 top-full mt-2 w-72'
          }`}
        >
          {locations.map((loc) => {
            const pct =
              loc.capacity_pct ??
              Math.round(((loc.current_occupancy || 0) / (loc.capacity || 1)) * 100)
            const isSelected = loc.id === selectedLocationId
            return (
              <button
                key={loc.id}
                onClick={() => {
                  selectLocation(loc.id)
                  setTimeout(() => setOpen(false), 150)
                }}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  isSelected
                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="font-medium">{loc.name}</div>
                  <div className="text-xs text-slate-400">{loc.city}</div>
                </div>
                <span className={`text-xs font-bold shrink-0 ml-2 ${occupancyBadgeCls(pct)}`}>{pct}%</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
