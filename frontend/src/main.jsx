import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

import NavBar from './components/NavBar'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Anomalies from './pages/Anomalies'
import Simulator from './pages/Simulator'

import { useWebSocket } from './hooks/useWebSocket'
import { useLocationData } from './hooks/useLocationData'
import { useAnomalies } from './hooks/useAnomalies'

function App() {
  const [activePage, setActivePage] = useState('dashboard')

  // Bootstrap data + WebSocket on mount
  useWebSocket()
  useLocationData()
  useAnomalies()

  const pages = {
    dashboard: <Dashboard />,
    analytics: <Analytics />,
    anomalies: <Anomalies />,
    simulator: <Simulator />,
  }

  return (
    <div
      className="min-h-screen bg-[#0D0D1A] text-slate-200"
      style={{ minWidth: '1280px' }}
    >
      <NavBar activePage={activePage} setActivePage={setActivePage} />
      <main>{pages[activePage] ?? <Dashboard />}</main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
