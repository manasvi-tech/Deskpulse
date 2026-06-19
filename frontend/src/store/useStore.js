import { create } from 'zustand'

const useStore = create((set) => ({
  // ── WebSocket ────────────────────────────────────────────────────────────────
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // ── Locations ─────────────────────────────────────────────────────────────────
  locations: [],
  locationsLoading: true,
  locationsError: null,
  selectedLocationId: null,

  setLocations: (locations) => {
    const safe = Array.isArray(locations) ? locations : []
    set((state) => ({
      locations: safe,
      locationsLoading: false,
      locationsError: null,
      selectedLocationId: state.selectedLocationId || (safe.length > 0 ? safe[0].id : null),
    }))
  },
  setLocationsError: (err) => set({ locationsError: err, locationsLoading: false }),
  selectLocation: (locationId) => set({ selectedLocationId: locationId }),

  updateLocationOccupancy: (locationId, currentOccupancy, capacityPct) =>
    set((state) => ({
      locations: state.locations.map((l) =>
        l.id === locationId
          ? { ...l, current_occupancy: currentOccupancy, capacity_pct: capacityPct }
          : l
      ),
    })),

  updateLocationRevenue: (locationId, todayRevenue) =>
    set((state) => ({
      locations: state.locations.map((l) =>
        l.id === locationId ? { ...l, today_revenue: todayRevenue } : l
      ),
    })),

  // ── Anomalies ────────────────────────────────────────────────────────────────
  anomalies: [],
  anomaliesLoading: true,
  anomaliesError: null,

  setAnomalies: (anomalies) =>
    set({ anomalies: Array.isArray(anomalies) ? anomalies : [], anomaliesLoading: false, anomaliesError: null }),
  setAnomaliesError: (err) =>
    set({ anomaliesError: err, anomaliesLoading: false }),

  addAnomaly: (anomaly) =>
    set((state) => ({ anomalies: [anomaly, ...state.anomalies] })),

  resolveAnomaly: (anomalyId, resolvedAt) =>
    set((state) => ({
      anomalies: state.anomalies.map((a) =>
        a.id === anomalyId ? { ...a, resolved: true, resolved_at: resolvedAt } : a
      ),
    })),

  dismissAnomalyLocal: (anomalyId) =>
    set((state) => ({
      anomalies: state.anomalies.map((a) =>
        a.id === anomalyId ? { ...a, dismissed: true } : a
      ),
    })),

  // ── Activity Feed ─────────────────────────────────────────────────────────────
  activityFeed: [],
  addToActivityFeed: (event) =>
    set((state) => ({
      activityFeed: [event, ...state.activityFeed].slice(0, 20),
    })),

  // ── Simulator ─────────────────────────────────────────────────────────────────
  simulatorStatus: 'stopped',
  simulatorSpeed: 1,
  setSimulatorStatus: (status) => set({ simulatorStatus: status }),
  setSimulatorSpeed: (speed) => set({ simulatorSpeed: speed }),

  // ── Analytics cache ───────────────────────────────────────────────────────────
  analyticsData: {},
  analyticsLoading: false,
  analyticsError: null,
  setAnalyticsData: (key, data) =>
    set((state) => ({
      analyticsData: { ...state.analyticsData, [key]: data },
      analyticsLoading: false,
      analyticsError: null,
    })),
  setAnalyticsLoading: (v) => set({ analyticsLoading: v }),
  setAnalyticsError: (err) => set({ analyticsError: err, analyticsLoading: false }),

  crossLocationData: [],
  crossLocationLoading: false,
  crossLocationError: null,
  setCrossLocationData: (data) =>
    set({ crossLocationData: data, crossLocationLoading: false, crossLocationError: null }),
  setCrossLocationLoading: (v) => set({ crossLocationLoading: v }),
  setCrossLocationError: (err) =>
    set({ crossLocationError: err, crossLocationLoading: false }),
}))

export default useStore
