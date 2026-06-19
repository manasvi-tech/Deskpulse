/**
 * useWebSocket — persistent WebSocket connection with exponential-backoff reconnect.
 * All WS payloads use location_id / location_name (backend sends these, not gym_id).
 */

import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'

const WS_URL              = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const RECONNECT_DELAY_MS  = 3000
const MAX_RECONNECT_DELAY = 30_000

export function useWebSocket() {
  const wsRef          = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectDelay = useRef(RECONNECT_DELAY_MS)
  const destroyedRef   = useRef(false)

  useEffect(() => {
    destroyedRef.current = false

    function handleMessage(raw) {
      let msg
      try { msg = JSON.parse(raw) } catch { return }

      const store = useStore.getState()

      switch (msg.type) {
        case 'CHECKIN_EVENT': {
          const locationName = store.locations.find((l) => l.id === msg.location_id)?.name || 'Unknown Location'
          store.updateLocationOccupancy(msg.location_id, msg.current_occupancy, msg.capacity_pct)
          store.addToActivityFeed({
            id:           `${msg.location_id}-${msg.timestamp}-ci`,
            kind:         'checkin',
            locationId:   msg.location_id,
            locationName,
            memberName:   msg.member_name,
            timestamp:    msg.timestamp,
            occupancy:    msg.current_occupancy,
            capacityPct:  msg.capacity_pct,
          })
          break
        }
        case 'CHECKOUT_EVENT': {
          const locationName = store.locations.find((l) => l.id === msg.location_id)?.name || 'Unknown Location'
          store.updateLocationOccupancy(msg.location_id, msg.current_occupancy, msg.capacity_pct)
          store.addToActivityFeed({
            id:           `${msg.location_id}-${msg.timestamp}-co`,
            kind:         'checkout',
            locationId:   msg.location_id,
            locationName,
            memberName:   msg.member_name,
            timestamp:    msg.timestamp,
            occupancy:    msg.current_occupancy,
            capacityPct:  msg.capacity_pct,
          })
          break
        }
        case 'PAYMENT_EVENT': {
          const locationName = store.locations.find((l) => l.id === msg.location_id)?.name || 'Unknown Location'
          store.updateLocationRevenue(msg.location_id, msg.today_total)
          store.addToActivityFeed({
            id:           `${msg.location_id}-${Date.now()}-pay`,
            kind:         'payment',
            locationId:   msg.location_id,
            locationName,
            memberName:   msg.member_name,
            amount:       msg.amount,
            planType:     msg.plan_type,
            timestamp:    new Date().toISOString(),
          })
          break
        }
        case 'ANOMALY_DETECTED': {
          store.addAnomaly({
            id:            msg.anomaly_id,
            location_id:   msg.location_id,
            location_name: msg.location_name,
            type:          msg.anomaly_type,
            severity:      msg.severity,
            message:       msg.message,
            resolved:      false,
            dismissed:     false,
            detected_at:   new Date().toISOString(),
          })
          break
        }
        case 'ANOMALY_RESOLVED': {
          store.resolveAnomaly(msg.anomaly_id, msg.resolved_at)
          break
        }
        default:
          break
      }
    }

    function connect() {
      if (destroyedRef.current) return
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

      console.log(`[WS] Connecting → ${WS_URL}`)

      let ws
      try {
        ws = new WebSocket(WS_URL)
      } catch (err) {
        console.error('[WS] Failed to create WebSocket:', err.message)
        useStore.getState().setWsConnected(false)
        scheduleReconnect()
        return
      }

      wsRef.current = ws

      ws.onopen = () => {
        if (destroyedRef.current) { ws.onclose = null; ws.close(); return }
        console.log('[WS] Connected ✓')
        useStore.getState().setWsConnected(true)
        reconnectDelay.current = RECONNECT_DELAY_MS
      }

      ws.onmessage = (e) => handleMessage(e.data)

      ws.onerror = (e) => {
        console.warn('[WS] Error —', e.message || e.type || 'unknown error')
      }

      ws.onclose = (e) => {
        console.log(`[WS] Closed (code=${e.code})`)
        if (destroyedRef.current) return
        wsRef.current = null
        useStore.getState().setWsConnected(false)
        scheduleReconnect()
      }
    }

    function scheduleReconnect() {
      if (destroyedRef.current) return
      const delay = reconnectDelay.current
      reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)
      console.log(`[WS] Reconnecting in ${delay}ms…`)
      reconnectTimer.current = setTimeout(connect, delay)
    }

    connect()

    return () => {
      destroyedRef.current = true
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
      const ws = wsRef.current
      if (ws) {
        ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
        ws.close()
        wsRef.current = null
      }
      console.log('[WS] Disconnected (component unmounted)')
    }
  }, [])
}
