const BASE =
  (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "") || "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listStations: () => request<any>("/stations"),
  switchStation: (station: string) =>
    request<any>("/stations/switch", { method: "POST", body: JSON.stringify({ station }) }),

  status: () => request<any>("/status"),
  currentEnergy: () => request<any>("/energy/current"),
  history: (limit = 200) => request<any>(`/energy/history?limit=${limit}`),

  simControl: (action: "start" | "pause" | "reset", speed?: number) =>
    request<any>("/simulation/control", { method: "POST", body: JSON.stringify({ action, speed }) }),
  tick: (steps = 1) => request<any>(`/simulation/tick?steps=${steps}`, { method: "POST" }),
  launchStorm: (leadTicks = 8) =>
    request<any>("/simulation/storm-scenario", { method: "POST", body: JSON.stringify({ lead_ticks: leadTicks }) }),

  risk: () => request<any>("/risk"),
  fuelAutonomy: () => request<any>("/fuel/autonomy"),

  optimizerDecision: () => request<any>("/optimizer/decision"),
  setSurvivalMode: (activate: boolean) =>
    request<any>("/optimizer/survival-mode", { method: "POST", body: JSON.stringify({ activate }) }),

  forecast: (horizon: 1 | 6 | 24) => request<any>(`/forecast/${horizon}`),

  whatIf: (payload: Record<string, any>) =>
    request<any>("/whatif/run", { method: "POST", body: JSON.stringify(payload) }),
  whatIfHistory: () => request<any>("/whatif/history"),

  anomalies: () => request<any>("/anomalies"),
  equipmentHealth: () => request<any>("/equipment/health"),

  alerts: (status?: string) => request<any>(`/alerts${status ? `?status=${status}` : ""}`),
  acknowledgeAlert: (id: number) =>
    request<any>("/alerts/acknowledge", { method: "POST", body: JSON.stringify({ alert_id: id }) }),
  resolveAlert: (id: number) =>
    request<any>("/alerts/resolve", { method: "POST", body: JSON.stringify({ alert_id: id }) }),

  carbon: () => request<any>("/analytics/carbon"),
  digitalTwin: () => request<any>("/digital-twin"),

  askAdvisor: (question: string) =>
    request<any>("/advisor/ask", { method: "POST", body: JSON.stringify({ question }) }),
  advisorHistory: () => request<any>("/advisor/history"),
};
