import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart2,
  AlertTriangle,
  Play,
  Users,
  UserCheck,
  ChevronRight,
  ChevronDown,
  LogOut,
  UserPlus,
  List,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { useLocationData } from '../hooks/useLocationData'
import { useAnomalies } from '../hooks/useAnomalies'
import useStore from '../store/useStore'
import DemoBanner from './DemoBanner'
import LocationSwitcher from './LocationSwitcher'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const SIDEBAR_FONT = { fontFamily: "'DM Sans', sans-serif" }

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/analytics': 'Analytics',
  '/anomalies': 'Anomalies',
  '/members': 'Members',
  '/simulator': 'Simulator',
  '/users': 'Users',
}

export default function Layout() {
  const { user, logout }              = useAuth()
  const navigate                       = useNavigate()
  const { pathname }                   = useLocation()
  const locations                      = useStore((s) => s.locations)
  const selectedLocationId             = useStore((s) => s.selectedLocationId)
  const selectLocation                 = useStore((s) => s.selectLocation)
  const sidebarExpanded                = useStore((s) => s.sidebarExpanded)
  const toggleSidebar                  = useStore((s) => s.toggleSidebar)
  const wsConnected                    = useStore((s) => s.wsConnected)
  const { activeCount }                = useAnomalies()
  const [membersOpen, setMembersOpen]  = useState(false)
  const [tooltip, setTooltip]          = useState({ label: '', y: 0 })

  useWebSocket()
  useLocationData()

  // Auto-pin frontdesk to their assigned location
  useEffect(() => {
    if (user?.role === 'frontdesk' && user.location_id && locations.length > 0) {
      selectLocation(user.location_id)
    }
  }, [user?.role, user?.location_id, locations.length, selectLocation])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isMembersActive = pathname === '/members' || pathname.startsWith('/members/')
  const pageTitle = PAGE_TITLES[pathname] || 'DeskPulse'

  // Width values in Tailwind + px for the fixed chevron button
  const sidebarWidthCls = sidebarExpanded ? 'w-56' : 'w-16'
  const contentMarginCls = sidebarExpanded ? 'ml-56' : 'ml-16'
  const headerLeftCls = sidebarExpanded ? 'left-56' : 'left-16'
  // Chevron center = right edge of sidebar − half of button (~12px)
  const chevronLeft = sidebarExpanded ? '212px' : '52px'

  function navItemCls(isActive) {
    const base = `flex items-center rounded-lg cursor-pointer transition-all duration-150 ${
      isActive
        ? 'bg-slate-800 text-white font-medium'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`
    return sidebarExpanded
      ? `${base} gap-3 px-3 py-2.5 text-sm`
      : `${base} justify-center py-2.5 w-full`
  }

  function showTooltip(e, label) {
    if (sidebarExpanded) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, y: rect.top + rect.height / 2 })
  }

  function hideTooltip() {
    setTooltip({ label: '', y: 0 })
  }

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ minWidth: '1280px' }}>
      {/* ── Collapsed-state tooltip (fixed to viewport, not clipped by sidebar) ── */}
      {tooltip.label && !sidebarExpanded && (
        <div
          className="fixed bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none"
          style={{ left: '72px', top: tooltip.y, transform: 'translateY(-50%)', zIndex: 9999 }}
        >
          {tooltip.label}
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`${sidebarWidthCls} bg-slate-900 border-r border-slate-800 flex flex-col fixed top-0 left-0 h-screen z-40 transition-all duration-300 ease-in-out overflow-x-hidden`}
        style={SIDEBAR_FONT}
      >
        {/* Logo — same height as header (h-14) for alignment */}
        <div className={`h-14 shrink-0 flex items-center ${sidebarExpanded ? 'px-4' : 'justify-center'}`}>
          {sidebarExpanded ? (
            <span className="text-white font-bold text-lg tracking-tight select-none">DeskPulse</span>
          ) : (
            <span className="text-white font-bold text-base select-none">D</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">

          {/* Dashboard */}
          <div onMouseEnter={(e) => showTooltip(e, 'Dashboard')} onMouseLeave={hideTooltip}>
            <NavLink to="/dashboard" className={({ isActive }) => navItemCls(isActive)}>
              <LayoutDashboard size={18} className="shrink-0" />
              {sidebarExpanded && <span className="flex-1">Dashboard</span>}
            </NavLink>
          </div>

          {/* Analytics */}
          <div onMouseEnter={(e) => showTooltip(e, 'Analytics')} onMouseLeave={hideTooltip}>
            <NavLink to="/analytics" className={({ isActive }) => navItemCls(isActive)}>
              <BarChart2 size={18} className="shrink-0" />
              {sidebarExpanded && <span className="flex-1">Analytics</span>}
            </NavLink>
          </div>

          {/* Anomalies */}
          <div
            onMouseEnter={(e) => showTooltip(e, activeCount > 0 ? `Anomalies (${activeCount})` : 'Anomalies')}
            onMouseLeave={hideTooltip}
          >
            <NavLink to="/anomalies" className={({ isActive }) => `${navItemCls(isActive)} relative`}>
              <AlertTriangle size={18} className="shrink-0" />
              {sidebarExpanded ? (
                <>
                  <span className="flex-1">Anomalies</span>
                  {activeCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {activeCount > 99 ? '99+' : activeCount}
                    </span>
                  )}
                </>
              ) : (
                activeCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                )
              )}
            </NavLink>
          </div>

          {/* Members — expandable, both roles */}
          <div onMouseEnter={(e) => showTooltip(e, 'Members')} onMouseLeave={hideTooltip}>
            <button
              onClick={() => sidebarExpanded && setMembersOpen((o) => !o)}
              className={`w-full ${navItemCls(isMembersActive)}`}
            >
              <UserCheck size={18} className="shrink-0" />
              {sidebarExpanded && (
                <>
                  <span className="flex-1 text-left">Members</span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 transition-transform duration-200 ${membersOpen ? 'rotate-180' : ''}`}
                  />
                </>
              )}
            </button>
          </div>

          {/* Members sub-menu — only in expanded state */}
          {sidebarExpanded && (
            <div
              className={`overflow-hidden transition-all duration-200 ease-in-out ${
                membersOpen ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="border-l border-slate-700 ml-4 pl-2 mt-0.5 space-y-0.5">
                <Link
                  to="/members"
                  onClick={() => setMembersOpen(false)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-all duration-150"
                >
                  <UserPlus size={14} className="shrink-0" />
                  Add Member
                </Link>
                <NavLink
                  to="/members"
                  onClick={() => setMembersOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-all duration-150 ${
                      isActive
                        ? 'text-white font-medium bg-slate-800'
                        : 'text-slate-500 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  <List size={14} className="shrink-0" />
                  Manage Members
                </NavLink>
              </div>
            </div>
          )}

          {/* Simulator + Users — super_admin only */}
          {user?.role === 'super_admin' && (
            <>
              <div onMouseEnter={(e) => showTooltip(e, 'Simulator')} onMouseLeave={hideTooltip}>
                <NavLink to="/simulator" className={({ isActive }) => navItemCls(isActive)}>
                  <Play size={18} className="shrink-0" />
                  {sidebarExpanded && <span className="flex-1">Simulator</span>}
                </NavLink>
              </div>

              <div onMouseEnter={(e) => showTooltip(e, 'Users')} onMouseLeave={hideTooltip}>
                <NavLink to="/users" className={({ isActive }) => navItemCls(isActive)}>
                  <Users size={18} className="shrink-0" />
                  {sidebarExpanded && <span className="flex-1">Users</span>}
                </NavLink>
              </div>
            </>
          )}

          {/* Separator */}
          <div className="border-t border-slate-800 my-2" />

          {/* Sign Out — last nav item */}
          <div onMouseEnter={(e) => showTooltip(e, 'Sign Out')} onMouseLeave={hideTooltip}>
            <button
              onClick={handleLogout}
              className={`w-full flex items-center rounded-lg cursor-pointer transition-all duration-150 text-slate-500 hover:text-white hover:bg-slate-800 ${
                sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm' : 'justify-center py-2.5'
              }`}
            >
              <LogOut size={18} className="shrink-0" />
              {sidebarExpanded && <span className="flex-1 text-left">Sign Out</span>}
            </button>
          </div>
        </nav>

        {/* User info — expanded only */}
        {sidebarExpanded && (
          <div className="px-4 py-3 border-t border-slate-800 shrink-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <div className="mt-1">
              {user?.role === 'super_admin' ? (
                <span className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">Admin</span>
              ) : (
                <span className="bg-slate-600 text-slate-300 text-xs px-2 py-0.5 rounded-full">Staff</span>
              )}
            </div>
            {user?.location_name && (
              <p className="text-slate-500 text-xs mt-1 truncate">{user.location_name}</p>
            )}
          </div>
        )}
      </aside>

      {/* ── Chevron toggle — fixed, animates with sidebar ─────────────────── */}
      <button
        onClick={toggleSidebar}
        className="fixed top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-1 shadow-sm cursor-pointer z-50 hover:bg-slate-50 transition-all duration-300 ease-in-out"
        style={{ left: chevronLeft }}
        onMouseEnter={hideTooltip}
      >
        <ChevronRight
          size={14}
          className={`text-slate-600 transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Fixed header ─────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 right-0 h-14 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-6 transition-all duration-300 ease-in-out ${headerLeftCls}`}
      >
        <h1 className="text-slate-900 font-semibold text-base">{pageTitle}</h1>

        <div className="flex items-center gap-4">
          <LocationSwitcher
            user={user}
            locations={locations}
            selectedLocationId={selectedLocationId}
            selectLocation={selectLocation}
          />

          {/* WebSocket status */}
          <span className="relative flex h-2 w-2">
            {wsConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
            )}
          </span>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div
        className={`${contentMarginCls} flex-1 bg-slate-50 min-h-screen flex flex-col transition-all duration-300 ease-in-out`}
      >
        <div className="flex-1 overflow-auto pt-14">
          {DEMO_MODE && <DemoBanner />}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
