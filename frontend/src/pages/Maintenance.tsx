import React from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill, StatusStrip } from "../components/ui";

export default function MaintenancePage() {
  const { data: eq, error, loading, refresh } = usePolling(() => api.equipmentHealth(), 20000);
  const { data: anomalies } = usePolling(() => api.anomalies(), 20000);
  const { data: dispatch } = usePolling(() => api.dispatchState(), 15000);

  if (loading && !eq) return <LoadingBlock label="Analyzing equipment operating history..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      {dispatch && (
        <StatusStrip items={[
          { label: "STATION", value: dispatch.station },
          { label: "OVERALL HEALTH", value: eq.overall },
          { label: "PROVENANCE", value: "MODEL-DERIVED" },
        ]} />
      )}

      <Panel title="Equipment Health Console">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-left text-[10px] uppercase text-polar-dim border-b border-polar-border">
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Degradation</th>
                <th className="pb-2 pr-3">Failure Risk</th>
                <th className="pb-2 pr-3">Service Window</th>
                <th className="pb-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {eq.equipment.map((e: any) => (
                <tr key={e.name} className="border-b border-polar-border/50">
                  <td className="py-2 pr-3 font-semibold">{e.name}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-polar-panel2 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${e.score >= 85 ? "bg-polar-green" : e.score >= 65 ? "bg-polar-cyan" : e.score >= 40 ? "bg-polar-amber" : "bg-polar-red"}`}
                          style={{ width: `${e.score}%` }} />
                      </div>
                      <span className="tabular-nums">{e.score}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3"><StatusPill status={e.status} /></td>
                  <td className="py-2 pr-3 tabular-nums">{e.degradation_pct}%</td>
                  <td className="py-2 pr-3 tabular-nums">{e.failure_risk_pct}%</td>
                  <td className="py-2 pr-3 tabular-nums">{e.service_window_days}d</td>
                  <td className="py-2 text-xs text-polar-dim">{e.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-polar-dim mt-3">
          All figures are MODEL-DERIVED from simulated operating history (output ratios, cumulative diesel
          runtime hours, battery capacity retention) — not readings from physical condition-monitoring sensors.
        </p>
      </Panel>

      <Panel title="Anomaly Detection">
        {anomalies && anomalies.anomalies.length === 0 && (
          <p className="text-sm text-polar-dim">No anomalies detected in recent telemetry.</p>
        )}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {anomalies?.anomalies.map((a: any, i: number) => (
            <div key={i} className="border-l-2 border-polar-amber pl-3 py-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {a.metric.replace(/_/g, " ")} <StatusPill status={a.severity} />
                <span className="text-xs text-polar-dim font-normal ml-auto font-mono">{new Date(a.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-xs text-polar-dim">Observed: {a.value} · Score: {a.anomaly_score}</p>
              <p className="text-xs mt-0.5">{a.possible_cause}</p>
              <p className="text-xs text-polar-cyan">{a.recommendation}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
