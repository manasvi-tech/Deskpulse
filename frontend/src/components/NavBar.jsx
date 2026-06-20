import React from 'react'
import useStore from '../store/useStore'
import { useAnomalies } from '../hooks/useAnomalies'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'simulator', label: 'Simulator' },
]

export default function NavBar({ activePage, setActivePage }) {
  const wsConnected        = useStore((s) => s.wsConnected)
  const locations          = useStore((s) => s.locations)
  const selectedLocationId = useStore((s) => s.selectedLocationId)
  const selectLocation     = useStore((s) => s.selectLocation)
  const { activeCount }    = useAnomalies()

  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800"
      style={{ minWidth: '1280px' }}
    >
      <div className="flex items-center justify-between px-6 h-14">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sky-400 font-bold text-lg tracking-tight font-mono">
            DeskPulse
          </span>

          {/* WS indicator */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              {wsConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />
              )}
            </span>
            <span className={`text-xs font-medium ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
              {wsConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Location selector */}
        <div className="flex-1 mx-6 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {locations.map((loc) => {
              const isSelected = loc.id === selectedLocationId
              return (
                <button
                  key={loc.id}
                  onClick={() => selectLocation(loc.id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  data-testid={`gym-tab-${loc.id}`}
                >
                  {loc.name}
                </button>
              )
            })}
            {locations.length === 0 && (
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-slate-700 rounded h-7 w-24" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Page nav */}
        <div className="flex items-center gap-1 shrink-0">
          {PAGES.map((page) => (
            <button
              key={page.id}
              onClick={() => setActivePage(page.id)}
              className={`relative px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activePage === page.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              data-testid={`nav-${page.id}`}
            >
              {page.label}
              {page.id === 'anomalies' && activeCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {activeCount > 99 ? '99+' : activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
