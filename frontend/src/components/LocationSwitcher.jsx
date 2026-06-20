import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Building2 } from 'lucide-react'

function occupancyBadgeCls(pct) {
  if (pct < 60) return 'text-green-600'
  if (pct <= 85) return 'text-amber-600'
  return 'text-red-600'
}

export default function LocationSwitcher({ user, locations, selectedLocationId, selectLocation }) {
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
    return (
      <div className="flex items-center gap-1.5">
        <Building2 size={14} className="text-slate-400 shrink-0" />
        <span className="text-sm text-slate-600 font-medium">{loc?.name || 'Loading...'}</span>
      </div>
    )
  }

  // Super admin — dropdown
  const selected = locations.find((l) => l.id === selectedLocationId)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 font-medium flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span>{selected?.name || (locations.length === 0 ? 'Loading…' : 'Select location')}</span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-72 z-50"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 200ms, transform 200ms',
          }}
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
                <span className={`text-xs font-bold ${occupancyBadgeCls(pct)}`}>{pct}%</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
