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
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { useLocationData } from '../hooks/useLocationData'
import { useAnomalies } from '../hooks/useAnomalies'
import { useTour } from '../hooks/useTour'
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
  const { user, isAuthenticated, logout } = useAuth()
  const navigate                          = useNavigate()
  const { pathname }                      = useLocation()
  const locations                         = useStore((s) => s.locations)
  const selectedLocationId                = useStore((s) => s.selectedLocationId)
  const selectLocation                    = useStore((s) => s.selectLocation)
  const sidebarExpanded                   = useStore((s) => s.sidebarExpanded)
  const toggleSidebar                     = useStore((s) => s.toggleSidebar)
  const wsConnected                       = useStore((s) => s.wsConnected)
  const { activeCount }                   = useAnomalies()
  const [membersOpen, setMembersOpen]     = useState(false)
  const [tooltip, setTooltip]             = useState({ label: '', y: 0 })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const setStartTour                      = useStore((s) => s.setStartTour)
  const { startTour }                     = useTour(user, navigate, isAuthenticated)

  useWebSocket()
  useLocationData()

  useEffect(() => {
    setStartTour(startTour)
  }, [startTour, setStartTour])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

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

  const sidebarWidthCls  = sidebarExpanded ? 'w-56' : 'w-16'
  const contentMarginCls = sidebarExpanded ? 'lg:ml-56' : 'lg:ml-16'
  const headerLeftCls    = sidebarExpanded ? 'left-56' : 'left-16'
  const chevronLeft      = sidebarExpanded ? '212px' : '52px'

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

  function mobileNavItemCls(isActive) {
    return `flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-all duration-150 ${
      isActive
        ? 'bg-slate-800 text-white font-medium'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`
  }

  function showTooltip(e, label) {
    if (sidebarExpanded) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, y: rect.top + rect.height / 2 })
  }

  function hideTooltip() {
    setTooltip({ label: '', y: 0 })
  }

  const WsDot = () => (
    <span className="relative flex h-2 w-2 shrink-0">
      {wsConnected ? (
        <>
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </>
      ) : (
        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
      )}
    </span>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ── Collapsed-state tooltip (desktop only) ──────────────────────────── */}
      {tooltip.label && !sidebarExpanded && (
        <div
          className="hidden lg:block fixed bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none"
          style={{ left: '72px', top: tooltip.y, transform: 'translateY(-50%)', zIndex: 9999 }}
        >
          {tooltip.label}
        </div>
      )}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`hidden lg:flex flex-col ${sidebarWidthCls} bg-slate-900 border-r border-slate-800 fixed top-0 left-0 h-screen z-40 transition-all duration-300 ease-in-out overflow-x-hidden`}
        style={SIDEBAR_FONT}
      >
        <div className={`h-14 shrink-0 flex items-center ${sidebarExpanded ? 'px-4' : 'justify-center'}`}>
          {sidebarExpanded ? (
            <span className="text-white font-bold text-lg tracking-tight select-none">DeskPulse</span>
          ) : (
            <span className="text-white font-bold text-base select-none">D</span>
          )}
        </div>

        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          <div onMouseEnter={(e) => showTooltip(e, 'Dashboard')} onMouseLeave={hideTooltip}>
            <NavLink to="/dashboard" className={({ isActive }) => navItemCls(isActive)}>
              <LayoutDashboard size={18} className="shrink-0" />
              {sidebarExpanded && <span className="flex-1">Dashboard</span>}
            </NavLink>
          </div>

          <div onMouseEnter={(e) => showTooltip(e, 'Analytics')} onMouseLeave={hideTooltip}>
            <NavLink to="/analytics" className={({ isActive }) => navItemCls(isActive)}>
              <BarChart2 size={18} className="shrink-0" />
              {sidebarExpanded && <span className="flex-1">Analytics</span>}
            </NavLink>
          </div>

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

          <div onMouseEnter={(e) => showTooltip(e, 'Members')} onMouseLeave={hideTooltip}>
            <button
              data-tour="members-nav"
              onClick={() => {
                navigate('/members')
                if (sidebarExpanded) setMembersOpen((o) => !o)
              }}
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

          <div className="border-t border-slate-800 my-2" />

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

      {/* ── Desktop Chevron toggle ────────────────────────────────────────────── */}
      <button
        onClick={toggleSidebar}
        className="hidden lg:block fixed top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-1 shadow-sm cursor-pointer z-50 hover:bg-slate-50 transition-all duration-300 ease-in-out"
        style={{ left: chevronLeft }}
        onMouseEnter={hideTooltip}
      >
        <ChevronRight
          size={14}
          className={`text-slate-600 transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Desktop fixed header ─────────────────────────────────────────────── */}
      <header
        className={`hidden lg:flex fixed top-0 right-0 h-14 bg-white border-b border-slate-200 z-30 items-center justify-between px-6 transition-all duration-300 ease-in-out ${headerLeftCls}`}
      >
        <h1 className="text-slate-900 font-semibold text-base">{pageTitle}</h1>
        <div className="flex items-center gap-4">
          <LocationSwitcher
            user={user}
            locations={locations}
            selectedLocationId={selectedLocationId}
            selectLocation={selectLocation}
          />
          <WsDot />
        </div>
      </header>

      {/* ── Mobile Header ────────────────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 -ml-2 text-slate-700 hover:text-slate-900"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <span className="text-slate-900 font-bold text-base tracking-tight" style={SIDEBAR_FONT}>
          DeskPulse
        </span>
        <div className="flex items-center gap-3">
          <LocationSwitcher
            user={user}
            locations={locations}
            selectedLocationId={selectedLocationId}
            selectLocation={selectLocation}
            compact={true}
          />
          <WsDot />
        </div>
      </header>

      {/* ── Mobile Backdrop ──────────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar ───────────────────────────────────────────────────── */}
      <div
        className={`lg:hidden fixed left-0 top-0 h-full w-72 bg-slate-900 z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={SIDEBAR_FONT}
      >
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-800">
          <span className="text-white font-bold text-lg tracking-tight select-none">DeskPulse</span>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          <NavLink
            to="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) => mobileNavItemCls(isActive)}
          >
            <LayoutDashboard size={18} className="shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/analytics"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) => mobileNavItemCls(isActive)}
          >
            <BarChart2 size={18} className="shrink-0" />
            <span>Analytics</span>
          </NavLink>

          <NavLink
            to="/anomalies"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) => `${mobileNavItemCls(isActive)} relative`}
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1">Anomalies</span>
            {activeCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {activeCount > 99 ? '99+' : activeCount}
              </span>
            )}
          </NavLink>

          <button
            data-tour="members-nav"
            onClick={() => { navigate('/members'); setMobileMenuOpen(false) }}
            className={`w-full ${mobileNavItemCls(isMembersActive)}`}
          >
            <UserCheck size={18} className="shrink-0" />
            <span>Members</span>
          </button>

          {user?.role === 'super_admin' && (
            <>
              <NavLink
                to="/simulator"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => mobileNavItemCls(isActive)}
              >
                <Play size={18} className="shrink-0" />
                <span>Simulator</span>
              </NavLink>

              <NavLink
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => mobileNavItemCls(isActive)}
              >
                <Users size={18} className="shrink-0" />
                <span>Users</span>
              </NavLink>
            </>
          )}

          <div className="border-t border-slate-800 my-2" />

          <button
            onClick={() => { handleLogout(); setMobileMenuOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-all duration-150 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Sign Out</span>
          </button>
        </nav>

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
      </div>

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
