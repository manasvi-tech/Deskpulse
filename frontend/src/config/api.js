const API_BASE = import.meta.env.VITE_API_URL || ''
const WS_BASE = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`

export { API_BASE, WS_BASE }
