import React from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill } from "../components/ui";

export default function MaintenancePage() {
  const { data: eq, error, loading, refresh } = usePolling(() => api.equipmentHealth(), 20000);
  const { data: anomalies } = usePolling(() => api.anomalies(), 20000);

  if (loading && !eq) return <LoadingBlock label="Analyzing equipment operating history..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <Panel title="Equipment Health (Model-Derived)">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {eq.equipment.map((e: any) => (
            <div key={e.name} className="border border-polar-border rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-sm">{e.name}</span>
                <StatusPill status={e.status} />
              </div>
              <div className="text-2xl font-bold">{e.score}<span className="text-sm text-polar-dim">/100</span></div>
              <div className="h-1.5 bg-polar-panel2 rounded-full overflow-hidden mt-2 mb-2">
                <div className={`h-full rounded-full ${e.score >= 85 ? "bg-polar-green" : e.score >= 65 ? "bg-polar-cyan" : e.score >= 40 ? "bg-polar-amber" : "bg-polar-red"}`}
                  style={{ width: `${e.score}%` }} />
              </div>
              <p className="text-xs text-polar-dim">{e.recommendation}</p>
              {Object.keys(e.metrics || {}).length > 0 && (
                <div className="mt-2 text-[11px] text-polar-dim space-y-0.5">
                  {Object.entries(e.metrics).map(([k, v]: any) => (
                    <div key={k} className="flex justify-between"><span className="capitalize">{k.replace(/_/g, " ")}</span><span>{v}</span></div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-polar-border flex items-center justify-between">
          <span className="text-sm font-semibold">Overall Health</span>
          <StatusPill status={eq.overall} />
        </div>
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
                <span className="text-xs text-polar-dim font-normal ml-auto">{new Date(a.timestamp).toLocaleString()}</span>
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
