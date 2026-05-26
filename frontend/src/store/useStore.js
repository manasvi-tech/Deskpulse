import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ── WebSocket ────────────────────────────────────────────────────────────────
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // ── Gyms ─────────────────────────────────────────────────────────────────────
  gyms: [],
  gymsLoading: true,
  gymsError: null,
  selectedGymId: null,

  setGyms: (gyms) => {
    // Belt-and-suspenders: always store an array even if caller passes an object
    const safeGyms = Array.isArray(gyms) ? gyms : []
    set((state) => ({
      gyms: safeGyms,
      gymsLoading: false,
      gymsError: null,
      selectedGymId: state.selectedGymId || (safeGyms.length > 0 ? safeGyms[0].id : null),
    }))
  },
  setGymsError: (err) => set({ gymsError: err, gymsLoading: false }),
  selectGym: (gymId) => set({ selectedGymId: gymId }),

  updateGymOccupancy: (gymId, currentOccupancy, capacityPct) =>
    set((state) => ({
      gyms: state.gyms.map((g) =>
        g.id === gymId
          ? { ...g, current_occupancy: currentOccupancy, capacity_pct: capacityPct }
          : g
      ),
    })),

  updateGymRevenue: (gymId, todayRevenue) =>
    set((state) => ({
      gyms: state.gyms.map((g) =>
        g.id === gymId ? { ...g, today_revenue: todayRevenue } : g
      ),
    })),

  // ── Anomalies ────────────────────────────────────────────────────────────────
  anomalies: [],
  anomaliesLoading: true,
  anomaliesError: null,

  setAnomalies: (anomalies) =>
    // Belt-and-suspenders: always store an array even if caller passes an object
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
  analyticsData: {},          // keyed by gymId+dateRange
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

  crossGymData: [],
  crossGymLoading: false,
  crossGymError: null,
  setCrossGymData: (data) => set({ crossGymData: data, crossGymLoading: false, crossGymError: null }),
  setCrossGymLoading: (v) => set({ crossGymLoading: v }),
  setCrossGymError: (err) => set({ crossGymError: err, crossGymLoading: false }),
}))

export default useStore
