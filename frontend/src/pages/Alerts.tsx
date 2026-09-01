import React, { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill } from "../components/ui";

const TABS = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "ALL"] as const;

export default function AlertsPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("OPEN");
  const { data, error, loading, refresh } = usePolling(
    () => api.alerts(tab === "ALL" ? undefined : tab), 10000, [tab]
  );

  if (loading && !data) return <LoadingBlock label="Loading alerts..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  async function ack(id: number) { await api.acknowledgeAlert(id); refresh(); }
  async function resolve(id: number) { await api.resolveAlert(id); refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
            {t}
          </button>
        ))}
      </div>

      <Panel title={`Alert Center — ${tab}`}>
        {data.alerts.length === 0 && <p className="text-sm text-polar-dim">No alerts in this category.</p>}
        <div className="space-y-2">
          {data.alerts.map((a: any) => (
            <div key={a.id} className="border border-polar-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StatusPill status={a.severity} />
                  <span className="font-semibold text-sm">{a.title}</span>
                  <StatusPill status={a.status} />
                </div>
                <span className="text-xs text-polar-dim">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-polar-dim">{a.description}</p>
              {a.recommended_action && <p className="text-xs text-polar-cyan mt-1">Recommended: {a.recommended_action}</p>}
              <div className="flex gap-2 mt-2">
                {a.status === "OPEN" && (
                  <button onClick={() => ack(a.id)} className="text-xs bg-polar-amber/20 text-polar-amber px-3 py-1 rounded-lg font-semibold">
                    Acknowledge
                  </button>
                )}
                {a.status !== "RESOLVED" && (
                  <button onClick={() => resolve(a.id)} className="text-xs bg-polar-green/20 text-polar-green px-3 py-1 rounded-lg font-semibold">
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
