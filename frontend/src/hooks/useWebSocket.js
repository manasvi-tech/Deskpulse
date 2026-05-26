/**
 * useWebSocket — persistent WebSocket connection with exponential-backoff reconnect.
 *
 * Design rules (to avoid the connect-immediately-disconnects bug):
 *
 * 1. useEffect has [] deps — runs ONCE on mount, cleans up ONCE on unmount.
 *    Re-renders of the host component NEVER close or re-open the socket.
 *
 * 2. `connect` is defined INSIDE useEffect — it is not a useCallback and has
 *    no hook deps. React cannot track it and will never schedule a re-run.
 *
 * 3. All store writes use useStore.getState() at call time — no closure captures
 *    of store actions that could change reference and invalidate deps.
 *
 * 4. destroyedRef (not mountedRef) — set to true synchronously in cleanup BEFORE
 *    any async events can fire. Prevents reconnect-after-unmount.
 *
 * 5. All four WS handlers are nulled before ws.close() in cleanup, so the
 *    browser's async close-event fires into nothing.
 */

import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'

const WS_URL              = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const RECONNECT_DELAY_MS  = 3000
const MAX_RECONNECT_DELAY = 30_000

export function useWebSocket() {
  const wsRef            = useRef(null)
  const reconnectTimer   = useRef(null)
  const reconnectDelay   = useRef(RECONNECT_DELAY_MS)
  // Set to true the moment cleanup runs. Any in-flight async callback checks
  // this before doing anything — prevents reconnect after unmount.
  const destroyedRef     = useRef(false)

  useEffect(() => {
    // ── Ensure we start clean (handles React StrictMode double-invoke) ──────
    destroyedRef.current = false

    // ── Message handler ─────────────────────────────────────────────────────
    function handleMessage(raw) {
      let msg
      try { msg = JSON.parse(raw) } catch { return }

      // Always read from store at call time — never via closure capture.
      const store = useStore.getState()

      switch (msg.type) {
        case 'CHECKIN_EVENT': {
          const gymName = store.gyms.find((g) => g.id === msg.gym_id)?.name || 'Unknown Gym'
          store.updateGymOccupancy(msg.gym_id, msg.current_occupancy, msg.capacity_pct)
          store.addToActivityFeed({
            id:          `${msg.gym_id}-${msg.timestamp}-ci`,
            kind:        'checkin',
            gymId:       msg.gym_id,
            gymName,
            memberName:  msg.member_name,
            timestamp:   msg.timestamp,
            occupancy:   msg.current_occupancy,
            capacityPct: msg.capacity_pct,
          })
          break
        }
        case 'CHECKOUT_EVENT': {
          const gymName = store.gyms.find((g) => g.id === msg.gym_id)?.name || 'Unknown Gym'
          store.updateGymOccupancy(msg.gym_id, msg.current_occupancy, msg.capacity_pct)
          store.addToActivityFeed({
            id:          `${msg.gym_id}-${msg.timestamp}-co`,
            kind:        'checkout',
            gymId:       msg.gym_id,
            gymName,
            memberName:  msg.member_name,
            timestamp:   msg.timestamp,
            occupancy:   msg.current_occupancy,
            capacityPct: msg.capacity_pct,
          })
          break
        }
        case 'PAYMENT_EVENT': {
          const gymName = store.gyms.find((g) => g.id === msg.gym_id)?.name || 'Unknown Gym'
          store.updateGymRevenue(msg.gym_id, msg.today_total)
          store.addToActivityFeed({
            id:         `${msg.gym_id}-${Date.now()}-pay`,
            kind:       'payment',
            gymId:      msg.gym_id,
            gymName,
            memberName: msg.member_name,
            amount:     msg.amount,
            planType:   msg.plan_type,
            timestamp:  new Date().toISOString(),
          })
          break
        }
        case 'ANOMALY_DETECTED': {
          store.addAnomaly({
            id:          msg.anomaly_id,
            gym_id:      msg.gym_id,
            gym_name:    msg.gym_name,
            type:        msg.anomaly_type,
            severity:    msg.severity,
            message:     msg.message,
            resolved:    false,
            dismissed:   false,
            detected_at: new Date().toISOString(),
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

    // ── Connect ──────────────────────────────────────────────────────────────
    function connect() {
      // Guard: don't create a new socket if unmounted or one already exists
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
        if (destroyedRef.current) {
          // Unmounted while connecting — close silently
          ws.onclose = null
          ws.close()
          return
        }
        console.log('[WS] Connected ✓')
        useStore.getState().setWsConnected(true)
        reconnectDelay.current = RECONNECT_DELAY_MS   // reset backoff on success
      }

      ws.onmessage = (e) => handleMessage(e.data)

      ws.onerror = (e) => {
        // onerror always fires before onclose — onclose owns the reconnect logic.
        // Log enough to be useful but don't reconnect here.
        console.warn('[WS] Error —', e.message || e.type || 'unknown error')
      }

      ws.onclose = (e) => {
        console.log(`[WS] Closed (code=${e.code}${e.reason ? ', reason=' + e.reason : ''})`)
        if (destroyedRef.current) return   // unmounted — do not reconnect
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

    // Kick off the connection
    connect()

    // ── Cleanup — runs ONLY on unmount ───────────────────────────────────────
    return () => {
      // Mark destroyed FIRST — any async callbacks that fire after this return
      // immediately without touching the store or scheduling reconnects.
      destroyedRef.current = true

      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null

      const ws = wsRef.current
      if (ws) {
        // Null every handler before closing so the browser's async close-event
        // fires into nothing and doesn't call setWsConnected(false) on unmount.
        ws.onopen    = null
        ws.onmessage = null
        ws.onerror   = null
        ws.onclose   = null
        ws.close()
        wsRef.current = null
      }

      console.log('[WS] Disconnected (component unmounted)')
    }
  }, []) // ← intentionally empty: mount once, clean up once, never on re-render
}
