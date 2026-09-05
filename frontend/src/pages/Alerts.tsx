import React, { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill, StatusStrip } from "../components/ui";

const TABS = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "ALL"] as const;

export default function AlertsPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("OPEN");
  const [selected, setSelected] = useState<any>(null);
  const { data, error, loading, refresh } = usePolling(
    () => api.alerts(tab === "ALL" ? undefined : tab), 10000, [tab]
  );
  const { data: dispatch } = usePolling(() => api.dispatchState(), 15000);

  if (loading && !data) return <LoadingBlock label="Loading alerts..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  async function ack(id: number) { await api.acknowledgeAlert(id); refresh(); setSelected(null); }
  async function resolve(id: number) { await api.resolveAlert(id); refresh(); setSelected(null); }

  return (
    <div className="space-y-4 relative">
      {dispatch && (
        <StatusStrip items={[
          { label: "STATION", value: dispatch.station },
          { label: "OPEN COUNT", value: tab === "OPEN" ? data.alerts.length : "—" },
        ]} />
      )}

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm font-mono ${tab === t ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
            {t}
          </button>
        ))}
      </div>

      <Panel title={`Alert Center — ${tab}`}>
        {data.alerts.length === 0 && <p className="text-sm text-polar-dim">No alerts in this category.</p>}
        <div className="space-y-2">
          {data.alerts.map((a: any) => (
            <div key={a.id} onClick={() => setSelected(a)}
              className="border border-polar-border rounded-lg p-3 cursor-pointer hover:border-polar-cyan transition-colors">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StatusPill status={a.severity} />
                  <span className="font-semibold text-sm">{a.title}</span>
                  <StatusPill status={a.status} />
                </div>
                <span className="text-xs text-polar-dim font-mono">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-polar-dim">{a.description}</p>
              <p className="text-[10px] text-polar-dim mt-1 font-mono">SOURCE: {a.source}</p>
            </div>
          ))}
        </div>
      </Panel>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-polar-panel border border-polar-border rounded-xl p-5 w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-polar-cyan">Alert Details</h3>
              <button onClick={() => setSelected(null)}><X size={18} className="text-polar-dim" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><StatusPill status={selected.severity} /><StatusPill status={selected.status} /></div>
              <div className="font-semibold">{selected.title}</div>
              <p className="text-polar-dim">{selected.description}</p>
              {selected.recommended_action && <p className="text-polar-cyan text-xs">Recommended: {selected.recommended_action}</p>}
              <p className="text-xs text-polar-dim font-mono">Source: {selected.source} · Created: {new Date(selected.created_at).toLocaleString()}</p>
              {selected.acknowledged_at && <p className="text-xs text-polar-dim font-mono">Acknowledged: {new Date(selected.acknowledged_at).toLocaleString()}</p>}
              {selected.resolved_at && <p className="text-xs text-polar-dim font-mono">Resolved: {new Date(selected.resolved_at).toLocaleString()}</p>}
              <div className="flex gap-2 pt-2">
                {selected.status === "OPEN" && (
                  <button onClick={() => ack(selected.id)} className="text-xs bg-polar-amber/20 text-polar-amber px-3 py-1.5 rounded font-semibold">
                    Acknowledge
                  </button>
                )}
                {selected.status !== "RESOLVED" && (
                  <button onClick={() => resolve(selected.id)} className="text-xs bg-polar-green/20 text-polar-green px-3 py-1.5 rounded font-semibold">
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
